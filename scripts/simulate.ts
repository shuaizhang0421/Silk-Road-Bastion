import { bossForNight, buildings, canAfford, createGame, directorWave, emptyMeta, enemies, enemyHealthScale, pay, regionById, relics, SeedStreams, weaponLevelPower, weaponLevelRate } from "../src/data";
import { canBuildInZone, fortLayout } from "../src/fort-layout";
import { doctrines, squadDefinitions, survivalGuardNodes } from "../src/survival";

const seeds = Array.from({ length: 100 }, (_, index) => `SILK-${String(index + 1).padStart(3, "0")}`);
let generatedEpochs = 0;
let maxWave = 0;
let mechanicEpoch = 0;
let totalEarlyEnemies = 0;
let totalLateEnemies = 0;
let survivalEpochs = 0;
let expeditionEnemyTotal = 0;
let survivalEnemyTotal = 0;

const repeatA = createGame("expedition", "REPEATABLE-WORLD", emptyMeta());
const repeatB = createGame("expedition", "REPEATABLE-WORLD", emptyMeta());
if (repeatA.regionId !== repeatB.regionId || repeatA.terrainVariant !== repeatB.terrainVariant || JSON.stringify(repeatA.rng) !== JSON.stringify(repeatB.rng)) {
  throw new Error("相同世界编号没有复现同一张初始世界");
}

// 首局的“商栈 → 床弩”是强制新手路径：两者必须能用初始材料连续完成，
// 否则玩家会在还没理解生产循环前被迫去城外采集。
const tutorialOpening = createGame("expedition", "TUTORIAL-OPENING", emptyMeta());
if (tutorialOpening.tutorialStep !== 0 || tutorialOpening.phaseTime !== 20) {
  throw new Error("新手首局没有以正确的教程阶段开始");
}
const openingStock = { ...tutorialOpening.resources };
if (!canAfford(openingStock, buildings.market.cost)) throw new Error("初始材料无法建造商栈");
pay(openingStock, buildings.market.cost);
if (!canAfford(openingStock, buildings.ballista.cost)) throw new Error("建成商栈后初始材料无法建造床弩");

const openingRegions = new Set<string>();
const openingTerrains = new Set<number>();
for (let index = 0; index < 40; index += 1) {
  const opening = createGame("expedition", `OPENING-${index}`, emptyMeta());
  openingRegions.add(opening.regionId);
  openingTerrains.add(opening.terrainVariant);
}
if (openingRegions.size < 2 || openingTerrains.size < 3) throw new Error("新随机世界的首图变化不足");

const survival = createGame("survival", "SURVIVAL-MODE", emptyMeta());
const training = createGame("training", "TRAINING-MODE", emptyMeta(), "ranger");
if (survival.mode !== "survival" || training.adventure?.attackRange !== 11.5 || training.adventure.moveSpeed <= 8) {
  throw new Error("模式或行者初始属性不正确");
}
if (!survival.survival || survival.survival.food !== 20 || survival.dayLength !== 25) throw new Error("驻军极限守城初始化失败");
if (doctrines.length < 40 || Object.keys(squadDefinitions).length !== 4 || survivalGuardNodes.length < 10) {
  throw new Error("驻军军令、小队或驻守节点定义不完整");
}

if (relics.length < 60) throw new Error(`奖励池不足：当前只有 ${relics.length} 项`);
const buildingSpecificEffects = new Map([
  ["trade", "market"], ["double-trade", "market"], ["workshop", "workshop"], ["gear", "workshop"],
  ["wood-yield", "workshop"], ["stone-yield", "workshop"], ["gear-yield", "workshop"],
  ["fire", "fire"], ["fire-spread", "fire"], ["fire-damage", "fire"], ["pierce", "ballista"],
  ["anti-ranged", "ballista"], ["air-damage", "antiair"], ["blast", "trebuchet"]
]);
for (const relic of relics) {
  const required = buildingSpecificEffects.get(relic.effect);
  if (required && relic.requiresBuilding !== required) throw new Error(`专属奖励 ${relic.name} 未绑定 ${required}，可能在无效时出现`);
}
for (const [level, expected] of [[0, 6], [1, 8], [2, 10], [3, 12]] as const) {
  const layout = fortLayout("expedition", level, null);
  if (layout.zones.length !== expected) throw new Error(`远征扩建 ${level} 的功能区数量错误：${layout.zones.length}`);
  for (const zone of layout.zones.filter((entry) => entry.type === "defense")) {
    if (!zone.coveredLanes.length || !canBuildInZone("ballista", zone)) throw new Error(`城防位 ${zone.id} 没有有效敌军通道`);
    const nearestLane = Math.min(...zone.coveredLanes.map((lane) => Math.hypot(zone.position.x - lane * 6.2, zone.position.z + 20.5)));
    const realRange = buildings.ballista.range! * (zone.elevation > 0 ? 1.12 : 1);
    if (nearestLane > realRange) throw new Error(`城防位 ${zone.id} 无法用真实床弩射程覆盖通道`);
  }
}
const survivalLayout = fortLayout("survival", 3, null);
if (survivalLayout.zones.length !== 12) throw new Error("驻军极限守城没有固定为 12 处功能区");
if (survivalLayout.zones.filter((zone) => zone.type === "logistics").length !== 3
  || survivalLayout.zones.filter((zone) => zone.type === "military").length !== 3
  || survivalLayout.zones.filter((zone) => zone.type === "defense").length !== 3) {
  throw new Error("驻军极限守城功能区缺少生产、练兵与防御取舍");
}
const survivalSiege = survivalLayout.zones.find((zone) => zone.type === "siege");
if (!survivalSiege || !canBuildInZone("trebuchet", survivalSiege)) throw new Error("极限守城第六夜投石车没有合法攻城位");
const expeditionSiege = fortLayout("expedition", 2, null).zones.find((zone) => zone.type === "siege");
if (!expeditionSiege || !canBuildInZone("trebuchet", expeditionSiege)) throw new Error("远征第六夜没有同步开放投石机攻城位");
if (enemyHealthScale(30, "expedition") <= enemyHealthScale(15, "expedition") * 1.35) throw new Error("敌军生命后期增长过缓或意外封顶");
if (enemyHealthScale(15, "survival") <= enemyHealthScale(15, "expedition")) throw new Error("极限守城没有形成额外生命压力");

for (const seed of seeds) {
  const state = createGame("expedition", seed, emptyMeta());
  const streams = new SeedStreams(state.rng);
  const survivalState = createGame("survival", `${seed}-SURVIVAL`, emptyMeta());
  const survivalStreams = new SeedStreams(survivalState.rng);
  for (let epoch = 1; epoch <= 50; epoch += 1) {
    state.epoch = epoch;
    const wave = directorWave(
      {
        epoch,
        prosperity: Math.floor(epoch * 1.15),
        gateLevel: 1 + Math.floor(epoch / 4),
        defensePower: 18 + epoch * 4.2,
        recentDamage: epoch % 3 === 0 ? 80 : 20,
        mode: "expedition"
      },
      regionById(state.regionId),
      streams
    );
    if (!wave.length) throw new Error(`${seed} 的第 ${epoch} 纪元没有生成敌人`);
    if (wave.length > 60) throw new Error(`${seed} 的第 ${epoch} 纪元敌人超过性能上限`);
    if (epoch >= 4 && !wave.includes("archer")) throw new Error(`${seed} 的第 ${epoch} 夜缺少远程兵种压力`);
    if ((epoch % 5 === 0) !== Boolean(bossForNight(epoch, regionById(state.regionId)))) throw new Error(`${seed} 的首领轮换错误`);
    maxWave = Math.max(maxWave, wave.length);
    if (wave.some((type) => type !== "raider") && mechanicEpoch === 0) mechanicEpoch = epoch;
    if (epoch <= 3) totalEarlyEnemies += wave.length;
    if (epoch >= 26) totalLateEnemies += wave.length;
    expeditionEnemyTotal += wave.length;
    generatedEpochs += 1;

    const survivalWave = directorWave(
      {
        epoch,
        prosperity: Math.floor(epoch * 1.08),
        gateLevel: 1 + Math.floor(epoch / 5),
        defensePower: 18 + epoch * 4,
        recentDamage: epoch % 2 === 0 ? 105 : 35,
        mode: "survival"
      },
      regionById(survivalState.regionId),
      survivalStreams
    );
    if (!survivalWave.length || survivalWave.length > 60) throw new Error(`${seed} 的极限第 ${epoch} 夜波次无效`);
    if (epoch >= 4 && !survivalWave.includes("archer")) throw new Error(`${seed} 的极限第 ${epoch} 夜缺少游弓手`);
    if ((epoch % 5 === 0) !== Boolean(bossForNight(epoch, regionById(survivalState.regionId)))) throw new Error(`${seed} 的极限首领轮换错误`);
    survivalEnemyTotal += survivalWave.length;
    survivalEpochs += 1;
  }
}

if (generatedEpochs !== 5000) throw new Error(`纪元数量错误: ${generatedEpochs}`);
if (survivalEpochs !== 5000) throw new Error(`极限纪元数量错误: ${survivalEpochs}`);
if (mechanicEpoch > 3) throw new Error("敌军机制解锁过晚");
if (totalLateEnemies <= totalEarlyEnemies) throw new Error("后期敌军组合没有形成进程性");
if (survivalEnemyTotal <= expeditionEnemyTotal * 1.04) throw new Error("极限守城的总体敌军压力与无尽远征差异不足");

// A level-17 reference battery must not erase a complete wave at spawn. This
// estimate intentionally excludes travel and armour, so failing it indicates a
// severe raw-DPS imbalance before the full time-step strategy model even runs.
const night17Wave = directorWave({ epoch: 17, prosperity: 24, gateLevel: 7, defensePower: 230, recentDamage: 15, mode: "expedition" }, regionById("oasis"), new SeedStreams(createGame("expedition", "NIGHT-17-DPS", emptyMeta()).rng));
const night17Health = night17Wave.reduce((total, type) => total + enemies[type].hp * enemyHealthScale(17, "expedition"), 0);
const referenceBattery = [
  { type: "ballista" as const, level: 6 }, { type: "ballista" as const, level: 5 },
  { type: "fire" as const, level: 5 }, { type: "antiair" as const, level: 4 }
];
const referenceDps = referenceBattery.reduce((total, item) => {
  const definition = buildings[item.type];
  return total + (definition.attack ?? 0) * weaponLevelPower(item.level) * weaponLevelRate(item.level) / (definition.cooldown ?? 1);
}, 0) * 1.42;
const theoreticalKillTime = night17Health / Math.max(1, referenceDps);
if (theoreticalKillTime < 34) throw new Error(`第17夜理论清场过快：${theoreticalKillTime.toFixed(1)} 秒`);

const gateLevelTenMax = 260 + Array.from({ length: 9 }, (_, index) => 72 + Math.min(150, (index + 2) * 14)).reduce((sum, value) => sum + value, 0);
const pressureWave = directorWave({ epoch: 20, prosperity: 28, gateLevel: 10, defensePower: 150, recentDamage: 20, mode: "expedition" }, regionById("canyon"), new SeedStreams(createGame("expedition", "GATE-PRESSURE", emptyMeta()).rng));
const nightTwentyScale = 1 + 0.052 * 19 + 0.0045 * Math.pow(19, 1.35);
const threeAttackDamage = pressureWave.reduce((sum, type) => sum + enemies[type].damage * nightTwentyScale * (type === "sapper" ? 1.55 : type === "archer" ? 0.78 : 1), 0) * 3;
if (threeAttackDamage <= gateLevelTenMax) throw new Error("十级城门仍可在高夜无视整波敌军，防守压力不足");

console.log(`模拟通过：100 个世界、无尽与极限各 ${generatedEpochs} 夜（合计 ${generatedEpochs + survivalEpochs} 夜），${relics.length} 项奖励，${openingRegions.size} 种首区域、${openingTerrains.size} 种地貌变体，最大波次 ${maxWave}，极限敌军量高出 ${Math.round((survivalEnemyTotal / expeditionEnemyTotal - 1) * 100)}%。`);
