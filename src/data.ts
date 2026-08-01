import type {
  BuildingDefinition,
  BuildingType,
  DirectorContext,
  EnemyDefinition,
  EnemyType,
  GameMode,
  GameState,
  HeroClass,
  MetaProgress,
  NightModifier,
  RegionDefinition,
  RelicDefinition,
  Resources,
  RngState
} from "./types";

export const SAVE_KEY = "silk-road-bastion:v5";
export const PREVIOUS_KEY = "silk-road-bastion:v4";
export const LEGACY_KEY = "silk-road-bastion:v1";

export const regions: RegionDefinition[] = [
  {
    id: "oasis",
    name: "绿洲商路",
    ground: 0x9d7d4f,
    floor: 0x7d8b73,
    fog: 0xc8b37f,
    sky: 0x6f9e9d,
    accent: 0x51a08f,
    perk: "商栈钱币产量提高 25%",
    threat: ["raider", "looter", "shield"]
  },
  {
    id: "canyon",
    name: "赤岩峡谷",
    ground: 0x9b5940,
    floor: 0x8a705c,
    fog: 0xc47c5f,
    sky: 0x9a6b62,
    accent: 0xd36c43,
    perk: "工坊石料产量 +1，城门升级更省石料",
    threat: ["raider", "sapper", "ram"]
  },
  {
    id: "mist",
    name: "雾港遗址",
    ground: 0x526f6c,
    floor: 0x5e7870,
    fog: 0x809c97,
    sky: 0x577d83,
    accent: 0x6fa9ac,
    perk: "雾气使来袭敌军移动减慢 12%",
    threat: ["looter", "flyer", "shield"]
  },
  {
    id: "stardust",
    name: "星砂高原",
    ground: 0x80725d,
    floor: 0x6d6578,
    fog: 0xa78f89,
    sky: 0x5f667f,
    accent: 0xb68dbd,
    perk: "工坊机巧产量翻倍",
    threat: ["flyer", "sapper", "ram"]
  }
];

export const buildings: Record<BuildingType, BuildingDefinition> = {
  ballista: {
    type: "ballista",
    name: "机关弩塔",
    icon: "ph-crosshair",
    role: "远程高伤",
    purpose: "大型床弩自动攻击远处敌人，升级提高伤害与射速",
    cost: { coin: 10, wood: 5, stone: 3 },
    maxHp: 130,
    attack: 18,
    range: 18,
    cooldown: 1.25
  },
  fire: {
    type: "fire",
    name: "火油塔",
    icon: "ph-fire",
    role: "范围减速",
    purpose: "火油弹快速攻击并减慢敌人，适合拖住攻城兽",
    cost: { coin: 16, wood: 4, gear: 4 },
    maxHp: 105,
    attack: 11,
    range: 12,
    cooldown: 0.72
  },
  antiair: {
    type: "antiair",
    name: "防空连弩",
    icon: "ph-airplane-tilt",
    role: "拦截飞行机关",
    purpose: "优先锁定飞行机关，对空伤害极高，也能支援近距离地面敌人",
    cost: { coin: 22, wood: 6, gear: 8 },
    maxHp: 118,
    attack: 26,
    range: 16,
    cooldown: 0.82
  },
  trebuchet: {
    type: "trebuchet",
    name: "震石投车",
    icon: "ph-rocket-launch",
    role: "远程范围攻城",
    purpose: "向远处投掷震石，爆炸伤害附近多个敌人，克制成群盾卫与攻城兽",
    cost: { coin: 30, wood: 10, stone: 10, gear: 5 },
    maxHp: 165,
    attack: 34,
    range: 24,
    cooldown: 2.15
  },
  market: {
    type: "market",
    name: "丝路商栈",
    icon: "ph-storefront",
    role: "每 3 秒产币",
    purpose: "每 3 秒自动生产钱币，受损停产，升级后产量递增",
    cost: { coin: 8, wood: 7 },
    maxHp: 145
  },
  workshop: {
    type: "workshop",
    name: "机巧工坊",
    icon: "ph-gear-six",
    role: "轮换产材料",
    purpose: "每 3 秒轮流生产木材、石料和机巧，受损时暂停",
    cost: { coin: 12, stone: 7 },
    maxHp: 150
  }
};

export const enemies: Record<EnemyType, EnemyDefinition> = {
  raider: { type: "raider", name: "沙匪", hp: 42, speed: 3.25, damage: 8, reward: 2, unlockEpoch: 1 },
  shield: { type: "shield", name: "盾卫", hp: 92, speed: 2.2, damage: 10, reward: 4, unlockEpoch: 2 },
  sapper: { type: "sapper", name: "爆破手", hp: 58, speed: 2.95, damage: 22, reward: 5, unlockEpoch: 3 },
  looter: { type: "looter", name: "游弓手", hp: 52, speed: 3.45, damage: 8, reward: 4, unlockEpoch: 3 },
  flyer: { type: "flyer", name: "飞行机关", hp: 66, speed: 4.25, damage: 9, reward: 6, unlockEpoch: 4 },
  ram: { type: "ram", name: "攻城兽", hp: 210, speed: 1.62, damage: 28, reward: 10, unlockEpoch: 5 }
};

function stack(effect: string): RelicDefinition["apply"] {
  return (state) => {
    state.relics.push(effect);
  };
}

export const relics: RelicDefinition[] = [
  { id: "silk-contract", name: "丝帛商契", icon: "ph-scroll", text: "商栈每次产币 +1", color: 0xd2a24c, category: "trade", rarity: "common", maxStacks: 5, effect: "trade", apply: stack("trade") },
  { id: "caravan-bell", name: "驼队铜铃", icon: "ph-bell", text: "击败敌人额外获得 1 钱币", color: 0xc9974f, category: "trade", rarity: "rare", maxStacks: 3, effect: "bounty", apply: stack("bounty") },
  { id: "jade-ledger", name: "玉印账册", icon: "ph-book-open", text: "商栈订单有概率双倍", color: 0x4b9a76, category: "trade", rarity: "legendary", maxStacks: 1, effect: "double-trade", apply: stack("double-trade") },
  { id: "artisan-wheel", name: "匠轮", icon: "ph-gear", text: "工坊轮换产量 +1", color: 0x8b735e, category: "production", rarity: "common", maxStacks: 5, effect: "workshop", apply: stack("workshop") },
  { id: "star-gear", name: "星砂齿轮", icon: "ph-gear-fine", text: "机巧产量翻倍", color: 0x8b72a4, category: "production", rarity: "rare", maxStacks: 3, effect: "gear", apply: stack("gear") },
  { id: "oasis-cistern", name: "绿洲水契", icon: "ph-drop", text: "生产建筑受损时仍保留半数产量", color: 0x4b8d92, category: "production", rarity: "legendary", maxStacks: 1, effect: "resilient", apply: stack("resilient") },
  {
    id: "mason-seal",
    name: "石工印",
    icon: "ph-wall",
    text: "城门上限 +60",
    color: 0x9a7358,
    category: "defense",
    rarity: "common",
    maxStacks: 5,
    effect: "gate",
    apply: (state) => {
      state.relics.push("gate");
      state.gateMaxHp += 60;
      state.gateHp += 60;
    }
  },
  { id: "repair-manual", name: "营造残卷", icon: "ph-hammer", text: "每夜结束修复城门 45 点", color: 0x9e8a64, category: "defense", rarity: "rare", maxStacks: 3, effect: "repair", apply: stack("repair") },
  { id: "iron-hinges", name: "玄铁门轴", icon: "ph-shield-chevron", text: "城门受伤降低 12%", color: 0x66747b, category: "defense", rarity: "legendary", maxStacks: 1, effect: "gate-armor", apply: stack("gate-armor") },
  { id: "repeating-bow", name: "连弩机括", icon: "ph-crosshair", text: "防御伤害 +15%", color: 0x4e9186, category: "weapon", rarity: "common", maxStacks: 5, effect: "damage", apply: stack("damage") },
  { id: "fire-clay", name: "火油陶胆", icon: "ph-fire", text: "火油塔减速延长 0.4 秒", color: 0xc76a3f, category: "weapon", rarity: "rare", maxStacks: 3, effect: "fire", apply: stack("fire") },
  { id: "piercing-winch", name: "破甲绞盘", icon: "ph-bow-arrow", text: "床弩对盾卫和攻城兽伤害 +35%", color: 0x8b5f42, category: "weapon", rarity: "legendary", maxStacks: 1, effect: "pierce", apply: stack("pierce") },
  { id: "wind-boots", name: "逐风靴", icon: "ph-sneaker-move", text: "移动速度 +10%", color: 0x738da3, category: "exploration", rarity: "common", maxStacks: 5, effect: "speed", apply: stack("speed") },
  { id: "survey-map", name: "商路测绘图", icon: "ph-map-trifold", text: "城外采集量 +20%", color: 0x789064, category: "exploration", rarity: "rare", maxStacks: 3, effect: "gather", apply: stack("gather") },
  { id: "moon-compass", name: "月影罗盘", icon: "ph-compass", text: "号角提前 3 秒响起", color: 0x627c9a, category: "exploration", rarity: "legendary", maxStacks: 1, effect: "warning", apply: stack("warning") },
  { id: "traveler-charm", name: "行者护符", icon: "ph-hand-eye", text: "行者生命上限 +25", color: 0x9f7652, category: "survival", rarity: "common", maxStacks: 5, effect: "health", apply: (state) => { state.relics.push("health"); state.player.maxHp += 25; state.player.hp += 25; } },
  { id: "battle-ration", name: "胡饼军粮", icon: "ph-bowl-food", text: "每夜结束恢复行者 35 生命", color: 0xba7d4c, category: "survival", rarity: "rare", maxStacks: 3, effect: "ration", apply: stack("ration") },
  { id: "phoenix-knot", name: "回生结", icon: "ph-heart", text: "主帐每夜恢复 18 耐久", color: 0xa65d56, category: "survival", rarity: "legendary", maxStacks: 1, effect: "core-repair", apply: stack("core-repair") }
];

export const nightModifiers: NightModifier[] = [
  { id: "sandstorm", name: "沙暴夜", icon: "ph-wind", enemySpeed: 0.92, enemyDamage: 1, loot: 1.25, production: 1 },
  { id: "elite-guard", name: "精锐护卫", icon: "ph-shield-star", enemySpeed: 1, enemyDamage: 1.16, loot: 1.35, production: 1 },
  { id: "flying-raid", name: "飞袭警报", icon: "ph-bird", enemySpeed: 1.08, enemyDamage: 1, loot: 1.2, production: 1 },
  { id: "looter-call", name: "掠夺增援", icon: "ph-hand-grabbing", enemySpeed: 1.12, enemyDamage: 0.94, loot: 1.3, production: 1 },
  { id: "repair-fair", name: "修缮夜市", icon: "ph-hammer", enemySpeed: 1, enemyDamage: 1, loot: 1, production: 1.18 },
  { id: "harvest", name: "商路丰收", icon: "ph-wheat", enemySpeed: 1.05, enemyDamage: 1.05, loot: 1.2, production: 1.3 }
];

export class SeedStreams {
  constructor(public state: RngState) {}

  next(stream: keyof RngState): number {
    let x = this.state[stream] >>> 0;
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state[stream] = x >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  pick<T>(stream: keyof RngState, list: T[]): T {
    return list[Math.floor(this.next(stream) * list.length)]!;
  }

  shuffle<T>(stream: keyof RngState, list: T[]): T[] {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(this.next(stream) * (index + 1));
      [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
    }
    return copy;
  }
}

export function hashSeed(text: string): number {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function makeRngState(seed: string): RngState {
  const base = hashSeed(seed);
  return {
    world: base ^ 0x9e3779b9,
    region: base ^ 0x85ebca6b,
    event: base ^ 0xc2b2ae35,
    loot: base ^ 0x27d4eb2f,
    combat: base ^ 0x165667b1
  };
}

export function emptyMeta(): MetaProgress {
  return {
    version: 5,
    renown: 0,
    records: { expedition: 0, survival: 0, training: 0 },
    seenTutorial: false,
    unlockedRegions: ["oasis", "canyon", "mist"]
  };
}

export function createGame(mode: GameMode, seedInput: string, meta: MetaProgress, hero: HeroClass = "guardian"): GameState {
  const seed = seedInput.trim() || Math.random().toString(36).slice(2, 10).toUpperCase();
  const rng = makeRngState(seed);
  const streams = new SeedStreams(rng);
  const available = regions.filter((region) => meta.unlockedRegions.includes(region.id));
  const region = streams.pick("region", available);
  return {
    version: 5,
    mode,
    seed,
    rng,
    epoch: 1,
    phase: "day",
    phaseTime: 20,
    dayLength: 20,
    regionId: region.id,
    resources: { coin: 30, wood: 18, stone: 14, gear: 3 },
    player: { position: { x: 0, z: 3.5 }, hp: 100, maxHp: 100, attackCooldown: 0 },
    gateHp: 260,
    gateMaxHp: 260,
    gateLevel: 1,
    coreHp: 180,
    coreMaxHp: 180,
    prosperity: 0,
    renownEarned: 0,
    kills: 0,
    recentDamage: 0,
    buildings: [],
    enemies: [],
    gathered: [],
    relics: [],
    relicStacks: [],
    recentRelicChoices: [],
    pendingChoices: [],
    tutorialStep: meta.seenTutorial ? 5 : 0,
    productionTimer: 3,
    workshopRotation: 0,
    nightSpeed: 1,
    nightModifier: null,
    fieldObjective: null,
    scoutIntel: 0,
    reinforcementNights: 0,
    touch: { mode: "idle", pointerId: null },
    terrainVariant: Math.floor(streams.next("world") * 4),
    expansionLevel: 0,
    fortifications: [-1, 0, 1].map((lane, index) => ({ id: `fort-${index}`, lane, level: 1, hp: 160, maxHp: 160, built: false })),
    adventure: mode === "training" ? {
      hero,
      room: 1,
      maxRooms: 4,
      roomKind: "camp",
      level: 1,
      experience: 0,
      nextExperience: 18,
      attack: hero === "guardian" ? 38 : hero === "ranger" ? 31 : 27,
      attackRange: hero === "guardian" ? 3.8 : hero === "ranger" ? 11.5 : 6.2,
      moveSpeed: hero === "ranger" ? 8.4 : hero === "artificer" ? 7.2 : 6.7,
      armor: hero === "guardian" ? 2 : 0,
      skillPower: 0,
      skillCooldown: 0,
      gear: [],
      choices: []
    } : null
  };
}

export function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return Object.entries(cost).every(([key, value]) => resources[key as keyof Resources] >= (value ?? 0));
}

export function pay(resources: Resources, cost: Partial<Resources>): void {
  Object.entries(cost).forEach(([key, value]) => {
    resources[key as keyof Resources] -= value ?? 0;
  });
}

export function upgradeCost(type: BuildingType, level: number): Partial<Resources> {
  const factor = 0.72 + Math.pow(level, 1.16) * 0.7;
  return Object.fromEntries(
    Object.entries(buildings[type].cost).map(([key, value]) => [key, Math.ceil((value ?? 0) * factor)])
  ) as Partial<Resources>;
}

export function directorWave(context: DirectorContext, region: RegionDefinition, streams: SeedStreams): EnemyType[] {
  const modeMultiplier = context.mode === "survival" ? 1.12 : 1;
  const budget = (4.6 + context.epoch * 2.1 + context.prosperity * 0.32 + context.defensePower * 0.1) * modeMultiplier;
  const pool = region.threat.filter((type) => enemies[type].unlockEpoch <= context.epoch);
  const universal = (Object.keys(enemies) as EnemyType[]).filter((type) => enemies[type].unlockEpoch <= context.epoch);
  const choices = [...new Set([...pool, ...universal])];
  const costs: Record<EnemyType, number> = { raider: 1, shield: 2.5, sapper: 2.3, looter: 1.8, flyer: 2.8, ram: 5.5 };
  const wave: EnemyType[] = [];
  let spent = 0;
  const cap = Math.min(48, 15 + context.epoch * 2);
  while (spent < budget && wave.length < cap) {
    const affordable = choices.filter((type) => costs[type] <= Math.max(1, budget - spent + 0.7));
    const type = streams.pick<EnemyType>("combat", affordable.length ? affordable : ["raider"]);
    wave.push(type);
    spent += costs[type];
  }
  if (context.epoch >= 3 && !wave.includes("sapper")) wave.push("sapper");
  if (context.epoch >= 4 && !wave.includes("flyer") && streams.next("combat") > 0.45) wave.push("flyer");
  if (context.epoch >= 5 && context.gateLevel >= 2 && !wave.includes("ram")) wave.push("ram");
  return streams.shuffle("combat", wave);
}

export function regionById(id: string): RegionDefinition {
  return regions.find((region) => region.id === id) ?? regions[0]!;
}

export function modeName(mode: GameMode): string {
  return mode === "expedition" ? "无尽远征" : mode === "survival" ? "极限守城" : "行者历练";
}
