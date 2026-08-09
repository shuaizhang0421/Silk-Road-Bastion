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
if (!migrated || migrated.version !== 7 || migrated.run?.version !== 7 || migrated.meta.version !== 7) throw new Error("v6 存档未升级到 v7");
if (migrated.run.assetVersion.length < 3 || migrated.run.enemies[0]?.bossKind !== null) throw new Error("v7 新字段迁移不完整");
if (migrated.run.seed !== "V6-MIGRATION" || migrated.run.resources.coin !== legacyRun.resources.coin) throw new Error("迁移未保留局内进度");
if (!isSafeSaveEnvelope(migrated)) throw new Error("迁移后的合法存档未通过范围校验");
const poisoned = structuredClone(migrated) as any;
poisoned.run.resources.coin = -1;
if (isSafeSaveEnvelope(poisoned)) throw new Error("负数资源没有被拒绝");
const oversized = structuredClone(migrated) as any;
oversized.run.enemies = Array.from({ length: 101 }, () => migrated.run!.enemies[0]);
if (isSafeSaveEnvelope(oversized)) throw new Error("异常敌军数量没有被拒绝");
if (migrateSaveEnvelope({ schema: "unknown", version: 6 }) !== null) throw new Error("损坏存档未被拒绝");

console.log("存档迁移通过：v6 进度保留，v7 字段补齐，损坏格式被拒绝。");
