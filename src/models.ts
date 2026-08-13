import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { regionAssetBundles } from "./asset-manifest";
import type { BossKind, BuildingType, EnemyType, RegionDefinition } from "./types";

const ASSET_ROOT = "./assets/models/kenney";
const RUNTIME_VILLAGE_ROOT = "./assets/models/runtime";

type CharacterKind = "ranger" | "raider" | "brute";
type MaterialSurface = "stone" | "wood" | "iron" | "sand";

interface SurfaceTextureSet {
  color: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
}

// 运行时加载的原创材质由所有程序化建筑共用；只读贴图不会增加每座建筑的显存副本。
const surfaceMaps: Partial<Record<MaterialSurface, SurfaceTextureSet>> = {};

function makeCharacterShell(kind: CharacterKind, accent: number): THREE.Group {
  const group = new THREE.Group();
  const clothColor = kind === "ranger" ? 0x2f756e : kind === "raider" ? 0x8c4438 : 0x4d4944;
  const cloth = material(clothColor, 0.9);
  const leather = material(kind === "ranger" ? 0x6f4d32 : 0x4d3428, 0.92);
  const skin = material(kind === "brute" ? 0xa46f4d : 0xb9835d, 0.86);
  const metal = material(0x8d9996, 0.45, 0.58);

  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.54, 0.9, 8), cloth);
  robe.position.y = 1.14;
  robe.castShadow = true;
  group.add(robe);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.62, 5, 10), cloth);
  torso.position.y = 1.65;
  torso.castShadow = true;
  group.add(torso);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.12, 10), leather);
  belt.position.y = 1.28;
  belt.castShadow = true;
  group.add(belt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 12), skin);
  head.position.y = 2.36;
  head.castShadow = true;
  group.add(head);

  const turban = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.68), cloth);
  turban.position.y = 2.49;
  turban.castShadow = true;
  group.add(turban);

  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.33, 0.075, 8, 16),
    material(kind === "ranger" ? accent : 0x704333, 0.92)
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 2.06;
  scarf.castShadow = true;
  group.add(scarf);

  const tunicPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.82, 0.055),
    material(kind === "ranger" ? 0x244f4c : 0x50352f, 0.94)
  );
  tunicPanel.position.set(0, 1.45, 0.38);
  tunicPanel.castShadow = true;
  group.add(tunicPanel);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.08), metal);
  buckle.position.set(0, 1.29, 0.44);
  buckle.castShadow = true;
  group.add(buckle);

  const makeLimb = (name: string, x: number, y: number, length: number, radius: number, limbMaterial: THREE.Material): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.userData.limb = name;
    const part = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 8), limbMaterial);
    part.position.y = -length * 0.45;
    part.castShadow = true;
    pivot.add(part);
    group.add(pivot);
    return pivot;
  };

  const leftArm = makeLimb("left-arm", -0.46, 1.95, 0.9, 0.13, cloth);
  const rightArm = makeLimb("right-arm", 0.46, 1.95, 0.9, 0.13, cloth);
  leftArm.rotation.z = -0.12;
  rightArm.rotation.z = 0.12;
  makeLimb("left-leg", -0.2, 1.02, 0.95, 0.15, leather);
  makeLimb("right-leg", 0.2, 1.02, 0.95, 0.15, leather);

  for (const x of [-0.45, 0.45]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 7), kind === "brute" ? metal : leather);
    shoulder.scale.set(1.35, 0.65, 1.05);
    shoulder.position.set(x, 1.98, 0);
    shoulder.castShadow = true;
    group.add(shoulder);
  }

  if (kind === "ranger") {
    const satchel = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), leather);
    satchel.scale.set(1.15, 0.82, 0.72);
    satchel.position.set(-0.48, 1.13, 0.02);
    satchel.castShadow = true;
    group.add(satchel);
    const shortBlade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.58, 0.035), metal);
    shortBlade.position.set(0.5, 0.91, 0.06);
    shortBlade.rotation.z = -0.28;
    shortBlade.castShadow = true;
    group.add(shortBlade);
  } else if (kind === "raider") {
    // 沙匪：包头巾、弯刀、轻皮盾和背囊。武器挂在手臂枢轴上，因此会随攻击动作摆动。
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.78, 0.05), metal);
    blade.position.set(0.04, -0.9, 0.06);
    blade.rotation.z = -0.34;
    blade.castShadow = true;
    rightArm.add(blade);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 7), leather);
    hilt.position.set(-0.08, -0.61, 0.06);
    hilt.rotation.z = Math.PI * 0.5;
    hilt.castShadow = true;
    rightArm.add(hilt);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), material(0x785b3f, 0.72, 0.2));
    shield.position.set(0, -0.6, 0.2);
    shield.rotation.x = Math.PI * 0.5;
    shield.castShadow = true;
    leftArm.add(shield);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.64, 0.24), leather);
    pack.position.set(0, 1.35, -0.43);
    pack.rotation.x = -0.12;
    pack.castShadow = true;
    group.add(pack);
  } else if (kind === "brute") {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.2, 0.55), metal);
    chest.position.set(0, 1.7, 0.22);
    chest.castShadow = true;
    group.add(chest);
    // 盾卫/爆破手共用重甲体型，但各自通过大槌、护盔和腰间工具有不同的重量感。
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.62), metal);
    helmet.position.y = 2.57;
    helmet.castShadow = true;
    group.add(helmet);
    const clubHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 1.28, 8), leather);
    clubHandle.position.set(0.02, -0.96, 0.02);
    clubHandle.rotation.z = -0.24;
    clubHandle.castShadow = true;
    rightArm.add(clubHandle);
    const clubHead = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.46, 8), metal);
    clubHead.position.set(0.22, -1.5, 0.02);
    clubHead.rotation.z = Math.PI * 0.5 - 0.24;
    clubHead.castShadow = true;
    rightArm.add(clubHead);
    const toolBelt = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.07, 7, 14), material(accent, 0.72, 0.24));
    toolBelt.rotation.x = Math.PI * 0.5;
    toolBelt.position.y = 1.18;
    toolBelt.castShadow = true;
    group.add(toolBelt);
  }
  return group;
}

export interface CharacterRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
  setMoving: (moving: boolean) => void;
  attack: () => void;
  hit: () => void;
  defeat: () => void;
}

export class AssetLibrary {
  readonly manager = new THREE.LoadingManager();
  private gltf = new GLTFLoader(this.manager);
  private fbx = new FBXLoader(this.manager);
  private textureLoader = new THREE.TextureLoader(this.manager);
  private models = new Map<string, THREE.Object3D>();
  private textures = new Map<CharacterKind, THREE.Texture>();
  private worldTextures = new Map<string, THREE.Texture>();
  private loadedRegionId = "oasis";
  private regionLoad?: Promise<void>;
  private characterBase?: THREE.Group;
  private idleClip?: THREE.AnimationClip;
  private runClip?: THREE.AnimationClip;
  private heroBase?: THREE.Group;
  private heroAnimations: THREE.AnimationClip[] = [];

  constructor(onProgress: (loaded: number, total: number) => void) {
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.manager.onProgress = (_url, loaded, total) => onProgress(loaded, total);
  }

  async load(): Promise<void> {
    const modelNames = [
      "gate",
      "wall",
      "wall-corner",
      "wall-doorway",
      "wall-pillar",
      "tower-hexagon-base",
      "tower-hexagon-mid",
      "tower-hexagon-roof",
      "siege-ballista",
      "siege-ram",
      "rocks-large",
      "rocks-small",
      "tree-large",
      "tree-small",
      "flag-banner-long"
    ];

    const glbJobs = modelNames.map(async (name) => {
      const result = await this.gltf.loadAsync(`${ASSET_ROOT}/castle/${name}.glb`);
      result.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.models.set(name, result.scene);
    });
    const villageModels = {
      "village-wall": "Wall_UnevenBrick_Straight",
      "village-arch": "Wall_UnevenBrick_Door_Round",
      "village-door-frame": "DoorFrame_Round_Brick",
      "village-door": "Door_2_Round",
      "village-window-wall": "Wall_UnevenBrick_Window_Wide_Round",
      "village-crate": "Prop_Crate",
      "village-wagon": "Prop_Wagon",
      "village-fence": "Prop_WoodenFence_Single",
      "village-balcony": "Balcony_Cross_Straight",
      "village-chimney": "Prop_Chimney"
    } as const;
    const villageRuntimeRoot = window.matchMedia?.("(pointer: coarse)").matches
      ? `${RUNTIME_VILLAGE_ROOT}/mobile`
      : `${RUNTIME_VILLAGE_ROOT}/desktop`;
    const authoredRuntimeRoot = window.matchMedia?.("(pointer: coarse)").matches
      ? "./assets/models/authored/mobile"
      : "./assets/models/authored/desktop";
    const villageJobs = Object.entries(villageModels).map(async ([alias, file]) => {
      const result = await this.gltf.loadAsync(`${villageRuntimeRoot}/${file}.glb`);
      result.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      this.models.set(alias, result.scene);
    });

    const heroJob = this.gltf.loadAsync("./assets/models/quaternius/character-animated.glb");
    const authoredBallistaJob = this.gltf.loadAsync(`${authoredRuntimeRoot}/silk-road-ballista.glb`).then((result) => {
      result.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      this.models.set("silk-road-ballista", result.scene);
    });
    const stoneSurfaceJob = this.textureLoader.loadAsync("./assets/art/silk-road-sandstone-v1.jpg");
    const woodSurfaceJob = this.textureLoader.loadAsync("./assets/art/silk-road-timber-v1.jpg");
    const courtyardPavingJob = this.textureLoader.loadAsync("./assets/art/silk-road-courtyard-paving-v1.jpg");
    const caravanRoadJob = this.textureLoader.loadAsync("./assets/art/silk-road-caravan-road-v1.jpg");
    // 标题只需要绿洲轻量包；其他三区在进入区域时按需加载，避免首包同时下载四张地表。
    const oasisGroundJob = this.textureLoader.loadAsync("./assets/art/region-oasis-ground-v1.jpg");
    const pbrSurfaceJobs = ([
      ["sand", "aerial_sand"],
      ["stone", "old_sandstone_02"],
      ["wood", "rough_wood"],
      ["iron", "rusty_metal_05"]
    ] as const).map(async ([surface, asset]) => {
      const root = `./assets/materials/polyhaven/${asset}/${asset}`;
      const [color, normal, roughness] = await Promise.all([
        this.textureLoader.loadAsync(`${root}_diff_1k.jpg`),
        this.textureLoader.loadAsync(`${root}_nor_gl_1k.jpg`),
        this.textureLoader.loadAsync(`${root}_rough_1k.jpg`)
      ]);
      return [surface, { color, normal, roughness }] as const;
    });
    const [character, idle, run, ranger, raider, brute, stoneSurface, woodSurface, courtyardPaving, caravanRoad, oasisGround] = await Promise.all([
      this.fbx.loadAsync(`${ASSET_ROOT}/characters/model/characterMedium.fbx`),
      this.fbx.loadAsync(`${ASSET_ROOT}/characters/animations/idle.fbx`),
      this.fbx.loadAsync(`${ASSET_ROOT}/characters/animations/run.fbx`),
      this.textureLoader.loadAsync(`${ASSET_ROOT}/characters/skins/ranger.png`),
      this.textureLoader.loadAsync(`${ASSET_ROOT}/characters/skins/raider.png`),
      this.textureLoader.loadAsync(`${ASSET_ROOT}/characters/skins/brute.png`),
      stoneSurfaceJob,
      woodSurfaceJob,
      courtyardPavingJob,
      caravanRoadJob,
      oasisGroundJob,
      ...glbJobs,
      ...villageJobs,
      authoredBallistaJob
    ]);

    for (const texture of [ranger, raider, brute]) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
    }
    this.characterBase = character;
    this.idleClip = idle.animations[0];
    this.runClip = run.animations[0];
    this.textures.set("ranger", ranger);
    this.textures.set("raider", raider);
    this.textures.set("brute", brute);
    for (const [surface, texture] of [["stone", stoneSurface], ["wood", woodSurface]] as const) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(surface === "stone" ? 1.3 : 1.1, surface === "stone" ? 1.3 : 1.1);
      surfaceMaps[surface] = { color: texture };
    }
    courtyardPaving.colorSpace = THREE.SRGBColorSpace;
    courtyardPaving.wrapS = THREE.RepeatWrapping;
    courtyardPaving.wrapT = THREE.RepeatWrapping;
    this.worldTextures.set("courtyard-paving", courtyardPaving);
    caravanRoad.colorSpace = THREE.SRGBColorSpace;
    caravanRoad.wrapS = THREE.RepeatWrapping;
    caravanRoad.wrapT = THREE.RepeatWrapping;
    caravanRoad.repeat.set(1.18, 5.6);
    this.worldTextures.set("caravan-road", caravanRoad);
    this.prepareRegionTexture(oasisGround);
    this.worldTextures.set("region-oasis", oasisGround);
    const pbrSurfaces = await Promise.all(pbrSurfaceJobs);
    for (const [surface, maps] of pbrSurfaces) {
      maps.color.colorSpace = THREE.SRGBColorSpace;
      for (const texture of [maps.color, maps.normal, maps.roughness]) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const repeat = surface === "sand" ? 5.5 : surface === "stone" ? 1.5 : surface === "wood" ? 1.2 : 1.3;
        texture.repeat.set(repeat, repeat);
      }
      surfaceMaps[surface] = maps;
      this.worldTextures.set(`pbr-${surface}-color`, maps.color);
      this.worldTextures.set(`pbr-${surface}-normal`, maps.normal);
      this.worldTextures.set(`pbr-${surface}-roughness`, maps.roughness);
    }
    const hero = await heroJob;
    hero.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.heroBase = hero.scene;
    this.heroAnimations = hero.animations;
  }

  private prepareRegionTexture(texture: THREE.Texture): void {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4.2, 3.7);
    texture.anisotropy = window.matchMedia?.("(pointer: coarse)").matches ? 2 : 4;
  }

  /** Load one regional visual pack and release the previous regional ground texture. */
  async ensureRegionBundle(regionId: string): Promise<void> {
    if (this.loadedRegionId === regionId && this.worldTextures.has(`region-${regionId}`)) return;
    const bundle = regionAssetBundles[regionId];
    if (!bundle) throw new Error(`未知区域资源包: ${regionId}`);
    if (this.regionLoad) await this.regionLoad;
    if (this.loadedRegionId === regionId && this.worldTextures.has(`region-${regionId}`)) return;
    const cached = this.worldTextures.get(`region-${regionId}`);
    if (cached) {
      const previous = this.worldTextures.get(`region-${this.loadedRegionId}`);
      if (previous && this.loadedRegionId !== "oasis") {
        previous.dispose();
        this.worldTextures.delete(`region-${this.loadedRegionId}`);
      }
      this.loadedRegionId = regionId;
      return;
    }
    this.regionLoad = (async () => {
      const path = bundle.desktopPaths[0];
      if (!path) throw new Error(`区域资源包缺少地表: ${bundle.id}`);
      const texture = await this.textureLoader.loadAsync(`./${path}`);
      this.prepareRegionTexture(texture);
      const previousKey = `region-${this.loadedRegionId}`;
      const previous = this.worldTextures.get(previousKey);
      if (previous && this.loadedRegionId !== "oasis") {
        previous.dispose();
        this.worldTextures.delete(previousKey);
      }
      this.worldTextures.set(`region-${regionId}`, texture);
      this.loadedRegionId = regionId;
    })();
    try {
      await this.regionLoad;
    } finally {
      this.regionLoad = undefined;
    }
  }

  model(name: string, tint?: number, tintStrength = 0.16): THREE.Object3D {
    const original = this.models.get(name);
    if (!original) throw new Error(`缺少 3D 模型: ${name}`);
    const copy = original.clone(true);
    copy.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else {
        child.material = child.material.clone();
      }
      if (tint !== undefined) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.color.lerp(new THREE.Color(tint), tintStrength);
          }
        }
      }
      const surface: MaterialSurface | undefined = name.startsWith("wall") || name.startsWith("tower")
        ? "stone"
        : name === "siege-ballista" || name === "siege-ram"
          ? "wood"
          : undefined;
      if (surface && surfaceMaps[surface]) {
        const maps = surfaceMaps[surface]!;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.map = maps.color;
          material.normalMap = maps.normal ?? null;
          material.normalScale.setScalar(surface === "stone" ? 0.7 : 0.48);
          material.roughnessMap = maps.roughness ?? null;
          material.color.lerp(new THREE.Color(0xffffff), surface === "stone" ? 0.56 : 0.42);
          material.roughness = surface === "stone" ? 0.88 : 0.78;
          material.needsUpdate = true;
        }
      }
    });
    return copy;
  }

  hasModel(name: string): boolean {
    return this.models.has(name);
  }

  /** Structural modules use exact axis fitting; natural props retain authored proportions. */
  fittedModel(name: string, size: [number, number, number], tint?: number, tintStrength = 0.08, mode?: "contain" | "axis-fit"): THREE.Object3D {
    const object = this.model(name, tint, tintStrength);
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const measured = bounds.getSize(new THREE.Vector3());
    const naturalProp = name === "village-wagon" || name === "village-door";
    const fitMode = mode ?? (naturalProp ? "contain" : "axis-fit");
    if (fitMode === "contain") {
      const scale = Math.min(
        measured.x > 0 ? size[0] / measured.x : 1,
        measured.y > 0 ? size[1] / measured.y : 1,
        measured.z > 0 ? size[2] / measured.z : 1
      );
      object.scale.multiplyScalar(scale);
    } else {
      object.scale.multiply(new THREE.Vector3(
        measured.x > 0 ? size[0] / measured.x : 1,
        measured.y > 0 ? size[1] / measured.y : 1,
        measured.z > 0 ? size[2] / measured.z : 1
      ));
    }
    object.updateMatrixWorld(true);
    const fittedBounds = new THREE.Box3().setFromObject(object);
    const center = fittedBounds.getCenter(new THREE.Vector3());
    object.position.set(-center.x, -fittedBounds.min.y, -center.z);
    return object;
  }

  worldTexture(name: string): THREE.Texture | undefined {
    return this.worldTextures.get(name);
  }

  character(kind: CharacterKind, accent = 0x3e8076): CharacterRig {
    if (!this.characterBase) throw new Error("人物模型尚未加载");
    const container = new THREE.Group();
    if (this.heroBase) {
      const hero = skeletonClone(this.heroBase) as THREE.Group;
      hero.updateMatrixWorld(true);
      const rawBounds = new THREE.Box3().setFromObject(hero);
      const rawSize = rawBounds.getSize(new THREE.Vector3());
      const heroScale = rawSize.y > 0 ? 4.25 / rawSize.y : 1;
      hero.scale.setScalar(heroScale);
      hero.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(hero);
      const center = bounds.getCenter(new THREE.Vector3());
      hero.position.set(-center.x, -bounds.min.y, -center.z);
      hero.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        child.material = materials.map((source) => {
          const next = source.clone();
          if (next instanceof THREE.MeshStandardMaterial) {
            next.roughness = 0.82;
            if (next.name === "Detail" || next.name === "Shirt" || next.name === "Pants") {
              const factionColor = kind === "ranger" ? accent : kind === "raider" ? 0x8b4638 : 0x4f5b5c;
              next.color.lerp(new THREE.Color(factionColor), kind === "ranger" ? 0.2 : 0.46);
            }
          }
          return next;
        });
        if (child.material.length === 1) child.material = child.material[0]!;
      });
      container.add(hero);
      const leather = new THREE.MeshStandardMaterial({ color: 0x5d422d, roughness: 0.9 });
      const metal = new THREE.MeshStandardMaterial({ color: 0x7e8988, roughness: 0.38, metalness: 0.64 });
      if (kind === "ranger") {
        const cape = new THREE.Mesh(
          new THREE.ConeGeometry(0.72, 2.05, 8, 1, true, 0, Math.PI * 1.35),
          new THREE.MeshStandardMaterial({ color: 0x315f59, roughness: 0.96, side: THREE.DoubleSide })
        );
        cape.position.set(0, 2.28, -0.28);
        cape.rotation.y = -0.7;
        cape.rotation.x = -0.09;
        cape.castShadow = true;
        container.add(cape);
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.36), leather);
        pack.position.set(0, 2.05, -0.5);
        pack.rotation.x = -0.08;
        pack.castShadow = true;
        container.add(pack);
        const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3.35, 8), leather);
        spear.position.set(0.58, 2.2, -0.28);
        spear.rotation.z = -0.13;
        spear.userData.attackWeapon = true;
        spear.castShadow = true;
        const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.48, 6), metal);
        spearTip.position.set(0.79, 3.84, -0.28);
        spearTip.rotation.z = -0.13;
        spearTip.castShadow = true;
        container.add(spear, spearTip);
      } else if (kind === "raider") {
        // 沙匪用包头巾、弯刀、圆盾和货囊建立与行者明显不同的轮廓。
        const turban = new THREE.Mesh(new THREE.SphereGeometry(0.43, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.64), new THREE.MeshStandardMaterial({ color: 0x764138, roughness: 0.92 }));
        turban.position.set(0, 3.9, 0);
        turban.castShadow = true;
        const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.3), leather);
        satchel.position.set(-0.3, 2.02, -0.48);
        satchel.rotation.z = 0.15;
        satchel.castShadow = true;
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.25, 0.055), metal);
        sword.position.set(0.8, 1.72, 0.16);
        sword.rotation.z = -0.56;
        sword.userData.attackWeapon = true;
        sword.castShadow = true;
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0x76563b, roughness: 0.65, metalness: 0.22 }));
        shield.position.set(-0.72, 2.12, 0.24);
        shield.rotation.x = Math.PI * 0.5;
        shield.castShadow = true;
        container.add(turban, satchel, sword, shield);
      } else {
        // 重甲兵体型更宽，护盔、胸甲、大盾和重锤在俯视角仍能一眼辨认。
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), metal);
        helmet.position.set(0, 3.92, 0);
        helmet.castShadow = true;
        const breastplate = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.82, 0.32), metal);
        breastplate.position.set(0, 2.56, 0.38);
        breastplate.castShadow = true;
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0x52605e, roughness: 0.48, metalness: 0.54 }));
        shield.position.set(-0.86, 2.22, 0.22);
        shield.rotation.x = Math.PI * 0.5;
        shield.castShadow = true;
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 1.7, 8), leather);
        handle.position.set(0.78, 1.7, 0.05);
        handle.rotation.z = -0.32;
        handle.userData.attackWeapon = true;
        handle.castShadow = true;
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.55, 8), metal);
        head.position.set(1.08, 1.0, 0.05);
        head.rotation.z = Math.PI * 0.5 - 0.32;
        head.castShadow = true;
        container.add(helmet, breastplate, shield, handle, head);
      }
      container.userData.baseScale = 1;
      container.userData.characterRoot = true;
      container.userData.moving = false;
      const mixer = new THREE.AnimationMixer(hero);
      const idleClip = THREE.AnimationClip.findByName(this.heroAnimations, "Idle");
      const runClip = THREE.AnimationClip.findByName(this.heroAnimations, "Run");
      const attackClip = THREE.AnimationClip.findByName(this.heroAnimations, kind === "brute" ? "Punch" : "Dagger_Attack");
      const hitClip = THREE.AnimationClip.findByName(this.heroAnimations, "RecieveHit");
      const defeatClip = THREE.AnimationClip.findByName(this.heroAnimations, "Death");
      const idle = idleClip ? mixer.clipAction(idleClip) : null;
      const run = runClip ? mixer.clipAction(runClip) : null;
      const attackAction = attackClip ? mixer.clipAction(attackClip) : null;
      const hitAction = hitClip ? mixer.clipAction(hitClip) : null;
      const defeatAction = defeatClip ? mixer.clipAction(defeatClip) : null;
      idle?.play();
      let moving = false;
      let oneShot: THREE.AnimationAction | null = null;
      const locomotion = () => moving ? run : idle;
      const playOneShot = (action: THREE.AnimationAction | null, lock = false) => {
        if (!action || (lock && container.userData.defeated)) return;
        oneShot?.stop();
        locomotion()?.fadeOut(0.08);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.fadeIn(0.06).play();
        oneShot = action;
        if (lock) container.userData.defeated = true;
        const onFinished = (event: { action: THREE.AnimationAction }) => {
          if (event.action !== action) return;
          mixer.removeEventListener("finished", onFinished);
          if (!lock) {
            oneShot = null;
            locomotion()?.reset().fadeIn(0.12).play();
          }
        };
        mixer.addEventListener("finished", onFinished);
      };
      return {
        root: container,
        mixer,
        idle,
        run,
        setMoving(next) {
          if (next === moving) return;
          moving = next;
          container.userData.moving = next;
          if (oneShot || container.userData.defeated) return;
          const from = next ? idle : run;
          const to = next ? run : idle;
          from?.fadeOut(0.18);
          to?.reset().fadeIn(0.18).play();
        },
        attack() {
          container.userData.attackUntil = performance.now() + 310;
          playOneShot(attackAction);
        },
        hit() { playOneShot(hitAction); },
        defeat() { playOneShot(defeatAction, true); }
      };
    }
    const body = skeletonClone(this.characterBase) as THREE.Group;
    body.updateMatrixWorld(true);
    const rawBounds = new THREE.Box3().setFromObject(body);
    const rawSize = rawBounds.getSize(new THREE.Vector3());
    const normalizedScale = rawSize.y > 0 ? 1.9 / rawSize.y : 0.018;
    body.scale.setScalar(normalizedScale);
    body.updateMatrixWorld(true);
    const normalizedBounds = new THREE.Box3().setFromObject(body);
    const normalizedCenter = normalizedBounds.getCenter(new THREE.Vector3());
    body.position.x -= normalizedCenter.x;
    body.position.y -= normalizedBounds.min.y;
    body.position.z -= normalizedCenter.z;
    body.visible = false;
    body.traverse((child) => {
      if (!(child instanceof THREE.SkinnedMesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const baseMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      const material = (baseMaterial as THREE.MeshStandardMaterial).clone();
      material.map = this.textures.get(kind) ?? null;
      material.roughness = 0.82;
      child.material = material;
    });
    container.add(body);

    container.add(makeCharacterShell(kind, accent));
    container.scale.setScalar(1.78);
    container.userData.baseScale = 1.78;
    container.userData.characterRoot = true;
    container.userData.moving = false;

    const mixer = new THREE.AnimationMixer(body);
    const idle = this.idleClip ? mixer.clipAction(this.idleClip) : null;
    const run = this.runClip ? mixer.clipAction(this.runClip) : null;
    idle?.play();
    let moving = false;
    return {
      root: container,
      mixer,
      idle,
      run,
      setMoving(next) {
        if (next === moving) return;
        moving = next;
        container.userData.moving = next;
        const from = next ? idle : run;
        const to = next ? run : idle;
        from?.fadeOut(0.18);
        to?.reset().fadeIn(0.18).play();
      },
      attack() {
        container.userData.attackUntil = performance.now() + 360;
      },
      hit() { container.userData.hitUntil = performance.now() + 240; },
      defeat() { container.userData.defeated = true; }
    };
  }
}

function material(color: number, roughness = 0.84, metalness = 0.04, surface?: MaterialSurface): THREE.MeshStandardMaterial {
  const maps = surface ? surfaceMaps[surface] : undefined;
  const materialColor = maps ? new THREE.Color(color).lerp(new THREE.Color(0xffffff), surface === "stone" ? 0.58 : 0.48) : new THREE.Color(color);
  const result = new THREE.MeshStandardMaterial({
    color: materialColor,
    roughness,
    metalness,
    ...(maps ? { map: maps.color, normalMap: maps.normal, roughnessMap: maps.roughness } : {})
  });
  if (maps?.normal) result.normalScale.setScalar(surface === "stone" ? 0.7 : surface === "sand" ? 0.38 : 0.48);
  return result;
}

function mesh(
  geometry: THREE.BufferGeometry,
  color: number,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  surface?: MaterialSurface
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material(color, 0.84, 0.04, surface));
  result.position.set(...position);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

export function makeFortWallSegment(length: number, stoneColor = 0x9a7655, library?: AssetLibrary): THREE.Group {
  const group = new THREE.Group();
  if (library?.hasModel("village-wall")) {
    // Author modules retain their own edge piers. A continuous recessed masonry spine and
    // uninterrupted coping make those piers read as reinforcement, not as gaps between walls.
    const spine = mesh(new THREE.BoxGeometry(length + 0.22, 3.98, 1.42), stoneColor, [0, 2.02, 0.08], [0, 0, 0], "stone");
    spine.name = "continuous-wall-spine";
    const plinth = mesh(new THREE.BoxGeometry(length + 0.42, 0.42, 1.92), 0x765b46, [0, 0.21, 0.08], [0, 0, 0], "stone");
    plinth.name = "continuous-wall-plinth";
    const coping = mesh(new THREE.BoxGeometry(length + 0.32, 0.3, 1.9), stoneColor, [0, 4.17, 0.02], [0, 0, 0], "stone");
    coping.name = "continuous-wall-coping";
    group.add(spine, plinth, coping);
    // Do not hang authored balconies from every curtain wall. From the gameplay
    // camera they appeared as unrelated boards floating inside and outside the
    // fort. Functional defence terraces are generated by the fort layout instead.
    // Continuous inner and outer dressed faces conceal module-side borders. The authored
    // modules remain underneath for depth, corners and silhouette, while the player reads
    // one masonry curtain instead of a row of separate wall cards.
    for (const side of [-1, 1]) {
      const face = mesh(
        new THREE.BoxGeometry(length + 0.08, 3.34, 0.14),
        stoneColor,
        [0, 2.03, side * 1.02],
        [0, 0, 0]
      );
      face.name = side > 0 ? "continuous-wall-inner-face" : "continuous-wall-outer-face";
      group.add(face);
      for (const y of [1.1, 3.08]) {
        const bondBeam = mesh(new THREE.BoxGeometry(length + 0.18, 0.16, 0.18), 0x554335, [0, y, side * 1.12]);
        bondBeam.name = "continuous-wall-bond-beam";
        group.add(bondBeam);
      }
    }
    const capCount = Math.max(2, Math.floor(length / 2.25));
    for (let index = 0; index <= capCount; index += 1) {
      const crenel = mesh(new THREE.BoxGeometry(0.86, 0.7, 1.68), stoneColor, [0, 4.52, 0], [0, 0, 0], "stone");
      crenel.position.x = -length * 0.5 + length * index / capCount;
      group.add(crenel);
    }
    return group;
  }
  const paleStone = material(stoneColor, 0.96, 0.04, "stone");
  const warmStone = material(0x866247, 0.98, 0.04, "stone");
  const darkStone = material(0x59483b, 0.98, 0.02, "stone");
  const brass = material(0xb28c4d, 0.44, 0.52);
  const blockWidth = 2.35;
  const rowHeight = 1.12;
  const rows = 4;

  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : blockWidth * 0.5;
    const blocks = Math.ceil(length / blockWidth) + 1;
    for (let index = -blocks; index <= blocks; index += 1) {
      const x = index * blockWidth + offset;
      if (Math.abs(x) > length * 0.5 - 0.5) continue;
      const width = Math.min(blockWidth - 0.08, length - Math.abs(x) * 2 + blockWidth);
      if (width < 0.7) continue;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(width, rowHeight - 0.07, 1.48),
        (index + row) % 3 === 0 ? warmStone : paleStone
      );
      block.position.set(x, 0.6 + row * rowHeight, 0);
      block.castShadow = true;
      block.receiveShadow = true;
      group.add(block);
    }
  }

  const cap = new THREE.Mesh(new THREE.BoxGeometry(length, 0.28, 1.72), paleStone);
  cap.position.y = rows * rowHeight + 0.08;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  const crenelCount = Math.max(2, Math.floor(length / 2.35));
  for (let index = 0; index <= crenelCount; index += 1) {
    const x = -length * 0.5 + (index / crenelCount) * length;
    const crenel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.62), index % 2 === 0 ? paleStone : warmStone);
    crenel.position.set(x, rows * rowHeight + 0.68, 0);
    crenel.castShadow = true;
    crenel.receiveShadow = true;
    group.add(crenel);
  }
  // 墙面不是纯粹的积木：斜扶壁、箭孔、木制步道和少量壁灯补上驿站的防守功能与尺度感。
  // 这些细节均为静态几何，不增加运行期骨骼或额外阴影灯的负担。
  const buttressCount = Math.max(1, Math.floor(length / 8));
  for (let index = 0; index <= buttressCount; index += 1) {
    const x = -length * 0.5 + 2.1 + (index / Math.max(1, buttressCount)) * Math.max(0, length - 4.2);
    for (const side of [-1, 1]) {
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.55, 0.72), warmStone);
      buttress.position.set(x, 1.28, side * 1.04);
      buttress.rotation.x = side * 0.16;
      buttress.castShadow = true;
      buttress.receiveShadow = true;
      group.add(buttress);
    }
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.82, 0.035), darkStone);
    slit.position.set(x, 3.26, 0.77);
    slit.castShadow = true;
    group.add(slit);
  }
  // The fallback wall is a continuous masonry surface as well. A narrow timber
  // shelf read as suspended debris at top-down scale, so it is intentionally omitted.
  if (length > 12) {
    for (const x of [-length * 0.24, length * 0.24]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.16), brass);
      bracket.position.set(x, 3.7, -0.86);
      bracket.castShadow = true;
      group.add(bracket);
    }
  }
  if (library?.hasModel("village-wall")) {
    const panelCount = Math.max(1, Math.round(length / 4.15));
    const panelWidth = length / panelCount;
    for (let index = 0; index < panelCount; index += 1) {
      const panel = library.fittedModel("village-wall", [panelWidth + 0.12, 4.45, 1.54], stoneColor, 0.12);
      panel.position.x += -length * 0.5 + panelWidth * (index + 0.5);
      panel.position.z = -0.05;
      group.add(panel);
    }
  }
  return group;
}

export function makeMarket(region: RegionDefinition, library: AssetLibrary): THREE.Group {
  const group = new THREE.Group();
  const accent = region.accent;
  const masonry = region.id === "canyon" ? 0x8a4d3a : region.id === "mist" ? 0x586c67 : region.id === "stardust" ? 0x6a6672 : 0x9d7655;
  const timber = region.id === "mist" ? 0x3f4b48 : region.id === "canyon" ? 0x563426 : 0x71503b;
  // The authored village pack supplies props only. The market shell is continuous and
  // world-sized here, so a source module can never collapse it into disconnected panels.
  {
    const foundation = mesh(new THREE.BoxGeometry(5.5, 0.42, 4.35), masonry, [0, 0.21, 0], [0, 0, 0], "stone");
    foundation.name = "foundation";
    group.add(foundation);
    const rear = mesh(new THREE.BoxGeometry(5.1, 2.45, 0.46), masonry, [0, 1.55, -1.72], [0, 0, 0], "stone");
    rear.name = "body";
    group.add(rear);
    for (const side of [-1, 1]) {
      group.add(mesh(new THREE.BoxGeometry(0.42, 2.45, 2.55), masonry, [side * 2.48, 1.55, -0.48], [0, 0, 0], "stone"));
      group.add(mesh(new THREE.BoxGeometry(0.24, 2.75, 0.24), timber, [side * 2.22, 1.78, 1.55], [0, 0, 0], "wood"));
    }
    const rearRoof = mesh(new THREE.BoxGeometry(5.35, 0.24, 1.85), timber, [0, 3.08, -1.0], [0, 0, 0], "wood");
    rearRoof.name = "roof";
    group.add(rearRoof);
    const awning = mesh(new THREE.BoxGeometry(5.25, 0.16, 2.35), accent, [0, 3.12, 1.15], [-0.13, 0, 0], "wood");
    group.add(awning);
    const entrance = new THREE.Group();
    entrance.name = "entrance";
    entrance.add(mesh(new THREE.BoxGeometry(4.25, 0.16, 0.52), timber, [0, 1.15, 1.66], [0, 0, 0], "wood"));
    for (const x of [-1.8, 0, 1.8]) entrance.add(mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), timber, [x, 0.78, 1.66], [0, 0, 0], "wood"));
    group.add(entrance);
    if (library.hasModel("village-crate")) {
      for (const [x, z, size] of [[1.55, 1.45, 0.7], [2.0, 0.95, 0.52], [-1.7, 1.35, 0.48]] as const) {
        const crate = library.fittedModel("village-crate", [size, size, size], timber, 0.08, "contain");
        crate.position.set(x, 0.44, z);
        group.add(crate);
      }
    }
    return group;
  }
  if (library.hasModel("village-window-wall") && library.hasModel("village-wall")) {
    const foundation = mesh(new THREE.BoxGeometry(5.4, 0.42, 4.3), masonry, [0, 0.21, 0], [0, 0, 0], "stone");
    foundation.name = "foundation";
    group.add(foundation);
    const rearBody = mesh(new THREE.BoxGeometry(5.0, 2.55, 1.8), masonry, [0, 1.7, -1.05], [0, 0, 0], "stone");
    rearBody.name = "body";
    group.add(rearBody);
    const front = library.fittedModel("village-window-wall", [4.9, 3.1, 0.8], masonry, 0.18);
    front.position.set(0, 0.42, 1.72);
    front.name = "entrance";
    group.add(front);
    for (const side of [-1, 1]) {
      const wall = library.fittedModel("village-wall", [3.55, 3.05, 0.72], masonry, 0.16);
      wall.position.set(side * 2.31, 0.42, -0.05);
      wall.rotation.y = Math.PI / 2;
      group.add(wall);
    }
    const rear = library.fittedModel("village-wall", [4.9, 3.05, 0.72], masonry, 0.16);
    rear.position.set(0, 0.42, -1.75);
    group.add(rear);
    const canopy = library.fittedModel("village-balcony", [5.35, 1.1, 2.25], accent, 0.22);
    canopy.position.set(0, 2.55, 1.45);
    canopy.name = "gallery";
    group.add(canopy);
    const awning = mesh(new THREE.BoxGeometry(5.25, 0.16, 2.05), accent, [0, 3.22, 1.18], [-0.16, 0, 0], "wood");
    awning.name = "roof";
    group.add(awning);
    group.add(mesh(new THREE.BoxGeometry(5.15, 0.24, 2.02), timber, [0, 3.05, -1.02], [0, 0, 0], "wood"));
    const wagon = library.fittedModel("village-wagon", [2.4, 1.55, 1.6], accent, 0.08);
    wagon.position.set(-3.05, 0.02, 1.1);
    wagon.rotation.y = 0.2;
    group.add(wagon);
    for (const [x, z, size] of [[1.55, 2.05, 0.72], [2.15, 1.72, 0.52], [1.9, 1.22, 0.46]] as const) {
      const crate = library.fittedModel("village-crate", [size, size, size], timber, 0.08);
      crate.position.set(x, 0.05, z);
      crate.rotation.y = x * 0.31;
      group.add(crate);
    }
    return group;
  }
  group.add(mesh(new THREE.BoxGeometry(4.6, 0.35, 3.4), timber, [0, 0.2, 0], [0, 0, 0], "stone"));
  group.add(mesh(new THREE.BoxGeometry(4.2, 2.7, 3), masonry, [0, 1.65, 0], [0, 0, 0], "wood"));
  group.add(mesh(new THREE.ConeGeometry(3.2, 2, 4), accent, [0, 4, 0], [0, Math.PI / 4, 0]));
  group.add(mesh(new THREE.BoxGeometry(3.6, 0.18, 1.1), 0xc58e4e, [0, 1.45, 1.7], [-0.12, 0, 0]));
  for (const x of [-1.4, 0, 1.4]) {
    group.add(mesh(new THREE.BoxGeometry(0.68, 0.7, 0.68), 0x74523a, [x, 0.55, 2], [0, 0, 0], "wood"));
  }
  const cloth = mesh(new THREE.PlaneGeometry(3.8, 1.2), accent, [0, 2.55, 1.52]);
  cloth.material = material(accent, 0.95);
  group.add(cloth);
  if (library.hasModel("village-window-wall")) {
    const facade = library.fittedModel("village-window-wall", [4.12, 2.75, 1.08], masonry, 0.22);
    facade.position.set(0, 0.32, 1.23);
    group.add(facade);
  }
  if (library.hasModel("village-wagon")) {
    const wagon = library.fittedModel("village-wagon", [2.25, 1.45, 1.5], accent, 0.08);
    wagon.position.set(-2.75, 0.02, 1.15);
    wagon.rotation.y = 0.22;
    group.add(wagon);
  }
  if (library.hasModel("village-crate")) {
    for (const [x, z, scale] of [[1.5, 1.95, 0.66], [2.02, 1.72, 0.48]] as const) {
      const crate = library.fittedModel("village-crate", [scale, scale, scale], 0x76513a, 0.08);
      crate.position.set(x, 0.04, z);
      crate.rotation.y = x * 0.35;
      group.add(crate);
    }
  }
  return group;
}

export function makeWorkshop(region: RegionDefinition, library: AssetLibrary): THREE.Group {
  const group = new THREE.Group();
  const accent = region.accent;
  const masonry = region.id === "canyon" ? 0x82503f : region.id === "mist" ? 0x526762 : region.id === "stardust" ? 0x65616e : 0x84715c;
  const roof = region.id === "canyon" ? 0x4b342d : region.id === "mist" ? 0x334f50 : region.id === "stardust" ? 0x344f58 : 0x365c5a;
  {
    const foundation = mesh(new THREE.BoxGeometry(5.15, 0.42, 4.35), masonry, [0, 0.21, 0], [0, 0, 0], "stone");
    foundation.name = "foundation";
    group.add(foundation);
    const rear = mesh(new THREE.BoxGeometry(4.75, 2.75, 0.48), masonry, [0, 1.68, -1.7], [0, 0, 0], "stone");
    rear.name = "body";
    group.add(rear);
    for (const side of [-1, 1]) {
      group.add(mesh(new THREE.BoxGeometry(0.44, 2.75, 3.45), masonry, [side * 2.35, 1.68, 0], [0, 0, 0], "stone"));
      group.add(mesh(new THREE.BoxGeometry(1.0, 2.2, 0.42), masonry, [side * 1.88, 1.4, 1.7], [0, 0, 0], "stone"));
    }
    const entrance = new THREE.Group();
    entrance.name = "entrance";
    entrance.add(mesh(new THREE.BoxGeometry(2.65, 0.24, 0.48), 0x5b3d2b, [0, 2.55, 1.7], [0, 0, 0], "wood"));
    group.add(entrance);
    // Build the roof from two structural, equal-size slopes.  The earlier single
    // indexed shell produced a large triangular silhouette from the isometric
    // camera (and made one side look twisted).  Separate thick slopes keep both
    // eaves parallel, give the roof a readable edge and remain symmetric at every
    // camera angle without object-level stretching.
    const workshopRoof = new THREE.Group();
    workshopRoof.name = "roof";
    const roofHalfDepth = 2.42;
    const eaveY = 3.3;
    const ridgeY = 4.15;
    const rise = ridgeY - eaveY;
    const slopeLength = Math.hypot(roofHalfDepth, rise);
    const slopeAngle = Math.atan2(rise, roofHalfDepth);
    const roofMaterial = material(roof, 0.82, 0.04);
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(5.72, 0.18, slopeLength), roofMaterial);
      slope.name = side < 0 ? "gable-slope-rear" : "gable-slope-front";
      slope.position.set(0, (eaveY + ridgeY) * 0.5, side * roofHalfDepth * 0.5);
      slope.rotation.x = side * slopeAngle;
      slope.castShadow = true;
      slope.receiveShadow = true;
      workshopRoof.add(slope);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(5.86, 0.24, 0.3), material(0x293f42, 0.84, 0.04));
    ridge.name = "gable-ridge";
    ridge.position.set(0, ridgeY + 0.02, 0);
    ridge.castShadow = true;
    workshopRoof.add(ridge);
    // Timber fascia gives the open workshop a believable front/back roof edge
    // and makes the two slopes read as one continuous building rather than two
    // floating boards.
    for (const side of [-1, 1]) {
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(5.78, 0.24, 0.16), material(0x4d3527, 0.9, 0.02));
      fascia.name = side < 0 ? "gable-fascia-rear" : "gable-fascia-front";
      fascia.position.set(0, eaveY - 0.02, side * (roofHalfDepth + 0.03));
      fascia.castShadow = true;
      workshopRoof.add(fascia);
    }
    group.add(workshopRoof);
    const bench = mesh(new THREE.BoxGeometry(2.9, 0.22, 0.88), 0x654630, [0, 1.0, 1.25], [0, 0, 0], "wood");
    group.add(bench);
    group.add(mesh(new THREE.BoxGeometry(0.62, 2.45, 0.62), 0x665244, [1.45, 2.35, -0.8], [0, 0, 0], "stone"));
    const gearMaterial = material(accent, 0.38, 0.56);
    for (const [x, y, scale] of [[-0.82, 1.58, 0.48], [0.18, 1.42, 0.66], [0.98, 1.65, 0.38]] as const) {
      const gear = new THREE.Mesh(new THREE.TorusGeometry(scale, 0.11, 8, 18), gearMaterial);
      gear.position.set(x, y, 1.72);
      gear.castShadow = true;
      group.add(gear);
    }
    return group;
  }
  if (library.hasModel("village-window-wall") && library.hasModel("village-wall")) {
    const foundation = mesh(new THREE.BoxGeometry(5.05, 0.4, 4.25), masonry, [0, 0.2, 0], [0, 0, 0], "stone");
    foundation.name = "foundation";
    group.add(foundation);
    const rearBody = mesh(new THREE.BoxGeometry(4.7, 2.7, 2.15), masonry, [0, 1.72, -0.8], [0, 0, 0], "stone");
    rearBody.name = "body";
    group.add(rearBody);
    const front = library.fittedModel("village-window-wall", [4.7, 3.45, 0.82], masonry, 0.18);
    front.position.set(0, 0.2, 1.55);
    front.name = "entrance";
    group.add(front);
    for (const side of [-1, 1]) {
      const wall = library.fittedModel("village-wall", [3.4, 3.4, 0.72], masonry, 0.16);
      wall.position.set(side * 2.05, 0.2, -0.1);
      wall.rotation.y = Math.PI / 2;
      group.add(wall);
    }
    const rear = library.fittedModel("village-wall", [4.7, 3.4, 0.72], masonry, 0.16);
    rear.position.set(0, 0.2, -1.72);
    group.add(rear);
    const roofModule = library.model("tower-hexagon-roof", roof, 0.24);
    roofModule.scale.set(1.55, 1.18, 1.28);
    roofModule.position.y = 3.34;
    roofModule.name = "roof";
    group.add(roofModule);
    const chimney = library.fittedModel("village-chimney", [0.86, 2.8, 0.86], 0x665244, 0.12);
    chimney.position.set(1.28, 2.42, -0.52);
    group.add(chimney);
    const gearMaterial = material(accent, 0.38, 0.56);
    for (const [x, y, scale] of [[-1.15, 1.88, 0.62], [0.05, 1.55, 0.82], [1.2, 2.15, 0.48]] as const) {
      const gear = new THREE.Mesh(new THREE.TorusGeometry(scale, 0.13, 10, 24), gearMaterial);
      gear.position.set(x, y, 2.02);
      gear.castShadow = true;
      group.add(gear);
    }
    return group;
  }
  group.add(mesh(new THREE.CylinderGeometry(2.55, 2.8, 0.45, 8), masonry, [0, 0.25, 0], [0, 0, 0], "stone"));
  group.add(mesh(new THREE.CylinderGeometry(2.25, 2.45, 3.1, 8), masonry, [0, 1.95, 0], [0, 0, 0], "wood"));
  group.add(mesh(new THREE.ConeGeometry(2.65, 1.75, 8), roof, [0, 4.35, 0]));
  const gearMaterial = material(accent, 0.42, 0.48);
  for (const [x, y, scale] of [[-1.3, 2.1, 0.7], [0.15, 1.7, 0.95], [1.3, 2.35, 0.55]] as const) {
    const gear = new THREE.Mesh(new THREE.TorusGeometry(scale, 0.16, 8, 12), gearMaterial);
    gear.position.set(x, y, 2.25);
    gear.castShadow = true;
    group.add(gear);
  }
  const chimney = mesh(new THREE.CylinderGeometry(0.34, 0.45, 2.2, 8), 0x665244, [1.35, 4.35, -0.5], [0, 0, 0], "stone");
  group.add(chimney);
  if (library.hasModel("village-window-wall")) {
    const workshopFront = library.fittedModel("village-window-wall", [4.2, 3.05, 1.1], masonry, 0.22);
    workshopFront.position.set(0, 0.34, 1.78);
    group.add(workshopFront);
  }
  if (library.hasModel("village-chimney")) {
    const authoredChimney = library.fittedModel("village-chimney", [0.92, 2.7, 0.92], 0x7c6049, 0.1);
    authoredChimney.position.set(1.25, 2.65, -0.55);
    group.add(authoredChimney);
    chimney.visible = false;
  }
  return group;
}

export function makeFireTower(library: AssetLibrary, accent: number): THREE.Group {
  const group = new THREE.Group();
  const base = library.model("tower-hexagon-base", accent);
  const mid = library.model("tower-hexagon-mid", accent);
  const roof = library.model("tower-hexagon-roof", accent);
  base.scale.setScalar(1.12);
  mid.scale.setScalar(1.12);
  roof.scale.setScalar(1.12);
  base.position.y = 0;
  mid.position.y = 1.48;
  roof.position.y = 2.95;
  group.add(base, mid, roof);
  const bowl = mesh(new THREE.CylinderGeometry(0.8, 0.42, 0.3, 14), 0x503b32, [0, 4.24, 0]);
  const flame = mesh(new THREE.ConeGeometry(0.34, 0.86, 10), 0xf28b3c, [0, 4.82, 0]);
  flame.name = "flame";
  group.add(bowl, flame);
  const light = new THREE.PointLight(0xf28b3c, 1.8, 13, 2);
  light.position.set(0, 4.65, 0);
  group.add(light);
  return group;
}

export function makeGatehouse(library: AssetLibrary, accent: number, stoneColor = 0x9a7655): THREE.Group {
  const group = new THREE.Group();
  group.userData.gate = true;
  if (library.hasModel("village-arch") && library.hasModel("village-wall") && library.hasModel("village-door")) {
    const arch = library.fittedModel("village-arch", [7.45, 5.2, 2.65], stoneColor, 0.12);
    arch.position.set(0, 0.05, 0);
    group.add(arch);
    for (const side of [-1, 1]) {
      const tower = library.fittedModel("village-wall", [3.75, 5.25, 3.45], stoneColor, 0.1);
      tower.position.set(side * 5.05, 0, 0);
      group.add(tower);
      const gallery = library.fittedModel("village-balcony", [3.65, 0.95, 2.45], 0x4f392d, 0.08);
      gallery.position.set(side * 5.05, 4.18, -0.72);
      group.add(gallery);
      const cap = library.model("tower-hexagon-roof", accent, 0.22);
      cap.scale.set(0.92, 0.55, 0.78);
      cap.position.set(side * 5.05, 4.72, 0);
      group.add(cap);
    }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 3.15, 0.18, -0.18);
      pivot.name = side < 0 ? "gate-left" : "gate-right";
      const door = library.fittedModel("village-door", [3.08, 3.95, 0.42], 0x4b3327, 0.12);
      door.position.set(-side * 1.54, 0, 0);
      pivot.add(door);
      group.add(pivot);
    }
    for (const side of [-1, 1]) {
      const brazier = library.model("tower-hexagon-base", 0x5d5143, 0.18);
      brazier.scale.setScalar(0.32);
      brazier.position.set(side * 4.92, 4.95, -0.15);
      group.add(brazier);
      const light = new THREE.PointLight(0xf09a47, 1.55, 13, 2);
      light.position.set(side * 4.92, 5.65, -0.15);
      group.add(light);
    }
    return group;
  }
  const stone = material(stoneColor, 0.96, 0.04, "stone");
  const darkStone = material(0x66513f, 0.98, 0.04, "stone");
  const wood = material(0x3f2d22, 0.9, 0.04, "wood");
  const metal = material(0x4c5555, 0.42, 0.62);

  // 门楼比普通城墙略低一档：仍像坚固的入口建筑，却不会在俯视镜头里挡住门外道路和拒马位。
  for (const x of [-5.15, 5.15]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.45, 4.55, 3.25), stone);
    tower.position.set(x, 2.28, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.5, 3.55), darkStone);
    base.position.set(x, 0.25, 0);
    base.castShadow = true;
    group.add(base);
    for (let index = -1; index <= 1; index += 1) {
      const crenel = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.78, 3.35), index === 0 ? darkStone : stone);
      crenel.position.set(x + index * 1.1, 4.92, 0);
      crenel.castShadow = true;
      group.add(crenel);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.33, 0.28, 12), metal);
    bowl.position.set(x, 5.64, 0);
    bowl.castShadow = true;
    group.add(bowl);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.72, 9), material(0xf08b3e));
    flame.position.set(x, 6.14, 0);
    flame.name = "flame";
    group.add(flame);
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.85, 1.05, 2.4), stone);
  lintel.position.set(0, 4.35, 0);
  lintel.castShadow = true;
  group.add(lintel);
  const patterned = new THREE.Mesh(new THREE.BoxGeometry(6.45, 0.34, 2.55), material(accent, 0.88));
  patterned.position.set(0, 3.82, 0);
  patterned.castShadow = true;
  group.add(patterned);
  // 拱门上方的镶嵌纹样和两面垂旗把入口与普通城墙区分开，让道路自然成为视觉中心。
  for (const x of [-2.28, 0, 2.28]) {
    const tile = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), material(0xd0a457, 0.48, 0.46));
    tile.position.set(x, 4.13, -1.32);
    tile.scale.y = 1.35;
    tile.castShadow = true;
    group.add(tile);
  }
  for (const x of [-4.25, 4.25]) {
    const bannerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.35, 8), metal);
    bannerPole.position.set(x, 4.5, -1.5);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.65), material(accent, 0.9));
    banner.position.set(x + (x < 0 ? -0.33 : 0.33), 4.25, -1.54);
    banner.rotation.y = x < 0 ? -0.1 : 0.1;
    banner.castShadow = true;
    group.add(bannerPole, banner);
  }

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 3.18, 0.24, -0.2);
    pivot.name = side < 0 ? "gate-left" : "gate-right";
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.12, 3.9, 0.34), wood);
    panel.position.set(-side * 1.56, 1.98, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    pivot.add(panel);
    for (let row = 0; row < 4; row += 1) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.12, 0.08), metal);
      band.position.set(-side * 1.56, 0.72 + row * 1.05, -0.22);
      pivot.add(band);
    }
    for (let x = 0; x < 3; x += 1) {
      for (let y = 0; y < 3; y += 1) {
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 5), metal);
        stud.position.set(-side * (0.55 + x * 0.82), 0.92 + y * 1.12, -0.25);
        pivot.add(stud);
      }
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 7, 14), metal);
    ring.position.set(-side * 0.38, 2.2, -0.29);
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);
    group.add(pivot);
  }
  if (library.hasModel("village-arch")) {
    const authoredArch = library.fittedModel("village-arch", [7.25, 4.72, 2.55], stoneColor, 0.14);
    authoredArch.position.set(0, 0.05, 0.06);
    authoredArch.name = "authored-gate-arch";
    group.add(authoredArch);
  }
  return group;
}

export function makeBarricade(): THREE.Group {
  const group = new THREE.Group();
  const wood = material(0x6d472c, 0.93);
  for (const z of [-0.65, 0.65]) {
    for (const x of [-1.7, -0.55, 0.55, 1.7]) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 2.8, 6), wood);
      stake.position.set(x, 1.1, z);
      stake.rotation.z = x > 0 ? -0.72 : 0.72;
      stake.castShadow = true;
      group.add(stake);
    }
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 4.5, 8), wood);
  beam.rotation.z = Math.PI / 2;
  beam.position.y = 0.75;
  beam.castShadow = true;
  group.add(beam);
  return group;
}

export function makeCore(accent: number, regionId = "oasis", library?: AssetLibrary): THREE.Group {
  const group = new THREE.Group();
  const stoneColor = regionId === "canyon" ? 0x704437 : regionId === "mist" ? 0x4f625e : regionId === "stardust" ? 0x5d5967 : 0x665747;
  const wallColor = regionId === "canyon" ? 0x87513d : regionId === "mist" ? 0x566b66 : regionId === "stardust" ? 0x66616d : 0x8d6b4d;
  const roofColor = regionId === "canyon" ? 0x4b3a32 : regionId === "mist" ? 0x315257 : regionId === "stardust" ? 0x334f5a : 0x345b63;
  {
    const base = mesh(new THREE.BoxGeometry(6.35, 0.5, 4.9), stoneColor, [0, 0.25, 0], [0, 0, 0], "stone");
    base.name = "foundation";
    group.add(base);
    // A single closed masonry mass guarantees that the headquarters always reads
    // as a complete building. Decorative modules sit on top of it; they never form
    // the load-bearing shell and therefore cannot leave an empty cage on screen.
    const body = mesh(new THREE.BoxGeometry(5.72, 2.72, 4.22), wallColor, [0, 1.78, 0], [0, 0, 0], "stone");
    body.name = "body";
    group.add(body);
    const entrance = mesh(new THREE.BoxGeometry(1.62, 2.05, 0.18), 0x493326, [0, 1.46, 2.2], [0, 0, 0], "wood");
    entrance.name = "entrance";
    group.add(entrance);
    for (const side of [-1, 1]) {
      group.add(mesh(new THREE.BoxGeometry(0.24, 2.42, 0.26), 0x513629, [side * 1.18, 1.65, 2.28], [0, 0, 0], "wood"));
      const window = mesh(new THREE.BoxGeometry(0.72, 0.78, 0.12), 0x233f43, [side * 1.95, 1.82, 2.18], [0, 0, 0], "stone");
      group.add(window);
    }
    const coreRoof = new THREE.Group();
    coreRoof.name = "roof";
    const roofMaterial = material(roofColor, 0.74, 0.06);
    // Caravanserai roofs are kept flat and usable. A single axis-aligned slab with
    // a low parapet cannot skew under camera perspective or non-uniform scaling.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(6.28, 0.3, 4.68), roofMaterial);
    slab.position.y = 3.3;
    slab.castShadow = true;
    slab.receiveShadow = true;
    coreRoof.add(slab);
    const copingMaterial = material(0x273e42, 0.82, 0.04);
    for (const z of [-2.24, 2.24]) {
      const coping = new THREE.Mesh(new THREE.BoxGeometry(6.36, 0.28, 0.2), copingMaterial);
      coping.position.set(0, 3.56, z);
      coping.castShadow = true;
      coreRoof.add(coping);
    }
    for (const x of [-3.08, 3.08]) {
      const coping = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 4.3), copingMaterial);
      coping.position.set(x, 3.56, 0);
      coping.castShadow = true;
      coreRoof.add(coping);
    }
    const roofVent = mesh(new THREE.BoxGeometry(1.45, 0.42, 1.1), accent, [0, 3.63, -0.2], [0, 0, 0], "stone");
    coreRoof.add(roofVent);
    group.add(coreRoof);
    const awning = mesh(new THREE.BoxGeometry(3.25, 0.18, 1.02), accent, [0, 2.72, 2.47], [0, 0, 0], "wood");
    group.add(awning);
    const lantern = mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.6, 10), 0xe2ad55, [0, 2.72, 2.7]);
    (lantern.material as THREE.MeshStandardMaterial).emissive.set(0xe2ad55);
    (lantern.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.75;
    lantern.name = "core-lantern";
    group.add(lantern);
    const light = new THREE.PointLight(0xe2ad55, 1.8, 14, 2);
    light.position.set(0, 2.9, 2.72);
    group.add(light);
    return group;
  }
  const legacyLibrary = library as AssetLibrary;
  if (legacyLibrary.hasModel("village-window-wall") && legacyLibrary.hasModel("village-arch")) {
    const base = mesh(new THREE.BoxGeometry(6.6, 0.48, 5.25), stoneColor, [0, 0.24, 0], [0, 0, 0], "stone");
    base.name = "foundation";
    group.add(base);
    const body = mesh(new THREE.BoxGeometry(5.9, 2.55, 4.45), wallColor, [0, 1.72, 0], [0, 0, 0], "stone");
    body.name = "body";
    group.add(body);
    const front = legacyLibrary.fittedModel("village-arch", [5.6, 2.8, 0.72], wallColor, 0.16);
    front.position.set(0, 0.38, 2.28);
    front.name = "entrance";
    group.add(front);
    const rear = legacyLibrary.fittedModel("village-window-wall", [6.55, 3.35, 0.82], wallColor, 0.16);
    rear.position.set(0, 0.38, -2.28);
    group.add(rear);
    for (const side of [-1, 1]) {
      const wall = legacyLibrary.fittedModel("village-window-wall", [5.0, 3.35, 0.82], wallColor, 0.16);
      wall.position.set(side * 2.98, 0.38, 0);
      wall.rotation.y = Math.PI / 2;
      group.add(wall);
    }
    const coreRoof = new THREE.Mesh(new THREE.ConeGeometry(4.05, 1.38, 4), material(roofColor, 0.72, 0.08));
    coreRoof.scale.z = 0.78;
    coreRoof.rotation.y = Math.PI / 4;
    coreRoof.position.y = 3.7;
    coreRoof.name = "roof";
    coreRoof.castShadow = true;
    coreRoof.receiveShadow = true;
    group.add(coreRoof);
    const gallery = legacyLibrary.fittedModel("village-balcony", [5.7, 0.82, 1.55], accent, 0.18);
    gallery.position.set(0, 2.42, 2.42);
    group.add(gallery);
    const lantern = mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.64, 12), 0xe2ad55, [0, 2.86, 2.68]);
    (lantern.material as THREE.MeshStandardMaterial).emissive.set(0xe2ad55);
    (lantern.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.85;
    lantern.name = "core-lantern";
    group.add(lantern);
    const light = new THREE.PointLight(0xe2ad55, 2.2, 16, 2);
    light.position.set(0, 3.05, 2.72);
    group.add(light);
    return group;
  }
  // 主帐以驿站内院的砖石基座、木构回廊和圆顶为主体；它是失败条件，也应当一眼可辨。
  group.add(mesh(new THREE.BoxGeometry(7.1, 0.54, 5.9), stoneColor, [0, 0.27, 0], [0, 0, 0], "stone"));
  group.add(mesh(new THREE.BoxGeometry(6.25, 2.8, 5.05), wallColor, [0, 1.92, 0], [0, 0, 0], "wood"));
  for (const x of [-2.45, 2.45]) {
    for (const z of [-1.85, 1.85]) {
      group.add(mesh(new THREE.CylinderGeometry(0.21, 0.25, 3.7, 10), 0x4e3526, [x, 2.16, z], [0, 0, 0], "wood"));
    }
  }
  const roofRim = mesh(new THREE.CylinderGeometry(3.72, 3.72, 0.2, 18), 0x436b70, [0, 3.34, 0]);
  group.add(roofRim);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.55, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.54), material(roofColor, 0.62, 0.16));
  dome.scale.z = 0.82;
  dome.position.y = 3.28;
  dome.castShadow = true;
  dome.receiveShadow = true;
  group.add(dome);
  const domeBand = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.12, 8, 24), material(accent, 0.52, 0.36));
  domeBand.scale.z = 0.82;
  domeBand.rotation.x = Math.PI / 2;
  domeBand.position.y = 4.95;
  domeBand.castShadow = true;
  group.add(domeBand);
  const finialStem = mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.78, 8), 0x8d7451, [0, 6.55, 0]);
  const finial = mesh(new THREE.ConeGeometry(0.26, 0.62, 8), accent, [0, 7.22, 0]);
  group.add(finialStem, finial);
  const awning = mesh(new THREE.BoxGeometry(3.8, 0.18, 1.32), 0xc09a61, [0, 2.34, 2.96], [-0.16, 0, 0]);
  group.add(awning);
  const door = mesh(new THREE.BoxGeometry(1.72, 2.18, 0.2), 0x3f3028, [0, 1.45, 2.57], [0, 0, 0], "wood");
  group.add(door);
  for (const x of [-1.48, 1.48]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.08, 7, 14, Math.PI), material(0x58412f, 0.84));
    arch.position.set(x, 2.25, 2.7);
    arch.rotation.z = Math.PI;
    arch.castShadow = true;
    group.add(arch);
  }
  const lantern = mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.64, 8), 0xe2ad55, [0, 3.28, 3.0]);
  (lantern.material as THREE.MeshStandardMaterial).emissive.set(0xe2ad55);
  (lantern.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.72;
  lantern.name = "core-lantern";
  group.add(lantern);
  const light = new THREE.PointLight(0xe2ad55, 2.2, 15, 2);
  light.position.set(0, 3.35, 3.05);
  group.add(light);
  return group;
}

export function makeBuildModel(type: BuildingType, library: AssetLibrary, region: RegionDefinition): THREE.Group {
  const wrapper = new THREE.Group();
  if (type === "ballista" || type === "antiair") {
    const authored = library.hasModel("silk-road-ballista");
    const model = library.model(authored ? "silk-road-ballista" : "siege-ballista", region.accent);
    model.scale.setScalar(authored ? (type === "antiair" ? 1.05 : 1.18) : (type === "antiair" ? 1.78 : 2.05));
    model.rotation.y = authored ? 0 : Math.PI;
    wrapper.add(model);
    if (type === "antiair") {
      const tripod = mesh(new THREE.CylinderGeometry(0.65, 1.1, 0.55, 8), 0x5b554d, [0, 0.28, 0]);
      const marker = mesh(new THREE.ConeGeometry(0.3, 0.95, 6), region.accent, [0, 2.1, 0]);
      marker.name = "flame";
      wrapper.add(tripod, marker);
    }
  } else if (type === "trebuchet") {
    const model = library.model("siege-ballista", region.accent);
    model.scale.set(2.7, 2.25, 2.7);
    model.rotation.y = Math.PI;
    wrapper.add(model);
    const counterweight = mesh(new THREE.DodecahedronGeometry(0.78, 0), 0x6b6256, [0, 1.35, 0.55]);
    counterweight.castShadow = true;
    wrapper.add(counterweight);
  } else if (type === "fire") {
    wrapper.add(makeFireTower(library, region.accent));
  } else if (type === "market") {
    wrapper.add(makeMarket(region, library));
  } else {
    wrapper.add(makeWorkshop(region, library));
  }
  return wrapper;
}

export function makeResource(type: "wood" | "stone" | "gear", library: AssetLibrary, accent: number, regionId = "oasis"): THREE.Group {
  const group = new THREE.Group();
  if (type === "wood") {
    if (regionId === "mist" && library.hasModel("village-fence")) {
      // 雾港木材来自拆下的码头板与系船桩，整齐靠岸堆放，不伪装成树木。
      for (const [z, width, turn] of [[-0.48, 3.1, -0.08], [0.08, 2.7, 0.12], [0.58, 2.35, -0.04]] as const) {
        const plank = library.fittedModel("village-fence", [width, 0.42, 0.46], 0x4b3d32, 0.18);
        plank.position.set((z + 0.4) * 0.32, 0.12 + (z + 0.5) * 0.18, z);
        plank.rotation.y = turn;
        group.add(plank);
      }
      const bollard = library.fittedModel("village-chimney", [0.58, 1.05, 0.58], 0x48544f, 0.18);
      bollard.position.set(-1.35, 0, 0.18);
      group.add(bollard);
      return group;
    }
    if (regionId === "canyon" && library.hasModel("village-fence")) {
      // 峡谷木材是矿坑支护梁，呈井字形捆扎，来源与采石叙事一致。
      for (const [x, z, rotation] of [[-0.35, -0.48, 0.06], [0.24, 0.42, -0.08], [-0.44, 0.48, Math.PI / 2]] as const) {
        const beam = library.fittedModel("village-fence", [2.8, 0.45, 0.5], 0x523629, 0.16);
        beam.position.set(x, 0.1 + Math.abs(z) * 0.18, z);
        beam.rotation.y = rotation;
        group.add(beam);
      }
      return group;
    }
    // 可采木材表现为路旁整理过的倒木，而不是一棵会被误认为永久障碍的树。
    const bark = material(0x5a3a27, 0.96, 0.01, "wood");
    const cut = material(0xb98b58, 0.88, 0.01, "wood");
    for (const [x, z, length, radius, angle] of [[-0.32, -0.34, 2.65, 0.34, 0.18], [0.22, 0.2, 2.35, 0.3, -0.14], [0.52, -0.55, 1.95, 0.25, 0.28]] as const) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, length, 14), bark);
      log.rotation.z = Math.PI * 0.5;
      log.rotation.y = angle;
      log.position.set(x, radius + 0.12, z);
      log.castShadow = true;
      group.add(log);
      for (const side of [-1, 1]) {
        const end = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.92, 14), cut);
        end.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        end.rotation.z = angle;
        end.position.set(x + Math.cos(angle) * length * 0.5 * side, radius + 0.12, z - Math.sin(angle) * length * 0.5 * side);
        group.add(end);
      }
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.055, 7, 18), material(0xa68758, 0.96));
    rope.rotation.y = Math.PI * 0.5;
    rope.position.set(0, 0.48, 0);
    group.add(rope);
  } else if (type === "stone") {
    if (regionId === "canyon" && library.hasModel("village-wall")) {
      const cutFace = library.fittedModel("village-wall", [3.1, 1.15, 1.25], 0x8c4f3d, 0.24);
      cutFace.rotation.y = -0.12;
      group.add(cutFace);
    }
    // 三层岩块共享同一地质色，避免单个规则石块像掉落道具。
    for (const [name, x, z, scale, rotation] of [["rocks-large", -0.2, 0.05, 1.2, 0.2], ["rocks-small", 0.85, 0.45, 0.82, -0.7], ["rocks-small", -0.8, -0.5, 0.66, 0.9]] as const) {
      const stoneTint = regionId === "canyon" ? 0x8b4f3e : regionId === "mist" ? 0x566966 : regionId === "stardust" ? 0x686473 : 0x71675e;
      const rock = library.model(name, stoneTint, 0.24);
      rock.position.set(x, 0, z);
      rock.scale.setScalar(scale);
      rock.rotation.y = rotation;
      group.add(rock);
    }
  } else {
    // 机巧材料来自半埋的商旅机关残件，不再是一颗悬在八角台上的发光宝石。
    const rock = library.model("rocks-small", 0x5d5953, 0.22);
    rock.scale.setScalar(1.18);
    const bronze = material(regionId === "stardust" ? 0x58787b : 0x8b6a3d, 0.52, 0.62);
    const iron = material(regionId === "mist" ? 0x425a58 : 0x3f4748, 0.48, 0.74);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 2.1, 10), iron);
    axle.position.set(0, 0.88, 0);
    axle.rotation.z = Math.PI * 0.5;
    axle.castShadow = true;
    const largeGear = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.15, 8, 18), bronze);
    largeGear.position.set(-0.38, 1.03, 0.05);
    largeGear.rotation.y = Math.PI * 0.5;
    const smallGear = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.11, 8, 16), iron);
    smallGear.position.set(0.62, 0.75, 0.28);
    smallGear.rotation.y = Math.PI * 0.5;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 10), bronze);
    pin.position.set(-0.38, 1.03, 0.05);
    pin.rotation.z = Math.PI * 0.5;
    const glint = new THREE.PointLight(accent, 0.42, 3.8, 2);
    glint.position.set(0, 1.25, 0);
    group.add(rock, axle, largeGear, smallGear, pin, glint);
  }
  return group;
}

export function makePedestal(color: number, iconType: "relic" | "route"): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(1.65, 2.1, 0.7, 8), 0x60594e, [0, 0.35, 0]));
  group.add(mesh(new THREE.CylinderGeometry(1.12, 1.48, 1.8, 8), 0x766d5e, [0, 1.55, 0]));
  const artifact = mesh(
    iconType === "relic" ? new THREE.OctahedronGeometry(0.82, 1) : new THREE.IcosahedronGeometry(0.92, 1),
    color,
    [0, 3.2, 0]
  );
  const artifactMaterial = artifact.material as THREE.MeshStandardMaterial;
  artifactMaterial.emissive.set(color);
  artifactMaterial.emissiveIntensity = 0.48;
  artifact.name = "artifact";
  group.add(artifact);
  const light = new THREE.PointLight(color, 2.1, 10, 2);
  light.position.set(0, 3.1, 0);
  group.add(light);
  return group;
}

export function enemyCharacterKind(type: EnemyType): CharacterKind {
  if (type === "ram") return "brute";
  if (type === "archer") return "ranger";
  return type === "shield" || type === "sapper" ? "brute" : "raider";
}

/**
 * 首领以合法基础模型为骨架，再叠加原创装备与轮廓。附件全部挂在首领根节点上，
 * 既能随骨骼基模移动，也能由运行时执行独立的蓄力、展开和受击动作。
 */
export function decorateBoss(root: THREE.Group, kind: BossKind, library: AssetLibrary, accent: number): void {
  const darkMetal = material(0x39474a, 0.34, 0.72);
  const bronze = material(0xa2783f, 0.38, 0.62);
  const leather = material(0x4f3426, 0.94, 0.02, "wood");
  const warning = material(kind === "kite-swarm" ? 0x57939b : 0xaa4f3f, 0.52, 0.28);

  if (kind === "shield-commander") {
    const shield = new THREE.Group();
    shield.name = "boss-shield";
    shield.position.set(-1.15, 2.05, 0.35);
    const face = mesh(new THREE.BoxGeometry(1.62, 2.8, 0.24), 0x48595b, [0, 0, 0]);
    const cap = mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.24, 16, 1, false, 0, Math.PI), 0x48595b, [0, 1.4, 0], [Math.PI / 2, 0, 0]);
    const spine = mesh(new THREE.BoxGeometry(0.18, 3.1, 0.34), 0xa2783f, [0, 0, 0.05]);
    shield.add(face, cap, spine);
    for (const x of [-0.58, 0.58]) for (const y of [-0.86, 0, 0.86]) {
      shield.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), 0xc39a59, [x, y, 0.2]));
    }
    const standard = library.model("flag-banner-long", 0x8d3f35, 0.42);
    standard.scale.setScalar(1.35);
    standard.position.set(0.78, 4.5, -0.2);
    standard.name = "boss-standard";
    root.add(shield, standard);
  } else if (kind === "sapper-captain") {
    const powderRig = new THREE.Group();
    powderRig.name = "boss-powder-rig";
    powderRig.position.set(0, 2.1, -0.7);
    const rack = mesh(new THREE.BoxGeometry(1.55, 1.9, 0.48), 0x513526, [0, 0, 0], [0, 0, 0], "wood");
    powderRig.add(rack);
    for (const x of [-0.48, 0, 0.48]) {
      const charge = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 1.45, 10), warning);
      charge.position.set(x, 0.03, -0.34);
      charge.castShadow = true;
      powderRig.add(charge);
    }
    const fuse = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 18, Math.PI * 1.4), bronze);
    fuse.name = "boss-fuse";
    fuse.position.set(0.42, 0.94, -0.48);
    fuse.rotation.x = Math.PI / 2;
    powderRig.add(fuse);
    const shieldPlate = library.model("wall-pillar", accent, 0.52);
    shieldPlate.scale.set(0.48, 0.72, 0.38);
    shieldPlate.position.set(-0.96, 0.2, 0.2);
    powderRig.add(shieldPlate);
    root.add(powderRig);
  } else if (kind === "kite-swarm") {
    const array = new THREE.Group();
    array.name = "boss-kite-array";
    const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x456f72, roughness: 0.68, metalness: 0.08, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.5), wingMaterial);
      wing.position.set(side * 2.15, 0.15, 0);
      wing.rotation.set(-Math.PI / 2, 0, side * -0.18);
      wing.name = "boss-kite-wing";
      wing.castShadow = true;
      array.add(wing);
      const drone = library.model("flag-banner-long", accent, 0.48);
      drone.scale.set(0.62, 0.62, 0.62);
      drone.position.set(side * 2.3, 0.35, 0.12);
      drone.rotation.z = side * 0.32;
      array.add(drone);
    }
    const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 1), darkMetal);
    core.name = "boss-kite-core";
    core.castShadow = true;
    array.add(core);
    root.add(array);
  } else {
    const armor = library.model("tower-hexagon-roof", 0x3e4b4d, 0.58);
    armor.scale.set(1.08, 0.7, 1.42);
    armor.position.set(0, 2.05, 0.08);
    armor.rotation.y = Math.PI / 6;
    armor.name = "boss-beast-armor";
    const ramHead = library.model("wall-pillar", 0x50595a, 0.54);
    ramHead.scale.set(0.52, 0.72, 0.52);
    ramHead.position.set(0, 1.25, -2.18);
    ramHead.rotation.x = Math.PI / 2;
    ramHead.name = "boss-beast-head";
    const harness = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.12, 8, 24), leather);
    harness.rotation.x = Math.PI / 2;
    harness.position.set(0, 1.2, -0.25);
    root.add(armor, ramHead, harness);
  }
  root.userData.bossKind = kind;
}
