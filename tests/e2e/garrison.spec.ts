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

test("驻军教学条、建造栏与推荐位置在五种视口中清晰且互不遮挡", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "五尺寸矩阵集中在桌面 Chromium 运行，避免设备项目重复执行");
  const viewports = [
    { width: 1440, height: 900, name: "desktop" },
    { width: 1024, height: 1366, name: "ipad" },
    { width: 503, height: 872, name: "in-app" },
    { width: 390, height: 844, name: "phone-portrait" },
    { width: 800, height: 360, name: "phone-landscape" }
  ];
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async (seed) => {
      localStorage.clear();
      localStorage.setItem("silk-road-bastion:quality", "low");
      const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
      await game.newGame("survival", seed);
    }, `GARRISON-FOCUS-${viewport.name}`);
    await expect(page.locator("#tutorialCoach")).toContainText("选择粮秣院");
    await expect(page.locator('#hotbar [data-build="granary"]')).toBeVisible();
    await expect(page.locator("#hotbar [data-build]")).toHaveCount(1);
    await page.waitForTimeout(100);

    const initial = await page.evaluate(() => {
      const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
      const coach = document.querySelector<HTMLElement>("#tutorialCoach")!.getBoundingClientRect();
      const hotbar = document.querySelector<HTMLElement>("#hotbar")!.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>("#garrisonPanel")!.getBoundingClientRect();
      const prompt = document.querySelector<HTMLElement>("#prompt")!.getBoundingClientRect();
      const target = game.tutorialPadIndex();
      const marker = game.buildPads[target]?.userData.zoneMarker;
      const material = game.buildPads[target]?.userData.zoneMaterial;
      return {
        coach: { x: coach.x, y: coach.y, width: coach.width, height: coach.height },
        hotbar: { x: hotbar.x, y: hotbar.y, width: hotbar.width, height: hotbar.height },
        panel: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
        prompt: { x: prompt.x, y: prompt.y, width: prompt.width, height: prompt.height },
        target,
        markerVisible: marker?.visible,
        markerOpacity: material?.opacity
      };
    });
    expect(initial.target).toBeGreaterThanOrEqual(0);
    expect(initial.markerVisible).toBe(true);
    expect(initial.markerOpacity).toBeGreaterThanOrEqual(0.7);
    expect(overlaps(initial.coach, initial.hotbar)).toBe(false);
    expect(overlaps(initial.coach, initial.panel)).toBe(false);
    expect(overlaps(initial.prompt, initial.coach)).toBe(false);

    await page.locator('#hotbar [data-build="granary"]').click();
    await expect(page.locator("#tutorialCoach")).toContainText("点击高亮后勤位");
    await page.waitForTimeout(550);
    const focus = await page.evaluate(() => {
      const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
      return {
        active: Boolean(game.buildFocusState),
        target: game.buildFocusState?.recommendedPadIndex,
        validCount: game.buildFocusState?.validPadIndices.length,
        distance: game.cameraDistance
      };
    });
    expect(focus.active).toBe(true);
    expect(focus.target).toBe(initial.target);
    expect(focus.validCount).toBeGreaterThan(0);
    expect(focus.distance).toBeGreaterThan(0);

    await page.locator('#hotbar [data-build="granary"]').click();
    await page.waitForTimeout(450);
    const restored = await page.evaluate(() => {
      const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
      return game.buildFocusState === null || game.buildFocusState.restoring;
    });
    expect(restored).toBe(true);
  }
});

test("驻军教学六步骤保持稳定视觉状态", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "六步骤像素基线在桌面固定世界运行一次");
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    await game.newGame("survival", "GARRISON-TUTORIAL-V091");
  });
  const freeze = async () => {
    await page.evaluate(() => {
      const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
      game.running = false;
      game.paused = true;
      game.updateHud(true);
    });
    await page.waitForTimeout(140);
  };
  const resume = async () => page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    game.running = true;
    game.paused = false;
  });

  await freeze();
  await expect(page).toHaveScreenshot("garrison-tutorial-1-select-granary.png", { animations: "disabled" });
  await resume();
  await page.locator('#hotbar [data-build="granary"]').click();
  await page.waitForTimeout(650);
  await freeze();
  await expect(page).toHaveScreenshot("garrison-tutorial-2-place-granary.png", { animations: "disabled" });

  await resume();
  await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    game.state.resources = { coin: 999, wood: 999, stone: 999, gear: 999 };
    game.buildOnPad("granary", game.tutorialPadIndex());
  });
  await page.waitForTimeout(520);
  await freeze();
  await expect(page).toHaveScreenshot("garrison-tutorial-3-build-barracks.png", { animations: "disabled" });

  await resume();
  await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    game.buildOnPad("barracks", game.tutorialPadIndex());
  });
  await freeze();
  await expect(page).toHaveScreenshot("garrison-tutorial-4-train-squad.png", { animations: "disabled" });

  await resume();
  await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    game.state.survival.food = 100;
    game.queueSquadTraining("shield");
    game.updateTrainingQueues(12);
    const squad = game.state.survival.squads[0];
    game.selectSquad(squad.id);
    game.updateHud(true);
  });
  await freeze();
  await expect(page).toHaveScreenshot("garrison-tutorial-5-deploy-squad.png", { animations: "disabled" });

  await resume();
  await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    game.moveSelectedSquadToNode("outer-center");
    game.updateHud(true);
  });
  await freeze();
  await expect(page).toHaveScreenshot("garrison-tutorial-6-start-night.png", { animations: "disabled" });
});
