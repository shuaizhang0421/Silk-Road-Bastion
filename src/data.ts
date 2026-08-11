import type {
  BuildingDefinition,
  BuildingType,
  BossDefinition,
  BossKind,
  DirectorContext,
  EnemyDefinition,
  EnemyType,
  GameMode,
  GameState,
  HeroClass,
  MetaProgress,
  NightModifier,
  QualityPreset,
  RegionDefinition,
  RegionVisualProfile,
  RelicDefinition,
  Resources,
  RngState
} from "./types";

export const SAVE_KEY = "silk-road-bastion:v7";
export const PREVIOUS_SAVE_KEY = "silk-road-bastion:v6";
export const ASSET_VERSION = "sr-assets-2026.08-v3-runtime-glb";

export const qualityPresets: Record<"low" | "medium" | "high", QualityPreset> = {
  low: { tier: "low", pixelRatio: 0.9, shadows: false, shadowMapSize: 512, weatherParticles: 32, sceneryDensity: 0.55, maxVisibleHealthBars: 4 },
  medium: { tier: "medium", pixelRatio: 1.18, shadows: true, shadowMapSize: 1024, weatherParticles: 72, sceneryDensity: 0.78, maxVisibleHealthBars: 5 },
  high: { tier: "high", pixelRatio: 1.5, shadows: true, shadowMapSize: 1536, weatherParticles: 132, sceneryDensity: 1, maxVisibleHealthBars: 6 }
};

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
    threat: ["raider", "looter", "archer", "shield"],
    landmark: "绿洲水渠与驼队营地",
    weather: "dry"
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
    threat: ["raider", "sapper", "archer", "ram"],
    landmark: "风蚀高台与废弃采石场",
    weather: "wind"
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
    threat: ["looter", "archer", "flyer", "shield"],
    landmark: "断墙旧港与雾中航标",
    weather: "mist"
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
    threat: ["flyer", "sapper", "archer", "ram"],
    landmark: "矿晶带与天文遗迹",
    weather: "starlight"
  }
];

/** 区域视觉配置与规则数据分离，避免天气和地标只存在于文案里。 */
export const regionVisualProfiles: Record<string, RegionVisualProfile> = {
  oasis: {
    regionId: "oasis", weather: "dry",
    weatherColor: 0xd4b879, weatherDensity: 0.42, landmark: "oasis-channel",
    pathColor: 0xe2c27e, boundaryColor: 0x6d604e, terrainAmplitude: 2.5, horizonColor: 0x7f6f57,
    groundTexture: "region-oasis", roadStyle: "caravan-earth", waterStyle: "canal",
    ecologyClusterIds: ["canal-greenbelt", "caravan-stop", "foothill-rocks", "oasis-resource-pocket"],
    buildingPalette: [0xa68a62, 0x5a3928, 0x3f7470, 0x9c6d42], landmarkPosition: { x: -34, z: -50 },
    surfaceLayers: [
      { id: "packed", color: 0xa98455, roughness: 0.94, maxSlope: 0.4 },
      { id: "rock", color: 0x6f604d, roughness: 1, minSlope: 0.32 },
      { id: "sand", color: 0xc3a36a, roughness: 0.98 },
      { id: "wet", color: 0x536b5a, roughness: 0.72, maxHeight: 0.2 },
      { id: "vegetation", color: 0x68744d, roughness: 0.94 }
    ]
  },
  canyon: {
    regionId: "canyon", weather: "wind",
    weatherColor: 0xc8875d, weatherDensity: 0.72, landmark: "quarry-terraces",
    pathColor: 0xd1a06e, boundaryColor: 0x62382f, terrainAmplitude: 4.8, horizonColor: 0x764535,
    groundTexture: "region-canyon", roadStyle: "quarry-haul", waterStyle: "none",
    ecologyClusterIds: ["quarry-workface", "quarry-resource-pocket"],
    buildingPalette: [0x8d4e3a, 0x4a3025, 0x59615d, 0x6f3b2e], landmarkPosition: { x: -38, z: -53 },
    surfaceLayers: [
      { id: "packed", color: 0x9d6248, roughness: 0.96 },
      { id: "rock", color: 0x713b31, roughness: 1, minSlope: 0.24 },
      { id: "sand", color: 0xb97854, roughness: 0.98 },
      { id: "wet", color: 0x655147, roughness: 0.86 },
      { id: "vegetation", color: 0x6d6542, roughness: 0.96 }
    ]
  },
  mist: {
    regionId: "mist", weather: "mist",
    weatherColor: 0xb7c8c2, weatherDensity: 0.9, landmark: "harbor-beacon",
    pathColor: 0xa7bab0, boundaryColor: 0x465e5b, terrainAmplitude: 1.9, horizonColor: 0x48615f,
    groundTexture: "region-mist", roadStyle: "raised-causeway", waterStyle: "marsh",
    ecologyClusterIds: ["harbor-causeway", "mist-resource-pocket"],
    buildingPalette: [0x5d706b, 0x384541, 0x456e70, 0x557069], landmarkPosition: { x: -35, z: -52 },
    surfaceLayers: [
      { id: "packed", color: 0x657a71, roughness: 0.88 },
      { id: "rock", color: 0x465b57, roughness: 0.98, minSlope: 0.28 },
      { id: "sand", color: 0x78877b, roughness: 0.93 },
      { id: "wet", color: 0x354f4d, roughness: 0.52, maxHeight: 0.35 },
      { id: "vegetation", color: 0x4f6a59, roughness: 0.92 }
    ]
  },
  stardust: {
    regionId: "stardust", weather: "starlight",
    weatherColor: 0x9fc4ca, weatherDensity: 0.56, landmark: "astral-ring",
    pathColor: 0xb7a5c4, boundaryColor: 0x514b5f, terrainAmplitude: 3.4, horizonColor: 0x4c4d62,
    groundTexture: "region-stardust", roadStyle: "observatory-axis", waterStyle: "mineral-sheen",
    ecologyClusterIds: ["astral-observatory", "stardust-resource-pocket"],
    buildingPalette: [0x77727b, 0x3c4149, 0x3c6f72, 0x74634f], landmarkPosition: { x: -33, z: -51 },
    surfaceLayers: [
      { id: "packed", color: 0x756d67, roughness: 0.9 },
      { id: "rock", color: 0x4f4b5b, roughness: 0.97, minSlope: 0.26 },
      { id: "sand", color: 0x98879e, roughness: 0.94 },
      { id: "wet", color: 0x4f5964, roughness: 0.7 },
      { id: "vegetation", color: 0x5e6555, roughness: 0.94 }
    ]
  }
};

export const bossDefinitions: Record<BossKind, BossDefinition> = {
  "shield-commander": {
    kind: "shield-commander", name: "盾卫统领", enemyType: "shield", silhouette: "tower-shield",
    phaseThresholds: [0.66, 0.32], skillCooldown: [8.5, 7, 5.5], rewardCoin: 24, rewardGear: 6,
    preferredTargets: ["ballista", "fire", "trebuchet"]
  },
  "sapper-captain": {
    kind: "sapper-captain", name: "爆破队长", enemyType: "sapper", silhouette: "powder-rig",
    phaseThresholds: [0.68, 0.34], skillCooldown: [8, 6.5, 5], rewardCoin: 22, rewardGear: 8,
    preferredTargets: ["ballista", "workshop", "fire"]
  },
  "kite-swarm": {
    kind: "kite-swarm", name: "机械鸢群", enemyType: "flyer", silhouette: "kite-array",
    phaseThresholds: [0.62, 0.3], skillCooldown: [7.5, 6, 4.5], rewardCoin: 20, rewardGear: 10,
    preferredTargets: ["market", "workshop", "antiair"]
  },
  "siege-beast": {
    kind: "siege-beast", name: "披甲攻城兽", enemyType: "ram", silhouette: "armored-beast",
    phaseThresholds: [0.7, 0.36], skillCooldown: [9, 7.5, 6], rewardCoin: 28, rewardGear: 5,
    preferredTargets: []
  }
};

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
    range: 30,
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
    range: 14,
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
    range: 32,
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
    range: 46,
    cooldown: 2.15
  },
  market: {
    type: "market",
    name: "丝路商栈",
    icon: "ph-storefront",
    role: "贸易与材料周转",
    purpose: "每 3 秒产生钱币，并在保留建造储备后自动采购轮换材料；三级可专精现金或军需",
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
  looter: { type: "looter", name: "掠夺者", hp: 56, speed: 3.45, damage: 9, reward: 4, unlockEpoch: 3 },
  archer: { type: "archer", name: "游弓手", hp: 48, speed: 3.05, damage: 11, reward: 5, unlockEpoch: 4 },
  flyer: { type: "flyer", name: "飞行机关", hp: 66, speed: 4.25, damage: 9, reward: 6, unlockEpoch: 4 },
  ram: { type: "ram", name: "攻城兽", hp: 210, speed: 1.62, damage: 28, reward: 10, unlockEpoch: 5 }
};

function stack(effect: string): RelicDefinition["apply"] {
  return (state) => {
    state.relics.push(effect);
  };
}

export const relics: RelicDefinition[] = [
  { id: "silk-contract", name: "丝帛商契", icon: "ph-scroll", text: "商栈每次产币 +1", color: 0xd2a24c, category: "trade", rarity: "common", maxStacks: 5, effect: "trade", requiresBuilding: "market", apply: stack("trade") },
  { id: "caravan-bell", name: "驼队铜铃", icon: "ph-bell", text: "击败敌人额外获得 1 钱币", color: 0xc9974f, category: "trade", rarity: "rare", maxStacks: 3, effect: "bounty", apply: stack("bounty") },
  { id: "jade-ledger", name: "玉印账册", icon: "ph-book-open", text: "商栈订单有概率双倍", color: 0x4b9a76, category: "trade", rarity: "legendary", maxStacks: 1, effect: "double-trade", requiresBuilding: "market", apply: stack("double-trade") },
  { id: "artisan-wheel", name: "匠轮", icon: "ph-gear", text: "工坊轮换产量 +1", color: 0x8b735e, category: "production", rarity: "common", maxStacks: 5, effect: "workshop", requiresBuilding: "workshop", apply: stack("workshop") },
  { id: "star-gear", name: "星砂齿轮", icon: "ph-gear-fine", text: "机巧产量翻倍", color: 0x8b72a4, category: "production", rarity: "rare", maxStacks: 3, effect: "gear", requiresBuilding: "workshop", apply: stack("gear") },
  { id: "oasis-cistern", name: "绿洲水契", icon: "ph-drop", text: "生产建筑受损时仍保留半数产量", color: 0x4b8d92, category: "production", rarity: "legendary", maxStacks: 1, effect: "resilient", requiresBuilding: "workshop", apply: stack("resilient") },
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
  { id: "repair-manual", name: "营造残卷", icon: "ph-hammer", text: "每夜结束修复城门 25 点", color: 0x9e8a64, category: "defense", rarity: "rare", maxStacks: 3, effect: "repair", apply: stack("repair") },
  { id: "iron-hinges", name: "玄铁门轴", icon: "ph-shield-chevron", text: "城门受伤降低 12%", color: 0x66747b, category: "defense", rarity: "legendary", maxStacks: 1, effect: "gate-armor", apply: stack("gate-armor") },
  { id: "repeating-bow", name: "连弩机括", icon: "ph-crosshair", text: "防御伤害 +15%", color: 0x4e9186, category: "weapon", rarity: "common", maxStacks: 5, effect: "damage", apply: stack("damage") },
  { id: "fire-clay", name: "火油陶胆", icon: "ph-fire", text: "火油塔减速延长 0.4 秒", color: 0xc76a3f, category: "weapon", rarity: "rare", maxStacks: 3, effect: "fire", requiresBuilding: "fire", apply: stack("fire") },
  { id: "piercing-winch", name: "破甲绞盘", icon: "ph-bow-arrow", text: "床弩对盾卫和攻城兽伤害 +35%", color: 0x8b5f42, category: "weapon", rarity: "legendary", maxStacks: 1, effect: "pierce", requiresBuilding: "ballista", apply: stack("pierce") },
  { id: "wind-boots", name: "逐风靴", icon: "ph-sneaker-move", text: "移动速度 +10%", color: 0x738da3, category: "exploration", rarity: "common", maxStacks: 5, effect: "speed", apply: stack("speed") },
  { id: "survey-map", name: "商路测绘图", icon: "ph-map-trifold", text: "城外采集量 +20%", color: 0x789064, category: "exploration", rarity: "rare", maxStacks: 3, effect: "gather", apply: stack("gather") },
  { id: "moon-compass", name: "月影罗盘", icon: "ph-compass", text: "号角提前 3 秒响起", color: 0x627c9a, category: "exploration", rarity: "legendary", maxStacks: 1, effect: "warning", apply: stack("warning") },
  { id: "traveler-charm", name: "行者护符", icon: "ph-hand-eye", text: "行者生命上限 +25", color: 0x9f7652, category: "survival", rarity: "common", maxStacks: 5, effect: "health", apply: (state) => { state.relics.push("health"); state.player.maxHp += 25; state.player.hp += 25; } },
  { id: "battle-ration", name: "胡饼军粮", icon: "ph-bowl-food", text: "每夜结束恢复行者 35 生命", color: 0xba7d4c, category: "survival", rarity: "rare", maxStacks: 3, effect: "ration", apply: stack("ration") },
  { id: "phoenix-knot", name: "回生结", icon: "ph-heart", text: "主帐每夜恢复 18 耐久", color: 0xa65d56, category: "survival", rarity: "legendary", maxStacks: 1, effect: "core-repair", apply: stack("core-repair") },
  { id: "range-pins", name: "测距铜钉", icon: "ph-ruler", text: "全部防御射程 +6%", color: 0x73928c, category: "weapon", rarity: "common", maxStacks: 4, effect: "range", apply: stack("range") },
  { id: "camel-winch", name: "驼力绞盘", icon: "ph-arrows-clockwise", text: "防御装填速度 +8%", color: 0xa7794e, category: "weapon", rarity: "common", maxStacks: 4, effect: "rapid", apply: stack("rapid") },
  { id: "salvager-hook", name: "拾荒铁钩", icon: "ph-hook", text: "击败精锐额外获得材料", color: 0x78827c, category: "production", rarity: "rare", maxStacks: 3, effect: "salvage", apply: stack("salvage") },
  { id: "timber-mark", name: "河西木印", icon: "ph-tree-evergreen", text: "工坊产出木材时额外 +1", color: 0x6f8b5d, category: "production", rarity: "common", maxStacks: 3, effect: "wood-yield", requiresBuilding: "workshop", apply: stack("wood-yield") },
  { id: "quarry-chisel", name: "赤岩石凿", icon: "ph-hammer", text: "工坊产出石料时额外 +1", color: 0x9a6f59, category: "production", rarity: "common", maxStacks: 3, effect: "stone-yield", requiresBuilding: "workshop", apply: stack("stone-yield") },
  { id: "clockwork-oil", name: "机关润油", icon: "ph-drop-half", text: "工坊产出机巧时额外 +1", color: 0x857a9d, category: "production", rarity: "common", maxStacks: 3, effect: "gear-yield", requiresBuilding: "workshop", apply: stack("gear-yield") },
  { id: "field-kitchen", name: "行军炊具", icon: "ph-cooking-pot", text: "白天开始恢复行者 18 生命", color: 0xa8764e, category: "survival", rarity: "common", maxStacks: 3, effect: "day-heal", apply: stack("day-heal") },
  { id: "gate-braces", name: "斜撑门梁", icon: "ph-door", text: "城门受击伤害再降低 5%", color: 0x7f715e, category: "defense", rarity: "common", maxStacks: 4, effect: "gate-brace", apply: stack("gate-brace") },
  { id: "repair-tokens", name: "匠作凭券", icon: "ph-ticket", text: "维修费用 -8%", color: 0xc19956, category: "defense", rarity: "rare", maxStacks: 3, effect: "repair-save", apply: stack("repair-save") },
  { id: "barricade-chain", name: "拒马锁链", icon: "ph-link", text: "拒马耐久与接触伤害 +15%", color: 0x766652, category: "defense", rarity: "rare", maxStacks: 3, effect: "fortify", apply: stack("fortify") },
  { id: "pitch-pots", name: "连环油罐", icon: "ph-fire-simple", text: "火油命中会灼伤附近敌人", color: 0xb95f3e, category: "weapon", rarity: "legendary", maxStacks: 1, effect: "fire-spread", requiresBuilding: "fire", apply: stack("fire-spread") },
  { id: "hawk-sight", name: "鹰目照准", icon: "ph-eye", text: "防空弩对飞行机关伤害 +30%", color: 0x668b99, category: "weapon", rarity: "rare", maxStacks: 3, effect: "air-damage", requiresBuilding: "antiair", apply: stack("air-damage") },
  { id: "counterweight", name: "青铜配重", icon: "ph-scales", text: "投石机爆炸范围 +12%", color: 0x917b62, category: "weapon", rarity: "rare", maxStacks: 3, effect: "blast", requiresBuilding: "trebuchet", apply: stack("blast") },
  { id: "escort-pennant", name: "护商令旗", icon: "ph-flag-banner", text: "城外事件奖励 +20%", color: 0xb45343, category: "exploration", rarity: "common", maxStacks: 4, effect: "event-yield", apply: stack("event-yield") },
  { id: "route-cache", name: "暗记补给图", icon: "ph-map-pin", text: "每天额外出现一处近路补给", color: 0x778c66, category: "exploration", rarity: "rare", maxStacks: 2, effect: "field-cache", apply: stack("field-cache") },
  { id: "veteran-grip", name: "百战刀柄", icon: "ph-sword", text: "行者攻击伤害 +20%", color: 0x8e5c45, category: "survival", rarity: "common", maxStacks: 4, effect: "player-damage", apply: stack("player-damage") },
  { id: "last-lantern", name: "不灭孤灯", icon: "ph-lamp-pendant", text: "主帐低于 35% 时防御伤害 +25%", color: 0xd29d4c, category: "survival", rarity: "legendary", maxStacks: 1, effect: "last-stand", apply: stack("last-stand") },
  { id: "merchant-network", name: "四方商讯网", icon: "ph-globe-hemisphere-east", text: "每轮生产额外 +1 钱币", color: 0x4c9680, category: "trade", rarity: "legendary", maxStacks: 1, effect: "network", apply: stack("network") },
  { id: "supply-coin", name: "商会现银", icon: "ph-coins", text: "立即获得 28 钱币", color: 0xd0a24f, category: "trade", rarity: "common", maxStacks: 99, effect: "supply", apply: (state) => { state.resources.coin += 28; } },
  { id: "supply-material", name: "营造车队", icon: "ph-truck-trailer", text: "立即获得 12 木材、9 石料", color: 0x8c795d, category: "production", rarity: "common", maxStacks: 99, effect: "supply", apply: (state) => { state.resources.wood += 12; state.resources.stone += 9; } },
  { id: "supply-gear", name: "机关匣运", icon: "ph-package", text: "立即获得 9 机巧、8 钱币", color: 0x778fa1, category: "production", rarity: "common", maxStacks: 99, effect: "supply", apply: (state) => { state.resources.gear += 9; state.resources.coin += 8; } },
  { id: "supply-repair", name: "紧急工匠队", icon: "ph-hard-hat", text: "修复城门 18%、主帐 10%", color: 0x9b7651, category: "defense", rarity: "common", maxStacks: 99, effect: "supply", apply: (state) => { state.gateHp = Math.min(state.gateMaxHp, state.gateHp + state.gateMaxHp * 0.18); state.coreHp = Math.min(state.coreMaxHp, state.coreHp + state.coreMaxHp * 0.1); } },
  { id: "supply-rations", name: "边军粮秣", icon: "ph-bowl-steam", text: "恢复行者全部生命并获得 10 钱币", color: 0xa66f48, category: "survival", rarity: "common", maxStacks: 99, effect: "supply", apply: (state) => { state.player.hp = state.player.maxHp; state.resources.coin += 10; } },
  { id: "supply-mixed", name: "驼队杂货", icon: "ph-package", text: "获得少量全部资源", color: 0x779377, category: "production", rarity: "common", maxStacks: 99, effect: "supply", tags: ["supply"], apply: (state) => { state.resources.coin += 14; state.resources.wood += 6; state.resources.stone += 5; state.resources.gear += 4; } },
  { id: "frontier-deed", name: "边地商契", icon: "ph-handshake", text: "商栈产量 +1，事件奖励 +8%", color: 0xb88d4b, category: "trade", rarity: "common", maxStacks: 5, effect: "trade", tags: ["market", "event"], requiresBuilding: "market", apply: stack("trade") },
  { id: "weighted-scales", name: "胡商铜秤", icon: "ph-scales", text: "车队站订单暴击率提高", color: 0xc19b55, category: "trade", rarity: "rare", maxStacks: 3, effect: "double-trade", tags: ["market", "caravan"], requiresBuilding: "market", apply: stack("double-trade") },
  { id: "sealed-coffer", name: "封印钱匣", icon: "ph-treasure-chest", text: "立即获得 42 钱币", color: 0xc69b4f, category: "trade", rarity: "rare", maxStacks: 99, effect: "supply", tags: ["supply"], apply: (state) => { state.resources.coin += 42; } },
  { id: "sawtooth-blade", name: "锯齿木轮", icon: "ph-gear", text: "伐木工坊额外产出 1 木材", color: 0x668356, category: "production", rarity: "rare", maxStacks: 3, effect: "wood-yield", tags: ["workshop", "wood"], requiresBuilding: "workshop", apply: stack("wood-yield") },
  { id: "mason-plumb", name: "石匠垂准", icon: "ph-ruler", text: "采石工坊额外产出 1 石料", color: 0x92715b, category: "production", rarity: "rare", maxStacks: 3, effect: "stone-yield", tags: ["workshop", "stone"], requiresBuilding: "workshop", apply: stack("stone-yield") },
  { id: "copper-spring", name: "回火铜簧", icon: "ph-gear-six", text: "机关作坊额外产出 1 机巧", color: 0x75889a, category: "production", rarity: "rare", maxStacks: 3, effect: "gear-yield", tags: ["workshop", "gear"], requiresBuilding: "workshop", apply: stack("gear-yield") },
  { id: "granite-keystone", name: "花岗拱心石", icon: "ph-archway", text: "城门上限 +90，升级成本 -5%", color: 0x8e745f, category: "defense", rarity: "rare", maxStacks: 3, effect: "gate", tags: ["gate"], apply: (state) => { state.relics.push("gate"); state.gateMaxHp += 90; state.gateHp += 90; } },
  { id: "watch-brazier", name: "门楼烽盆", icon: "ph-fire-simple", text: "城门低耐久时防御装填更快", color: 0xb66e42, category: "defense", rarity: "rare", maxStacks: 3, effect: "last-stand", tags: ["gate", "weapon"], apply: stack("last-stand") },
  { id: "field-sutures", name: "行军缝革", icon: "ph-first-aid", text: "守夜结束恢复行者 20 生命", color: 0x9d7657, category: "survival", rarity: "common", maxStacks: 5, effect: "ration", tags: ["hero"], apply: stack("ration") },
  { id: "lamellar-plate", name: "札甲内衬", icon: "ph-shield", text: "行者受到的伤害降低 10%", color: 0x66737a, category: "survival", rarity: "rare", maxStacks: 3, effect: "hero-armor", tags: ["hero"], apply: stack("hero-armor") },
  { id: "horn-bow-limbs", name: "角弓弩臂", icon: "ph-bow-arrow", text: "床弩射程 +8%，伤害 +8%", color: 0x8d6548, category: "weapon", rarity: "rare", maxStacks: 3, effect: "range", tags: ["ballista", "range"], requiresBuilding: "ballista", apply: (state) => { state.relics.push("range", "damage"); } },
  { id: "barbed-bolts", name: "倒刺重矢", icon: "ph-crosshair", text: "床弩命中远程敌人时伤害 +30%", color: 0x85604d, category: "weapon", rarity: "rare", maxStacks: 3, effect: "anti-ranged", tags: ["ballista", "archer"], requiresBuilding: "ballista", apply: stack("anti-ranged") },
  { id: "naptha-recipe", name: "石火油方", icon: "ph-flask", text: "火油灼烧伤害提高 25%", color: 0xb85f3f, category: "weapon", rarity: "rare", maxStacks: 3, effect: "fire-damage", tags: ["fire"], requiresBuilding: "fire", apply: stack("fire-damage") },
  { id: "sky-whistle", name: "猎空鸣镝", icon: "ph-airplane-tilt", text: "防空弩首次命中造成双倍伤害", color: 0x5f8995, category: "weapon", rarity: "legendary", maxStacks: 1, effect: "air-damage", tags: ["antiair", "flyer"], requiresBuilding: "antiair", apply: stack("air-damage") },
  { id: "engineer-scope", name: "机关测远镜", icon: "ph-binoculars", text: "投石机最远射程 +8", color: 0x718a86, category: "weapon", rarity: "rare", maxStacks: 2, effect: "range", tags: ["trebuchet", "range"], requiresBuilding: "trebuchet", apply: stack("range") },
  { id: "shrapnel-pot", name: "碎铁震石", icon: "ph-bomb", text: "投石机爆炸伤害 +20%", color: 0x8d745d, category: "weapon", rarity: "legendary", maxStacks: 1, effect: "blast", tags: ["trebuchet", "area"], requiresBuilding: "trebuchet", apply: stack("blast") },
  { id: "hidden-well", name: "暗渠水井", icon: "ph-drop", text: "每个白天额外恢复主帐 4%", color: 0x4f8790, category: "survival", rarity: "rare", maxStacks: 3, effect: "core-repair", tags: ["core"], apply: stack("core-repair") },
  { id: "wayfarer-code", name: "行者路引", icon: "ph-signpost", text: "城外事件奖励 +15%", color: 0x718a64, category: "exploration", rarity: "rare", maxStacks: 3, effect: "event-yield", tags: ["event"], apply: stack("event-yield") },
  { id: "swift-pick", name: "轻柄矿镐", icon: "ph-pickaxe", text: "采集交互更快，采集量 +15%", color: 0x8d765e, category: "exploration", rarity: "common", maxStacks: 4, effect: "gather", tags: ["gather"], apply: stack("gather") },
  { id: "boss-standard", name: "破阵牙旗", icon: "ph-flag-banner", text: "对首领伤害 +18%", color: 0xa34f42, category: "weapon", rarity: "legendary", maxStacks: 1, effect: "boss-damage", tags: ["boss", "weapon"], apply: stack("boss-damage") },
  { id: "victory-chest", name: "统领战匣", icon: "ph-package", text: "获得 30 钱币与 10 机巧", color: 0xb89450, category: "production", rarity: "rare", maxStacks: 99, effect: "supply", tags: ["boss", "supply"], apply: (state) => { state.resources.coin += 30; state.resources.gear += 10; } }
];

export const nightModifiers: NightModifier[] = [
  { id: "sandstorm", name: "沙暴将至", icon: "ph-wind", enemySpeed: 0.92, enemyDamage: 1, loot: 1.25, production: 1, description: "敌军 -8% 速度，战利品 +25%" },
  { id: "elite-guard", name: "重甲先遣", icon: "ph-shield-star", enemySpeed: 1, enemyDamage: 1.16, loot: 1.35, production: 1, description: "敌军 +16% 伤害，战利品 +35%" },
  { id: "flying-raid", name: "飞袭警报", icon: "ph-bird", enemySpeed: 1.08, enemyDamage: 1, loot: 1.2, production: 1, description: "飞行机关增援，战利品 +20%" },
  { id: "looter-call", name: "游弓增援", icon: "ph-bow-arrow", enemySpeed: 1.12, enemyDamage: 0.94, loot: 1.3, production: 1, description: "远程敌军增援，战利品 +30%" },
  { id: "repair-fair", name: "工匠夜市", icon: "ph-hammer", enemySpeed: 1, enemyDamage: 1, loot: 1, production: 1, repairDiscount: 0.35, description: "本日全部维修费用 -35%" },
  { id: "harvest", name: "商路丰收", icon: "ph-wheat", enemySpeed: 1.05, enemyDamage: 1.05, loot: 1.2, production: 1.3, description: "生产 +30%，敌军 +5% 速度与伤害" }
];

/**
 * 夜间规则必须与该关真正会出现的机制一致。新手夜不会生成飞行或远程增援，
 * 因此也不能提前显示对应警报，让玩家误以为床弩漏掉了敌人。
 */
export const nightModifiersForEpoch = (epoch: number): NightModifier[] => nightModifiers.filter((modifier) => {
  if (modifier.id === "flying-raid") return epoch >= 4;
  if (modifier.id === "looter-call" || modifier.id === "elite-guard") return epoch >= 3;
  return true;
});

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
    version: 7,
    renown: 0,
    records: { expedition: 0, survival: 0, training: 0 },
    prosperityRecords: { expedition: 0, survival: 0 },
    bossRecords: { expedition: 0, survival: 0 },
    eventRecords: { expedition: 0, survival: 0 },
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
    version: 7,
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
    nightModifier: streams.pick("event", nightModifiersForEpoch(1)),
    fieldObjective: null,
    scoutIntel: 0,
    reinforcementNights: 0,
    touch: { mode: "idle", pointerId: null },
    terrainVariant: Math.floor(streams.next("world") * 4),
    expansionLevel: 0,
    regionModule: null,
    readinessPressure: 0,
    bossKind: null,
    bossKills: 0,
    eventsCompleted: 0,
    rarePity: 0,
    qualityTier: "auto",
    assetVersion: ASSET_VERSION,
    weatherPhase: streams.next("region") * Math.PI * 2,
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
  const modeMultiplier = context.mode === "survival" ? 1.23 + Math.min(0.22, context.epoch * 0.008) : 1;
  const phasePressure = context.epoch <= 3 ? 0.84 : context.epoch <= 8 ? 1 : context.epoch <= 20 ? 1.1 : 1.22;
  const budget = (4.2 + context.epoch * 2.25 + Math.pow(context.epoch, 1.22) * 0.34 + context.prosperity * 0.24 + context.defensePower * 0.075) * modeMultiplier * phasePressure;
  const pool = region.threat.filter((type) => enemies[type].unlockEpoch <= context.epoch);
  const universal = (Object.keys(enemies) as EnemyType[]).filter((type) => enemies[type].unlockEpoch <= context.epoch);
  const choices = [...new Set([...pool, ...universal])];
  const costs: Record<EnemyType, number> = { raider: 1, shield: 2.5, sapper: 2.3, looter: 1.8, archer: 2.1, flyer: 2.8, ram: 5.5 };
  const wave: EnemyType[] = [];
  let spent = 0;
  const cap = Math.min(56, 14 + context.epoch * 2);
  while (spent < budget && wave.length < cap) {
    const affordable = choices.filter((type) => costs[type] <= Math.max(1, budget - spent + 0.7));
    const type = streams.pick<EnemyType>("combat", affordable.length ? affordable : ["raider"]);
    wave.push(type);
    spent += costs[type];
  }
  if (context.epoch >= 3 && !wave.includes("sapper")) wave.push("sapper");
  if (context.epoch >= 4 && !wave.includes("archer")) wave.push("archer");
  if (context.epoch >= 4 && !wave.includes("flyer") && streams.next("combat") > 0.45) wave.push("flyer");
  if (context.epoch >= 5 && context.gateLevel >= 2 && !wave.includes("ram")) wave.push("ram");
  return streams.shuffle("combat", wave);
}

const bosses: BossKind[] = ["shield-commander", "sapper-captain", "kite-swarm", "siege-beast"];

export function bossForNight(epoch: number, region: RegionDefinition): BossKind | null {
  if (epoch < 5 || epoch % 5 !== 0) return null;
  const regionalOffset = regions.findIndex((entry) => entry.id === region.id);
  return bosses[(Math.floor(epoch / 5) - 1 + Math.max(0, regionalOffset)) % bosses.length]!;
}

export function bossEnemyType(kind: BossKind): EnemyType {
  return kind === "shield-commander" ? "shield"
    : kind === "sapper-captain" ? "sapper"
      : kind === "kite-swarm" ? "flyer"
        : "ram";
}

/** 无上限生命曲线。前 3 夜保留教学余量，第 9 夜起迫使玩家依靠克制、布局与操作。 */
export function enemyHealthScale(epoch: number, mode: GameMode): number {
  const night = Math.max(1, epoch);
  const base = 1 + 0.11 * (night - 1) + 0.015 * Math.pow(night - 1, 1.55);
  return base * (mode === "survival" ? 1.08 + Math.min(0.18, night * 0.004) : 1);
}

export function regionById(id: string): RegionDefinition {
  return regions.find((region) => region.id === id) ?? regions[0]!;
}

export function modeName(mode: GameMode): string {
  return mode === "expedition" ? "无尽远征" : mode === "survival" ? "极限守城" : "行者历练";
}
