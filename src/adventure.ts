import type {
  AdventureBossDefinition,
  AdventureEquipmentDefinition,
  AdventureHeroDefinition,
  AdventureRouteNode,
  AdventureSkillDefinition,
  AdventureState,
  HeroClass
} from "./types";

export const adventureHeroes: Record<HeroClass, AdventureHeroDefinition> = {
  guardian: {
    id: "guardian", name: "盾刀守卫", role: "格挡与近战反击", weapon: "环首刀与漆盾",
    maxHp: 126, attack: 38, attackRange: 3.8, moveSpeed: 6.7, dodgeCooldown: 2.8,
    skillName: "镇关", skillDescription: "架盾吸收正面伤害，结束时击退近敌", startingEquipment: "guard-starter-blade"
  },
  ranger: {
    id: "ranger", name: "弩手行者", role: "走位与弱点连射", weapon: "折臂轻弩",
    maxHp: 92, attack: 31, attackRange: 11.5, moveSpeed: 8.4, dodgeCooldown: 1.7,
    skillName: "逐风连弩", skillDescription: "翻滚后对标记目标进行三次快速射击", startingEquipment: "ranger-starter-crossbow"
  },
  artificer: {
    id: "artificer", name: "机关术士", role: "陷阱与范围控制", weapon: "星砂机括",
    maxHp: 104, attack: 27, attackRange: 6.2, moveSpeed: 7.2, dodgeCooldown: 2.2,
    skillName: "缚沙机关", skillDescription: "部署持续减速并周期伤害的机关阵", startingEquipment: "artificer-starter-rig"
  }
};

const equipment = (
  id: string, name: string, slot: AdventureEquipmentDefinition["slot"], rarity: AdventureEquipmentDefinition["rarity"],
  tags: string[], effect: string, hero?: HeroClass
): AdventureEquipmentDefinition => ({ id, name, slot, rarity, tags, effect, hero });

export const adventureEquipment: AdventureEquipmentDefinition[] = [
  equipment("guard-starter-blade", "驿卒环首刀", "weapon", "common", ["melee", "guard"], "格挡后下一击伤害提高", "guardian"),
  equipment("ranger-starter-crossbow", "商队折臂弩", "weapon", "common", ["ranged", "mobile"], "连续命中提高装填速度", "ranger"),
  equipment("artificer-starter-rig", "铜簧机括", "module", "common", ["mechanism", "control"], "机关持续时间提高", "artificer"),
  equipment("meteor-iron-sabre", "陨铁横刀", "weapon", "rare", ["melee", "armor-break"], "重击削减敌人护甲", "guardian"),
  equipment("camel-bone-bow", "驼骨劲弩", "weapon", "rare", ["ranged", "critical"], "远距离弱点伤害提高", "ranger"),
  equipment("star-sand-array", "星砂阵匣", "module", "rare", ["mechanism", "area"], "可同时维持两个轻型机关", "artificer"),
  equipment("lamellar-coat", "锁子札甲", "armor", "common", ["defense"], "受到的首次伤害降低"),
  equipment("sogdian-riding-coat", "粟特骑装", "armor", "common", ["mobile"], "移动速度与转向速度提高"),
  equipment("mist-harbor-cloak", "雾港披风", "armor", "rare", ["evasion", "mist"], "闪避后短暂隐匿"),
  equipment("red-canyon-plate", "赤岩胸甲", "armor", "rare", ["defense", "stone"], "受击累积硬直抗性"),
  equipment("oasis-seal", "绿洲商印", "trinket", "common", ["trade"], "商人价格降低"),
  equipment("caravan-compass", "鎏金罗盘", "trinket", "rare", ["route", "event"], "额外显示下一层一个节点"),
  equipment("watch-bell", "更鼓铜铃", "trinket", "common", ["survival"], "低生命时提高移速"),
  equipment("jade-thumb-ring", "青玉扳指", "trinket", "rare", ["ranged", "critical"], "蓄力射击暴击率提高"),
  equipment("wind-wheel", "逐风轮", "module", "common", ["mobile", "mechanism"], "技能冷却缩短"),
  equipment("repair-spider", "修缮蛛", "module", "rare", ["healing", "mechanism"], "战斗结束回复少量生命"),
  equipment("black-iron-buckler", "乌铁臂盾", "weapon", "rare", ["guard", "counter"], "完美格挡触发环形反击", "guardian"),
  equipment("falcon-eye-sight", "鹰眼望山", "module", "rare", ["ranged", "weakpoint"], "标记精英弱点", "ranger"),
  equipment("oil-flame-pot", "火油机关罐", "module", "rare", ["fire", "area"], "控制机关可被点燃", "artificer"),
  equipment("silk-road-standard", "丝路小纛", "trinket", "legendary", ["resolve", "boss"], "每场首领战首次倒地保留 1 点生命"),
  equipment("heavenly-horse-barding", "天马护心镜", "armor", "legendary", ["mobile", "defense"], "高速移动时获得减伤"),
  equipment("seven-star-crossbow", "七星连弩", "weapon", "legendary", ["ranged", "combo"], "第五次命中追加穿透弩矢", "ranger"),
  equipment("tiger-gate-sabre", "虎关重刃", "weapon", "legendary", ["melee", "stagger"], "反击可打断首领蓄力", "guardian"),
  equipment("celestial-armillary", "浑天机轮", "module", "legendary", ["mechanism", "boss"], "机关随首领阶段自动改变克制属性", "artificer")
];

const skill = (id: string, name: string, hero: HeroClass, rarity: AdventureSkillDefinition["rarity"], maxStacks: number, tags: string[], effect: string): AdventureSkillDefinition =>
  ({ id, name, hero, rarity, maxStacks, tags, effect });

export const adventureSkills: AdventureSkillDefinition[] = [
  skill("guard-perfect", "铜墙一瞬", "guardian", "common", 3, ["guard"], "完美格挡判定窗口扩大"),
  skill("guard-riposte", "回锋", "guardian", "common", 5, ["counter"], "反击伤害提高"),
  skill("guard-taunt", "喝阵", "guardian", "rare", 2, ["control"], "镇关结束嘲讽并削弱敌人"),
  skill("guard-banner", "关城不退", "guardian", "legendary", 1, ["survival"], "低生命时镇关不消耗体力"),
  skill("ranger-reload", "行弩熟练", "ranger", "common", 5, ["ranged"], "装填时间缩短"),
  skill("ranger-roll", "踏沙", "ranger", "common", 3, ["mobile"], "翻滚后移速提高"),
  skill("ranger-mark", "望山标记", "ranger", "rare", 3, ["weakpoint"], "弱点标记持续更久"),
  skill("ranger-storm", "逐风七发", "ranger", "legendary", 1, ["combo"], "连弩最后一发分裂"),
  skill("artificer-duration", "长簧", "artificer", "common", 5, ["mechanism"], "机关持续时间提高"),
  skill("artificer-slow", "缚沙", "artificer", "common", 3, ["control"], "机关减速提高"),
  skill("artificer-chain", "连锁机括", "artificer", "rare", 3, ["area"], "机关命中会传导"),
  skill("artificer-orbit", "浑天列阵", "artificer", "legendary", 1, ["boss"], "首领战开始自动部署一座机关"),
  skill("guard-vitality", "行者吐纳", "guardian", "common", 3, ["survival"], "最大生命提高"),
  skill("ranger-salvage", "箭矢回收", "ranger", "common", 3, ["economy"], "战斗后获得额外铜钱"),
  skill("artificer-repair", "自修机芯", "artificer", "common", 3, ["healing"], "战斗后回复生命"),
  skill("guard-shock", "震盾", "guardian", "rare", 2, ["stagger"], "格挡重击产生冲击波"),
  skill("ranger-pierce", "贯甲矢", "ranger", "rare", 3, ["armor-break"], "蓄力箭穿透盾牌"),
  skill("artificer-fire", "火簧", "artificer", "rare", 3, ["fire"], "机关周期点燃敌人")
];

export const adventureBosses: AdventureBossDefinition[] = [
  { id: "red-cliff-duelist", name: "赤崖监军", chapter: 1, phases: ["盾阵逼近", "弃盾狂攻"], counterTags: ["stagger", "armor-break"], rewardTag: "weapon" },
  { id: "mist-chain-captain", name: "雾港锁链师", chapter: 2, phases: ["雾中牵引", "航标雷火"], counterTags: ["mobile", "control"], rewardTag: "armor" },
  { id: "star-sand-colossus", name: "星砂机神", chapter: 3, phases: ["机关护环", "核心过载"], counterTags: ["weakpoint", "mechanism"], rewardTag: "module" }
];

function routeRandom(seed: string): () => number {
  let state = [...seed].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
}

export function createAdventureRoute(seed: string, chapter = 1): AdventureRouteNode[] {
  const random = routeRandom(`${seed}:chapter:${chapter}`);
  const route: AdventureRouteNode[] = [];
  for (let depth = 0; depth < 7; depth += 1) {
    const count = depth === 0 || depth === 6 ? 1 : depth === 3 ? 3 : 2;
    for (let lane = 0; lane < count; lane += 1) {
      const id = `c${chapter}-d${depth}-n${lane}`;
      const kind = depth === 0 ? "camp" : depth === 6 ? "boss" : depth === 3
        ? (["merchant", "event", "elite"] as const)[lane]!
        : random() < 0.2 ? "event" : random() < 0.28 ? "elite" : "battle";
      route.push({
        id, depth, kind,
        next: depth === 6 ? [] : Array.from({ length: depth === 2 ? 3 : depth === 3 ? 2 : depth === 5 ? 1 : 2 }, (_, index) => `c${chapter}-d${depth + 1}-n${index % (depth === 2 ? 3 : depth + 1 === 6 ? 1 : 2)}`),
        danger: Math.min(5, 1 + Math.floor(depth / 2) + (kind === "elite" || kind === "boss" ? 1 : 0)) as 1 | 2 | 3 | 4 | 5,
        rewardTags: kind === "merchant" ? ["equipment", "healing"] : kind === "event" ? ["story", "risk"] : kind === "elite" ? ["rare", "skill"] : kind === "boss" ? ["legendary", "chapter"] : ["equipment", "currency"]
      });
    }
  }
  return route;
}

export function createAdventureState(hero: HeroClass, seed: string): AdventureState {
  const definition = adventureHeroes[hero];
  const route = createAdventureRoute(seed, 1);
  return {
    hero, room: 1, maxRooms: 7, roomKind: "camp", level: 1, experience: 0, nextExperience: 18,
    attack: definition.attack, attackRange: definition.attackRange, moveSpeed: definition.moveSpeed,
    armor: hero === "guardian" ? 2 : 0, skillPower: 0, skillCooldown: 0,
    gear: [], choices: [], chapter: 1, routeNodeId: route[0]!.id, route,
    equipment: { [adventureEquipment.find((item) => item.id === definition.startingEquipment)!.slot]: definition.startingEquipment },
    skillStacks: [], currency: 0, healingCharges: 1, bossId: adventureBosses[0]!.id
  };
}
