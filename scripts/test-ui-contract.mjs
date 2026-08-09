import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const game = readFileSync(join(root, "src/game.ts"), "utf8");
const css = readFileSync(join(root, "src/style.css"), "utf8");

const resources = ["coin", "wood", "stone", "gear"];
for (const resource of resources) {
  if (!html.includes(`resource-token ${resource}-token`)) throw new Error(`右上资源栏缺少统一 ${resource} 图标`);
  if (!css.includes(`.${resource}-token`)) throw new Error(`样式表缺少 ${resource} 实物图标`);
}

if (!game.includes("resource-token cost-token ${key}-token")) {
  throw new Error("建造、升级与修理没有复用资源栏的统一图标生成器");
}

for (const id of ["gateUpgradeCost", "upgradeCost", "repairCost", "demolishRefund"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`操作界面缺少成本或返还区域：${id}`);
}

for (const contract of [
  "this.hud.gateUpgradeCost.innerHTML = this.formatCostMarkup",
  "this.hud.upgradeCost.innerHTML = this.formatCostMarkup",
  "this.hud.repairCost.innerHTML = this.formatCostMarkup",
  "fortifyUnlocked ? this.formatCostMarkup"
]) {
  if (!game.includes(contract)) throw new Error(`存在未统一的资源成本显示：${contract}`);
}

for (const breakpoint of [
  "@media (max-width: 820px)",
  "@media (max-width: 540px)",
  "@media (orientation: portrait) and (max-width: 820px)",
  "@media (max-height: 540px) and (orientation: landscape)"
]) {
  if (!css.includes(breakpoint)) throw new Error(`缺少多端安全区：${breakpoint}`);
}

if (!css.includes(".prompt") || !css.includes(".resource-hud") || !css.includes(".hotbar")) {
  throw new Error("HUD 关键层缺少独立布局轨道");
}

console.log("界面契约通过：四类资源图标、建造/升级/修理/返还成本与四套多端安全区保持统一。");
