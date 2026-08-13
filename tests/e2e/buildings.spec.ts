import { expect, test, type Page } from "@playwright/test";

const placements = [
  ["ballista", 0], ["fire", 1], ["market", 4], ["workshop", 5], ["antiair", 2], ["trebuchet", 9]
] as const;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "建筑生命周期逻辑与视口无关，仅完整执行一次");
  await page.addInitScript(() => {
    // Keep the newly created save across the explicit reload used later in this
    // test; only clear storage on the first navigation of the browser context.
    if (!sessionStorage.getItem("building-test-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("building-test-initialized", "1");
    }
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("六类建筑升级、专精、受损、维修、迁移、回收和续档保持一致", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  const beforeReload = await page.evaluate(async (entries) => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    await game.newGame("expedition", "BUILDING-LIFECYCLE-081");
    game.state.expansionLevel = 3;
    game.state.tutorialStep = 5;
    game.meta.seenTutorial = true;
    game.state.resources = { coin: 9999, wood: 9999, stone: 9999, gear: 9999 };
    game.buildWorld();
    for (const [type, pad] of entries) {
      const before = game.state.buildings.length;
      game.buildOnPad(type, pad);
      const built = game.state.buildings.find((entry: any) => entry.type === type && entry.padIndex === pad);
      if (game.state.buildings.length !== before + 1 || !built || !game.buildingObjects.has(built.id)) {
        throw new Error(`${type}: 未在 ${pad} 号功能区真正完成建造`);
      }
    }
    for (const building of [...game.state.buildings]) {
      game.selectBuilding(building.id);
      const initialRatio = 0.57;
      building.hp = Math.round(building.maxHp * initialRatio);
      game.upgradeSelected();
      const upgradedRatio = building.hp / building.maxHp;
      if (Math.abs(upgradedRatio - initialRatio) > 0.02) throw new Error(`${building.type}: 升级错误地免费回满耐久`);
      game.upgradeSelected();
      game.cycleBuildingSpecialization();
      if (["ballista", "fire", "antiair", "trebuchet"].includes(building.type)) {
        game.upgradeSelected();
        game.upgradeSelected();
        game.upgradeSelected();
        if (building.level !== 6) throw new Error(`${building.type}: Lv.3 后继续升级失败`);
      }
      building.hp = Math.floor(building.maxHp * 0.35);
      game.refreshBuildingVisual(building);
      const damaged = game.buildingObjects.get(building.id)?.userData.visualState;
      game.repairSelected();
      const repaired = game.buildingObjects.get(building.id)?.userData.visualState;
      if (!String(damaged).endsWith(":damaged") || !String(repaired).endsWith(":intact")) throw new Error(`${building.type}: 状态模型刷新失败`);
    }
    const ballista = game.state.buildings.find((entry: any) => entry.type === "ballista");
    const market = game.state.buildings.find((entry: any) => entry.type === "market");
    game.selectBuilding(ballista.id);
    game.beginRelocation();
    game.completeRelocation(6);
    const moved = { id: ballista.id, pad: ballista.padIndex, level: ballista.level, specialization: ballista.specialization, hp: ballista.hp };
    game.selectBuilding(market.id);
    const oldConfirm = window.confirm;
    window.confirm = () => true;
    game.demolishSelected();
    window.confirm = oldConfirm;
    game.save();
    return {
      count: game.state.buildings.length,
      types: game.state.buildings.map((entry: any) => entry.type).sort(),
      levels: game.state.buildings.map((entry: any) => entry.level),
      moved,
      objectCount: game.buildingObjects.size
    };
  }, placements);
  expect(beforeReload.count).toBe(5);
  expect(beforeReload.objectCount).toBe(5);
  expect(beforeReload.levels.filter((level: number) => level === 6)).toHaveLength(4);
  expect(beforeReload.levels.filter((level: number) => level === 3)).toHaveLength(1);
  expect(beforeReload.moved.pad).toBe(6);
  expect(beforeReload.types).not.toContain("market");

  await page.reload();
  await expect(page.locator("#continueBtn")).toBeVisible({ timeout: 30_000 });
  await page.locator("#continueBtn").click();
  await expect(page.getByLabel("建造快捷栏")).toBeVisible({ timeout: 30_000 });
  const restored = await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    const moved = game.state.buildings.find((entry: any) => entry.id.startsWith("b-") && entry.type === "ballista");
    return {
      count: game.state.buildings.length,
      objectCount: game.buildingObjects.size,
      moved: { id: moved?.id, pad: moved?.padIndex, level: moved?.level, specialization: moved?.specialization, hp: moved?.hp },
      states: [...game.buildingObjects.values()].map((object: any) => object.userData.visualState)
    };
  });
  expect(restored.count).toBe(5);
  expect(restored.objectCount).toBe(5);
  expect(restored.moved).toEqual(beforeReload.moved);
  expect(restored.states.every((state: string) => state.endsWith(":intact"))).toBe(true);
});

test("极限守城新档显示建造栏且第六夜投石车拥有合法位置", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    // Simulate a previous reward overlay leaking into a mode switch.
    game.hud.root.classList.add("is-choice-phase");
    game.hud.hotbar.classList.add("is-choice-hidden");
    await game.newGame("survival", "SURVIVAL-BUILD-081");
    game.state.epoch = 6;
    game.state.resources = { coin: 999, wood: 999, stone: 999, gear: 999 };
    game.renderHotbar();
    const layout = game.currentFortLayout();
    const siegeIndex = layout.zones.findIndex((zone: any) => zone.type === "siege" && zone.allowed.includes("trebuchet"));
    const before = game.state.buildings.length;
    game.buildOnPad("trebuchet", siegeIndex);
    return {
      hotbarHidden: game.hud.hotbar.classList.contains("is-choice-hidden"),
      choicePhase: game.hud.root.classList.contains("is-choice-phase"),
      zoneCount: layout.zones.length,
      siegeIndex,
      button: Boolean(game.hud.hotbar.querySelector('[data-build="trebuchet"]')),
      built: game.state.buildings.length === before + 1 && game.state.buildings.some((entry: any) => entry.type === "trebuchet" && entry.padIndex === siegeIndex)
    };
  });
  expect(result).toEqual({ hotbarHidden: false, choicePhase: false, zoneCount: 8, siegeIndex: 7, button: true, built: true });
  await expect(page.getByLabel("建造快捷栏")).toBeVisible();
});
