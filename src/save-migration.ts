import { ASSET_VERSION, emptyMeta } from "./data";
import type { GameState, SaveEnvelope } from "./types";

const modes = ["expedition", "survival", "training"] as const;
const phases = ["day", "night", "clear", "relic", "route", "adventure", "adventure-choice", "gameover"] as const;
const resourceKeys = ["coin", "wood", "stone", "gear"] as const;

/** Strict boundary check used before an imported or migrated file can replace a valid local slot. */
export function isSafeSaveEnvelope(value: unknown): value is SaveEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, any>;
  if (envelope.schema !== "silk-road-bastion" || envelope.version !== 7 || !envelope.meta || typeof envelope.meta !== "object") return false;
  const meta = envelope.meta;
  const recordNumbers = [
    meta.renown,
    ...Object.values(meta.records ?? {}),
    ...Object.values(meta.prosperityRecords ?? {}),
    ...Object.values(meta.bossRecords ?? {}),
    ...Object.values(meta.eventRecords ?? {})
  ];
  if (meta.version !== 7 || typeof meta.seenTutorial !== "boolean" || !recordNumbers.every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0 && entry <= 1_000_000_000)) return false;
  if (!modes.every((mode) => Number.isFinite(meta.records?.[mode])) || !Array.isArray(meta.unlockedRegions) || !meta.unlockedRegions.every((region: unknown) => typeof region === "string")) return false;
  if (envelope.run === null) return true;

  const run = envelope.run;
  if (!run || run.version !== 7 || !modes.includes(run.mode) || typeof run.seed !== "string" || run.seed.length > 160 || !phases.includes(run.phase)) return false;
  if (!Number.isFinite(run.epoch) || run.epoch < 1 || run.epoch > 100_000 || !Number.isFinite(run.dayLength) || run.dayLength < 1 || run.dayLength > 600) return false;
  for (const [hp, maxHp] of [[run.gateHp, run.gateMaxHp], [run.coreHp, run.coreMaxHp], [run.player?.hp, run.player?.maxHp]]) {
    if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || hp < 0 || maxHp <= 0 || hp > maxHp * 1.01) return false;
  }
  if (!run.resources || !resourceKeys.every((key) => Number.isFinite(run.resources[key]) && run.resources[key] >= 0 && run.resources[key] <= 1_000_000_000)) return false;
  if (!Number.isFinite(run.player?.position?.x) || !Number.isFinite(run.player?.position?.z)) return false;
  if (!["auto", "low", "medium", "high"].includes(run.qualityTier) || typeof run.assetVersion !== "string" || run.assetVersion.length > 80) return false;
  if (!Number.isFinite(run.bossKills) || run.bossKills < 0 || !Number.isFinite(run.eventsCompleted) || run.eventsCompleted < 0) return false;
  return Array.isArray(run.buildings) && run.buildings.length <= 32
    && Array.isArray(run.enemies) && run.enemies.length <= 100
    && Array.isArray(run.relics) && run.relics.length <= 500
    && Array.isArray(run.fortifications) && run.fortifications.length <= 12;
}

/** Pure v6 to v7 migration used by both the browser runtime and CI. */
export function migrateSaveEnvelope(value: unknown): SaveEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.schema !== "silk-road-bastion" || (raw.version !== 6 && raw.version !== 7)) return null;
  try {
    const candidate = JSON.parse(JSON.stringify(value)) as Record<string, any>;
    const metaDefaults = emptyMeta();
    candidate.version = 7;
    candidate.meta = {
      ...metaDefaults,
      ...(candidate.meta ?? {}),
      version: 7,
      records: { ...metaDefaults.records, ...(candidate.meta?.records ?? {}) },
      prosperityRecords: { ...metaDefaults.prosperityRecords, ...(candidate.meta?.prosperityRecords ?? {}) },
      bossRecords: { ...metaDefaults.bossRecords, ...(candidate.meta?.bossRecords ?? {}) },
      eventRecords: { ...metaDefaults.eventRecords, ...(candidate.meta?.eventRecords ?? {}) }
    };
    if (candidate.run) {
      candidate.run = {
        ...candidate.run,
        version: 7,
        regionModule: candidate.run.regionModule ?? null,
        readinessPressure: Number(candidate.run.readinessPressure ?? 0),
        bossKind: candidate.run.bossKind ?? null,
        bossKills: Number(candidate.run.bossKills ?? 0),
        eventsCompleted: Number(candidate.run.eventsCompleted ?? 0),
        rarePity: Number(candidate.run.rarePity ?? 0),
        qualityTier: candidate.run.qualityTier ?? "auto",
        assetVersion: ASSET_VERSION
      } satisfies Partial<GameState>;
      candidate.run.enemies = (candidate.run.enemies ?? []).map((enemy: Record<string, any>) => ({
        ...enemy,
        bossKind: enemy.bossKind ?? null,
        bossPhase: enemy.bossPhase ?? 0,
        attackRange: enemy.attackRange ?? (enemy.type === "archer" ? 15 : 1.6),
        windupUntil: enemy.windupUntil ?? 0
      }));
    }
    return candidate as SaveEnvelope;
  } catch {
    return null;
  }
}
