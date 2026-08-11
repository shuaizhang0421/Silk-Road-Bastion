import type {
  BuildZoneDefinition,
  BuildingType,
  FortLayoutDefinition,
  GameMode,
  RegionModule
} from "./types";

const DEFENSE: BuildingType[] = ["ballista", "fire", "antiair"];
const COURTYARD: BuildingType[] = ["ballista", "fire", "antiair", "market", "workshop"];
const LOGISTICS: BuildingType[] = ["market", "workshop"];
const SIEGE: BuildingType[] = ["trebuchet", "ballista", "antiair"];

function zone(
  id: string,
  type: BuildZoneDefinition["type"],
  x: number,
  z: number,
  unlockExpansion: BuildZoneDefinition["unlockExpansion"],
  allowed: BuildingType[],
  coveredLanes: number[],
  rotation = 0,
  elevation = 0
): BuildZoneDefinition {
  return { id, type, position: { x, z }, rotation, unlockExpansion, allowed, coveredLanes, elevation };
}

/**
 * Stable zone ordering is intentionally retained for v7 saves. The visual layout is new,
 * but padIndex continues to identify the same unlocked progression slot.
 */
const EXPEDITION_ZONES: BuildZoneDefinition[] = [
  zone("gatehouse-west", "defense", -7.6, -7.1, 0, DEFENSE, [-1, 0], 0.08, 0.55),
  zone("gatehouse-east", "defense", 7.6, -7.1, 0, DEFENSE, [0, 1], -0.08, 0.55),
  zone("main-yard-west", "courtyard", -12.2, 1.1, 0, COURTYARD, [-1, 0], 0.06),
  zone("main-yard-east", "courtyard", 12.2, 1.1, 0, COURTYARD, [0, 1], -0.06),
  zone("stores-west", "logistics", -8.4, 12.2, 0, LOGISTICS, [], 0),
  zone("stores-east", "logistics", 8.4, 12.2, 0, LOGISTICS, [], 0),
  zone("west-rampart", "defense", -18.4, -5.7, 1, DEFENSE, [-1, 0], 0.15, 1.15),
  zone("east-court", "courtyard", 17.1, 5.7, 1, COURTYARD, [1], -0.08),
  zone("east-rampart", "defense", 18.4, -5.7, 2, DEFENSE, [0, 1], -0.15, 1.15),
  zone("west-siege", "siege", -17.2, 6.2, 2, SIEGE, [-1, 0], 0.08, 0.5),
  zone("caravan-yard-west", "logistics", -11.2, 20.7, 3, LOGISTICS, [], 0),
  zone("caravan-yard-east", "logistics", 11.2, 20.7, 3, LOGISTICS, [], 0)
];

const SURVIVAL_ZONES: BuildZoneDefinition[] = [
  ...EXPEDITION_ZONES.slice(0, 6),
  zone("fixed-rampart", "defense", -18.1, -5.5, 0, DEFENSE, [-1, 0], 0.15, 1.05),
  zone("fixed-flex-yard", "courtyard", 17.1, 5.7, 0, COURTYARD, [0, 1], -0.08)
];

export function fortLayout(
  mode: GameMode,
  expansionLevel: number,
  module: RegionModule | null
): FortLayoutDefinition {
  const expansion = mode === "survival" ? 1 : Math.max(0, Math.min(3, expansionLevel));
  const source = mode === "survival" ? SURVIVAL_ZONES : EXPEDITION_ZONES;
  const unlocked = mode === "survival"
    ? source
    : source.filter((entry) => entry.unlockExpansion <= expansion);
  const zones = unlocked.map((entry) => ({ ...entry, position: { ...entry.position }, allowed: [...entry.allowed], coveredLanes: [...entry.coveredLanes] }));

  if (module === "high-ground") {
    const target = zones.find((entry) => entry.type === "courtyard");
    if (target) {
      target.type = "defense";
      target.allowed = [...DEFENSE];
      target.elevation = Math.max(target.elevation, 1.35);
    }
  } else if (module === "caravan-yard") {
    const target = [...zones].reverse().find((entry) => entry.type === "courtyard");
    if (target) {
      target.type = "logistics";
      target.allowed = [...LOGISTICS];
      target.coveredLanes = [];
    }
  } else if (module === "mechanism-emplacement") {
    const target = zones.find((entry) => entry.type === "siege") ?? zones.find((entry) => entry.type === "defense");
    if (target) target.allowed = [...new Set([...target.allowed, "trebuchet"] as BuildingType[])];
  }

  return {
    id: `${mode}-${expansion}-${module ?? "standard"}`,
    width: mode === "survival" ? 42 : 34 + Math.min(2, expansion) * 8,
    // Depth is the rear wall z coordinate. The first two expansions grow sideways;
    // only the final caravan yard extends the rear logistics court.
    depth: mode === "expedition" && expansion >= 3 ? 28 : 18,
    expansionLevel: expansion,
    zones
  };
}

export function canBuildInZone(type: BuildingType, zone: BuildZoneDefinition): boolean {
  return zone.allowed.includes(type);
}
