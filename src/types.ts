export type GameMode = "expedition" | "survival" | "training";
export type GamePhase = "day" | "night" | "clear" | "relic" | "route" | "adventure" | "adventure-choice" | "gameover";
export type HeroClass = "guardian" | "ranger" | "artificer";
export type AdventureRoomKind = "camp" | "caravan" | "ruin" | "elite" | "boss";
export type BuildingType = "ballista" | "fire" | "market" | "workshop" | "antiair" | "trebuchet";
export type EnemyType = "raider" | "shield" | "sapper" | "looter" | "flyer" | "ram";
export type ResourceKey = "coin" | "wood" | "stone" | "gear";
export type EnemyTargetType = "gate" | "core" | "building" | "player";
export type RelicCategory = "trade" | "production" | "defense" | "weapon" | "exploration" | "survival";
export type RelicRarity = "common" | "rare" | "legendary";

export interface Vec2 {
  x: number;
  z: number;
}

export interface Resources {
  coin: number;
  wood: number;
  stone: number;
  gear: number;
}

export interface RngState {
  world: number;
  region: number;
  event: number;
  loot: number;
  combat: number;
}

export interface BuildingStatus {
  productionPaused: boolean;
  targeted: boolean;
  lastHitAt: number;
}

export interface BuildingState {
  id: string;
  type: BuildingType;
  padIndex: number;
  level: number;
  hp: number;
  maxHp: number;
  specialization?:
    | "cycle" | "wood" | "stone" | "gear"
    | "caravan" | "supply"
    | "pierce" | "watch"
    | "burn" | "tar"
    | "hunter" | "volley"
    | "siege" | "shatter";
  status: BuildingStatus;
}

export interface EnemyTarget {
  type: EnemyTargetType;
  id: string | null;
}

export interface EnemyState {
  id: string;
  type: EnemyType;
  hp: number;
  maxHp: number;
  speed: number;
  marchSpeed: number;
  combatSpeed: number;
  damage: number;
  position: Vec2;
  target: EnemyTargetType;
  targetId: string | null;
  attackCooldown: number;
  slowedUntil: number;
  targetedUntil: number;
  elite: boolean;
  lane: number;
  formationRank: number;
  collisionRadius: number;
  attackSlot: number;
  heightLayer: 0 | 1;
}

export interface FortificationState {
  id: string;
  lane: number;
  level: number;
  hp: number;
  maxHp: number;
  built: boolean;
  branch?: "spike" | "sand" | "oil";
}

export interface PlayerState {
  position: Vec2;
  hp: number;
  maxHp: number;
  attackCooldown: number;
}

export interface AdventureState {
  hero: HeroClass;
  room: number;
  maxRooms: number;
  roomKind: AdventureRoomKind;
  level: number;
  experience: number;
  nextExperience: number;
  attack: number;
  attackRange: number;
  moveSpeed: number;
  armor: number;
  skillPower: number;
  skillCooldown: number;
  gear: string[];
  choices: string[];
}

export interface NightModifier {
  id: string;
  name: string;
  icon: string;
  enemySpeed: number;
  enemyDamage: number;
  loot: number;
  production: number;
  description: string;
  repairDiscount?: number;
}

export interface FieldObjective {
  id: string;
  type: "ruin" | "caravan" | "scout" | "repair" | "cache" | "aid";
  position: Vec2;
  completed: boolean;
  reward: Partial<Resources>;
}

export interface RelicStack {
  id: string;
  stacks: number;
}

export interface TouchGestureState {
  mode: "idle" | "tap" | "drag" | "pinch";
  pointerId: number | null;
}

export interface DirectorContext {
  epoch: number;
  prosperity: number;
  gateLevel: number;
  defensePower: number;
  recentDamage: number;
  mode?: GameMode;
}

export interface RegionDefinition {
  id: string;
  name: string;
  ground: number;
  floor: number;
  fog: number;
  sky: number;
  accent: number;
  perk: string;
  threat: EnemyType[];
}

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  icon: string;
  role: string;
  purpose: string;
  cost: Partial<Resources>;
  maxHp: number;
  attack?: number;
  range?: number;
  cooldown?: number;
}

export interface EnemyDefinition {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  reward: number;
  unlockEpoch: number;
}

export interface GameState {
  version: 6;
  mode: GameMode;
  seed: string;
  rng: RngState;
  epoch: number;
  phase: GamePhase;
  phaseTime: number;
  dayLength: number;
  regionId: string;
  resources: Resources;
  player: PlayerState;
  gateHp: number;
  gateMaxHp: number;
  gateLevel: number;
  coreHp: number;
  coreMaxHp: number;
  prosperity: number;
  renownEarned: number;
  kills: number;
  recentDamage: number;
  buildings: BuildingState[];
  enemies: EnemyState[];
  gathered: string[];
  relics: string[];
  relicStacks: RelicStack[];
  recentRelicChoices: string[];
  pendingChoices: string[];
  tutorialStep: number;
  productionTimer: number;
  workshopRotation: number;
  nightSpeed: 1 | 2;
  nightModifier: NightModifier | null;
  fieldObjective: FieldObjective | null;
  /** 城外侦察和援军均只影响下一夜，避免积累成永久数值雪球。 */
  scoutIntel?: number;
  reinforcementNights?: number;
  touch: TouchGestureState;
  terrainVariant: number;
  expansionLevel: number;
  fortifications: FortificationState[];
  adventure: AdventureState | null;
}

export interface MetaProgress {
  version: 6;
  renown: number;
  records: Record<GameMode, number>;
  seenTutorial: boolean;
  unlockedRegions: string[];
}

export interface SaveEnvelope {
  schema: "silk-road-bastion";
  version: 6;
  savedAt: number;
  run: GameState | null;
  meta: MetaProgress;
}

export interface SaveSlotSummary {
  slot: number;
  mode: GameMode;
  epoch: number;
  regionId: string;
  savedAt: number;
}

export interface RelicDefinition {
  id: string;
  name: string;
  icon: string;
  text: string;
  color: number;
  category: RelicCategory;
  rarity: RelicRarity;
  maxStacks: number;
  effect: string;
  apply: (state: GameState) => void;
}
