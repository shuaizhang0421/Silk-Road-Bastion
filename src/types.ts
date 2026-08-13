export type GameMode = "expedition" | "survival" | "training";
export type GamePhase = "day" | "night" | "clear" | "relic" | "route" | "adventure" | "adventure-choice" | "gameover";
export type HeroClass = "guardian" | "ranger" | "artificer";
export type AdventureRoomKind = "camp" | "caravan" | "ruin" | "elite" | "boss";
export type BuildingType = "ballista" | "fire" | "market" | "workshop" | "antiair" | "trebuchet";
export type EnemyType = "raider" | "shield" | "sapper" | "looter" | "archer" | "flyer" | "ram";
export type ResourceKey = "coin" | "wood" | "stone" | "gear";
export type EnemyTargetType = "gate" | "core" | "building" | "player";
export type RelicCategory = "trade" | "production" | "defense" | "weapon" | "exploration" | "survival";
export type RelicRarity = "common" | "rare" | "legendary";
export type BossKind = "shield-commander" | "sapper-captain" | "kite-swarm" | "siege-beast";
export type RegionModule = "high-ground" | "side-gate" | "caravan-yard" | "mechanism-emplacement";
export type QualityTier = "auto" | "low" | "medium" | "high";
export type BuildZoneType = "defense" | "courtyard" | "logistics" | "siege";
export type BossAction = "advance" | "formation" | "shockwave" | "plant-charge" | "detonate" | "split" | "dive" | "charge" | "recover";
export type WeatherKind = RegionDefinition["weather"];

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

export interface BuildZoneDefinition {
  id: string;
  type: BuildZoneType;
  position: Vec2;
  rotation: number;
  unlockExpansion: 0 | 1 | 2 | 3;
  allowed: BuildingType[];
  coveredLanes: number[];
  elevation: number;
}

export interface FortLayoutDefinition {
  id: string;
  width: number;
  depth: number;
  expansionLevel: number;
  zones: BuildZoneDefinition[];
}

export interface BuildingRelocationState {
  buildingId: string;
  originPadIndex: number;
  hoveredPadIndex: number;
}

export interface FortExpansionDefinition {
  level: 0 | 1 | 2 | 3;
  width: number;
  depth: number;
  unlockedZoneIds: string[];
}

export interface FortificationSocket {
  lane: number;
  position: Vec2;
  rotation: number;
  interactionRadius: number;
}

export interface TerrainChunkDefinition {
  id: string;
  center: Vec2;
  size: Vec2;
  resolution: number;
  lod: 0 | 1 | 2;
}

export interface SurfaceLayerDefinition {
  id: "packed" | "rock" | "sand" | "wet" | "vegetation" | "road";
  color: number;
  roughness: number;
  minSlope?: number;
  maxSlope?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface RoadSplineDefinition {
  id: string;
  points: Vec2[];
  width: number;
  stoneCoverage: number;
  walkable: boolean;
}

export interface GateRepairQuote {
  restore: number;
  cost: Partial<Resources>;
  fullRepair: boolean;
  emergency: boolean;
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
  bossKind: BossKind | null;
  bossPhase: 0 | 1 | 2;
  attackRange: number;
  windupUntil: number;
  bossAction: BossAction;
  bossSkillCooldown: number;
  bossTelegraphUntil: number;
  protectedUntil?: number;
}

export interface BossDefinition {
  kind: BossKind;
  name: string;
  enemyType: EnemyType;
  silhouette: "tower-shield" | "powder-rig" | "kite-array" | "armored-beast";
  phaseThresholds: readonly [number, number];
  skillCooldown: readonly [number, number, number];
  rewardCoin: number;
  rewardGear: number;
  preferredTargets: BuildingType[];
}

export interface RegionVisualProfile {
  regionId: string;
  weather: WeatherKind;
  weatherColor: number;
  weatherDensity: number;
  landmark: "oasis-channel" | "quarry-terraces" | "harbor-beacon" | "astral-ring";
  pathColor: number;
  boundaryColor: number;
  terrainAmplitude: number;
  horizonColor: number;
  surfaceLayers: SurfaceLayerDefinition[];
  groundTexture: string;
  roadStyle: "caravan-earth" | "quarry-haul" | "raised-causeway" | "observatory-axis";
  waterStyle: "canal" | "none" | "marsh" | "mineral-sheen";
  ecologyClusterIds: readonly string[];
  buildingPalette: readonly [number, number, number, number];
  landmarkPosition: Vec2;
}

export interface AnimationSet {
  /** Skeletal sets must resolve to real clips in the registered GLB. */
  source?: "skeletal" | "procedural";
  idle: string;
  run: string;
  aim?: string;
  attack?: string;
  hit?: string;
  defeat?: string;
}

export interface QualityPreset {
  tier: Exclude<QualityTier, "auto">;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  weatherParticles: number;
  sceneryDensity: number;
  maxVisibleHealthBars: number;
}

export interface AssetManifestEntry {
  id: string;
  path: string;
  type: "model" | "texture" | "audio" | "font" | "generated-art";
  author: string;
  license: "Project Original" | "CC0-1.0" | "CC-BY-4.0";
  source: string;
  modified: string;
}

export interface VisualAssetDefinition {
  id: string;
  desktopPath: string;
  mobilePath?: string;
  lodDistances: readonly number[];
  collider: "none" | "box" | "capsule" | "mesh";
  materialSet?: string;
  interactionAnchor?: string;
  bundle: "common" | string;
  triangleBudget?: readonly [number, number, number];
  /** Ordered authored LODs, highest detail first. */
  lodPaths?: readonly string[];
  textureSets?: readonly string[];
  collisionBounds?: readonly [number, number, number];
  animationSet?: string;
  stateModels?: Readonly<Partial<Record<"level2" | "level3" | "specialized" | "damaged" | "destroyed", string>>>;
}

export type ModelFitMode = "contain" | "axis-fit" | "tile-x" | "natural";

/** World-space contract used to prevent authored assets collapsing into thin panels. */
export interface ModelGeometryContract {
  id: string;
  nativeBounds: readonly [number, number, number];
  targetBounds: readonly [number, number, number];
  fitMode: ModelFitMode;
  groundPivot: "bounds-min" | "authored";
  colliderBounds: readonly [number, number, number];
  mobileSizeTolerance: number;
}

export interface BuildingVisualDefinition {
  id: string;
  footprint: readonly [number, number];
  heightRange: readonly [number, number];
  requiredParts: readonly ("foundation" | "body" | "roof" | "entrance")[];
  openSides: readonly ("front" | "rear" | "left" | "right")[];
  assetId?: string;
  levels?: Readonly<Partial<Record<1 | 2 | 3, string>>>;
  specializations?: Readonly<Record<string, string>>;
  damagedAsset?: string;
  destroyedAsset?: string;
}

export type MusicState = "explore" | "prepare" | "danger" | "boss" | "choice" | "victory" | "defeat";

export interface AudioCueDefinition {
  id: string;
  category: "music" | "ambience" | "effect";
  variants: readonly string[];
  volume: number;
  cooldownMs: number;
  maxVoices: number;
  spatial: boolean;
}

export interface RegionAudioProfile {
  regionId: string;
  scale: readonly number[];
  drone: number;
  tempo: number;
  ambience: readonly ("wind" | "water" | "rain" | "camp" | "stone" | "metal")[];
  timbre: OscillatorType;
}

export interface MaterialSetDefinition {
  id: string;
  colorPath: string;
  normalPath?: string;
  roughnessPath?: string;
  metalnessPath?: string;
  repeat: readonly [number, number];
  colorSpace: "srgb" | "linear";
  regionVariant?: string;
  fallbackColor?: number;
  mobileColorPath?: string;
}

export interface EnvironmentClusterDefinition {
  id: string;
  regionId: string;
  assets: readonly string[];
  minSpacing: number;
  clearRadius: number;
  placement: "water-edge" | "road-stop" | "slope-foot" | "rock-face" | "resource-pocket";
  slopeRange: readonly [number, number];
  waterDistance?: readonly [number, number];
  roadDistance?: readonly [number, number];
  boundaryDistance?: readonly [number, number];
  density: number;
  rotationRange: readonly [number, number];
  exclusionTags: readonly string[];
}

export interface InteractionAnchor {
  id: string;
  radius: number;
  approachOffsets: readonly Vec2[];
  lineOfSightHeight: number;
  bounds: readonly [number, number, number];
  pathTolerance: number;
}

export interface RegionAssetBundle {
  id: string;
  regionId: string;
  commonAssets: readonly string[];
  regionAssets: readonly string[];
  previewAssets: readonly string[];
  desktopPaths: readonly string[];
  mobilePaths: readonly string[];
  loadStage: "title-preview" | "route-preview" | "region-entry";
  release: "retain-preview" | "dispose-on-exit";
  compressedBudgetMb: readonly [number, number];
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
  type: "mine" | "ruin" | "caravan" | "elite" | "artisan" | "aid" | "scout" | "repair" | "cache";
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
  landmark: string;
  weather: "dry" | "wind" | "mist" | "starlight";
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
  version: 7;
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
  regionModule: RegionModule | null;
  readinessPressure: number;
  bossKind: BossKind | null;
  bossKills: number;
  eventsCompleted: number;
  rarePity: number;
  qualityTier: QualityTier;
  assetVersion: string;
  weatherPhase: number;
  fortifications: FortificationState[];
  adventure: AdventureState | null;
}

export interface MetaProgress {
  version: 7;
  renown: number;
  records: Record<GameMode, number>;
  prosperityRecords: Record<"expedition" | "survival", number>;
  bossRecords: Record<"expedition" | "survival", number>;
  eventRecords: Record<"expedition" | "survival", number>;
  seenTutorial: boolean;
  unlockedRegions: string[];
}

export interface SaveEnvelope {
  schema: "silk-road-bastion";
  version: 7;
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
  tags?: string[];
  requiresBuilding?: BuildingType;
  apply: (state: GameState) => void;
}
