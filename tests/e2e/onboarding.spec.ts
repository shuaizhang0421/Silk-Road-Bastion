import { expect, test, type Page } from "@playwright/test";

type DebugGame = {
  running: boolean;
  paused: boolean;
  state: any;
  spawnQueue?: unknown[];
  newGame(mode: string, seed: string): Promise<void>;
  selectBuild(type: string): void;
  buildOnPad(type: string, pad: number): void;
  startNight(): void;
  openRelicChoices(): void;
  selectChoice(index: number): Promise<void>;
  selectBuilding(id: string): void;
  repairSelected(): void;
  fortifyRoad(id: string): void;
};

async function start(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: DebugGame }).__silkRoadGame;
    await game?.newGame("expedition", "ONBOARDING-BASELINE-081");
  });
  await expect(page.getByLabel("建造快捷栏")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "完整引导状态机在桌面运行一次，布局由四视口视觉测试覆盖");
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("新手建造、入夜、奖励、付费修理和拒马流程可连续完成", async ({ page }) => {
  await start(page);
  const built = await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: DebugGame }).__silkRoadGame!;
    game.running = true;
    game.paused = false;
    game.buildOnPad("market", 4);
    game.buildOnPad("ballista", 0);
    return { step: game.state.tutorialStep, types: game.state.buildings.map((entry: any) => entry.type) };
  });
  expect(built.step).toBe(2);
  expect(built.types).toEqual(["market", "ballista"]);

  const nightPhase = await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: DebugGame }).__silkRoadGame!;
    game.startNight();
    return { phase: game.state.phase, queue: game.spawnQueue?.length ?? 0, step: game.state.tutorialStep };
  });
  expect(nightPhase).toEqual({ phase: "night", queue: 3, step: 3 });

  await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: DebugGame }).__silkRoadGame!;
    game.state.phase = "clear";
    game.openRelicChoices();
    game.running = false;
    game.paused = true;
  });
  await expect(page.locator(".choice-label")).toHaveCount(3);
  await expect(page.locator("#contextMenu")).toHaveClass(/is-hidden/);
  await expect(page.locator("#hotbar")).toHaveClass(/is-choice-hidden/);
  await expect(page.locator("#buildingLabels")).toHaveClass(/is-choice-hidden/);
  await expect(page.locator("#speedBtn")).toHaveClass(/is-choice-hidden/);
  await expect(page.locator("#pauseBtn")).toHaveClass(/is-choice-hidden/);
  await expect(page).toHaveScreenshot("onboarding-relic-exclusive.png", { animations: "disabled" });

  const afterChoice = await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: DebugGame }).__silkRoadGame!;
    game.running = true;
    game.paused = false;
    await game.selectChoice(0);
    const market = game.state.buildings.find((entry: any) => entry.type === "market");
    market.hp = Math.floor(market.maxHp * 0.42);
    game.state.resources.coin = 999;
    game.state.resources.wood = 999;
    game.state.resources.stone = 999;
    game.state.resources.gear = 999;
    const beforeRepair = market.hp;
    const beforeCoin = game.state.resources.coin;
    game.selectBuilding(market.id);
    game.repairSelected();
    game.fortifyRoad("fort-1");
    const fortification = game.state.fortifications.find((entry: any) => entry.id === "fort-1");
    return {
      phase: game.state.phase,
      epoch: game.state.epoch,
      beforeRepair,
      afterRepair: market.hp,
      beforeCoin,
      afterCoin: game.state.resources.coin,
      fortification
    };
  });
  expect(afterChoice.phase).toBe("day");
  expect(afterChoice.epoch).toBe(2);
  expect(afterChoice.afterRepair).toBeGreaterThan(afterChoice.beforeRepair);
  expect(afterChoice.afterCoin).toBeLessThan(afterChoice.beforeCoin);
  expect(afterChoice.fortification.built).toBe(true);
});
