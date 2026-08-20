import type {
  DoctrineDefinition,
  GuardNodeDefinition,
  SquadDefinition,
  SquadSpecialization,
  SquadState,
  SquadType,
  SurvivalState
} from "./types";

const allSquads: SquadType[] = ["shield", "spear", "archer", "engineer"];

export const squadDefinitions: Record<SquadType, SquadDefinition> = {
  shield: {
    type: "shield", name: "刀盾营", icon: "ph-shield", role: "前排阻挡",
    description: "结阵保护后排，克制沙匪与游弓手", unlockEpoch: 1,
    maxMemberHp: 92, damage: 13, range: 2.2, cooldown: 0.92, moveSpeed: 4.1,
    trainingTime: 8, population: 4, cost: { food: 8, coin: 6, wood: 3 },
    specializations: ["iron-wall", "counterattack"]
  },
  spear: {
    type: "spear", name: "长枪营", icon: "ph-sword", role: "拒止冲锋",
    description: "对攻城兽和爆破手造成额外伤害", unlockEpoch: 3,
    maxMemberHp: 76, damage: 17, range: 3.1, cooldown: 1.02, moveSpeed: 4.25,
    trainingTime: 10, population: 4, cost: { food: 9, coin: 6, wood: 3 },
    specializations: ["brace", "sweep"]
  },
  archer: {
    type: "archer", name: "弓弩营", icon: "ph-crosshair", role: "远程齐射",
    description: "远程压制无盾单位并拦截飞行机关", unlockEpoch: 2,
    maxMemberHp: 58, damage: 14, range: 15.5, cooldown: 1.18, moveSpeed: 4.35,
    trainingTime: 10, population: 4, cost: { food: 8, coin: 8, wood: 4 },
    specializations: ["piercing-volley", "fire-volley"]
  },
  engineer: {
    type: "engineer", name: "机关兵", icon: "ph-gear-six", role: "维修反机械",
    description: "修缮设施、布置机关并克制飞行单位", unlockEpoch: 5,
    maxMemberHp: 64, damage: 12, range: 10.5, cooldown: 1.28, moveSpeed: 4,
    trainingTime: 12, population: 4, cost: { food: 7, coin: 8, gear: 2 },
    specializations: ["field-repair", "anti-air"]
  }
};

export const squadSpecializationNames: Record<SquadSpecialization, string> = {
  "iron-wall": "铁壁阵", counterattack: "反击阵", brace: "拒马枪阵", sweep: "横扫枪阵",
  "piercing-volley": "破甲弩", "fire-volley": "火箭齐射",
  "field-repair": "战地修缮", "anti-air": "防空机关"
};

export const survivalGuardNodes: GuardNodeDefinition[] = [
  { id: "outer-west", kind: "outer", position: { x: -7.2, z: -18.4 }, rotation: Math.PI, capacity: 1, allowed: ["shield", "spear"], lane: -1 },
  { id: "outer-center", kind: "outer", position: { x: 0, z: -20.2 }, rotation: Math.PI, capacity: 1, allowed: ["shield", "spear"], lane: 0 },
  { id: "outer-east", kind: "outer", position: { x: 7.2, z: -18.4 }, rotation: Math.PI, capacity: 1, allowed: ["shield", "spear"], lane: 1 },
  { id: "flank-west", kind: "flank", position: { x: -15.6, z: -7.2 }, rotation: Math.PI, capacity: 1, allowed: allSquads, lane: -1 },
  { id: "flank-east", kind: "flank", position: { x: 15.6, z: -7.2 }, rotation: Math.PI, capacity: 1, allowed: allSquads, lane: 1 },
  { id: "inner-gate", kind: "inner", position: { x: 0, z: -7.2 }, rotation: Math.PI, capacity: 2, allowed: allSquads, lane: 0 },
  { id: "courtyard-west", kind: "courtyard", position: { x: -8.2, z: 2.4 }, rotation: Math.PI, capacity: 1, allowed: allSquads, lane: -1 },
  { id: "courtyard-east", kind: "courtyard", position: { x: 8.2, z: 2.4 }, rotation: Math.PI, capacity: 1, allowed: allSquads, lane: 1 },
  { id: "core-guard", kind: "core", position: { x: 0, z: 8.2 }, rotation: Math.PI, capacity: 2, allowed: allSquads, lane: null },
  { id: "wall-west", kind: "wall", position: { x: -10.8, z: -5.6 }, rotation: Math.PI, capacity: 1, allowed: ["archer", "engineer"], lane: -1 },
  { id: "wall-east", kind: "wall", position: { x: 10.8, z: -5.6 }, rotation: Math.PI, capacity: 1, allowed: ["archer", "engineer"], lane: 1 }
];

const common = (id: string, name: string, icon: string, text: string, effect: string, squadType?: SquadType): DoctrineDefinition =>
  ({ id, name, icon, text, effect, squadType, rarity: "common", maxStacks: 5 });
const rare = (id: string, name: string, icon: string, text: string, effect: string, squadType?: SquadType): DoctrineDefinition =>
  ({ id, name, icon, text, effect, squadType, rarity: "rare", maxStacks: 3 });
const legendary = (id: string, name: string, icon: string, text: string, effect: string, squadType?: SquadType): DoctrineDefinition =>
  ({ id, name, icon, text, effect, squadType, rarity: "legendary", maxStacks: 1 });

export const doctrines: DoctrineDefinition[] = [
  common("shield-drill", "持盾操典", "ph-shield", "刀盾营生命 +10%", "shield-hp", "shield"),
  common("shield-edge", "环首刀法", "ph-sword", "刀盾营伤害 +10%", "shield-damage", "shield"),
  rare("shield-formation", "连环盾阵", "ph-wall", "刀盾营阻挡时减伤 +12%", "shield-guard", "shield"),
  legendary("shield-banner", "玄甲军旗", "ph-flag-banner", "刀盾营低血量时获得护盾", "shield-laststand", "shield"),
  common("spear-drill", "长兵操典", "ph-sword", "长枪营伤害 +10%", "spear-damage", "spear"),
  common("spear-step", "进退枪步", "ph-person-simple-run", "长枪营移速 +8%", "spear-speed", "spear"),
  rare("spear-brace", "列阵拒敌", "ph-arrows-out-line-horizontal", "长枪营对大型敌人伤害 +25%", "spear-large", "spear"),
  legendary("spear-banner", "龙牙军旗", "ph-flag-banner", "长枪营首次接敌发动齐刺", "spear-charge", "spear"),
  common("archer-drill", "弩手操典", "ph-crosshair", "弓弩营伤害 +10%", "archer-damage", "archer"),
  common("archer-range", "校准望山", "ph-binoculars", "弓弩营射程 +8%", "archer-range", "archer"),
  rare("archer-volley", "三段齐射", "ph-arrows-out", "弓弩营射速 +12%", "archer-rate", "archer"),
  legendary("archer-banner", "逐风军旗", "ph-flag-banner", "弓弩营每第五箭穿透目标", "archer-pierce", "archer"),
  common("engineer-drill", "机巧操典", "ph-gear-six", "机关兵伤害和维修 +10%", "engineer-power", "engineer"),
  common("engineer-range", "轻弩机括", "ph-crosshair", "机关兵射程 +8%", "engineer-range", "engineer"),
  rare("engineer-air", "缚鸢索", "ph-airplane-tilt", "机关兵对空伤害 +30%", "engineer-air", "engineer"),
  legendary("engineer-banner", "天工军旗", "ph-flag-banner", "每夜自动修复一处受损设施", "engineer-repair", "engineer"),
  common("ration-bag", "随军粮袋", "ph-bowl-food", "粮草上限 +12，立即获得 8 粮草", "food-cap"),
  common("field-cooking", "行军炊具", "ph-cooking-pot", "粮秣院产量 +1", "food-production"),
  common("veteran-pay", "犒军铜钱", "ph-coins", "操练费用降低 20%", "drill-cost"),
  common("medic-herbs", "西域药草", "ph-first-aid", "伤员恢复速度 +15%", "healing"),
  common("gate-duty", "轮值守门", "ph-door", "驻守门内的小队减伤 +8%", "inner-guard"),
  common("night-watch", "夜巡灯令", "ph-lamp", "全军夜间视野与射程 +5%", "night-range"),
  common("march-order", "轻装军令", "ph-boot", "驻军调度速度 +8%", "army-speed"),
  common("salvage-order", "战后检料", "ph-package", "战斗掉落材料 +12%", "loot"),
  rare("surgeon-kit", "军医皮囊", "ph-first-aid-kit", "战后伤员比例 +10%", "wounded-save"),
  rare("reserve-ranks", "预备队册", "ph-users-three", "人口上限 +4", "population"),
  rare("commander-horn", "铜角号令", "ph-bell-ringing", "将领号令持续时间 +40%", "commander"),
  rare("fortified-rations", "压缩军粮", "ph-bowl-steam", "每夜粮草消耗降低 20%", "upkeep"),
  rare("field-scouts", "斥候军报", "ph-compass", "派遣风险降低 20%", "dispatch-risk"),
  rare("caravan-levy", "商队募捐", "ph-storefront", "每夜获得 4 钱币和 2 粮草", "night-income"),
  rare("wall-drill", "城头轮训", "ph-castle-turret", "城墙节点远程小队伤害 +18%", "wall-power"),
  rare("mutual-support", "左右援护", "ph-arrows-left-right", "相邻驻军受到伤害降低 10%", "support"),
  legendary("silk-road-standard", "丝路大纛", "ph-flag", "全军等级效果 +1 阶", "army-level"),
  legendary("undying-watch", "不眠守军", "ph-moon-stars", "每夜首次阵亡改为重伤", "death-save"),
  legendary("golden-supply", "金印军契", "ph-seal-check", "补给选择额外获得一项较低收益", "double-supply"),
  legendary("last-reserve", "最后预备队", "ph-shield-star", "城门首次破损至 25% 时召回全部派遣队", "reserve"),
  common("supply-food", "粮车抵达", "ph-bowl-food", "立即获得 18 粮草", "supply-food"),
  common("supply-heal", "军医增援", "ph-first-aid", "立即治疗最多 4 名伤员", "supply-heal"),
  common("supply-arms", "军械补给", "ph-hammer", "获得木材、石料和机巧", "supply-arms"),
  common("supply-repair", "城防修缮", "ph-wrench", "修复城门和受损建筑", "supply-repair")
];

export function createSurvivalState(): SurvivalState {
  return {
    food: 20, foodCap: 48, populationCap: 12, squads: [], trainingQueue: [], dispatch: null,
    doctrineStacks: [], recentDoctrineChoices: [], pendingDoctrineChoices: [], selectedSquadId: null,
    commanderCooldown: 0, commanderAuraUntil: 0, tutorialStep: 0, casualties: 0, woundedRecovered: 0
  };
}

export function squadPopulation(state: SurvivalState): number {
  return state.squads.reduce((sum, squad) => sum + (squad.dispatched ? squadDefinitions[squad.type].population : squadDefinitions[squad.type].population), 0)
    + state.trainingQueue.reduce((sum, entry) => sum + squadDefinitions[entry.squadType].population, 0);
}

export function squadLivingMembers(squad: SquadState): number {
  return squad.memberHp.filter((hp) => hp > 0).length;
}

export function doctrineStacks(state: SurvivalState, effect: string): number {
  return state.doctrineStacks.reduce((sum, stack) => {
    const definition = doctrines.find((entry) => entry.id === stack.id);
    return definition?.effect === effect ? sum + stack.stacks : sum;
  }, 0);
}
