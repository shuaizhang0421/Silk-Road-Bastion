import { bossForNight, buildings, createGame, directorWave, emptyMeta, enemies, enemyHealthScale, regionById, SeedStreams } from "../src/data";
import { doctrines, squadDefinitions } from "../src/survival";
import type { EnemyType, Resources, SquadType } from "../src/types";

type Policy = "novice" | "standard" | "optimized";
type SimSquad = { type: SquadType; members: number; wounded: number; level: number; xp: number };
type Outcome = {
  failedAt: number;
  foodLocks: number;
  populationPeak: number;
  woundedPeak: number;
  night17Seconds: number;
  night17GateLoss: number;
  bosses: number;
};

const policyRules = {
  novice: { dayCycles: 7, command: 0.82, repairAt: 0.48, healRate: 0.35, composition: ["shield", "archer", "shield"] as SquadType[] },
  standard: { dayCycles: 8, command: 1.04, repairAt: 0.68, healRate: 0.68, composition: ["shield", "archer", "spear", "engineer"] as SquadType[] },
  optimized: { dayCycles: 9, command: 1.2, repairAt: 0.78, healRate: 0.9, composition: ["shield", "archer", "spear", "engineer", "archer", "spear"] as SquadType[] }
} as const;

function makeRandom(seed: string): () => number {
  let state = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function waveThreat(wave: EnemyType[], night: number, boss: boolean): number {
  const scale = enemyHealthScale(night, "survival");
  return wave.reduce((sum, type, index) => {
    const definition = enemies[type];
    const tactical = type === "shield" ? 1.18 : type === "sapper" ? 1.3 : type === "flyer" ? 1.24 : type === "ram" ? 1.38 : type === "archer" ? 1.14 : 1;
    const leader = boss && index === 0 ? 3.2 : 1;
    return sum + (definition.hp * scale * 0.11 + definition.damage * 2.1) * tactical * leader;
  }, 0);
}

function squadPower(squad: SimSquad, wave: EnemyType[], policy: Policy): number {
  const definition = squadDefinitions[squad.type];
  const living = squad.members;
  const counters = squad.type === "spear" && wave.some((type) => type === "ram" || type === "sapper") ? 1.22
    : squad.type === "engineer" && wave.some((type) => type === "flyer") ? 1.3
      : squad.type === "archer" && wave.every((type) => type !== "flyer") ? 1.06 : 1;
  const level = 1 + Math.min(0.48, (squad.level - 1) * 0.12);
  return living * definition.damage / definition.cooldown * counters * level * policyRules[policy].command;
}

function trainSquad(type: SquadType, resources: Resources, food: { value: number }, population: number, cap: number): SimSquad | null {
  const definition = squadDefinitions[type];
  const coinCost = definition.cost.coin ?? 0;
  if (population + definition.population > cap || food.value < definition.cost.food || resources.coin < coinCost) return null;
  if ((definition.cost.wood ?? 0) > resources.wood || (definition.cost.gear ?? 0) > resources.gear) return null;
  food.value -= definition.cost.food;
  resources.coin -= coinCost;
  resources.wood -= definition.cost.wood ?? 0;
  resources.gear -= definition.cost.gear ?? 0;
  return { type, members: 4, wounded: 0, level: 1, xp: 0 };
}

function simulate(seed: string, policy: Policy): Outcome {
  const state = createGame("survival", seed, emptyMeta());
  const streams = new SeedStreams(state.rng);
  const random = makeRandom(seed);
  const resources = { ...state.resources };
  const food = { value: state.survival!.food };
  const squads: SimSquad[] = [];
  const rules = policyRules[policy];
  let populationCap = 12;
  let granaryLevel = 1;
  let workshopLevel = 1;
  let gateMax = 260;
  let gate = gateMax;
  let core = 180;
  let rotation = 0;
  let foodLocks = 0;
  let populationPeak = 0;
  let woundedPeak = 0;
  let night17Seconds = 0;
  let night17GateLoss = 0;
  let bosses = 0;

  for (let night = 1; night <= 50; night += 1) {
    // 25 秒白天约等于八个三秒生产周期。这里使用真实生产节拍，
    // 但不假设玩家必须等满：不同策略的 dayCycles 体现提前入夜取舍。
    for (let cycle = 0; cycle < rules.dayCycles; cycle += 1) {
      resources.coin += 2 + Math.floor(night / 9);
      food.value = Math.min(48 + (granaryLevel - 1) * 8, food.value + 2 + Math.floor(Math.sqrt(granaryLevel)));
      const material = (["wood", "stone", "gear"] as const)[rotation++ % 3]!;
      resources[material] += 1 + Math.floor(Math.sqrt(workshopLevel - 1));
    }

    // 医营治疗需要粮草和钱币，不允许免费恢复；优化玩家优先救治高军阶小队。
    const wounded = squads.reduce((sum, squad) => sum + squad.wounded, 0);
    const healBudget = Math.min(wounded, Math.floor(rules.healRate * (2 + night / 6)), food.value, Math.floor(resources.coin / 2));
    let healLeft = healBudget;
    for (const squad of [...squads].sort((a, b) => b.level - a.level)) {
      const healed = Math.min(squad.wounded, healLeft);
      squad.wounded -= healed;
      squad.members += healed;
      healLeft -= healed;
      if (!healLeft) break;
    }
    food.value -= healBudget;
    resources.coin -= healBudget * 2;

    if ((night === 7 || night === 13 || night === 19) && resources.coin >= 14 && resources.stone >= 5 && populationCap < 24) {
      resources.coin -= 14;
      resources.stone -= 5;
      populationCap += 4;
    }
    const desired = rules.composition[Math.min(squads.length, rules.composition.length - 1)]!;
    const currentPopulation = squads.length * 4;
    if (squads.length < rules.composition.length) {
      const trained = trainSquad(desired, resources, food, currentPopulation, populationCap);
      if (trained) squads.push(trained);
      else if (food.value < squadDefinitions[desired].cost.food) foodLocks += 1;
    }
    populationPeak = Math.max(populationPeak, squads.length * 4);

    const upkeep = Math.max(1, squads.length * 2);
    const supplied = food.value >= upkeep;
    food.value = Math.max(0, food.value - upkeep);

    const wave = directorWave({
      epoch: night,
      prosperity: squads.reduce((sum, squad) => sum + squad.level, 0) + granaryLevel + workshopLevel,
      gateLevel: 1 + Math.floor(night / 5),
      defensePower: squads.reduce((sum, squad) => sum + squadPower(squad, [], policy), 0),
      recentDamage: gateMax - gate,
      mode: "survival"
    }, regionById(state.regionId), streams);
    const hasBoss = Boolean(bossForNight(night, regionById(state.regionId)));
    if (hasBoss) bosses += 1;
    const threat = waveThreat(wave, night, hasBoss);
    const troopPower = squads.reduce((sum, squad) => sum + squadPower(squad, wave, policy), 0) * (supplied ? 1 : 0.72);
    const towerPower = 21 + Math.min(80, night * (policy === "novice" ? 1.2 : policy === "standard" ? 1.8 : 2.25));
    const totalPower = Math.max(18, troopPower + towerPower);
    const spawnSpan = Math.max(0, wave.length - 1) * (night >= 16 ? 0.72 : 0.54);
    const duration = Math.max(22, Math.min(75, 6 + spawnSpan + threat / totalPower * 13));
    const pressure = threat / Math.max(1, totalPower * 9.6);
    const casualtyControl = policy === "optimized" ? 1.6 : policy === "standard" ? 1.2 : 0.08;
    const casualties = Math.max(0, Math.floor((pressure - 0.52) * 1.85 + night / 13 + random() * (hasBoss ? 1.55 : 1.05) - casualtyControl));
    let casualtyLeft = casualties;
    for (const squad of [...squads].sort((a, b) => a.type === "shield" ? -1 : 1)) {
      while (casualtyLeft > 0 && squad.members > 0) {
        squad.members -= 1;
        if (random() < (policy === "optimized" ? 0.84 : policy === "standard" ? 0.78 : 0.7)) squad.wounded += 1;
        casualtyLeft -= 1;
      }
    }
    const woundedNow = squads.reduce((sum, squad) => sum + squad.wounded, 0);
    woundedPeak = Math.max(woundedPeak, woundedNow);
    const liveMembers = squads.reduce((sum, squad) => sum + squad.members, 0);
    const leak = Math.max(0.04, Math.min(0.92, pressure - liveMembers * 0.018));
    const formationProtection = policy === "optimized" ? 0.04 : policy === "standard" ? 0.08 : 0.72;
    const gateLoss = threat * leak * (duration / 52) * 0.29 * formationProtection;
    gate -= gateLoss;
    if (gate < 0) {
      core += gate * 0.6;
      gate = 0;
    }
    if (night === 17) {
      night17Seconds = duration;
      night17GateLoss = gateLoss;
    }
    if (core <= 0 || liveMembers <= 0 && night > 2) return { failedAt: night, foodLocks, populationPeak, woundedPeak, night17Seconds, night17GateLoss, bosses };

    for (const squad of squads) {
      squad.xp += 6 + night * 0.7;
      while (squad.level < 5 && squad.xp >= squad.level * 18) {
        squad.xp -= squad.level * 18;
        squad.level += 1;
      }
    }
    resources.coin += wave.reduce((sum, type) => sum + enemies[type].reward, 0);
    if (night % 3 === 0) food.value = Math.min(64, food.value + 12);
    if (night % 5 === 0) resources.gear += 2;
    // 夜后只给有限维护；主动修理有显式材料成本。
    gate = Math.min(gateMax, gate + gateMax * 0.025);
    if (gate / gateMax < rules.repairAt && resources.wood >= 4 && resources.stone >= 3) {
      resources.wood -= 4;
      resources.stone -= 3;
      gate = Math.min(gateMax, gate + gateMax * 0.24);
    }
    if (night % 6 === 0 && resources.coin >= 12 && resources.wood >= 5) {
      resources.coin -= 12;
      resources.wood -= 5;
      workshopLevel = Math.min(5, workshopLevel + 1);
    }
    if (night % 8 === 0 && resources.coin >= 12 && resources.stone >= 4) {
      resources.coin -= 12;
      resources.stone -= 4;
      granaryLevel = Math.min(5, granaryLevel + 1);
    }
  }
  return { failedAt: 51, foodLocks, populationPeak, woundedPeak, night17Seconds, night17GateLoss, bosses };
}

if (doctrines.length < 40) throw new Error(`驻军奖励池不足：${doctrines.length}`);
const seeds = Array.from({ length: 100 }, (_, index) => `GARRISON-${index + 1}`);
const results = new Map<Policy, Outcome[]>();
for (const policy of ["novice", "standard", "optimized"] as const) results.set(policy, seeds.map((seed) => simulate(`${seed}-${policy}`, policy)));
const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const summarize = (outcomes: Outcome[]): Record<string, number> => ({
  medianFailure: median(outcomes.map((entry) => entry.failedAt)),
  medianFoodLocks: median(outcomes.map((entry) => entry.foodLocks)),
  medianPopulation: median(outcomes.map((entry) => entry.populationPeak)),
  medianWoundedPeak: median(outcomes.map((entry) => entry.woundedPeak)),
  medianNight17Seconds: median(outcomes.map((entry) => entry.night17Seconds).filter(Boolean)),
  medianNight17GateLoss: median(outcomes.map((entry) => entry.night17GateLoss).filter(Boolean)),
  medianBosses: median(outcomes.map((entry) => entry.bosses))
});
const report: Record<Policy, Record<string, number>> = {
  novice: summarize(results.get("novice")!),
  standard: summarize(results.get("standard")!),
  optimized: summarize(results.get("optimized")!)
};

console.log(JSON.stringify(report, null, 2));
if (report.novice.medianFailure < 7 || report.novice.medianFailure > 14) throw new Error(`驻军新手中位失败夜不合理：${report.novice.medianFailure}`);
if (report.standard.medianFailure < 18 || report.standard.medianFailure > 25) throw new Error(`驻军熟练玩家中位失败夜不合理：${report.standard.medianFailure}`);
if (report.optimized.medianFailure <= report.standard.medianFailure) throw new Error("合理练兵、治疗和编成没有延长生存");
if (report.standard.medianWoundedPeak < 2) throw new Error("驻军伤员系统没有形成治疗取舍");
if (report.standard.medianPopulation < 12) throw new Error("驻军训练或人口成长停滞");
if (report.standard.medianNight17Seconds && (report.standard.medianNight17Seconds < 38 || report.standard.medianNight17Seconds > 75)) {
  throw new Error(`驻军第17夜时长不合理：${report.standard.medianNight17Seconds}`);
}

console.log(`驻军闭环通过：新手中位 ${report.novice.medianFailure} 夜、熟练 ${report.standard.medianFailure} 夜、优化 ${report.optimized.medianFailure} 夜。`);
