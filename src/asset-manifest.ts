import type {
  AnimationSet,
  AssetManifestEntry,
  BossKind,
  EnemyType,
  EnvironmentClusterDefinition,
  InteractionAnchor,
  MaterialSetDefinition,
  RegionAssetBundle,
  VisualAssetDefinition
} from "./types";

/**
 * 运行时表现层的机器可读清单。详细许可证原文与人工修改说明仍以
 * public/assets/ASSET_MANIFEST.md 和随资产保存的 LICENSE.txt 为准。
 */
export const runtimeAssetManifest: AssetManifestEntry[] = [
  {
    id: "kenney-castle-kit",
    path: "assets/models/kenney/castle/",
    type: "model",
    author: "Kenney",
    license: "CC0-1.0",
    source: "https://kenney.nl/assets/castle-kit",
    modified: "重新组合为丝路城墙、门楼、床弩和攻城器械，并统一材质色调"
  },
  {
    id: "kenney-animated-characters",
    path: "assets/models/kenney/characters/",
    type: "model",
    author: "Kenney",
    license: "CC0-1.0",
    source: "https://kenney.nl/assets/animated-characters-protagonists",
    modified: "重新配色并添加原创丝路装备、武器、披风与阵营轮廓"
  },
  {
    id: "quaternius-character-base",
    path: "assets/models/quaternius/character-animated.glb",
    type: "model",
    author: "Quaternius",
    license: "CC0-1.0",
    source: "https://quaternius.com/packs/rpgcharacters.html",
    modified: "调整比例、材质、阴影并用于原创角色组合"
  },
  {
    id: "quaternius-medieval-village-standard",
    path: "assets/models/runtime/",
    type: "model",
    author: "Quaternius",
    license: "CC0-1.0",
    source: "https://quaternius.com/packs/medievalvillagemegakit.html",
    modified: "筛选标准版模块，统一尺寸、碰撞与丝路砂岩木构组合；导出桌面/移动 Meshopt + WebP GLB"
  },
  {
    id: "polyhaven-oasis-pbr",
    path: "assets/materials/polyhaven/",
    type: "texture",
    author: "Poly Haven",
    license: "CC0-1.0",
    source: "https://polyhaven.com/license",
    modified: "选用 1K 沙地、旧砂岩、粗木和锈蚀金属 PBR 贴图并统一色调"
  }
];

export const regionMaterialSets: Record<string, MaterialSetDefinition> = {
  sand: {
    id: "sand",
    colorPath: "assets/materials/polyhaven/aerial_sand/aerial_sand_diff_1k.jpg",
    normalPath: "assets/materials/polyhaven/aerial_sand/aerial_sand_nor_gl_1k.jpg",
    roughnessPath: "assets/materials/polyhaven/aerial_sand/aerial_sand_rough_1k.jpg",
    repeat: [5.5, 5.5],
    colorSpace: "srgb",
    regionVariant: "oasis",
    fallbackColor: 0xb89661
  },
  sandstone: {
    id: "sandstone",
    colorPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_diff_1k.jpg",
    normalPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_nor_gl_1k.jpg",
    roughnessPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_rough_1k.jpg",
    repeat: [1.5, 1.5],
    colorSpace: "srgb",
    fallbackColor: 0x8a735c
  },
  timber: {
    id: "timber",
    colorPath: "assets/materials/polyhaven/rough_wood/rough_wood_diff_1k.jpg",
    normalPath: "assets/materials/polyhaven/rough_wood/rough_wood_nor_gl_1k.jpg",
    roughnessPath: "assets/materials/polyhaven/rough_wood/rough_wood_rough_1k.jpg",
    repeat: [1.2, 1.2],
    colorSpace: "srgb",
    fallbackColor: 0x5b3c29
  },
  iron: {
    id: "iron",
    colorPath: "assets/materials/polyhaven/rusty_metal_05/rusty_metal_05_diff_1k.jpg",
    normalPath: "assets/materials/polyhaven/rusty_metal_05/rusty_metal_05_nor_gl_1k.jpg",
    roughnessPath: "assets/materials/polyhaven/rusty_metal_05/rusty_metal_05_rough_1k.jpg",
    repeat: [1.3, 1.3],
    colorSpace: "srgb",
    fallbackColor: 0x4f5553
  },
  "canyon-rock": {
    id: "canyon-rock", colorPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_diff_1k.jpg",
    normalPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_nor_gl_1k.jpg",
    roughnessPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_rough_1k.jpg",
    repeat: [2.2, 2.2], colorSpace: "srgb", regionVariant: "canyon", fallbackColor: 0x8c4e3c
  },
  "mist-masonry": {
    id: "mist-masonry", colorPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_diff_1k.jpg",
    normalPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_nor_gl_1k.jpg",
    roughnessPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_rough_1k.jpg",
    repeat: [1.8, 1.8], colorSpace: "srgb", regionVariant: "mist", fallbackColor: 0x536b67
  },
  "stardust-stone": {
    id: "stardust-stone", colorPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_diff_1k.jpg",
    normalPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_nor_gl_1k.jpg",
    roughnessPath: "assets/materials/polyhaven/old_sandstone_02/old_sandstone_02_rough_1k.jpg",
    repeat: [1.7, 1.7], colorSpace: "srgb", regionVariant: "stardust", fallbackColor: 0x676270
  }
};

/** Backward-compatible alias used by existing oasis construction helpers. */
export const oasisMaterialSets = regionMaterialSets;

export const sharedVisualAssets: Record<string, VisualAssetDefinition> = {
  gatehouse: { id: "gatehouse", desktopPath: "assets/models/runtime/desktop/Wall_UnevenBrick_Door_Round.glb", mobilePath: "assets/models/runtime/mobile/Wall_UnevenBrick_Door_Round.glb", lodDistances: [42, 88], collider: "box", materialSet: "sandstone", bundle: "common", triangleBudget: [12000, 4000, 900] },
  market: { id: "market", desktopPath: "assets/models/runtime/desktop/Prop_Wagon.glb", mobilePath: "assets/models/runtime/mobile/Prop_Wagon.glb", lodDistances: [36, 76], collider: "box", materialSet: "timber", bundle: "common", triangleBudget: [9000, 3200, 700] },
  workshop: { id: "workshop", desktopPath: "assets/models/runtime/desktop/Wall_UnevenBrick_Window_Wide_Round.glb", mobilePath: "assets/models/runtime/mobile/Wall_UnevenBrick_Window_Wide_Round.glb", lodDistances: [36, 76], collider: "box", materialSet: "timber", bundle: "common", triangleBudget: [10000, 3500, 800] },
  resourceWood: { id: "resourceWood", desktopPath: "assets/models/runtime/desktop/Prop_Crate.glb", mobilePath: "assets/models/runtime/mobile/Prop_Crate.glb", lodDistances: [24, 55], collider: "none", interactionAnchor: "resource-wide", bundle: "common", triangleBudget: [2200, 900, 260] },
  resourceStone: { id: "resourceStone", desktopPath: "assets/models/runtime/desktop/Wall_UnevenBrick_Straight.glb", mobilePath: "assets/models/runtime/mobile/Wall_UnevenBrick_Straight.glb", lodDistances: [24, 55], collider: "none", interactionAnchor: "resource-wide", bundle: "common", triangleBudget: [2400, 900, 280] }
};
export const oasisVisualAssets = sharedVisualAssets;

export const oasisInteractionAnchors: Record<string, InteractionAnchor> = {
  "resource-wide": {
    id: "resource-wide",
    radius: 2.45,
    lineOfSightHeight: 1.1,
    bounds: [5.4, 3.2, 5.4],
    pathTolerance: 0.42,
    approachOffsets: [
      { x: 2.6, z: 0 }, { x: 1.84, z: 1.84 }, { x: 0, z: 2.6 }, { x: -1.84, z: 1.84 },
      { x: -2.6, z: 0 }, { x: -1.84, z: -1.84 }, { x: 0, z: -2.6 }, { x: 1.84, z: -1.84 }
    ]
  }
};

export const regionEnvironmentClusters: EnvironmentClusterDefinition[] = [
  { id: "canal-greenbelt", regionId: "oasis", assets: ["palm", "reed", "water-trough"], minSpacing: 3.2, clearRadius: 4.5, placement: "water-edge", slopeRange: [0, 0.24], waterDistance: [0, 8], roadDistance: [5, 32], density: 0.82, rotationRange: [-3.14, 3.14], exclusionTags: ["fort", "resource"] },
  { id: "caravan-stop", regionId: "oasis", assets: ["wagon", "crate", "awning"], minSpacing: 2.4, clearRadius: 7.5, placement: "road-stop", slopeRange: [0, 0.16], roadDistance: [3, 8], density: 0.28, rotationRange: [-0.35, 0.35], exclusionTags: ["resource", "lane"] },
  { id: "foothill-rocks", regionId: "oasis", assets: ["outcrop", "scrub"], minSpacing: 4.6, clearRadius: 3.8, placement: "slope-foot", slopeRange: [0.18, 0.7], roadDistance: [12, 60], density: 0.58, rotationRange: [-3.14, 3.14], exclusionTags: ["resource"] },
  { id: "oasis-resource-pocket", regionId: "oasis", assets: ["resourceWood", "resourceStone"], minSpacing: 8, clearRadius: 5.5, placement: "resource-pocket", slopeRange: [0, 0.18], roadDistance: [4, 22], density: 0.5, rotationRange: [-1.2, 1.2], exclusionTags: ["water", "boundary"] },
  { id: "quarry-workface", regionId: "canyon", assets: ["cut-rock", "stone-stack", "winch"], minSpacing: 4.8, clearRadius: 5.5, placement: "rock-face", slopeRange: [0.18, 0.72], roadDistance: [7, 30], density: 0.72, rotationRange: [-0.8, 0.8], exclusionTags: ["lane"] },
  { id: "quarry-resource-pocket", regionId: "canyon", assets: ["resourceStone", "resourceWood", "resourceGear"], minSpacing: 8, clearRadius: 5.8, placement: "resource-pocket", slopeRange: [0, 0.2], roadDistance: [3, 20], density: 0.56, rotationRange: [-1.2, 1.2], exclusionTags: ["boundary"] },
  { id: "harbor-causeway", regionId: "mist", assets: ["broken-wall", "bollard", "dock-timber"], minSpacing: 3.8, clearRadius: 4.8, placement: "road-stop", slopeRange: [0, 0.14], waterDistance: [0, 9], roadDistance: [2, 10], density: 0.65, rotationRange: [-0.5, 0.5], exclusionTags: ["resource", "lane"] },
  { id: "mist-resource-pocket", regionId: "mist", assets: ["resourceWood", "resourceStone", "resourceGear"], minSpacing: 8, clearRadius: 5.8, placement: "resource-pocket", slopeRange: [0, 0.16], waterDistance: [5, 20], roadDistance: [4, 22], density: 0.52, rotationRange: [-1.2, 1.2], exclusionTags: ["water", "boundary"] },
  { id: "astral-observatory", regionId: "stardust", assets: ["observatory-pier", "gear-rail", "crystal-seam"], minSpacing: 5.4, clearRadius: 6.2, placement: "rock-face", slopeRange: [0.08, 0.55], roadDistance: [8, 32], density: 0.48, rotationRange: [-0.65, 0.65], exclusionTags: ["lane"] },
  { id: "stardust-resource-pocket", regionId: "stardust", assets: ["resourceStone", "resourceGear", "resourceWood"], minSpacing: 8, clearRadius: 5.8, placement: "resource-pocket", slopeRange: [0, 0.18], roadDistance: [4, 22], density: 0.54, rotationRange: [-1.2, 1.2], exclusionTags: ["boundary"] }
];
export const oasisEnvironmentClusters = regionEnvironmentClusters.filter((cluster) => cluster.regionId === "oasis");

const commonAssets = ["gatehouse", "market", "workshop", "resourceWood", "resourceStone"] as const;
const regionBundle = (regionId: string, previewAssets: readonly string[]): RegionAssetBundle => ({
  id: `${regionId}-bundle`, regionId, commonAssets, regionAssets: [`region-${regionId}-ground`, `${regionId}-landmark`, `${regionId}-ecology`], previewAssets,
  desktopPaths: [`assets/art/region-${regionId}-ground-v1.jpg`], mobilePaths: [`assets/art/region-${regionId}-ground-v1.jpg`],
  loadStage: regionId === "oasis" ? "title-preview" : "region-entry", release: "dispose-on-exit", compressedBudgetMb: [25, 55]
});

export const regionAssetBundles: Record<string, RegionAssetBundle> = {
  oasis: regionBundle("oasis", ["oasis-channel", "caravan-stop"]),
  canyon: regionBundle("canyon", ["quarry-terraces", "rock-gate"]),
  mist: regionBundle("mist", ["harbor-beacon", "raised-causeway"]),
  stardust: regionBundle("stardust", ["astral-observatory", "crystal-seam"])
};

export const characterAnimationSets: Record<"player" | EnemyType, AnimationSet> = {
  player: { idle: "Idle", run: "Run", aim: "Attack", attack: "Attack", hit: "project-hit-reaction", defeat: "project-fall" },
  raider: { idle: "Idle", run: "Run", attack: "Attack", hit: "project-hit-reaction", defeat: "project-fall" },
  shield: { idle: "Idle", run: "Run", attack: "Attack", hit: "project-shield-stagger", defeat: "project-fall" },
  sapper: { idle: "Idle", run: "Run", aim: "project-fuse-windup", attack: "Attack", hit: "project-hit-reaction", defeat: "project-fall" },
  looter: { idle: "Idle", run: "Run", attack: "Attack", hit: "project-hit-reaction", defeat: "project-fall" },
  archer: { idle: "Idle", run: "Run", aim: "project-bow-aim", attack: "Attack", hit: "project-hit-reaction", defeat: "project-fall" },
  flyer: { idle: "project-hover", run: "project-flight", aim: "project-dive-windup", attack: "project-dive", hit: "project-mechanical-wobble", defeat: "project-fall" },
  ram: { idle: "project-beast-idle", run: "project-heavy-march", aim: "project-charge-windup", attack: "project-ram", hit: "project-armor-stagger", defeat: "project-fall" }
};

export const bossAnimationSets: Record<BossKind, AnimationSet> = {
  "shield-commander": { idle: "Idle", run: "Run", aim: "project-formation", attack: "project-shockwave", hit: "project-shield-stagger", defeat: "project-fall" },
  "sapper-captain": { idle: "Idle", run: "Run", aim: "project-plant-charge", attack: "project-detonate", hit: "project-hit-reaction", defeat: "project-fall" },
  "kite-swarm": { idle: "project-hover", run: "project-flight", aim: "project-split", attack: "project-dive", hit: "project-mechanical-wobble", defeat: "project-fall" },
  "siege-beast": { idle: "project-beast-idle", run: "project-heavy-march", aim: "project-charge-windup", attack: "project-ram", hit: "project-armor-stagger", defeat: "project-fall" }
};
