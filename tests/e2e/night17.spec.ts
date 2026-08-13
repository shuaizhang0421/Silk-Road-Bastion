import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "真实第17夜战斗循环只需在一个 WebGL 环境执行");
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("第17夜真实防线不会在出生点瞬杀整波且会形成维修压力", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    await game.newGame("expedition", "REAL-NIGHT-17-081");
    game.meta.seenTutorial = true;
    game.state.tutorialStep = 5;
    game.state.epoch = 17;
    game.state.expansionLevel = 3;
    game.state.resources = { coin: 9999, wood: 9999, stone: 9999, gear: 9999 };
    game.buildWorld();
    for (const [type, pad, level] of [
      ["ballista", 0, 4], ["ballista", 1, 4], ["fire", 6, 4],
      ["antiair", 8, 3], ["trebuchet", 9, 3], ["market", 10, 3], ["workshop", 11, 3]
    ] as const) {
      game.buildOnPad(type, pad);
      const building = game.state.buildings.find((entry: any) => entry.type === type && entry.padIndex === pad);
      if (!building) throw new Error(`${type} 未能加入真实场景`);
      while (building.level < level) {
        game.selectBuilding(building.id);
        game.upgradeSelected();
      }
    }
    const gateBefore = game.state.gateHp;
    game.startNight();
    const queueSize = game.spawnQueue.length;
    const firstSpawnZ = game.spawnQueue[0]?.position.z ?? 0;
    let elapsed = 0;
    let outsideKills = 0;
    const furthestAdvance = new Map<string, number>();
    while (game.state.phase === "night" && elapsed < 100) {
      for (const enemy of game.state.enemies) {
        furthestAdvance.set(enemy.id, Math.max(furthestAdvance.get(enemy.id) ?? -Infinity, enemy.position.z));
      }
      const beforeIds = new Set<string>(game.state.enemies.map((enemy: any) => enemy.id));
      game.updateNight(0.1);
      for (const id of beforeIds) {
        if (!game.state.enemies.some((enemy: any) => enemy.id === id) && (furthestAdvance.get(id) ?? 0) < -32) outsideKills += 1;
      }
      elapsed += 0.1;
    }
    return {
      phase: game.state.phase,
      elapsed,
      queueSize,
      firstSpawnZ,
      outsideKillRatio: outsideKills / Math.max(1, queueSize),
      gateDamage: gateBefore - game.state.gateHp,
      levels: game.state.buildings.filter((entry: any) => ["ballista", "fire", "antiair", "trebuchet"].includes(entry.type)).map((entry: any) => entry.level)
    };
  });
  expect(result.firstSpawnZ).toBeLessThan(-46);
  expect(result.queueSize).toBeGreaterThan(20);
  expect(result.outsideKillRatio).toBeLessThanOrEqual(0.25);
  expect(result.elapsed).toBeGreaterThanOrEqual(42);
  expect(result.elapsed).toBeLessThanOrEqual(85);
  expect(result.gateDamage).toBeGreaterThan(20);
  expect(result.levels).toEqual([4, 4, 4, 3, 3]);
  expect(["clear", "relic", "gameover"]).toContain(result.phase);
});
