import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("驻军新手可完成粮秣院、兵营、训练、军队分页与第一夜准备", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    await game.newGame("survival", "GARRISON-E2E-090");
    const firstBuilds = Array.from(document.querySelectorAll<HTMLButtonElement>("#hotbar [data-build]")).map((entry) => entry.dataset.build);
    game.state.resources = { coin: 999, wood: 999, stone: 999, gear: 999 };
    game.state.survival.food = 100;
    game.buildOnPad("granary", 7);
    const secondBuilds = Array.from(document.querySelectorAll<HTMLButtonElement>("#hotbar [data-build]")).map((entry) => entry.dataset.build);
    game.buildOnPad("barracks", 4);
    const buildCountDuringRecruit = document.querySelectorAll("#hotbar [data-build]").length;
    game.queueSquadTraining("shield");
    const queued = game.state.survival.trainingQueue.length;
    game.updateTrainingQueues(9);
    const squad = game.state.survival.squads[0];
    game.survivalTab = "army";
    game.renderSurvivalPanel();
    game.selectSquad(squad.id);
    game.moveSelectedSquadToNode("outer-center");
    game.startNight();
    return {
      zones: game.currentFortLayout().zones.length,
      firstBuilds,
      secondBuilds,
      buildCountDuringRecruit,
      buildings: game.state.buildings.map((entry: any) => entry.type),
      queued,
      squads: game.state.survival.squads.length,
      members: squad.memberHp.filter((hp: number) => hp > 0).length,
      phase: game.state.phase,
      food: game.state.survival.food,
      population: game.state.survival.squads.length * 4,
      selected: game.state.survival.selectedSquadId === squad.id,
      guardNodeId: squad.guardNodeId,
      tutorialStep: game.state.survival.tutorialStep
    };
  });
  expect(result.zones).toBe(12);
  expect(result.firstBuilds).toEqual(["granary"]);
  expect(result.secondBuilds).toEqual(["barracks"]);
  expect(result.buildCountDuringRecruit).toBe(0);
  expect(result.buildings).toEqual(expect.arrayContaining(["granary", "barracks"]));
  expect(result.queued).toBe(1);
  expect(result.squads).toBe(1);
  expect(result.members).toBe(4);
  expect(result.phase).toBe("night");
  expect(result.food).toBeLessThan(100);
  expect(result.population).toBe(4);
  expect(result.selected).toBe(true);
  expect(result.guardNodeId).toBe("outer-center");
  expect(result.tutorialStep).toBeGreaterThanOrEqual(5);

  await expect(page.locator("#garrisonPanel")).toBeVisible();
  await expect(page.locator("#foodValue")).toBeVisible();
  await expect(page.locator("#populationValue")).toContainText("4/12");
  const panel = await page.locator("#garrisonPanel").boundingBox();
  const viewport = page.viewportSize();
  expect(panel).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.y).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport!.height + 1);
});
