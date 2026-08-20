import { createGame, emptyMeta } from "../src/data";
import { isSafeSaveEnvelope, migrateSaveEnvelope } from "../src/save-migration";

const legacyRun = createGame("expedition", "V6-MIGRATION", emptyMeta()) as any;
legacyRun.version = 6;
delete legacyRun.regionModule;
delete legacyRun.readinessPressure;
delete legacyRun.bossKills;
delete legacyRun.eventsCompleted;
delete legacyRun.rarePity;
delete legacyRun.qualityTier;
delete legacyRun.assetVersion;
delete legacyRun.weatherPhase;
legacyRun.enemies = [{
  id: "legacy-enemy", type: "raider", hp: 40, maxHp: 40, speed: 3, marchSpeed: 4.8,
  combatSpeed: 3, damage: 8, position: { x: 0, z: -20 }, target: "gate", targetId: null,
  attackCooldown: 0, slowedUntil: 0, targetedUntil: 0, elite: false, lane: 0,
  formationRank: 0, collisionRadius: 0.66, attackSlot: 0, heightLayer: 0
}];
const legacyMeta = emptyMeta() as any;
legacyMeta.version = 6;
delete legacyMeta.prosperityRecords;
delete legacyMeta.bossRecords;
delete legacyMeta.eventRecords;

const migrated = migrateSaveEnvelope({ schema: "silk-road-bastion", version: 6, savedAt: 1, run: legacyRun, meta: legacyMeta });
if (!migrated || migrated.version !== 8 || migrated.run?.version !== 8 || migrated.meta.version !== 8) throw new Error("v6 存档未升级到 v8");
if (migrated.run.assetVersion.length < 3 || migrated.run.enemies[0]?.bossKind !== null) throw new Error("v8 新字段迁移不完整");
if (typeof migrated.run.weatherPhase !== "number" || migrated.run.enemies[0]?.bossAction !== "advance") throw new Error("天气或首领动作默认值未迁移");
if (migrated.run.seed !== "V6-MIGRATION" || migrated.run.resources.coin !== legacyRun.resources.coin) throw new Error("迁移未保留局内进度");
if (!isSafeSaveEnvelope(migrated)) throw new Error("迁移后的合法存档未通过范围校验");
const poisoned = structuredClone(migrated) as any;
poisoned.run.resources.coin = -1;
if (isSafeSaveEnvelope(poisoned)) throw new Error("负数资源没有被拒绝");
const oversized = structuredClone(migrated) as any;
oversized.run.enemies = Array.from({ length: 101 }, () => migrated.run!.enemies[0]);
if (isSafeSaveEnvelope(oversized)) throw new Error("异常敌军数量没有被拒绝");
if (migrateSaveEnvelope({ schema: "unknown", version: 6 }) !== null) throw new Error("损坏存档未被拒绝");

const legacySurvival = createGame("survival", "V7-SURVIVAL-ARCHIVE", emptyMeta()) as any;
legacySurvival.version = 7;
delete legacySurvival.survival;
const archived = migrateSaveEnvelope({ schema: "silk-road-bastion", version: 7, savedAt: 2, run: legacySurvival, meta: { ...emptyMeta(), version: 7 } });
if (!archived || archived.run !== null || archived.meta.version !== 8) throw new Error("旧版极限局应封存而不是错误折算为驻军局");

const garrison = createGame("survival", "V8-GARRISON", emptyMeta());
if (!garrison.survival) throw new Error("v8 极限局缺少驻军状态");
garrison.survival.squads.push({
  id: "test-squad", type: "shield", memberHp: [92, 92, 0, 0], wounded: 1, fallen: 1,
  level: 2, experience: 8, specialization: null, guardNodeId: "inner-gate", command: "hold",
  focusEnemyId: null, attackCooldown: 0, ultimateCooldown: 0, drilledEpoch: 0, dispatched: false, fatigue: 0
});
const garrisonEnvelope = { schema: "silk-road-bastion" as const, version: 8 as const, savedAt: 3, run: garrison, meta: emptyMeta() };
if (!isSafeSaveEnvelope(garrisonEnvelope)) throw new Error("合法 v8 驻军存档未通过校验");
const overPopulation = structuredClone(garrisonEnvelope) as any;
overPopulation.run.survival.populationCap = 999;
if (isSafeSaveEnvelope(overPopulation)) throw new Error("异常驻军人口上限没有被拒绝");

console.log("存档迁移通过：v6 远征保留、v7 极限封存、v8 驻军合法且损坏格式被拒绝。");
