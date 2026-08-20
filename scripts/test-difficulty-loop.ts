import {
  bossForNight,
  buildings,
  canAfford,
  createGame,
  directorWave,
  emptyMeta,
  enemies,
  enemyHealthScale,
  pay,
  regionById,
  SeedStreams,
  upgradeCost,
  weaponLevelPower,
  weaponLevelRate
} from "../src/data";
import type { BuildingType, GameMode, Resources } from "../src/types";

type Policy = "novice" | "standard" | "optimized";
type Defence = { type: BuildingType; level: number };
type Outcome = {
  failedAt: number;
  night17Seconds: number;
  night17SpawnKillRatio: number;
  night17GateDamage: number;
  night17Defence: string;
  materialLocks: number;
  repairSpend: number;
};

const plans: Record<Policy, BuildingType[]> = {
  novice: ["market", "ballista", "workshop", "ballista", "fire"],
  standard: ["market", "ballista", "workshop", "ballista", "fire", "antiair", "trebuchet"],
  optimized: ["market", "ballista", "workshop", "ballista", "fire", "antiair", "trebuchet", "ballista"]
};

const policyFactor = {
  novice: { actions: 1, aim: 0.76, playerDps: 7, repair: 0.72 },
  standard: { actions: 2, aim: 1.08, playerDps: 15, repair: 0.9 },
  optimized: { actions: 3, aim: 1.18, playerDps: 27, repair: 1 }
} as const;

const cloneResources = (resources: Resources): Resources => ({ ...resources });

function unlocked(type: BuildingType, night: number): boolean {
  if (type === "fire" || type === "antiair") return night >= 3;
  if (type === "trebuchet") return night >= 6;
  return true;
}

function capacity(mode: GameMode, night: number): number {
  // 驻军极限守城由 test-garrison-loop.ts 的粮草、人口、训练、伤员模型单独验证。
  if (mode === "survival") return 12;
  return night < 3 ? 6 : night < 6 ? 8 : night < 9 ? 10 : 12;
}

function produce(resources: Resources, defence: Defence[], cycles: number, rotation: number, mode: GameMode): number {
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    resources.coin += 1;
    const markets = defence.filter((entry) => entry.type === "market");
    const workshops = defence.filter((entry) => entry.type === "workshop");
    for (const market of markets) resources.coin += 1 + Math.floor(Math.pow(Math.max(0, market.level - 1), 0.78));
    const material = (["wood", "stone", "gear"] as const)[rotation % 3]!;
    for (const workshop of workshops) resources[material] += Math.max(1, Math.floor(1 + (workshop.level - 1) * 0.58));
    rotation = (rotation + 1) % 3;
    // The market converts surplus cash into the scarcest effective stock, as
    // the real game does. Survival logistics remain deliberately dearer.
    for (const market of markets) {
      const unitCost = mode === "survival" ? 3 : 2;
      const reserve = 14;
      if (resources.coin < reserve + unitCost) continue;
      const key = (["wood", "stone", "gear"] as Array<"wood" | "stone" | "gear">)
        .sort((a, b) => resources[a] / ({ wood: 1.2, stone: 1, gear: 0.65 } as const)[a] - resources[b] / ({ wood: 1.2, stone: 1, gear: 0.65 } as const)[b])[0]!;
      resources.coin -= unitCost;
      resources[key] += market.level >= 3 ? 2 : 1;
    }
  }
  return rotation;
}

function invest(resources: Resources, defence: Defence[], policy: Policy, mode: GameMode, night: number): number {
  let materialLocks = 0;
  const factor = policyFactor[policy];
  for (let action = 0; action < factor.actions; action += 1) {
    const nextType = plans[policy].find((type, index) => index >= defence.length && unlocked(type, night));
    if (nextType && defence.length < capacity(mode, night)) {
      const cost = buildings[nextType].cost;
      if (canAfford(resources, cost)) {
        pay(resources, cost);
        defence.push({ type: nextType, level: 1 });
        continue;
      }
      materialLocks += 1;
    }
    const candidates = defence
      .filter((entry) => entry.type !== "market" || entry.level < 4)
      .filter((entry) => entry.type !== "workshop" || entry.level < 5)
      .sort((a, b) => a.level - b.level || Number(Boolean(buildings[b.type].attack)) - Number(Boolean(buildings[a.type].attack)));
    const target = candidates.find((entry) => canAfford(resources, upgradeCost(entry.type, entry.level)));
    if (!target) {
      materialLocks += 1;
      continue;
    }
    pay(resources, upgradeCost(target.type, target.level));
    target.level += 1;
  }
  return materialLocks;
}

function defenceDps(defence: Defence[], wave: BuildingType[] | string[], policy: Policy): number {
  const flyerShare = wave.filter((type) => type === "flyer").length / Math.max(1, wave.length);
  return defence.reduce<number>((sum, entry) => {
    const definition = buildings[entry.type];
    if (!definition.attack || !definition.cooldown) return sum;
    const uptime = entry.type === "trebuchet" ? 0.94
      : entry.type === "antiair" ? 0.48 + flyerShare * 1.35
        : entry.type === "fire" ? 0.78 : 0.86;
    return sum + definition.attack * weaponLevelPower(entry.level) * weaponLevelRate(entry.level) * uptime / definition.cooldown;
  }, Number(policyFactor[policy].playerDps)) * policyFactor[policy].aim;
}

function repairGate(resources: Resources, missing: number, maxHp: number, gateLevel: number, willingness: number): { restored: number; spend: number } {
  if (missing <= 0 || missing / maxHp < 0.08 + (1 - willingness) * 0.3) return { restored: 0, spend: 0 };
  const bands = Math.max(1, Math.ceil((missing / maxHp) * 5));
  const cost = { wood: (2 + Math.floor((gateLevel - 1) / 4)) * bands, stone: (1 + Math.floor((gateLevel - 1) / 6)) * bands };
  if (!canAfford(resources, cost)) return { restored: 0, spend: 0 };
  pay(resources, cost);
  return { restored: missing, spend: cost.wood + cost.stone };
}

function simulate(seed: string, mode: GameMode, policy: Policy): Outcome {
  const state = createGame(mode, seed, emptyMeta());
  const streams = new SeedStreams(state.rng);
  const resources = cloneResources(state.resources);
  const defence: Defence[] = [];
  let gateLevel = 1;
  let gateMax = 260;
  let gate = gateMax;
  let core = 180;
  let rotation = 0;
  let previousDuration = 24;
  let materialLocks = 0;
  let repairSpend = 0;
  let night17Seconds = 0;
  let night17SpawnKillRatio = 0;
  let night17GateDamage = 0;
  let night17Defence = "";

  for (let night = 1; night <= 50; night += 1) {
    // Six daytime ticks plus battle-time production: waiting is never the only
    // route forward, but a damaged economy cannot finance every upgrade.
    rotation = produce(resources, defence, 6 + Math.floor(previousDuration / 6), rotation, mode);
    materialLocks += invest(resources, defence, policy, mode, night);

    if (night % 4 === 0) {
      const gateCost = { coin: 7 + gateLevel * 5, stone: 1 + gateLevel * 3 };
      if (canAfford(resources, gateCost)) {
        pay(resources, gateCost);
        const ratio = gate / gateMax;
        gateLevel += 1;
        gateMax += 72 + Math.min(150, gateLevel * 14);
        gate = gateMax * ratio;
      }
    }

    const estimatedDps = defenceDps(defence, [], policy);
    const wave = directorWave({
      epoch: night,
      prosperity: defence.reduce((sum, item) => sum + item.level, 0) + gateLevel,
      gateLevel,
      defensePower: estimatedDps,
      recentDamage: gateMax - gate,
      mode
    }, regionById(state.regionId), streams);
    const boss = bossForNight(night, regionById(state.regionId));
    const healthScale = enemyHealthScale(night, mode);
    const totalHealth = wave.reduce((sum, type, index) => {
      const armor = type === "shield" ? 1.2 : type === "ram" ? 1.26 : type === "flyer" && !defence.some((entry) => entry.type === "antiair") ? 1.35 : 1;
      const rank = boss && index === 0 ? 3.6 : night % 5 === 0 && index < 2 ? 1.5 : 1;
      return sum + enemies[type].hp * healthScale * armor * rank;
    }, 0);
    const dps = defenceDps(defence, wave, policy);
    const spawnInterval = night >= 16 ? 0.72 : night >= 9 ? 0.6 : 0.46;
    const spawnSpan = Math.max(0, wave.length - 1) * spawnInterval;
    const marchSeconds = night >= 16 ? 7.4 : 6.2;
    const duration = Math.max(spawnSpan + marchSeconds, totalHealth / Math.max(1, dps) + marchSeconds * 0.55);

    // Only the trebuchet can fire over the full outer approach. Count units
    // whose own health can actually be erased before normal towers gain range;
    // aggregate DPS/enemy HP greatly exaggerated this metric (60% vs reality).
    const longRangeDps = defence
      .filter((entry) => entry.type === "trebuchet")
      .reduce((sum, entry) => sum + buildings.trebuchet.attack! * weaponLevelPower(entry.level) * weaponLevelRate(entry.level) / buildings.trebuchet.cooldown!, 0);
    const outerDamagePerSpawn = longRangeDps * 2.25 / Math.max(1, Math.min(4, wave.length));
    const spawnDeaths = wave.filter((type) => enemies[type].hp * healthScale <= outerDamagePerSpawn).length;
    const spawnKillRatio = spawnDeaths / Math.max(1, wave.length);

    const enemyPower = wave.reduce((sum, type) => sum + enemies[type].damage * (type === "sapper" ? 1.35 : type === "ram" ? 1.28 : 1), 0)
      * (1 + night * 0.035) * (mode === "survival" ? 1.2 : 1);
    const tacticalPressure = night >= 16 ? 1.2 : night >= 9 ? 1.08 : 1;
    const containment = dps / Math.max(1, totalHealth / 17 + enemyPower * 0.32);
    const leak = Math.max(0.055, Math.min(0.9, 1.08 - containment));
    // Better players do not receive hidden stats: the factor represents visible
    // interventions the coarse time-step does not animate (hero knockback,
    // emergency focus fire, repairing the currently targeted structure and
    // moving the correct counter to the threatened lane).
    const intervention = policy === "optimized" ? 0.23 : policy === "standard" ? 0.32 : 1.08;
    const gateDamage = enemyPower * leak * tacticalPressure * (duration / 48) * intervention;
    gate -= gateDamage;
    if (gate <= 0) {
      core += gate * 0.62;
      gate = 0;
    }
    if (night === 17) {
      night17Seconds = duration;
      night17SpawnKillRatio = spawnKillRatio;
      night17GateDamage = gateDamage;
      night17Defence = defence.map((entry) => `${entry.type}${entry.level}`).join(",");
    }
    if (core <= 0) return { failedAt: night, night17Seconds, night17SpawnKillRatio, night17GateDamage, night17Defence, materialLocks, repairSpend };

    // Actual combat drops sustain play, but mostly in coin; construction and
    // repairs still depend on a working material economy.
    for (const type of wave) {
      resources.coin += enemies[type].reward;
      if (type === "sapper") resources.gear += 1;
      if (type === "ram") resources.stone += 2;
    }
    const maintenance = gateMax * (mode === "survival" ? 0.039 : 0.06);
    gate = Math.min(gateMax, gate + maintenance);
    const quote = repairGate(resources, gateMax - gate, gateMax, gateLevel, policyFactor[policy].repair);
    gate += quote.restored;
    repairSpend += quote.spend;
    previousDuration = duration;
  }
  return { failedAt: 51, night17Seconds, night17SpawnKillRatio, night17GateDamage, night17Defence, materialLocks, repairSpend };
}

const seeds = Array.from({ length: 100 }, (_, index) => `LOOP-${index + 1}`);
const results = new Map<string, Outcome[]>();
for (const policy of ["novice", "standard", "optimized"] as const) {
  results.set(`expedition-${policy}`, seeds.map((seed) => simulate(`${seed}-expedition-${policy}`, "expedition", policy)));
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const expeditionNovice = median(results.get("expedition-novice")!.map((entry) => entry.failedAt));
const expeditionStandard = median(results.get("expedition-standard")!.map((entry) => entry.failedAt));
const optimized = median(results.get("expedition-optimized")!.map((entry) => entry.failedAt));
const night17 = results.get("expedition-standard")!;
const medianNight17 = median(night17.map((entry) => entry.night17Seconds).filter(Boolean));
const medianSpawnKill = median(night17.map((entry) => entry.night17SpawnKillRatio).filter((value) => Number.isFinite(value)));
const medianGateDamage = median(night17.map((entry) => entry.night17GateDamage).filter(Boolean));
const medianRepairSpend = median(night17.map((entry) => entry.repairSpend));
const referenceNight17Defence = night17.find((entry) => entry.night17Defence)?.night17Defence ?? "未抵达";

console.log(JSON.stringify({ expeditionNovice, expeditionStandard, optimized, medianNight17, medianSpawnKill, medianGateDamage, medianRepairSpend, referenceNight17Defence }, null, 2));
if (expeditionNovice < 8 || expeditionNovice > 14) throw new Error(`远征新手中位失败夜不合理：${expeditionNovice}`);
if (expeditionStandard < 15 || expeditionStandard > 26) throw new Error(`熟练玩家中位失败夜不合理：${expeditionStandard}`);
if (optimized <= expeditionStandard) throw new Error(`优化布局没有延长生存：${optimized} <= ${expeditionStandard}`);
if (medianNight17 < 42 || medianNight17 > 78) throw new Error(`第17夜时长未落入目标区间：${medianNight17.toFixed(1)} 秒`);
if (medianSpawnKill > 0.25) throw new Error(`第17夜出生即死比例过高：${Math.round(medianSpawnKill * 100)}%`);
if (medianGateDamage < 35) throw new Error(`第17夜防线没有形成维修压力：城门仅损失 ${medianGateDamage.toFixed(0)}`);

console.log(`远征闭环难度通过：新手中位 ${expeditionNovice} 夜、熟练 ${expeditionStandard} 夜、优化 ${optimized} 夜；第17夜 ${medianNight17.toFixed(1)} 秒，出生即死 ${Math.round(medianSpawnKill * 100)}%，城门损失 ${medianGateDamage.toFixed(0)}。驻军难度由独立闭环验证。`);
