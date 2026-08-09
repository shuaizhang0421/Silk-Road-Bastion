import { ASSET_VERSION, emptyMeta } from "./data";
import type { GameState, SaveEnvelope } from "./types";

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
