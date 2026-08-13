import { expect, test } from "@playwright/test";

const regions = ["oasis", "canyon", "mist", "stardust"] as const;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "GPU 生命周期在单一 Chromium WebGL 上执行即可");
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("反复迁营不会累积区域模型、纹理与世界几何", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  const samples = await page.evaluate(async (ids) => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    await game.newGame("expedition", "REGION-RELEASE-081");
    game.state.tutorialStep = 5;
    game.meta.seenTutorial = true;
    game.running = false;
    game.paused = true;
    const output: Array<{ cycle: number; region: string; geometries: number; textures: number; regionModels: number }> = [];
    // Four warmup cycles allow the renderer to compile every region once. The
    // following 20 rebuilds are the actual leak check.
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const region = ids[cycle % ids.length]!;
      game.state.regionId = region;
      game.state.terrainVariant = cycle % 4;
      await game.library.ensureRegionBundle(region);
      game.buildWorld();
      game.renderer.render(game.scene, game.camera);
      if (cycle >= 4) {
        output.push({
          cycle,
          region,
          geometries: game.renderer.info.memory.geometries,
          textures: game.renderer.info.memory.textures,
          regionModels: game.library.loadedRegionModels.size
        });
      }
    }
    return output;
  }, regions);

  expect(samples).toHaveLength(8);
  expect(samples.every((sample) => sample.regionModels === 1)).toBe(true);
  const geometries = samples.map((sample) => sample.geometries);
  const textures = samples.map((sample) => sample.textures);
  expect(Math.max(...geometries) - Math.min(...geometries), JSON.stringify(samples)).toBeLessThanOrEqual(35);
  expect(Math.max(...textures) - Math.min(...textures), JSON.stringify(samples)).toBeLessThanOrEqual(6);
  expect(geometries.at(-1)!, JSON.stringify(samples)).toBeLessThanOrEqual(geometries[0]! + 12);
  expect(textures.at(-1)!, JSON.stringify(samples)).toBeLessThanOrEqual(textures[0]! + 2);
});
