import * as THREE from "three";
import {
  buildings,
  bossDefinitions,
  bossEnemyType,
  bossForNight,
  canAfford,
  createGame,
  directorWave,
  enemyHealthScale,
  emptyMeta,
  enemies,
  nightModifiersForEpoch,
  modeName,
  pay,
  regionById,
  regions,
  regionVisualProfiles,
  qualityPresets,
  relics,
  ASSET_VERSION,
  buildingDurabilityGrowth,
  PREVIOUS_SAVE_KEY,
  SAVE_KEY,
  SeedStreams,
  upgradeCost,
  weaponLevelPower,
  weaponLevelRate
} from "./data";
import {
  AssetLibrary,
  applyBuildingVisualState,
  makeBuildModel,
  makeCore,
  makeFortWallSegment,
  makeGatehouse,
  makePedestal,
  makeResource,
  type CharacterRig
} from "./models";
import { isSafeSaveEnvelope, migrateSaveEnvelope } from "./save-migration";
import { canBuildInZone, fortLayout } from "./fort-layout";
import { oasisInteractionAnchors, regionEnvironmentClusters } from "./asset-manifest";
import type {
  BuildingRelocationState,
  BuildingState,
  BuildingType,
  BossKind,
  BossAction,
  EnemyState,
  EnemyType,
  GameMode,
  GameState,
  GateRepairQuote,
  HeroClass,
  MetaProgress,
  QualityTier,
  RegionDefinition,
  ResourceKey,
  Resources,
  SaveEnvelope,
  SaveSlotSummary,
  RelicDefinition
} from "./types";

const BUILD_ORDER: BuildingType[] = ["market", "workshop", "ballista", "fire", "antiair", "trebuchet"];
const ROAD_LANES = [-6.2, 0, 6.2];

/** 远景专用的不规则岩脊，避免规则圆锥在俯视镜头中呈现成一排金字塔。 */
function makeHorizonMound(material: THREE.MeshStandardMaterial, radiusX: number, radiusZ: number, height: number, seed: number, segments: number): THREE.Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  // A long, broken ridgeline is far more natural than a single apex. Each slice has
  // front/back foothills and a narrow irregular crest, producing layered canyon silhouettes.
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.58);
    const x = (t * 2 - 1) * radiusX;
    const localHeight = height * (0.12 + envelope * 0.78) * (0.88 + Math.sin(seed + index * 1.91) * 0.12 + Math.cos(seed * 0.47 + index * 0.83) * 0.07);
    const width = radiusZ * (0.42 + envelope * 0.62) * (0.9 + Math.sin(seed * 0.72 + index) * 0.1);
    vertices.push(
      x, 0, width,
      x, localHeight, width * 0.12,
      x, localHeight * (0.86 + Math.sin(seed + index * 0.57) * 0.1), -width * 0.1,
      x, 0, -width
    );
    if (index < segments) {
      const base = index * 4;
      const next = base + 4;
      indices.push(
        base, next, base + 1, base + 1, next, next + 1,
        base + 2, next + 2, base + 3, base + 3, next + 2, next + 3,
        base + 1, next + 1, base + 2, base + 2, next + 1, next + 2,
        base, base + 3, next, next, base + 3, next + 3
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
/** 城门外三条来袭通道各有一个道路附件位；拒马只能放在这些位置，不与院内建筑抢地基。 */
function fortificationPosition(lane: number): THREE.Vector3 {
  const lateral = ROAD_LANES[lane + 1] ?? 0;
  // A shallow fan outside the gate keeps all three road attachments readable and clickable.
  return new THREE.Vector3(lateral, 0, lane === 0 ? -22 : -20.4);
}
// 主帐放在院落视觉中心、前排城防位之后：默认俯视镜头同时能读到城门、道路和守护目标，
// 不会被靠近镜头的后墙长期遮住。
const CORE_POSITION = new THREE.Vector3(0, 0, 7.6);
// 每种地貌模块都有独立资源布局；所有位置均落在已铺设的商道/支路上。
// 因此不同世界不只是资源类型轮换，出城路线、风险与先拿哪一堆材料也会改变。
const RESOURCE_LAYOUTS = [
  [
    new THREE.Vector3(-13, 0, -27), new THREE.Vector3(13, 0, -27),
    new THREE.Vector3(-20, 0, -35), new THREE.Vector3(20, 0, -35),
    new THREE.Vector3(-29, 0, -44), new THREE.Vector3(29, 0, -44),
    new THREE.Vector3(-12, 0, -48), new THREE.Vector3(12, 0, -48),
    new THREE.Vector3(-35, 0, -53), new THREE.Vector3(35, 0, -53)
  ],
  [
    new THREE.Vector3(-11, 0, -25), new THREE.Vector3(16, 0, -29),
    new THREE.Vector3(-22, 0, -37), new THREE.Vector3(24, 0, -36),
    new THREE.Vector3(-31, 0, -47), new THREE.Vector3(31, 0, -46),
    new THREE.Vector3(-15, 0, -52), new THREE.Vector3(15, 0, -51),
    new THREE.Vector3(-36, 0, -57), new THREE.Vector3(36, 0, -55)
  ],
  [
    new THREE.Vector3(-16, 0, -30), new THREE.Vector3(12, 0, -26),
    new THREE.Vector3(-25, 0, -39), new THREE.Vector3(21, 0, -37),
    new THREE.Vector3(-33, 0, -48), new THREE.Vector3(30, 0, -45),
    new THREE.Vector3(-10, 0, -53), new THREE.Vector3(16, 0, -52),
    new THREE.Vector3(-36, 0, -58), new THREE.Vector3(36, 0, -57)
  ],
  [
    new THREE.Vector3(-12, 0, -29), new THREE.Vector3(12, 0, -29),
    new THREE.Vector3(-19, 0, -36), new THREE.Vector3(22, 0, -38),
    new THREE.Vector3(-28, 0, -45), new THREE.Vector3(27, 0, -43),
    new THREE.Vector3(-15, 0, -50), new THREE.Vector3(14, 0, -54),
    new THREE.Vector3(-34, 0, -56), new THREE.Vector3(34, 0, -56)
  ]
] as const;
// 事件只从这些经过碰撞验证的商路节点生成；它们和资源点同样位于可见的道路分支上，
// 不会被水塘、岩群或围墙夹住。
const FIELD_OBJECTIVE_POSITIONS = [
  new THREE.Vector3(-23, 0, -18),
  new THREE.Vector3(23, 0, -17),
  new THREE.Vector3(-15, 0, -35),
  new THREE.Vector3(15, 0, -35),
  new THREE.Vector3(-28, 0, -13),
  new THREE.Vector3(28, 0, -9),
  new THREE.Vector3(-23, 0, 3),
  new THREE.Vector3(23, 0, 5)
];

interface ResourceNode {
  id: string;
  type: "wood" | "stone" | "gear";
  amount: number;
  object: THREE.Group;
  position: THREE.Vector3;
}

interface EnemyVisual {
  object: THREE.Group;
  rig?: CharacterRig;
  flash: number;
  lastHitReaction: number;
  stolen: boolean;
  label: HTMLButtonElement;
}

interface Projectile {
  object: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
  duration: number;
}

interface BurstParticle {
  object: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

interface FallenVisual {
  object: THREE.Object3D;
  life: number;
  duration: number;
  direction: number;
  mixer?: THREE.AnimationMixer;
}

interface TitleActor {
  object: THREE.Object3D;
  origin: THREE.Vector3;
  speed: number;
  amplitude: number;
}

interface SupportAlly {
  rig: CharacterRig;
  cooldown: number;
}

/**
 * 城外的岩群、围墙和植被允许遮挡远景，但绝不能遮住受控角色。
 * 每个网格保留自己的材质副本，淡出时不会意外把同一资产的其他实例一起变透明。
 */
interface OccluderMesh {
  mesh: THREE.Mesh;
  materials: THREE.Material[];
  opacities: number[];
  groupKey: string;
}

interface AdventureReward {
  id: string;
  icon: string;
  name: string;
  text: string;
  repeatable?: boolean;
  apply: (state: NonNullable<GameState["adventure"]>, player: GameState["player"]) => void;
}

const ADVENTURE_REWARDS: AdventureReward[] = [
  { id: "edge", icon: "ph-sword", name: "镶钢刃", text: "攻击 +8", apply: (adventure) => { adventure.attack += 8; } },
  { id: "cloak", icon: "ph-heart", name: "商旅斗篷", text: "生命上限 +28，并恢复生命", apply: (_adventure, player) => { player.maxHp += 28; player.hp = Math.min(player.maxHp, player.hp + 28); } },
  { id: "steps", icon: "ph-sneaker-move", name: "逐风靴", text: "移动速度 +12%", apply: (adventure) => { adventure.moveSpeed *= 1.12; } },
  { id: "scope", icon: "ph-crosshair", name: "星砂瞄具", text: "攻击范围 +2.5", apply: (adventure) => { adventure.attackRange += 2.5; } },
  { id: "plating", icon: "ph-shield-chevron", name: "叠甲护臂", text: "伤害减免 +2", apply: (adventure) => { adventure.armor += 2; } },
  { id: "capacitor", icon: "ph-lightning", name: "机巧蓄能环", text: "战技威力 +25%", apply: (adventure) => { adventure.skillPower += 0.25; } },
  { id: "rations", icon: "ph-bowl-food", name: "热食军粮", text: "立即恢复 48 生命", repeatable: true, apply: (_adventure, player) => { player.hp = Math.min(player.maxHp, player.hp + 48); } }
];

class Soundscape {
  private context?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private effectsGain?: GainNode;
  private ambienceGain?: GainNode;
  private ambience?: AudioBufferSourceNode;
  private musicMode: "calm" | "danger" | "boss" | "choice" = "calm";
  private musicCooldown = 0;
  private musicStep = 0;
  private ambienceCooldown = 0;
  private intensity = 0;
  private lowDynamics = false;
  muted = false;

  ensure(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.82;
      this.master.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.effectsGain = this.context.createGain();
      this.ambienceGain = this.context.createGain();
      this.musicGain.gain.value = 0.72;
      this.effectsGain.gain.value = 0.82;
      this.ambienceGain.gain.value = 0.6;
      this.musicGain.connect(this.master);
      this.effectsGain.connect(this.master);
      this.ambienceGain.connect(this.master);
      this.startAmbience();
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.ensure();
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(value ? 0 : 0.82, this.context.currentTime, 0.035);
    }
  }

  setLevels(music: number, effects: number, ambience = music * 0.82): void {
    this.ensure();
    if (!this.context) return;
    this.musicGain?.gain.setTargetAtTime(THREE.MathUtils.clamp(music, 0, 1), this.context.currentTime, 0.035);
    this.effectsGain?.gain.setTargetAtTime(THREE.MathUtils.clamp(effects, 0, 1), this.context.currentTime, 0.035);
    this.ambienceGain?.gain.setTargetAtTime(THREE.MathUtils.clamp(ambience, 0, 1), this.context.currentTime, 0.035);
  }

  setLowDynamics(value: boolean): void {
    this.lowDynamics = value;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : value ? 0.68 : 0.82, this.context.currentTime, 0.08);
  }

  private startAmbience(): void {
    if (!this.context || !this.ambienceGain || this.ambience) return;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (0.5 + Math.sin(index / 9000) * 0.22);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 520;
    gain.gain.value = 0.018;
    source.connect(filter).connect(gain).connect(this.ambienceGain);
    source.start();
    this.ambience = source;
  }

  private noise(duration: number, volume: number, cutoff = 900): void {
    if (this.muted) return;
    this.ensure();
    if (!this.context || !this.effectsGain) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.effectsGain);
    source.start();
  }

  private ambienceNoise(duration: number, volume: number, cutoff: number): void {
    if (this.muted) return;
    this.ensure();
    if (!this.context || !this.ambienceGain) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (0.72 + Math.sin(index / 1900) * 0.18);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, this.context.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.ambienceGain);
    source.start();
  }

  private note(frequency: number, duration: number, volume: number, type: OscillatorType = "triangle"): void {
    if (this.muted || !this.context || !this.musicGain) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const harmonic = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = type;
    harmonic.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    harmonic.frequency.setValueAtTime(frequency * 2, now);
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(filter);
    harmonic.connect(filter);
    filter.connect(gain).connect(this.musicGain);
    oscillator.start(now);
    harmonic.start(now);
    oscillator.stop(now + duration);
    harmonic.stop(now + duration);
  }

  updateMusic(phase: GameState["phase"], delta: number, regionId: string, pressure: number, bossActive: boolean): void {
    if (!this.context || this.context.state !== "running" || this.muted) return;
    const nextMode = bossActive ? "boss" : phase === "night" ? "danger" : phase === "relic" || phase === "route" || phase === "clear" ? "choice" : "calm";
    if (nextMode !== this.musicMode) {
      this.musicMode = nextMode;
      this.musicStep = 0;
      this.musicCooldown = 0;
    }
    this.intensity = THREE.MathUtils.lerp(this.intensity, THREE.MathUtils.clamp(pressure, 0, 1), Math.min(1, delta * 1.8));
    this.ambienceCooldown -= delta;
    if (this.ambienceCooldown <= 0) {
      const ambience = regionId === "mist" ? [0.8, 0.012, 720] : regionId === "canyon" ? [0.55, 0.011, 360] : regionId === "stardust" ? [0.7, 0.009, 1250] : [0.65, 0.01, 560];
      this.ambienceNoise(ambience[0]!, ambience[1]!, ambience[2]!);
      this.ambienceCooldown = regionId === "mist" ? 2.4 : 3.2;
    }
    this.musicCooldown -= delta;
    if (this.musicCooldown > 0) return;

    const profiles: Record<string, { notes: number[]; drone: number; timbre: OscillatorType }> = {
      oasis: { notes: [220, 247, 277, 330, 370, 440], drone: 110, timbre: "triangle" },
      canyon: { notes: [147, 165, 196, 220, 247, 294], drone: 73.5, timbre: "sawtooth" },
      mist: { notes: [196, 233, 262, 311, 349, 392], drone: 98, timbre: "sine" },
      stardust: { notes: [185, 220, 277, 330, 415, 494], drone: 92.5, timbre: "triangle" }
    };
    const profile = profiles[regionId] ?? profiles.oasis!;
    if (this.musicMode === "boss") {
      const note = profile.notes[(this.musicStep * 2) % profile.notes.length]!;
      this.note(note * 0.5, 0.38, this.lowDynamics ? 0.012 : 0.022, profile.timbre);
      if (this.musicStep % 2 === 0) this.noise(0.15, this.lowDynamics ? 0.012 : 0.022, 260);
      this.musicCooldown = 0.38;
    } else if (this.musicMode === "danger") {
      const pulse = profile.notes;
      const note = pulse[this.musicStep % pulse.length]!;
      this.note(note, 0.32, (this.musicStep % 2 === 0 ? 0.013 : 0.009) + this.intensity * 0.008, profile.timbre);
      if (this.musicStep % 4 === 0) {
        this.noise(0.11, 0.01 + this.intensity * 0.008, 240);
        this.tone(profile.drone * 0.6, 0.16, "sine", 0.014);
      }
      this.musicCooldown = 0.46;
    } else if (this.musicMode === "choice") {
      const choiceNotes = [220, 277.18, 329.63, 415.3, 329.63, 277.18];
      this.note(choiceNotes[this.musicStep % choiceNotes.length]!, 0.85, 0.016);
      this.musicCooldown = 0.92;
    } else {
      const calmNotes = [profile.notes[0]!, 0, profile.notes[2]!, profile.notes[3]!, 0, profile.notes[4]!, profile.notes[3]!, profile.notes[1]!];
      const note = calmNotes[this.musicStep % calmNotes.length]!;
      if (note > 0) this.note(note, 0.78, 0.011, profile.timbre);
      if (this.musicStep % 8 === 0) this.note(profile.drone, 1.8, 0.007, "sine");
      this.musicCooldown = 0.86;
    }
    this.musicStep += 1;
  }

  tone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.05): void {
    if (this.muted) return;
    this.ensure();
    if (!this.context || !this.effectsGain) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.72), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.effectsGain);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  build(): void {
    this.noise(0.08, 0.022, 1500);
    this.tone(330, 0.18, "triangle", 0.05);
    setTimeout(() => this.tone(495, 0.22, "triangle", 0.038), 90);
  }
  hit(): void {
    this.noise(0.18, 0.04, 520);
    this.tone(92, 0.2, "sawtooth", 0.045);
  }
  bolt(): void {
    this.noise(0.045, 0.014, 2200);
    this.tone(620, 0.075, "square", 0.02);
  }
  coin(): void {
    this.tone(760, 0.1, "sine", 0.025);
    setTimeout(() => this.tone(980, 0.12, "sine", 0.018), 55);
  }
  warning(): void {
    this.tone(180, 0.36, "sawtooth", 0.055);
    setTimeout(() => this.tone(150, 0.44, "sawtooth", 0.05), 260);
  }
  victory(): void {
    this.tone(392, 0.2, "triangle", 0.045);
    setTimeout(() => this.tone(523, 0.22, "triangle", 0.042), 120);
    setTimeout(() => this.tone(659, 0.34, "triangle", 0.04), 250);
  }
  horn(): void {
    this.tone(196, 0.42, "sawtooth", 0.04);
    setTimeout(() => this.tone(246.94, 0.58, "sawtooth", 0.034), 280);
  }
  gate(): void {
    this.noise(0.34, 0.04, 420);
    this.tone(74, 0.42, "triangle", 0.045);
  }
  production(): void {
    this.tone(880, 0.07, "sine", 0.016);
    setTimeout(() => this.tone(1174, 0.08, "sine", 0.012), 45);
  }
  footstep(onStone: boolean): void {
    // 合成脚步不依赖外部录音：院内偏硬、城外偏沙，音量很低以免打断守城反馈。
    this.noise(onStone ? 0.035 : 0.055, onStone ? 0.008 : 0.012, onStone ? 1800 : 620);
    if (onStone) this.tone(185, 0.032, "triangle", 0.006);
  }
}

export class SilkRoadGame {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  private occlusionRaycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  library: AssetLibrary;
  canvas: HTMLCanvasElement;
  state: GameState | null = null;
  meta: MetaProgress;
  streams: SeedStreams | null = null;
  running = false;
  paused = false;
  mode: GameMode = "expedition";
  private activeSlot = 0;

  private world = new THREE.Group();
  private playerRig?: CharacterRig;
  private gateObject?: THREE.Object3D;
  private coreObject?: THREE.Group;
  private ground?: THREE.Mesh;
  private buildPads: THREE.Mesh[] = [];
  private buildingObjects = new Map<string, THREE.Group>();
  private buildingLabels = new Map<string, HTMLButtonElement>();
  private buildingCooldowns = new Map<string, number>();
  // 快捷栏缩略图在模型加载后只离屏渲染一次。此前每次建造、升级和迁营都会新建 WebGL 上下文，
  // 在高分屏和移动端会造成一次明显的掉帧，也会让玩家误以为按钮没有点中。
  private modelThumbnailCache = new Map<BuildingType, string>();
  private enemyObjects = new Map<string, EnemyVisual>();
  private resources: ResourceNode[] = [];
  private resourceLabels = new Map<string, HTMLButtonElement>();
  private selectedResourceId: string | null = null;
  private choiceObjects: THREE.Group[] = [];
  private choiceLabels: HTMLButtonElement[] = [];
  private selectedBuild: BuildingType | null = null;
  private placingFortification = false;
  private regionTransitioning = false;
  private hoveredPad = -1;
  private preview?: THREE.Group;
  private clickTarget: THREE.Vector3 | null = null;
  private clickRoute: THREE.Vector3[] = [];
  private moveRouteGuide?: THREE.Group;
  private mobileVector = new THREE.Vector2();
  private spawnQueue: EnemyState[] = [];
  private spawnCooldown = 0;
  private economyCooldown = 2.5;
  private playerFootstepCooldown = 0;
  private autosaveCooldown = 4;
  private hudCooldown = 0;
  private projectiles: Projectile[] = [];
  private particles: BurstParticle[] = [];
  private fallenVisuals: FallenVisual[] = [];
  private selectedBuildingId: string | null = null;
  private relocation: BuildingRelocationState | null = null;
  private cameraYaw = 0;
  // 默认把完整院落、城门来路和一部分城外地貌留在同一视野，玩家仍可滚轮或双指拉近细看。
  private cameraDistance = 40;
  private cameraFocus = new THREE.Vector3(0, 1.25, -0.7);
  private cameraShake = 0;
  private boundaryHintCooldown = 0;
  private promptTimer = 0;
  private gateStatusTimer = 0;
  private coreStatusTimer = 0;
  private productionPulse = 0;
  // 场景装饰（火焰、采集标记、附属肢体）不需要每一帧遍历所有模型。
  // 游戏逻辑和镜头仍按完整帧率更新，装饰动画固定在 30fps（触屏端 24fps）即可平滑呈现。
  private worldAnimationAccumulator = 0;
  private gateClosed = 0;
  private gateCloseTarget = 0;
  private touchPointer: number | null = null;
  private touchStart = new THREE.Vector2();
  private touchLast = new THREE.Vector2();
  private touchDragging = false;
  private touchPoints = new Map<number, THREE.Vector2>();
  private pinchDistance = 0;
  private selectedEnemyId: string | null = null;
  private hornedThisDay = false;
  private rangeIndicator?: THREE.Mesh;
  private weatherParticles?: THREE.Points;
  private weatherVelocity = new THREE.Vector3();
  private activeVisualRegionId = "oasis";
  private previewWeatherPhase = 0;
  private sunLight?: THREE.DirectionalLight;
  private moonFillLight?: THREE.DirectionalLight;
  private nightBrightness = 1.08;
  private fieldObject?: THREE.Group;
  private fortificationObjects = new Map<string, THREE.Group>();
  private titlePreview = true;
  private sound = new Soundscape();
  private storageWarningShown = false;
  private effectiveQuality: "low" | "medium" | "high" = "high";
  private preferredQuality: QualityTier = "auto";
  private qualitySampleTime = 0;
  private qualityFrames = 0;
  private qualityStableTime = 0;
  private courtyardPavingTexture?: THREE.Texture;
  private caravanRoadTexture?: THREE.Texture;
  private titleActors: TitleActor[] = [];
  private adventureProps: THREE.Object3D[] = [];
  private supportAllies: SupportAlly[] = [];
  private occluderMeshes: OccluderMesh[] = [];
  private occludedMeshes = new Set<THREE.Mesh>();
  private occlusionRefreshCooldown = 0;

  private hud = {
    root: document.querySelector<HTMLElement>("#hud")!,
    start: document.querySelector<HTMLElement>("#startScreen")!,
    loading: document.querySelector<HTMLElement>("#loading")!,
    pause: document.querySelector<HTMLElement>("#pauseOverlay")!,
    gameOver: document.querySelector<HTMLElement>("#gameOver")!,
    region: document.querySelector<HTMLElement>("#regionLabel")!,
    phase: document.querySelector<HTMLElement>("#phaseLabel")!,
    objective: document.querySelector<HTMLElement>("#objectiveLabel")!,
    epoch: document.querySelector<HTMLElement>("#epochLabel")!,
    time: document.querySelector<HTMLElement>("#timeLabel")!,
    day: document.querySelector<HTMLElement>("#dayProgress")!,
    playerHp: document.querySelector<HTMLElement>("#playerHpFill")!,
    gateHp: document.querySelector<HTMLElement>("#gateHpFill")!,
    gateBar: document.querySelector<HTMLElement>("#gateWorldBar")!,
    gateLevel: document.querySelector<HTMLElement>("#gateLevelLabel")!,
    gateHpText: document.querySelector<HTMLElement>("#gateHpText")!,
    gateUpgrade: document.querySelector<HTMLButtonElement>("#gateUpgradeBtn")!,
    gateUpgradeCost: document.querySelector<HTMLElement>("#gateUpgradeCost")!,
    gateRepair: document.querySelector<HTMLButtonElement>("#gateRepairBtn")!,
    gateRepairCost: document.querySelector<HTMLElement>("#gateRepairCost")!,
    coreHp: document.querySelector<HTMLElement>("#coreHpFill")!,
    coreHpText: document.querySelector<HTMLElement>("#coreHpText")!,
    coreBar: document.querySelector<HTMLElement>("#coreWorldBar")!,
    prompt: document.querySelector<HTMLElement>("#prompt")!,
    promptIcon: document.querySelector<HTMLElement>("#promptIcon")!,
    promptText: document.querySelector<HTMLElement>("#promptText")!,
    enemyArrow: document.querySelector<HTMLElement>("#enemyArrow")!,
    enemyCount: document.querySelector<HTMLElement>("#enemyCount")!,
    bossBar: document.querySelector<HTMLElement>("#bossBar")!,
    bossName: document.querySelector<HTMLElement>("#bossName")!,
    bossAction: document.querySelector<HTMLElement>("#bossAction")!,
    bossHp: document.querySelector<HTMLElement>("#bossHpFill")!,
    modifier: document.querySelector<HTMLElement>("#nightModifier")!,
    fieldObjective: document.querySelector<HTMLElement>("#fieldObjective")!,
    fieldObjectiveText: document.querySelector<HTMLElement>("#fieldObjectiveText")!,
    hotbar: document.querySelector<HTMLElement>("#hotbar")!,
    buildingLabels: document.querySelector<HTMLElement>("#buildingLabels")!,
    choiceLabels: document.querySelector<HTMLElement>("#choiceLabels")!,
    waveClear: document.querySelector<HTMLElement>("#waveClear")!,
    clearTitle: document.querySelector<HTMLElement>("#clearTitle")!,
    clearSubtitle: document.querySelector<HTMLElement>("#clearSubtitle")!,
    context: document.querySelector<HTMLElement>("#contextMenu")!,
    contextName: document.querySelector<HTMLElement>("#contextName")!,
    contextLevel: document.querySelector<HTMLElement>("#contextLevel")!,
    contextEffect: document.querySelector<HTMLElement>("#contextEffect")!,
    upgrade: document.querySelector<HTMLButtonElement>("#upgradeBtn")!,
    upgradeCost: document.querySelector<HTMLElement>("#upgradeCost")!,
    repair: document.querySelector<HTMLButtonElement>("#repairBtn")!,
    repairCost: document.querySelector<HTMLElement>("#repairCost")!,
    workshopMode: document.querySelector<HTMLButtonElement>("#workshopModeBtn")!,
    workshopModeText: document.querySelector<HTMLElement>("#workshopModeText")!,
    demolish: document.querySelector<HTMLButtonElement>("#demolishBtn")!,
    demolishRefund: document.querySelector<HTMLElement>("#demolishRefund")!,
    relocate: document.querySelector<HTMLButtonElement>("#relocateBtn")!,
    relocateText: document.querySelector<HTMLElement>("#relocateText")!,
    sound: document.querySelector<HTMLButtonElement>("#soundBtn")!,
    audioPanel: document.querySelector<HTMLElement>("#audioPanel")!,
    musicVolume: document.querySelector<HTMLInputElement>("#musicVolume")!,
    effectsVolume: document.querySelector<HTMLInputElement>("#effectsVolume")!,
    ambienceVolume: document.querySelector<HTMLInputElement>("#ambienceVolume")!,
    nightBrightness: document.querySelector<HTMLInputElement>("#nightBrightness")!,
    muteAudio: document.querySelector<HTMLButtonElement>("#muteAudioBtn")!,
    lowDynamics: document.querySelector<HTMLButtonElement>("#lowDynamicsBtn")!,
    pauseButton: document.querySelector<HTMLButtonElement>("#pauseBtn")!,
    autoDeploy: document.querySelector<HTMLButtonElement>("#autoDeployBtn")!,
    endDay: document.querySelector<HTMLButtonElement>("#endDayBtn")!,
    speed: document.querySelector<HTMLButtonElement>("#speedBtn")!,
    mobileAction: document.querySelector<HTMLButtonElement>("#mobileAction")!,
    adventure: document.querySelector<HTMLElement>("#adventureHud")!,
    adventureHero: document.querySelector<HTMLElement>("#adventureHero")!,
    adventureLevel: document.querySelector<HTMLElement>("#adventureLevel")!,
    adventureObjective: document.querySelector<HTMLElement>("#adventureObjective")!,
    adventureGear: document.querySelector<HTMLElement>("#adventureGear")!,
    adventureSkill: document.querySelector<HTMLButtonElement>("#adventureSkillBtn")!,
    adventureChoices: document.querySelector<HTMLElement>("#adventureChoices")!,
    adventureChoiceList: document.querySelector<HTMLElement>("#adventureChoiceList")!,
    values: {
      coin: document.querySelector<HTMLElement>("#coinValue")!,
      wood: document.querySelector<HTMLElement>("#woodValue")!,
      stone: document.querySelector<HTMLElement>("#stoneValue")!,
      gear: document.querySelector<HTMLElement>("#gearValue")!
    },
    rates: {
      coin: document.querySelector<HTMLElement>("#coinRate")!,
      wood: document.querySelector<HTMLElement>("#woodRate")!,
      stone: document.querySelector<HTMLElement>("#stoneRate")!,
      gear: document.querySelector<HTMLElement>("#gearRate")!
    }
  };

  constructor(canvas: HTMLCanvasElement, library: AssetLibrary) {
    this.canvas = canvas;
    this.library = library;
    // 与模型一起等待加载，避免首局在贴图尚未就绪时把庭院固定成纯色底板。
    this.courtyardPavingTexture = this.library.worldTexture("courtyard-paving");
    this.caravanRoadTexture = this.library.worldTexture("caravan-road");
    this.migrateLegacySlots();
    this.meta = this.loadMeta();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // 略收一点曝光，保留砂岩、木材和金属的明暗层次；过亮会让所有模型退化成同一片浅色。
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 3D 场景优先稳定帧率：手机/平板控制像素密度，高分屏桌面也不无上限堆像素。
    const storedQuality = localStorage.getItem("silk-road-bastion:quality") as QualityTier | null;
    if (storedQuality && ["auto", "low", "medium", "high"].includes(storedQuality)) this.preferredQuality = storedQuality;
    const storedNightBrightness = Number(localStorage.getItem("silk-road-bastion:night-brightness"));
    if (Number.isFinite(storedNightBrightness) && storedNightBrightness >= 0.8 && storedNightBrightness <= 1.35) {
      this.nightBrightness = storedNightBrightness;
      this.hud.nightBrightness.value = String(Math.round(storedNightBrightness * 100));
    }
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.effectiveQuality = this.preferredQuality === "auto"
      ? coarsePointer || window.innerWidth < 820 ? "medium" : "high"
      : this.preferredQuality;
    this.applyQuality();
    this.camera = new THREE.PerspectiveCamera(39, 1, 0.1, 180);
    this.bindEvents();
    this.resize();
    this.renderHotbar();
    this.renderModelThumbnails();
  }

  showTitle(): void {
    // Returning from a reward/route screen must not leave its exclusive HUD
    // classes attached to the next mode selected on the title page.
    this.resetTransientGameplayUi();
    this.titlePreview = true;
    this.running = false;
    // 初始构图固定在商路轴线上：首次打开即可同时辨认道路、城门、院内主帐。
    // 随后才开始极慢环绕，避免每次刷新恰好被侧墙挡住核心建筑。
    this.cameraYaw = 0;
    const previewState = createGame(this.mode, "TITLE", this.meta, "guardian");
    previewState.regionId = "oasis";
    if (this.mode === "survival") {
      previewState.phase = "night";
      previewState.phaseTime = 48;
    }
    this.state = previewState;
    this.streams = new SeedStreams(previewState.rng);
    this.buildWorld();
    this.state = null;
    this.streams = null;
    this.hud.root.classList.add("is-hidden");
    this.hud.waveClear.classList.add("is-hidden");
    this.hud.start.classList.remove("is-hidden");
    this.hud.pause.classList.add("is-hidden");
    this.hud.gameOver.classList.add("is-hidden");
    // 标题并不沿用战斗时的高空总览，而是用较低、更近的镜头把城门、院内主帐与商路放在一帧。
    // 进入游戏后 resetGameplayCamera() 会恢复适合点击建造的宽视野。
    this.camera.position.set(-8.5, 18.2, -35.5);
    this.camera.lookAt(4.2, 2.8, 1.4);
  }

  async newGame(mode: GameMode, seed: string, hero: HeroClass = "guardian"): Promise<void> {
    // 第一版保留行者历练的封面预告与旧存档兼容，但不允许从任何入口开启半完成模式。
    if (mode === "training" || this.regionTransitioning) return;
    // 新建只会覆盖当前选中的本地档位。标题页上已有未结束对局时先确认，
    // 避免玩家把“新建随机世界”误当成切换地图而丢掉数小时进度。
    const existingRun = this.titlePreview ? this.envelopeForSlot(this.activeSlot)?.run : null;
    if (existingRun && !window.confirm(`档位 ${this.activeSlot + 1} 有未结束的${modeName(existingRun.mode)}（第 ${existingRun.epoch} 夜）。确定覆盖并新建世界吗？`)) {
      return;
    }
    this.sound.ensure();
    this.titlePreview = false;
    this.mode = mode;
    this.state = createGame(mode, seed, this.meta, hero);
    this.regionTransitioning = true;
    try {
      await this.library.ensureRegionBundle(this.state.regionId);
    } finally {
      this.regionTransitioning = false;
    }
    this.state.qualityTier = this.preferredQuality;
    this.streams = new SeedStreams(this.state.rng);
    this.running = true;
    this.paused = false;
    this.resetTransientGameplayUi();
    this.hornedThisDay = false;
    this.resetGameplayCamera();
    this.renderHotbar();
    this.renderModelThumbnails();
    this.buildWorld();
    this.hud.start.classList.add("is-hidden");
    this.hud.gameOver.classList.add("is-hidden");
    this.hud.waveClear.classList.add("is-hidden");
    this.hud.enemyArrow.classList.add("is-hidden");
    this.hud.root.classList.remove("is-hidden");
    this.hud.root.classList.remove("is-adventure");
    this.hud.root.classList.toggle("is-survival", mode === "survival");
    this.hud.root.classList.toggle("is-expedition", mode === "expedition");
    this.hud.adventure.classList.add("is-hidden");
    this.updateHud(true);
    this.setPrompt("ph-storefront", "选择商栈后，后勤区会显示可用地基；建成后会持续产币");
    this.save();
  }

  async continueGame(): Promise<boolean> {
    if (this.regionTransitioning) return false;
    const envelope = this.loadEnvelope();
    if (!envelope?.run) return false;
    if (envelope.run.mode === "training") {
      // 旧测试版或导入存档仍可被导出保留，首版不将它恢复到未开放玩法。
      this.renderSaveSlots();
      this.refreshTitleUi();
      return false;
    }
    this.sound.ensure();
    this.titlePreview = false;
    this.state = envelope.run;
    this.regionTransitioning = true;
    try {
      await this.library.ensureRegionBundle(this.state.regionId);
    } finally {
      this.regionTransitioning = false;
    }
    this.preferredQuality = this.state.qualityTier ?? this.preferredQuality;
    this.effectiveQuality = this.preferredQuality === "auto"
      ? ((window.matchMedia?.("(pointer: coarse)").matches ?? false) || window.innerWidth < 820 ? "medium" : "high")
      : this.preferredQuality;
    this.applyQuality();
    this.meta = envelope.meta;
    this.mode = this.state.mode;
    this.streams = new SeedStreams(this.state.rng);
    this.running = true;
    this.paused = false;
    this.resetTransientGameplayUi();
    this.hornedThisDay = this.state.phase === "day" && this.state.phaseTime <= 8;
    this.resetGameplayCamera();
    this.renderHotbar();
    this.renderModelThumbnails();
    this.hud.root.classList.toggle("is-adventure", this.mode === "training");
    this.hud.root.classList.toggle("is-survival", this.mode === "survival");
    this.hud.root.classList.toggle("is-expedition", this.mode === "expedition");
    this.hud.adventure.classList.toggle("is-hidden", this.mode !== "training");
    const preservedAdventureEnemies = this.mode === "training" ? [...this.state.enemies] : [];
    if (this.mode !== "training") this.state.enemies = [];
    if (this.state.phase === "night") {
      this.state.phase = "day";
      this.state.phaseTime = Math.max(6, this.state.dayLength * 0.5);
    }
    this.buildWorld();
    if (this.state.phase === "relic") {
      this.setChoiceUi(true);
      const choices = this.state.pendingChoices
        .map((id) => relics.find((entry) => entry.id === id))
        .filter((entry): entry is (typeof relics)[number] => Boolean(entry));
      this.spawnChoices("relic", choices.map((entry) => ({ id: entry.id, color: entry.color })));
    } else if (this.state.phase === "route") {
      this.setChoiceUi(true);
      this.spawnChoices("route", this.state.pendingChoices.map((id) => ({ id, color: regionById(id.split("|")[0]!).accent })));
    } else if (this.state.phase === "clear") {
      this.hud.clearTitle.textContent = "守夜成功";
      this.hud.clearSubtitle.textContent = `第 ${this.state.epoch} 夜完成，驿站核心安全`;
      this.hud.waveClear.classList.remove("is-hidden");
    }
    this.hud.start.classList.add("is-hidden");
    this.hud.root.classList.remove("is-hidden");
    this.updateHud(true);
    if (this.mode === "training") {
      if (this.state.phase === "adventure-choice" && this.state.adventure?.choices.length) {
        this.showAdventureChoices(this.state.adventure.choices);
      } else if (preservedAdventureEnemies.length) {
        this.state.enemies = preservedAdventureEnemies;
        this.spawnAdventureSet(this.state.adventure?.roomKind ?? "camp");
        for (const enemy of preservedAdventureEnemies) this.createEnemyVisual(enemy);
        this.setPrompt("ph-floppy-disk", `已继续${this.state.adventure?.roomKind === "boss" ? "首领" : "当前"}营地`);
        this.updateAdventureHud();
      } else {
        this.startAdventureRoom(false);
      }
    }
    return true;
  }

  hasSave(): boolean {
    const run = this.loadEnvelope()?.run;
    return Boolean(run && run.mode !== "training");
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    if (this.titlePreview) this.showTitle();
  }

  getRecordsText(): string {
    // 行者历练当前仅在封面作为世界观预告，不能显示一条看似可刷却永远为 0 的纪录。
    return `远征声望 ${this.meta.renown}<br>无尽 ${this.meta.records.expedition} 夜 · 首领 ${this.meta.bossRecords.expedition} · 事件 ${this.meta.eventRecords.expedition}<br>极限 ${this.meta.records.survival} 夜 · 首领 ${this.meta.bossRecords.survival} · 繁荣 ${this.meta.prosperityRecords.survival}<br>行者历练 · 后续开放`;
  }

  animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    // 竖屏略微拉远，保证城门、主帐和首批功能区能同时进入可读视野，而不是只看见角色脚边。
    this.camera.fov = this.camera.aspect < 0.82 ? 52 : this.camera.aspect > 1.9 ? 42 : 44;
    const limits = this.cameraLimits(width, height);
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance, limits.min, limits.max);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.layoutChoiceObjects();
  }

  private layoutChoiceObjects(): void {
    if (!this.choiceObjects.length) return;
    const aspect = (this.canvas.clientWidth || window.innerWidth) / Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const xs = aspect > 1.9 ? [-15, 0, 15] : [-7.2, 0, 7.2];
    this.choiceObjects.forEach((object, index) => { object.position.x = xs[index] ?? 0; });
    this.positionWorldUi();
  }

  private cameraLimits(width = this.canvas.clientWidth || window.innerWidth, height = this.canvas.clientHeight || window.innerHeight): { min: number; max: number } {
    const aspect = width / Math.max(1, height);
    if (aspect < 0.82) return { min: 40, max: 60 };
    if (aspect < 1.25) return { min: 35, max: 56 };
    if (aspect > 1.9) return { min: 31, max: 52 };
    return { min: 33, max: 54 };
  }

  private resetGameplayCamera(): void {
    const aspect = (this.canvas.clientWidth || window.innerWidth) / Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const training = this.mode === "training";
    this.cameraDistance = training ? 40 : aspect < 0.82 ? 47 : aspect < 1.25 ? 41 : 40;
    const limits = this.cameraLimits();
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance, limits.min, limits.max);
    this.cameraFocus.set(0, 1.25, -0.7);
  }

  private changeCameraDistance(next: number): void {
    const { min, max } = this.cameraLimits();
    this.cameraDistance = THREE.MathUtils.clamp(next, min, max);
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state) this.state.nightSpeed = 1;
      if (document.hidden && this.running && !this.paused) this.togglePause(true);
    });
    this.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.canvas.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.handlePointerUp(event));
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.relocation) this.cancelRelocation();
      else {
        this.placingFortification = false;
        this.selectedBuild = null;
        this.hoveredPad = -1;
        this.refreshBuildZoneVisibility();
        this.updatePreview();
      }
    });
    this.canvas.addEventListener("wheel", (event) => {
      this.changeCameraDistance(this.cameraDistance + Math.sign(event.deltaY) * 2.5);
    }, { passive: true });

    document.querySelector("#skillBtn")?.addEventListener("click", () => this.action());
    this.hud.adventureSkill.addEventListener("click", () => this.adventureSkill());
    document.querySelector("#upgradeBtn")?.addEventListener("click", () => this.upgradeSelected());
    document.querySelector("#repairBtn")?.addEventListener("click", () => this.repairSelected());
    this.hud.workshopMode.addEventListener("click", () => this.cycleBuildingSpecialization());
    this.hud.relocate.addEventListener("click", () => this.beginRelocation());
    this.hud.demolish.addEventListener("click", () => this.demolishSelected());
    this.hud.gateUpgrade.addEventListener("click", () => this.upgradeGate());
    this.hud.gateRepair.addEventListener("click", () => this.repairGate());
    this.hud.pauseButton.addEventListener("click", () => this.togglePause());
    this.hud.autoDeploy.addEventListener("click", () => this.autoArrangeBuildings());
    this.hud.endDay.addEventListener("click", () => {
      if (this.state?.mode === "expedition" && !this.meta.seenTutorial && this.state.tutorialStep < 2) {
        this.setPrompt("ph-compass", this.state.tutorialStep === 0
          ? "第一步：点底部“商栈”，再点后院发光地基"
          : "第二步：点底部“床弩”，再点门楼发光地基");
        return;
      }
      if (this.state?.phase === "day" && this.playerRig && this.isInsideFort(this.playerRig.root.position) && !this.selectedBuild) {
        this.state.phaseTime = 0;
      } else if (this.state?.phase === "day") {
        this.setPrompt("ph-door", "先回到城内并取消建造预览，才能立即入夜");
      }
    });
    this.hud.speed.addEventListener("click", () => {
      if (!this.state || this.state.phase !== "night") return;
      this.state.nightSpeed = this.state.nightSpeed === 1 ? 2 : 1;
      this.hud.speed.innerHTML = `<b>${this.state.nightSpeed}x</b>`;
    });
    this.hud.sound.addEventListener("click", () => this.hud.audioPanel.classList.toggle("is-hidden"));
    const updateAudioLevels = () => this.sound.setLevels(Number(this.hud.musicVolume.value) / 100, Number(this.hud.effectsVolume.value) / 100, Number(this.hud.ambienceVolume.value) / 100);
    this.hud.musicVolume.addEventListener("input", updateAudioLevels);
    this.hud.ambienceVolume.addEventListener("input", updateAudioLevels);
    this.hud.effectsVolume.addEventListener("input", updateAudioLevels);
    this.hud.lowDynamics.addEventListener("click", () => {
      const enabled = this.hud.lowDynamics.getAttribute("aria-pressed") !== "true";
      this.hud.lowDynamics.setAttribute("aria-pressed", String(enabled));
      this.hud.lowDynamics.classList.toggle("is-active", enabled);
      this.sound.setLowDynamics(enabled);
    });
    this.hud.nightBrightness.addEventListener("input", () => {
      this.nightBrightness = Number(this.hud.nightBrightness.value) / 100;
      localStorage.setItem("silk-road-bastion:night-brightness", String(this.nightBrightness));
      this.updateLighting(this.state?.phase === "night" || (this.titlePreview && this.state?.mode === "survival"));
    });
    this.hud.muteAudio.addEventListener("click", () => {
      this.sound.setMuted(!this.sound.muted);
      const icon = this.sound.muted ? "ph-speaker-slash" : "ph-speaker-high";
      this.hud.sound.innerHTML = `<i class="ph ${icon}"></i>`;
      this.hud.muteAudio.innerHTML = `<i class="ph ${icon}"></i>${this.sound.muted ? "恢复声音" : "静音"}`;
    });
    document.querySelectorAll<HTMLButtonElement>("[data-quality]").forEach((button) => {
      button.addEventListener("click", () => this.setQualityTier(button.dataset.quality as QualityTier));
    });
    this.syncQualityButtons();
    this.hud.mobileAction.addEventListener("click", () => this.interact());
    this.hud.waveClear.addEventListener("click", () => {
      if (this.state?.phase === "clear") this.state.phaseTime = 0;
    });
    document.querySelector("#resumeBtn")?.addEventListener("click", () => this.togglePause(false));
    document.querySelector("#returnTitleBtn")?.addEventListener("click", () => {
      this.save();
      this.togglePause(false);
      this.showTitle();
      this.refreshTitleUi();
    });
    document.querySelector("#replayTutorialBtn")?.addEventListener("click", () => {
      this.meta.seenTutorial = false;
      this.setPrompt("ph-map-pin", "下一次无尽远征会重新开启可玩引导");
      this.save();
    });
    document.querySelector("#restartBtn")?.addEventListener("click", () => this.newGame(this.mode, ""));
    document.querySelector("#titleBtn")?.addEventListener("click", () => {
      this.showTitle();
      this.refreshTitleUi();
    });

  }

  public refreshTitleUi(): void {
    const continueButton = document.querySelector<HTMLElement>("#continueBtn");
    const savedRun = this.envelopeForSlot(this.activeSlot)?.run;
    const run = savedRun?.mode === "training" ? null : savedRun;
    continueButton?.classList.toggle("is-hidden", !run);
    if (continueButton && run) {
      const mode = modeName(run.mode);
      const progress = run.mode === "training" ? `营地 ${run.adventure?.room ?? 1}` : `第 ${run.epoch} 夜 · ${regionById(run.regionId).name}`;
      const shortMode = run.mode === "survival" ? "守城" : "远征";
      const shortProgress = run.mode === "training" ? progress : `第 ${run.epoch} 夜`;
      continueButton.innerHTML = `<i class="ph ph-arrow-clockwise"></i><span>继续${shortMode} · ${shortProgress}</span>`;
      continueButton.title = `继续档位 ${this.activeSlot + 1}：${progress}`;
    }
    const records = document.querySelector<HTMLElement>("#records");
    if (records) records.innerHTML = this.getRecordsText();
  }

  private disposeWorldObject(root: THREE.Object3D): void {
    const worldTextures = new Set<THREE.Texture>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
      // Each SkeletonUtils clone owns a bone DataTexture. Materials do not
      // reference it, so a material-only sweep leaked one GPU texture per
      // animated unit on every world rebuild.
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      if (!object.userData.sharedAssetGeometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        // World clones share decoded images with the library, but their WebGL
        // texture cache keys are renderer-owned. Explicitly releasing every map
        // referenced by the departing world prevents seven stale GPU variants
        // accumulating on each rebuild. The retained Texture objects upload
        // again on demand when the next regional world is rendered.
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) worldTextures.add(value);
        if (!object.userData.sharedAssetMaterial) material.dispose();
      }
    });
    for (const texture of worldTextures) texture.dispose();
  }

  private removeWorldObject(root: THREE.Object3D | undefined): void {
    if (!root) return;
    this.world.remove(root);
    this.disposeWorldObject(root);
  }

  private clearWorld(): void {
    // A region rebuild used to detach the previous world without releasing its
    // generated terrain, roads, particles and building-state meshes. Repeated
    // expeditions therefore accumulated GPU objects. Authored GLB geometry is
    // marked as shared by AssetLibrary and remains cached; all transient scene
    // resources are released here.
    // Shadow render targets live on the light rather than under world, so scene
    // removal alone cannot release them.
    // Every rebuilt light may own one or more GPU render targets. Disposing only
    // the cached sun reference left shadow textures behind when regional lamps
    // or future spot lights were introduced. Release all scene-light targets
    // before detaching the scene and clear render-list references afterwards.
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Light) || !("shadow" in object)) return;
      const shadow = (object as THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight).shadow;
      shadow?.map?.dispose();
      shadow?.mapPass?.dispose();
      if (shadow) {
        shadow.map = null;
        shadow.mapPass = null;
      }
    });
    if (this.world) this.disposeWorldObject(this.world);
    this.scene.clear();
    this.renderer.renderLists.dispose();
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildPads = [];
    this.buildingObjects.clear();
    this.buildingLabels.forEach((label) => label.remove());
    this.buildingLabels.clear();
    this.hud.buildingLabels.innerHTML = "";
    this.buildingCooldowns.clear();
    this.enemyObjects.forEach((visual) => visual.label.remove());
    this.enemyObjects.clear();
    this.resources = [];
    this.selectedResourceId = null;
    this.resourceLabels.forEach((label) => label.remove());
    this.resourceLabels.clear();
    this.choiceObjects = [];
    this.choiceLabels.forEach((label) => label.remove());
    this.choiceLabels = [];
    this.hud.choiceLabels.innerHTML = "";
    this.hud.bossBar.classList.add("is-hidden");
    this.projectiles = [];
    this.particles = [];
    this.fallenVisuals = [];
    this.playerRig = undefined;
    this.gateObject = undefined;
    this.coreObject = undefined;
    this.fieldObject = undefined;
    this.fortificationObjects.clear();
    this.titleActors = [];
    this.adventureProps = [];
    this.supportAllies = [];
    this.occluderMeshes = [];
    this.occludedMeshes.clear();
    this.occlusionRefreshCooldown = 0;
    this.selectedEnemyId = null;
    this.selectedBuildingId = null;
    this.hud.context.classList.add("is-hidden");
    this.preview = undefined;
    this.rangeIndicator = undefined;
    this.relocation = null;
    this.weatherParticles = undefined;
    this.sunLight = undefined;
    this.moonFillLight = undefined;
    this.clickRoute = [];
    this.moveRouteGuide = undefined;
  }

  /**
   * Scene choices, previews and selection classes are transient UI, never save
   * data. Reset them at every run boundary so a relic/route screen from the
   * previous mode cannot hide the survival build bar in a new game.
   */
  private resetTransientGameplayUi(): void {
    this.clearChoices();
    this.selectedBuild = null;
    this.selectedBuildingId = null;
    this.selectedEnemyId = null;
    this.selectedResourceId = null;
    this.placingFortification = false;
    this.hoveredPad = -1;
    if (this.relocation) this.cancelRelocation(false);
    if (this.preview) {
      this.removeWorldObject(this.preview);
      this.preview = undefined;
    }
    if (this.rangeIndicator) {
      this.removeWorldObject(this.rangeIndicator);
      this.rangeIndicator = undefined;
    }
    this.hud.context.classList.add("is-hidden");
    this.setChoiceUi(false);
  }

  private buildWorld(): void {
    const activeState = this.state ?? createGame("expedition", "TITLE", this.meta);
    this.normalizeBuildingZones(activeState);
    const region = regionById(activeState.regionId);
    this.activeVisualRegionId = region.id;
    const visualProfile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    this.clearWorld();
    const isNightPreview = this.titlePreview && activeState.mode === "survival";
    this.scene.background = new THREE.Color(isNightPreview ? 0x142c38 : region.sky);
    // 白天远景保留层次而不是用浓雾把整张地图洗成灰色；夜袭才收紧雾距制造压力。
    const dayFogDensity = visualProfile.weather === "mist" ? 0.0115 : visualProfile.weather === "wind" ? 0.0082 : 0.0068;
    this.scene.fog = new THREE.FogExp2(isNightPreview ? 0x1f3940 : region.fog, isNightPreview ? Math.max(0.014, dayFogDensity * 1.35) : dayFogDensity);

    // 环境光只负责保留阴影里的材质细节；主方向光负责塑造砖墙、圆顶和道路的体积。
    // 过去两者都太亮，场景会像均匀打光的沙盒摆件。
    const hemi = new THREE.HemisphereLight(0xd8ccb4, 0x294347, isNightPreview ? 0.94 * this.nightBrightness : 1.16);
    hemi.name = "ambient";
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(isNightPreview ? 0x91acd2 : 0xffd8a1, isNightPreview ? 1.04 * this.nightBrightness : 3.65);
    sun.position.set(-22, 38, -18);
    sun.castShadow = true;
    const shadowSize = qualityPresets[this.effectiveQuality].shadowMapSize;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -44;
    sun.shadow.camera.right = 44;
    sun.shadow.camera.top = 44;
    sun.shadow.camera.bottom = -44;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.018;
    sun.name = "sun";
    this.sunLight = sun;
    this.scene.add(sun);
    // 反方向的低强度月光只勾出敌人、拒马和城墙背光侧的轮廓，
    // 让夜袭仍有夜色，但不会因单位融进阴影而失去战术可读性。
    const moonFill = new THREE.DirectionalLight(0x8fb9d7, isNightPreview ? 0.42 * this.nightBrightness : 0);
    moonFill.position.set(24, 19, 14);
    moonFill.name = "moon-fill";
    this.moonFillLight = moonFill;
    this.scene.add(moonFill);

    if (activeState.mode === "training") {
      this.buildTrainingWorld(region, activeState);
      return;
    }

    const terrainTexture = this.library.worldTexture(visualProfile.groundTexture);
    this.ground = this.buildContinuousTerrain(region, activeState, terrainTexture, isNightPreview);

    // 商道只由 spawnScenery 中贴合高度场的曲线网格生成。这里不再叠加矩形平面，
    // 否则两套道路会互相穿插，出现截图中白色长条和悬空交叉口。
    if (this.caravanRoadTexture) this.caravanRoadTexture.repeat.set(1.18, 5.6);

    const fortBack = this.fortBackZ(activeState);
    const floorDepth = fortBack + 12;
    const fortWidth = this.currentFortLayout(activeState).width;
    if (this.courtyardPavingTexture) this.courtyardPavingTexture.repeat.set(2.8, Math.max(3.2, floorDepth / 7.2));
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: this.courtyardPavingTexture ? 0xffffff : region.floor,
      map: this.courtyardPavingTexture ?? null,
      bumpMap: this.courtyardPavingTexture ?? null,
      bumpScale: 0.09,
      roughness: 0.92,
      metalness: 0.02
    });
    // 低角度/雾天仍保留石缝和磨损细节，避免真实贴图在阴影中重新变成一整块纯色。
    if (this.courtyardPavingTexture) {
      floorMaterial.emissive.set(0x4b412d);
      floorMaterial.emissiveMap = this.courtyardPavingTexture;
      floorMaterial.emissiveIntensity = 0.16;
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fortWidth - 2, floorDepth), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.025, (fortBack - 12) * 0.5);
    floor.receiveShadow = true;
    floor.userData.ground = true;
    this.world.add(floor);
    // 贴图加载失败时仍以程序化石砖兜底，正式渲染则使用连续砂岩庭院而非一块块浮在地面的色块。
    if (!this.courtyardPavingTexture) this.buildCourtyardPaving(region);

    this.buildWalls(region);
    this.buildFortifications(region);
    this.buildPadsAndCore(region);
    this.spawnScenery(region);
    this.buildRegionLandmark(region);
    this.buildRegionModule(region);
    this.buildWeather(region);

    if (this.titlePreview) {
      const rig = this.library.unit("player");
      rig.root.position.set(-2, 0, 5);
      rig.root.rotation.y = Math.PI;
      rig.setMoving(true);
      this.world.add(rig.root);
      this.playerRig = rig;
      this.titleActors.push({ object: rig.root, origin: rig.root.position.clone(), speed: 0.62, amplitude: 2.8 });
      const market = makeBuildModel("market", this.library, region);
      market.position.set(9, 0, 8);
      market.scale.setScalar(0.86);
      this.world.add(market);
      const ballista = makeBuildModel("ballista", this.library, region);
      ballista.position.set(-9.2, 0, 7.2);
      ballista.rotation.y = -0.68;
      ballista.scale.setScalar(0.76);
      this.world.add(ballista);
      if (activeState.mode === "survival") {
        (["raider", "shield", "archer"] as const).forEach((kind, index) => {
          const enemyRig = this.library.unit(kind);
          enemyRig.root.position.set(-6 + index * 5, 0, -22 - index * 2);
          enemyRig.root.rotation.y = Math.PI;
          enemyRig.setMoving(true);
          this.world.add(enemyRig.root);
          this.titleActors.push({ object: enemyRig.root, origin: enemyRig.root.position.clone(), speed: 0.78 + index * 0.08, amplitude: 3.8 });
        });
      }
    } else {
      this.spawnPlayer(region);
      for (const building of activeState.buildings) this.createBuildingVisual(building);
      if (activeState.phase === "day") {
        this.spawnResources(region);
        this.spawnFieldObjective(region);
      }
    }
    this.refreshOccluders();
    this.updateGateBarPosition();
  }

  private terrainHeightAt(x: number, z: number, region = regionById(this.state?.regionId ?? "oasis")): number {
    if (this.state?.mode === "training") return 0;
    const halfWidth = this.fortHalfWidth();
    const backZ = this.fortBackZ();
    if (Math.abs(x) < halfWidth + 1.8 && z > -14.2 && z < backZ + 1.8) return 0;
    const variant = this.state?.terrainVariant ?? 0;
    const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    const roadCenter = region.id === "canyon"
      ? Math.sin((z + 35) * 0.055) * 4.2
      : region.id === "mist"
        ? Math.sin((z + 27) * 0.045) * 2.8
        : region.id === "stardust"
          ? Math.sin((z + 18) * 0.036) * 3.6
          : Math.sin((z + 22) * 0.05) * 1.2;
    const roadDistance = Math.abs(x - roadCenter);
    const roadFlatten = z < -10 ? THREE.MathUtils.smoothstep(roadDistance, 2.8, 6.6) : 1;
    const broad = Math.sin((x + variant * 11) * 0.052) * Math.cos((z - variant * 7) * 0.043);
    const folds = Math.sin(x * 0.11 + z * 0.067 + variant * 1.7) * 0.42;
    const mistCreek = x - (22 + Math.sin((z + 42) * 0.075) * 5.2);
    const basin = region.id === "mist"
      ? -Math.exp(-Math.pow(mistCreek / 13, 2)) * (0.55 + Math.max(0, Math.sin((z + 54) * 0.09)) * 0.48)
      : 0;
    const oasisCreek = x - (-28 + Math.sin((z + 45) * 0.06) * 6.4);
    const channel = region.id === "oasis" ? -Math.exp(-Math.pow(oasisCreek / 8.6, 2)) * 0.62 : 0;
    const canyonCenter = x - Math.sin((z + 34) * 0.047) * 5.8;
    const canyon = region.id === "canyon"
      ? Math.pow(THREE.MathUtils.smoothstep(Math.abs(canyonCenter), 12, 54), 1.55) * 4.4
        + Math.max(0, Math.sin(Math.abs(canyonCenter) * 0.22 + z * 0.035)) * 0.62
      : 0;
    const plateau = region.id === "stardust"
      ? THREE.MathUtils.smoothstep(Math.abs(x + Math.sin(z * 0.04) * 5), 18, 58) * 2.1
        + Math.sin((x + z) * 0.045) * 0.36
      : 0;
    const edgeDistance = Math.max(0, Math.hypot(x * 0.84, z + 18) - 65);
    return ((broad + folds) * profile.terrainAmplitude * 0.36 + basin + channel + canyon + plateau + Math.min(8, edgeDistance * 0.16)) * roadFlatten;
  }

  private buildContinuousTerrain(
    region: RegionDefinition,
    state: GameState,
    terrainTexture: THREE.Texture | undefined,
    nightPreview: boolean
  ): THREE.Mesh {
    const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    const resolution = this.effectiveQuality === "high" ? 76 : this.effectiveQuality === "medium" ? 58 : 42;
    const geometry = new THREE.PlaneGeometry(220, 210, resolution, resolution);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const packed = new THREE.Color(profile.surfaceLayers.find((entry) => entry.id === "packed")?.color ?? region.ground);
    const rock = new THREE.Color(profile.surfaceLayers.find((entry) => entry.id === "rock")?.color ?? profile.boundaryColor);
    const sand = new THREE.Color(profile.surfaceLayers.find((entry) => entry.id === "sand")?.color ?? region.ground);
    const wet = new THREE.Color(profile.surfaceLayers.find((entry) => entry.id === "wet")?.color ?? region.ground);
    const vegetation = new THREE.Color(profile.surfaceLayers.find((entry) => entry.id === "vegetation")?.color ?? region.ground);
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index) - 20;
      const height = this.terrainHeightAt(x, z, region);
      position.setY(index, height);
      position.setZ(index, z);
      const detail = Math.sin(x * 0.31 + state.terrainVariant) * Math.cos(z * 0.27 - state.terrainVariant * 0.6);
      const slope = Math.abs(this.terrainHeightAt(x + 1.2, z, region) - height) + Math.abs(this.terrainHeightAt(x, z + 1.2, region) - height);
      const color = packed.clone().lerp(sand, THREE.MathUtils.clamp(0.42 + detail * 0.18, 0.08, 0.82));
      if (slope > 0.55 || Math.abs(height) > 2.6) color.lerp(rock, THREE.MathUtils.clamp(slope * 0.5, 0.22, 0.8));
      const oasisWaterDistance = Math.abs(x - (-28 + Math.sin((z + 45) * 0.06) * 6.4));
      const mistWaterDistance = Math.abs(x - (22 + Math.sin((z + 42) * 0.075) * 5.2));
      if ((region.id === "oasis" && oasisWaterDistance < 11) || (region.id === "mist" && mistWaterDistance < 15)) {
        color.lerp(wet, 0.62).lerp(vegetation, Math.max(0, detail) * 0.22);
      }
      color.multiplyScalar(0.94 + (detail + 1) * 0.025);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const pbrSurface = region.id === "oasis" ? "sand" : "stone";
    const pbrColor = this.library.worldTexture(`pbr-${pbrSurface}-color`);
    const terrainColor = pbrColor ?? terrainTexture;
    const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: terrainColor ?? null,
      normalMap: this.library.worldTexture(`pbr-${pbrSurface}-normal`) ?? null,
      normalScale: new THREE.Vector2(region.id === "mist" ? 0.28 : 0.42, region.id === "mist" ? 0.28 : 0.42),
      roughnessMap: this.library.worldTexture(`pbr-${pbrSurface}-roughness`) ?? null,
      bumpMap: null,
      bumpScale: 0,
      roughness: 0.96
    }));
    terrain.receiveShadow = true;
    terrain.userData.ground = true;
    terrain.name = "continuous-terrain";
    this.world.add(terrain);
    this.buildHorizon(region, nightPreview);
    return terrain;
  }

  private buildHorizon(region: RegionDefinition, nightPreview: boolean): void {
    const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    const skyGeometry = new THREE.SphereGeometry(235, 32, 18);
    const skyPosition = skyGeometry.getAttribute("position") as THREE.BufferAttribute;
    const skyColors = new Float32Array(skyPosition.count * 3);
    const zenith = new THREE.Color(nightPreview ? 0x13242f : region.sky).multiplyScalar(nightPreview ? 0.72 : 1);
    const horizon = new THREE.Color(nightPreview ? 0x27363d : profile.horizonColor);
    for (let index = 0; index < skyPosition.count; index += 1) {
      const t = THREE.MathUtils.clamp((skyPosition.getY(index) / 235 + 0.18) / 1.18, 0, 1);
      const color = horizon.clone().lerp(zenith, Math.pow(t, 0.62));
      skyColors[index * 3] = color.r;
      skyColors[index * 3 + 1] = color.g;
      skyColors[index * 3 + 2] = color.b;
    }
    skyGeometry.setAttribute("color", new THREE.BufferAttribute(skyColors, 3));
    const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    sky.position.set(0, -24, -18);
    sky.raycast = () => undefined;
    sky.renderOrder = -4;
    this.world.add(sky);

    const mountainMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(profile.horizonColor).multiplyScalar(nightPreview ? 0.58 : 0.82), roughness: 1
    });
    const mountains = new THREE.Group();
    mountains.name = "procedural-horizon";
    const count = this.effectiveQuality === "low" ? 18 : 30;
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + (this.state?.terrainVariant ?? 0) * 0.17;
      const radius = 108 + (index * 23 % 38);
      const height = 13 + (index * 17 % 24) + (region.id === "canyon" ? 8 : 0);
      const mountain = makeHorizonMound(
        mountainMaterial,
        15 + (index % 5) * 3.4,
        9 + (index % 4) * 2.2,
        height,
        index * 1.73 + (this.state?.terrainVariant ?? 0) * 4.2,
        11 + index % 5
      );
      mountain.position.set(Math.cos(angle) * radius, -3.4, -20 + Math.sin(angle) * radius);
      mountain.rotation.y = angle + 0.4;
      mountain.raycast = () => undefined;
      mountains.add(mountain);
      if (index % 3 === 0) {
        const shoulder = makeHorizonMound(
          mountainMaterial,
          11 + (index % 4) * 2.2,
          7 + (index % 3) * 1.8,
          height * 0.58,
          index * 2.19 + 8.4,
          9
        );
        shoulder.position.set(Math.cos(angle + 0.16) * 12, -0.2, Math.sin(angle + 0.16) * 7);
        shoulder.rotation.y = -0.35;
        shoulder.raycast = () => undefined;
        mountain.add(shoulder);
      }
    }
    this.world.add(mountains);
  }

  /** 区域天气使用少量 GPU 点精灵，跟随世界坐标而非 HUD；画质档位只调整数量。 */
  private buildWeather(region: RegionDefinition): void {
    const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    const preset = qualityPresets[this.effectiveQuality];
    const count = Math.max(18, Math.round(qualityPresets.high.weatherParticles * profile.weatherDensity));
    const visibleCount = Math.max(12, Math.round(preset.weatherParticles * profile.weatherDensity));
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = ((index * 37) % 128) - 64;
      positions[index * 3 + 1] = profile.weather === "mist" ? 0.8 + (index % 7) * 0.34 : 1 + (index % 19) * 0.72;
      positions[index * 3 + 2] = ((index * 61) % 118) - 72;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, visibleCount);
    const material = new THREE.PointsMaterial({
      color: profile.weatherColor,
      size: profile.weather === "mist" ? 2.8 : profile.weather === "starlight" ? 0.16 : 0.12,
      transparent: true,
      opacity: profile.weather === "mist" ? 0.1 : profile.weather === "dry" ? 0.25 : 0.4,
      depthWrite: false,
      sizeAttenuation: true
    });
    const particles = new THREE.Points(geometry, material);
    particles.name = `weather-${profile.weather}`;
    particles.frustumCulled = false;
    particles.raycast = () => undefined;
    this.weatherVelocity.set(
      profile.weather === "wind" ? 5.6 : profile.weather === "dry" ? 1.3 : profile.weather === "mist" ? 0.45 : 0.15,
      profile.weather === "starlight" ? 0.18 : 0,
      profile.weather === "wind" ? 1.5 : 0.22
    );
    this.world.add(particles);
    this.weatherParticles = particles;
  }

  /** 每个区域至少有一个可从默认镜头识别的地标，不再只在路线文字里出现。 */
  private buildRegionLandmark(region: RegionDefinition): void {
    const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    const root = new THREE.Group();
    root.position.set(profile.landmarkPosition.x, this.terrainHeightAt(profile.landmarkPosition.x, profile.landmarkPosition.z, region), profile.landmarkPosition.z);
    root.rotation.y = 0.28;
    root.name = `landmark-${profile.landmark}`;
    const authoredLandmark = `region-${region.id}-landmark`;
    if (this.library.hasModel(authoredLandmark)) {
      const model = this.library.model(authoredLandmark);
      model.name = "authored-region-landmark";
      // Authored bundles use common world dimensions and keep Y=0 at terrain contact.
      const scale = region.id === "oasis" ? 0.92 : region.id === "canyon" ? 0.86 : region.id === "mist" ? 0.82 : 0.9;
      model.scale.setScalar(scale);
      root.add(model);
      if (region.id === "mist") {
        const lamp = new THREE.PointLight(0xe5b35d, 2.1, 25, 2);
        lamp.position.set(3.5, 6.8, 3.6);
        root.add(lamp);
      }
    } else if (profile.landmark === "oasis-channel") {
      // 水渠已作为连续地形的一部分生成；地标只保留渠边驿亭和取水设施，
      // 避免再叠一张矩形水面。
      const shrine = this.library.model("tower-hexagon-base", 0x8e795f, 0.34);
      shrine.scale.setScalar(1.1);
      shrine.position.set(0, 0, 0);
      const canopy = this.library.model("tower-hexagon-roof", region.accent, 0.38);
      canopy.scale.setScalar(1.18);
      canopy.position.set(0, 4.2, 0);
      const trough = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.52, 16), new THREE.MeshStandardMaterial({ color: 0x776b5c, roughness: 0.96 }));
      trough.position.set(3.1, 0.28, 0.8);
      root.add(shrine, canopy, trough);
    } else if (profile.landmark === "quarry-terraces") {
      // The quarry is an excavated work site, not a slab placed on top of the terrain.
      // Rock groups form an open crescent, leaving a readable haul road through the middle.
      for (const [x, z, scale, rotation] of [
        [-8.4, 2.8, 2.6, 0.3], [-5.2, 7.1, 2.2, 1.1], [-0.8, 9.4, 2.9, 2.2],
        [4.2, 8.2, 2.35, 0.7], [8.1, 4.1, 2.65, 1.8]
      ] as const) {
        const outcrop = this.library.model("rocks-large", 0x7d4d3f, 0.38);
        outcrop.position.set(x, 0, z);
        outcrop.scale.setScalar(scale);
        outcrop.rotation.y = rotation;
        root.add(outcrop);
      }
      const timber = new THREE.MeshStandardMaterial({ color: 0x4d3124, roughness: 0.94 });
      for (const x of [-2.5, 2.5]) {
        const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 4.2, 8), timber);
        brace.position.set(x, 2.1, 2.1); brace.rotation.z = x < 0 ? -0.09 : 0.09; brace.castShadow = true; root.add(brace);
      }
      const crossbeam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.3, 8), timber);
      crossbeam.position.set(0, 4.05, 2.1); crossbeam.rotation.z = Math.PI / 2; crossbeam.castShadow = true; root.add(crossbeam);
      const haulBucket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0x4a4540, metalness: 0.32, roughness: 0.62 }));
      haulBucket.position.set(0, 1.05, 2.1); haulBucket.castShadow = true; root.add(haulBucket);
      const leftPier = this.library.model("rocks-large", 0x713c31, 0.46);
      const rightPier = this.library.model("rocks-large", 0x713c31, 0.46);
      leftPier.scale.set(4.2, 5.8, 3.6); rightPier.scale.set(4.6, 6.4, 3.9);
      leftPier.position.set(-11, 0, -3.5); rightPier.position.set(10.5, 0, -2.2);
      leftPier.rotation.y = 0.5; rightPier.rotation.y = -0.62;
      const bridge = this.library.fittedModel("village-wall", [15.8, 2.4, 3.1], 0x713c31, 0.34);
      bridge.position.set(0, 7.2, -3.2);
      bridge.rotation.z = 0.03;
      root.add(leftPier, rightPier, bridge);
    } else if (profile.landmark === "harbor-beacon") {
      const base = this.library.model("tower-hexagon-base", 0x61716c, 0.45);
      const mid = this.library.model("tower-hexagon-mid", 0x61716c, 0.45);
      const roof = this.library.model("tower-hexagon-roof", 0x4f6868, 0.5);
      base.scale.setScalar(2.2);
      mid.scale.setScalar(2.2); mid.position.y = 4.5;
      roof.scale.setScalar(2.2); roof.position.y = 9;
      const lamp = new THREE.PointLight(0xe5b35d, 2.4, 24, 2);
      lamp.position.set(0, 10.5, 0);
      root.add(base, mid, roof, lamp);
      // 航标与抬高旧码头连接，断墙和装卸平台共同构成港口地标，而不是一根孤立塔。
      for (const [x, z, rotation, length] of [[-7, 3.5, 0.08, 7.5], [7.2, 2.4, -0.22, 6.4], [1.8, 8.1, Math.PI / 2, 5.6]] as const) {
        const pier = this.library.fittedModel("village-wall", [length, 1.1, 1.3], 0x536762, 0.24);
        pier.position.set(x, -0.18, z);
        pier.rotation.y = rotation;
        root.add(pier);
      }
      const cargo = this.library.fittedModel("village-crate", [1.4, 1.2, 1.4], 0x514337, 0.12);
      cargo.position.set(-5.8, 0.4, 2.6);
      root.add(cargo);
    } else {
      // 星砂地标改为半埋的观测遗迹：破损石柱围成不完整弧线，中央仅保留一架
      // 有明确用途的观星臂。删除此前三圈完美圆环，避免像调试辅助线。
      for (let index = 0; index < 7; index += 1) {
        const angle = -1.9 + index * 0.47;
        const radius = 6.2 + Math.sin(index * 1.7) * 0.65;
        const pillar = this.library.model("wall-pillar", 0x66636a, 0.3);
        pillar.scale.setScalar(0.42 + (index % 3) * 0.07);
        pillar.position.set(Math.cos(angle) * radius, index % 2 ? -0.25 : 0, Math.sin(angle) * radius);
        pillar.rotation.y = -angle + 0.2;
        pillar.rotation.z = (index - 3) * 0.018;
        root.add(pillar);
      }
      const pedestal = this.library.model("tower-hexagon-base", 0x69636d, 0.32);
      pedestal.scale.setScalar(0.92);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 5.6, 10), new THREE.MeshStandardMaterial({ color: 0x756448, metalness: 0.48, roughness: 0.46 }));
      arm.position.set(0, 3.1, 0);
      arm.rotation.z = -0.54;
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.55, 0.62, 12), new THREE.MeshStandardMaterial({ color: region.accent, emissive: region.accent, emissiveIntensity: 0.28, metalness: 0.38, roughness: 0.4 }));
      lens.position.set(1.45, 5.35, 0);
      lens.rotation.z = Math.PI * 0.5 - 0.54;
      const bearing = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.16, 10, 32, Math.PI * 1.55), new THREE.MeshStandardMaterial({ color: 0x596b70, metalness: 0.58, roughness: 0.42 }));
      bearing.position.set(0, 3.1, 0);
      bearing.rotation.set(Math.PI / 2.7, 0.22, -0.38);
      const braceA = this.library.fittedModel("village-balcony", [3.6, 1.1, 1.2], 0x4f5b61, 0.18);
      const braceB = this.library.fittedModel("village-balcony", [3.6, 1.1, 1.2], 0x4f5b61, 0.18);
      braceA.position.set(-2.1, 0.3, 0); braceA.rotation.y = Math.PI / 2;
      braceB.position.set(2.1, 0.3, 0); braceB.rotation.y = Math.PI / 2;
      root.add(pedestal, arm, lens, bearing, braceA, braceB);
    }
    this.world.add(root);
  }

  /** 区域模块必须对应真实布局，让玩家在迁营后能直接看出本次选择改变了什么。 */
  private buildRegionModule(region: RegionDefinition): void {
    if (!this.state?.regionModule) return;
    const root = new THREE.Group();
    const layout = this.currentFortLayout();
    root.name = `region-module-${this.state.regionModule}`;
    if (this.state.regionModule === "high-ground") {
      // Geometry is owned entirely by buildWalls(): one paved, wall-connected
      // bastion. Keeping decorative module meshes here caused duplicate supports
      // and a detached horizontal board in the courtyard.
    } else if (this.state.regionModule === "side-gate") {
      const arch = this.library.model("wall-doorway", region.accent, 0.38);
      arch.scale.setScalar(2.05); arch.position.set(this.fortHalfWidth(), 0, 2.8); arch.rotation.y = Math.PI / 2;
      root.add(arch);
    } else if (this.state.regionModule === "caravan-yard") {
      const zone = [...layout.zones].reverse().find((entry) => entry.type === "logistics")!;
      const canopy = makeBuildModel("market", this.library, region);
      canopy.scale.setScalar(0.72); canopy.position.set(zone.position.x - 3.1, 0, zone.position.z + 1.2);
      root.add(canopy);
      for (const [offsetX, offsetZ] of [[-2.2, -1.4], [2.1, -1.6], [-2.5, 2.1]] as const) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1), new THREE.MeshStandardMaterial({ color: 0x60422e, roughness: 0.94 }));
        crate.position.set(zone.position.x + offsetX, 0.45, zone.position.z + offsetZ); crate.castShadow = true; root.add(crate);
      }
    } else {
      const zone = layout.zones.find((entry) => entry.type === "siege") ?? layout.zones.find((entry) => entry.type === "defense")!;
      const tower = this.library.model("siege-ballista", region.accent, 0.28);
      tower.scale.setScalar(1.25); tower.position.set(zone.position.x + 3.3, 0, zone.position.z + 2.7); tower.rotation.y = Math.PI;
      root.add(tower);
      const gear = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.2, 8, 18), new THREE.MeshStandardMaterial({ color: 0x8f7955, metalness: 0.55, roughness: 0.38 }));
      gear.position.set(zone.position.x + 1.9, 1.25, zone.position.z + 2.9); gear.rotation.y = Math.PI / 2; gear.name = "module-gear";
      root.add(gear);
    }
    this.world.add(root);
  }

  private buildTrainingWorld(region: RegionDefinition, state: GameState): void {
    this.scene.background = new THREE.Color(0x47636a);
    this.scene.fog = new THREE.FogExp2(0x52645d, 0.018);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(29, 64),
      new THREE.MeshStandardMaterial({ color: 0x655744, map: this.library.worldTexture("region-oasis") ?? null, roughness: 0.98 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.ground = ground;
    this.world.add(ground);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(26.5, 29, 64),
      new THREE.MeshStandardMaterial({ color: 0x3d443d, roughness: 1 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.world.add(ring);
    for (let index = 0; index < 11; index += 1) {
      const rock = this.library.model(index % 2 ? "rocks-large" : "rocks-small", region.accent, 0.28);
      const angle = (index / 11) * Math.PI * 2;
      rock.position.set(Math.sin(angle) * 26, 0, Math.cos(angle) * 26);
      rock.rotation.y = angle * 1.7;
      rock.scale.setScalar(0.8 + (index % 3) * 0.18);
      this.world.add(rock);
    }
    const hero = state.adventure?.hero ?? "guardian";
    const kind = hero === "guardian" ? "brute" : hero === "ranger" ? "ranger" : "raider";
    const rig = this.library.character(kind, region.accent);
    rig.root.position.set(0, 0, 7);
    rig.root.rotation.y = Math.PI;
    if (this.titlePreview) rig.setMoving(true);
    this.playerRig = rig;
    this.world.add(rig.root);
    if (this.titlePreview) this.titleActors.push({ object: rig.root, origin: rig.root.position.clone(), speed: 0.58, amplitude: 2.2 });
    this.cameraDistance = Math.max(40, this.cameraLimits().min);
    if (this.titlePreview) {
      const previewKinds = ["raider", "brute", "raider"] as const;
      previewKinds.forEach((kind, index) => {
        const enemyRig = this.library.character(kind, 0xb06a4c);
        enemyRig.root.position.set(-7 + index * 7, 0, -11 - index * 2);
        enemyRig.root.rotation.y = Math.PI;
        enemyRig.setMoving(true);
        this.world.add(enemyRig.root);
        this.titleActors.push({ object: enemyRig.root, origin: enemyRig.root.position.clone(), speed: 0.72 + index * 0.09, amplitude: 2.7 });
      });
    }
  }

  private clearAdventureProps(): void {
    for (const object of this.adventureProps) this.removeWorldObject(object);
    this.adventureProps = [];
  }

  private spawnAdventureSet(kind: NonNullable<GameState["adventure"]>["roomKind"]): void {
    const region = regionById(this.state?.regionId ?? "oasis");
    const add = (object: THREE.Object3D): void => {
      this.world.add(object);
      this.adventureProps.push(object);
    };
    const addTorch = (x: number, z: number): void => {
      const torch = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.95 }));
      pole.position.y = 1.2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 9), new THREE.MeshStandardMaterial({ color: 0xf28b3c, emissive: 0xf28b3c, emissiveIntensity: 0.65, roughness: 0.72 }));
      flame.position.y = 2.55;
      flame.name = "flame";
      torch.add(pole, flame);
      torch.position.set(x, 0, z);
      add(torch);
    };
    if (kind === "camp" || kind === "caravan") {
      const market = makeBuildModel("market", this.library, region);
      market.position.set(-15, 0, -10);
      market.rotation.y = 0.36;
      market.scale.setScalar(kind === "caravan" ? 0.72 : 0.58);
      add(market);
      addTorch(-12, -13);
      addTorch(12, -13);
    }
    if (kind === "ruin") {
      for (const [x, z, rotation] of [[-14, -10, 0.45], [13, -12, -0.85]] as const) {
        const ruin = this.library.model("wall-doorway", 0x6f7d76, 0.38);
        ruin.position.set(x, 0, z);
        ruin.rotation.y = rotation;
        ruin.scale.setScalar(1.15);
        add(ruin);
      }
      addTorch(-8, -16);
    }
    if (kind === "elite" || kind === "boss") {
      for (const x of [-12, 12]) {
        const banner = this.library.model("flag-banner-long", region.accent, 0.42);
        banner.position.set(x, 3.4, -13);
        banner.scale.setScalar(1.25);
        add(banner);
        addTorch(x, -11);
      }
    }
    if (kind === "boss") {
      const ram = this.library.model("siege-ram", 0x724a38, 0.24);
      ram.position.set(0, 0, -20);
      ram.rotation.y = Math.PI;
      ram.scale.setScalar(1.1);
      add(ram);
    }
  }

  private adventureSeparation(enemy: EnemyState, position: THREE.Vector3): THREE.Vector3 {
    const separation = new THREE.Vector3();
    for (const other of this.state?.enemies ?? []) {
      if (other.id === enemy.id || other.heightLayer !== enemy.heightLayer) continue;
      const otherVisual = this.enemyObjects.get(other.id);
      if (!otherVisual) continue;
      const offset = position.clone().sub(otherVisual.object.position).setY(0);
      const minDistance = enemy.collisionRadius + other.collisionRadius;
      const distance = offset.length();
      if (distance > 0.02 && distance < minDistance) separation.addScaledVector(offset.normalize(), (minDistance - distance) / minDistance);
    }
    return separation;
  }

  private startAdventureRoom(initial: boolean): void {
    if (!this.state?.adventure) return;
    const adventure = this.state.adventure;
    adventure.attackRange ??= adventure.hero === "guardian" ? 3.8 : adventure.hero === "ranger" ? 11.5 : 6.2;
    adventure.armor ??= adventure.hero === "guardian" ? 2 : 0;
    adventure.skillPower ??= 0;
    const roomKinds = ["camp", "caravan", "ruin", "elite"] as const;
    adventure.roomKind = adventure.room === adventure.maxRooms
      ? "boss"
      : initial
        ? "camp"
        : this.streams?.pick("event", [...roomKinds]) ?? "camp";
    this.state.phase = "adventure";
    this.state.enemies = [];
    this.spawnQueue = [];
    this.enemyObjects.forEach((visual) => { this.removeWorldObject(visual.object); visual.label.remove(); });
    this.enemyObjects.clear();
    this.clearAdventureProps();
    this.spawnAdventureSet(adventure.roomKind);
    if (this.playerRig) this.playerRig.root.position.set(0, 0, 7);
    this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + (initial ? 0 : 18));
    const isBoss = adventure.room === adventure.maxRooms;
    const compositions: Record<Exclude<typeof adventure.roomKind, "boss">, EnemyType[]> = {
      camp: ["raider", "raider", "shield", "sapper"],
      caravan: ["raider", "looter", "raider", "shield"],
      ruin: ["sapper", "shield", "looter", "raider"],
      elite: ["shield", "looter", "sapper", "flyer", "raider"]
    };
    const roster = isBoss ? [] : compositions[adventure.roomKind as Exclude<typeof adventure.roomKind, "boss">];
    const roomSize = adventure.roomKind === "caravan" ? 2 + adventure.room : adventure.roomKind === "elite" ? 4 + adventure.room * 2 : 3 + adventure.room * 2;
    const wave: EnemyType[] = isBoss
      ? ["ram", "shield", "sapper", "looter"]
      : Array.from({ length: roomSize }, (_, index) => roster[(index + Math.floor((this.streams?.next("combat") ?? 0) * roster.length)) % roster.length]!);
    wave.forEach((type, index) => {
      const definition = enemies[type];
      const angle = -0.75 + (index / Math.max(1, wave.length - 1)) * 1.5;
      const distance = 16 + (index % 3) * 2;
      const enemy: EnemyState = {
        id: `a-${adventure.room}-${index}-${Date.now().toString(36)}`,
        type,
        hp: Math.round(definition.hp * (1 + adventure.room * 0.22) * (isBoss && index === 0 ? 1.6 : 1)),
        maxHp: Math.round(definition.hp * (1 + adventure.room * 0.22) * (isBoss && index === 0 ? 1.6 : 1)),
        speed: definition.speed,
        marchSpeed: definition.speed,
        combatSpeed: definition.speed,
        damage: definition.damage + adventure.room * 2,
        position: { x: Math.sin(angle) * distance, z: -5 - Math.cos(angle) * distance },
        target: "player", targetId: null, attackCooldown: 0, slowedUntil: 0, targetedUntil: 0,
        elite: isBoss && index === 0, lane: 0, formationRank: index, collisionRadius: type === "ram" ? 1.15 : 0.52, attackSlot: index, heightLayer: type === "flyer" ? 1 : 0,
        bossKind: null, bossPhase: 0, attackRange: type === "archer" ? 15 : 1.6, windupUntil: 0,
        bossAction: "advance", bossSkillCooldown: 0, bossTelegraphUntil: 0
      };
      this.state!.enemies.push(enemy);
      this.createEnemyVisual(enemy);
    });
    const roomNames = { camp: "盗匪营地", caravan: "失散商队", ruin: "风蚀遗迹", elite: "精锐哨所", boss: "首领营地" };
    const label = isBoss ? "首领营地：攻城兽正在逼近" : `${roomNames[adventure.roomKind]}：击败全部敌军`;
    this.setPrompt(isBoss ? "ph-crown" : "ph-swords", label);
    this.updateAdventureHud();
    this.save();
  }

  private updateAdventure(delta: number): void {
    if (!this.state?.adventure || !this.playerRig) return;
    const adventure = this.state.adventure;
    adventure.skillCooldown = Math.max(0, adventure.skillCooldown - delta);
    this.updatePlayer(delta);
    for (const enemy of this.state.enemies) {
      const visual = this.enemyObjects.get(enemy.id);
      if (!visual) continue;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta);
      const toPlayer = this.playerRig.root.position.clone().sub(visual.object.position).setY(0);
      const distance = toPlayer.length();
      const preferredRange = enemy.type === "looter" ? 8.2 : enemy.type === "flyer" ? 5.8 : enemy.type === "ram" ? 2.45 : 1.45;
      const moveDirection = toPlayer.normalize();
      if (distance > preferredRange + 0.35) {
        const separation = this.adventureSeparation(enemy, visual.object.position);
        visual.object.position.addScaledVector(moveDirection.addScaledVector(separation, 1.15).normalize(), Math.min(3.2, enemy.combatSpeed) * delta);
        visual.object.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      } else if ((enemy.type === "looter" || enemy.type === "flyer") && distance < preferredRange - 1.1) {
        visual.object.position.addScaledVector(moveDirection, -Math.min(2.4, enemy.combatSpeed) * delta);
      } else if (enemy.attackCooldown <= 0 && enemy.bossAction === "advance") {
        enemy.attackCooldown = enemy.type === "ram" ? 1.55 : 1.1;
        visual.rig?.attack();
        const damage = Math.max(1, enemy.damage - adventure.armor);
        this.state.player.hp = Math.max(0, this.state.player.hp - damage);
        if (enemy.type === "looter" || enemy.type === "flyer") this.fireProjectile(visual.object.position.clone().setY(enemy.type === "flyer" ? 3.1 : 2.1), this.playerRig.root.position.clone().setY(1.35), 0xcf8650);
        visual.flash = 0.12;
        this.burst(this.playerRig.root.position.clone().setY(1.3), 0xcf624b, 5);
        if (this.state.player.hp <= 0) { this.endRun(); return; }
      }
      enemy.position.x = visual.object.position.x;
      enemy.position.z = visual.object.position.z;
    }
    this.cleanupEnemies();
    if (!this.state.enemies.length && this.state.phase === "adventure") this.presentAdventureChoices();
    this.updateAdventureHud();
  }

  private presentAdventureChoices(): void {
    if (!this.state?.adventure || this.state.phase !== "adventure") return;
    const owned = new Set(this.state.adventure.gear);
    const available = ADVENTURE_REWARDS.filter((reward) => reward.repeatable || !owned.has(reward.name));
    const picks = this.streams?.shuffle("loot", available).slice(0, 3) ?? ADVENTURE_REWARDS.slice(0, 3);
    this.state.adventure.choices = picks.map((entry) => entry.id);
    this.state.phase = "adventure-choice";
    this.showAdventureChoices(this.state.adventure.choices);
  }

  private showAdventureChoices(ids: string[]): void {
    if (!this.state?.adventure) return;
    this.hud.adventureChoiceList.innerHTML = "";
    for (const id of ids) {
      const pick = ADVENTURE_REWARDS.find((entry) => entry.id === id);
      if (!pick) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<i class="ph ${pick.icon}"></i><strong>${pick.name}</strong><small>${pick.text}</small>`;
      button.addEventListener("click", () => this.selectAdventureChoice(pick.id));
      this.hud.adventureChoiceList.appendChild(button);
    }
    this.hud.adventureChoices.classList.remove("is-hidden");
    this.updateAdventureHud();
  }

  private selectAdventureChoice(id: string): void {
    if (!this.state?.adventure) return;
    const adventure = this.state.adventure;
    const reward = ADVENTURE_REWARDS.find((entry) => entry.id === id);
    if (!reward) return;
    reward.apply(adventure, this.state.player);
    adventure.gear.push(reward.name);
    adventure.experience += 10 + adventure.room * 4;
    if (adventure.experience >= adventure.nextExperience) { adventure.level += 1; adventure.experience -= adventure.nextExperience; adventure.nextExperience = Math.round(adventure.nextExperience * 1.45); }
    this.hud.adventureChoices.classList.add("is-hidden");
    if (adventure.room >= adventure.maxRooms) { this.endRun(); return; }
    adventure.room += 1;
    this.startAdventureRoom(false);
  }

  private adventureSkill(): void {
    if (!this.state?.adventure || this.state.adventure.skillCooldown > 0 || !this.playerRig) return;
    const adventure = this.state.adventure;
    adventure.skillCooldown = 7;
    const hero = adventure.hero;
    const radius = (hero === "artificer" ? 7.5 : hero === "guardian" ? 4.8 : 12) + adventure.skillPower * 1.5;
    let hits = 0;
    for (const enemy of this.state.enemies) {
      const visual = this.enemyObjects.get(enemy.id);
      if (!visual || visual.object.position.distanceTo(this.playerRig.root.position) > radius) continue;
      enemy.hp -= (hero === "ranger" ? adventure.attack * 1.6 : adventure.attack * 1.25) * (1 + adventure.skillPower);
      if (hero === "guardian" || hero === "artificer") enemy.slowedUntil = performance.now() + (hero === "artificer" ? 1600 : 1100);
      hits += 1;
    }
    this.burst(this.playerRig.root.position.clone().setY(1.35), hero === "artificer" ? 0x77a7b2 : 0xe2ad55, 16);
    this.sound.tone(hits ? 410 : 240, 0.18, "triangle", 0.05);
  }

  private updateAdventureHud(): void {
    const adventure = this.state?.adventure;
    if (!adventure) return;
    const names = { guardian: "盾刀守卫", ranger: "弩手行者", artificer: "机关术士" };
    this.hud.adventureHero.textContent = names[adventure.hero];
    this.hud.adventureLevel.textContent = `Lv.${adventure.level}`;
    const roomNames = { camp: "营地", caravan: "商队", ruin: "遗迹", elite: "哨所", boss: "首领" };
    this.hud.adventureObjective.textContent = this.state!.phase === "adventure-choice" ? "选择一件战利品" : `${roomNames[adventure.roomKind] ?? "营地"} ${adventure.room}/${adventure.maxRooms}，敌军 ${this.state!.enemies.length}`;
    this.hud.adventureGear.textContent = adventure.gear.length ? adventure.gear.slice(-2).join(" · ") : "空手上路";
    this.hud.adventureSkill.disabled = adventure.skillCooldown > 0;
    this.hud.adventureSkill.innerHTML = `<i class="ph ph-lightning"></i>${adventure.skillCooldown > 0 ? `${Math.ceil(adventure.skillCooldown)}秒` : "战技"}`;
  }

  private buildWalls(region: RegionDefinition): void {
    const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    const add = (name: string, x: number, z: number, rotation: number, scale = 2.15, tintStrength = 0.34): THREE.Object3D => {
      const object = this.library.model(name, profile.buildingPalette[0], tintStrength);
      object.position.set(x, this.terrainHeightAt(x, z, region), z);
      object.rotation.y = rotation;
      object.scale.setScalar(scale);
      this.world.add(object);
      return object;
    };
    const wallColor = profile.buildingPalette[0];
    const placeWall = (length: number, x: number, z: number, rotation = 0): void => {
      const segment = makeFortWallSegment(length, wallColor, this.library);
      segment.position.set(x, 0, z);
      segment.rotation.y = rotation;
      this.world.add(segment);
    };
    const halfWidth = this.fortHalfWidth();
    const gateHalfGap = 4.25;
    const frontSegmentLength = halfWidth - gateHalfGap;
    const frontCenter = (halfWidth + gateHalfGap) * 0.5;
    placeWall(frontSegmentLength, -frontCenter, -12);
    placeWall(frontSegmentLength, frontCenter, -12);
    const backZ = this.fortBackZ();
    const sideLength = backZ + 12;
    const sideCenter = (backZ - 12) * 0.5;
    placeWall(halfWidth * 2, 0, backZ);
    placeWall(sideLength, -halfWidth, sideCenter, Math.PI / 2);
    placeWall(sideLength, halfWidth, sideCenter, Math.PI / 2);
    add("wall-corner", -halfWidth, -12, Math.PI / 2, 2.3);
    add("wall-corner", halfWidth, -12, 0, 2.3);
    add("wall-corner", -halfWidth, backZ, Math.PI, 2.3);
    add("wall-corner", halfWidth, backZ, -Math.PI / 2, 2.3);
    const raisedDefenseSides = new Set(
      this.currentFortLayout().zones
        .filter((zone) => zone.type === "defense" && zone.elevation > 0.35 && Math.abs(zone.position.x) > 12)
        .map((zone) => Math.sign(zone.position.x) || 1)
    );
    if (raisedDefenseSides.size > 0) {
      // Raised defence sockets share one wall-connected bastion per side. The
      // build socket contributes no second plinth, preventing the overlapping
      // discs/boxes that previously appeared beneath ballistae.
      for (const side of raisedDefenseSides) {
        const bastionX = side * (halfWidth - 2.1);
        const stone = new THREE.MeshStandardMaterial({
          color: new THREE.Color(region.floor).lerp(new THREE.Color(0xb59a70), 0.18),
          map: this.library.worldTexture("pbr-stone-color") ?? null,
          normalMap: this.library.worldTexture("pbr-stone-normal") ?? null,
          normalScale: new THREE.Vector2(0.34, 0.34),
          roughnessMap: this.library.worldTexture("pbr-stone-roughness") ?? null,
          roughness: 0.96
        });
        const terrace = new THREE.Mesh(
          new THREE.BoxGeometry(8.6, 1.05, 6.25),
          stone
        );
        terrace.name = "integrated-side-bastion";
        terrace.position.set(bastionX, 0.52, -9.25);
        terrace.receiveShadow = true;
        terrace.castShadow = true;
        this.world.add(terrace);
        const frontCourse = new THREE.Mesh(
          new THREE.BoxGeometry(8.95, 0.22, 0.42),
          new THREE.MeshStandardMaterial({ color: 0x715a45, roughness: 0.92 })
        );
        frontCourse.position.set(bastionX, 1.08, -12.18);
        frontCourse.castShadow = true;
        frontCourse.receiveShadow = true;
        this.world.add(frontCourse);
        // A paved top and inner parapet make the projection read as a usable
        // wall terrace instead of a featureless brown cuboid.
        const deck = new THREE.Mesh(
          new THREE.BoxGeometry(8.2, 0.12, 5.82),
          new THREE.MeshStandardMaterial({ color: region.floor, map: this.library.worldTexture("pbr-stone-color") ?? null, roughness: 0.94 })
        );
        deck.name = "bastion-paved-deck";
        deck.position.set(bastionX, 1.09, -9.18);
        deck.receiveShadow = true;
        this.world.add(deck);
        const innerParapet = new THREE.Mesh(
          new THREE.BoxGeometry(8.7, 0.62, 0.42),
          new THREE.MeshStandardMaterial({ color: wallColor, map: this.library.worldTexture("pbr-stone-color") ?? null, roughness: 0.96 })
        );
        innerParapet.name = "bastion-inner-parapet";
        innerParapet.position.set(bastionX, 1.37, -6.2);
        innerParapet.castShadow = true;
        innerParapet.receiveShadow = true;
        this.world.add(innerParapet);
      }
    }
    const gate = makeGatehouse(this.library, region.accent, wallColor);
    gate.position.set(0, 0, -12);
    this.world.add(gate);
    this.gateObject = gate;
    this.gateCloseTarget = this.state?.phase === "night" ? 1 : 0;
    this.gateClosed = this.gateCloseTarget;
    this.updateGateDoors();

    const bannerLeft = add("flag-banner-long", -3.8, -11.5, 0, 1.7);
    bannerLeft.position.y = 4.7;
    const bannerRight = add("flag-banner-long", 3.8, -11.5, 0, 1.7);
    bannerRight.position.y = 4.7;

    // 驿站夜间照明使用真实空间中的壁挂火盆，而不是把整张地图统一提亮。
    // 门楼两盏形成敌人进入防线时的第一段识别区，侧墙两盏照亮院内维修路线。
    const addWallTorch = (x: number, z: number, rotation: number): void => {
      const torch = new THREE.Group();
      const metal = new THREE.MeshStandardMaterial({ color: 0x40352e, metalness: 0.42, roughness: 0.55 });
      const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.82, 7), metal);
      bracket.rotation.x = Math.PI * 0.5;
      bracket.position.set(0, 0, 0.35);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.23, 0.22, 10), metal);
      bowl.position.set(0, 0.04, 0.72);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.62, 9),
        new THREE.MeshStandardMaterial({ color: 0xffb04c, emissive: 0xf26d2f, emissiveIntensity: 2.4, roughness: 0.62 })
      );
      flame.position.set(0, 0.48, 0.72);
      flame.name = "flame";
      const light = new THREE.PointLight(0xff9a45, this.state?.phase === "night" ? 2.65 * this.nightBrightness : 0.28, 18, 1.75);
      light.position.set(0, 0.58, 0.72);
      light.name = "fort-torch-light";
      light.userData.baseIntensity = 2.65;
      torch.add(bracket, bowl, flame, light);
      torch.position.set(x, this.terrainHeightAt(x, z, region) + 3.15, z);
      torch.rotation.y = rotation;
      this.world.add(torch);
    };
    addWallTorch(-5.15, -11.62, 0);
    addWallTorch(5.15, -11.62, 0);
    addWallTorch(-halfWidth + 0.35, -2.2, Math.PI * 0.5);
    addWallTorch(halfWidth - 0.35, -2.2, -Math.PI * 0.5);
  }

  private buildFortifications(region: RegionDefinition): void {
    if (!this.state) return;
    for (const fortification of this.state.fortifications) {
      const root = new THREE.Group();
      const active = fortification.built && fortification.hp > 0;
      const foundationMaterial = new THREE.MeshStandardMaterial({ color: active ? 0x6d6253 : 0x81745f, roughness: 0.96 });
      const foundation = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.2, 2.45), foundationMaterial);
      foundation.position.y = 0.09;
      foundation.receiveShadow = true;
      foundation.castShadow = true;
      root.add(foundation);
      const cornerMaterial = new THREE.MeshStandardMaterial({ color: active ? 0x815436 : region.accent, roughness: 0.7, metalness: active ? 0.06 : 0.2 });
      for (const [x, z] of [[-2.15, -0.86], [2.15, -0.86], [-2.15, 0.86], [2.15, 0.86]] as const) {
        const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.17, 8), cornerMaterial);
        anchor.position.set(x, 0.25, z);
        anchor.castShadow = true;
        root.add(anchor);
      }
      if (active) {
        const healthRatio = fortification.hp / Math.max(1, fortification.maxHp);
        const branchColor = fortification.branch === "sand" ? 0xb38a55 : fortification.branch === "oil" ? 0x3f4544 : 0x6f4930;
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(branchColor).multiplyScalar(healthRatio < 0.45 ? 0.63 : 1), roughness: 0.9, metalness: fortification.branch === "oil" ? 0.18 : 0.03 });
        const spikeOffsets = healthRatio < 0.3 ? [-1.7, 0.55] : healthRatio < 0.62 ? [-1.7, -0.55, 1.7] : [-1.8, -0.6, 0.6, 1.8];
        for (const offset of spikeOffsets) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.15, 7), material);
          spike.rotation.x = Math.PI / 2;
          spike.position.set(offset, 0.88, 0);
          spike.castShadow = true;
          root.add(spike);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.31, 0.4), material);
        beam.position.y = 0.62;
        beam.rotation.z = healthRatio < 0.45 ? 0.12 : 0;
        beam.castShadow = true;
        root.add(beam);
        if (fortification.level >= 3) {
          if (fortification.branch === "sand") {
            const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.84, 0.18, 18), new THREE.MeshStandardMaterial({ color: 0xb99a62, roughness: 1 }));
            sand.position.y = 0.19;
            sand.scale.z = 0.52;
            root.add(sand);
          } else if (fortification.branch === "oil") {
            for (const x of [-1.15, 0, 1.15]) {
              const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0x3f4544, metalness: 0.18, roughness: 0.56 }));
              jar.position.set(x, 0.56, 0.42);
              jar.castShadow = true;
              root.add(jar);
            }
          } else {
            for (const x of [-1.45, -0.72, 0, 0.72, 1.45]) {
              const groundSpike = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.86, 6), new THREE.MeshStandardMaterial({ color: 0x5e6260, metalness: 0.42, roughness: 0.48 }));
              groundSpike.position.set(x, 0.48, 0.62);
              root.add(groundSpike);
            }
          }
        }
      } else {
        // 未建造时留下真实施工桩、系绳和醒目的预装骨架，明确告诉玩家“此处可安装拒马”。
        // 这不是城内功能区：三处位置严格位于城门外商道，直接点击任意一处即可施工。
        const stakeMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3b28, roughness: 0.95 });
        for (const x of [-2.05, 2.05]) {
          const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.55, 7), stakeMaterial);
          stake.position.set(x, 0.78, 0);
          stake.castShadow = true;
          root.add(stake);
        }
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 4.12, 6), new THREE.MeshStandardMaterial({ color: 0xb99a63, roughness: 0.94 }));
        rope.rotation.z = Math.PI * 0.5;
        rope.position.y = 1.22;
        root.add(rope);
        // 两根斜置的预装木料让施工位从高处看也像“尚未完成的拒马”，而不是普通装饰旗。
        const previewBeamMaterial = new THREE.MeshStandardMaterial({ color: 0x96613d, roughness: 0.92 });
        for (const rotation of [-0.58, 0.58]) {
          const previewBeam = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 3.8), previewBeamMaterial);
          previewBeam.rotation.x = Math.PI * 0.5;
          previewBeam.rotation.z = rotation;
          previewBeam.position.set(0, 0.73, 0.08);
          previewBeam.castShadow = true;
          root.add(previewBeam);
        }
        // 施工旗高过门楼与前排城垛：默认守城镜头也能明确看见三个道路附件位。
        const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 5.35, 8), stakeMaterial);
        flagPole.position.set(0, 2.68, -0.38);
        flagPole.castShadow = true;
        const flag = this.library.model("flag-banner-long", 0xe5a840, 0.42);
        flag.position.set(0.08, 4.48, -0.4);
        flag.scale.setScalar(1.08);
        root.add(flagPole, flag);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xe5a840, transparent: true, opacity: 0.82, depthWrite: false });
        const marker = new THREE.Group();
        marker.name = "fortification-marker";
        for (const [x, z, rotation] of [[-2.15, -0.92, 0], [2.15, -0.92, Math.PI / 2], [2.15, 0.92, Math.PI], [-2.15, 0.92, -Math.PI / 2]] as const) {
          const angle = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.045, 0.12), markerMaterial);
          angle.position.set(x, 0.205, z);
          angle.rotation.y = rotation;
          angle.raycast = () => undefined;
          marker.add(angle);
        }
        root.add(marker);
        const signal = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), new THREE.MeshStandardMaterial({ color: 0xe5a840, emissive: 0xe5a840, emissiveIntensity: 0.72, roughness: 0.48 }));
        signal.position.set(0, 5.62, -0.4);
        signal.name = "fortification-signal";
        root.add(signal);
      }
      root.position.copy(fortificationPosition(fortification.lane));
      root.position.y = this.terrainHeightAt(root.position.x, root.position.z, region);
      root.userData.fortificationId = fortification.id;
      root.traverse((child) => { child.userData.fortificationId = fortification.id; });
      this.world.add(root);
      this.fortificationObjects.set(fortification.id, root);
    }
  }

  private buildCourtyardPaving(region: RegionDefinition): void {
    const geometry = new THREE.BoxGeometry(2.25, 0.08, 1.62);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(region.floor).lerp(new THREE.Color(0xc1aa7a), 0.18),
      roughness: 0.98
    });
    const halfWidth = this.fortHalfWidth();
    const firstX = -halfWidth + 1.25;
    const lastX = halfWidth - 1.25;
    const columns = Math.ceil((lastX - firstX) / 2.35) + 1;
    const backZ = this.fortBackZ();
    const rows = Math.ceil((backZ + 9) / 1.76);
    const paving = new THREE.InstancedMesh(geometry, material, columns * rows);
    const matrix = new THREE.Matrix4();
    let instance = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const offset = row % 2 === 0 ? 0 : 1.12;
        const x = firstX + column * 2.35 + offset;
        const z = -8.5 + row * 1.76;
        if (x > lastX || z > backZ - 1.4) {
          matrix.makeScale(0, 0, 0);
        } else {
          matrix.makeTranslation(x, 0.075, z);
        }
        paving.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }
    paving.receiveShadow = true;
    paving.userData.ground = true;
    this.world.add(paving);
  }

  private buildPadsAndCore(region: RegionDefinition): void {
    const layout = this.currentFortLayout();
    layout.zones.forEach((zone, index) => {
      const isFreshExpansion = this.isFreshExpansionPad(index);
      const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const size = (zone.type === "siege" ? 5.8 : 4.7) + (coarsePointer ? 1.25 : 0);
      // The transparent hit surface is always raycastable, while the visible foundation
      // only appears during build/relocation. The courtyard therefore reads as a real place,
      // not a board covered in permanent game tokens.
      const padHitMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        colorWrite: false,
        depthWrite: false,
        depthTest: false
      });
      padHitMaterial.visible = false;
      const pad = new THREE.Mesh(
        // A shallow hit box remains easier to select than a mathematical plane on
        // touch screens. Its material is never submitted to the colour/depth pass;
        // Mesh.raycast still uses the geometry even when Material.visible is false.
        new THREE.BoxGeometry(size, 0.035, zone.type === "siege" ? 5.2 : 4.2),
        padHitMaterial
      );
      pad.position.copy(this.zonePosition(index)).add(new THREE.Vector3(0, 0.08, 0));
      pad.rotation.y = zone.rotation;
      pad.userData.padIndex = index;
      pad.userData.zoneType = zone.type;
      // Invisible gameplay sockets must win the raycast over the courtyard and
      // character meshes. Building is a mode, so intercepting the click here is
      // intentional and prevents the player from walking away instead of building.
      pad.renderOrder = 40;
      if (zone.elevation > 0.35 && zone.type === "siege") {
        // Raised defence sockets are wall terraces, not isolated polygonal mounds.
        // A rectangular sandstone plinth aligns with the fort architecture and
        // leaves a clear mounting surface without looking like a board-game token.
        const supportMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(region.floor).lerp(new THREE.Color(0x75624e), 0.24),
          map: this.library.worldTexture("pbr-stone-color") ?? null,
          normalMap: this.library.worldTexture("pbr-stone-normal") ?? null,
          normalScale: new THREE.Vector2(0.44, 0.44),
          roughnessMap: this.library.worldTexture("pbr-stone-roughness") ?? null,
          roughness: 0.95
        });
        const supportDepth = 4.85;
        const support = new THREE.Mesh(
          new THREE.BoxGeometry(size * 1.06, zone.elevation + 0.22, supportDepth),
          supportMaterial
        );
        support.name = `integrated-zone-support:${zone.id}`;
        support.position.copy(this.zonePosition(index));
        support.position.y = (zone.elevation + 0.22) * 0.5 - 0.06;
        support.rotation.y = zone.rotation;
        support.receiveShadow = true;
        support.castShadow = true;
        support.userData.ground = true;
        this.world.add(support);
        const terraceTrim = new THREE.Mesh(
          new THREE.BoxGeometry(size * 1.12, 0.15, supportDepth + 0.13),
          new THREE.MeshStandardMaterial({ color: 0x7c654c, roughness: 0.9 })
        );
        terraceTrim.position.copy(this.zonePosition(index));
        terraceTrim.position.y = zone.elevation + 0.1;
        terraceTrim.rotation.y = zone.rotation;
        terraceTrim.receiveShadow = true;
        terraceTrim.userData.ground = true;
        this.world.add(terraceTrim);
        // Short masonry piers make the plinth read as a supported wall
        // emplacement instead of a floating game-board rectangle.
        const pierMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(region.floor).lerp(new THREE.Color(0x66513e), 0.34),
          map: this.library.worldTexture("pbr-stone-color") ?? null,
          roughness: 0.96
        });
        for (const side of [-1, 1]) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(0.58, zone.elevation + 0.54, 0.78), pierMaterial);
          pier.name = `zone-support-pier:${zone.id}`;
          pier.position.copy(support.position);
          pier.position.x += side * size * 0.45;
          pier.position.y = (zone.elevation + 0.54) * 0.5 - 0.08;
          pier.position.z += supportDepth * 0.38;
          pier.castShadow = true;
          pier.receiveShadow = true;
          this.world.add(pier);
        }
      }
      const isTutorialTarget = this.tutorialPadIndex() === index;
      const zoneMaterial = new THREE.MeshStandardMaterial({
        color: region.accent,
        emissive: region.accent,
        emissiveIntensity: isTutorialTarget ? 0.48 : 0.16,
        transparent: true,
        opacity: 0.34,
        roughness: 0.6,
        metalness: 0.16,
        depthWrite: false
      });
      const marker = new THREE.Group();
      marker.name = "build-zone-marker";
      // Build mode uses a hollow four-corner outline, never a filled slab. This keeps
      // legal placement obvious without leaving two brown rectangles in the fort.
      const outlineWidth = size - 0.34;
      const outlineDepth = zone.type === "siege" ? 4.78 : 3.82;
      const cornerLength = Math.min(0.92, outlineWidth * 0.24);
      const lineWidth = 0.09;
      for (const x of [-1, 1]) {
        for (const z of [-1, 1]) {
          const horizontal = new THREE.Mesh(new THREE.BoxGeometry(cornerLength, 0.045, lineWidth), zoneMaterial);
          horizontal.position.set(x * (outlineWidth * 0.5 - cornerLength * 0.5), 0.105, z * outlineDepth * 0.5);
          const vertical = new THREE.Mesh(new THREE.BoxGeometry(lineWidth, 0.045, cornerLength), zoneMaterial);
          vertical.position.set(x * outlineWidth * 0.5, 0.105, z * (outlineDepth * 0.5 - cornerLength * 0.5));
          marker.add(horizontal, vertical);
        }
      }
      marker.traverse((child) => {
        if (child instanceof THREE.Mesh) child.raycast = () => undefined;
      });
      marker.visible = isTutorialTarget || isFreshExpansion;
      pad.add(marker);
      pad.userData.zoneMarker = marker;
      pad.userData.zoneMaterial = zoneMaterial;
      // Newly unlocked sockets are explained by the reorganisation prompt and
      // appear as corner outlines only after the player picks a building. A
      // permanent scaffold here looked like a broken wall floating in the yard.
      this.world.add(pad);
      this.buildPads.push(pad);
    });
    const core = makeCore(region.accent, region.id, this.library);
    core.position.copy(CORE_POSITION);
    core.userData.core = true;
    this.world.add(core);
    this.coreObject = core;
    this.refreshBuildZoneVisibility();
  }

  private fortBackZ(state = this.state): number {
    if (!state) return 18;
    return fortLayout(state.mode, state.expansionLevel, state.regionModule).depth;
  }

  private currentFortLayout(state = this.state) {
    const active = state ?? createGame("expedition", "LAYOUT", this.meta);
    return fortLayout(active.mode, active.expansionLevel, active.regionModule);
  }

  private normalizeBuildingZones(state: GameState): void {
    if (state.mode === "training") return;
    const layout = fortLayout(state.mode, state.expansionLevel, state.regionModule);
    const occupied = new Set<number>();
    const pending: BuildingState[] = [];
    for (const building of state.buildings) {
      const zone = layout.zones[building.padIndex];
      if (zone && canBuildInZone(building.type, zone) && !occupied.has(building.padIndex)) occupied.add(building.padIndex);
      else pending.push(building);
    }
    for (const building of pending) {
      const fallback = layout.zones.findIndex((zone, index) => canBuildInZone(building.type, zone) && !occupied.has(index));
      if (fallback >= 0) {
        building.padIndex = fallback;
        occupied.add(fallback);
      }
    }
  }

  private zonePosition(index: number): THREE.Vector3 {
    const zone = this.currentFortLayout().zones[index];
    if (!zone) return new THREE.Vector3();
    return new THREE.Vector3(zone.position.x, zone.elevation, zone.position.z);
  }

  private fortHalfWidth(state = this.state): number {
    if (!state) return 18;
    return fortLayout(state.mode, state.expansionLevel, state.regionModule).width * 0.5;
  }

  private tutorialPadIndex(): number {
    if (!this.state || this.meta.seenTutorial) return -1;
    if (this.state.tutorialStep === 0) return 4;
    if (this.state.tutorialStep === 1) return 0;
    return -1;
  }

  /** 当前扩建刚解锁、且还没有被建筑占用的两处功能区。 */
  private isFreshExpansionPad(index: number): boolean {
    if (!this.state || this.state.mode !== "expedition" || this.state.expansionLevel <= 0) return false;
    const firstNewIndex = 6 + (this.state.expansionLevel - 1) * 2;
    return index >= firstNewIndex
      && index < firstNewIndex + 2
      && !this.state.buildings.some((building) => building.padIndex === index);
  }

  private refreshTutorialPads(): void {
    this.refreshBuildZoneVisibility();
  }

  private refreshBuildZoneVisibility(): void {
    if (!this.state) return;
    const target = this.tutorialPadIndex();
    const relocatingBuilding = this.relocation
      ? this.state.buildings.find((entry) => entry.id === this.relocation!.buildingId)
      : undefined;
    const activeType = relocatingBuilding?.type ?? this.selectedBuild;
    const layout = this.currentFortLayout();
    this.buildPads.forEach((pad, index) => {
      const marker = pad.userData.zoneMarker as THREE.Group | undefined;
      const material = pad.userData.zoneMaterial as THREE.MeshStandardMaterial | undefined;
      const zone = layout.zones[index];
      if (!material || !marker || !zone) return;
      const accent = regionById(this.state?.regionId ?? "oasis").accent;
      const expansionPad = this.isFreshExpansionPad(index);
      const occupied = this.state!.buildings.some((building) => building.padIndex === index && building.id !== relocatingBuilding?.id);
      const valid = Boolean(activeType && canBuildInZone(activeType, zone) && !occupied);
      // Idle build sockets are part of the layout logic, not permanent scenery.
      // Showing them as beige pads made the courtyard look unfinished and could be
      // mistaken for buildings. They only appear while the player is actually
      // building, relocating, or following the one active tutorial prompt.
      marker.visible = index === target || Boolean(activeType && valid);
      const color = activeType ? (valid ? 0x58b98c : 0xbd5a49) : accent;
      material.color.set(color);
      material.emissive.set(color);
      material.emissiveIntensity = index === target ? 0.5 : valid ? 0.3 : expansionPad ? 0.18 : 0.08;
      material.opacity = activeType ? (valid ? 0.46 : 0.26) : 0;
    });
  }

  /** 贴合高度场的曲线带状网格，用于商道、车辙、水渠和湿地边缘。 */
  private makeTerrainRibbon(
    region: RegionDefinition,
    points: Array<[number, number]>,
    width: number,
    material: THREE.Material,
    yOffset: number,
    seed = 0
  ): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal", 0.34);
    const samples = Math.max(18, (points.length - 1) * 14);
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples;
      const center = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).setY(0).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const erosion = 1 + Math.sin(t * 13.7 + seed) * 0.075 + Math.sin(t * 37.1 + seed * 0.7) * 0.035;
      for (const direction of [-1, 1]) {
        const edgeNoise = 1 + Math.sin(t * (direction < 0 ? 23.4 : 29.2) + seed * direction) * 0.035;
        const halfWidth = width * 0.5 * erosion * edgeNoise;
        const x = center.x + side.x * halfWidth * direction;
        const z = center.z + side.z * halfWidth * direction;
        const y = this.terrainHeightAt(x, z, region) + yOffset;
        positions.push(x, y, z);
        uvs.push(direction < 0 ? 0 : 1, t * Math.max(2, points.length * 2.4));
      }
      if (index < samples) {
        const base = index * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.receiveShadow = true;
    ribbon.userData.ground = true;
    return ribbon;
  }

  private spawnScenery(region: RegionDefinition): void {
    const terrainVariant = this.state?.terrainVariant ?? 0;
    const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
    // 底图有贴图时仍必须保留独立的主商道实体；只靠 ground 的颜色调整会被贴图覆盖，
    // 在俯视镜头里几乎看不出来。这条路从城门直达地图外缘，也是玩家离城后的第一条视觉引导。
    const roadProfiles: Record<string, Array<[number, number]>> = {
      oasis: [[0, -12.4], [0.5, -20], [-0.9, -29], [1.2, -39], [-0.9, -50], [0.7, -61], [0.2, -68]],
      canyon: [[0, -12.4], [-1.4, -20], [2.6, -28], [4.1, -37], [0.8, -47], [-3.4, -58], [-1.1, -69]],
      mist: [[0, -12.4], [1.6, -20], [2.8, -28], [-0.6, -36], [-2.7, -46], [0.2, -57], [2.1, -68]],
      stardust: [[0, -12.4], [-1.2, -21], [-3.1, -30], [0.4, -40], [3.7, -49], [2.2, -59], [-0.6, -69]]
    };
    const mainRoadPoints = roadProfiles[region.id] ?? roadProfiles.oasis!;
    const roadWidth = profile.roadStyle === "quarry-haul" ? 10.2 : profile.roadStyle === "raised-causeway" ? 8.4 : 9.25;
    const mainRoadBed = this.makeTerrainRibbon(region, mainRoadPoints, roadWidth,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(profile.pathColor).multiplyScalar(0.62),
        map: this.library.worldTexture(region.id === "oasis" ? "pbr-sand-color" : "pbr-stone-color") ?? null,
        normalMap: this.library.worldTexture(region.id === "oasis" ? "pbr-sand-normal" : "pbr-stone-normal") ?? null,
        normalScale: new THREE.Vector2(0.26, 0.26),
        roughnessMap: this.library.worldTexture(region.id === "oasis" ? "pbr-sand-roughness" : "pbr-stone-roughness") ?? null,
        roughness: 1
      }), 0.025, terrainVariant + 0.4);
    const mainRoad = this.makeTerrainRibbon(region, mainRoadPoints, roadWidth - 1.55,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(region.ground).lerp(
          new THREE.Color(region.id === "mist" ? 0x7c8b83 : region.id === "canyon" ? 0x98634a : region.id === "stardust" ? 0x756b82 : 0xa18358),
          0.34
        ),
        roughness: 1,
        emissive: new THREE.Color(region.ground).multiplyScalar(0.16),
        emissiveIntensity: 0.035
      }), 0.06, terrainVariant + 1.7);
    this.world.add(mainRoadBed, mainRoad);
    // 取消规则石板阵列与两条硬边线。它们在俯视视角下像梯子；商道现在依靠
    // 连续夯土材质、自然宽度变化和车辙来形成边界。
    const rutMaterial = new THREE.MeshStandardMaterial({ color: 0x51483d, roughness: 1 });
    for (const x of [-1.75, 1.75]) {
      const rutPoints = mainRoadPoints.map(([roadX, z]) => [roadX + x, z] as [number, number]);
      this.world.add(this.makeTerrainRibbon(region, rutPoints, 0.24, rutMaterial, 0.072, terrainVariant + x * 2));
    }
    // 侧路不再铺成数条彼此交叉的白色带。两条低对比度车辙从主道自然分开，
    // 既表达商队使用痕迹，又让地表材质保持连续；资源由自身标记承担最后的引导。
    const trailMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(region.ground).lerp(new THREE.Color(region.id === "mist" ? 0x40534f : 0x4e3d31), 0.44),
      roughness: 1,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
    const addTrail = (points: Array<[number, number]>): void => {
      const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal", 0.34);
      for (const lateral of [-0.62, 0.62]) {
        const samples: Array<[number, number]> = [];
        for (let index = 0; index <= 12; index += 1) {
          const t = index / 12;
          const center = curve.getPointAt(t);
          const tangent = curve.getTangentAt(t).setY(0).normalize();
          samples.push([center.x - tangent.z * lateral, center.z + tangent.x * lateral]);
        }
        this.world.add(this.makeTerrainRibbon(region, samples, 0.18, trailMaterial, 0.038, terrainVariant + lateral));
      }
    };
    const trailProfiles: Record<string, [Array<[number, number]>, Array<[number, number]>]> = {
      oasis: [[[0, -28], [-10, -31], [-20, -37], [-30, -45], [-42, -50]], [[0, -28], [10, -31], [20, -36], [30, -43], [42, -48]]],
      canyon: [[[2, -30], [-9, -35], [-18, -44], [-31, -52]], [[2, -29], [13, -33], [24, -39], [35, -47]]],
      mist: [[[1, -29], [-8, -34], [-19, -39], [-31, -44]], [[1, -30], [12, -33], [22, -39], [33, -47]]],
      stardust: [[[-2, -30], [-12, -34], [-21, -41], [-31, -50]], [[-1, -31], [10, -35], [22, -42], [34, -51]]]
    };
    const [leftTrail, rightTrail] = trailProfiles[region.id] ?? trailProfiles.oasis!;
    addTrail(leftTrail);
    addTrail(rightTrail);

    // 商道不再只是一条平面贴图：岔路处有明确的木制路标，路边有卸货的驼队补给点。
    // 它们放在道路边缘、不设置碰撞，不会把采集路线又变成绕障碍小游戏。
    const roadWood = new THREE.MeshStandardMaterial({ color: 0x4f3425, roughness: 0.91, metalness: 0.03 });
    const roadPaint = new THREE.MeshStandardMaterial({ color: 0xd3a154, emissive: 0x402610, emissiveIntensity: 0.18, roughness: 0.7 });
    const addWayMarker = (x: number, z: number, heading: number): void => {
      const marker = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 2.8, 10), roadWood);
      pole.position.y = 1.4;
      pole.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.34, 6), roadPaint);
      cap.position.y = 2.94;
      const arrow = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.33, 0.12), roadWood);
      arrow.position.set(0.56, 2.18, 0);
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 3), roadWood);
      point.position.set(1.46, 2.18, 0);
      point.rotation.z = -Math.PI / 2;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.132), roadPaint);
      stripe.position.set(0.52, 2.18, 0.07);
      marker.add(pole, cap, arrow, point, stripe);
      marker.position.set(x, this.terrainHeightAt(x, z, region), z);
      marker.rotation.y = heading;
      this.world.add(marker);
    };
    addWayMarker(-6.4, -28.8, -0.78);
    for (const [x, z] of [[4.8, -20], [-4.8, -34], [4.8, -48]] as const) {
      const post = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 3.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x4f3728, roughness: 0.94 })
      );
      pole.position.y = 1.6;
      pole.castShadow = true;
      post.add(pole);
      const lantern = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.56, 8),
        new THREE.MeshStandardMaterial({ color: 0xd69a45, emissive: 0xd69a45, emissiveIntensity: 0.48, roughness: 0.7 })
      );
      lantern.position.y = 3.1;
      post.add(lantern);
      post.position.set(x, this.terrainHeightAt(x, z, region), z);
      this.world.add(post);
    }
    const scrubGeometry = new THREE.ConeGeometry(0.34, 0.74, 7);
    const scrubMaterial = new THREE.MeshStandardMaterial({
      color: region.id === "mist" ? 0x536f66 : region.id === "canyon" ? 0x765d3f : 0x6d7446,
      roughness: 1
    });
    const scrubCount = Math.max(36, Math.round(88 * qualityPresets[this.effectiveQuality].sceneryDensity));
    const scrub = new THREE.InstancedMesh(scrubGeometry, scrubMaterial, scrubCount);
    const matrix = new THREE.Matrix4();
    const ecologicalCenters: Record<string, Array<[number, number, number]>> = {
      oasis: [[-28, -39, 13], [-43, -50, 10], [37, -30, 13]],
      canyon: [[-42, -47, 12], [38, -39, 14], [-49, 6, 11]],
      mist: [[21, -38, 15], [-31, -31, 11], [39, 3, 12]],
      stardust: [[-29, -34, 13], [30, -36, 13], [42, 8, 11]]
    };
    const centers = ecologicalCenters[region.id] ?? ecologicalCenters.oasis!;
    for (let index = 0; index < scrubCount; index += 1) {
      const [centerX, centerZ, spread] = centers[index % centers.length]!;
      const angle = index * 2.399 + terrainVariant * 0.7;
      const radius = spread * (0.18 + ((index * 37) % 83) / 100);
      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius * 0.72;
      const scale = 0.55 + (index % 5) * 0.12;
      matrix.compose(
        new THREE.Vector3(x, this.terrainHeightAt(x, z, region) + 0.35 * scale, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.73, 0)),
        new THREE.Vector3(scale, scale, scale)
      );
      scrub.setMatrixAt(index, matrix);
    }
    scrub.castShadow = true;
    scrub.receiveShadow = true;
    this.world.add(scrub);

/**
 * 轻量的风蚀地貌。由两层不规则环和一个起伏顶点组成，远看有自然沙脊/岩坡轮廓，
 * 又比逐个加载高面数山体更适合手机。种子只来自坐标，故同一世界布局稳定可复现。
 */
function makeWindWornMound(
  material: THREE.MeshStandardMaterial,
  radiusX: number,
  radiusZ: number,
  height: number,
  seed: number,
  segments = 16
): THREE.Mesh {
  const vertices: number[] = [Math.sin(seed) * radiusX * 0.08, height * 0.94, Math.cos(seed * 0.8) * radiusZ * 0.07];
  const indices: number[] = [];
  const wobble = (index: number, factor: number): number => 1 + Math.sin(seed * 1.73 + index * 2.41) * factor + Math.cos(seed * 0.67 + index * 1.19) * factor * 0.58;
  for (const [radius, y, factor] of [[0.58, height * 0.76, 0.08], [1, 0, 0.16]] as const) {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const scale = wobble(index, factor);
      vertices.push(Math.cos(angle) * radiusX * radius * scale, y + Math.sin(seed + index * 0.81) * height * 0.035, Math.sin(angle) * radiusZ * radius * scale);
    }
  }
  const innerStart = 1;
  const outerStart = 1 + segments;
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(0, innerStart + next, innerStart + index);
    indices.push(innerStart + index, innerStart + next, outerStart + index);
    indices.push(innerStart + next, outerStart + next, outerStart + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mound = new THREE.Mesh(geometry, material);
  mound.castShadow = true;
  mound.receiveShadow = true;
  return mound;
}
    // 近郊不再额外压四块独立沙丘网格。起伏已经写入连续高度场，重复叠加只会
    // 形成与地面颜色不一致的多边形“贴片”，并挤占资源的自然接近空间。

    // 地图边缘用真实体积的山脊收口：它只承担远景，不抢占驿站与城外采集区的活动空间。
    const ridgeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(region.ground).lerp(new THREE.Color(region.id === "canyon" ? 0x55332f : 0x66574d), 0.55),
      roughness: 1
    });
    // 远山用多层风蚀岩脊而不是几个巨大的半球。轮廓更接近峡谷/荒漠的层理，
    // 也不会在标题镜头里像一排玩具圆丘压住驿站。
    const ridgeShapes: Array<[number, number, number, number, number]> = [
      [-43, -76, 3.4, 7.5, -0.28], [-27, -80, 4.6, 10, 0.22], [-8, -78, 3.2, 7, -0.14],
      [13, -81, 4.4, 10, 0.18], [34, -78, 3.7, 8.5, -0.2], [47, -69, 3.2, 7, 0.32], [-49, -68, 3, 7, -0.36]
    ];
    for (const [x, z, height, width, rotation] of ridgeShapes) {
      const base = makeWindWornMound(ridgeMaterial, width, width * 0.64, height, x * 0.09 + z * 0.07, 18);
      base.position.set(x, this.terrainHeightAt(x, z, region) + 0.02, z);
      base.rotation.y = rotation;
      this.world.add(base);
      const cap = makeWindWornMound(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(ridgeMaterial.color).lerp(new THREE.Color(0x9b8061), 0.16), roughness: 1 }),
        width * 0.68,
        width * 0.42,
        height * 0.56,
        x * 0.14 - z * 0.05,
        12
      );
      cap.position.set(x + Math.sin(rotation) * 1.15, height * 0.16, z + Math.cos(rotation) * 0.78);
      cap.rotation.y = rotation + 0.42;
      this.world.add(cap);
    }

    // 可行走区域的边界由风蚀山脊自然收口，不再让角色在空地上无声撞 invisible wall。
    const boundaryMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(region.ground).lerp(new THREE.Color(0x4b4940), 0.46),
      roughness: 1
    });
    const boundaryRidges: Array<[number, number, number, number]> = [
      [-63, -62, 6, 5], [-63, -36, 7, 5], [-63, -8, 5, 4.5], [-63, 20, 6, 5],
      [63, -61, 7, 5], [63, -34, 5, 4.5], [63, -6, 6, 5], [63, 22, 5, 4.5],
      [-43, 43, 5, 7], [-15, 43, 6, 6], [16, 43, 5, 7], [46, 42, 5, 6]
    ];
    for (const [x, z, height, width] of boundaryRidges) {
      const ridge = makeWindWornMound(boundaryMaterial, width, width * 0.82, height, x * 0.13 + z * 0.1, 12);
      ridge.position.set(x, this.terrainHeightAt(x, z, region) + 0.01, z);
      this.world.add(ridge);
    }

    // 两个商队停靠点把“城门外道路”变成可被相信的商路：货车、货箱、地毯与油灯
    // 都避开可走路径，仅承担生活痕迹、比例尺和故事氛围。
    const addCaravanStop = (x: number, z: number, rotation: number, clothColor: number): void => {
      const stop = new THREE.Group();
      const darkWood = new THREE.MeshStandardMaterial({ color: 0x3d2a20, roughness: 0.96 });
      const fabric = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.94, side: THREE.DoubleSide });
      const brass = new THREE.MeshStandardMaterial({ color: 0xb98b48, metalness: 0.48, roughness: 0.48, emissive: 0x4f3215, emissiveIntensity: 0.22 });
      if (this.library.hasModel("village-wagon")) {
        const wagon = this.library.fittedModel("village-wagon", [3.8, 2.25, 2.35], 0x6e4931, 0.08);
        wagon.rotation.y = Math.PI * 0.5;
        stop.add(wagon);
      }
      if (this.library.hasModel("village-crate")) {
        for (const [boxX, boxZ, scale] of [[-2.05, 1.3, 0.76], [-1.4, 1.48, 0.58], [1.68, 1.16, 0.52]] as const) {
          const crate = this.library.fittedModel("village-crate", [scale, scale, scale], 0x76513a, 0.07);
          crate.position.set(boxX, 0.02, boxZ);
          crate.rotation.y = boxX * 0.4;
          stop.add(crate);
        }
      }
      if (this.library.hasModel("village-fence")) {
        const hitchingRail = this.library.fittedModel("village-fence", [3.1, 1.22, 0.38], 0x5b3d29, 0.06);
        hitchingRail.position.set(-2.15, 0.02, -1.28);
        hitchingRail.rotation.y = 0.14;
        stop.add(hitchingRail);
      }
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.45), fabric);
      rug.rotation.x = -Math.PI * 0.5;
      rug.position.set(-0.75, 0.035, 2.0);
      rug.receiveShadow = true;
      stop.add(rug);
      const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 2.35, 8), darkWood);
      lampPole.position.set(1.82, 1.18, -1.18);
      lampPole.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.48, 8), brass);
      lamp.position.set(1.82, 2.28, -1.18);
      lamp.castShadow = true;
      stop.add(lampPole, lamp);
      const glow = new THREE.PointLight(0xe1a955, 0.7, 5.5, 2);
      glow.position.copy(lamp.position);
      stop.add(glow);
      stop.position.set(x, this.terrainHeightAt(x, z, region), z);
      stop.rotation.y = rotation;
      this.world.add(stop);
    };
    if (region.id === "oasis") {
      // 一个有明确停靠朝向的补给点即可建立商路生活感；多个货车散在交叉口会像随机关卡道具。
      addCaravanStop(15.8, -43.5, -0.22, region.accent);
      for (const [x, z, scale] of [[-18, -34, 1.35], [-27, -31, 1.55], [-34, -42, 1.65], [-42, -47, 1.35]] as const) {
        const tree = this.library.model("tree-large", 0x3e8b63, 0.18);
        tree.position.set(x, this.terrainHeightAt(x, z, region), z);
        tree.scale.setScalar(scale);
        this.world.add(tree);
      }
      const bankMaterial = new THREE.MeshStandardMaterial({ color: 0x506f55, roughness: 0.96, transparent: true, opacity: 0.92 });
      const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x397f7c, roughness: 0.2, metalness: 0.08, transparent: true, opacity: 0.9 });
      this.world.add(this.makeTerrainRibbon(region, [[-51, -53], [-42, -48], [-34, -43], [-27, -38], [-23, -36]], 6.1, bankMaterial, 0.018, terrainVariant + 11));
      this.world.add(this.makeTerrainRibbon(region, [[-51, -53], [-42, -48], [-34, -43], [-27, -38], [-23, -36]], 3.7, waterMaterial, 0.045, terrainVariant + 13));
      // 水渠在地势最低处逐渐收窄渗入沙地；不叠加任何圆池或加宽色块，避免硬边水面。
    } else if (region.id === "mist") {
      for (const [x, z, rotation] of [[-23, -24, 0.2], [20, -26, 1.1], [-27, -36, 0.6]] as const) {
        const ruin = this.library.model("wall-doorway", 0x687b75, 0.45);
        ruin.position.set(x, this.terrainHeightAt(x, z, region), z);
        ruin.rotation.y = rotation;
        ruin.scale.setScalar(1.45);
        this.world.add(ruin);
      }
      const marshBank = new THREE.MeshStandardMaterial({ color: 0x45615d, roughness: 0.88, transparent: true, opacity: 0.78 });
      this.world.add(this.makeTerrainRibbon(region, [[44, -54], [36, -49], [30, -43], [22, -37], [18, -30]], 10.5, marshBank, 0.018, terrainVariant + 17));
      const marshWater = new THREE.MeshStandardMaterial({ color: 0x416d70, roughness: 0.3, transparent: true, opacity: 0.72 });
      this.world.add(this.makeTerrainRibbon(region, [[44, -54], [36, -49], [30, -43], [22, -37], [18, -30]], 4.4, marshWater, 0.04, terrainVariant + 19));
      // 旧港设施沿水缘成组出现，抬高石堤与系船桩共同说明这里曾是装卸区。
      for (const [x, z, rotation] of [[29, -42, 0.55], [34, -48, 0.7]] as const) {
        const dock = new THREE.Group();
        const wall = this.library.fittedModel("village-wall", [5.4, 0.82, 1.15], 0x52645f, 0.22);
        wall.rotation.y = rotation;
        dock.add(wall);
        for (const offset of [-1.8, 1.8]) {
          const bollard = this.library.fittedModel("village-chimney", [0.48, 0.9, 0.48], 0x42514d, 0.2);
          bollard.position.set(Math.cos(rotation) * offset, 0.1, -Math.sin(rotation) * offset);
          dock.add(bollard);
        }
        dock.position.set(x, this.terrainHeightAt(x, z, region) + 0.02, z);
        this.world.add(dock);
      }
    } else if (region.id === "canyon") {
      for (const [x, z, scale] of [[-49, -57, 2.7], [-36, -61, 3.1], [36, -58, 2.4], [49, -53, 2.2]] as const) {
        const rock = this.library.model("rocks-large", 0x8d4c3d, 0.48);
        rock.position.set(x, this.terrainHeightAt(x, z, region), z);
        rock.scale.setScalar(scale);
        this.world.add(rock);
      }
      // 运输架、绞盘和整备石堆集中在采石支路末端，避免矿场道具散落到主商道。
      const quarryYard = new THREE.Group();
      const wagon = this.library.fittedModel("village-wagon", [3.6, 2.1, 2.3], 0x5c3828, 0.18);
      wagon.rotation.y = Math.PI * 0.5;
      quarryYard.add(wagon);
      for (const x of [-2.5, 2.5]) {
        const brace = this.library.fittedModel("village-fence", [3.5, 1.7, 0.52], 0x4b2e23, 0.2);
        brace.position.set(x, 0, 2.2);
        brace.rotation.y = x < 0 ? 0.2 : -0.2;
        quarryYard.add(brace);
      }
      const cutStone = this.library.fittedModel("village-wall", [4.2, 1.25, 1.4], 0x8b4d3b, 0.25);
      cutStone.position.set(0, 0, 4.15);
      quarryYard.add(cutStone);
      quarryYard.position.set(27, this.terrainHeightAt(27, -42, region), -42);
      quarryYard.rotation.y = -0.42;
      this.world.add(quarryYard);
    } else {
      for (const [x, z] of [[-21, -25], [22, -27], [-17, -38], [18, -40]] as const) {
        const cluster = new THREE.Group();
        const rock = this.library.model("rocks-large", 0x4f4b55, 0.28);
        rock.scale.setScalar(0.62);
        cluster.add(rock);
        const crystalMaterial = new THREE.MeshStandardMaterial({ color: region.accent, emissive: region.accent, emissiveIntensity: 0.25, roughness: 0.42 });
        for (const [offsetX, offsetZ, height, tilt] of [[-0.38, 0.12, 1.45, -0.2], [0.12, -0.18, 2.05, 0.08], [0.48, 0.22, 1.15, 0.22]] as const) {
          const shard = new THREE.Mesh(new THREE.ConeGeometry(0.24, height, 6), crystalMaterial);
          shard.position.set(offsetX, height * 0.5 + 0.22, offsetZ);
          shard.rotation.z = tilt;
          shard.castShadow = true;
          cluster.add(shard);
        }
        cluster.position.set(x, this.terrainHeightAt(x, z, region), z);
        cluster.rotation.y = (x + z) * 0.11;
        this.world.add(cluster);
      }
      // 天文维护站沿古观测轴布置，仪器、货箱与晶脉各有用途，不作为随机发光装饰。
      const service = new THREE.Group();
      const balcony = this.library.fittedModel("village-balcony", [5.2, 1.6, 2.6], 0x505965, 0.22);
      balcony.rotation.y = -0.18;
      service.add(balcony);
      const crate = this.library.fittedModel("village-crate", [1.2, 1.05, 1.2], 0x5c4c3d, 0.14);
      crate.position.set(-2.1, 0.06, 1.2);
      service.add(crate);
      const sight = this.library.fittedModel("village-chimney", [0.9, 2.7, 0.9], 0x566f72, 0.25);
      sight.position.set(1.4, 0, 0.2);
      sight.rotation.z = -0.22;
      service.add(sight);
      service.position.set(25, this.terrainHeightAt(25, -43, region), -43);
      service.rotation.y = 0.32;
      this.world.add(service);
    }
  }

  private spawnPlayer(region: RegionDefinition): void {
    if (!this.state) return;
    const rig = this.library.unit("player");
    const startY = this.isInsideFort(new THREE.Vector3(this.state.player.position.x, 0, this.state.player.position.z))
      ? 0
      : this.terrainHeightAt(this.state.player.position.x, this.state.player.position.z, region);
    rig.root.position.set(this.state.player.position.x, startY, this.state.player.position.z);
    rig.root.rotation.y = Math.PI;
    rig.root.userData.player = true;
    this.playerRig = rig;
    this.world.add(rig.root);
  }

  private spawnResources(region: RegionDefinition): void {
    if (!this.state || !this.streams) return;
    const regionalTypes: Record<string, Array<"wood" | "stone" | "gear">> = {
      oasis: ["wood", "stone", "wood", "gear", "wood", "stone", "wood", "gear", "stone", "wood"],
      canyon: ["stone", "stone", "wood", "gear", "stone", "stone", "wood", "gear", "stone", "wood"],
      mist: ["wood", "stone", "gear", "wood", "gear", "stone", "wood", "gear", "stone", "wood"],
      stardust: ["gear", "stone", "gear", "wood", "gear", "stone", "gear", "wood", "stone", "gear"]
    };
    const baseTypes = regionalTypes[region.id] ?? regionalTypes.oasis!;
    const shift = this.state.terrainVariant % baseTypes.length;
    const types = baseTypes.map((_, index) => baseTypes[(index + shift) % baseTypes.length]!);
    const survivalYield = this.state.mode === "survival" ? Math.max(0.42, 1 - (this.state.epoch - 1) * 0.1) : 1;
    const layout = RESOURCE_LAYOUTS[this.state.terrainVariant % RESOURCE_LAYOUTS.length]!;
    const cacheStacks = this.state.relics.filter((entry) => entry === "field-cache").length;
    const interactionAnchor = oasisInteractionAnchors["resource-wide"]!;
    const safePocket = regionEnvironmentClusters.find((cluster) => cluster.regionId === region.id && cluster.placement === "resource-pocket");
    const approachCount = (center: THREE.Vector3): number => {
      return interactionAnchor.approachOffsets.reduce((valid, offset) => {
        const approach = center.clone().add(new THREE.Vector3(offset.x, 0, offset.z));
        return valid + (this.isNavigablePoint(approach) && !this.sceneryBlockers().some(([x, z, radius]) => approach.distanceTo(new THREE.Vector3(x, 0, z)) < radius) ? 1 : 0);
      }, 0);
    };
    layout.slice(0, Math.min(layout.length, 8 + cacheStacks)).forEach((position, index) => {
      const id = `${this.state!.epoch}:${index}`;
      if (this.state!.gathered.includes(id)) return;
      const type = types[index]!;
      let spawnPosition = position.clone();
      if (!this.isNavigablePoint(spawnPosition) || approachCount(spawnPosition) < 8 || this.resources.some((entry) => entry.position.distanceTo(spawnPosition) < (safePocket?.minSpacing ?? 4.6))) {
        const candidates: THREE.Vector3[] = [];
        for (const radius of [3.5, 5.5, 7.5, 10]) {
          for (let direction = 0; direction < 16; direction += 1) {
            const angle = direction / 16 * Math.PI * 2 + this.state!.terrainVariant * 0.31;
            candidates.push(position.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)));
          }
        }
        // 最后追加主商道两侧的确定安全口袋，保证任何随机生态都不会把材料夹死在角落。
        candidates.push(
          new THREE.Vector3(-12, 0, -30 - index * 2.8),
          new THREE.Vector3(12, 0, -30 - index * 2.8)
        );
        spawnPosition = candidates.find((candidate) =>
          this.isNavigablePoint(candidate)
          && approachCount(candidate) >= 8
          && this.resources.every((entry) => entry.position.distanceTo(candidate) > (safePocket?.minSpacing ?? 4.6))
        ) ?? new THREE.Vector3(index % 2 ? 12 : -12, 0, -30 - index * 3.1);
      }
      const object = makeResource(type, this.library, region.accent, region.id);
      object.position.copy(spawnPosition);
      object.position.y = this.terrainHeightAt(spawnPosition.x, spawnPosition.z, region);
      object.rotation.y = this.streams!.next("world") * Math.PI * 2;
      object.userData.resourceId = id;
      object.traverse((child) => { child.userData.resourceId = id; });
      const interaction = new THREE.Mesh(
        new THREE.CylinderGeometry(interactionAnchor.radius, interactionAnchor.radius, 3.2, 12),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      interaction.position.y = 1.6;
      interaction.userData.resourceId = id;
      object.add(interaction);
      this.addCollectibleMarker(object, type, id);
      this.world.add(object);
      const amount = Math.max(1, Math.round((type === "gear" ? 3 : 5 + Math.floor(this.streams!.next("loot") * 4)) * survivalYield));
      const resource = {
        id,
        type,
        amount,
        object,
        position: object.position.clone()
      } satisfies ResourceNode;
      this.resources.push(resource);
      this.createResourceLabel(resource);
    });
  }

  /** 资源牌只在接近城外或已选路线时出现：用实物图标和收益消除“哪些树/石头能捡”的猜测。 */
  private createResourceLabel(resource: ResourceNode): void {
    const label = document.createElement("button");
    const icon = resource.type === "wood" ? "ph-tree" : resource.type === "stone" ? "ph-stack" : "ph-gear-six";
    const name = resource.type === "wood" ? "木材" : resource.type === "stone" ? "石料" : "机巧";
    label.type = "button";
    label.className = "resource-world-label is-idle-status";
    label.innerHTML = `<i class="ph ${icon}"></i><span><strong>${name}</strong><small>+${resource.amount}</small></span>`;
    label.title = `${name} · 可收集 +${resource.amount}`;
    label.addEventListener("click", () => {
      this.setResourceTarget(resource);
      this.setPrompt("ph-hand-tap", `已标记${name}。沿地面箭头靠近发光环即可自动收集`);
    });
    this.hud.buildingLabels.appendChild(label);
    this.resourceLabels.set(resource.id, label);
  }

  /** 四个低亮度地钉与悬浮菱标表示可采集；避免把真实资源包在游戏化的完美圆环里。 */
  private addCollectibleMarker(object: THREE.Group, type: ResourceNode["type"], resourceId: string): void {
    const color = type === "wood" ? 0x77ae70 : type === "stone" ? 0xaeb4aa : 0xd3a255;
    const marker = new THREE.Group();
    marker.name = "collectible-marker";
    marker.userData.resourceId = resourceId;
    const markerMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI * 0.5 + Math.PI * 0.25;
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.09), markerMaterial);
      stake.position.set(Math.cos(angle) * 1.38, 0.07, Math.sin(angle) * 1.38);
      stake.rotation.y = -angle;
      stake.raycast = () => undefined;
      marker.add(stake);
    }
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.82, roughness: 0.4 })
    );
    beacon.position.y = 3.06;
    beacon.name = "collectible-beacon";
    beacon.raycast = () => undefined;
    marker.add(beacon);
    object.add(marker);
  }

  private spawnFieldObjective(region: RegionDefinition): void {
    if (!this.state || !this.streams) return;
    if (!this.state.fieldObjective || this.state.fieldObjective.completed || !this.state.fieldObjective.id.startsWith(`${this.state.epoch}:`)) {
      const regionalEventPools = {
        oasis: ["caravan", "aid", "artisan", "elite"],
        canyon: ["mine", "repair", "scout", "elite"],
        mist: ["ruin", "artisan", "cache", "elite"],
        stardust: ["scout", "cache", "repair", "elite"]
      } as const;
      const types = regionalEventPools[region.id as keyof typeof regionalEventPools] ?? regionalEventPools.oasis;
    const type = this.streams.pick("event", [...types]);
      const node = this.streams.pick("event", FIELD_OBJECTIVE_POSITIONS);
      const position = { x: node.x, z: node.z };
      const reward: Partial<Record<ResourceKey, number>> = type === "caravan"
        ? { coin: 10, wood: 3 }
        : type === "ruin"
          ? { stone: 7, gear: 2 }
          : type === "mine"
            ? { stone: 9, gear: 2 }
            : type === "repair"
              ? { stone: 6, gear: 5 }
              : type === "scout"
                ? { coin: 7, wood: 3, gear: 3 }
                : type === "cache"
                  ? { coin: 8, stone: 4, gear: 4 }
            : type === "elite"
              ? { coin: 12, gear: 4 }
              : type === "artisan"
                ? { wood: 6, stone: 5 }
                : { coin: 4, wood: 4, gear: 2 };
      this.state.fieldObjective = { id: `${this.state.epoch}:${type}`, type, position, completed: false, reward };
    }
    const objective = this.state.fieldObjective;
    if (objective.completed) return;
    const object = new THREE.Group();
    object.position.set(objective.position.x, this.terrainHeightAt(objective.position.x, objective.position.z, region), objective.position.z);
    const typeColor = objective.type === "aid" ? 0x6aa9a0 : objective.type === "mine" ? 0x9d8568 : objective.type === "elite" ? 0xa55345 : region.accent;
    if (objective.type === "mine") {
      object.add(makeResource("stone", this.library, region.accent, region.id));
    } else if (objective.type === "repair") {
      object.add(makeResource("gear", this.library, region.accent, region.id));
    } else if (objective.type === "cache") {
      object.add(this.library.fittedModel("village-crate", [2.1, 1.7, 1.8], typeColor, 0.16));
    } else if (objective.type === "caravan" || objective.type === "artisan") {
      const wagon = this.library.fittedModel("village-wagon", [3.8, 2.3, 2.5], typeColor, 0.12);
      wagon.rotation.y = 0.45;
      object.add(wagon);
    } else if (objective.type === "ruin") {
      const ruin = this.library.fittedModel("village-arch", [4.2, 3.8, 1.3], typeColor, 0.22);
      ruin.rotation.y = -0.36;
      object.add(ruin);
    } else if (objective.type === "scout") {
      const lookout = this.library.fittedModel("village-balcony", [4.2, 2.4, 2.2], typeColor, 0.18);
      lookout.rotation.y = 0.28;
      object.add(lookout);
    } else {
      const banner = this.library.model("flag-banner-long", typeColor, 0.3);
      banner.position.set(0, 1.1, 0);
      banner.scale.setScalar(objective.type === "elite" ? 1.35 : 0.9);
      object.add(banner);
    }
    const signal = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshStandardMaterial({ color: typeColor, emissive: typeColor, emissiveIntensity: 0.72, roughness: 0.52 }));
    signal.position.y = 3.5;
    signal.name = "artifact";
    signal.raycast = () => undefined;
    object.add(signal);
    object.userData.fieldObjective = objective.id;
    object.traverse((child) => { child.userData.fieldObjective = objective.id; });
    this.world.add(object);
    this.fieldObject = object;
  }

  private renderHotbar(): void {
    this.hud.hotbar.innerHTML = "";
    // 快捷栏用短名称，完整用途只留给悬停/长按和场景建造预览；
    // 在窄屏上让模型和材料始终优先于一长串说明文字。
    const shortNames: Record<BuildingType, string> = {
      market: "商栈",
      workshop: "工坊",
      ballista: "床弩",
      fire: "火油",
      antiair: "防空弩",
      trebuchet: "投石车"
    };
    const availableOrder = BUILD_ORDER.filter((type) => this.isBuildingUnlocked(type));
    availableOrder.forEach((type) => {
      const definition = buildings[type];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "build-slot";
      button.dataset.build = type;
      button.classList.toggle("is-tutorial-locked", !this.isTutorialBuildAllowed(type));
      // 热键栏也必须显示完整成本。此前只截取前两种材料，会让含机巧的武器看起来“钱够了却不能造”。
      const cost = this.formatCostMarkup(definition.cost, true);
      button.title = `${definition.name}：${definition.purpose}\n建造成本：${this.formatCost(definition.cost)}`;
      button.setAttribute("aria-label", `${definition.name}，${definition.role}，成本：${this.formatCost(definition.cost)}`);
      button.innerHTML = `<span class="model-thumb-frame"><img class="model-thumb" data-thumb="${type}" alt=""></span><strong>${shortNames[type]}</strong><small>${cost}</small>`;
      button.addEventListener("click", () => this.selectBuild(type));
      this.hud.hotbar.appendChild(button);
    });
    const fortify = document.createElement("button");
    fortify.type = "button";
    fortify.className = "build-slot fortify-slot";
    const fortifyUnlocked = this.isTutorialBuildAllowed("fortify");
    fortify.setAttribute("aria-label", fortifyUnlocked
      ? "道路拒马：阻挡和减速敌人，不占城内功能区，成本：木材 10、石料 4"
      : "道路拒马：完成第一夜教学后开放");
    fortify.innerHTML = `<span class="model-thumb-frame fortify-thumb"><i class="ph ph-fence"></i></span><strong>拒马</strong><small>${fortifyUnlocked ? this.formatCostMarkup({ wood: 10, stone: 4 }, true) : "首夜后开放"}</small>`;
    fortify.title = fortifyUnlocked
      ? "不占城内功能区。点击后镜头聚焦城门外，再选择三处道路缺口之一"
      : "完成商栈、床弩与第一夜防守后开放";
    fortify.disabled = !fortifyUnlocked;
    fortify.classList.toggle("is-tutorial-locked", !fortifyUnlocked);
    fortify.addEventListener("click", () => this.fortifyRoad());
    this.hud.hotbar.appendChild(fortify);
  }

  private isBuildingUnlocked(type: BuildingType): boolean {
    if (!this.state) return type !== "antiair" && type !== "trebuchet";
    const lateNight = this.state.mode === "survival" ? this.state.epoch : this.state.expansionLevel * 3 + 1;
    if (type === "fire") return this.state.mode === "survival" ? lateNight >= 3 : this.state.expansionLevel >= 1;
    if (type === "antiair") return lateNight >= 4;
    if (type === "trebuchet") return this.state.mode === "survival" ? lateNight >= 6 : this.state.expansionLevel >= 2;
    return true;
  }

  /** 前两步只开放一项正确操作，避免新玩家在六种建筑里猜第一步。 */
  private isTutorialBuildAllowed(type: BuildingType | "fortify"): boolean {
    if (!this.state || this.meta.seenTutorial || this.state.mode !== "expedition") return true;
    if (this.state.tutorialStep === 0) return type === "market";
    if (this.state.tutorialStep === 1) return type === "ballista";
    return true;
  }

  private fortifyRoad(preferredId?: string): void {
    if (!this.state || !this.canBuildNow()) return;
    if (!this.isTutorialBuildAllowed("fortify")) {
      this.setPrompt("ph-compass", "第一夜先完成商栈与机关弩塔；拒马会在下一步开放");
      return;
    }
    if (!preferredId) {
      this.selectedBuild = null;
      if (this.relocation) this.cancelRelocation(false);
      this.placingFortification = true;
      this.cameraFocus.set(0, 1.25, -15.7);
      this.setPrompt("ph-fence", "城门外三处道路缺口已标亮：点击任意一处安装或强化拒马");
      return;
    }
    const requested = preferredId ? this.state.fortifications.find((entry) => entry.id === preferredId) : undefined;
    if (requested?.built && requested.hp > 0 && requested.hp < requested.maxHp - 0.5) {
      const missingRatio = 1 - requested.hp / Math.max(1, requested.maxHp);
      const repairWood = Math.max(3, Math.ceil(missingRatio * (7 + requested.level * 3)));
      const repairStone = Math.max(1, Math.ceil(missingRatio * (3 + requested.level * 2)));
      if (this.state.resources.wood < repairWood || this.state.resources.stone < repairStone) {
        this.setPrompt("ph-hammer", `修理拒马需要木材 ${repairWood}、石料 ${repairStone}`);
        return;
      }
      this.state.resources.wood -= repairWood;
      this.state.resources.stone -= repairStone;
      requested.hp = requested.maxHp;
      this.buildWorld();
      this.sound.build();
      this.setPrompt("ph-hammer", `拒马已修复，支付木材 ${repairWood}、石料 ${repairStone}`);
      this.save();
      this.placingFortification = false;
      return;
    }
    if (requested?.built && requested.hp > 0 && requested.level >= 3) {
      const branches: Array<NonNullable<typeof requested.branch>> = ["spike", "sand", "oil"];
      const current = Math.max(0, branches.indexOf(requested.branch ?? "spike"));
      requested.branch = branches[(current + 1) % branches.length]!;
      const names = { spike: "刺桩阵：接触伤害", sand: "流沙障：强力减速", oil: "火油障：与火油塔联动" };
      this.buildWorld();
      this.setPrompt("ph-fence", `拒马 Lv.3 · ${names[requested.branch]}`);
      this.sound.build();
      this.save();
      this.placingFortification = false;
      return;
    }
    const target = requested && (!requested.built || requested.hp <= 0 || requested.level < 3)
      ? requested
      : this.state.fortifications.find((entry) => !entry.built || entry.hp <= 0) ?? this.state.fortifications.find((entry) => entry.level < 3);
    if (!target) return void this.setPrompt("ph-fence", "三条道路的拒马均已强化至最高等级");
    const upgrading = target.built && target.hp > 0;
    const woodCost = upgrading ? 8 + target.level * 6 : 10;
    const stoneCost = upgrading ? 4 + target.level * 3 : 4;
    if (this.state.resources.wood < woodCost || this.state.resources.stone < stoneCost) return void this.setPrompt("ph-tree", `拒马需要木材 ${woodCost}、石料 ${stoneCost}`);
    this.state.resources.wood -= woodCost;
    this.state.resources.stone -= stoneCost;
    target.built = true;
    if (upgrading) target.level += 1;
    if (target.level >= 3) target.branch ??= "spike";
    const fortifyBonus = 1 + this.state.relics.filter((entry) => entry === "fortify").length * 0.15;
    target.maxHp = Math.round((160 + (target.level - 1) * 85) * fortifyBonus);
    target.hp = target.maxHp;
    this.buildWorld();
    this.setPrompt("ph-fence", upgrading
      ? target.level >= 3 ? "拒马升至 Lv.3 · 默认刺桩阵；再次点击可切换流沙或火油分支" : `道路拒马强化至 Lv.${target.level}，更耐久且阻滞更强`
      : "道路拒马已部署在城门外商道，不占城内功能区");
    this.sound.build();
    this.save();
    this.placingFortification = false;
  }

  private renderModelThumbnails(): void {
    if (this.modelThumbnailCache.size === BUILD_ORDER.length) {
      for (const type of BUILD_ORDER) {
        const image = this.hud.hotbar.querySelector<HTMLImageElement>(`[data-thumb="${type}"]`);
        const cached = this.modelThumbnailCache.get(type);
        if (image && cached) image.src = cached;
      }
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 140;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(160, 140, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    const camera = new THREE.OrthographicCamera(-4.4, 4.4, 3.85, -3.85, 0.1, 80);
    camera.position.set(7, 6.4, 8);
    camera.lookAt(0, 1.8, 0);
    const region = regionById("oasis");
    for (const type of BUILD_ORDER) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xf5e4bf, 0x29484a, 2.5));
      const sun = new THREE.DirectionalLight(0xffd7a1, 3.4);
      sun.position.set(-4, 8, 5);
      scene.add(sun);
      const model = makeBuildModel(type, this.library, region);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 5.2 / Math.max(size.x, size.y, size.z, 1);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -box.min.y * scale - 2.2, -center.z * scale);
      model.rotation.y = -0.5;
      scene.add(model);
      renderer.render(scene, camera);
      this.modelThumbnailCache.set(type, canvas.toDataURL("image/png"));
      const image = this.hud.hotbar.querySelector<HTMLImageElement>(`[data-thumb="${type}"]`);
      if (image) image.src = this.modelThumbnailCache.get(type)!;
    }
    renderer.dispose();
  }

  private selectBuild(type: BuildingType): void {
    if (!this.state || !this.canBuildNow()) return;
    if (this.relocation) this.cancelRelocation(false);
    if (!this.isTutorialBuildAllowed(type)) {
      this.setPrompt("ph-compass", this.state.tutorialStep === 0 ? "先建造发光的丝路商栈，它会持续产生钱币" : "先建造机关弩塔，第一夜它会自动射击城门外的敌军");
      return;
    }
    const definition = buildings[type];
    const layout = this.currentFortLayout();
    const compatible = layout.zones
      .map((zone, index) => ({ zone, index }))
      .filter(({ zone }) => canBuildInZone(type, zone));
    if (!compatible.length) {
      this.setPrompt("ph-map-pin", `${definition.name}暂时没有适合的功能区域`);
      return;
    }
    if (compatible.every(({ index }) => this.state!.buildings.some((building) => building.padIndex === index))) {
      this.setPrompt("ph-layout", `${definition.name}的合法位置已占满，请先迁移或回收现有建筑`);
      return;
    }
    // 材料不足时仍允许点一次：直接说清缺口比把图标静默置灰更容易理解，
    // 也避免玩家误以为按钮失灵而连续点击。
    if (!canAfford(this.state.resources, definition.cost)) {
      this.setPrompt("ph-package", `${definition.name}还差 ${this.formatMissingCost(definition.cost)}。可等生产结算或出城采集`);
      this.sound.tone(130, 0.12, "square", 0.025);
      return;
    }
    this.selectedBuild = this.selectedBuild === type ? null : type;
    this.selectedBuildingId = null;
    if (this.rangeIndicator) {
      this.removeWorldObject(this.rangeIndicator);
      this.rangeIndicator = undefined;
    }
    this.hud.context.classList.add("is-hidden");
    this.hud.hotbar.querySelectorAll<HTMLButtonElement>(".build-slot").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.build === this.selectedBuild);
    });
    this.updatePreview();
    this.refreshBuildZoneVisibility();
    if (this.selectedBuild) {
      this.setPrompt(definition.icon, `${definition.name}：${definition.purpose}。选择发光的合法建造区域`);
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.running || this.paused) return;
    if (event.pointerType === "touch") {
      this.touchPoints.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (this.touchPoints.size >= 2) {
        const [first, second] = [...this.touchPoints.values()];
        const distance = first!.distanceTo(second!);
        if (this.pinchDistance > 0) {
          this.changeCameraDistance(this.cameraDistance - (distance - this.pinchDistance) * 0.045);
        }
        this.pinchDistance = distance;
        this.mobileVector.set(0, 0);
        if (this.state) this.state.touch.mode = "pinch";
        return;
      }
      if (event.pointerId !== this.touchPointer) return;
      this.touchLast.set(event.clientX, event.clientY);
      const dx = this.touchLast.x - this.touchStart.x;
      const dy = this.touchLast.y - this.touchStart.y;
      if (!this.touchDragging && Math.hypot(dx, dy) >= 12) this.touchDragging = true;
      if (this.touchDragging) {
        const length = Math.max(1, Math.hypot(dx, dy));
        const strength = Math.min(1, length / 58);
        this.mobileVector.set(dx / length * strength, dy / length * strength);
        this.clickTarget = null;
        this.clickRoute = [];
        this.clearMoveRouteGuide();
        if (this.state) this.state.touch.mode = "drag";
      }
      return;
    }
    const hit = this.raycast(event);
    const pad = this.findUserData(hit?.object, "padIndex");
    this.hoveredPad = typeof pad === "number" ? pad : -1;
    const isTarget = typeof this.findUserData(hit?.object, "resourceId") === "string"
      || typeof this.findUserData(hit?.object, "fieldObjective") === "string"
      || typeof this.findUserData(hit?.object, "buildingId") === "string"
      || typeof this.findUserData(hit?.object, "fortificationId") === "string"
      || Boolean(this.findUserData(hit?.object, "gate"));
    this.canvas.style.cursor = isTarget ? "pointer" : this.selectedBuild && this.hoveredPad >= 0 ? "crosshair" : "default";
    this.updatePreview();
  }

  private handlePointerDown(event: PointerEvent): void {
    if (!this.running || this.paused || !this.state) return;
    this.sound.ensure();
    if (event.pointerType === "touch") {
      this.canvas.setPointerCapture(event.pointerId);
      this.touchPoints.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (this.touchPoints.size === 1) {
        this.touchPointer = event.pointerId;
        this.touchStart.set(event.clientX, event.clientY);
        this.touchLast.copy(this.touchStart);
        this.touchDragging = false;
        this.state.touch = { mode: "tap", pointerId: event.pointerId };
      } else {
        const [first, second] = [...this.touchPoints.values()];
        this.pinchDistance = first!.distanceTo(second!);
        this.state.touch.mode = "pinch";
      }
      return;
    }
    this.processPointerAction(event);
  }

  private handlePointerUp(event: PointerEvent): void {
    if (event.pointerType !== "touch") return;
    const wasPrimary = event.pointerId === this.touchPointer;
    const wasDragging = this.touchDragging || this.touchPoints.size > 1;
    this.touchPoints.delete(event.pointerId);
    if (wasPrimary) {
      if (!wasDragging) this.processPointerAction(event);
      this.touchPointer = null;
      this.touchDragging = false;
      this.mobileVector.set(0, 0);
      if (this.state) this.state.touch = { mode: "idle", pointerId: null };
    }
    if (this.touchPoints.size < 2) this.pinchDistance = 0;
  }

  private processPointerAction(event: PointerEvent): void {
    if (!this.running || this.paused || !this.state) return;
    const hit = this.raycast(event);
    if (!hit) return;
    const resourceId = this.findUserData(hit.object, "resourceId");
    if (typeof resourceId === "string") {
      const resource = this.resources.find((node) => node.id === resourceId);
      if (resource) {
        this.setResourceTarget(resource);
        const label = resource.type === "wood" ? "木材" : resource.type === "stone" ? "石料" : "机巧";
        this.setPrompt("ph-hand-tap", `目标：${label}，沿箭头走至发光环边缘后自动收集`);
      }
      return;
    }
    const fieldObjective = this.findUserData(hit.object, "fieldObjective");
    if (typeof fieldObjective === "string" && this.state.fieldObjective) {
      this.selectedResourceId = null;
      this.setMoveTarget(new THREE.Vector3(this.state.fieldObjective.position.x, 0, this.state.fieldObjective.position.z), true);
      return;
    }
    const choiceIndex = this.findUserData(hit.object, "choiceIndex");
    if (typeof choiceIndex === "number") {
      this.selectChoice(choiceIndex);
      return;
    }
    const gate = this.findUserData(hit.object, "gate");
    if (gate) {
      this.gateStatusTimer = 5;
      const cost = this.gateUpgradePrice();
      this.setPrompt("ph-door", `城门 Lv.${this.state.gateLevel}，点击耐久条右侧上箭头升级（${cost.coin}币 ${cost.stone}石）`);
      return;
    }
    const fortificationId = this.findUserData(hit.object, "fortificationId");
    if (typeof fortificationId === "string") {
      const fortification = this.state.fortifications.find((entry) => entry.id === fortificationId);
      if (fortification?.built && fortification.hp > 0 && fortification.level >= 3) {
        const names = { spike: "刺桩阵", sand: "流沙障", oil: "火油障" };
        this.setPrompt("ph-fence", `拒马 Lv.${fortification.level} · ${names[fortification.branch ?? "spike"]} · ${Math.ceil(fortification.hp)}/${fortification.maxHp}；再次点击切换分支`);
      }
      this.fortifyRoad(fortificationId);
      return;
    }
    const buildingId = this.findUserData(hit.object, "buildingId");
    if (typeof buildingId === "string") {
      this.selectBuilding(buildingId);
      return;
    }
    const enemyId = this.findUserData(hit.object, "enemyId");
    if (typeof enemyId === "string") {
      this.selectEnemy(enemyId);
      return;
    }
    const padIndex = this.findUserData(hit.object, "padIndex");
    if (typeof padIndex === "number" && this.relocation) {
      this.completeRelocation(padIndex);
      return;
    }
    if (typeof padIndex === "number" && this.selectedBuild) {
      this.buildOnPad(this.selectedBuild, padIndex);
      return;
    }
    if (hit.object.userData.ground || this.findUserData(hit.object, "ground")) {
      this.selectedResourceId = null;
      this.selectedBuildingId = null;
      if (this.rangeIndicator) {
        this.removeWorldObject(this.rangeIndicator);
        this.rangeIndicator = undefined;
      }
      this.hud.context.classList.add("is-hidden");
      this.setMoveTarget(hit.point.clone().setY(0));
      this.selectedBuildingId = null;
      this.hud.context.classList.add("is-hidden");
    }
  }

  private isInsideFort(position: THREE.Vector3): boolean {
    return Math.abs(position.x) < this.fortHalfWidth() - 0.8 && position.z > -11.4 && position.z < this.fortBackZ() - 0.25;
  }

  private raycast(event: PointerEvent): THREE.Intersection | undefined {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.children, true);
    if (this.selectedBuild || this.relocation) {
      const layout = this.currentFortLayout();
      const movingBuilding = this.relocation
        ? this.state?.buildings.find((entry) => entry.id === this.relocation!.buildingId)
        : undefined;
      const activeType = movingBuilding?.type ?? this.selectedBuild;
      const padHit = hits.find((hit) => {
        const index = this.findUserData(hit.object, "padIndex");
        if (typeof index !== "number" || !activeType) return false;
        const zone = layout.zones[index];
        return Boolean(zone && canBuildInZone(activeType, zone));
      });
      if (padHit) return padHit;
    }
    // 树、岩石、帐篷只是景观，不能吞掉“走到这里”的点击；只返回真正可交互对象或地面。
    return hits.find((hit) => this.isGameplayHit(hit.object));
  }

  private isGameplayHit(object: THREE.Object3D): boolean {
    return typeof this.findUserData(object, "resourceId") === "string"
      || typeof this.findUserData(object, "fieldObjective") === "string"
      || typeof this.findUserData(object, "choiceIndex") === "number"
      || Boolean(this.findUserData(object, "gate"))
      || typeof this.findUserData(object, "buildingId") === "string"
      || typeof this.findUserData(object, "fortificationId") === "string"
      || typeof this.findUserData(object, "enemyId") === "string"
      || typeof this.findUserData(object, "padIndex") === "number"
      || Boolean(this.findUserData(object, "ground"));
  }

  private findUserData(object: THREE.Object3D | undefined, key: string): unknown {
    let current = object;
    while (current) {
      if (key in current.userData) return current.userData[key];
      current = current.parent ?? undefined;
    }
    return undefined;
  }

  private updatePreview(): void {
    if (this.preview) {
      this.removeWorldObject(this.preview);
      this.preview = undefined;
    }
    if (this.hoveredPad < 0 || !this.state) return;
    const relocatingBuilding = this.relocation
      ? this.state.buildings.find((entry) => entry.id === this.relocation!.buildingId)
      : undefined;
    const activeType = relocatingBuilding?.type ?? this.selectedBuild;
    if (!activeType) return;
    const zone = this.currentFortLayout().zones[this.hoveredPad];
    if (!zone) return;
    const occupied = this.state.buildings.some((building) => building.padIndex === this.hoveredPad && building.id !== relocatingBuilding?.id);
    const compatible = canBuildInZone(activeType, zone);
    const affordable = Boolean(relocatingBuilding) || canAfford(this.state.resources, buildings[activeType].cost);
    const preview = makeBuildModel(activeType, this.library, regionById(this.state.regionId));
    preview.position.copy(this.zonePosition(this.hoveredPad));
    preview.rotation.y = zone.rotation;
    preview.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.raycast = () => undefined;
      const current = Array.isArray(child.material) ? child.material[0] : child.material;
      const ghost = (current as THREE.MeshStandardMaterial).clone();
      ghost.transparent = true;
      ghost.opacity = 0.48;
      ghost.color.lerp(new THREE.Color(!occupied && compatible && affordable ? 0x56b98b : 0xca5644), 0.62);
      child.material = ghost;
    });
    this.preview = preview;
    this.world.add(preview);
  }

  private buildOnPad(type: BuildingType, padIndex: number): void {
    if (!this.state || !this.canBuildNow()) return;
    const zone = this.currentFortLayout().zones[padIndex];
    if (!zone || !canBuildInZone(type, zone)) {
      const labels = { defense: "城防位", courtyard: "院落位", logistics: "后勤位", siege: "攻城位" } as const;
      this.setPrompt("ph-map-pin", zone ? `${buildings[type].name}不能部署在${labels[zone.type]}` : "该建造区域尚未开放");
      return;
    }
    if (this.state.buildings.some((building) => building.padIndex === padIndex)) {
      this.setPrompt("ph-warning", "这个建造区域已经有建筑");
      return;
    }
    const definition = buildings[type];
    if (!canAfford(this.state.resources, definition.cost)) {
      this.setPrompt("ph-coins", "资源不足，等待主帐和生产建筑下一次结算");
      this.sound.tone(110, 0.18, "square", 0.03);
      return;
    }
    pay(this.state.resources, definition.cost);
    const building: BuildingState = {
      id: `b-${this.state.epoch}-${padIndex}-${Date.now().toString(36)}`,
      type,
      padIndex,
      level: 1,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      specialization: type === "workshop" ? "cycle" : undefined,
      status: { productionPaused: false, targeted: false, lastHitAt: 0 }
    };
    this.state.buildings.push(building);
    this.state.prosperity += type === "market" || type === "workshop" ? 2 : 1;
    this.createBuildingVisual(building);
    const pad = this.buildPads[padIndex];
    const expansionMarker = pad?.userData.expansionMarker as THREE.Object3D | undefined;
    if (pad && expansionMarker) {
      pad.remove(expansionMarker);
      pad.userData.expansionMarker = undefined;
    }
    this.refreshTutorialPads();
    this.selectedBuild = null;
    this.hoveredPad = -1;
    this.updatePreview();
    this.sound.build();
    this.burst(this.zonePosition(padIndex).setY(1), regionById(this.state.regionId).accent, 12);
    if (this.state.tutorialStep === 0 && type === "market") {
      this.state.tutorialStep = 1;
      this.refreshTutorialPads();
      this.renderHotbar();
      this.renderModelThumbnails();
      this.setPrompt("ph-crosshair", "商栈开始产币。现在建造一座机关弩塔");
    } else if (this.state.tutorialStep < 2 && type === "ballista") {
      this.state.tutorialStep = 2;
      this.refreshTutorialPads();
      this.renderHotbar();
      this.renderModelThumbnails();
      this.setPrompt("ph-door", "防线就绪：敌人只从上方城门进入。点击月亮，立即开始第一夜");
    } else {
      this.setPrompt(definition.icon, `${definition.name}建成，点击建筑可以升级`);
    }
    this.updateHud(true);
    this.save();
  }

  private createBuildingVisual(building: BuildingState): void {
    if (!this.state) return;
    building.status ??= { productionPaused: building.hp <= 0, targeted: false, lastHitAt: 0 };
    const model = makeBuildModel(building.type, this.library, regionById(this.state.regionId));
    applyBuildingVisualState(model, building, regionById(this.state.regionId));
    const zone = this.currentFortLayout().zones[building.padIndex];
    model.position.copy(this.zonePosition(building.padIndex));
    model.rotation.y = zone?.rotation ?? 0;
    model.userData.buildingId = building.id;
    model.traverse((child) => { child.userData.buildingId = building.id; });
    this.world.add(model);
    this.registerOccluders(model);
    this.buildingObjects.set(building.id, model);
    this.buildingCooldowns.set(building.id, Math.random() * 0.4);
    const label = document.createElement("button");
    label.type = "button";
    label.className = "building-world-label is-idle-status";
    label.innerHTML = `<strong>Lv.${building.level}</strong><span><i></i></span><small><i class="ph ph-arrow-fat-up"></i> 升级</small>`;
    label.addEventListener("click", () => this.selectBuilding(building.id));
    this.hud.buildingLabels.appendChild(label);
    this.buildingLabels.set(building.id, label);
    this.positionElement(label, model.position.clone().setY(5.5));
  }

  private refreshBuildingVisual(building: BuildingState): void {
    if (!this.state) return;
    const previous = this.buildingObjects.get(building.id);
    const zone = this.currentFortLayout().zones[building.padIndex];
    const model = makeBuildModel(building.type, this.library, regionById(this.state.regionId));
    applyBuildingVisualState(model, building, regionById(this.state.regionId));
    model.position.copy(this.zonePosition(building.padIndex));
    model.rotation.y = zone?.rotation ?? 0;
    model.userData.buildingId = building.id;
    model.traverse((child) => { child.userData.buildingId = building.id; });
    if (previous) {
      this.removeWorldObject(previous);
    }
    this.world.add(model);
    this.registerOccluders(model);
    this.buildingObjects.set(building.id, model);
  }

  private selectBuilding(id: string): void {
    if (!this.state) return;
    if (this.relocation && this.relocation.buildingId !== id) this.cancelRelocation(false);
    const building = this.state.buildings.find((entry) => entry.id === id);
    const object = this.buildingObjects.get(id);
    if (!building || !object) return;
    this.selectedBuildingId = id;
    if (this.rangeIndicator) {
      this.removeWorldObject(this.rangeIndicator);
      this.rangeIndicator = undefined;
    }
    this.selectedBuild = null;
    this.hud.hotbar.querySelectorAll(".build-slot").forEach((button) => button.classList.remove("is-active"));
    this.hud.contextName.textContent = buildings[building.type].name;
    this.hud.contextLevel.textContent = `Lv.${building.level} → Lv.${building.level + 1}`;
    const cost = upgradeCost(building.type, building.level);
    // 每种成本都用与资源栏一致的图标显示；只写“升级”会让玩家误以为所有建筑只花钱币。
    this.hud.contextEffect.innerHTML = `${this.buildingEffect(building)}<span class="context-cost">下一阶 ${this.formatCostMarkup(cost)}</span>`;
    this.hud.upgradeCost.innerHTML = this.formatCostMarkup(cost, true);
    const missingUpgrade = this.formatMissingCost(cost);
    const upgradeAffordable = canAfford(this.state.resources, cost);
    this.hud.upgrade.title = upgradeAffordable ? `升级消耗：${this.formatCost(cost)}` : `还差：${missingUpgrade}`;
    this.hud.upgrade.classList.toggle("is-unaffordable", !upgradeAffordable);
    // 修理不能只写一串中文材料名；和建造、城门升级使用同一套实物图标，
    // 玩家能直接对照右上角库存判断为何本次操作不能执行。
    const repairCost = this.repairCost(building);
    const repairAffordable = canAfford(this.state.resources, repairCost);
    this.hud.repairCost.innerHTML = this.formatCostMarkup(repairCost, true);
    this.hud.repair.title = building.hp >= building.maxHp - 0.5
      ? "建筑完好，无需修理"
      : repairAffordable ? `修理消耗：${this.formatCost(repairCost)}` : `还差：${this.formatMissingCost(repairCost)}`;
    this.hud.repair.classList.toggle("is-unaffordable", building.hp < building.maxHp - 0.5 && !repairAffordable);
    this.hud.demolishRefund.textContent = "回收";
    this.hud.demolish.title = `拆除并返还 ${this.formatCost(this.demolishRefund(building))}`;
    this.hud.relocateText.textContent = "迁移";
    this.hud.relocate.disabled = this.state.phase !== "day";
    this.hud.relocate.title = this.state.phase === "day" ? "免费迁移到其他合法位置" : "敌袭期间不能迁移建筑";
    const canSpecialize = building.level >= 3 && this.specializationModes(building.type).length > 1;
    this.hud.workshopMode.classList.toggle("is-hidden", !canSpecialize);
    if (canSpecialize) {
      this.hud.workshopModeText.textContent = this.specializationModeName(this.activeSpecialization(building));
      this.hud.workshopMode.title = `切换${buildings[building.type].name}专精`;
    }
    this.hud.context.classList.remove("is-hidden");
    this.positionElement(this.hud.context, object.position.clone().setY(6.6));
    const definition = buildings[building.type];
      const range = this.towerRange(building);
    if (range) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.1, range - 0.12), range, 64),
        new THREE.MeshBasicMaterial({
          color: 0x6ab4a3,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(object.position).setY(0.2);
      ring.raycast = () => undefined;
      this.world.add(ring);
      this.rangeIndicator = ring;
    }
  }

  private upgradeSelected(): void {
    if (!this.state || !this.selectedBuildingId || !this.canBuildNow()) return;
    const building = this.state.buildings.find((entry) => entry.id === this.selectedBuildingId);
    if (!building) return;
    const cost = upgradeCost(building.type, building.level);
    if (!canAfford(this.state.resources, cost)) {
      this.setPrompt("ph-package", `还差 ${this.formatMissingCost(cost)}，工坊会每 3 秒轮换生产材料`);
      this.sound.tone(110, 0.16, "square", 0.035);
      return;
    }
    pay(this.state.resources, cost);
    const healthRatio = building.hp / Math.max(1, building.maxHp);
    building.level += 1;
    building.maxHp = Math.round(building.maxHp * buildingDurabilityGrowth(building.level - 1));
    // Upgrading expands the structure but does not replace paid repairs.
    building.hp = Math.max(1, Math.round(building.maxHp * healthRatio));
    this.state.prosperity += 1;
    this.refreshBuildingVisual(building);
    const object = this.buildingObjects.get(building.id);
    if (object) this.burst(object.position.clone().setY(3), 0xe2ad55, 9);
    this.sound.build();
    if (this.state.tutorialStep === 4) {
      this.state.tutorialStep = 5;
      this.meta.seenTutorial = true;
      this.setPrompt("ph-hammer", "升级会消耗对应材料；建筑受损后可用锤子付费修理。引导完成");
    }
    this.selectBuilding(building.id);
    this.updateHud(true);
    this.save();
  }

  private cycleBuildingSpecialization(): void {
    if (!this.state || !this.selectedBuildingId) return;
    const building = this.state.buildings.find((entry) => entry.id === this.selectedBuildingId);
    if (!building || building.level < 3) return;
    const modes = this.specializationModes(building.type);
    if (modes.length < 2) return;
    const current = modes.indexOf(this.activeSpecialization(building));
    building.specialization = modes[(current + 1) % modes.length]!;
    this.refreshBuildingVisual(building);
    this.sound.build();
    this.setPrompt("ph-gear-six", `${buildings[building.type].name}已专精为${this.specializationModeName(building.specialization)}`);
    this.selectBuilding(building.id);
    this.updateHud(true);
    this.save();
  }

  private specializationModes(type: BuildingType): Array<NonNullable<BuildingState["specialization"]>> {
    if (type === "workshop") return ["cycle", "wood", "stone", "gear"];
    if (type === "market") return ["caravan", "supply"];
    if (type === "ballista") return ["pierce", "watch"];
    if (type === "fire") return ["burn", "tar"];
    if (type === "antiair") return ["hunter", "volley"];
    if (type === "trebuchet") return ["siege", "shatter"];
    return [];
  }

  private activeSpecialization(building: BuildingState): NonNullable<BuildingState["specialization"]> {
    return building.specialization ?? this.specializationModes(building.type)[0] ?? "cycle";
  }

  private specializationModeName(mode: NonNullable<BuildingState["specialization"]>): string {
    const names: Record<NonNullable<BuildingState["specialization"]>, string> = {
      cycle: "轮换工坊", wood: "伐木工坊", stone: "采石工坊", gear: "机关作坊",
      caravan: "车队站", supply: "军需库",
      pierce: "破甲弩", watch: "瞭望弩",
      burn: "燃烧油", tar: "黏滞油",
      hunter: "猎空弩", volley: "连射弩",
      siege: "攻城投车", shatter: "震裂投车"
    };
    return names[mode];
  }

  private repairSelected(): void {
    if (!this.state || !this.selectedBuildingId) return;
    const building = this.state.buildings.find((entry) => entry.id === this.selectedBuildingId);
    if (!building) return;
    if (building.hp >= building.maxHp - 0.5) {
      this.setPrompt("ph-check-circle", `${buildings[building.type].name} 完好，无需修理`);
      return;
    }
    const cost = this.repairCost(building);
    if (!canAfford(this.state.resources, cost)) {
      this.setPrompt("ph-hammer", `修复${buildings[building.type].name}还差 ${this.formatMissingCost(cost)}`);
      this.sound.tone(110, 0.16, "square", 0.035);
      return;
    }
    pay(this.state.resources, cost);
    building.hp = building.maxHp;
    building.status.productionPaused = false;
    building.status.targeted = false;
    this.refreshBuildingVisual(building);
    this.sound.build();
    this.setPrompt("ph-hammer", `${buildings[building.type].name} 已修复，支付 ${this.formatCost(cost)}`);
    this.updateHud(true);
    this.save();
  }

  private repairCost(building: BuildingState): Partial<Record<ResourceKey, number>> {
    const damage = 1 - building.hp / Math.max(1, building.maxHp);
    const scale = Math.max(1, Math.ceil(damage * 3));
    const raw: Partial<Record<ResourceKey, number>> = building.type === "market"
      ? { coin: 2 * scale, wood: scale }
      : building.type === "workshop"
        ? { coin: 2 * scale, stone: scale }
        : building.type === "ballista"
          ? { coin: 2 * scale, wood: scale, gear: scale }
          : { coin: 2 * scale, wood: scale, gear: scale };
    return this.discountRepairCost(raw);
  }

  private coreRepairCost(): Partial<Record<ResourceKey, number>> {
    const damageScale = Math.max(1, Math.ceil((1 - this.state!.coreHp / Math.max(1, this.state!.coreMaxHp)) * 3));
    return this.discountRepairCost({ coin: 2 + damageScale, stone: damageScale });
  }

  private gateRepairQuote(): GateRepairQuote {
    if (!this.state) return { restore: 0, cost: {}, fullRepair: false, emergency: false };
    const missing = Math.max(0, this.state.gateMaxHp - this.state.gateHp);
    const emergency = this.state.phase === "night";
    const restore = emergency ? Math.min(missing, Math.max(28, Math.round(this.state.gateMaxHp * 0.08))) : missing;
    if (restore <= 0) return { restore: 0, cost: {}, fullRepair: !emergency, emergency };
    const level = this.state.gateLevel;
    const bands = emergency ? 1 : Math.max(1, Math.ceil((missing / this.state.gateMaxHp) * 5));
    const raw = {
      wood: Math.ceil((2 + Math.floor((level - 1) / 4)) * bands * (emergency ? 1.2 : 1)),
      stone: Math.ceil((1 + Math.floor((level - 1) / 6)) * bands * (emergency ? 1.2 : 1))
    };
    return { restore, cost: this.discountRepairCost(raw), fullRepair: !emergency, emergency };
  }

  private repairGate(): void {
    if (!this.state || !this.playerRig || (this.state.phase !== "day" && this.state.phase !== "night")) return;
    if (this.state.gateHp >= this.state.gateMaxHp - 0.5) {
      this.setPrompt("ph-check-circle", "城门完好，无需修缮");
      return;
    }
    const distance = this.playerRig.root.position.distanceTo(new THREE.Vector3(0, 0, -10));
    if (distance > 5.2) {
      this.setPrompt("ph-map-pin", "请先走到城门旁再进行修缮");
      this.setMoveTarget(new THREE.Vector3(0, 0, -7.8));
      return;
    }
    const quote = this.gateRepairQuote();
    if (!canAfford(this.state.resources, quote.cost)) {
      this.setPrompt("ph-hammer", `修缮城门还差 ${this.formatMissingCost(quote.cost)}`);
      this.sound.tone(110, 0.16, "square", 0.035);
      return;
    }
    pay(this.state.resources, quote.cost);
    this.state.gateHp = Math.min(this.state.gateMaxHp, this.state.gateHp + quote.restore);
    this.gateStatusTimer = 4;
    this.sound.build();
    this.burst(new THREE.Vector3(0, 2.5, -12), 0xe2ad55, quote.fullRepair ? 12 : 7);
    this.setPrompt("ph-hammer", `${quote.fullRepair ? "城门已完整修缮" : `城门抢修 ${Math.round(quote.restore)} 点`}，支付 ${this.formatCost(quote.cost)}`);
    this.updateHud(true);
    this.save();
  }

  private discountRepairCost(cost: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> {
    if (!this.state) return cost;
    const relicDiscount = Math.min(0.24, this.state.relics.filter((entry) => entry === "repair-save").length * 0.08);
    const eventDiscount = this.state.nightModifier?.repairDiscount ?? 0;
    const multiplier = Math.max(0.35, 1 - relicDiscount - eventDiscount);
    return Object.fromEntries(
      Object.entries(cost).map(([key, value]) => [key, Math.max(1, Math.ceil((value ?? 0) * multiplier))])
    ) as Partial<Record<ResourceKey, number>>;
  }

  private beginRelocation(): void {
    if (!this.state || !this.selectedBuildingId) return;
    if (this.state.phase !== "day") {
      this.setPrompt("ph-moon", "敌袭期间不能搬迁建筑，请在白天重新布防");
      return;
    }
    const building = this.state.buildings.find((entry) => entry.id === this.selectedBuildingId);
    if (!building) return;
    this.relocation = { buildingId: building.id, originPadIndex: building.padIndex, hoveredPadIndex: -1 };
    this.selectedBuild = null;
    const object = this.buildingObjects.get(building.id);
    if (object) object.visible = false;
    this.hud.context.classList.add("is-hidden");
    this.refreshBuildZoneVisibility();
    this.updatePreview();
    this.setPrompt("ph-arrows-out-cardinal", `迁移${buildings[building.type].name}：绿色位置可放置，右键取消`);
  }

  private completeRelocation(padIndex: number): void {
    if (!this.state || !this.relocation) return;
    const relocation = this.relocation;
    const building = this.state.buildings.find((entry) => entry.id === relocation.buildingId);
    const zone = this.currentFortLayout().zones[padIndex];
    if (!building || !zone) return;
    if (this.state.buildings.some((entry) => entry.padIndex === padIndex && entry.id !== building.id)) {
      this.setPrompt("ph-warning", "这个建造区域已经被占用");
      return;
    }
    if (!canBuildInZone(building.type, zone)) {
      this.setPrompt("ph-map-pin", `${buildings[building.type].name}不适合这个功能区域`);
      return;
    }
    building.padIndex = padIndex;
    const object = this.buildingObjects.get(building.id);
    if (object) {
      object.position.copy(this.zonePosition(padIndex));
      object.rotation.y = zone.rotation;
      object.visible = true;
      this.burst(object.position.clone().setY(1.4), 0xd6b36b, 10);
    }
    this.relocation = null;
    this.hoveredPad = -1;
    this.updatePreview();
    this.refreshBuildZoneVisibility();
    this.sound.build();
    this.setPrompt("ph-arrows-out-cardinal", `${buildings[building.type].name}已迁移，等级和耐久保持不变`);
    this.selectBuilding(building.id);
    this.save();
  }

  private cancelRelocation(reselect = true): void {
    if (!this.relocation) return;
    const id = this.relocation.buildingId;
    const object = this.buildingObjects.get(id);
    if (object) object.visible = true;
    this.relocation = null;
    this.hoveredPad = -1;
    this.updatePreview();
    this.refreshBuildZoneVisibility();
    if (reselect) this.selectBuilding(id);
  }

  /**
   * 按功能区重排现有建筑。它不是替玩家做数值选择，只解决扩城后前排武器留在后院、
   * 生产建筑占据门楼等明显不合理布局；所有建筑的 ID、等级、专精、耐久和生产进度不变。
   */
  private autoArrangeBuildings(): void {
    if (!this.state || this.state.phase !== "day" || this.state.enemies.length > 0 || this.relocation) {
      this.setPrompt("ph-layout", "只能在安全的白天整理防线");
      return;
    }
    const layout = this.currentFortLayout();
    const unused = new Set(layout.zones.map((_, zoneIndex) => zoneIndex));
    const rolePriority = (building: BuildingState): number => {
      if (building.type === "trebuchet") return 0;
      if (["ballista", "fire", "antiair"].includes(building.type)) return 1;
      if (["market", "workshop"].includes(building.type)) return 2;
      return 3;
    };
    const score = (building: BuildingState, zoneIndex: number): number => {
      const zone = layout.zones[zoneIndex];
      if (!zone || !canBuildInZone(building.type, zone)) return -Infinity;
      let value = 0;
      if (building.type === "trebuchet") value += zone.type === "siege" ? 120 : zone.type === "courtyard" ? 35 : 0;
      else if (["ballista", "fire", "antiair"].includes(building.type)) value += zone.type === "defense" ? 110 : 36;
      else value += zone.type === "logistics" ? 105 : 42;
      if (building.type === "fire" && zone.coveredLanes.includes(0)) value += 16;
      if (building.type === "antiair" && zone.coveredLanes.length >= 2) value += 14;
      if (zone.elevation > 0 && ["ballista", "antiair", "trebuchet"].includes(building.type)) value += 10;
      return value;
    };
    const ordered = [...this.state.buildings].sort((a, b) => rolePriority(a) - rolePriority(b));
    for (const building of ordered) {
      const destination = [...unused]
        .map((zoneIndex) => ({ zoneIndex, score: score(building, zoneIndex) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => b.score - a.score)[0];
      if (!destination) continue;
      building.padIndex = destination.zoneIndex;
      unused.delete(destination.zoneIndex);
    }
    this.selectedBuild = null;
    this.selectedBuildingId = null;
    this.buildWorld();
    this.setPrompt("ph-layout", "防线已整理：武器前置、生产后移；仍可逐座免费迁移");
    this.save();
  }

  /** 拆除是换流派的工具：返还一部分原建造、升级投入，永远不会比投入更多。 */
  private demolishRefund(building: BuildingState): Partial<Record<ResourceKey, number>> {
    const spent: Partial<Record<ResourceKey, number>> = { ...buildings[building.type].cost };
    for (let level = 1; level < building.level; level += 1) {
      const upgrade = upgradeCost(building.type, level);
      for (const key of Object.keys(upgrade) as ResourceKey[]) spent[key] = (spent[key] ?? 0) + (upgrade[key] ?? 0);
    }
    const healthRatio = THREE.MathUtils.clamp(building.hp / Math.max(1, building.maxHp), 0, 1);
    const refundRate = building.hp <= 0 ? 0.15 : 0.65 * healthRatio;
    return Object.fromEntries(
      Object.entries(spent)
        .filter(([, value]) => Number(value ?? 0) > 0)
        .map(([key, value]) => [key, Math.max(0, Math.floor(Number(value ?? 0) * refundRate))] as const)
        .filter(([, value]) => value > 0)
    ) as Partial<Record<ResourceKey, number>>;
  }

  private demolishSelected(): void {
    if (!this.state || !this.selectedBuildingId || !this.canBuildNow()) return;
    const index = this.state.buildings.findIndex((building) => building.id === this.selectedBuildingId);
    if (index < 0) return;
    const building = this.state.buildings[index]!;
    const refund = this.demolishRefund(building);
    const accepted = window.confirm(`回收${buildings[building.type].name}？将返还 ${this.formatCost(refund) || "少量残料"}，此操作无法撤销。`);
    if (!accepted) return;
    for (const key of Object.keys(refund) as ResourceKey[]) this.state.resources[key] += refund[key] ?? 0;
    const object = this.buildingObjects.get(building.id);
    if (object) {
      this.burst(object.position.clone().setY(1.2), 0xb79a65, 11);
      this.removeWorldObject(object);
    }
    this.buildingObjects.delete(building.id);
    this.buildingCooldowns.delete(building.id);
    const label = this.buildingLabels.get(building.id);
    label?.remove();
    this.buildingLabels.delete(building.id);
    this.state.buildings.splice(index, 1);
    this.selectedBuildingId = null;
    this.hud.context.classList.add("is-hidden");
    if (this.rangeIndicator) {
      this.removeWorldObject(this.rangeIndicator);
      this.rangeIndicator = undefined;
    }
    this.sound.build();
    this.setPrompt("ph-arrow-u-up-left", `已拆除${buildings[building.type].name}，返还 ${this.formatCost(refund)}`);
    this.updateHud(true);
    this.save();
  }

  private formatCost(cost: Partial<Record<ResourceKey, number>>): string {
    const labels: Record<ResourceKey, string> = { coin: "钱币", wood: "木材", stone: "石料", gear: "机巧" };
    return (Object.keys(labels) as ResourceKey[])
      .filter((key) => (cost[key] ?? 0) > 0)
      .map((key) => `${cost[key]}${labels[key]}`)
      .join(" · ");
  }

  /** 建造、升级、修理与右上资源栏共用同一套实物资源符号。 */
  private formatCostMarkup(cost: Partial<Record<ResourceKey, number>>, compact = false): string {
    const keys: ResourceKey[] = ["coin", "wood", "stone", "gear"];
    return keys
      .filter((key) => (cost[key] ?? 0) > 0)
      .map((key) => {
        const amount = cost[key] ?? 0;
        const missing = this.state && this.state.resources[key] < amount ? " is-missing" : "";
        return `<span class="cost-chip${compact ? " is-compact" : ""}${missing}"><i class="resource-token cost-token ${key}-token" aria-hidden="true"></i>${amount}</span>`;
      })
      .join("");
  }

  private formatMissingCost(cost: Partial<Record<ResourceKey, number>>): string {
    if (!this.state) return this.formatCost(cost);
    const labels: Record<ResourceKey, string> = { coin: "钱币", wood: "木材", stone: "石料", gear: "机巧" };
    return (Object.keys(labels) as ResourceKey[])
      .map((key) => ({ key, missing: Math.max(0, (cost[key] ?? 0) - this.state!.resources[key]) }))
      .filter(({ missing }) => missing > 0)
      .map(({ key, missing }) => `${labels[key]} ${missing}`)
      .join("、") || "材料";
  }

  private canBuildNow(): boolean {
    return Boolean(this.state && (this.state.phase === "day" || this.state.phase === "night"));
  }

  private buildingEffect(building: BuildingState): string {
    if (!this.state) return buildings[building.type].purpose;
    if (building.type === "market") {
      const tradeBonus = this.state.relics.filter((entry) => entry === "trade").length;
      const amount = 1 + Math.floor(Math.pow(Math.max(0, building.level - 1), 0.78)) + tradeBonus;
      const names = { wood: "木材", stone: "石料", gear: "机巧" } as const;
      const weights = { wood: 1.2, stone: 1, gear: 0.65 } as const;
      const shortage = (["wood", "stone", "gear"] as const).slice().sort((a, b) => this.state!.resources[a] / weights[a] - this.state!.resources[b] / weights[b])[0]!;
      if (building.level < 3) return `产币 +${amount}；留足储备后以 2 钱币采购最缺的${names[shortage]}`;
      if (this.activeSpecialization(building) === "supply") return `军需库：每轮最多用 4 钱币补给 2 份紧缺材料`;
      return `车队站：专注钱币收入 +${amount + 1} / 3秒，不自动采购材料`;
    }
    if (building.type === "workshop") {
      const amount = Math.max(1, Math.floor(1 + (building.level - 1) * 0.58));
      const specialization = this.activeSpecialization(building);
      if (specialization === "wood" || specialization === "stone" || specialization === "gear") return `每 3 秒固定生产${this.specializationModeName(specialization)} +${amount}`;
      const next = (["木材", "石料", "机巧"] as const)[this.state.workshopRotation % 3]!;
      return `每 3 秒轮换材料 +${amount} · 下一次：${next}`;
    }
    if (building.type === "ballista") return building.level < 3 ? `远程伤害 ${Math.round(18 * weaponLevelPower(building.level))} · 射程 ${this.towerRange(building).toFixed(0)}` : this.activeSpecialization(building) === "watch" ? `瞭望弩：射程 ${this.towerRange(building).toFixed(0)}，射速提高` : `破甲弩：远程伤害 ${Math.round(18 * weaponLevelPower(building.level))}，重甲目标更痛`;
    if (building.type === "fire") return building.level < 3 ? `快速伤害 ${Math.round(11 * weaponLevelPower(building.level))}，Lv.3 可选燃烧或黏滞专精` : this.activeSpecialization(building) === "tar" ? `黏滞油：减速更强、更久` : `燃烧油：快速伤害 ${Math.round(11 * weaponLevelPower(building.level))}，附带灼烧`;
    if (building.type === "antiair") return building.level < 3 ? `优先击落飞行机关，Lv.3 可选猎空或连射专精` : this.activeSpecialization(building) === "volley" ? `连射弩：优先连射多名飞行机关` : `猎空弩：对空伤害 ${Math.round(26 * weaponLevelPower(building.level))}，专杀飞行机关`;
    if (building.type === "trebuchet") return building.level < 3 ? `远程震石 ${Math.round(34 * weaponLevelPower(building.level))}，Lv.3 可选攻城或震裂专精` : this.activeSpecialization(building) === "shatter" ? `震裂投车：爆炸范围扩大` : `攻城投车：对攻城兽与重甲目标更强`;
    return `附近敌人减速，范围 ${Math.round((4.5 + building.level * 0.55) * 10) / 10}`;
  }

  private gateUpgradePrice(): { coin: number; stone: number } {
    const level = this.state?.gateLevel ?? 1;
    // 首局按引导完成“商栈 + 床弩”后恰好还留有 12 钱币与充足石料，
    // 允许玩家立刻体验一次城门升级；之后按阶递增而不会把开局卡在纯等待上。
    const stoneCost = 1 + level * 3;
    return {
      coin: 7 + level * 5,
      stone: this.state?.regionId === "canyon" ? Math.max(1, Math.ceil(stoneCost * 0.7)) : stoneCost
    };
  }

  private upgradeGate(): void {
    if (!this.state || !this.canBuildNow()) return;
    const cost = this.gateUpgradePrice();
    if (!canAfford(this.state.resources, cost)) {
      this.setPrompt("ph-coins", `城门还差 ${this.formatMissingCost(cost)}`);
      this.sound.tone(110, 0.16, "square", 0.035);
      return;
    }
    pay(this.state.resources, cost);
    const healthRatio = this.state.gateHp / Math.max(1, this.state.gateMaxHp);
    const oldMax = this.state.gateMaxHp;
    this.state.gateLevel += 1;
    const increase = 72 + Math.min(150, this.state.gateLevel * 14);
    this.state.gateMaxHp = Math.round(oldMax + increase);
    // 升级只扩大结构上限，不再无成本回满耐久；维修仍是独立且有代价的决策。
    this.state.gateHp = Math.max(1, Math.round(this.state.gateMaxHp * healthRatio));
    this.state.prosperity += 1;
    if (this.gateObject) {
      this.gateObject.scale.multiplyScalar(1.035);
      this.burst(new THREE.Vector3(0, 2.8, -12), 0xe2ad55, 13);
    }
    this.sound.build();
    this.gateStatusTimer = 5;
    this.setPrompt("ph-shield-check", `城门 Lv.${this.state.gateLevel} · 上限 +${increase}，现有耐久比例不变`);
    this.updateHud(true);
    this.save();
  }

  private update(delta: number): void {
    this.updateAdaptiveQuality(delta);
    this.playerRig?.mixer.update(delta);
    for (const visual of this.enemyObjects.values()) visual.rig?.mixer.update(delta);
    for (const ally of this.supportAllies) ally.rig.mixer.update(delta);
    if (this.titlePreview) {
      // 封面只在商路外轻微侧移，不做完整绕场环拍；完整环拍会经常让城墙挡住主帐。
      this.cameraYaw += delta * 0.11;
      const training = this.mode === "training";
      const aspect = this.camera.aspect;
      const scale = aspect < 0.82 ? 1.18 : aspect > 1.9 ? 0.92 : 1;
      const radius = (training ? 35 : 31) * scale;
      if (training) {
        this.camera.position.set(Math.sin(this.cameraYaw + 0.75) * radius, 20, Math.cos(this.cameraYaw + 0.75) * radius + 1);
        this.camera.lookAt(0, 1.6, 0);
      } else {
        this.camera.position.set(Math.sin(this.cameraYaw) * radius * 0.22, 16.5, -radius + 1.2);
        this.camera.lookAt(0, 2.9, 2.2);
      }
      this.animateWorld(delta);
      this.updateWeather(delta);
      this.updateTitlePreview();
      return;
    }
    if (!this.running || !this.state || this.paused) return;

    const simulationDelta = this.state.phase === "night" ? delta * this.state.nightSpeed : delta;
    const bossActive = this.state.enemies.some((enemy) => Boolean(enemy.bossKind) && enemy.hp > 0);
    const pressure = this.state.phase === "night" ? Math.min(1, (this.state.enemies.length + this.spawnQueue.length * 0.35) / 12) : 0;
    this.sound.updateMusic(this.state.phase, delta, this.state.regionId, pressure, bossActive);
    this.boundaryHintCooldown = Math.max(0, this.boundaryHintCooldown - delta);
    this.promptTimer = Math.max(0, this.promptTimer - delta);
    if (this.promptTimer <= 0 && this.state.tutorialStep >= 3) this.hud.prompt.classList.add("is-hidden");
    this.updatePlayer(delta);
    this.gateStatusTimer = Math.max(0, this.gateStatusTimer - delta);
    this.coreStatusTimer = Math.max(0, this.coreStatusTimer - delta);
    this.updateCamera(delta);
    this.updateGateAnimation(delta);
    this.animateWorld(delta);
    this.updateWeather(delta);
    this.updateProjectiles(simulationDelta);
    this.updateParticles(simulationDelta);
    this.updateFallenVisuals(simulationDelta);
    this.positionWorldUi();

    this.state.player.attackCooldown = Math.max(0, this.state.player.attackCooldown - delta);
    if (this.state.mode === "training") {
      this.updateAdventure(simulationDelta);
      this.autosaveCooldown -= delta;
      if (this.autosaveCooldown <= 0) { this.autosaveCooldown = 5; this.save(); }
      return;
    }
    if (this.state.phase === "day" || this.state.phase === "night") this.updateEconomy(simulationDelta);
    if (this.state.phase === "day") this.updateDay(delta);
    if (this.state.phase === "night") this.updateNight(simulationDelta);
    if (this.state.phase === "clear") this.updateClear(delta);
    if (this.state.phase === "relic" || this.state.phase === "route") this.animateChoices(delta);

    this.autosaveCooldown -= delta;
    if (this.autosaveCooldown <= 0) {
      this.autosaveCooldown = 5;
      this.save();
    }
    this.hudCooldown -= delta;
    if (this.hudCooldown <= 0) {
      this.hudCooldown = 0.12;
      this.updateHud();
    }
  }

  private updateAdaptiveQuality(delta: number): void {
    if (document.hidden || delta <= 0 || delta >= 0.049) return;
    if (this.preferredQuality !== "auto") return;
    this.qualitySampleTime += delta;
    this.qualityFrames += 1;
    if (this.qualitySampleTime < 3) return;
    const fps = this.qualityFrames / this.qualitySampleTime;
    this.qualitySampleTime = 0;
    this.qualityFrames = 0;
    const lowThreshold = this.effectiveQuality === "high" ? 46 : 31;
    if (fps < lowThreshold) {
      this.qualityStableTime = Math.min(0, this.qualityStableTime) - 3;
      if (this.qualityStableTime <= -6) {
        this.effectiveQuality = this.effectiveQuality === "high" ? "medium" : "low";
        this.qualityStableTime = 0;
        this.applyQuality();
      }
    } else if (fps > 56) {
      this.qualityStableTime = Math.max(0, this.qualityStableTime) + 3;
      if (this.qualityStableTime >= 15 && this.effectiveQuality !== "high") {
        this.effectiveQuality = this.effectiveQuality === "low" ? "medium" : "high";
        this.qualityStableTime = 0;
        this.applyQuality();
      }
    } else {
      this.qualityStableTime *= 0.5;
    }
  }

  private applyQuality(): void {
    const preset = qualityPresets[this.effectiveQuality];
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const cap = coarsePointer ? Math.min(preset.pixelRatio, 1.18) : preset.pixelRatio;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.renderer.shadowMap.enabled = preset.shadows;
    const isNight = this.state?.phase === "night" || (this.titlePreview && this.state?.mode === "survival");
    const dayExposure = this.effectiveQuality === "low" ? 0.98 : 0.94;
    this.renderer.toneMappingExposure = isNight ? dayExposure * (1.08 + (this.nightBrightness - 1) * 0.55) : dayExposure;
    if (this.sunLight) {
      this.sunLight.castShadow = preset.shadows;
      this.sunLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    if (this.weatherParticles) {
      const positions = this.weatherParticles.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      const profile = regionVisualProfiles[this.state?.regionId ?? "oasis"] ?? regionVisualProfiles.oasis!;
      const visible = Math.round(preset.weatherParticles * profile.weatherDensity);
      this.weatherParticles.geometry.setDrawRange(0, positions ? Math.min(positions.count, visible) : 0);
    }
    this.syncQualityButtons();
  }

  private setQualityTier(tier: QualityTier): void {
    if (!["auto", "low", "medium", "high"].includes(tier)) return;
    this.preferredQuality = tier;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.effectiveQuality = tier === "auto"
      ? (coarsePointer || window.innerWidth < 820 ? "medium" : "high")
      : tier;
    if (this.state) this.state.qualityTier = tier;
    localStorage.setItem("silk-road-bastion:quality", tier);
    this.applyQuality();
    const current = this.effectiveQuality === "high" ? "高" : this.effectiveQuality === "medium" ? "中" : "低";
    this.setPrompt("ph-gauge", `画质：${tier === "auto" ? `自动（当前${current}）` : current}`);
    this.save();
  }

  private syncQualityButtons(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-quality]").forEach((button) => {
      const active = button.dataset.quality === this.preferredQuality;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  private updateGateAnimation(delta: number): void {
    const next = THREE.MathUtils.damp(this.gateClosed, this.gateCloseTarget, 7.5, delta);
    if (Math.abs(next - this.gateClosed) < 0.0002) return;
    this.gateClosed = next;
    this.updateGateDoors();
  }

  private updateTitlePreview(): void {
    const time = performance.now() * 0.001;
    for (const actor of this.titleActors) {
      const phase = time * actor.speed + actor.object.id * 0.07;
      actor.object.position.z = actor.origin.z + Math.sin(phase) * actor.amplitude;
      actor.object.position.x = actor.origin.x + Math.sin(phase * 0.64) * 0.34;
      actor.object.rotation.y = Math.PI + Math.sin(phase) * 0.12;
    }
  }

  private updateGateDoors(): void {
    if (!this.gateObject) return;
    const left = this.gateObject.getObjectByName("gate-left");
    const right = this.gateObject.getObjectByName("gate-right");
    const openAngle = Math.PI * 0.38;
    if (left) left.rotation.y = -openAngle * (1 - this.gateClosed);
    if (right) right.rotation.y = openAngle * (1 - this.gateClosed);
  }

  private updatePlayer(delta: number): void {
    if (!this.state || !this.playerRig) return;
    this.playerFootstepCooldown = Math.max(0, this.playerFootstepCooldown - delta);
    // 桌面与网页版均以鼠标点地/滚轮为主；触控端才会在按住拖动时临时提供方向向量。
    const direction = new THREE.Vector3(this.mobileVector.x, 0, this.mobileVector.y);
    if (direction.lengthSq() < 0.02 && this.clickTarget) {
      direction.copy(this.clickTarget).sub(this.playerRig.root.position).setY(0);
      if (direction.length() < 0.45) {
        this.clickRoute.shift();
        this.clickTarget = this.clickRoute[0]?.clone() ?? null;
        if (!this.clickTarget) this.clearMoveRouteGuide();
      }
    } else if (direction.lengthSq() >= 0.02) {
      this.clickTarget = null;
      this.clickRoute = [];
      this.clearMoveRouteGuide();
    }
    const moving = direction.lengthSq() > 0.02;
    this.playerRig.setMoving(moving);
    // 寻路恰好结束时角色已经静止；采集判定不能跟着移动逻辑一起提前 return，
    // 否则会出现“已经站在倒木/岩簇旁边，却永远不结算”的顽固问题。
    if (!moving) {
      this.autoInteract();
      return;
    }
    direction.normalize();
    const previous = this.playerRig.root.position.clone();
    const speed = this.state.mode === "training"
      ? (this.state.adventure?.moveSpeed ?? 6.8)
      : 6.8 * (this.state.relics.includes("speed") ? 1.12 : 1);
    this.playerRig.root.position.addScaledVector(direction, speed * delta);
    this.playerRig.root.rotation.y = Math.atan2(direction.x, direction.z);
    this.resolvePlayerBounds(previous);
    this.playerRig.root.position.y = this.isInsideFort(this.playerRig.root.position)
      ? 0
      : this.terrainHeightAt(this.playerRig.root.position.x, this.playerRig.root.position.z);
    if (this.playerFootstepCooldown <= 0 && previous.distanceToSquared(this.playerRig.root.position) > 0.0025) {
      this.playerFootstepCooldown = this.isInsideFort(this.playerRig.root.position) ? 0.32 : 0.4;
      this.sound.footstep(this.isInsideFort(this.playerRig.root.position));
    }
    this.state.player.position.x = this.playerRig.root.position.x;
    this.state.player.position.z = this.playerRig.root.position.z;
    this.autoInteract();
  }

  /**
   * 鼠标/触控点选不再尝试穿过城墙：只有跨越院内与城外时才补上城门前后的两个路径点。
   * 城外开阔区域默认直达；商道负责方向感，不再把采集强行变成固定跑道。
   */
  private setMoveTarget(target: THREE.Vector3, followTradeRoad = false): void {
    if (!this.playerRig || !this.state) return;
    const destination = target.clone();
    if (this.state.mode !== "training") {
      destination.x = THREE.MathUtils.clamp(destination.x, -61, 61);
      destination.z = THREE.MathUtils.clamp(destination.z, -71, 41);
      if (!this.isNavigablePoint(destination) && !this.isInsideFort(destination)) {
        this.selectedResourceId = null;
        this.showBoundaryHint("该位置被地形阻挡，请点击浅色商道或发光采集标记");
        return;
      }
    }
    const startInside = this.isInsideFort(this.playerRig.root.position);
    const targetInside = this.isInsideFort(destination);
    const route: THREE.Vector3[] = [];
    if (this.state.mode !== "training" && startInside !== targetInside) {
      // 门内外留出间距，防止角色在城门碰撞体边沿往返抖动。
      route.push(new THREE.Vector3(0, 0, startInside ? -8.8 : -15.1));
      route.push(new THREE.Vector3(0, 0, startInside ? -15.1 : -8.8));
    }
    if (this.state.mode !== "training" && !targetInside) {
      const navigationStart = route.at(-1) ?? this.playerRig.root.position;
      const navigation = this.findGroundPath(navigationStart, destination);
      if (!navigation.length) {
        this.selectedResourceId = null;
        this.showBoundaryHint("当前目标不可达，已取消移动");
        return;
      }
      // 事件仍可偏向商道，但最终以碰撞网格给出的可达最短路为准，不再强迫角色来回跑固定折线。
      if (followTradeRoad && navigation.length === 1 && this.tradeRoadWaypoints(destination).every((point) => this.isNavigablePoint(point))) {
        route.push(...navigation);
      } else route.push(...navigation);
    } else {
      route.push(destination);
    }
    this.clickRoute = route;
    this.clickTarget = route[0]!.clone();
    this.drawMoveRouteGuide(this.playerRig.root.position, route);
  }

  /**
   * 资源模型本身是实体障碍，直接把寻路终点放在模型中心会让角色在最后一步持续顶住模型。
   * 因而终点落在资源发光环的入口侧：保持可自动采集，也不会再出现“点中了却走不到”的错觉。
   */
  private setResourceTarget(resource: ResourceNode): void {
    if (!this.playerRig) return;
    const interactionAnchor = oasisInteractionAnchors["resource-wide"]!;
    if (resource.position.distanceTo(this.playerRig.root.position) < interactionAnchor.radius + 1.1) {
      this.collectResource(resource);
      return;
    }
    this.selectedResourceId = resource.id;
    const origin = this.playerRig.root.position.clone().setY(0);
    const vector = resource.position.clone().sub(origin).setY(0);
    if (vector.lengthSq() < 0.02) {
      this.setMoveTarget(resource.position);
      return;
    }
    const preferred = resource.position.clone().addScaledVector(vector.normalize(), -interactionAnchor.radius - 0.35).setY(0);
    // 地貌装饰会随区域变化。若资源入口恰好落在岩石或水域边缘，从资源周围挑选
    // 距玩家最近的可达入口，避免角色在模型边缘原地顶住或反复绕行。
    const candidates = [preferred];
    for (const radius of [interactionAnchor.radius + 0.35, interactionAnchor.radius + 0.9, interactionAnchor.radius + 1.55]) {
      for (let index = 0; index < 20; index += 1) {
        const angle = index / 20 * Math.PI * 2;
        candidates.push(resource.position.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)));
      }
    }
    // “离玩家最近”不等于真正可到达。逐个候选检查完整路径，选择总路程最短的接触点；
    // 这样角落资源会从开放一侧接近，不会再在树、岩石或水渠边缘原地顶住。
    const routed = candidates
      .filter((candidate) => this.isNavigablePoint(candidate))
      .map((candidate) => {
        const route = this.findGroundPath(origin, candidate);
        let length = 0;
        let cursor = origin;
        for (const point of route) { length += cursor.distanceTo(point); cursor = point; }
        return { candidate, route, length };
      })
      .filter((entry) => entry.route.length > 0)
      .sort((a, b) => a.length - b.length);
    const approach = routed[0]?.candidate;
    if (!approach) {
      this.selectedResourceId = null;
      this.showBoundaryHint("这处材料被地貌封住，已自动标记为不可采；刷新场景后会迁到开放位置");
      return;
    }
    this.setMoveTarget(approach);
  }

  /**
   * 少量绕行节点只保留给未来需要的护送/自动导航事件；普通资源点使用直达操作。
   * 资源本身避开了大障碍，因此玩家不会再为了采一堆材料跑固定折返路线。
   */
  private tradeRoadWaypoints(destination: THREE.Vector3): THREE.Vector3[] {
    const left = destination.x < -10;
    const right = destination.x > 10;
    if (!left && !right) return [];
    const side = left ? -1 : 1;
    if (destination.z < -27) return [new THREE.Vector3(side * 13.4, 0, -30.2)];
    const outer = new THREE.Vector3(side * 23, 0, -20);
    if (destination.z > -11) return [new THREE.Vector3(side * 11.5, 0, -19.2), outer, new THREE.Vector3(side * 28, 0, -13)];
    return [new THREE.Vector3(side * 11.5, 0, -19.2), outer];
  }

  /**
   * 小型网格导航只在玩家点击时运行，不占用逐帧性能。它会绕过岩群、水域和围墙，
   * 让“点资源自动过去”与场景可达性一致；路径随后被压缩成少量转折点。
   */
  private findGroundPath(start: THREE.Vector3, destination: THREE.Vector3): THREE.Vector3[] {
    const cell = 2.2;
    const minX = -62;
    const minZ = -72;
    const toGrid = (point: THREE.Vector3): [number, number] => [Math.round((point.x - minX) / cell), Math.round((point.z - minZ) / cell)];
    const toWorld = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(minX + x * cell, 0, minZ + z * cell);
    const [startX, startZ] = toGrid(start);
    const [goalX, goalZ] = toGrid(destination);
    const key = (x: number, z: number): string => `${x}:${z}`;
    const frontier: Array<{ x: number; z: number; score: number }> = [{ x: startX, z: startZ, score: 0 }];
    const cameFrom = new Map<string, string>();
    const cost = new Map<string, number>([[key(startX, startZ), 0]]);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    let found = false;
    for (let guard = 0; frontier.length && guard < 2600; guard += 1) {
      frontier.sort((a, b) => a.score - b.score);
      const current = frontier.shift()!;
      if (current.x === goalX && current.z === goalZ) { found = true; break; }
      for (const [dx, dz] of directions) {
        const nx = current.x + dx;
        const nz = current.z + dz;
        const point = toWorld(nx, nz);
        if (!this.isNavigablePoint(point) && !(nx === goalX && nz === goalZ)) continue;
        const nextKey = key(nx, nz);
        const nextCost = (cost.get(key(current.x, current.z)) ?? 0) + (dx && dz ? 1.42 : 1);
        if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue;
        cost.set(nextKey, nextCost);
        cameFrom.set(nextKey, key(current.x, current.z));
        const heuristic = Math.hypot(goalX - nx, goalZ - nz);
        frontier.push({ x: nx, z: nz, score: nextCost + heuristic });
      }
    }
    if (!found) return [];
    const cells: Array<[number, number]> = [];
    let cursor = key(goalX, goalZ);
    while (cursor !== key(startX, startZ) && cells.length < 240) {
      const [x, z] = cursor.split(":").map(Number) as [number, number];
      cells.push([x, z]);
      const previous = cameFrom.get(cursor);
      if (!previous) break;
      cursor = previous;
    }
    cells.reverse();
    const raw = cells.map(([x, z]) => toWorld(x, z));
    raw[raw.length - 1] = destination;
    const segmentIsClear = (from: THREE.Vector3, to: THREE.Vector3): boolean => {
      const distance = from.distanceTo(to);
      const steps = Math.max(1, Math.ceil(distance / 1.05));
      for (let step = 1; step < steps; step += 1) {
        const sample = from.clone().lerp(to, step / steps);
        if (!this.isNavigablePoint(sample)) return false;
      }
      return true;
    };
    // A* 保证可达，再以可见线段贪心压缩。开放地面会直接抄近路，只有岩群、
    // 水渠和城墙真正挡路时才留下转折，避免网格路径造成来回折线。
    const smoothed: THREE.Vector3[] = [];
    let anchor = start.clone().setY(0);
    let cursorIndex = 0;
    while (cursorIndex < raw.length) {
      let furthest = cursorIndex;
      for (let candidate = raw.length - 1; candidate > cursorIndex; candidate -= 1) {
        if (segmentIsClear(anchor, raw[candidate]!)) { furthest = candidate; break; }
      }
      const next = raw[furthest]!;
      smoothed.push(next);
      anchor = next;
      cursorIndex = furthest + 1;
    }
    return smoothed;
  }

  /** 仅把画面中确实存在的大型地貌登记为阻挡，避免“看似空地却走不过去”。 */
  private sceneryBlockers(): Array<[number, number, number]> {
    if (this.state?.regionId === "oasis") return [[-23, -36, 6.6], [-34, -42, 1.8], [-42, -47, 1.6]];
    if (this.state?.regionId === "mist") return [[22, -37, 7.4], [-23, -24, 2.3], [20, -26, 2.3], [-27, -36, 2.3]];
    if (this.state?.regionId === "canyon") return [
      [-49, -57, 3.2], [-36, -61, 3.5], [36, -58, 2.9], [49, -53, 2.7],
      [-42.4, -47.2, 2], [-39.2, -42.9, 1.8], [-34.8, -40.6, 2.2], [-29.8, -41.8, 1.9], [-25.9, -45.9, 2]
    ];
    if (this.state?.regionId === "stardust") return [[-21, -25, 1.6], [22, -27, 1.6], [-17, -38, 1.6], [18, -40, 1.6]];
    return [];
  }

  private isNavigablePoint(point: THREE.Vector3): boolean {
    if (point.x < -62 || point.x > 62 || point.z < -72 || point.z > 42) return false;
    const backZ = this.fortBackZ();
    const halfWidth = this.fortHalfWidth();
    if (point.z > -13.4 && point.z < -10.1 && Math.abs(point.x) > 3.05 && Math.abs(point.x) < halfWidth + 1.2) return false;
    if (Math.abs(point.x) > halfWidth - 1.9 && Math.abs(point.x) < halfWidth + 1.4 && point.z > -12.8 && point.z < backZ + 1.2) return false;
    if (point.z > backZ - 1.2 && point.z < backZ + 1.4 && Math.abs(point.x) < halfWidth + 1.2) return false;
    return !this.sceneryBlockers().some(([x, z, radius]) => Math.hypot(point.x - x, point.z - z) < radius);
  }

  /** 用少量地面箭头表达实际会走的路线，尤其在穿过城门时让玩家知道不是卡住。 */
  private drawMoveRouteGuide(start: THREE.Vector3, route: THREE.Vector3[]): void {
    this.clearMoveRouteGuide();
    const guide = new THREE.Group();
    guide.name = "move-route-guide";
    const material = new THREE.MeshBasicMaterial({ color: 0xe0b457, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.3);
    shape.lineTo(-0.2, -0.22);
    shape.lineTo(0.2, -0.22);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    let cursor = start.clone().setY(0.09);
    let arrows = 0;
    for (const point of route) {
      const flatPoint = point.clone().setY(0.09);
      const segment = flatPoint.clone().sub(cursor).setY(0);
      const length = segment.length();
      const steps = Math.min(4, Math.floor(length / 3.6));
      for (let step = 1; step <= steps && arrows < 8; step += 1) {
        const arrow = new THREE.Mesh(geometry, material);
        arrow.position.copy(cursor).addScaledVector(segment, step / (steps + 1));
        arrow.rotation.x = -Math.PI / 2;
        arrow.rotation.z = -Math.atan2(segment.x, segment.z);
        arrow.raycast = () => undefined;
        guide.add(arrow);
        arrows += 1;
      }
      cursor = flatPoint;
    }
    this.world.add(guide);
    this.moveRouteGuide = guide;
  }

  private clearMoveRouteGuide(): void {
    if (this.moveRouteGuide) this.removeWorldObject(this.moveRouteGuide);
    this.moveRouteGuide = undefined;
  }

  private resolvePlayerBounds(previous: THREE.Vector3): void {
    if (!this.playerRig) return;
    const position = this.playerRig.root.position;
    if (this.state?.mode === "training") {
      position.x = THREE.MathUtils.clamp(position.x, -24, 24);
      position.z = THREE.MathUtils.clamp(position.z, -24, 24);
      return;
    }
    const beforeClamp = position.clone();
    position.x = THREE.MathUtils.clamp(position.x, -62, 62);
    position.z = THREE.MathUtils.clamp(position.z, -72, 42);
    if (position.distanceToSquared(beforeClamp) > 0.02) this.showBoundaryHint("前方是未探索的荒漠边缘，请沿商道或岩群绕行");
    const crossedFront = (previous.z > -10.4 && position.z <= -10.4) || (previous.z < -13.1 && position.z >= -13.1);
    if (crossedFront && Math.abs(position.x) > 3.2) {
      position.copy(previous);
      this.showBoundaryHint("城墙不能穿越，前往中央城门出入驿站");
    }
    // 玩家真正第一次出城时，把“能走到哪、什么能捡”与眼前的场景标记对应起来。
    // 这比在屏幕角落长期放一段说明文字更不打断守城节奏。
    if (this.isInsideFort(previous) && !this.isInsideFort(position) && Math.abs(position.x) <= 3.2) {
      this.setPrompt("ph-compass", "已出城：浅色商道可走；带发光环和悬浮菱标的木材、石料、机巧可采集");
    }
    const backZ = this.fortBackZ();
    const halfWidth = this.fortHalfWidth();
    if (Math.abs(position.x) > halfWidth - 1.6 && position.z > -11 && position.z < backZ + 1) {
      position.copy(previous);
      this.showBoundaryHint("围墙在此封闭，沿道路回到城门");
    }
    if (position.z > backZ - 1 && Math.abs(position.x) < halfWidth + 0.2) {
      position.copy(previous);
      this.showBoundaryHint("主帐后方是封闭营地，向两侧空地移动");
    }
    if (this.sceneryBlockers().some(([x, z, radius]) => Math.hypot(position.x - x, position.z - z) < radius - 0.35)) {
      position.copy(previous);
      this.showBoundaryHint("岩群、水渠和树丛是实体障碍，请从旁边绕过");
    }
  }

  private showBoundaryHint(text: string): void {
    if (this.boundaryHintCooldown > 0) return;
    this.boundaryHintCooldown = 1.6;
    this.setPrompt("ph-signpost", text);
  }

  private autoInteract(): void {
    if (!this.playerRig || !this.state || this.state.phase !== "day") return;
    // A selected resource owns the current route. Previously the player could pass
    // another pile, auto-collect it, and have that incidental pickup cancel the route
    // while the original target stayed selected on the opposite side of the map.
    const selected = this.selectedResourceId
      ? this.resources.find((resource) => resource.id === this.selectedResourceId)
      : undefined;
    const near = selected
      ? selected.position.distanceTo(this.playerRig.root.position) < 6.1 ? selected : undefined
      : this.resources.find((resource) => resource.position.distanceTo(this.playerRig!.root.position) < 3.4);
    if (near) {
      this.collectResource(near);
      return;
    }
    const objective = this.state.fieldObjective;
    if (objective && !objective.completed) {
      const distance = this.playerRig.root.position.distanceTo(new THREE.Vector3(objective.position.x, 0, objective.position.z));
      if (distance < 3.2) this.completeFieldObjective();
    }
  }

  private interact(): void {
    if (!this.state || !this.playerRig) return;
    if (this.state.phase === "day") {
      const near = this.resources.find((resource) => resource.position.distanceTo(this.playerRig!.root.position) < 4.6);
      if (near) {
        this.collectResource(near);
        return;
      }
      const coreDistance = this.playerRig.root.position.distanceTo(CORE_POSITION);
      const coreCost = this.coreRepairCost();
      if (coreDistance < 4.5 && this.state.coreHp < this.state.coreMaxHp && canAfford(this.state.resources, coreCost)) {
        pay(this.state.resources, coreCost);
        this.state.coreHp = Math.min(this.state.coreMaxHp, this.state.coreHp + 32);
        this.coreStatusTimer = 2;
        this.sound.build();
        this.setPrompt("ph-house-line", `主帐已修缮 32 点耐久，支付 ${this.formatCost(coreCost)}`);
        return;
      } else if (coreDistance < 4.5 && this.state.coreHp < this.state.coreMaxHp) {
        this.setPrompt("ph-house-line", `修缮主帐需要 ${this.formatCost(coreCost)}`);
        return;
      }
    }
    const distanceGate = this.playerRig.root.position.distanceTo(new THREE.Vector3(0, 0, -10));
    if (distanceGate < 4.8 && this.state.gateHp < this.state.gateMaxHp) {
      this.repairGate();
      return;
    }
    this.action();
  }

  private collectResource(resource: ResourceNode): void {
    if (!this.state) return;
    const key: ResourceKey = resource.type;
    let amount = resource.amount;
    if (key === "stone" && this.state.regionId === "canyon") amount *= 2;
    if (key === "gear" && this.state.regionId === "stardust") amount += 2;
    const gatherStacks = this.state.relics.filter((entry) => entry === "gather").length;
    amount = Math.round(amount * (1 + gatherStacks * 0.2));
    this.state.resources[key] += amount;
    this.state.gathered.push(resource.id);
    this.removeWorldObject(resource.object);
    this.resourceLabels.get(resource.id)?.remove();
    this.resourceLabels.delete(resource.id);
    this.resources = this.resources.filter((node) => node !== resource);
    const completedSelectedRoute = this.selectedResourceId === resource.id;
    if (completedSelectedRoute) this.selectedResourceId = null;
    if (completedSelectedRoute || !this.selectedResourceId) {
      this.clickTarget = null;
      this.clickRoute = [];
      this.clearMoveRouteGuide();
    }
    this.sound.coin();
    this.burst(resource.position.clone().setY(1.2), regionById(this.state.regionId).accent, 10);
    this.setPrompt(key === "wood" ? "ph-tree" : key === "stone" ? "ph-mountains" : "ph-gear-six", `获得 ${amount}${key === "wood" ? " 木材" : key === "stone" ? " 石料" : " 机巧"}`);
    if (this.state.tutorialStep === 0) {
      // 城外采集是可选收益，不能把第一次的“商栈 → 床弩”教学顺序跳掉。
      this.setPrompt("ph-storefront", "材料已送回驿站。选择底部商栈，再点后院发光地基");
    }
    this.updateHud(true);
  }

  private completeFieldObjective(): void {
    if (!this.state?.fieldObjective || this.state.fieldObjective.completed) return;
    const objective = this.state.fieldObjective;
    objective.completed = true;
    const eventBonus = 1 + this.state.relics.filter((entry) => entry === "event-yield").length * 0.2;
    for (const [key, value] of Object.entries(objective.reward)) {
      this.state.resources[key as ResourceKey] += Math.round((value ?? 0) * eventBonus);
    }
    if (this.fieldObject) {
      this.burst(this.fieldObject.position.clone().setY(2), regionById(this.state.regionId).accent, 18);
      this.removeWorldObject(this.fieldObject);
      this.fieldObject = undefined;
    }
    if (objective.type === "elite" || objective.type === "scout") this.state.scoutIntel = Math.max(this.state.scoutIntel ?? 0, 1);
    if (objective.type === "aid") this.state.reinforcementNights = Math.max(this.state.reinforcementNights ?? 0, 1);
    if (objective.type === "artisan") {
      this.state.gateHp = Math.min(this.state.gateMaxHp, this.state.gateHp + 38);
      this.gateStatusTimer = 2.5;
    }
    if (objective.type === "repair") {
      this.state.gateHp = Math.min(this.state.gateMaxHp, this.state.gateHp + 24);
      this.gateStatusTimer = 2.5;
    }
    this.state.eventsCompleted += 1;
    const names = { mine: "矿脉开采", ruin: "遗迹搜索", caravan: "商队护送", elite: "精英哨所", artisan: "流浪匠师", aid: "援军营地", scout: "营地侦察", repair: "机关维修", cache: "商路密匣" };
    this.sound.coin();
    const bonus = objective.type === "elite"
      ? "，下一夜敌军规模已被侦察削减"
      : objective.type === "scout"
        ? "，下一夜敌军规模已被侦察削减"
        : objective.type === "aid"
        ? "，两名守卫会在下一夜加入防线"
        : objective.type === "artisan"
          ? "，城门额外修复 38 点耐久"
          : objective.type === "repair"
            ? "，城门额外修复 24 点耐久"
          : "，奖励已送回驿站";
    this.setPrompt("ph-check-circle", `${names[objective.type]}完成${bonus}`);
    this.updateHud(true);
    this.save();
  }

  private action(): void {
    if (!this.state || !this.playerRig || this.state.player.attackCooldown > 0) return;
    this.state.player.attackCooldown = 0.72;
    this.playerRig.attack();
    if (this.state.mode === "training" && this.state.adventure) {
      const adventure = this.state.adventure;
      const targets = this.state.enemies
        .map((enemy) => ({ enemy, visual: this.enemyObjects.get(enemy.id) }))
        .filter((entry): entry is { enemy: EnemyState; visual: EnemyVisual } => Boolean(entry.visual))
        .filter((entry) => entry.visual.object.position.distanceTo(this.playerRig!.root.position) <= adventure.attackRange)
        .sort((a, b) => a.visual.object.position.distanceTo(this.playerRig!.root.position) - b.visual.object.position.distanceTo(this.playerRig!.root.position));
      const primary = targets[0];
      if (!primary) {
        this.sound.tone(175, 0.12, "triangle", 0.025);
        return;
      }
      const hero = adventure.hero;
      const damage = adventure.attack * (hero === "guardian" ? 1.15 : hero === "ranger" ? 1 : 0.92);
      if (hero === "artificer") {
        for (const target of targets) {
          if (target.visual.object.position.distanceTo(primary.visual.object.position) > 2.55) continue;
          target.enemy.hp -= damage;
          this.reactToEnemyHit(target.visual, 0.12);
          target.enemy.slowedUntil = performance.now() + 720;
          target.visual.flash = 0.12;
        }
      } else {
        primary.enemy.hp -= damage;
        this.reactToEnemyHit(primary.visual, 0.15);
      }
      const direction = primary.visual.object.position.clone().sub(this.playerRig.root.position).setY(0).normalize();
      this.playerRig.root.rotation.y = Math.atan2(direction.x, direction.z);
      if (hero === "ranger" || hero === "artificer") this.fireProjectile(this.playerRig.root.position.clone().setY(2), primary.visual.object.position.clone().setY(1.2), hero === "artificer" ? 0x73aab5 : 0xe8c47a);
      this.burst(primary.visual.object.position.clone().setY(1.2), hero === "artificer" ? 0x73aab5 : 0xe2ad55, hero === "guardian" ? 8 : 5);
      this.sound.tone(255, 0.14, "triangle", 0.04);
      return;
    }
    let hit = false;
    for (const enemy of this.state.enemies) {
      const visual = this.enemyObjects.get(enemy.id);
      if (!visual || visual.object.position.distanceTo(this.playerRig.root.position) > 3.6) continue;
      const playerDamage = 34 * (1 + this.state.relics.filter((entry) => entry === "player-damage").length * 0.2);
      enemy.hp -= this.state.mode === "training" ? (this.state.adventure?.attack ?? 34) : playerDamage;
      this.reactToEnemyHit(visual, 0.15);
      this.burst(visual.object.position.clone().setY(1.2), 0xe2ad55, 6);
      hit = true;
      break;
    }
    this.sound.tone(hit ? 240 : 175, 0.14, "triangle", 0.035);
  }

  private updateCamera(delta: number): void {
    if (!this.playerRig) return;
    const playerPosition = this.playerRig.root.position;
    // 院内保持稳定的守城视轴；走到城外后更积极跟随，避免左/右侧角色被城墙和植被挤到视野边缘。
    const outsideFort = this.state?.mode !== "training" && !this.isInsideFort(playerPosition);
    // 院内保持基地总览；出城后采用安全区跟随。角色在安全区内移动不推镜头，
    // 越过边缘才平滑追随，避免移动时视野一顿一顿或左右漂移。
    const aspect = this.camera.aspect;
    if (outsideFort) {
      const target = new THREE.Vector3(playerPosition.x, 1.25, playerPosition.z - 1.5);
      const offset = target.clone().sub(this.cameraFocus).setY(0);
      const deadZone = aspect < 0.82 ? 2.2 : aspect > 1.8 ? 4.8 : 3.6;
      const distance = offset.length();
      if (distance > deadZone) this.cameraFocus.addScaledVector(offset.normalize(), distance - deadZone);
    } else {
      const stableBase = new THREE.Vector3(playerPosition.x * 0.12, 1.25, -0.9 + playerPosition.z * 0.08);
      this.cameraFocus.lerp(stableBase, 1 - Math.pow(0.006, delta));
    }
    const focus = this.cameraFocus;
    const desired = new THREE.Vector3(
      focus.x,
      31 + (this.cameraDistance - 32) * 0.34,
      focus.z + this.cameraDistance + 5
    );
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - delta);
      desired.x += (Math.random() - 0.5) * this.cameraShake * 1.2;
      desired.y += (Math.random() - 0.5) * this.cameraShake * 0.7;
    }
    this.camera.position.lerp(desired, 1 - Math.pow(0.002, delta));
    this.camera.lookAt(focus.x, 1.35, focus.z);
    this.updateOccluders(playerPosition, delta);
  }

  /** 注册有高度的场景实体；地面、功能区提示和交互光环不参与遮挡判定。 */
  private refreshOccluders(): void {
    this.registerOccluders(this.world);
  }

  private registerOccluders(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh)
        || object.userData.ground
        || object.userData.padIndex !== undefined
        || object.userData.occlusionRegistered
        || this.findUserData(object, "player")
        // Buildings and the core must keep a complete silhouette. Partial or even
        // whole-building transparency reads as missing walls/roofs in an isometric
        // game. Camera-safe placement and wall fading handle visibility instead.
        || this.findUserData(object, "buildingId")
        || this.findUserData(object, "core")
        || this.findUserData(object, "resourceId")
      ) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.max.y < 0.55) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const materials = source.map((material) => material.clone());
      object.material = Array.isArray(object.material) ? materials : materials[0]!;
      object.userData.occlusionRegistered = true;
      const buildingId = this.findUserData(object, "buildingId");
      const groupKey = typeof buildingId === "string"
        ? `building:${buildingId}`
        : this.findUserData(object, "core")
          ? "core"
          : this.findUserData(object, "gate")
            ? "gate"
            : `mesh:${object.id}`;
      this.occluderMeshes.push({ mesh: object, materials, opacities: materials.map((material) => material.opacity), groupKey });
    });
  }

  /**
   * 相机至行者的射线命中围墙、树、岩石或建筑时，将命中的实体平滑淡出。
   * 这样不改变地形碰撞，也不会把玩家在城外的左侧路线藏起来。
   */
  private updateOccluders(playerPosition: THREE.Vector3, delta: number): void {
    if (!this.occluderMeshes.length) return;
    this.occlusionRefreshCooldown -= delta;
    if (this.occlusionRefreshCooldown <= 0) {
      this.occlusionRefreshCooldown = 0.085;
      const eyeTarget = playerPosition.clone().setY(1.25);
      const rayDirection = eyeTarget.clone().sub(this.camera.position);
      const targetDistance = rayDirection.length();
      this.occludedMeshes.clear();
      if (targetDistance >= 0.2) {
        this.occlusionRaycaster.set(this.camera.position, rayDirection.normalize());
        const intersections = this.occlusionRaycaster.intersectObjects(this.occluderMeshes.map((entry) => entry.mesh), false);
        const hitGroups = new Set<string>();
        for (const hit of intersections) {
          if (hit.distance >= targetDistance - 0.72) break;
          const entry = this.occluderMeshes.find((candidate) => candidate.mesh === hit.object);
          if (entry) hitGroups.add(entry.groupKey);
        }
        for (const entry of this.occluderMeshes) if (hitGroups.has(entry.groupKey)) this.occludedMeshes.add(entry.mesh);
      }
    }
    for (const entry of this.occluderMeshes) {
      // Fade a whole building coherently. Fading only the roof or one wall made complete
      // structures look broken, which is worse than a slightly stronger translucent shell.
      const targetOpacity = this.occludedMeshes.has(entry.mesh) ? 0.5 : 1;
      entry.materials.forEach((material, index) => {
        const baseOpacity = entry.opacities[index] ?? 1;
        const desiredOpacity = this.occludedMeshes.has(entry.mesh) ? Math.min(baseOpacity, targetOpacity) : baseOpacity;
        material.opacity = THREE.MathUtils.damp(material.opacity, desiredOpacity, 15, delta);
        material.transparent = material.opacity < 0.995 || baseOpacity < 0.995;
        material.depthWrite = material.opacity > 0.55;
      });
    }
  }

  private animateWorld(delta: number): void {
    this.worldAnimationAccumulator += delta;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const interval = 1 / (coarsePointer || this.canvas.clientWidth < 820 ? 24 : 30);
    if (this.worldAnimationAccumulator < interval) return;
    const animationDelta = Math.min(0.085, this.worldAnimationAccumulator);
    this.worldAnimationAccumulator = 0;
    const elapsed = performance.now() * 0.001;
    this.world.traverse((object) => {
      if (object.name === "flame") {
        object.scale.y = 0.86 + Math.sin(elapsed * 7 + object.id) * 0.18;
        object.rotation.y += animationDelta * 1.3;
      } else if (object.name === "fort-torch-light" && object instanceof THREE.PointLight && this.state?.phase === "night") {
        const base = Number(object.userData.baseIntensity ?? 2.65) * this.nightBrightness;
        object.intensity = base * (0.92 + Math.sin(elapsed * 8.2 + object.id) * 0.08);
      } else if (object.name === "core-crystal" || object.name === "artifact") {
        object.rotation.y += animationDelta * 0.7;
        object.position.y += Math.sin(elapsed * 2.1 + object.id) * 0.0016;
      } else if (object.name === "collectible-marker") {
        object.rotation.y += animationDelta * 0.95;
        const pulse = 1 + Math.sin(elapsed * 3.1 + object.id) * 0.08;
        object.scale.set(pulse, 1, pulse);
      } else if (object.name === "collectible-pulse") {
        const pulse = 0.92 + Math.sin(elapsed * 3.1 + object.id) * 0.2;
        object.scale.set(pulse, pulse, pulse);
        const material = object instanceof THREE.Mesh ? object.material as THREE.MeshBasicMaterial : undefined;
        if (material) material.opacity = 0.18 + Math.sin(elapsed * 3.1 + object.id) * 0.07;
      } else if (object.name === "collectible-beacon") {
        object.position.y = 3.06 + Math.sin(elapsed * 2.8 + object.id) * 0.16;
      } else if (object.name === "collectible-beam") {
        const material = object instanceof THREE.Mesh ? object.material as THREE.MeshBasicMaterial : undefined;
        if (material) material.opacity = 0.24 + Math.sin(elapsed * 2.8 + object.id) * 0.12;
      } else if (object.name === "fortification-marker") {
        const pulse = 1 + Math.sin(elapsed * (this.placingFortification ? 4.2 : 2.4) + object.id) * (this.placingFortification ? 0.16 : 0.09);
        object.scale.set(pulse, pulse, pulse);
        const material = object instanceof THREE.Mesh ? object.material as THREE.MeshBasicMaterial : undefined;
        if (material) material.opacity = (this.placingFortification ? 0.72 : 0.52) + Math.sin(elapsed * 2.4 + object.id) * 0.18;
      } else if (object.name === "fortification-signal") {
        object.rotation.y += animationDelta * 1.4;
        object.position.y = 5.62 + Math.sin(elapsed * 2.3 + object.id) * 0.16;
      } else if (object.name === "flyer-rotor") {
        object.rotation.y += animationDelta * 13;
      } else if (object.name.startsWith("boss-")) {
        let root: THREE.Object3D | null = object.parent;
        while (root && !root.userData.enemyId) root = root.parent;
        const action = String(root?.userData.bossAction ?? "advance");
        const telegraph = action !== "advance" && action !== "recover";
        if (object.name === "boss-kite-wing") {
          object.rotation.z = Math.sin(elapsed * (telegraph ? 8.5 : 4.2) + object.id) * (telegraph ? 0.32 : 0.12);
        } else if (object.name === "boss-kite-array") {
          object.rotation.y += animationDelta * (telegraph ? 2.8 : 0.55);
        } else if (object.name === "boss-fuse" && object instanceof THREE.Mesh) {
          const mat = object.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = telegraph ? 1.2 + Math.sin(elapsed * 12) * 0.5 : 0.28;
        } else if (object.name === "boss-shield") {
          object.rotation.z = telegraph ? Math.sin(elapsed * 7) * 0.09 : 0;
        } else if (object.name === "boss-beast-head") {
          object.rotation.x = telegraph ? -0.28 + Math.sin(elapsed * 9) * 0.08 : 0;
        }
      } else if (object.name === "expansion-pad-marker") {
        const pulse = 1 + Math.sin(elapsed * 2.1 + object.id) * 0.035;
        object.scale.set(pulse, pulse, pulse);
      } else if (object.name === "expansion-pad-signal") {
        object.rotation.y += animationDelta * 1.1;
        object.position.y = 2.32 + Math.sin(elapsed * 2.1 + object.id) * 0.08;
      } else if (object.userData.attackWeapon) {
        let root: THREE.Object3D | null = object.parent;
        while (root && !root.userData.characterRoot) root = root.parent;
        const until = Number(root?.userData.attackUntil ?? 0);
        if (until > performance.now()) {
          const strike = Math.sin(Math.min(1, Math.max(0, (until - performance.now()) / 0.32)) * Math.PI);
          object.rotation.x = -strike * 1.1;
        } else {
          object.rotation.x = 0;
        }
      } else if (typeof object.userData.limb === "string") {
        let root: THREE.Object3D | null = object.parent;
        while (root && !root.userData.characterRoot) root = root.parent;
        const moving = Boolean(root?.userData.moving);
        const attacking = Number(root?.userData.attackUntil ?? 0) > performance.now();
        const opposite = object.userData.limb === "right-arm" || object.userData.limb === "left-leg";
        const phase = elapsed * (moving ? 8.5 : 1.8) + (root?.id ?? 0);
        if (attacking && object.userData.limb === "right-arm") {
          // 右臂携带近战武器，短促前摆使命中、爆破和守卫攻击不再像静态碰撞。
          const strike = Math.sin(Math.min(1, Math.max(0, (Number(root?.userData.attackUntil) - performance.now()) / 0.34)) * Math.PI);
          object.rotation.x = -0.35 - strike * 1.18;
          object.rotation.z = 0.16;
        } else {
          object.rotation.z = object.userData.limb === "left-arm" ? -0.12 : object.userData.limb === "right-arm" ? 0.12 : 0;
          object.rotation.x = Math.sin(phase + (opposite ? Math.PI : 0)) * (moving ? 0.58 : 0.035);
        }
      }
    });
  }

  private updateWeather(delta: number): void {
    if (!this.weatherParticles) return;
    const phase = this.state
      ? (this.state.weatherPhase = (this.state.weatherPhase + delta) % (Math.PI * 2))
      : (this.previewWeatherPhase = (this.previewWeatherPhase + delta) % (Math.PI * 2));
    const profile = regionVisualProfiles[this.state?.regionId ?? this.activeVisualRegionId] ?? regionVisualProfiles.oasis!;
    const attribute = this.weatherParticles.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < attribute.count; index += 1) {
      let x = attribute.getX(index) + this.weatherVelocity.x * delta;
      let y = attribute.getY(index) + this.weatherVelocity.y * delta;
      let z = attribute.getZ(index) + this.weatherVelocity.z * delta;
      if (x > 66) x = -66;
      if (z > 48) z = -76;
      if (y > 16) y = profile.weather === "starlight" ? 0.8 : 1.2;
      if (profile.weather === "mist") y += Math.sin(phase + index * 0.37) * delta * 0.08;
      attribute.setXYZ(index, x, y, z);
    }
    attribute.needsUpdate = true;
    const material = this.weatherParticles.material as THREE.PointsMaterial;
    if (profile.weather === "starlight") material.opacity = 0.32 + Math.sin(phase * 1.7) * 0.12;
  }

  private updateDay(delta: number): void {
    if (!this.state) return;
    // 第一局先让玩家完成两项明确操作；教学不靠倒计时强推入夜，避免新手在未布防时失败。
    if (this.state.mode === "expedition" && !this.meta.seenTutorial && this.state.tutorialStep < 2) {
      this.state.phaseTime = this.state.dayLength;
      return;
    }
    this.state.phaseTime -= delta;
    const warningAt = this.state.relics.includes("warning") ? 11 : 8;
    if (!this.hornedThisDay && this.state.phaseTime <= warningAt && this.state.phaseTime > 0) {
      this.hornedThisDay = true;
      this.sound.horn();
      if (this.playerRig && !this.isInsideFort(this.playerRig.root.position)) {
        const distance = Math.round(this.playerRig.root.position.distanceTo(new THREE.Vector3(0, 0, -11)));
        this.setPrompt("ph-navigation-arrow", `回城号角已响，城门距你 ${distance}m`);
      } else {
        this.setPrompt("ph-door", "回城号角已响，城门即将关闭");
      }
    }
    if (this.state.phaseTime <= 0) this.startNight();
  }

  private economyRates(): { coin: number; wood: number; stone: number; gear: number } {
    if (!this.state) return { coin: 0, wood: 0, stone: 0, gear: 0 };
    const resilient = this.state.relics.includes("resilient");
    const efficiency = this.state.nightModifier?.production ?? 1;
    const tradeBonus = this.state.relics.filter((entry) => entry === "trade").length;
    const markets = this.state.buildings.filter((building) => building.type === "market" && (building.hp > 0 || resilient));
    const workshops = this.state.buildings.filter((building) => building.type === "workshop" && (building.hp > 0 || resilient));
    const currentMaterial = (["wood", "stone", "gear"] as const)[this.state.workshopRotation % 3]!;
    const marketIncome = markets.reduce((sum, building) => {
      const healthFactor = building.hp > 0 ? 1 : 0.5;
      const diminishing = 1 + Math.floor(Math.pow(Math.max(0, building.level - 1), 0.78));
      const caravanBonus = building.level >= 3 && this.activeSpecialization(building) === "caravan" ? 1 : 0;
      return sum + (diminishing + tradeBonus + caravanBonus) * healthFactor;
    }, 0);
    const workshopBonus = this.state.relics.filter((entry) => entry === "workshop").length;
    const moduleCoin = this.state.regionModule === "caravan-yard" ? 2 : 0;
    const rates = { coin: Math.ceil((1 + moduleCoin + marketIncome * (this.state.regionId === "oasis" ? 1.25 : 1)) * efficiency), wood: 0, stone: 0, gear: 0 };
    workshops.forEach((building) => {
      const healthFactor = building.hp > 0 ? 1 : 0.5;
      const amount = Math.max(1, Math.floor((1 + (building.level - 1) * 0.58 + workshopBonus) * healthFactor));
      const specialization = this.activeSpecialization(building);
      const material = specialization === "wood" || specialization === "stone" || specialization === "gear" ? specialization : currentMaterial;
      const specificBonus = this.state!.relics.filter((entry) => entry === `${material}-yield`).length;
      rates[material] += Math.ceil((amount + specificBonus) * efficiency);
    });
    if (rates.stone > 0 && workshops.length && this.state.regionId === "canyon") rates.stone += 1;
    if (rates.gear > 0 && this.state.regionId === "stardust") rates.gear *= 2;
    if (rates.gear > 0 && this.state.relics.includes("gear")) rates.gear *= 2;
    if (this.state.relics.includes("network")) rates.coin += 1;
    return rates;
  }

  private updateEconomy(delta: number): void {
    if (!this.state) return;
    this.state.productionTimer -= delta;
    this.economyCooldown = this.state.productionTimer;
    if (this.state.productionTimer <= 0) {
      this.state.productionTimer += 3;
      const rates = this.economyRates();
      for (const key of Object.keys(rates) as ResourceKey[]) {
        this.state.resources[key] += rates[key];
      }
      // 商栈把过量钱币转成真实订单：保留一笔建造储备，再按木材、石料、机巧轮换采购。
      // 远征贸易成本较低；极限守城的运输受压，单份订单更贵。
      const materialWeights = { wood: 1.2, stone: 1, gear: 0.65 } as const;
      const orderMaterial = (["wood", "stone", "gear"] as const)
        .slice()
        .sort((a, b) => this.state!.resources[a] / materialWeights[a] - this.state!.resources[b] / materialWeights[b])[0]!;
      const workingMarkets = this.state.buildings.filter((building) => building.type === "market" && building.hp > 0);
      for (const market of workingMarkets) {
        const specialization = market.level >= 3 ? this.activeSpecialization(market) : null;
        if (specialization === "caravan") continue;
        const units = specialization === "supply" ? 2 : 1;
        const unitCost = this.state.mode === "survival" ? 3 : 2;
        const reserve = 12 + Math.min(12, Math.floor(this.state.epoch / 3) * 2);
        const affordableUnits = Math.min(units, Math.max(0, Math.floor((this.state.resources.coin - reserve) / unitCost)));
        if (affordableUnits <= 0) continue;
        this.state.resources.coin -= affordableUnits * unitCost;
        this.state.resources[orderMaterial] += affordableUnits;
      }
      if (this.state.relics.includes("double-trade") && this.streams && this.streams.next("loot") < 0.18) {
        this.state.resources.coin += rates.coin;
        this.setPrompt("ph-storefront", "商栈完成大宗订单，钱币收益翻倍");
      }
      this.state.workshopRotation = (this.state.workshopRotation + 1) % 3;
      this.sound.production();
      const resourceHud = document.querySelector<HTMLElement>(".resource-hud");
      resourceHud?.classList.add("is-pulsing");
      window.setTimeout(() => resourceHud?.classList.remove("is-pulsing"), 180);
    }
  }

  private startNight(): void {
    if (!this.state || !this.streams) return;
    if (this.state.mode === "expedition" && !this.meta.seenTutorial && this.state.tutorialStep < 2) {
      this.setPrompt("ph-compass", this.state.tutorialStep === 0
        ? "先建造商栈，再开始第一夜"
        : "先建造床弩，再开始第一夜");
      return;
    }
    this.state.phase = "night";
    this.state.phaseTime = 0;
    this.state.recentDamage = 0;
    this.state.nightSpeed = 1;
    this.state.nightModifier ??= this.streams.pick("event", nightModifiersForEpoch(this.state.epoch));
    this.state.buildings.forEach((building) => {
      building.status ??= { productionPaused: false, targeted: false, lastHitAt: 0 };
      building.status.targeted = false;
    });
    this.selectedBuild = null;
    this.updatePreview();
    this.hud.context.classList.add("is-hidden");
    const defensePower = this.state.buildings.reduce((sum, building) => {
      const definition = buildings[building.type];
      if (!definition.attack || !definition.cooldown || building.hp <= 0) return sum;
      const rangeWeight = definition.range ? THREE.MathUtils.clamp(definition.range / 30, 0.65, 1.45) : 1;
      return sum + (definition.attack * weaponLevelPower(building.level) * weaponLevelRate(building.level) * rangeWeight) / definition.cooldown;
    }, 0);
    const directorGenerated = directorWave(
      {
        epoch: this.state.epoch,
        prosperity: this.state.prosperity,
        gateLevel: this.state.gateLevel,
        defensePower,
        recentDamage: this.state.recentDamage,
        mode: this.state.mode
      },
      regionById(this.state.regionId),
      this.streams
    );
    if (this.state.nightModifier?.id === "flying-raid" && this.state.epoch >= 4) {
      directorGenerated.splice(1, 0, "flyer", "flyer");
    }
    if (this.state.nightModifier?.id === "looter-call" && this.state.epoch >= 3) {
      directorGenerated.splice(1, 0, "looter", "looter");
    }
    if ((this.state.scoutIntel ?? 0) > 0 && directorGenerated.length > 4) {
      directorGenerated.splice(-Math.max(1, Math.ceil(directorGenerated.length * 0.18)));
      this.state.scoutIntel = 0;
    }
    const tutorialWave = this.state.tutorialStep < 3;
    const bossKind = tutorialWave ? null : bossForNight(this.state.epoch, regionById(this.state.regionId));
    this.state.bossKind = bossKind;
    if (bossKind) {
      directorGenerated.unshift(bossEnemyType(bossKind));
      if (bossKind === "kite-swarm") directorGenerated.splice(1, 0, "flyer", "flyer");
      this.sound.warning();
      const bossNames: Record<BossKind, string> = {
        "shield-commander": "盾卫统领",
        "sapper-captain": "爆破队长",
        "kite-swarm": "机械鸢群",
        "siege-beast": "攻城巨兽"
      };
      this.setPrompt("ph-warning-diamond", `首领预警：${bossNames[bossKind]}即将抵达`);
    }
    const wave = tutorialWave ? ["raider", "raider", "raider"] as const : directorGenerated;
    this.spawnQueue = wave.map((type, index) => {
      const definition = enemies[type];
      const isBoss = Boolean(bossKind && index === 0);
      const elite = isBoss || (this.state!.epoch % 5 === 0 && index < 2);
      // 首次三人教学波保留足够时间让玩家看见“接近、射击、撞门、击退”的完整反馈，
      // 同时降低伤害，避免为了延长演示而把新手直接打崩。
      const tutorialHealth = tutorialWave ? 2.2 : 1;
      const tutorialDamage = tutorialWave ? 0.35 : 1;
      const healthScale = enemyHealthScale(this.state!.epoch, this.state!.mode) * tutorialHealth * (isBoss ? 3.6 : elite ? 1.5 : 1);
      const combatSpeed = definition.speed
        * (1 + Math.min(0.18, this.state!.epoch * 0.009))
        * (this.state!.regionId === "mist" ? 0.88 : 1)
        * (this.state!.nightModifier?.enemySpeed ?? 1);
      const readiness = this.state!.mode === "survival" ? this.state!.readinessPressure : 0;
      const damageScale = (1 + 0.052 * Math.max(0, this.state!.epoch - 1) + 0.0045 * Math.pow(Math.max(0, this.state!.epoch - 1), 1.35)) * (1 + readiness * 0.045);
      return {
        id: `e-${this.state!.epoch}-${index}-${Math.floor(this.streams!.next("combat") * 99999)}`,
        type,
        hp: Math.round(definition.hp * healthScale),
        maxHp: Math.round(definition.hp * healthScale),
        speed: combatSpeed,
        marchSpeed: combatSpeed * 1.6,
        combatSpeed,
        damage: definition.damage * damageScale * tutorialDamage * (isBoss ? 1.55 : elite ? 1.28 : 1) * (this.state!.nightModifier?.enemyDamage ?? 1),
        // Start outside the basic ballista's effective radius. Fast marching
        // keeps the first contact prompt, while long-range trebuchets retain a
        // real deployment advantage.
        position: { x: (this.streams!.next("combat") - 0.5) * 8.4, z: -47.5 - (index % 3) * 1.2 },
        target: type === "flyer" ? "building" : "gate",
        targetId: null,
        attackCooldown: 0,
        slowedUntil: 0,
        targetedUntil: 0,
        elite,
        lane: index % 3 - 1,
        formationRank: Math.floor(index / 3),
        collisionRadius: type === "ram" ? 1.35 : type === "shield" ? 0.82 : 0.66,
        attackSlot: index % 6,
        heightLayer: type === "flyer" ? 1 : 0,
        bossKind: isBoss ? bossKind : null,
        bossPhase: 0,
        attackRange: type === "archer" ? 15 : 1.6,
        windupUntil: 0,
        bossAction: "advance",
        bossSkillCooldown: isBoss ? 4.2 : 0,
        bossTelegraphUntil: 0
      };
    });
    this.state.enemies = [];
    this.spawnCooldown = 0.12;
    if ((this.state.reinforcementNights ?? 0) > 0) {
      this.spawnSupportAllies();
      this.state.reinforcementNights = Math.max(0, (this.state.reinforcementNights ?? 0) - 1);
    }
    this.gateCloseTarget = 1;
    this.sound.horn();
    window.setTimeout(() => this.sound.gate(), 350);
    this.hud.enemyArrow.classList.remove("is-hidden");
    if (this.playerRig && !this.isInsideFort(this.playerRig.root.position)) {
      this.setPrompt("ph-warning", "你仍在城外，敌人会追击行者。沿道路从城门返回");
    } else {
      this.setPrompt("ph-shield-warning", "敌人已接近城门。击退全部敌军，天亮就过关");
    }
    if (this.state.tutorialStep < 3) this.state.tutorialStep = 3;
    this.updateLighting(true);
  }

  private updateNight(delta: number): void {
    if (!this.state) return;
    this.spawnCooldown -= delta;
    if (this.spawnQueue.length && this.spawnCooldown <= 0) {
      const lateFormationSpacing = this.state.epoch >= 16 ? 0.62 : this.state.epoch >= 9 ? 0.5 : 0.35;
      this.spawnCooldown = lateFormationSpacing + (this.streams?.next("combat") ?? 0.5) * 0.2;
      const enemy = this.spawnQueue.shift()!;
      this.state.enemies.push(enemy);
      this.createEnemyVisual(enemy);
    }
    this.updateEnemies(delta);
    this.updateSupportAllies(delta);
    this.updateTowers(delta);
    this.cleanupEnemies();
    if (!this.spawnQueue.length && !this.state.enemies.length) this.finishNight();
  }

  private spawnSupportAllies(): void {
    if (!this.state || this.supportAllies.length) return;
    const accent = regionById(this.state.regionId).accent;
    for (const x of [-5.2, 5.2]) {
      const rig = this.library.unit("player");
      rig.root.position.set(x, 0, -7.4);
      rig.root.rotation.y = Math.PI;
      rig.root.userData.supportAlly = true;
      this.world.add(rig.root);
      this.supportAllies.push({ rig, cooldown: 0.1 + Math.abs(x) * 0.025 });
    }
    this.setPrompt("ph-shield-star", "商路守卫加入本夜防线，优先拦截破门后的敌军");
  }

  private updateSupportAllies(delta: number): void {
    if (!this.state || !this.supportAllies.length) return;
    for (const ally of this.supportAllies) {
      ally.cooldown = Math.max(0, ally.cooldown - delta);
      const target = this.state.enemies
        .map((enemy) => ({ enemy, visual: this.enemyObjects.get(enemy.id) }))
        .filter((entry): entry is { enemy: EnemyState; visual: EnemyVisual } => Boolean(entry.visual) && entry.enemy.type !== "flyer")
        .sort((left, right) => left.visual.object.position.distanceTo(ally.rig.root.position) - right.visual.object.position.distanceTo(ally.rig.root.position))[0];
      if (!target) {
        ally.rig.setMoving(false);
        continue;
      }
      const direction = target.visual.object.position.clone().sub(ally.rig.root.position).setY(0);
      const distance = direction.length();
      if (distance > 2.6) {
        ally.rig.setMoving(true);
        ally.rig.root.position.addScaledVector(direction.normalize(), Math.min(4.2, distance) * delta);
        ally.rig.root.rotation.y = Math.atan2(direction.x, direction.z);
      } else if (ally.cooldown <= 0) {
        ally.rig.setMoving(false);
        ally.cooldown = 0.82;
        ally.rig.attack();
        target.enemy.hp -= 16;
        target.enemy.targetedUntil = performance.now() + 650;
        this.reactToEnemyHit(target.visual, 0.12);
        this.burst(target.visual.object.position.clone().setY(1.15), 0x73b0a2, 4);
      }
    }
  }

  private createEnemyVisual(enemy: EnemyState): void {
    const region = regionById(this.state?.regionId ?? "oasis");
    const root = new THREE.Group();
    let rig: CharacterRig | undefined;
    if (enemy.type === "ram" && enemy.bossKind === "siege-beast") {
      // 四足披甲攻城兽使用独立非人形资产，不再由重甲人形放大冒充。
      const beast = this.library.model("unit-siege-beast");
      beast.rotation.y = Math.PI;
      root.add(beast);
    } else if (enemy.type === "ram") {
      const ram = this.library.model("unit-ram", region.accent, 0.04);
      ram.rotation.y = Math.PI;
      root.add(ram);
    } else if (enemy.type === "flyer") {
      // 普通机关鸢与首领鸢群均为 Blender 输出的非人形机械实体。
      root.add(this.library.model(enemy.bossKind === "kite-swarm" ? "unit-kite-swarm" : "unit-flyer", region.accent, 0.05));
    } else {
      const unitKind = enemy.bossKind === "shield-commander" || enemy.bossKind === "sapper-captain"
        ? enemy.bossKind
        : enemy.type;
      rig = this.library.unit(unitKind);
      rig.setMoving(true);
      root.add(rig.root);
    }
    const bossScale: Partial<Record<BossKind, number>> = {
      "shield-commander": 1.18,
      "sapper-captain": 1.14,
      "kite-swarm": 1.16,
      "siege-beast": 1.08
    };
    const baseScale = enemy.bossKind ? bossScale[enemy.bossKind] ?? 1.36 : enemy.elite ? 1.22 : 1;
    root.scale.setScalar(baseScale);
    root.userData.baseScale = baseScale;
    root.position.set(enemy.position.x, enemy.type === "flyer" ? 3.2 : 0, enemy.position.z);
    root.userData.enemyId = enemy.id;
    root.traverse((child) => { child.userData.enemyId = enemy.id; });
    this.world.add(root);
    const label = document.createElement("button");
    label.type = "button";
    label.className = "enemy-world-label is-idle-status";
    const displayName = enemy.bossKind ? bossDefinitions[enemy.bossKind].name : enemies[enemy.type].name;
    label.innerHTML = `<strong><b>${enemy.elite && !enemy.bossKind ? "精锐 " : ""}${displayName}</b><small>${Math.ceil(enemy.hp)}/${enemy.maxHp}</small></strong><span><i></i></span>`;
    label.addEventListener("click", () => this.selectEnemy(enemy.id));
    this.hud.buildingLabels.appendChild(label);
    this.enemyObjects.set(enemy.id, { object: root, rig, flash: 0, lastHitReaction: -Infinity, stolen: false, label });
  }

  /** Prevents high-rate towers from restarting the same skeletal hit clip every frame. */
  private reactToEnemyHit(visual: EnemyVisual | undefined, flash = 0.1): void {
    if (!visual) return;
    visual.flash = Math.max(visual.flash, flash);
    const now = performance.now();
    if (now - visual.lastHitReaction < 260) return;
    visual.lastHitReaction = now;
    visual.rig?.hit();
  }

  private selectEnemy(id: string): void {
    if (!this.state) return;
    const enemy = this.state.enemies.find((entry) => entry.id === id);
    if (!enemy) return;
    this.selectedEnemyId = id;
    enemy.targetedUntil = performance.now() + 4500;
    const name = enemy.bossKind ? bossDefinitions[enemy.bossKind].name : enemies[enemy.type].name;
    this.setPrompt("ph-crosshair", `${name} ${Math.ceil(enemy.hp)}/${enemy.maxHp} 生命`);
  }

  private updateEnemies(delta: number): void {
    if (!this.state) return;
    const now = performance.now();
    for (const enemy of this.state.enemies) {
      const visual = this.enemyObjects.get(enemy.id);
      if (!visual) continue;
      enemy.bossSkillCooldown = Math.max(0, enemy.bossSkillCooldown - delta);
      this.updateBossBehavior(enemy, visual, now);
      visual.object.userData.bossAction = enemy.bossAction;
      visual.object.userData.bossPhase = enemy.bossPhase;
      if (enemy.bossKind && enemy.bossAction !== "advance") {
        visual.rig?.setMoving(false);
        continue;
      }
      const playerOutside = this.playerRig && !this.isInsideFort(this.playerRig.root.position);
      if (playerOutside && (enemy.type === "raider" || enemy.type === "looter" || enemy.type === "archer") && visual.object.position.z < -10.5) {
        enemy.target = "player";
        enemy.targetId = null;
      } else if (enemy.target === "player" && !playerOutside) {
        enemy.target = this.state.gateHp > 0 ? "gate" : "building";
      }
      if (enemy.target === "gate" && this.state.gateHp <= 0) this.assignEnemyTarget(enemy, visual.object.position);
      if (enemy.target === "building") {
        const target = this.state.buildings.find((building) => building.id === enemy.targetId && building.hp > 0);
        if (!target) this.assignEnemyTarget(enemy, visual.object.position);
      }
      if (enemy.type === "flyer" && !enemy.targetId && enemy.target !== "core") this.assignEnemyTarget(enemy, visual.object.position);

      let destination = CORE_POSITION.clone().setY(visual.object.position.y);
      let isTargetingFortification = false;
      if (enemy.target === "gate" && this.state.gateHp > 0) {
        const fortification = this.state.fortifications.find((entry) => entry.built && entry.hp > 0 && entry.lane === enemy.lane && enemy.type !== "flyer");
        isTargetingFortification = Boolean(fortification);
        const fortificationPoint = fortification ? fortificationPosition(fortification.lane) : undefined;
        // 游弓手以实际目标（城门或拒马）为射程基准，而不是再额外后移一个站位。
        // 旧逻辑把站位偏移和 8.8 的攻击距离叠加，令它停在床弩射程之外。
        destination.set(fortificationPoint ? fortificationPoint.x : ROAD_LANES[enemy.lane + 1]! * 0.32, visual.object.position.y, fortificationPoint ? fortificationPoint.z : -13.1);
      } else if (enemy.target === "player" && this.playerRig) {
        destination.copy(this.playerRig.root.position).setY(visual.object.position.y);
      } else if (enemy.target === "building" && enemy.targetId) {
        const object = this.buildingObjects.get(enemy.targetId);
        if (object) destination.copy(object.position).setY(visual.object.position.y);
      }
      const distance = visual.object.position.distanceTo(destination);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta);
      const isSlowed = enemy.slowedUntil > now;
      const blockingFortification = this.state.fortifications.find((fortification) => fortification.built && fortification.hp > 0 && fortification.lane === enemy.lane && visual.object.position.z < -15 && enemy.type !== "flyer");
      const isBarricaded = Boolean(blockingFortification);
      // 游弓手会在城门外射击，但停点始终由床弩的基础射程覆盖。
      // 拒马比城门更靠外，因此缩短其对拒马的射程，避免再站到塔防覆盖外。
      const attackRange = enemy.type === "archer"
        ? (enemy.target === "player" ? 12.5 : isTargetingFortification ? 10.5 : enemy.attackRange)
        : enemy.type === "ram" ? 2.6 : 1.55;
      if (enemy.type === "archer" && enemy.windupUntil > now && distance <= attackRange) {
        const aim = destination.clone().sub(visual.object.position).setY(0);
        visual.object.rotation.y = Math.atan2(aim.x, aim.z);
        visual.rig?.setMoving(false);
        continue;
      }
      if (distance > attackRange) {
        if (enemy.type === "archer") enemy.windupUntil = 0;
        const direction = destination.clone().sub(visual.object.position).setY(0).normalize();
        const gateDistance = visual.object.position.distanceTo(new THREE.Vector3(0, visual.object.position.y, -13.1));
        const currentSpeed = gateDistance > 18 ? enemy.marchSpeed : enemy.combatSpeed;
        enemy.speed = currentSpeed;
        const separation = new THREE.Vector3();
        for (const other of this.state.enemies) {
          if (other.id === enemy.id || other.heightLayer !== enemy.heightLayer) continue;
          const otherVisual = this.enemyObjects.get(other.id);
          if (!otherVisual) continue;
          const offset = visual.object.position.clone().sub(otherVisual.object.position).setY(0);
          const minDistance = enemy.collisionRadius + other.collisionRadius;
          const length = offset.length();
          if (length > 0.02 && length < minDistance) separation.addScaledVector(offset.normalize(), (minDistance - length) / minDistance);
        }
        direction.addScaledVector(separation, 1.35).normalize();
        const barricadeFactor = blockingFortification?.branch === "sand" ? 0.42 : 0.68;
        visual.object.position.addScaledVector(direction, currentSpeed * (isSlowed ? 0.56 : isBarricaded ? barricadeFactor : 1) * delta);
        visual.rig?.setMoving(true);
        if (blockingFortification) {
          const hasFireSupport = this.state.buildings.some((building) => building.type === "fire" && building.hp > 0);
          const contactDamage = blockingFortification.branch === "spike"
            ? 1.6 + blockingFortification.level * 0.75
            : blockingFortification.branch === "oil" && hasFireSupport
              ? 2.2 + blockingFortification.level * 0.9
              : 0.45;
          enemy.hp -= contactDamage * delta;
        }
        visual.object.rotation.y = Math.atan2(direction.x, direction.z);
        enemy.position.x = visual.object.position.x;
        enemy.position.z = visual.object.position.z;
      } else if (enemy.attackCooldown <= 0) {
        visual.rig?.setMoving(false);
        if (enemy.type === "archer" && enemy.windupUntil === 0) {
          enemy.windupUntil = now + 520;
          enemy.attackCooldown = 0.52;
          visual.rig?.setMoving(false);
          visual.rig?.attack();
          continue;
        }
        if (enemy.type === "archer") enemy.windupUntil = 0;
        enemy.attackCooldown = enemy.type === "ram" ? 2 : enemy.type === "archer" ? 1.65 : 1.15;
        if (enemy.type !== "archer") visual.rig?.attack();
        const fortification = this.state.fortifications.find((entry) => entry.built && entry.hp > 0 && entry.lane === enemy.lane && enemy.type !== "flyer");
        if (fortification && enemy.target === "gate" && visual.object.position.z < -16.8) {
          const damage = enemy.damage * (enemy.type === "sapper" ? 1.7 : enemy.type === "archer" ? 0.78 : 1);
          fortification.hp = Math.max(0, fortification.hp - damage);
          if (enemy.type === "archer") {
            const target = this.fortificationObjects.get(fortification.id)?.position.clone().setY(1.05)
              ?? fortificationPosition(fortification.lane).setY(1.05);
            this.fireProjectile(visual.object.position.clone().setY(2.1), target, 0xd9b76a);
          }
          enemy.slowedUntil = now + 900;
          this.sound.hit();
          const object = this.fortificationObjects.get(fortification.id);
          if (object) this.burst(object.position.clone().setY(1), 0xc7654d, 5);
          if (fortification.hp <= 0) this.setPrompt("ph-fence", "道路拒马被拆除，敌军正转向城门");
        } else if (enemy.target === "gate" && this.state.gateHp > 0) {
          const braceStacks = this.state.relics.filter((entry) => entry === "gate-brace").length;
          const moduleArmor = this.state.regionModule === "side-gate" ? 0.9 : 1;
          const armor = Math.max(0.58, (this.state.relics.includes("gate-armor") ? 0.88 : 1) * (1 - braceStacks * 0.05) * moduleArmor);
          const damage = enemy.damage * (enemy.type === "sapper" ? 1.55 : enemy.type === "archer" ? 0.78 : 1) * armor;
          if (enemy.type === "archer") this.fireProjectile(visual.object.position.clone().setY(2.1), new THREE.Vector3(0, 2.6, -12), 0xd9b76a);
          this.state.gateHp = Math.max(0, this.state.gateHp - damage);
          this.state.recentDamage += damage;
          this.hitGate();
          if (this.state.gateHp <= 0) {
            this.gateCloseTarget = 0;
            this.sound.warning();
            this.setPrompt("ph-door-open", "城门已破，敌人正在攻击驿站主帐。主帐血条归零才会失败");
          }
        } else if (enemy.target === "player" && this.playerRig) {
          const armorStacks = this.state.relics.filter((entry) => entry === "hero-armor").length;
          const playerDamage = enemy.damage * Math.max(0.7, 1 - armorStacks * 0.1);
          this.state.player.hp = Math.max(0, this.state.player.hp - playerDamage);
          this.cameraShake = 0.22;
          this.sound.hit();
          this.burst(this.playerRig.root.position.clone().setY(1.5), 0xd55d48, 6);
          this.state.nightSpeed = 1;
          if (this.state.player.hp <= 0) {
            this.state.player.hp = Math.ceil(this.state.player.maxHp * 0.5);
            this.state.resources.coin = Math.max(0, this.state.resources.coin - 8);
            this.playerRig.root.position.set(0, 0, 6);
            this.state.player.position = { x: 0, z: 6 };
            this.setPrompt("ph-first-aid", "行者负伤撤回主帐，损失 8 钱币");
          }
        } else if (enemy.target === "building" && enemy.targetId) {
          const building = this.state.buildings.find((entry) => entry.id === enemy.targetId);
          const object = this.buildingObjects.get(enemy.targetId);
          if (building && building.hp > 0 && object) {
            const damage = enemy.damage * (enemy.type === "sapper" ? 1.7 : 1);
            building.hp = Math.max(0, building.hp - damage);
            building.status ??= { productionPaused: false, targeted: true, lastHitAt: now };
            building.status.targeted = true;
            building.status.lastHitAt = now;
            building.status.productionPaused = building.hp <= 0;
            this.state.recentDamage += damage;
            this.state.nightSpeed = 1;
            this.sound.hit();
            if (enemy.type === "archer") this.fireProjectile(visual.object.position.clone().setY(2.1), object.position.clone().setY(2.1), 0xd9b76a);
            this.burst(object.position.clone().setY(2), 0xd55d48, 6);
            if (enemy.type === "looter" && building.type === "market" && !visual.stolen) {
              visual.stolen = true;
              this.state.resources.coin = Math.max(0, this.state.resources.coin - 6);
              this.setPrompt("ph-hand-grabbing", "掠夺者袭击商栈，抢走 6 钱币");
            }
            if (building.hp <= 0) {
              object.scale.multiplyScalar(0.86);
              this.setPrompt("ph-warning", `${buildings[building.type].name} 已损毁，修复前停止运作`);
              this.assignEnemyTarget(enemy, visual.object.position);
            }
          } else {
            this.assignEnemyTarget(enemy, visual.object.position);
          }
        } else {
          this.state.coreHp = Math.max(0, this.state.coreHp - enemy.damage);
          this.coreStatusTimer = 2.8;
          this.state.recentDamage += enemy.damage;
          this.cameraShake = 0.32;
          this.state.nightSpeed = 1;
          this.sound.hit();
          if (enemy.type === "archer") this.fireProjectile(visual.object.position.clone().setY(2.1), CORE_POSITION.clone().setY(2.4), 0xd9b76a);
          this.burst(CORE_POSITION.clone().setY(2.5), 0xd55d48, 8);
          if (this.state.coreHp <= 0) {
            this.endRun();
            return;
          }
        }
      }
      if (visual.flash > 0) {
        visual.flash -= delta;
        const baseScale = Number(visual.object.userData.baseScale ?? 1);
        visual.object.scale.setScalar(baseScale * (1 + visual.flash * 0.16));
        visual.object.rotation.z = Math.sin(visual.flash * 38) * 0.08;
      } else {
        visual.object.scale.setScalar(Number(visual.object.userData.baseScale ?? 1));
        visual.object.rotation.z = THREE.MathUtils.damp(visual.object.rotation.z, 0, 18, delta);
      }
      if (enemy.bossKind) {
        const ratio = enemy.hp / Math.max(1, enemy.maxHp);
        const thresholds = bossDefinitions[enemy.bossKind].phaseThresholds;
        const phase = ratio <= thresholds[1] ? 2 : ratio <= thresholds[0] ? 1 : 0;
        if (phase > enemy.bossPhase) {
          enemy.bossPhase = phase as 0 | 1 | 2;
          enemy.combatSpeed *= 1.04;
          enemy.damage *= 1.05;
          enemy.bossSkillCooldown = Math.min(enemy.bossSkillCooldown, 0.8);
          this.sound.warning();
          this.cameraShake = 0.32;
          this.setPrompt("ph-warning", `${bossDefinitions[enemy.bossKind].name}进入第 ${phase + 1} 阶段，新战术即将发动`);
        }
      }
    }
  }

  private updateBossBehavior(enemy: EnemyState, visual: EnemyVisual, now: number): void {
    if (!this.state || !enemy.bossKind) return;
    if (enemy.bossAction === "recover") {
      if (now >= enemy.bossTelegraphUntil) enemy.bossAction = "advance";
      return;
    }
    if (enemy.bossAction !== "advance") {
      if (now >= enemy.bossTelegraphUntil) {
        this.executeBossSkill(enemy, visual);
        enemy.bossAction = "recover";
        enemy.bossTelegraphUntil = now + 420;
        enemy.bossSkillCooldown = bossDefinitions[enemy.bossKind].skillCooldown[enemy.bossPhase];
      }
      return;
    }
    if (enemy.bossSkillCooldown > 0) return;
    const action: Record<BossKind, BossAction> = {
      "shield-commander": enemy.bossPhase === 0 ? "formation" : "shockwave",
      "sapper-captain": enemy.bossPhase === 0 ? "plant-charge" : "detonate",
      "kite-swarm": enemy.bossPhase === 0 ? "split" : "dive",
      "siege-beast": "charge"
    };
    enemy.bossAction = action[enemy.bossKind];
    enemy.bossTelegraphUntil = now + (enemy.bossAction === "charge" || enemy.bossAction === "detonate" ? 1350 : 980);
    enemy.windupUntil = enemy.bossTelegraphUntil;
    enemy.attackCooldown = Math.max(enemy.attackCooldown, 1.1);
    visual.rig?.attack();
    const warnings: Record<BossAction, string> = {
      advance: "", formation: "举盾列阵", shockwave: "震地冲击", "plant-charge": "布置炸药",
      detonate: "连锁爆破", split: "释放子鸢", dive: "俯冲生产区", charge: "蓄力撞门", recover: ""
    };
    this.setPrompt("ph-warning-diamond", `${bossDefinitions[enemy.bossKind].name}：${warnings[enemy.bossAction]}`);
    this.sound.warning();
    this.burst(visual.object.position.clone().setY(1.2), enemy.bossKind === "kite-swarm" ? 0x6ca8ad : 0xc35b48, 8);
  }

  private executeBossSkill(enemy: EnemyState, visual: EnemyVisual): void {
    if (!this.state || !enemy.bossKind) return;
    const action = enemy.bossAction;
    const phasePower = 1 + enemy.bossPhase * 0.22;
    if (action === "formation") {
      for (const ally of this.state.enemies) {
        const allyVisual = this.enemyObjects.get(ally.id);
        if (!allyVisual || ally.id === enemy.id || ally.heightLayer !== 0 || allyVisual.object.position.distanceTo(visual.object.position) > 12) continue;
        ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.08);
        ally.targetedUntil = performance.now() + 900;
        ally.protectedUntil = performance.now() + 3600;
      }
    } else if (action === "shockwave") {
      if (this.playerRig && this.playerRig.root.position.distanceTo(visual.object.position) < 10) {
        const away = this.playerRig.root.position.clone().sub(visual.object.position).setY(0).normalize();
        this.playerRig.root.position.addScaledVector(away, 3.2);
        this.state.player.hp = Math.max(1, this.state.player.hp - 14 * phasePower);
      }
      for (const [id, object] of this.buildingObjects) {
        if (object.position.distanceTo(visual.object.position) < 15) this.buildingCooldowns.set(id, (this.buildingCooldowns.get(id) ?? 0) + 1.2);
      }
      this.cameraShake = 0.5;
    } else if (action === "plant-charge" || action === "detonate" || action === "dive") {
      const priorities = bossDefinitions[enemy.bossKind].preferredTargets;
      const targets = this.state.buildings
        .filter((building) => building.hp > 0)
        .sort((a, b) => {
          const pa = priorities.indexOf(a.type); const pb = priorities.indexOf(b.type);
          return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
        });
      const target = targets[0];
      if (target) {
        const damageRatio = action === "detonate" ? 0.2 : action === "dive" ? 0.14 : 0.11;
        target.hp = Math.max(0, target.hp - target.maxHp * damageRatio * phasePower);
        target.status.targeted = true;
        target.status.lastHitAt = performance.now();
        target.status.productionPaused = target.hp <= 0;
        const object = this.buildingObjects.get(target.id);
        if (object) {
          this.fireProjectile(visual.object.position.clone().setY(2.5), object.position.clone().setY(2), 0xd16448);
          this.burst(object.position.clone().setY(1.8), 0xd16448, action === "detonate" ? 18 : 10);
        }
      } else {
        this.state.coreHp = Math.max(0, this.state.coreHp - 18 * phasePower);
      }
    } else if (action === "split") {
      for (const side of [-1, 1]) this.spawnBossFlyer(enemy, visual.object.position, side);
    } else if (action === "charge") {
      const damage = enemy.damage * (2.35 + enemy.bossPhase * 0.35);
      if (this.state.gateHp > 0) {
        this.state.gateHp = Math.max(0, this.state.gateHp - damage);
        this.hitGate();
      } else {
        this.state.coreHp = Math.max(0, this.state.coreHp - damage * 0.72);
        this.coreStatusTimer = 3;
      }
      visual.object.position.z += Math.min(3.8, Math.max(0, -12 - visual.object.position.z));
      this.cameraShake = 0.58;
    }
    this.sound.hit();
    this.state.nightSpeed = 1;
    if (this.state.coreHp <= 0) this.endRun();
  }

  private spawnBossFlyer(parent: EnemyState, origin: THREE.Vector3, side: number): void {
    if (!this.state) return;
    const definition = enemies.flyer;
    const scale = enemyHealthScale(this.state.epoch, this.state.mode) * 0.62;
    const minion: EnemyState = {
      id: `kite-${this.state.epoch}-${performance.now().toFixed(0)}-${side}`,
      type: "flyer", hp: Math.round(definition.hp * scale), maxHp: Math.round(definition.hp * scale),
      speed: definition.speed, marchSpeed: definition.speed * 1.25, combatSpeed: definition.speed,
      damage: definition.damage * (1 + this.state.epoch * 0.035), position: { x: origin.x + side * 3, z: origin.z - 1.5 },
      target: "building", targetId: null, attackCooldown: 0.6, slowedUntil: 0, targetedUntil: 0, elite: false,
      lane: parent.lane, formationRank: parent.formationRank + side, collisionRadius: 0.65, attackSlot: -1, heightLayer: 1,
      bossKind: null, bossPhase: 0, attackRange: 1.8, windupUntil: 0,
      bossAction: "advance", bossSkillCooldown: 0, bossTelegraphUntil: 0
    };
    this.state.enemies.push(minion);
    this.createEnemyVisual(minion);
    this.assignEnemyTarget(minion, origin);
  }

  private assignEnemyTarget(enemy: EnemyState, from: THREE.Vector3): void {
    if (!this.state) return;
    if (enemy.type === "ram") {
      enemy.target = "core";
      enemy.targetId = null;
      return;
    }
    const preferred: Partial<Record<EnemyState["type"], BuildingType[]>> = {
      looter: ["market"],
      archer: ["ballista", "antiair", "fire", "market"],
      sapper: ["ballista", "fire", "workshop"],
      flyer: ["market", "workshop", "ballista", "fire"],
      shield: ["ballista", "fire"],
      raider: ["ballista", "fire", "market", "workshop"]
    };
    const order = enemy.bossKind ? bossDefinitions[enemy.bossKind].preferredTargets : preferred[enemy.type] ?? [];
    const candidates = this.state.buildings
      .filter((building) => building.hp > 0)
      .sort((a, b) => {
        const aPriority = order.indexOf(a.type);
        const bPriority = order.indexOf(b.type);
        const priorityA = aPriority < 0 ? 99 : aPriority;
        const priorityB = bPriority < 0 ? 99 : bPriority;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return this.zonePosition(a.padIndex).distanceTo(from) - this.zonePosition(b.padIndex).distanceTo(from);
      });
    const target = candidates[0];
    if (target) {
      enemy.target = "building";
      enemy.targetId = target.id;
      target.status ??= { productionPaused: false, targeted: false, lastHitAt: 0 };
      target.status.targeted = true;
    } else {
      enemy.target = "core";
      enemy.targetId = null;
    }
  }

  private hitGate(): void {
    if (!this.state) return;
    this.state.nightSpeed = 1;
    this.gateStatusTimer = 2.8;
    this.cameraShake = 0.25;
    this.sound.hit();
    this.burst(new THREE.Vector3(0, 2.4, -12), 0xc7654d, 7);
    if (this.gateObject) {
      this.gateObject.rotation.z = (Math.random() - 0.5) * 0.015;
      setTimeout(() => { if (this.gateObject) this.gateObject.rotation.z = 0; }, 90);
    }
  }

  private updateTowers(delta: number): void {
    if (!this.state) return;
    const effectStacks = (effect: string, cap: number): number => Math.min(cap, this.state!.relics.filter((entry) => entry === effect).length);
    for (const building of this.state.buildings) {
      const definition = buildings[building.type];
      if (!definition.attack || !definition.range || building.hp <= 0) continue;
      const specialization = building.level >= 3 ? this.activeSpecialization(building) : undefined;
      const cooldown = (this.buildingCooldowns.get(building.id) ?? 0) - delta;
      if (cooldown > 0) {
        this.buildingCooldowns.set(building.id, cooldown);
        continue;
      }
      const object = this.buildingObjects.get(building.id);
      if (!object) continue;
      let nearest: EnemyState | undefined;
      let nearestDistance = Infinity;
      for (const enemy of this.state.enemies) {
        const visual = this.enemyObjects.get(enemy.id);
        if (!visual) continue;
        const distance = visual.object.position.distanceTo(object.position);
        const priority = (building.type === "antiair" && enemy.type === "flyer" ? -8 : 0)
          + (enemy.type === "archer" ? -2.4 : 0)
          + (enemy.bossKind ? -3 : 0);
        const effectiveRange = this.towerRange(building);
        if (distance < effectiveRange && distance + priority < nearestDistance) {
          nearest = enemy;
          nearestDistance = distance + priority;
        }
      }
      if (!nearest) continue;
      const damageBoost = effectStacks("damage", 5) * 0.12
        + (this.state.relics.includes("last-stand") && this.state.coreHp / this.state.coreMaxHp < 0.35 ? 0.25 : 0);
      const piercing = building.type === "ballista" && (nearest.type === "shield" || nearest.type === "ram")
        ? (this.state.relics.includes("pierce") ? 1.35 : 1) * (specialization === "pierce" ? 1.28 : 1)
        : 1;
      const airRelics = effectStacks("air-damage", 3);
      const airMultiplier = building.type === "antiair" && nearest.type === "flyer" ? (specialization === "hunter" ? 2.25 : 1.8) * (1 + airRelics * 0.3) : 1;
      const siegeMultiplier = building.type === "trebuchet" && specialization === "siege" && (nearest.type === "ram" || nearest.type === "shield") ? 1.38 : 1;
      const fireDamageStacks = effectStacks("fire-damage", 3);
      const fireMultiplier = building.type === "fire"
        ? (specialization === "burn" ? 1.2 : 1) * (1 + fireDamageStacks * 0.25)
        : 1;
      const antiRanged = nearest.type === "archer" && this.state.relics.includes("anti-ranged") ? 1.3 : 1;
      const bossDamage = nearest.bossKind ? 1 + effectStacks("boss-damage", 1) * 0.18 : 1;
      const formationArmor = (nearest.protectedUntil ?? 0) > performance.now() ? 0.58 : 1;
      const damage = definition.attack * weaponLevelPower(building.level) * (1 + damageBoost) * piercing * airMultiplier * siegeMultiplier * fireMultiplier * antiRanged * bossDamage * formationArmor;
      nearest.hp -= damage;
      nearest.targetedUntil = performance.now() + 650;
      if (building.type === "fire") {
        const fireStacks = this.state.relics.filter((entry) => entry === "fire").length;
        nearest.slowedUntil = performance.now() + (specialization === "tar" ? 2300 : 1500) + fireStacks * 400;
        if (this.state.relics.includes("fire-spread")) {
          const primary = this.enemyObjects.get(nearest.id);
          if (primary) {
            for (const nearby of this.state.enemies) {
              const nearbyVisual = this.enemyObjects.get(nearby.id);
              if (nearby.id === nearest.id || !nearbyVisual || nearbyVisual.object.position.distanceTo(primary.object.position) > 2.8) continue;
              nearby.hp -= damage * 0.3;
              nearby.slowedUntil = Math.max(nearby.slowedUntil, performance.now() + 900);
            }
          }
        }
      }
      const target = this.enemyObjects.get(nearest.id);
      if (target) {
        this.reactToEnemyHit(target, 0.1);
        this.fireProjectile(object.position.clone().setY(building.type === "fire" ? 4.5 : 2), target.object.position.clone().setY(1.2), building.type === "fire" ? 0xf0803e : 0xe8c47a);
      }
      if (building.type === "antiair" && specialization === "volley") {
        const primaryId = nearest.id;
        const secondary = this.state!.enemies.find((enemy) => {
          const candidate = this.enemyObjects.get(enemy.id);
          return enemy.id !== primaryId && enemy.type === "flyer" && Boolean(candidate && candidate.object.position.distanceTo(object.position) < this.towerRange(building));
        });
        const secondaryVisual = secondary ? this.enemyObjects.get(secondary.id) : undefined;
        if (secondary && secondaryVisual) {
          secondary.hp -= damage * 0.58;
          secondary.targetedUntil = performance.now() + 500;
          this.reactToEnemyHit(secondaryVisual, 0.08);
          this.fireProjectile(object.position.clone().setY(2.3), secondaryVisual.object.position.clone().setY(1.3), 0x9ed3d3);
        }
      }
      if (building.type === "trebuchet" && target) {
        for (const enemy of this.state.enemies) {
          if (enemy.id === nearest.id) continue;
          const visual = this.enemyObjects.get(enemy.id);
          const blastRelics = effectStacks("blast", 3);
          const blastRange = (specialization === "shatter" ? 4.35 : 3.1) * (1 + blastRelics * 0.12);
          if (!visual || visual.object.position.distanceTo(target.object.position) > blastRange) continue;
          enemy.hp -= damage * 0.48;
          this.reactToEnemyHit(visual, 0.08);
        }
        this.burst(target.object.position.clone().setY(1.2), 0x9f7e5d, 12);
      }
      const rapidBonus = 1 + effectStacks("rapid", 5) * 0.065;
      const speedBonus = ((building.type === "ballista" && specialization === "watch") || (building.type === "antiair" && specialization === "volley") ? 1.18 : 1) * rapidBonus;
      const moduleSpeed = this.state.regionModule === "mechanism-emplacement" ? 1.1 : 1;
      this.buildingCooldowns.set(building.id, (definition.cooldown ?? 1) / (weaponLevelRate(building.level) * speedBonus * moduleSpeed));
      this.sound.bolt();
    }
  }

  private towerRange(building: BuildingState): number {
    const definition = buildings[building.type];
    if (!definition.range) return 0;
    const rangeStacks = this.state?.relics.filter((entry) => entry === "range").length ?? 0;
    const relicMultiplier = 1 + Math.min(0.24, rangeStacks * 0.06);
    const specializationBonus = building.type === "ballista" && building.level >= 3 && this.activeSpecialization(building) === "watch" ? 10 : 0;
    const levelBonus = Math.min(6, Math.max(0, building.level - 1) * 1.5);
    const moduleMultiplier = this.state?.regionModule === "high-ground" ? 1.12 : 1;
    const regionId = this.state?.regionId;
    const weatherMultiplier = regionId === "mist" && definition.range >= 20
      ? 0.9
      : regionId === "canyon" && building.type === "trebuchet"
        ? 1.08
        : regionId === "stardust" && (building.type === "antiair" || building.type === "ballista")
          ? 1.05
          : 1;
    const zone = this.currentFortLayout().zones[building.padIndex];
    const highGroundMultiplier = zone && zone.elevation >= 1 ? 1.12 : 1;
    return (definition.range + specializationBonus + levelBonus) * relicMultiplier * moduleMultiplier * weatherMultiplier * highGroundMultiplier;
  }

  private cleanupEnemies(): void {
    if (!this.state) return;
    const defeated = this.state.enemies.filter((enemy) => enemy.hp <= 0);
    for (const enemy of defeated) {
      const visual = this.enemyObjects.get(enemy.id);
      if (visual) {
        this.burst(visual.object.position.clone().setY(1.2), 0xd6aa62, 10);
        visual.label.remove();
        visual.object.userData.defeated = true;
        visual.rig?.defeat();
        const duration = visual.rig ? 0.92 : 0.58;
        this.fallenVisuals.push({ object: visual.object, mixer: visual.rig?.mixer, life: duration, duration, direction: enemy.lane >= 0 ? 1 : -1 });
      }
      this.enemyObjects.delete(enemy.id);
      const lootMultiplier = this.state.nightModifier?.loot ?? 1;
      const bounty = this.state.relics.filter((entry) => entry === "bounty").length;
      this.state.resources.coin += Math.ceil(enemies[enemy.type].reward * lootMultiplier) + bounty;
      if (enemy.type === "sapper") this.state.resources.gear += 1;
      if (enemy.type === "ram") this.state.resources.stone += 2;
      if (enemy.elite && this.state.relics.includes("salvage")) {
        const salvageStacks = this.state.relics.filter((entry) => entry === "salvage").length;
        this.state.resources.wood += salvageStacks * 2;
        this.state.resources.stone += salvageStacks * 2;
        this.state.resources.gear += salvageStacks;
      }
      if (enemy.bossKind) {
        this.state.bossKills += 1;
        const reward = bossDefinitions[enemy.bossKind];
        this.state.resources.coin += reward.rewardCoin;
        this.state.resources.gear += reward.rewardGear;
        this.setPrompt("ph-trophy", "首领已击败，本夜奖励至少为稀有品质");
      }
      this.state.kills += 1;
      this.state.renownEarned += enemy.type === "ram" ? 2 : 1;
    }
    this.state.enemies = this.state.enemies.filter((enemy) => enemy.hp > 0);
  }

  private finishNight(): void {
    if (!this.state) return;
    this.hud.bossBar.classList.add("is-hidden");
    this.hud.enemyArrow.classList.add("is-hidden");
    this.updateLighting(false);
    this.state.phase = "clear";
    this.state.phaseTime = 1.2;
    this.gateCloseTarget = 0;
    const repairStacks = this.state.relics.filter((entry) => entry === "repair").length;
    this.state.gateHp = Math.min(this.state.gateMaxHp, this.state.gateHp + repairStacks * 25);
    const maintenanceMultiplier = this.state.mode === "survival" ? 0.65 : 1;
    this.state.gateHp = Math.min(this.state.gateMaxHp, this.state.gateHp + Math.round(this.state.gateMaxHp * 0.06 * maintenanceMultiplier));
    this.state.coreHp = Math.min(this.state.coreMaxHp, this.state.coreHp + Math.round(this.state.coreMaxHp * 0.04 * maintenanceMultiplier));
    this.state.buildings.forEach((building) => {
      if (building.hp > 0) building.hp = Math.min(building.maxHp, building.hp + Math.round(building.maxHp * 0.04 * maintenanceMultiplier));
    });
    if (this.state.mode === "survival") {
      const destroyed = this.state.buildings.filter((building) => building.hp <= 0).length;
      const damagePressure = this.state.recentDamage / Math.max(180, this.state.gateMaxHp + this.state.coreMaxHp);
      this.state.readinessPressure = THREE.MathUtils.clamp(this.state.readinessPressure * 0.82 + damagePressure * 2.1 + destroyed * 0.3, 0, 5);
    }
    if (this.state.relics.includes("ration")) {
      this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 35);
    }
    if (this.state.relics.includes("core-repair")) {
      this.state.coreHp = Math.min(this.state.coreMaxHp, this.state.coreHp + 18);
    }
    this.state.buildings.forEach((building) => {
      building.status ??= { productionPaused: building.hp <= 0, targeted: false, lastHitAt: 0 };
      building.status.targeted = false;
    });
    this.hud.clearTitle.textContent = "守夜成功";
    this.hud.clearSubtitle.textContent = `第 ${this.state.epoch} 夜完成，驿站核心安全`;
    this.hud.waveClear.classList.remove("is-hidden");
    this.setPrompt("ph-check-circle", `第 ${this.state.epoch} 关完成，选择强化后进入下一夜`);
    this.sound.victory();
    this.save();
  }

  private updateClear(delta: number): void {
    if (!this.state) return;
    this.state.phaseTime -= delta;
    if (this.state.phaseTime > 0) return;
    this.openRelicChoices();
  }

  private openRelicChoices(): void {
    if (!this.state || !this.streams) return;
    this.hud.waveClear.classList.add("is-hidden");
    this.state.phase = "relic";
    this.state.phaseTime = 0;
    this.setChoiceUi(true);
    const stackCount = (id: string) => this.state!.relicStacks.find((entry) => entry.id === id)?.stacks ?? 0;
    const isSupplyNight = this.state.mode === "survival" && this.state.epoch % 3 === 0;
    const isBossNight = this.state.epoch % 5 === 0;
    let pool = relics.filter((relic) => stackCount(relic.id) < relic.maxStacks);
    pool = isSupplyNight && !isBossNight
      ? pool.filter((relic) => relic.effect === "supply")
      : pool.filter((relic) => relic.effect !== "supply" || (isBossNight && relic.tags?.includes("boss")));
    if (!isBossNight) pool = pool.filter((relic) => !relic.tags?.includes("boss"));
    // 专属遗物必须对应已建成的实体。否则第一夜拿到“火油塔减速”一类奖励会完全无效。
    const immediatelyUseful = pool.filter((relic) => this.isRelicImmediatelyUseful(relic));
    if (immediatelyUseful.length >= 3) pool = immediatelyUseful;
    if (this.state.epoch < 3) pool = pool.filter((relic) => relic.rarity !== "legendary");
    if (this.state.epoch % 5 !== 0) {
      const nonLegendary = pool.filter((relic) => relic.rarity !== "legendary");
      if (nonLegendary.length >= 3) pool = nonLegendary;
    }
    const fresh = pool.filter((relic) => !this.state!.recentRelicChoices.includes(relic.id));
    if (fresh.length >= 3) pool = fresh;
    const preferredCategories = new Set<string>(
      this.state.buildings.map((building) =>
        building.type === "market" ? "trade" : building.type === "workshop" ? "production" : "weapon"
      )
    );
    const mustIncludeRare = this.state.epoch % 5 === 0 || this.state.rarePity >= 2;
    const rarePool = pool.filter((relic) => relic.rarity === "rare" || relic.rarity === "legendary");
    const preferred = mustIncludeRare && rarePool.length
      ? this.streams.shuffle("event", rarePool)[0]
      : this.streams.shuffle("event", pool.filter((relic) => preferredCategories.has(relic.category)))[0];
    const shuffled = this.streams.shuffle("event", pool.filter((relic) => relic.id !== preferred?.id));
    const choices = [...(preferred ? [preferred] : []), ...shuffled].slice(0, 3);
    while (choices.length < 3) {
      const safeFallbacks = relics.filter((relic) => this.isRelicImmediatelyUseful(relic) && !choices.includes(relic));
      const fallback = this.streams.pick("event", safeFallbacks.length ? safeFallbacks : relics.filter((relic) => !choices.includes(relic)));
      choices.push(fallback);
    }
    this.state.pendingChoices = choices.map((choice) => choice.id);
    this.state.recentRelicChoices = choices.map((choice) => choice.id);
    this.spawnChoices("relic", choices.map((choice) => ({ id: choice.id, color: choice.color })));
    this.setPrompt(isSupplyNight ? "ph-package" : "ph-sparkle", isSupplyNight
      ? "极限守城补给抵达：三选一，固定城池不会迁营扩张"
      : "点击一座遗物台，获得本局强化");
    if (this.state.tutorialStep < 4) this.state.tutorialStep = 4;
    this.save();
  }

  private isRelicImmediatelyUseful(relic: RelicDefinition): boolean {
    if (!this.state) return true;
    if (relic.effect === "supply") return this.state.mode === "survival" || relic.tags?.includes("boss") === true;
    const has = (type: BuildingType) => this.state!.buildings.some((building) => building.type === type && building.hp > 0);
    if (relic.requiresBuilding && !has(relic.requiresBuilding)) return false;
    const hasWeapon = this.state.buildings.some((building) => Boolean(buildings[building.type].attack) && building.hp > 0);
    if (relic.effect === "trade" || relic.effect === "double-trade") return has("market");
    if (relic.effect === "workshop" || relic.effect === "gear" || relic.effect === "resilient") return has("workshop");
    if (relic.effect === "fire") return has("fire");
    if (relic.effect === "pierce") return has("ballista");
    if (relic.effect === "damage") return hasWeapon;
    return true;
  }

  private spawnChoices(kind: "relic" | "route", options: Array<{ id: string; color: number }>): void {
    this.clearChoices();
    const aspect = (this.canvas.clientWidth || window.innerWidth) / Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const xs = aspect > 1.9 ? [-15, 0, 15] : [-7.2, 0, 7.2];
    options.forEach((option, index) => {
      const pedestal = makePedestal(option.color, kind);
      pedestal.position.set(xs[index]!, 0, 1.2);
      pedestal.scale.setScalar(0.92);
      pedestal.userData.choiceIndex = index;
      pedestal.userData.choiceId = option.id;
      pedestal.traverse((child) => {
        child.userData.choiceIndex = index;
        child.userData.choiceId = option.id;
      });
      if (kind === "route") {
        pedestal.getObjectByName("artifact")?.removeFromParent();
        const routeId = option.id.split("|")[0]!;
        const routeRegion = regionById(routeId);
        const miniature = new THREE.Group();
        if (routeId === "oasis") {
          const palm = this.library.model("tree-small", 0x3f7d5b, 0.2);
          palm.scale.setScalar(0.8); palm.position.set(-0.8, 1.7, 0.2); miniature.add(palm);
          const water = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.75), new THREE.MeshStandardMaterial({ color: 0x3d8580, roughness: 0.24 }));
          water.rotation.x = -Math.PI / 2; water.position.set(0.35, 1.78, 0); miniature.add(water);
        } else if (routeId === "canyon") {
          for (const [x, scale] of [[-0.9, 0.9], [0.7, 1.15]] as const) {
            const rock = this.library.model("rocks-large", 0x874a39, 0.34); rock.scale.setScalar(scale); rock.position.set(x, 1.72, 0); miniature.add(rock);
          }
        } else if (routeId === "mist") {
          const beacon = this.library.model("tower-hexagon-mid", 0x566b67, 0.36);
          beacon.scale.setScalar(0.9); beacon.position.set(0, 1.72, 0); miniature.add(beacon);
          const lamp = new THREE.PointLight(0xe0ad59, 0.8, 4); lamp.position.set(0, 3.2, 0); miniature.add(lamp);
        } else {
          const pier = this.library.model("tower-hexagon-base", 0x676270, 0.3);
          pier.scale.setScalar(0.85); pier.position.set(0, 1.72, 0); miniature.add(pier);
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 10), new THREE.MeshStandardMaterial({ color: routeRegion.accent, emissive: routeRegion.accent, emissiveIntensity: 0.45 }));
          lens.rotation.z = Math.PI / 2; lens.position.set(0.5, 3.05, 0); miniature.add(lens);
        }
        pedestal.add(miniature);
      }
      this.world.add(pedestal);
      this.choiceObjects.push(pedestal);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "choice-label";
      label.dataset.choice = String(index);
      if (kind === "relic") {
        const choice = relics.find((entry) => entry.id === option.id);
        const stacks = choice ? this.state?.relicStacks.find((entry) => entry.id === choice.id)?.stacks ?? 0 : 0;
        const rarity = choice?.rarity === "legendary" ? "传奇" : choice?.rarity === "rare" ? "稀有" : "普通";
        label.innerHTML = `<i class="ph ${choice?.icon ?? "ph-sparkle"}"></i><strong>${choice?.name ?? "未知遗物"} · ${rarity}</strong><small>${choice?.text ?? ""}${stacks ? `（已叠 ${stacks} 层）` : ""}</small>`;
      } else {
        const [routeId, moduleId] = option.id.split("|");
        const route = regionById(routeId!);
        const threatNames = route.threat.slice(0, 2).map((type) => enemies[type].name).join("、");
        const moduleNames: Record<string, string> = { "high-ground": "高台射界", "side-gate": "侧门防线", "caravan-yard": "商队院", "mechanism-emplacement": "机关阵地" };
        const moduleText = moduleId ? `<br>区域模块：${moduleNames[moduleId] ?? moduleId}` : "";
        label.innerHTML = `<i class="ph ph-mountains"></i><strong>${route.name}</strong><small>${route.perk}${moduleText}<br>主力敌军：${threatNames}</small>`;
      }
      label.addEventListener("click", () => this.selectChoice(index));
      this.hud.choiceLabels.appendChild(label);
      this.choiceLabels.push(label);
    });
    this.positionWorldUi();
  }

  private async selectChoice(index: number): Promise<void> {
    if (!this.state || !this.streams) return;
    const id = this.state.pendingChoices[index];
    if (!id) return;
    if (this.state.phase === "relic") {
      const relic = relics.find((entry) => entry.id === id);
      if (!relic) return;
      relic.apply(this.state);
      if (this.state.mode === "survival" && relic.effect === "supply") {
        this.state.readinessPressure = Math.max(0, this.state.readinessPressure - 0.45);
      }
      this.state.rarePity = relic.rarity === "common" ? Math.min(3, this.state.rarePity + 1) : 0;
      const existing = this.state.relicStacks.find((entry) => entry.id === relic.id);
      if (existing) existing.stacks = Math.min(relic.maxStacks, existing.stacks + 1);
      else this.state.relicStacks.push({ id: relic.id, stacks: 1 });
      this.sound.build();
      this.burst(this.choiceObjects[index]!.position.clone().setY(3), relic.color, 18);
      this.clearChoices();
      if (this.state.mode === "expedition" && this.state.epoch % 3 === 0) {
        this.state.phase = "route";
        const available = regions.filter((region) => this.meta.unlockedRegions.includes(region.id) && region.id !== this.state!.regionId);
        const routes = this.streams.shuffle("region", available).slice(0, 3);
        while (routes.length < 3) routes.push(regionById(this.state.regionId));
        const modules = this.streams.shuffle("region", ["high-ground", "side-gate", "caravan-yard", "mechanism-emplacement"] as const);
        this.state.pendingChoices = routes.map((route, routeIndex) => this.state!.expansionLevel >= 3 ? `${route.id}|${modules[routeIndex]!}` : route.id);
        this.spawnChoices("route", this.state.pendingChoices.map((routeId) => ({ id: routeId, color: regionById(routeId.split("|")[0]!).accent })));
        this.setPrompt("ph-map-trifold", this.state.expansionLevel >= 3 ? "选择下一片区域及其防线模块" : "选择一座地貌沙盘，迁往下一片区域");
      } else {
        this.nextEpoch();
      }
    } else if (this.state.phase === "route") {
      const [regionId, moduleId] = id.split("|");
      if (this.regionTransitioning) return;
      this.regionTransitioning = true;
      this.state.regionId = regionId!;
      try {
        await this.library.ensureRegionBundle(regionId!);
      } catch (error) {
        this.state.regionId = this.activeVisualRegionId;
        this.setPrompt("ph-warning", `区域资源包加载失败：${error instanceof Error ? error.message : regionId}`);
        return;
      } finally {
        this.regionTransitioning = false;
      }
      this.state.expansionLevel = Math.min(3, this.state.expansionLevel + 1);
      this.state.regionModule = (moduleId as GameState["regionModule"]) ?? this.state.regionModule;
      this.state.terrainVariant = Math.floor(this.streams.next("world") * 4);
      this.renderHotbar();
      this.renderModelThumbnails();
      this.sound.build();
      this.nextEpoch();
    }
  }

  private clearChoices(): void {
    for (const object of this.choiceObjects) this.removeWorldObject(object);
    this.choiceObjects = [];
    this.choiceLabels.forEach((label) => label.remove());
    this.choiceLabels = [];
  }

  /** Choice and route selection are exclusive scene states, not overlays on a selected building. */
  private setChoiceUi(active: boolean): void {
    this.hud.root.classList.toggle("is-choice-phase", active);
    if (active) {
      this.selectedBuildingId = null;
      this.selectedEnemyId = null;
      this.selectedBuild = null;
      this.selectedResourceId = null;
      if (this.relocation) this.cancelRelocation(false);
      if (this.preview) {
        this.removeWorldObject(this.preview);
        this.preview = undefined;
      }
      if (this.rangeIndicator) {
        this.removeWorldObject(this.rangeIndicator);
        this.rangeIndicator = undefined;
      }
      this.hud.context.classList.add("is-hidden");
      this.hud.gateBar.classList.add("is-choice-hidden");
      this.hud.coreBar.classList.add("is-choice-hidden");
      this.hud.buildingLabels.classList.add("is-choice-hidden");
      this.hud.hotbar.classList.add("is-choice-hidden");
      this.hud.pauseButton.classList.add("is-choice-hidden");
      this.hud.speed.classList.add("is-choice-hidden");
      this.hud.endDay.classList.add("is-choice-hidden");
      this.hud.autoDeploy.classList.add("is-choice-hidden");
      return;
    }
    this.hud.gateBar.classList.remove("is-choice-hidden");
    this.hud.coreBar.classList.remove("is-choice-hidden");
    this.hud.buildingLabels.classList.remove("is-choice-hidden");
    this.hud.hotbar.classList.remove("is-choice-hidden");
    this.hud.pauseButton.classList.remove("is-choice-hidden");
    this.hud.speed.classList.remove("is-choice-hidden");
    this.hud.endDay.classList.remove("is-choice-hidden");
    this.hud.autoDeploy.classList.remove("is-choice-hidden");
  }

  private nextEpoch(): void {
    if (!this.state) return;
    this.clearChoices();
    this.setChoiceUi(false);
    this.state.epoch += 1;
    this.state.phase = "day";
    this.hornedThisDay = false;
    this.state.dayLength = this.state.mode === "survival" && this.state.epoch > 1 ? 12 : 20;
    this.state.phaseTime = this.state.dayLength;
    this.state.gathered = [];
    this.state.fieldObjective = null;
    this.state.nightModifier = this.streams?.pick("event", nightModifiersForEpoch(this.state.epoch)) ?? null;
    this.state.nightSpeed = 1;
    const dayHeal = this.state.relics.filter((entry) => entry === "day-heal").length * 18;
    this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 18 + dayHeal);
    this.state.player.position = { x: 0, z: 3.5 };
    if (this.state.epoch >= 3 && !this.meta.unlockedRegions.includes("stardust")) this.meta.unlockedRegions.push("stardust");
    this.buildWorld();
    const expansionMessage = this.state.tutorialStep === 4
      ? "第二夜：点击建筑可升级或迁移；城门外三处道路缺口可安装拒马"
      : this.state.mode === "survival"
      ? `固定驿站守至第 ${this.state.epoch} 夜。城外资源将逐渐减少，善用生产、维修与战利品`
      : this.state.expansionLevel === 1
      ? "左右侧院已开放：8 处功能区可用；可点布局图标自动整理防线"
      : this.state.expansionLevel === 2
        ? "侧翼堡台已开放：10 处功能区可用；远程武器应部署到前墙与侧墙"
        : this.state.expansionLevel === 3
          ? "后勤院已开放：12 处功能区可用；生产后移，前排重新布防"
        : "第 1 夜备战，生产建筑正在持续工作";
    this.setPrompt("ph-storefront", expansionMessage);
    this.updateHud(true);
    this.save();
  }

  private animateChoices(delta: number): void {
    const time = performance.now() * 0.001;
    this.choiceObjects.forEach((object, index) => {
      object.rotation.y += delta * (0.08 + index * 0.02);
      object.position.y = Math.sin(time * 1.6 + index) * 0.06;
    });
  }

  private fireProjectile(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
    const object = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.08, 0.48, 4, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1 })
    );
    object.position.copy(from);
    this.world.add(object);
    this.projectiles.push({ object, from, to, progress: 0, duration: 0.18 });
  }

  private updateProjectiles(delta: number): void {
    for (const projectile of this.projectiles) {
      projectile.progress += delta / projectile.duration;
      projectile.object.position.lerpVectors(projectile.from, projectile.to, Math.min(1, projectile.progress));
      projectile.object.lookAt(projectile.to);
    }
    const finished = this.projectiles.filter((projectile) => projectile.progress >= 1);
    finished.forEach((projectile) => this.removeWorldObject(projectile.object));
    this.projectiles = this.projectiles.filter((projectile) => projectile.progress < 1);
  }

  private burst(position: THREE.Vector3, color: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const object = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.13),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22 })
      );
      object.position.copy(position);
      object.castShadow = true;
      this.world.add(object);
      this.particles.push({
        object,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4.5, 2 + Math.random() * 4, (Math.random() - 0.5) * 4.5),
        life: 0.55 + Math.random() * 0.45
      });
    }
  }

  private updateParticles(delta: number): void {
    for (const particle of this.particles) {
      particle.life -= delta;
      particle.velocity.y -= 8.5 * delta;
      particle.object.position.addScaledVector(particle.velocity, delta);
      particle.object.rotation.x += delta * 5;
      particle.object.rotation.y += delta * 4;
    }
    const finished = this.particles.filter((particle) => particle.life <= 0);
    finished.forEach((particle) => this.removeWorldObject(particle.object));
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  private updateFallenVisuals(delta: number): void {
    for (const fallen of this.fallenVisuals) {
      fallen.life -= delta;
      fallen.mixer?.update(delta);
      const progress = 1 - Math.max(0, fallen.life) / fallen.duration;
      // Skeletal characters use their authored death clip. Only non-rigged siege props
      // use the old rigid-body fall, so the two systems never fight each other.
      if (!fallen.mixer) {
        fallen.object.rotation.z = fallen.direction * Math.min(1.25, progress * 1.45);
        fallen.object.position.y = Math.max(-0.28, fallen.object.position.y - delta * 0.48);
      }
      const scale = Number(fallen.object.userData.baseScale ?? 1) * (1 - progress * 0.12);
      fallen.object.scale.setScalar(scale);
    }
    const finished = this.fallenVisuals.filter((fallen) => fallen.life <= 0);
    finished.forEach((fallen) => this.removeWorldObject(fallen.object));
    this.fallenVisuals = this.fallenVisuals.filter((fallen) => fallen.life > 0);
  }

  private updateLighting(night: boolean): void {
    const region = regionById(this.state?.regionId ?? "oasis");
    const sun = this.scene.getObjectByName("sun") as THREE.DirectionalLight | undefined;
    const ambient = this.scene.getObjectByName("ambient") as THREE.HemisphereLight | undefined;
    const moonFill = this.scene.getObjectByName("moon-fill") as THREE.DirectionalLight | undefined;
    if (sun) {
      sun.intensity = night ? 1.04 * this.nightBrightness : 3.65;
      sun.color.set(night ? 0x91acd2 : 0xffd8a1);
    }
    if (ambient) {
      ambient.intensity = night ? 0.94 * this.nightBrightness : 1.16;
      ambient.color.set(night ? 0xb6cde4 : 0xd8ccb4);
      ambient.groundColor.set(night ? 0x273f49 : 0x294347);
    }
    if (moonFill) moonFill.intensity = night ? 0.42 * this.nightBrightness : 0;
    this.world.traverse((object) => {
      if (object.name === "fort-torch-light" && object instanceof THREE.PointLight) {
        object.intensity = night ? Number(object.userData.baseIntensity ?? 2.65) * this.nightBrightness : 0.28;
      }
    });
    const dayExposure = this.effectiveQuality === "low" ? 0.98 : 0.94;
    this.renderer.toneMappingExposure = night ? dayExposure * (1.08 + (this.nightBrightness - 1) * 0.55) : dayExposure;
    this.scene.background = new THREE.Color(night ? 0x203c4a : region.sky);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(night ? 0x294955 : region.fog);
      const profile = regionVisualProfiles[region.id] ?? regionVisualProfiles.oasis!;
      const dayDensity = profile.weather === "mist" ? 0.0115 : profile.weather === "wind" ? 0.0082 : 0.0068;
      this.scene.fog.density = night ? Math.max(0.0115, dayDensity * 1.18) : dayDensity;
    }
  }

  private updateHud(force = false): void {
    if (!this.state) return;
    const phaseNames = {
      day: "发展备战",
      night: "守住城门",
      clear: "守夜成功",
      relic: "选择强化",
      route: "迁往新驿站",
      adventure: "行者历练",
      "adventure-choice": "选择战利品",
      gameover: "驿站失守"
    };
    const activeRegion = regionById(this.state.regionId);
    const weatherRule = this.state.regionId === "mist" ? "雾降低远程射界" : this.state.regionId === "canyon" ? "峡风强化投射器械" : this.state.regionId === "stardust" ? "星砂强化机关与机巧" : "商路气候稳定";
    this.hud.region.title = `${activeRegion.perk}；${weatherRule}`;
    const tutorialObjective = this.state.mode === "expedition" && !this.meta.seenTutorial && this.state.phase === "day"
      ? this.state.tutorialStep === 0
        ? "第一步：选择底部商栈，再点击后院发光地基"
        : this.state.tutorialStep === 1
          ? "第二步：选择底部床弩，再点击门楼发光地基"
          : this.state.tutorialStep === 2
            ? "防线已就绪：点击月亮，开始第一夜"
            : null
      : null;
    this.hud.region.textContent = `${this.state.mode === "survival" ? "极限" : "远征"} · ${activeRegion.name}`;
    this.hud.phase.textContent = this.state.phase === "day"
      ? this.state.mode === "survival" ? "固守备战" : "远征备战"
      : this.state.phase === "night"
        ? this.state.mode === "survival" ? "高压攻城" : "商路夜袭"
        : phaseNames[this.state.phase];
    const nextWorkshopMaterial = (["木材", "石料", "机巧"] as const)[this.state.workshopRotation % 3]!;
    const hasWorkingWorkshop = this.state.buildings.some((building) => building.type === "workshop" && building.hp > 0);
    const productionHint = hasWorkingWorkshop
      ? ` · ${Math.max(1, Math.ceil(this.state.productionTimer))}秒后产${nextWorkshopMaterial}`
      : "";
    this.hud.objective.textContent = tutorialObjective ?? (this.state.phase === "day"
      ? this.state.mode === "survival"
        ? `固定 8 处功能区 · 战备压力 ${Math.round(this.state.readinessPressure * 20)}% · ${this.state.epoch % 3 === 0 ? "本夜后补给" : `再守 ${3 - this.state.epoch % 3} 夜补给`}${productionHint}`
        : `${this.state.regionModule ? `区域战术：${({ "high-ground": "高台射界", "side-gate": "侧门防线", "caravan-yard": "商队院", "mechanism-emplacement": "机关阵地" } as const)[this.state.regionModule]} · ` : ""}探索或建设${productionHint}`
      : this.state.phase === "night"
        ? `过关条件：击退本夜全部 ${this.state.enemies.length + this.spawnQueue.length} 名敌军`
        : this.state.phase === "clear"
          ? "本关完成，准备领取强化"
          : this.state.phase === "relic"
            ? "选择一项强化进入下一关"
            : this.state.phase === "route"
              ? "三关已过，选择下一座驿站"
              : "核心被摧毁，本局结束");
    this.hud.epoch.textContent = `第 ${this.state.epoch} 夜`;
    this.hud.time.textContent = tutorialObjective ? "引导中" : this.state.phase === "day"
      ? `准备 ${this.formatTime(this.state.phaseTime)}`
      : this.state.phase === "night"
        ? `敌军 ${this.state.enemies.length + this.spawnQueue.length}`
        : this.state.phase === "clear"
          ? "已过关"
          : "作出选择";
    this.hud.day.style.width = `${tutorialObjective ? 100 : this.state.phase === "day" ? Math.max(0, this.state.phaseTime / this.state.dayLength) * 100 : this.state.phase === "night" ? 100 : 0}%`;
    this.hud.playerHp.style.width = `${Math.max(0, this.state.player.hp / this.state.player.maxHp) * 100}%`;
    this.hud.gateHp.style.width = `${Math.max(0, this.state.gateHp / this.state.gateMaxHp) * 100}%`;
    this.hud.coreHp.style.width = `${Math.max(0, this.state.coreHp / this.state.coreMaxHp) * 100}%`;
    this.hud.gateBar.classList.toggle("is-danger", this.state.gateHp / this.state.gateMaxHp < 0.32);
    this.hud.coreBar.classList.toggle("is-danger", this.state.coreHp / this.state.coreMaxHp < 0.45);
    const playerX = this.playerRig?.root.position.x ?? 99;
    const playerZ = this.playerRig?.root.position.z ?? 99;
    const nearGate = Math.hypot(playerX, playerZ + 12) < 7.5;
    const nearCore = Math.hypot(playerX - CORE_POSITION.x, playerZ - CORE_POSITION.z) < 7;
    const showGate = nearGate || this.gateStatusTimer > 0 || this.state.gateHp / this.state.gateMaxHp < 0.55 || this.state.tutorialStep === 2;
    const showCore = nearCore || this.coreStatusTimer > 0 || this.state.gateHp <= 0 || this.state.coreHp / this.state.coreMaxHp < 0.7;
    this.hud.gateBar.classList.toggle("is-idle-status", !showGate);
    this.hud.coreBar.classList.toggle("is-idle-status", !showCore);
    this.hud.coreHpText.textContent = `${Math.ceil(this.state.coreHp)}/${this.state.coreMaxHp}`;
    for (const key of Object.keys(this.hud.values) as ResourceKey[]) {
      this.hud.values[key].textContent = Math.floor(this.state.resources[key]).toString();
    }
    const rates = this.economyRates();
    for (const key of Object.keys(this.hud.rates) as ResourceKey[]) {
      this.hud.rates[key].textContent = `+${rates[key]}/3秒`;
    }
    this.hud.gateLevel.textContent = `城门 Lv.${this.state.gateLevel}`;
    this.hud.gateHpText.textContent = `${Math.ceil(this.state.gateHp)}/${this.state.gateMaxHp}`;
    const gateCost = this.gateUpgradePrice();
    // 城门按钮保持可点，材料不足时由 upgradeGate 给出明确缺口；只有阶段不允许时才禁用。
    this.hud.gateUpgradeCost.innerHTML = this.formatCostMarkup(gateCost, true);
    this.hud.gateUpgrade.disabled = !this.canBuildNow();
    this.hud.gateUpgrade.classList.toggle("is-unaffordable", !canAfford(this.state.resources, gateCost));
    const gateRepair = this.gateRepairQuote();
    this.hud.gateRepairCost.innerHTML = gateRepair.restore > 0 ? this.formatCostMarkup(gateRepair.cost, true) : "完好";
    this.hud.gateRepair.disabled = gateRepair.restore <= 0 || (this.state.phase !== "day" && this.state.phase !== "night");
    this.hud.gateRepair.classList.toggle("is-unaffordable", gateRepair.restore > 0 && !canAfford(this.state.resources, gateRepair.cost));
    this.hud.gateRepair.title = gateRepair.restore <= 0
      ? "城门完好"
      : `${gateRepair.emergency ? "夜间抢修" : "白天完整修缮"} ${Math.round(gateRepair.restore)} 耐久，消耗 ${this.formatCost(gateRepair.cost)}`;
    // 选中建筑的按钮也随生产结算即时刷新；材料刚好凑齐时不必关闭再点一次建筑。
    const selectedBuilding = this.selectedBuildingId
      ? this.state.buildings.find((building) => building.id === this.selectedBuildingId)
      : undefined;
    if (selectedBuilding) {
      const selectedUpgradeCost = upgradeCost(selectedBuilding.type, selectedBuilding.level);
      const selectedRepairCost = this.repairCost(selectedBuilding);
      const selectedUpgradeAffordable = canAfford(this.state.resources, selectedUpgradeCost);
      const selectedRepairAffordable = canAfford(this.state.resources, selectedRepairCost);
      this.hud.upgradeCost.innerHTML = this.formatCostMarkup(selectedUpgradeCost, true);
      this.hud.upgrade.classList.toggle("is-unaffordable", !selectedUpgradeAffordable);
      this.hud.upgrade.title = selectedUpgradeAffordable
        ? `升级消耗：${this.formatCost(selectedUpgradeCost)}`
        : `还差：${this.formatMissingCost(selectedUpgradeCost)}`;
      this.hud.repairCost.innerHTML = this.formatCostMarkup(selectedRepairCost, true);
      this.hud.repair.classList.toggle("is-unaffordable", selectedBuilding.hp < selectedBuilding.maxHp - 0.5 && !selectedRepairAffordable);
      this.hud.repair.title = selectedBuilding.hp >= selectedBuilding.maxHp - 0.5
        ? "建筑完好，无需修理"
        : selectedRepairAffordable ? `修理消耗：${this.formatCost(selectedRepairCost)}` : `还差：${this.formatMissingCost(selectedRepairCost)}`;
    }
    this.hud.endDay.style.display = this.state.phase === "day" ? "" : "none";
    this.hud.autoDeploy.style.display = this.state.phase === "day" ? "" : "none";
    this.hud.autoDeploy.disabled = this.state.phase !== "day" || this.state.enemies.length > 0;
    this.hud.speed.classList.toggle("is-hidden", this.state.phase !== "night");
    this.hud.speed.innerHTML = `<b>${this.state.nightSpeed}x</b>`;
    const modifier = this.state.nightModifier;
    this.hud.modifier.classList.toggle("is-hidden", !modifier || (this.state.phase !== "day" && this.state.phase !== "night"));
    if (modifier) {
      const icon = this.hud.modifier.querySelector("i");
      const text = this.hud.modifier.querySelector("span");
      if (icon) icon.className = `ph ${modifier.icon}`;
      if (text) text.textContent = modifier.name;
      this.hud.modifier.title = modifier.description;
    }
    this.hud.enemyCount.textContent = `敌军 ${this.state.enemies.length + this.spawnQueue.length}`;
    const activeBoss = this.state.enemies.find((enemy) => enemy.bossKind && enemy.hp > 0);
    this.hud.bossBar.classList.toggle("is-hidden", !activeBoss || this.state.phase !== "night");
    if (activeBoss?.bossKind) {
      const actionNames: Record<BossAction, string> = {
        advance: `第 ${activeBoss.bossPhase + 1} 阶段`, formation: "举盾列阵", shockwave: "震地预警",
        "plant-charge": "埋设炸药", detonate: "连锁爆破", split: "释放子鸢", dive: "俯冲预警",
        charge: "蓄力撞门", recover: "调整架势"
      };
      this.hud.bossName.textContent = bossDefinitions[activeBoss.bossKind].name;
      this.hud.bossAction.textContent = actionNames[activeBoss.bossAction];
      this.hud.bossHp.style.width = `${Math.max(0, activeBoss.hp / activeBoss.maxHp) * 100}%`;
    }
    const objective = this.state.fieldObjective;
    this.hud.fieldObjective.classList.toggle("is-hidden", this.state.phase !== "day" || !objective || objective.completed);
    if (objective && !objective.completed && this.playerRig) {
      const distance = Math.round(this.playerRig.root.position.distanceTo(new THREE.Vector3(objective.position.x, 0, objective.position.z)));
      const names = { mine: "矿脉", ruin: "遗迹", caravan: "商队", elite: "哨所", artisan: "匠师", aid: "援军", scout: "侦察", repair: "修缮", cache: "密匣" };
      this.hud.fieldObjectiveText.textContent = `${names[objective.type]} ${distance}m`;
      const icon = this.hud.fieldObjective.querySelector("i");
      const icons = { mine: "ph-pickaxe", ruin: "ph-mountains", caravan: "ph-storefront", elite: "ph-crosshair", artisan: "ph-hammer", aid: "ph-shield-star", scout: "ph-binoculars", repair: "ph-hammer", cache: "ph-treasure-chest" };
      if (icon) icon.className = `ph ${icons[objective.type]}`;
    }
    this.hud.hotbar.querySelectorAll<HTMLButtonElement>(".build-slot").forEach((button) => {
      const type = button.dataset.build as BuildingType;
      if (type && buildings[type]) {
        const cost = buildings[type].cost;
        const affordable = canAfford(this.state!.resources, cost);
        button.disabled = !this.canBuildNow() || !this.isTutorialBuildAllowed(type);
        button.classList.toggle("is-unaffordable", !affordable);
        const keys: ResourceKey[] = ["coin", "wood", "stone", "gear"];
        const chips = [...button.querySelectorAll<HTMLElement>(".cost-chip")];
        let chipIndex = 0;
        for (const key of keys) {
          const amount = cost[key] ?? 0;
          if (amount <= 0) continue;
          chips[chipIndex]?.classList.toggle("is-missing", this.state!.resources[key] < amount);
          chipIndex += 1;
        }
        return;
      }
      const fortification = this.state!.fortifications.find((entry) => !entry.built || entry.hp <= 0)
        ?? this.state!.fortifications.find((entry) => entry.level < 3);
      const upgrading = Boolean(fortification?.built && fortification.hp > 0);
      const woodCost = fortification ? (upgrading ? 8 + fortification.level * 6 : 10) : Infinity;
      const stoneCost = fortification ? (upgrading ? 4 + fortification.level * 3 : 4) : Infinity;
      const affordable = this.state!.resources.wood >= woodCost && this.state!.resources.stone >= stoneCost;
      button.disabled = !this.canBuildNow() || !this.isTutorialBuildAllowed("fortify");
      button.classList.toggle("is-unaffordable", !affordable);
    });
    for (const building of this.state.buildings) {
      const expectedVisualState = `${building.level}:${building.specialization ?? "base"}:${building.hp <= 0 ? "destroyed" : building.hp / Math.max(1, building.maxHp) < 0.62 ? "damaged" : "intact"}`;
      if (this.buildingObjects.get(building.id)?.userData.visualState !== expectedVisualState) this.refreshBuildingVisual(building);
      const label = this.buildingLabels.get(building.id);
      if (!label) continue;
      const level = label.querySelector("strong");
      const hp = label.querySelector<HTMLElement>("span > i");
      if (level) level.textContent = `Lv.${building.level}`;
      if (hp) hp.style.width = `${Math.max(0, building.hp / building.maxHp) * 100}%`;
      label.classList.toggle("is-selected", building.id === this.selectedBuildingId);
      const show = building.id === this.selectedBuildingId
        || building.hp < building.maxHp
        || building.status?.targeted
        || performance.now() - (building.status?.lastHitAt ?? 0) < 2500;
      label.classList.toggle("is-idle-status", !show);
    }
    const visibleEnemyIds = this.state.enemies
      .filter((enemy) => !enemy.bossKind && (enemy.elite || enemy.hp < enemy.maxHp || enemy.targetedUntil > performance.now() || enemy.id === this.selectedEnemyId || enemy.target === "building" || enemy.target === "core" || (enemy.type === "looter" && enemy.target === "gate")))
      .sort((a, b) => Number(b.id === this.selectedEnemyId) - Number(a.id === this.selectedEnemyId) || a.hp / a.maxHp - b.hp / b.maxHp)
      .slice(0, qualityPresets[this.effectiveQuality].maxVisibleHealthBars)
      .map((enemy) => enemy.id);
    for (const enemy of this.state.enemies) {
      const visual = this.enemyObjects.get(enemy.id);
      if (!visual) continue;
      const strong = visual.label.querySelector("strong");
      const fill = visual.label.querySelector<HTMLElement>("span i");
      if (strong) {
        const slowed = enemy.slowedUntil > performance.now();
        const targetIcon = enemy.target === "gate"
          ? "ph-door"
          : enemy.target === "building"
            ? "ph-hammer"
            : enemy.target === "core"
              ? "ph-house-line"
              : "ph-person-simple-run";
        const enemyName = enemy.bossKind ? bossDefinitions[enemy.bossKind].name : enemies[enemy.type].name;
        strong.innerHTML = enemy.id === this.selectedEnemyId
          ? `<b>${enemy.elite && !enemy.bossKind ? "精锐 " : ""}${enemyName}</b><small>${Math.ceil(enemy.hp)}/${enemy.maxHp}</small>`
          : `<b aria-label="${enemies[enemy.type].name}${slowed ? "，已减速" : ""}"></b>`;
      }
      if (fill) fill.style.width = `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`;
      visual.label.classList.toggle("is-protected", (enemy.protectedUntil ?? 0) > performance.now());
      visual.label.classList.toggle("is-idle-status", Boolean(enemy.bossKind) || !visibleEnemyIds.includes(enemy.id));
    }
    if (force) this.positionWorldUi();
  }

  private positionWorldUi(): void {
    if (this.gateObject) this.positionElement(this.hud.gateBar, new THREE.Vector3(0, 6.3, -12));
    if (this.coreObject) this.positionElement(this.hud.coreBar, CORE_POSITION.clone().setY(5.45));
    if (this.selectedBuildingId) {
      const object = this.buildingObjects.get(this.selectedBuildingId);
      if (object) this.positionElement(this.hud.context, object.position.clone().setY(6.6));
    }
    this.choiceObjects.forEach((object, index) => {
      const label = this.choiceLabels[index];
      if (label) this.positionElement(label, object.position.clone().setY(5.4));
    });
    for (const [id, object] of this.buildingObjects) {
      const label = this.buildingLabels.get(id);
      if (label) this.positionElement(label, object.position.clone().setY(5.6));
    }
    if (this.playerRig) {
      const playerPosition = this.playerRig.root.position;
      const outside = !this.isInsideFort(playerPosition);
      for (const resource of this.resources) {
        const label = this.resourceLabels.get(resource.id);
        if (!label) continue;
        const distance = playerPosition.distanceTo(resource.position);
        const routeSelected = resource.id === this.selectedResourceId;
        const nearbyRadius = window.innerWidth < 700 ? 15 : 22;
        // 院内不让八个资源牌抢 HUD；出城后，附近资源和已点选资源才获得清晰标签。
        const availableForGathering = this.state?.phase === "day";
        label.classList.toggle("is-idle-status", !availableForGathering || !(routeSelected || (outside && distance < nearbyRadius)));
        this.positionElement(label, resource.position.clone().setY(4.25));
      }
    }
    for (const visual of this.enemyObjects.values()) {
      this.positionElement(visual.label, visual.object.position.clone().setY(visual.object.position.y + 3.6));
    }
  }

  private updateGateBarPosition(): void {
    if (this.gateObject) this.positionElement(this.hud.gateBar, new THREE.Vector3(0, 6.3, -12));
    if (this.coreObject) this.positionElement(this.hud.coreBar, CORE_POSITION.clone().setY(5.45));
  }

  private positionElement(element: HTMLElement, position: THREE.Vector3): void {
    const vector = position.clone().project(this.camera);
    const halfWidth = Math.max(96, element.offsetWidth * 0.5 + 8);
    const x = THREE.MathUtils.clamp(
      (vector.x * 0.5 + 0.5) * this.canvas.clientWidth,
      halfWidth,
      this.canvas.clientWidth - halfWidth
    );
    const isMobile = this.canvas.clientWidth <= 540;
    const minimumY = isMobile
      ? element === this.hud.context
        ? 360
        : element === this.hud.gateBar
          ? 254
          : 218
      : 92;
    const y = THREE.MathUtils.clamp((-vector.y * 0.5 + 0.5) * this.canvas.clientHeight, minimumY, this.canvas.clientHeight - 130);
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  private setPrompt(icon: string, text: string): void {
    this.hud.promptIcon.className = `ph ${icon}`;
    this.hud.promptText.textContent = text;
    this.hud.prompt.classList.remove("is-hidden");
    // 引导阶段保留更久；常规提示淡出，避免文字长时间盖住真实场景。
    this.promptTimer = this.state?.tutorialStep !== undefined && this.state.tutorialStep < 3 ? 8 : 4.2;
  }

  private formatTime(seconds: number): string {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  private togglePause(force?: boolean): void {
    if (!this.running) return;
    this.paused = force ?? !this.paused;
    this.hud.pause.classList.toggle("is-hidden", !this.paused);
    const seedLabel = document.querySelector<HTMLElement>("#worldSeed");
    if (seedLabel && this.state) seedLabel.textContent = `本局世界编号 ${this.state.seed}`;
    this.hud.pauseButton.innerHTML = `<i class="ph ${this.paused ? "ph-play" : "ph-pause"}"></i>`;
    if (!this.paused) this.clock.getDelta();
  }

  private endRun(): void {
    if (!this.state) return;
    const finished = this.state;
    this.running = false;
    finished.phase = "gameover";
    this.meta.renown += Math.max(1, Math.floor(finished.renownEarned / 3 + finished.epoch));
    const recordValue = finished.mode === "training" ? (finished.adventure?.room ?? 1) : finished.epoch;
    this.meta.records[finished.mode] = Math.max(this.meta.records[finished.mode], recordValue);
    if (finished.mode !== "training") {
      this.meta.prosperityRecords[finished.mode] = Math.max(this.meta.prosperityRecords[finished.mode], finished.prosperity);
      this.meta.bossRecords[finished.mode] = Math.max(this.meta.bossRecords[finished.mode], finished.bossKills);
      this.meta.eventRecords[finished.mode] = Math.max(this.meta.eventRecords[finished.mode], finished.eventsCompleted);
    }
    const envelope: SaveEnvelope = {
      schema: "silk-road-bastion",
      version: 7,
      savedAt: Date.now(),
      run: null,
      meta: this.meta
    };
    this.writeEnvelope(this.activeSlot, envelope);
    document.querySelector("#resultEpoch")!.textContent = finished.mode === "training"
      ? `行至第 ${finished.adventure?.room ?? 1} 处营地`
      : finished.mode === "survival" ? `极限固守 ${finished.epoch} 夜` : `远征抵达第 ${finished.epoch} 夜`;
    document.querySelector("#resultStats")!.innerHTML = finished.mode === "training"
      ? `等级 ${finished.adventure?.level ?? 1}<br>获得装备 ${finished.adventure?.gear.length ?? 0}<br>获得声望 ${Math.max(1, Math.floor(finished.renownEarned / 3 + finished.epoch))}`
      : finished.mode === "survival"
        ? `固定八处功能区 · 击败 ${finished.kills} 名敌军<br>精锐首领 ${finished.bossKills} · 战备压力 ${Math.round(finished.readinessPressure * 20)}%<br>剩余库存 ${Math.floor(finished.resources.coin + finished.resources.wood + finished.resources.stone + finished.resources.gear)} · 繁荣 ${finished.prosperity}<br>获得声望 ${Math.max(1, Math.floor(finished.renownEarned / 3 + finished.epoch))}`
        : `扩建至 ${6 + finished.expansionLevel * 2} 处功能区 · 击败 ${finished.kills} 名敌军<br>首领 ${finished.bossKills} · 商路事件 ${finished.eventsCompleted}<br>最终区域 ${regionById(finished.regionId).name} · 繁荣 ${finished.prosperity}<br>获得声望 ${Math.max(1, Math.floor(finished.renownEarned / 3 + finished.epoch))}`;
    this.hud.root.classList.add("is-hidden");
    this.hud.waveClear.classList.add("is-hidden");
    this.hud.gameOver.classList.remove("is-hidden");
  }

  save(): void {
    const envelope: SaveEnvelope = {
      schema: "silk-road-bastion",
      version: 7,
      savedAt: Date.now(),
      run: this.state && this.state.phase !== "gameover" ? this.state : null,
      meta: this.meta
    };
    this.writeEnvelope(this.activeSlot, envelope);
  }

  private slotKey(slot = this.activeSlot): string { return `${SAVE_KEY}:slot:${slot}`; }

  /**
   * 隐私模式、浏览器存储配额或系统策略可能拒绝 localStorage 写入。
   * 对局不能因此中断；只提示一次，并保留导出存档作为可转移的安全出口。
   */
  private writeEnvelope(slot: number, envelope: SaveEnvelope): boolean {
    try {
      localStorage.setItem(this.slotKey(slot), JSON.stringify(envelope));
      this.storageWarningShown = false;
      return true;
    } catch {
      if (!this.storageWarningShown && this.running) {
        this.storageWarningShown = true;
        this.setPrompt("ph-warning", "本机存储暂不可写，请在暂停页导出存档以保留本局");
      }
      return false;
    }
  }

  private normalizeEnvelope(value: unknown): SaveEnvelope | null {
    const candidate = migrateSaveEnvelope(value);
    return candidate && isSafeSaveEnvelope(candidate) ? candidate : null;
  }

  private migrateLegacySlots(): void {
    try {
      for (let slot = 0; slot < 3; slot += 1) {
        if (localStorage.getItem(`${SAVE_KEY}:slot:${slot}`)) continue;
        const legacyKey = `${PREVIOUS_SAVE_KEY}:slot:${slot}`;
        const raw = localStorage.getItem(legacyKey);
        if (!raw) continue;
        const migrated = this.normalizeEnvelope(JSON.parse(raw));
        if (!migrated) continue;
        localStorage.setItem(`${PREVIOUS_SAVE_KEY}:backup:slot:${slot}`, raw);
        localStorage.setItem(`${SAVE_KEY}:slot:${slot}`, JSON.stringify(migrated));
      }
    } catch {
      // 本地存储不可用时继续运行；玩家仍可通过导出文件迁移。
    }
  }

  private envelopeForSlot(slot: number): SaveEnvelope | null {
    try {
      const raw = localStorage.getItem(this.slotKey(slot));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      return this.normalizeEnvelope(parsed);
    } catch { return null; }
  }

  public renderSaveSlots(): void {
    const root = document.querySelector<HTMLElement>("#saveSlots");
    if (!root) return;
    root.innerHTML = "";
    for (let slot = 0; slot < 3; slot += 1) {
      const envelope = this.envelopeForSlot(slot);
      const run = envelope?.run;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `save-slot${slot === this.activeSlot ? " is-active" : ""}${run ? "" : " is-empty"}`;
      const isPreviewSave = run?.mode === "training";
      const mode = run ? (isPreviewSave ? "行者历练 · 后续开放" : modeName(run.mode)) : "空档位";
      const saved = run ? new Date(envelope!.savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
      const detail = run
        ? (isPreviewSave ? "旧测试存档保留，仅可导出或被新局覆盖" : `第 ${run.epoch} 夜 · ${regionById(run.regionId).name} · ${saved}`)
        : "新局会保存到这里";
      button.innerHTML = `<i class="ph ${run ? "ph-floppy-disk" : "ph-plus-circle"}"></i><span><b>档位 ${slot + 1} · ${mode}</b><small>${detail}</small></span>`;
      button.title = run && !isPreviewSave ? `选择并继续：${detail}` : `选择档位 ${slot + 1}，新建世界将保存于此`;
      button.addEventListener("click", () => {
        this.activeSlot = slot;
        this.renderSaveSlots();
        this.refreshTitleUi();
      });
      root.appendChild(button);
    }
  }

  public exportSaves(): void {
    const slots = [0, 1, 2].map((slot) => this.envelopeForSlot(slot));
    const blob = new Blob([JSON.stringify({ schema: "silk-road-bastion-export", version: 7, assetVersion: ASSET_VERSION, exportedAt: Date.now(), slots }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "silk-road-bastion-v7-save.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  public async importSaves(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text()) as { schema?: string; version?: number; slots?: Array<SaveEnvelope | null> };
      if (parsed.schema !== "silk-road-bastion-export" || ![6, 7].includes(parsed.version ?? -1) || !Array.isArray(parsed.slots)) throw new Error("格式不正确");
      let imported = 0;
      parsed.slots.slice(0, 3).forEach((envelope, slot) => {
        const migrated = this.normalizeEnvelope(envelope);
        if (migrated && this.writeEnvelope(slot, migrated)) imported += 1;
      });
      if (imported === 0) throw new Error("无法写入本机存储");
      this.meta = this.loadMeta();
      this.renderSaveSlots();
      this.refreshTitleUi();
      this.setPrompt("ph-check-circle", "存档已导入，可选择档位继续游戏");
    } catch {
      this.setPrompt("ph-warning", "导入失败：请选择有效的丝路堡垒 v6 或 v7 存档");
    }
  }

  private loadEnvelope(): SaveEnvelope | null {
    return this.envelopeForSlot(this.activeSlot);
  }

  private loadMeta(): MetaProgress {
    const current = this.loadEnvelope();
    if (current?.meta) return current.meta;
    return emptyMeta();
  }
}
