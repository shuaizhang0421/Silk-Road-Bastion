import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const manifestPath = join(root, "public/assets/ASSET_MANIFEST.md");
const noticesPath = join(root, "THIRD_PARTY_NOTICES.md");
const runtimeManifestPath = join(root, "src/asset-manifest.ts");
const required = [
  "public/assets/models/kenney/castle/LICENSE.txt",
  "public/assets/models/kenney/characters/LICENSE.txt",
  "public/assets/models/quaternius/character-animated.glb",
  "public/assets/models/runtime/LICENSE.txt",
  "public/assets/models/runtime/desktop/Wall_UnevenBrick_Straight.glb",
  "public/assets/models/runtime/desktop/Wall_UnevenBrick_Door_Round.glb",
  "public/assets/models/runtime/desktop/Prop_Wagon.glb",
  "public/assets/models/runtime/desktop/Prop_Crate.glb",
  "public/assets/models/runtime/mobile/Wall_UnevenBrick_Door_Round.glb",
  "public/assets/models/runtime/mobile/Prop_Wagon.glb",
  "public/assets/models/authored/desktop/silk-road-ballista.glb",
  "public/assets/models/authored/mobile/silk-road-ballista.glb",
  "public/assets/materials/polyhaven/LICENSE.txt",
  "public/assets/materials/polyhaven/aerial_sand/aerial_sand_diff_1k.jpg",
  "public/assets/materials/polyhaven/aerial_sand/aerial_sand_nor_gl_1k.jpg",
  "public/assets/materials/polyhaven/aerial_sand/aerial_sand_rough_1k.jpg",
  "public/assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_diff_1k.jpg",
  "public/assets/materials/polyhaven/rough_wood/rough_wood_diff_1k.jpg",
  "public/assets/materials/polyhaven/rusty_metal_05/rusty_metal_05_diff_1k.jpg",
  "public/assets/art/silk-road-sandstone-v1.jpg",
  "public/assets/art/silk-road-timber-v1.jpg",
  "public/assets/art/silk-road-courtyard-paving-v1.jpg",
  "public/assets/art/silk-road-caravan-road-v1.jpg",
  "public/assets/art/region-oasis-ground-v1.jpg",
  "public/assets/art/region-canyon-ground-v1.jpg",
  "public/assets/art/region-mist-ground-v1.jpg",
  "public/assets/art/region-stardust-ground-v1.jpg"
];

for (const path of [manifestPath, noticesPath, runtimeManifestPath, ...required.map((entry) => join(root, entry))]) {
  if (!existsSync(path)) throw new Error(`缺少资产或授权文件：${relative(root, path)}`);
}

const manifest = readFileSync(manifestPath, "utf8");
const notices = readFileSync(noticesPath, "utf8");
const runtimeManifest = readFileSync(runtimeManifestPath, "utf8");
if (!manifest.includes("CC0 1.0 Universal") || !notices.includes("MIT License")) {
  throw new Error("资产清单或第三方声明缺少明确许可证");
}
if (!manifest.includes("CC BY") || !manifest.includes("原创生成四区域地貌材质") || !manifest.includes("原创四区域连续高度场与动态远景")) {
  throw new Error("v7 资产清单缺少 CC BY 审核规则或原创区域材质记录");
}
if (!runtimeManifest.includes("runtimeAssetManifest") || !runtimeManifest.includes("bossAnimationSets") || !runtimeManifest.includes("characterAnimationSets")
  || !runtimeManifest.includes("oasisMaterialSets") || !runtimeManifest.includes("oasisEnvironmentClusters") || !runtimeManifest.includes("oasisInteractionAnchors")) {
  throw new Error("缺少机器可读资产或动画清单");
}
if (!runtimeManifest.includes("assets/models/runtime/desktop/") || !runtimeManifest.includes("assets/models/runtime/mobile/")) {
  throw new Error("机器可读清单没有登记桌面与移动端运行模型");
}
const declaredLicenses = [...runtimeManifest.matchAll(/license:\s*"([^"]+)"/g)].map((match) => match[1]);
const acceptedLicenses = new Set(["Project Original", "CC0-1.0", "CC-BY-4.0"]);
for (const license of declaredLicenses) {
  if (!acceptedLicenses.has(license)) throw new Error(`运行时资产声明了禁止或未知许可证：${license}`);
}

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const sourceFiles = walk(join(root, "src")).filter((path) => [".ts", ".css"].includes(extname(path)));
for (const path of sourceFiles) {
  const source = readFileSync(path, "utf8");
  if (/load(?:Async)?\(\s*["'`]https?:\/\//.test(source)) {
    throw new Error(`运行时禁止加载未登记的远程资产：${relative(root, path)}`);
  }
}

const assetFiles = walk(join(root, "public/assets"));
for (const path of assetFiles) {
  const size = statSync(path).size;
  if (size > 8 * 1024 * 1024) throw new Error(`单项运行资产超过 8MB 移动端预算：${relative(root, path)}`);
}
const runtimeGlbs = assetFiles.filter((path) => path.includes("/models/runtime/") && extname(path) === ".glb");
if (runtimeGlbs.length < 20) throw new Error(`运行模型不足：仅发现 ${runtimeGlbs.length} 个桌面/移动 GLB`);
for (const path of runtimeGlbs) {
  const binary = readFileSync(path);
  const source = binary.toString("latin1");
  if (!source.includes("EXT_meshopt_compression") || !source.includes("EXT_texture_webp")) {
    throw new Error(`运行 GLB 未同时启用 Meshopt 与 WebP：${relative(root, path)}`);
  }
}
const deployedAssetBytes = assetFiles.reduce((sum, path) => sum + statSync(path).size, 0);
if (deployedAssetBytes > 55 * 1024 * 1024) {
  throw new Error(`绿洲标杆运行资产超过 55MB 桌面压缩预算：${(deployedAssetBytes / 1024 / 1024).toFixed(1)}MB`);
}

console.log(`资产审计通过：${required.length} 项关键资产、${assetFiles.length} 个本地文件、${(deployedAssetBytes / 1024 / 1024).toFixed(1)}MB 部署资产、许可证副本与单文件移动端预算均有效。`);
