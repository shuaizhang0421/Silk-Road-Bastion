import { expect, test, type Page } from "@playwright/test";

type DebugSceneObject = { name: string; parent: string; x: number; y: number; z: number; sx: number; sy: number; sz: number };

async function startFreshExpedition(page: Page): Promise<void> {
  if (!page.url().startsWith("http")) await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    await game?.newGame("expedition", "VISUAL-BASELINE-081");
    // The responsive baseline audits the fort, HUD and build-zone geometry. Field
    // resources/events have their own seeded and interaction tests, so remove them
    // from this scene to prevent intentional daily variety becoming pixel noise.
    if (game?.state) {
      game.state.gathered = Array.from({ length: 16 }, (_, index) => `${game.state.epoch}:${index}`);
      game.state.fieldObjective = { id: `${game.state.epoch}:visual`, type: "scout", position: { x: 0, z: -40 }, completed: true, reward: {} };
      game.buildWorld();
    }
  });
  await expect(page.getByLabel("建造快捷栏")).toBeVisible();
  await page.waitForTimeout(900);
}

async function freezeFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: { running?: boolean; paused?: boolean } }).__silkRoadGame;
    if (game) { game.running = false; game.paused = true; }
  });
  await page.waitForTimeout(120);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("首页、首日、院落几何和建造状态在目标视口稳定", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "丝路堡垒" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /行者历练，后续开放/ })).toBeVisible();
  await freezeFrame(page);
  await expect(page).toHaveScreenshot("title.png", { animations: "disabled" });

  await startFreshExpedition(page);
  await expect(page.getByText(/选择商栈后/)).toBeVisible();
  await freezeFrame(page);
  await expect(page).toHaveScreenshot("first-day.png", { animations: "disabled" });
  const objects = await page.evaluate<DebugSceneObject[]>(() => {
    const game = (window as unknown as { __silkRoadGame?: { world?: { traverse(callback: (object: any) => void): void } } }).__silkRoadGame;
    const result: DebugSceneObject[] = [];
    game?.world?.traverse((object: any) => {
      if (!object?.isMesh || !object.visible || !object.geometry) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every((material: any) => material?.visible === false || material?.colorWrite === false || material?.opacity === 0)) return;
      object.geometry.computeBoundingBox?.();
      const box = object.geometry.boundingBox;
      if (!box) return;
      object.updateWorldMatrix?.(true, false);
      const m = object.matrixWorld.elements as number[];
      const scaleX = Math.hypot(m[0]!, m[1]!, m[2]!);
      const scaleY = Math.hypot(m[4]!, m[5]!, m[6]!);
      const scaleZ = Math.hypot(m[8]!, m[9]!, m[10]!);
      const sx = Math.abs((box.max.x - box.min.x) * scaleX);
      const sy = Math.abs((box.max.y - box.min.y) * scaleY);
      const sz = Math.abs((box.max.z - box.min.z) * scaleZ);
      result.push({ name: object.name ?? "", parent: object.parent?.name ?? "", x: m[12]!, y: m[13]!, z: m[14]!, sx, sy, sz });
    });
    return result;
  });
  const detachedBoards = objects.filter((item) => Math.abs(item.x) > 5 && Math.abs(item.x) < 10 && item.z > -10 && item.z < -4 && item.y < 1.4 && item.sx > 2.4 && item.sz > 0.45);
  expect(detachedBoards, JSON.stringify(detachedBoards, null, 2)).toEqual([]);
  await expect(page).toHaveScreenshot("courtyard-clean.png", { animations: "disabled" });
  const highGroundArtifacts = await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    game.state.expansionLevel = 3;
    game.state.regionModule = "high-ground";
    game.buildWorld();
    const artifacts: string[] = [];
    game.world.traverse((object: any) => {
      if (!object?.isMesh || !object.visible || !object.geometry) return;
      object.geometry.computeBoundingBox?.();
      const box = object.geometry.boundingBox;
      if (!box) return;
      object.updateWorldMatrix?.(true, false);
      const m = object.matrixWorld.elements as number[];
      const scaleX = Math.hypot(m[0]!, m[1]!, m[2]!);
      const scaleZ = Math.hypot(m[8]!, m[9]!, m[10]!);
      const size = { x: Math.abs((box.max.x - box.min.x) * scaleX), z: Math.abs((box.max.z - box.min.z) * scaleZ) };
      const type = object.geometry.type;
      if (type === "CylinderGeometry" && size.x > 6 && size.z > 6 && object.position.y < 2) artifacts.push(`${object.name}:${size.x.toFixed(1)}x${size.z.toFixed(1)}`);
    });
    return artifacts;
  });
  expect(highGroundArtifacts).toEqual([]);
  // Region and expansion asset swaps finish asynchronously. Waiting for the
  // authored bundle prevents the screenshot from racing the last geometry swap
  // on slower tablet emulation.
  await page.waitForFunction(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    return Boolean(game?.world?.getObjectByName?.("integrated-side-bastion"));
  });
  // Rebuilding changes the fort footprint, but not the player's actual input.
  // Snap the debug camera back to its deterministic gameplay framing before
  // freezing, otherwise its normal lerp can land on two equally valid frames.
  await page.evaluate(() => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    game.cameraFocus.set(0, 1.25, -0.7);
    const distance = game.cameraDistance;
    game.camera.position.set(0, 31 + (distance - 32) * 0.34, -0.7 + distance + 5);
    game.camera.lookAt(0, 1.35, -0.7);
  });
  await page.waitForTimeout(180);
  await freezeFrame(page);
  await expect(page).toHaveScreenshot("high-ground-module.png", { animations: "disabled" });
  await page.getByRole("button", { name: /丝路商栈/ }).click();
  await expect(page.getByText(/选择发光的合法建造区域/)).toBeVisible();
  await freezeFrame(page);
  await expect(page).toHaveScreenshot("build-mode.png", { animations: "disabled" });
});
