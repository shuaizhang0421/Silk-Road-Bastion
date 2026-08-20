import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const game = readFileSync(join(root, "src/game.ts"), "utf8");
const models = readFileSync(join(root, "src/models.ts"), "utf8");
const css = readFileSync(join(root, "src/style.css"), "utf8");
const fortLayout = readFileSync(join(root, "src/fort-layout.ts"), "utf8");

const resources = ["coin", "wood", "stone", "gear"];
for (const resource of resources) {
  if (!html.includes(`resource-token ${resource}-token`)) throw new Error(`右上资源栏缺少统一 ${resource} 图标`);
  if (!css.includes(`.${resource}-token`)) throw new Error(`样式表缺少 ${resource} 实物图标`);
}

for (const id of ["foodValue", "populationValue", "garrisonPanel", "garrisonTabs", "garrisonContent"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`驻军经营界面缺少：${id}`);
}
for (const tab of ["build", "recruit", "army"]) {
  if (!html.includes(`data-garrison-tab="${tab}"`)) throw new Error(`驻军界面缺少 ${tab} 分页`);
}
if (!css.includes(".garrison-panel") || !css.includes(".garrison-card") || !css.includes(".garrison-only")) {
  throw new Error("驻军面板、卡片或粮草人口 HUD 缺少多端样式");
}
if (!game.includes("queueSquadTraining") || !game.includes("updateTrainingQueues") || !game.includes("refreshGuardNodeVisibility")) {
  throw new Error("招募、训练或驻守节点没有接入游戏流程");
}

if (!game.includes("resource-token cost-token ${key}-token")) {
  throw new Error("建造、升级与修理没有复用资源栏的统一图标生成器");
}

for (const id of ["gateUpgradeCost", "gateRepairCost", "upgradeCost", "repairCost", "demolishRefund", "relocateBtn", "autoDeployBtn"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`操作界面缺少成本或返还区域：${id}`);
}

for (const id of ["bossBar", "bossName", "bossAction", "bossHpFill"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`首领战缺少简洁 HUD：${id}`);
}
for (const tier of ["auto", "low", "medium", "high"]) {
  if (!html.includes(`data-quality="${tier}"`)) throw new Error(`画质设置缺少 ${tier} 档`);
}
if (!css.includes(".boss-bar") || !css.includes(".quality-setting")) throw new Error("首领 HUD 或画质设置缺少样式");
if (!game.includes("qualityPresets[this.effectiveQuality]") || !game.includes("this.setQualityTier")) throw new Error("画质按钮未接入实际渲染预算");

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

if (!game.includes("refreshBuildZoneVisibility") || !game.includes("autoArrangeBuildings") || !game.includes("beginRelocation")) {
  throw new Error("功能区域、迁移或一键布防没有接入实际游戏循环");
}
if (!game.includes("setChoiceUi(true)") || !game.includes("is-choice-hidden") || !css.includes(".is-choice-hidden")) {
  throw new Error("遗物与迁营阶段没有清理建筑选择或隐藏冲突 HUD");
}
if (game.includes("PAD_POSITIONS") || game.includes("distantPanorama")) {
  throw new Error("旧统一石台或固定全景背景仍残留在运行时代码中");
}

// A build socket is an interaction surface, not permanent scenery. Four tiny
// cylinder pegs used to remain visible after the translucent slab blended into
// the paving, producing unexplained black dots in the courtyard.
if (game.includes("new THREE.CylinderGeometry(0.1, 0.14, 0.16, 8)")) {
  throw new Error("院落建造位仍包含会残留为黑点的固定钉");
}
if (game.includes("new THREE.BoxGeometry(size - 0.32, 0.08")) {
  throw new Error("建造位提示仍使用会被误认为建筑的实心矩形底板");
}
if (!fortLayout.includes('zone("gatehouse-west", "defense", -7.6, -7.1, 0, DEFENSE, [-1, 0], 0.08, 0.08)')
  || !fortLayout.includes('zone("gatehouse-east", "defense", 7.6, -7.1, 0, DEFENSE, [0, 1], -0.08, 0.08)')) {
  throw new Error("初始门楼城防位不得再生成常驻高台方块");
}
const wallFactory = models.slice(models.indexOf("export function makeFortWallSegment"), models.indexOf("export function makeMarket"));
if (wallFactory.includes('fittedModel("village-balcony"')) {
  throw new Error("连续城墙仍会自动生成悬浮木廊");
}

console.log("界面契约通过：统一资源图标、功能区域、迁移布防、首领 HUD、四档画质与四套多端安全区保持一致。");
