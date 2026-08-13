import { expect, test, type Page } from "@playwright/test";

const regions = ["oasis", "canyon", "mist", "stardust"] as const;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "采集寻路逻辑与视口无关，仅在桌面完整模拟 96 次");
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("四区域随机资源均可自动抵达并结算", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  const report = await page.evaluate(async (regionIds) => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    if (!game) throw new Error("缺少本地游戏验收实例");
    await game.newGame("expedition", "GATHERING-BASELINE-081");
    game.running = true;
    game.paused = false;
    const failed: Array<{ region: string; variant: number; resource: string; reason: string }> = [];
    let collected = 0;
    for (const region of regionIds) {
      game.state.regionId = region;
      await game.library.ensureRegionBundle(region);
      for (let variant = 0; variant < 3; variant += 1) {
        game.state.phase = "day";
        game.state.terrainVariant = variant;
        game.state.gathered = [];
        game.state.fieldObjective = { id: `${game.state.epoch}:test`, type: "scout", position: { x: 0, z: -40 }, completed: true, reward: {} };
        game.state.player.position = { x: 0, z: 3.5 };
        game.buildWorld();
        const ids = game.resources.map((entry: any) => entry.id);
        for (const id of ids) {
          const resource = game.resources.find((entry: any) => entry.id === id);
          if (!resource) continue;
          game.setResourceTarget(resource);
          if (game.selectedResourceId !== id && game.resources.some((entry: any) => entry.id === id)) {
            failed.push({ region, variant, resource: id, reason: "未建立采集路线" });
            continue;
          }
          for (let step = 0; step < 520 && game.resources.some((entry: any) => entry.id === id); step += 1) {
            game.updatePlayer(0.08);
          }
          if (game.resources.some((entry: any) => entry.id === id)) {
            failed.push({ region, variant, resource: id, reason: `移动结束仍未结算，角色 ${game.playerRig.root.position.x.toFixed(1)},${game.playerRig.root.position.z.toFixed(1)}；资源 ${resource.position.x.toFixed(1)},${resource.position.z.toFixed(1)}；目标 ${game.clickTarget?.x?.toFixed(1) ?? "空"},${game.clickTarget?.z?.toFixed(1) ?? "空"}；剩余路点 ${game.clickRoute?.length ?? 0}；选中 ${game.selectedResourceId ?? "空"}` });
          } else collected += 1;
        }
      }
    }
    return { failed, collected };
  }, regions);
  expect(report.failed, JSON.stringify(report.failed, null, 2)).toEqual([]);
  expect(report.collected).toBe(96);
});
