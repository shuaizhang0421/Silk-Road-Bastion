import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import type { BuildingType, EnemyType, RegionDefinition } from "./types";

const ASSET_ROOT = "./assets/models/kenney";

type CharacterKind = "ranger" | "raider" | "brute";
type MaterialSurface = "stone" | "wood";

// 运行时加载的原创材质由所有程序化建筑共用；只读贴图不会增加每座建筑的显存副本。
const surfaceMaps: Partial<Record<MaterialSurface, THREE.Texture>> = {};

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
}

export class AssetLibrary {
  readonly manager = new THREE.LoadingManager();
  private gltf = new GLTFLoader(this.manager);
  private fbx = new FBXLoader(this.manager);
  private textureLoader = new THREE.TextureLoader(this.manager);
  private models = new Map<string, THREE.Object3D>();
  private textures = new Map<CharacterKind, THREE.Texture>();
  private worldTextures = new Map<string, THREE.Texture>();
  private characterBase?: THREE.Group;
  private idleClip?: THREE.AnimationClip;
  private runClip?: THREE.AnimationClip;
  private heroBase?: THREE.Group;
  private heroAnimations: THREE.AnimationClip[] = [];

  constructor(onProgress: (loaded: number, total: number) => void) {
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

    const heroJob = this.gltf.loadAsync("./assets/models/quaternius/character-animated.glb");
    const stoneSurfaceJob = this.textureLoader.loadAsync("./assets/art/silk-road-sandstone-v1.jpg");
    const woodSurfaceJob = this.textureLoader.loadAsync("./assets/art/silk-road-timber-v1.jpg");
    const courtyardPavingJob = this.textureLoader.loadAsync("./assets/art/silk-road-courtyard-paving-v1.jpg");
    const caravanRoadJob = this.textureLoader.loadAsync("./assets/art/silk-road-caravan-road-v1.jpg");
    const [character, idle, run, ranger, raider, brute, stoneSurface, woodSurface, courtyardPaving, caravanRoad] = await Promise.all([
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
      ...glbJobs
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
      surfaceMaps[surface] = texture;
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
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.map = surfaceMaps[surface]!;
          material.color.lerp(new THREE.Color(0xffffff), surface === "stone" ? 0.56 : 0.42);
          material.roughness = surface === "stone" ? 0.88 : 0.78;
          material.needsUpdate = true;
        }
      }
    });
    return copy;
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
      const idle = idleClip ? mixer.clipAction(idleClip) : null;
      const run = runClip ? mixer.clipAction(runClip) : null;
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
          container.userData.attackUntil = performance.now() + 310;
        }
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
      }
    };
  }
}

function material(color: number, roughness = 0.84, metalness = 0.04, surface?: MaterialSurface): THREE.MeshStandardMaterial {
  const map = surface ? surfaceMaps[surface] : undefined;
  const materialColor = map ? new THREE.Color(color).lerp(new THREE.Color(0xffffff), surface === "stone" ? 0.58 : 0.48) : new THREE.Color(color);
  return new THREE.MeshStandardMaterial({ color: materialColor, map, roughness, metalness });
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

export function makeFortWallSegment(length: number, stoneColor = 0x9a7655): THREE.Group {
  const group = new THREE.Group();
  const paleStone = material(stoneColor, 0.96, 0.04, "stone");
  const warmStone = material(0x866247, 0.98, 0.04, "stone");
  const darkStone = material(0x59483b, 0.98, 0.02, "stone");
  const timber = material(0x4c3426, 0.94, 0.03, "wood");
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
  const walkway = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, length - 1.35), 0.12, 0.56), timber);
  walkway.position.set(0, rows * rowHeight + 0.35, -0.67);
  walkway.castShadow = true;
  walkway.receiveShadow = true;
  group.add(walkway);
  if (length > 12) {
    for (const x of [-length * 0.24, length * 0.24]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.16), brass);
      bracket.position.set(x, 3.7, -0.86);
      bracket.castShadow = true;
      group.add(bracket);
    }
  }
  return group;
}

export function makeMarket(accent: number): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(4.6, 0.35, 3.4), 0x71503b, [0, 0.2, 0], [0, 0, 0], "stone"));
  group.add(mesh(new THREE.BoxGeometry(4.2, 2.7, 3), 0x9d7655, [0, 1.65, 0], [0, 0, 0], "wood"));
  group.add(mesh(new THREE.ConeGeometry(3.2, 2, 4), accent, [0, 4, 0], [0, Math.PI / 4, 0]));
  group.add(mesh(new THREE.BoxGeometry(3.6, 0.18, 1.1), 0xc58e4e, [0, 1.45, 1.7], [-0.12, 0, 0]));
  for (const x of [-1.4, 0, 1.4]) {
    group.add(mesh(new THREE.BoxGeometry(0.68, 0.7, 0.68), 0x74523a, [x, 0.55, 2], [0, 0, 0], "wood"));
  }
  const cloth = mesh(new THREE.PlaneGeometry(3.8, 1.2), accent, [0, 2.55, 1.52]);
  cloth.material = material(accent, 0.95);
  group.add(cloth);
  return group;
}

export function makeWorkshop(accent: number): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CylinderGeometry(2.55, 2.8, 0.45, 8), 0x705747, [0, 0.25, 0], [0, 0, 0], "stone"));
  group.add(mesh(new THREE.CylinderGeometry(2.25, 2.45, 3.1, 8), 0x84715c, [0, 1.95, 0], [0, 0, 0], "wood"));
  group.add(mesh(new THREE.ConeGeometry(2.65, 1.75, 8), 0x365c5a, [0, 4.35, 0]));
  const gearMaterial = material(accent, 0.42, 0.48);
  for (const [x, y, scale] of [[-1.3, 2.1, 0.7], [0.15, 1.7, 0.95], [1.3, 2.35, 0.55]] as const) {
    const gear = new THREE.Mesh(new THREE.TorusGeometry(scale, 0.16, 8, 12), gearMaterial);
    gear.position.set(x, y, 2.25);
    gear.castShadow = true;
    group.add(gear);
  }
  const chimney = mesh(new THREE.CylinderGeometry(0.34, 0.45, 2.2, 8), 0x665244, [1.35, 4.35, -0.5], [0, 0, 0], "stone");
  group.add(chimney);
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

export function makeGatehouse(accent: number, stoneColor = 0x9a7655): THREE.Group {
  const group = new THREE.Group();
  group.userData.gate = true;
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

export function makeCore(accent: number): THREE.Group {
  const group = new THREE.Group();
  // 主帐以驿站内院的砖石基座、木构回廊和圆顶为主体；它是失败条件，也应当一眼可辨。
  group.add(mesh(new THREE.BoxGeometry(7.1, 0.54, 5.9), 0x665747, [0, 0.27, 0], [0, 0, 0], "stone"));
  group.add(mesh(new THREE.BoxGeometry(6.25, 2.8, 5.05), 0x8d6b4d, [0, 1.92, 0], [0, 0, 0], "wood"));
  for (const x of [-2.45, 2.45]) {
    for (const z of [-1.85, 1.85]) {
      group.add(mesh(new THREE.CylinderGeometry(0.21, 0.25, 3.7, 10), 0x4e3526, [x, 2.16, z], [0, 0, 0], "wood"));
    }
  }
  const roofRim = mesh(new THREE.CylinderGeometry(3.72, 3.72, 0.2, 18), 0x436b70, [0, 3.34, 0]);
  group.add(roofRim);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.55, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.54), material(0x345b63, 0.62, 0.16));
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
    const model = library.model("siege-ballista", region.accent);
    model.scale.setScalar(type === "antiair" ? 1.78 : 2.05);
    model.rotation.y = Math.PI;
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
    wrapper.add(makeMarket(region.accent));
  } else {
    wrapper.add(makeWorkshop(region.accent));
  }
  return wrapper;
}

export function makeResource(type: "wood" | "stone" | "gear", library: AssetLibrary, accent: number): THREE.Group {
  const group = new THREE.Group();
  if (type === "wood") {
    const tree = library.model(Math.random() > 0.5 ? "tree-large" : "tree-small", accent);
    tree.scale.setScalar(1.7);
    group.add(tree);
  } else if (type === "stone") {
    const rock = library.model(Math.random() > 0.5 ? "rocks-large" : "rocks-small", accent);
    rock.scale.setScalar(1.65);
    group.add(rock);
  } else {
    const base = mesh(new THREE.CylinderGeometry(1.3, 1.6, 0.5, 8), 0x655c51, [0, 0.25, 0]);
    const device = mesh(new THREE.DodecahedronGeometry(0.82, 0), accent, [0, 1.3, 0]);
    (device.material as THREE.MeshStandardMaterial).metalness = 0.45;
    (device.material as THREE.MeshStandardMaterial).emissive.set(accent);
    (device.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25;
    group.add(base, device);
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
  return type === "shield" || type === "sapper" ? "brute" : "raider";
}
