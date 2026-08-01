import { buildings, canAfford, createGame, directorWave, emptyMeta, pay, regionById, SeedStreams } from "../src/data";

const seeds = Array.from({ length: 100 }, (_, index) => `SILK-${String(index + 1).padStart(3, "0")}`);
let generatedEpochs = 0;
let maxWave = 0;
let mechanicEpoch = 0;
let totalEarlyEnemies = 0;
let totalLateEnemies = 0;

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

for (const seed of seeds) {
  const state = createGame("expedition", seed, emptyMeta());
  const streams = new SeedStreams(state.rng);
  for (let epoch = 1; epoch <= 30; epoch += 1) {
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
    if (wave.length > 48) throw new Error(`${seed} 的第 ${epoch} 纪元敌人超过性能上限`);
    maxWave = Math.max(maxWave, wave.length);
    if (wave.some((type) => type !== "raider") && mechanicEpoch === 0) mechanicEpoch = epoch;
    if (epoch <= 3) totalEarlyEnemies += wave.length;
    if (epoch >= 26) totalLateEnemies += wave.length;
    generatedEpochs += 1;
  }
}

if (generatedEpochs !== 3000) throw new Error(`纪元数量错误: ${generatedEpochs}`);
if (mechanicEpoch > 3) throw new Error("敌军机制解锁过晚");
if (totalLateEnemies <= totalEarlyEnemies) throw new Error("后期敌军组合没有形成进程性");

console.log(`模拟通过：100 个种子、${generatedEpochs} 个纪元，${openingRegions.size} 种首区域、${openingTerrains.size} 种地貌变体，最大波次 ${maxWave}，机制敌人自第 ${mechanicEpoch} 纪元出现。`);
