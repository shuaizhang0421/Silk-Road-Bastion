import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "单位资产与战斗状态只需在一个 WebGL 视口完整执行");
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("silk-road-bastion:quality", "low");
  });
});

test("全部兵种与四类首领使用独立实体并能进入动作和阶段状态", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新建随机世界/ })).toBeVisible({ timeout: 30_000 });

  const report = await page.evaluate(async () => {
    const game = (window as unknown as { __silkRoadGame?: any }).__silkRoadGame;
    await game.newGame("expedition", "UNIT-RUNTIME-081");
    game.state.tutorialStep = 5;
    game.meta.seenTutorial = true;

    const humanoids = [
      "player", "raider", "shield", "sapper", "looter", "archer",
      "shield-commander", "sapper-captain"
    ];
    const rigs = humanoids.map((kind) => {
      const rig = game.library.unit(kind);
      const names: string[] = [];
      rig.root.traverse((object: any) => { if (object.name) names.push(object.name); });
      // Exercise every public animation transition. The loader itself throws if
      // any required clip is absent; mixer updates prove the cloned skeleton is live.
      rig.setMoving(true);
      rig.mixer.update(0.12);
      rig.attack();
      rig.mixer.update(0.12);
      rig.hit();
      rig.mixer.update(0.12);
      rig.defeat();
      rig.mixer.update(0.12);
      return {
        kind,
        visualKind: rig.root.userData.visualKind,
        sourceAsset: rig.root.userData.sourceAsset,
        meshCount: names.length,
        actionNames: ((rig.mixer as any)._actions ?? []).map((action: any) => action?._clip?.name).filter(Boolean),
        defeated: Boolean(rig.root.userData.defeated)
      };
    });

    const mechanicalParts: Record<string, string> = {
      flyer: "left articulated wing",
      "kite-swarm": "swarm command crown",
      ram: "iron ram head",
      "siege-beast": "massive quadruped body"
    };
    const mechanical = Object.entries(mechanicalParts).map(([kind, part]) => {
      const model = game.library.model(`unit-${kind}`);
      const names: string[] = [];
      model.traverse((object: any) => { if (object.name) names.push(object.name); });
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return { kind, hasSignature: names.some((name) => normalize(name) === normalize(part)), names };
    });

    const baseEnemy = (id: string, type: string, bossKind: string | null, lane: number) => ({
      id, type, hp: 320, maxHp: 320, speed: 2.4, marchSpeed: 3.6, combatSpeed: 2.4,
      damage: 12, position: { x: (lane - 1) * 5.2, z: -25 - lane * 2 }, target: "gate",
      targetId: null, attackCooldown: 0, slowedUntil: 0, targetedUntil: 0, elite: false,
      lane: lane - 1, formationRank: 0, collisionRadius: type === "ram" ? 1.8 : 0.72,
      attackSlot: lane, heightLayer: type === "flyer" ? 1 : 0, bossKind, bossPhase: 0,
      attackRange: type === "archer" ? 15 : 1.6, windupUntil: 0, bossAction: "advance",
      bossSkillCooldown: 0, bossTelegraphUntil: 0
    });
    const definitions = [
      ["regular-raider", "raider", null, 0], ["regular-shield", "shield", null, 1],
      ["regular-sapper", "sapper", null, 2], ["regular-looter", "looter", null, 0],
      ["regular-archer", "archer", null, 1], ["regular-flyer", "flyer", null, 2],
      ["regular-ram", "ram", null, 0],
      ["boss-shield", "shield", "shield-commander", 0],
      ["boss-sapper", "sapper", "sapper-captain", 1],
      ["boss-kite", "flyer", "kite-swarm", 2],
      ["boss-beast", "ram", "siege-beast", 1]
    ] as const;
    game.state.enemies = definitions.map(([id, type, boss, lane]) => baseEnemy(id, type, boss, lane));
    for (const visual of game.enemyObjects.values()) visual.label?.remove();
    game.enemyObjects.clear();
    for (const enemy of game.state.enemies) game.createEnemyVisual(enemy);

    const bossSignatures: Record<string, string> = {
      "shield-commander": "command crest",
      "sapper-captain": "charge rack",
      "kite-swarm": "swarm command crown",
      "siege-beast": "massive quadruped body"
    };
    const enemies = game.state.enemies.map((enemy: any) => {
      const visual = game.enemyObjects.get(enemy.id);
      const names: string[] = [];
      visual.object.traverse((object: any) => { if (object.name) names.push(object.name); });
      if (enemy.bossKind) game.updateBossBehavior(enemy, visual, performance.now());
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return {
        id: enemy.id,
        type: enemy.type,
        bossKind: enemy.bossKind,
        visualHeight: visual.object.position.y,
        hasBossSignature: enemy.bossKind ? names.some((name) => normalize(name) === normalize(bossSignatures[enemy.bossKind])) : true,
        bossAction: enemy.bossAction,
        hasRig: Boolean(visual.rig)
      };
    });
    return { rigs, mechanical, enemies, objectCount: game.enemyObjects.size };
  });

  expect(report.rigs).toHaveLength(8);
  expect(report.rigs.every((entry: any) => entry.visualKind === entry.kind && entry.sourceAsset === `unit-${entry.kind}.glb` && entry.meshCount > 20), JSON.stringify(report.rigs)).toBe(true);
  expect(report.rigs.every((entry: any) => entry.defeated)).toBe(true);
  expect(report.rigs.every((entry: any) => ["Idle", "Run", "RecieveHit", "Death"].every((clip) => entry.actionNames.includes(clip)))).toBe(true);
  expect(report.mechanical.every((entry: any) => entry.hasSignature)).toBe(true);
  expect(report.objectCount).toBe(11);
  expect(report.enemies.filter((entry: any) => entry.bossKind).every((entry: any) => entry.hasBossSignature && entry.bossAction !== "advance")).toBe(true);
  expect(report.enemies.find((entry: any) => entry.type === "flyer" && !entry.bossKind)?.visualHeight).toBe(3.2);
  expect(report.enemies.find((entry: any) => entry.bossKind === "kite-swarm")?.visualHeight).toBe(3.2);
  expect(report.enemies.find((entry: any) => entry.bossKind === "siege-beast")?.hasRig).toBe(false);
});
