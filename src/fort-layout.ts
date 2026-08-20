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
const SURVIVAL_DEFENSE: BuildingType[] = ["ballista", "fire", "antiair"];
const SURVIVAL_SIEGE: BuildingType[] = ["trebuchet", "ballista", "antiair"];
const SURVIVAL_MILITARY: BuildingType[] = ["barracks", "range", "engineerCamp", "infirmary"];
const SURVIVAL_LOGISTICS: BuildingType[] = ["market", "workshop", "granary"];
const SURVIVAL_FLEX: BuildingType[] = [...SURVIVAL_MILITARY, ...SURVIVAL_LOGISTICS, "ballista", "fire", "antiair"];

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
  // Initial gatehouse sockets sit flush with the paved courtyard. Their previous
  // elevation produced two permanent rectangular terraces even when empty.
  // Raised plinths are reserved for later, visibly integrated side ramparts.
  zone("gatehouse-west", "defense", -7.6, -7.1, 0, DEFENSE, [-1, 0], 0.08, 0.08),
  zone("gatehouse-east", "defense", 7.6, -7.1, 0, DEFENSE, [0, 1], -0.08, 0.08),
  zone("main-yard-west", "courtyard", -12.2, 1.1, 0, COURTYARD, [-1, 0], 0.06),
  zone("main-yard-east", "courtyard", 12.2, 1.1, 0, COURTYARD, [0, 1], -0.06),
  zone("stores-west", "logistics", -8.4, 12.2, 0, LOGISTICS, [], 0),
  zone("stores-east", "logistics", 8.4, 12.2, 0, LOGISTICS, [], 0),
  zone("west-rampart", "defense", -18.4, -5.7, 1, DEFENSE, [-1, 0], 0.15, 0.08),
  zone("east-court", "courtyard", 17.1, 5.7, 1, COURTYARD, [1], -0.08),
  zone("east-rampart", "defense", 18.4, -5.7, 2, DEFENSE, [0, 1], -0.15, 0.08),
  zone("west-siege", "siege", -17.2, 6.2, 2, SIEGE, [-1, 0], 0.08, 0.08),
  zone("caravan-yard-west", "logistics", -11.2, 20.7, 3, LOGISTICS, [], 0),
  zone("caravan-yard-east", "logistics", 11.2, 20.7, 3, LOGISTICS, [], 0)
];

const SURVIVAL_ZONES: BuildZoneDefinition[] = [
  zone("garrison-gate-west", "defense", -8.6, -8.2, 0, SURVIVAL_DEFENSE, [-1, 0], 0.08, 0.08),
  zone("garrison-gate-east", "defense", 8.6, -8.2, 0, SURVIVAL_DEFENSE, [0, 1], -0.08, 0.08),
  zone("garrison-rampart", "defense", -19.1, -4.8, 0, SURVIVAL_DEFENSE, [-1, 0], 0.14, 0.08),
  zone("garrison-siege", "siege", 19.1, -1.8, 0, SURVIVAL_SIEGE, [0, 1], -0.1, 0.08),
  zone("drill-yard-west", "military", -13.5, 3.4, 0, SURVIVAL_MILITARY, [], 0.04),
  zone("drill-yard-center", "military", 0, 4.2, 0, SURVIVAL_MILITARY, [], 0),
  zone("drill-yard-east", "military", 13.5, 3.4, 0, SURVIVAL_MILITARY, [], -0.04),
  zone("stores-west", "logistics", -13.2, 15.8, 0, SURVIVAL_LOGISTICS, [], 0),
  zone("stores-center", "logistics", 0, 16.8, 0, SURVIVAL_LOGISTICS, [], 0),
  zone("stores-east", "logistics", 13.2, 15.8, 0, SURVIVAL_LOGISTICS, [], 0),
  zone("flex-west", "courtyard", -7.3, 9.7, 0, SURVIVAL_FLEX, [-1, 0], 0.04),
  zone("flex-east", "courtyard", 7.3, 9.7, 0, SURVIVAL_FLEX, [0, 1], -0.04)
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
    // High ground upgrades an existing wall/rampart socket. Elevating a normal
    // courtyard socket created an isolated brown plinth in the middle of the
    // yard and duplicated the functional support geometry.
    const target = zones.find((entry) => entry.type === "defense" && Math.abs(entry.position.x) > 12)
      ?? zones.find((entry) => entry.type === "defense");
    if (target) {
      target.type = "defense";
      target.allowed = [...DEFENSE];
      target.elevation = Math.max(target.elevation, 1.15);
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
    width: mode === "survival" ? 48 : 34 + Math.min(2, expansion) * 8,
    // Depth is the rear wall z coordinate. The first two expansions grow sideways;
    // only the final caravan yard extends the rear logistics court.
    depth: mode === "survival" ? 26 : mode === "expedition" && expansion >= 3 ? 28 : 18,
    expansionLevel: expansion,
    zones
  };
}

export function canBuildInZone(type: BuildingType, zone: BuildZoneDefinition): boolean {
  return zone.allowed.includes(type);
}
