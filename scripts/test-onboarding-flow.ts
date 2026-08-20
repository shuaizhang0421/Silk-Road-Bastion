import { createGame, emptyMeta, nightModifiersForEpoch } from "../src/data";
import { canBuildInZone, fortLayout } from "../src/fort-layout";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const newPlayer = emptyMeta();
newPlayer.seenTutorial = false;
const expedition = createGame("expedition", "ONBOARDING-CONTRACT", newPlayer);

assert(expedition.tutorialStep === 0, "新档必须从商栈教学开始");
assert(expedition.phase === "day" && expedition.dayLength === 20, "首局必须有完整备战阶段");
assert(!["flying-raid", "looter-call", "elite-guard"].includes(expedition.nightModifier?.id ?? ""), "首夜警报不得预告尚未出现的兵种");

const initial = fortLayout("expedition", 0, null);
assert(initial.zones.length === 6, "远征初始应有六个功能位置");
assert(initial.zones[4]?.type === "logistics" && canBuildInZone("market", initial.zones[4]), "教学商栈位置必须是合法后勤位");
assert(initial.zones[0]?.type === "defense" && canBuildInZone("ballista", initial.zones[0]), "教学床弩位置必须覆盖门楼防线");

const survival = fortLayout("survival", 0, null);
assert(survival.zones.length === 12, "驻军极限守城必须固定十二个功能位置");
assert(fortLayout("survival", 3, "high-ground").zones.length === 12, "驻军极限守城不得因夜数或模块扩城");
assert(survival.zones.filter((zone) => zone.type === "defense").length === 3, "驻军城池必须提供三个城防位");
assert(survival.zones.filter((zone) => zone.type === "military").length === 3, "驻军城池必须提供三个军事位");
assert(survival.zones.filter((zone) => zone.type === "logistics").length === 3, "驻军城池必须提供三个后勤位");
assert(survival.zones.filter((zone) => zone.type === "siege").length === 1, "驻军城池必须提供一个攻城位");

const garrison = createGame("survival", "GARRISON-ONBOARDING", newPlayer);
assert(garrison.dayLength === 25 && garrison.survival !== null, "极限守城必须以 25 秒白天和驻军状态开局");
assert(garrison.survival.food === 20 && garrison.survival.populationCap === 12, "驻军初始粮草或人口错误");
assert(garrison.survival.squads.length === 0 && garrison.survival.trainingQueue.length === 0, "新档不应凭空拥有军队或训练队列");
assert(canBuildInZone("granary", survival.zones[7]!), "后勤位必须允许建造粮秣院");
assert(canBuildInZone("barracks", survival.zones[4]!), "军事位必须允许建造兵营");

assert(!nightModifiersForEpoch(3).some((modifier) => modifier.id === "flying-raid"), "第三夜不能生成飞袭警报");
assert(nightModifiersForEpoch(4).some((modifier) => modifier.id === "flying-raid"), "第四夜应解锁飞袭警报");
assert(nightModifiersForEpoch(3).some((modifier) => modifier.id === "looter-call"), "第三夜应解锁远程增援规则");

console.log("Onboarding contract passed: expedition tutorial and 12-zone garrison onboarding are coherent.");
