import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const root = process.cwd();

function glbJson(path) {
  const bytes = readFileSync(path);
  if (bytes.toString("ascii", 0, 4) !== "glTF") throw new Error(`不是有效 GLB：${path}`);
  const jsonLength = bytes.readUInt32LE(12);
  const chunkType = bytes.toString("ascii", 16, 20);
  if (chunkType !== "JSON") throw new Error(`GLB 首块不是 JSON：${path}`);
  return JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength).replace(/\u0000+$/g, "").trim());
}

function triangleCount(gltf) {
  return (gltf.meshes ?? []).reduce((sum, mesh) => sum + (mesh.primitives ?? []).reduce((meshSum, primitive) => {
    const accessor = gltf.accessors?.[primitive.indices];
    if (!accessor) return meshSum;
    const mode = primitive.mode ?? 4;
    return meshSum + (mode === 4 ? Math.floor(accessor.count / 3) : Math.max(0, accessor.count - 2));
  }, 0), 0);
}

const heroPath = join(root, "public/assets/models/quaternius/character-animated.glb");
const hero = glbJson(heroPath);
const animationNames = new Set((hero.animations ?? []).map((animation) => animation.name));
const requiredClips = ["Idle", "Run", "Attacking_Idle", "Dagger_Attack", "Dagger_Attack2", "Punch", "PickUp", "RecieveHit", "RecieveHit_Attacking", "Death"];
for (const clip of requiredClips) {
  if (!animationNames.has(clip)) throw new Error(`角色基模缺少清单要求的真实动画：${clip}`);
}
const heroTriangles = triangleCount(hero);
if (heroTriangles <= 0 || heroTriangles > 25000) throw new Error(`角色 LOD0 三角面异常：${heroTriangles}`);

const desktopDir = join(root, "public/assets/models/runtime/desktop");
const mobileDir = join(root, "public/assets/models/runtime/mobile");
const authoredDesktopDir = join(root, "public/assets/models/authored/desktop");
const authoredMobileDir = join(root, "public/assets/models/authored/mobile");
const desktop = readdirSync(desktopDir).filter((file) => file.endsWith(".glb")).sort();
const mobile = readdirSync(mobileDir).filter((file) => file.endsWith(".glb")).sort();
for (const file of desktop) {
  if (!mobile.includes(file)) throw new Error(`缺少对应移动端 LOD：${file}`);
  const desktopJson = glbJson(join(desktopDir, file));
  const mobileJson = glbJson(join(mobileDir, file));
  const high = triangleCount(desktopJson);
  const low = triangleCount(mobileJson);
  if (high <= 0 || low <= 0) throw new Error(`运行模型没有可渲染三角面：${file}`);
  if (low > high) throw new Error(`移动端 LOD 比桌面模型更复杂：${file} (${low} > ${high})`);
}
for (const file of mobile) if (!desktop.includes(file)) throw new Error(`缺少对应桌面模型：${file}`);

const authoredPairs = ["silk-road-ballista.glb"];
for (const file of authoredPairs) {
  const high = glbJson(join(authoredDesktopDir, file));
  const low = glbJson(join(authoredMobileDir, file));
  const highTriangles = triangleCount(high);
  const lowTriangles = triangleCount(low);
  if (highTriangles <= 0 || lowTriangles <= 0 || lowTriangles > highTriangles) throw new Error(`原创模型 LOD 预算异常：${file}`);
  const nodeNames = (high.nodes ?? []).map((node) => node.name ?? "");
  for (const part of ["anchor-0", "carriage-spine", "swivel", "bow-arm-1", "loaded-bolt"]) {
    if (!nodeNames.includes(part)) throw new Error(`原创床弩缺少结构部件：${part}`);
  }
  if (nodeNames.some((name) => /platform|foundation|floor-slab/i.test(name))) throw new Error("原创床弩重新引入了整块矩形底板");
}

const manifest = readFileSync(join(root, "src/asset-manifest.ts"), "utf8");
if (/project-(?:hit|fall|bow|fuse|shield|hover|flight|dive|beast|heavy|charge|ram|armor)/.test(manifest)) {
  throw new Error("动画清单仍含不存在于真实骨骼资源中的占位动作名");
}
for (const path of [heroPath, ...desktop.map((file) => join(desktopDir, file)), ...mobile.map((file) => join(mobileDir, file))]) {
  if (!existsSync(path)) throw new Error(`视觉资产缺失：${basename(path)}`);
}

console.log(`视觉资产检查通过：角色 ${heroTriangles} 三角面、${requiredClips.length} 个真实动作、${desktop.length} 组公共 LOD、${authoredPairs.length} 组原创实体 LOD。`);
