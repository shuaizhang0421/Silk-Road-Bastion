import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const manifestPath = join(root, "public/assets/ASSET_MANIFEST.md");
const noticesPath = join(root, "THIRD_PARTY_NOTICES.md");
const required = [
  "public/assets/models/kenney/castle/LICENSE.txt",
  "public/assets/models/kenney/characters/LICENSE.txt",
  "public/assets/models/quaternius/character-animated.glb",
  "public/assets/art/silk-road-sandstone-v1.jpg",
  "public/assets/art/silk-road-timber-v1.jpg",
  "public/assets/art/silk-road-courtyard-paving-v1.jpg",
  "public/assets/art/silk-road-caravan-road-v1.jpg"
];

for (const path of [manifestPath, noticesPath, ...required.map((entry) => join(root, entry))]) {
  if (!existsSync(path)) throw new Error(`缺少资产或授权文件：${relative(root, path)}`);
}

const manifest = readFileSync(manifestPath, "utf8");
const notices = readFileSync(noticesPath, "utf8");
if (!manifest.includes("CC0 1.0 Universal") || !notices.includes("MIT License")) {
  throw new Error("资产清单或第三方声明缺少明确许可证");
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

console.log(`资产审计通过：${required.length} 项关键资产、许可证副本与运行时本地化均有效。`);

