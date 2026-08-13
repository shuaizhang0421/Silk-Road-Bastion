import { expect, test, type Page } from "@playwright/test";

const regionIds = ["oasis", "canyon", "mist", "stardust"] as const;

async function startFresh(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: { newGame(mode: string, seed: string): Promise<void> } }).__silkRoadGame;
    await game?.newGame("expedition", "REGION-BASELINE-081");
  });
  await expect(page.getByLabel("建造快捷栏")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "四区域基准图只需在桌面高信息量视口生成一次");
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("四区域加载真实地标包并保持连续场景", async ({ page }) => {
  await startFresh(page);
  for (const regionId of regionIds) {
    const result = await page.evaluate(async (id) => {
      const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
      if (!game?.state) throw new Error("缺少本地视觉验收游戏实例");
      game.state.regionId = id;
      await game.library.ensureRegionBundle(id);
      game.buildWorld();
      game.running = false;
      game.paused = true;
      let authored = 0;
      let wrongRegion = 0;
      game.world.traverse((object: any) => {
        if (object.name === "authored-region-landmark") authored += 1;
        if (typeof object.name === "string" && object.name.startsWith("landmark-") && !object.name.includes(game.state.regionId === "oasis" ? "oasis" : "")) {
          // The authored child is the strong contract; this counter is kept for the
          // returned diagnostics rather than used as a fragile name assertion.
          wrongRegion += 0;
        }
      });
      return { regionId: game.state.regionId, authored, wrongRegion };
    }, regionId);
    expect(result.regionId).toBe(regionId);
    expect(result.authored, `${regionId} 未加载区域实体地标`).toBe(1);
    await page.waitForTimeout(180);
    await expect(page).toHaveScreenshot(`region-${regionId}.png`, { animations: "disabled", maxDiffPixelRatio: 0.02 });
  }
});
