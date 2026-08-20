import { adventureBosses, adventureEquipment, adventureHeroes, adventureSkills, createAdventureRoute, createAdventureState } from "../src/adventure";

const heroes = Object.values(adventureHeroes);
if (heroes.length !== 3 || new Set(heroes.map((hero) => hero.role)).size !== 3) throw new Error("行者历练三名角色定位不完整");
if (adventureEquipment.length < 24) throw new Error(`行者装备池不足：${adventureEquipment.length}`);
if (adventureSkills.length < 18) throw new Error(`行者技能池不足：${adventureSkills.length}`);
if (adventureBosses.length < 3 || adventureBosses.some((boss) => boss.phases.length !== 2)) throw new Error("章节首领或阶段定义不完整");

for (const hero of heroes) {
  if (!adventureEquipment.some((item) => item.id === hero.startingEquipment && (!item.hero || item.hero === hero.id))) {
    throw new Error(`${hero.name} 缺少合法起始装备`);
  }
  if (adventureSkills.filter((skill) => skill.hero === hero.id).length < 6) throw new Error(`${hero.name} 的技能分支不足`);
  const state = createAdventureState(hero.id, `ADVENTURE-${hero.id}`);
  if (state.route.length < 13 || state.route[0]?.kind !== "camp" || state.route.at(-1)?.kind !== "boss") throw new Error(`${hero.name} 的短局路线结构错误`);
}

const repeatA = createAdventureRoute("REPEATABLE-ROUTE", 1);
const repeatB = createAdventureRoute("REPEATABLE-ROUTE", 1);
const different = createAdventureRoute("DIFFERENT-ROUTE", 1);
if (JSON.stringify(repeatA) !== JSON.stringify(repeatB)) throw new Error("相同行者种子无法复现路线");
if (JSON.stringify(repeatA) === JSON.stringify(different)) throw new Error("不同行者种子没有产生变化");
for (const node of repeatA) {
  if (node.depth < 6 && !node.next.length) throw new Error(`路线节点 ${node.id} 无法继续`);
  if (node.depth === 6 && node.next.length) throw new Error("首领节点不应继续连接本章路线");
}

console.log(`行者历练设计契约通过：3 名角色、${adventureEquipment.length} 件装备、${adventureSkills.length} 项技能、${adventureBosses.length} 名章节首领。`);
