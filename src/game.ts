import * as THREE from "three";
import {
  buildings,
  bossEnemyType,
  bossForNight,
  canAfford,
  createGame,
  directorWave,
  enemyHealthScale,
  emptyMeta,
  enemies,
  nightModifiers,
  modeName,
  pay,
  regionById,
  regions,
  relics,
  ASSET_VERSION,
  PREVIOUS_SAVE_KEY,
  SAVE_KEY,
  SeedStreams,
  upgradeCost
} from "./data";
import {
  AssetLibrary,
  enemyCharacterKind,
  makeBuildModel,
  makeCore,
  makeFortWallSegment,
  makeGatehouse,
  makePedestal,
  makeResource,
  type CharacterRig
} from "./models";
import { migrateSaveEnvelope } from "./save-migration";
import type {
  BuildingState,
  BuildingType,
  BossKind,
  EnemyState,
  EnemyType,
  GameMode,
  GameState,
  HeroClass,
  MetaProgress,
  RegionDefinition,
  ResourceKey,
  Resources,
  SaveEnvelope,
  SaveSlotSummary,
  RelicDefinition
} from "./types";

const BUILD_ORDER: BuildingType[] = ["market", "workshop", "ballista", "fire", "antiair", "trebuchet"];
const ROAD_LANES = [-3.2, 0, 3.2];
/** 城门外三条来袭通道各有一个道路附件位；拒马只能放在这些位置，不与院内建筑抢地基。 */
function fortificationPosition(lane: number): THREE.Vector3 {
  const lateral = ROAD_LANES[lane + 1] ?? 0;
  // 拒马在门外的第一段商道，而不是远处装饰区：默认镜头无需缩放就能识别三处施工位。
  return new THREE.Vector3(lateral, 0, lane === 0 ? -17.5 : -16.55);
}
// 主帐放在院落视觉中心、前排石台之后：默认俯视镜头同时能读到城门、道路和守护目标，
// 不会被靠近镜头的后墙长期遮住。
const CORE_POSITION = new THREE.Vector3(0, 0, 7.6);
const PAD_POSITIONS = [
  new THREE.Vector3(-5.5, 0, -5.2),
  new THREE.Vector3(5.5, 0, -5.2),
  new THREE.Vector3(-12, 0, -3),
  new THREE.Vector3(12, 0, -3),
  new THREE.Vector3(-11, 0, 4.2),
  new THREE.Vector3(11, 0, 4.2),
  new THREE.Vector3(-6.5, 0, 9.5),
  new THREE.Vector3(6.5, 0, 9.5),
  new THREE.Vector3(-11.5, 0, 14.2),
  new THREE.Vector3(11.5, 0, 14.2),
  new THREE.Vector3(-7.2, 0, 22.2),
  new THREE.Vector3(7.2, 0, 22.2)
];
// 每种地貌模块都有独立资源布局；所有位置均落在已铺设的商道/支路上。
// 因此不同世界不只是资源类型轮换，出城路线、风险与先拿哪一堆材料也会改变。
const RESOURCE_LAYOUTS = [
  [
    new THREE.Vector3(-24, 0, -22), new THREE.Vector3(23, 0, -20),
    new THREE.Vector3(-27, 0, 3), new THREE.Vector3(27, 0, 6),
    new THREE.Vector3(-18, 0, -34), new THREE.Vector3(18, 0, -34),
    new THREE.Vector3(-28, 0, -12), new THREE.Vector3(28, 0, -8),
    new THREE.Vector3(-42, 0, -48), new THREE.Vector3(42, 0, -46)
  ],
  [
    new THREE.Vector3(-23, 0, -18), new THREE.Vector3(23, 0, -17),
    new THREE.Vector3(-28, 0, -13), new THREE.Vector3(28, 0, -9),
    new THREE.Vector3(-15, 0, -35), new THREE.Vector3(15, 0, -35),
    new THREE.Vector3(-23, 0, 3), new THREE.Vector3(23, 0, 5),
    new THREE.Vector3(-43, 0, 14), new THREE.Vector3(43, 0, 12)
  ],
  [
    new THREE.Vector3(-18, 0, -34), new THREE.Vector3(18, 0, -34),
    new THREE.Vector3(-24, 0, -22), new THREE.Vector3(23, 0, -20),
    new THREE.Vector3(-27, 0, 3), new THREE.Vector3(27, 0, 6),
    new THREE.Vector3(-28, 0, -13), new THREE.Vector3(28, 0, -9),
    new THREE.Vector3(-41, 0, -47), new THREE.Vector3(41, 0, 18)
  ],
  [
    new THREE.Vector3(-13, 0, -30), new THREE.Vector3(14, 0, -29),
    new THREE.Vector3(-24, 0, -22), new THREE.Vector3(23, 0, -20),
    new THREE.Vector3(-15, 0, -35), new THREE.Vector3(15, 0, -35),
    new THREE.Vector3(-28, 0, -13), new THREE.Vector3(28, 0, -9),
    new THREE.Vector3(-44, 0, 11), new THREE.Vector3(44, 0, -45)
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
  private musicMode: "calm" | "danger" | "choice" = "calm";
  private musicCooldown = 0;
  private musicStep = 0;
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

  setLevels(music: number, effects: number): void {
    this.ensure();
    if (!this.context) return;
    this.musicGain?.gain.setTargetAtTime(THREE.MathUtils.clamp(music, 0, 1), this.context.currentTime, 0.035);
    this.effectsGain?.gain.setTargetAtTime(THREE.MathUtils.clamp(effects, 0, 1), this.context.currentTime, 0.035);
    this.ambienceGain?.gain.setTargetAtTime(THREE.MathUtils.clamp(music * 0.82, 0, 1), this.context.currentTime, 0.035);
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

  updateMusic(phase: GameState["phase"], delta: number): void {
    if (!this.context || this.context.state !== "running" || this.muted) return;
    const nextMode = phase === "night" ? "danger" : phase === "relic" || phase === "route" || phase === "clear" ? "choice" : "calm";
    if (nextMode !== this.musicMode) {
      this.musicMode = nextMode;
      this.musicStep = 0;
      this.musicCooldown = 0;
    }
    this.musicCooldown -= delta;
    if (this.musicCooldown > 0) return;

    if (this.musicMode === "danger") {
      const pulse = [110, 165, 147, 196, 123, 165, 147, 220];
      const note = pulse[this.musicStep % pulse.length]!;
      this.note(note, 0.32, this.musicStep % 2 === 0 ? 0.018 : 0.011, "triangle");
      if (this.musicStep % 4 === 0) {
        this.noise(0.11, 0.014, 240);
        this.tone(66, 0.16, "sine", 0.018);
      }
      this.musicCooldown = 0.46;
    } else if (this.musicMode === "choice") {
      const choiceNotes = [220, 277.18, 329.63, 415.3, 329.63, 277.18];
      this.note(choiceNotes[this.musicStep % choiceNotes.length]!, 0.85, 0.016);
      this.musicCooldown = 0.92;
    } else {
      const calmNotes = [220, 0, 277.18, 329.63, 0, 392, 329.63, 277.18];
      const note = calmNotes[this.musicStep % calmNotes.length]!;
      if (note > 0) this.note(note, 0.78, 0.013);
      if (this.musicStep % 8 === 0) this.note(110, 1.8, 0.009, "sine");
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
  private selectedBuildingId: string | null = null;
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
  private distantPanorama?: THREE.Mesh;
  private fieldObject?: THREE.Group;
  private fortificationObjects = new Map<string, THREE.Group>();
  private titlePreview = true;
  private sound = new Soundscape();
  private storageWarningShown = false;
  private effectiveQuality: "low" | "medium" | "high" = "high";
  private qualitySampleTime = 0;
  private qualityFrames = 0;
  private qualityStableTime = 0;
  private courtyardPavingTexture?: THREE.Texture;
  private caravanRoadTexture?: THREE.Texture;
  private silkRoadPanoramaTexture?: THREE.Texture;
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
    coreHp: document.querySelector<HTMLElement>("#coreHpFill")!,
    coreHpText: document.querySelector<HTMLElement>("#coreHpText")!,
    coreBar: document.querySelector<HTMLElement>("#coreWorldBar")!,
    prompt: document.querySelector<HTMLElement>("#prompt")!,
    promptIcon: document.querySelector<HTMLElement>("#promptIcon")!,
    promptText: document.querySelector<HTMLElement>("#promptText")!,
    enemyArrow: document.querySelector<HTMLElement>("#enemyArrow")!,
    enemyCount: document.querySelector<HTMLElement>("#enemyCount")!,
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
    sound: document.querySelector<HTMLButtonElement>("#soundBtn")!,
    audioPanel: document.querySelector<HTMLElement>("#audioPanel")!,
    musicVolume: document.querySelector<HTMLInputElement>("#musicVolume")!,
    effectsVolume: document.querySelector<HTMLInputElement>("#effectsVolume")!,
    muteAudio: document.querySelector<HTMLButtonElement>("#muteAudioBtn")!,
    pauseButton: document.querySelector<HTMLButtonElement>("#pauseBtn")!,
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
    this.silkRoadPanoramaTexture = new THREE.TextureLoader().load("./assets/art/silk-road-panorama-v1.jpg");
    this.silkRoadPanoramaTexture.colorSpace = THREE.SRGBColorSpace;
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
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.effectiveQuality = coarsePointer || window.innerWidth < 820 ? "medium" : "high";
    this.applyQuality();
    this.camera = new THREE.PerspectiveCamera(39, 1, 0.1, 180);
    this.bindEvents();
    this.resize();
    this.renderHotbar();
    this.renderModelThumbnails();
  }

  showTitle(): void {
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
    this.camera.position.set(0, 16.5, -31);
    this.camera.lookAt(0, 2.9, 2.2);
  }

  newGame(mode: GameMode, seed: string, hero: HeroClass = "guardian"): void {
    // 第一版保留行者历练的封面预告与旧存档兼容，但不允许从任何入口开启半完成模式。
    if (mode === "training") return;
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
    this.streams = new SeedStreams(this.state.rng);
    this.running = true;
    this.paused = false;
    this.selectedBuild = null;
    this.selectedBuildingId = null;
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
    this.hud.adventure.classList.add("is-hidden");
    this.updateHud(true);
    this.setPrompt("ph-storefront", "先在发光石台建造商栈，主帐和商栈会持续产币");
    this.save();
  }

  continueGame(): boolean {
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
    this.meta = envelope.meta;
    this.mode = this.state.mode;
    this.streams = new SeedStreams(this.state.rng);
    this.running = true;
    this.paused = false;
    this.hornedThisDay = this.state.phase === "day" && this.state.phaseTime <= 8;
    this.resetGameplayCamera();
    this.renderHotbar();
    this.renderModelThumbnails();
    this.hud.root.classList.toggle("is-adventure", this.mode === "training");
    this.hud.adventure.classList.toggle("is-hidden", this.mode !== "training");
    const preservedAdventureEnemies = this.mode === "training" ? [...this.state.enemies] : [];
    if (this.mode !== "training") this.state.enemies = [];
    if (this.state.phase === "night") {
      this.state.phase = "day";
      this.state.phaseTime = Math.max(6, this.state.dayLength * 0.5);
    }
    this.buildWorld();
    if (this.state.phase === "relic") {
      const choices = this.state.pendingChoices
        .map((id) => relics.find((entry) => entry.id === id))
        .filter((entry): entry is (typeof relics)[number] => Boolean(entry));
      this.spawnChoices("relic", choices.map((entry) => ({ id: entry.id, color: entry.color })));
    } else if (this.state.phase === "route") {
      this.spawnChoices("route", this.state.pendingChoices.map((id) => ({ id, color: regionById(id).accent })));
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
    // 竖屏略微拉远，保证城门、主帐和首批石台能同时进入可读视野，而不是只看见角色脚边。
    this.camera.fov = this.camera.aspect < 0.82 ? 52 : this.camera.aspect > 1.9 ? 42 : 44;
    const limits = this.cameraLimits(width, height);
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance, limits.min, limits.max);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
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
    this.canvas.addEventListener("wheel", (event) => {
      this.changeCameraDistance(this.cameraDistance + Math.sign(event.deltaY) * 2.5);
    }, { passive: true });

    document.querySelector("#skillBtn")?.addEventListener("click", () => this.action());
    this.hud.adventureSkill.addEventListener("click", () => this.adventureSkill());
    document.querySelector("#upgradeBtn")?.addEventListener("click", () => this.upgradeSelected());
    document.querySelector("#repairBtn")?.addEventListener("click", () => this.repairSelected());
    this.hud.workshopMode.addEventListener("click", () => this.cycleBuildingSpecialization());
    this.hud.demolish.addEventListener("click", () => this.demolishSelected());
    this.hud.gateUpgrade.addEventListener("click", () => this.upgradeGate());
    this.hud.pauseButton.addEventListener("click", () => this.togglePause());
    this.hud.endDay.addEventListener("click", () => {
      if (this.state?.mode === "expedition" && !this.meta.seenTutorial && this.state.tutorialStep < 2) {
        this.setPrompt("ph-compass", this.state.tutorialStep === 0
          ? "第一步：点底部“商栈”，再点院内发光石台"
          : "第二步：点底部“床弩”，再点第二座发光石台");
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
    const updateAudioLevels = () => this.sound.setLevels(Number(this.hud.musicVolume.value) / 100, Number(this.hud.effectsVolume.value) / 100);
    this.hud.musicVolume.addEventListener("input", updateAudioLevels);
    this.hud.effectsVolume.addEventListener("input", updateAudioLevels);
    this.hud.muteAudio.addEventListener("click", () => {
      this.sound.setMuted(!this.sound.muted);
      const icon = this.sound.muted ? "ph-speaker-slash" : "ph-speaker-high";
      this.hud.sound.innerHTML = `<i class="ph ${icon}"></i>`;
      this.hud.muteAudio.innerHTML = `<i class="ph ${icon}"></i>${this.sound.muted ? "恢复声音" : "静音"}`;
    });
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

  private clearWorld(): void {
    this.scene.clear();
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
    this.projectiles = [];
    this.particles = [];
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
    this.preview = undefined;
    this.rangeIndicator = undefined;
    this.distantPanorama = undefined;
    this.clickRoute = [];
    this.moveRouteGuide = undefined;
  }

  private buildWorld(): void {
    const activeState = this.state ?? createGame("expedition", "TITLE", this.meta);
    const region = regionById(activeState.regionId);
    this.clearWorld();
    const isNightPreview = this.titlePreview && activeState.mode === "survival";
    this.scene.background = new THREE.Color(isNightPreview ? 0x142c38 : region.sky);
    // 白天远景保留层次而不是用浓雾把整张地图洗成灰色；夜袭才收紧雾距制造压力。
    this.scene.fog = new THREE.FogExp2(isNightPreview ? 0x1f3940 : region.fog, isNightPreview ? 0.014 : 0.0068);

    // 环境光只负责保留阴影里的材质细节；主方向光负责塑造砖墙、圆顶和道路的体积。
    // 过去两者都太亮，场景会像均匀打光的沙盒摆件。
    const hemi = new THREE.HemisphereLight(0xd8ccb4, 0x294347, isNightPreview ? 0.72 : 1.16);
    hemi.name = "ambient";
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(isNightPreview ? 0x7890af : 0xffd8a1, isNightPreview ? 0.78 : 3.65);
    sun.position.set(-22, 38, -18);
    sun.castShadow = true;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    sun.shadow.mapSize.set(coarsePointer || window.innerWidth < 820 ? 1024 : 1536, coarsePointer || window.innerWidth < 820 ? 1024 : 1536);
    sun.shadow.camera.left = -44;
    sun.shadow.camera.right = 44;
    sun.shadow.camera.top = 44;
    sun.shadow.camera.bottom = -44;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.018;
    sun.name = "sun";
    this.scene.add(sun);

    if (activeState.mode === "training") {
      this.buildTrainingWorld(region, activeState);
      return;
    }

    // 同一套实拍质感土石贴图按区域着色：峡谷、雾港和高原也保留碎石、车辙与磨损，
    // 不再只有绿洲有材质、其他地图退回一整块纯色平面。
    const terrainTexture = this.library.worldTexture(`region-${region.id}`);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: terrainTexture ? 0xffffff : region.ground,
      map: terrainTexture ?? null,
      bumpMap: terrainTexture ?? null,
      bumpScale: 0.18,
      roughness: 0.98
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(156, 136, 42, 38), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -13;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    this.ground = ground;
    this.world.add(ground);
    this.buildTerrainShelf(region);
    this.buildDistantPanorama(region, isNightPreview);

    // 主商道是“可以走出去”的视觉锚点，刻意比荒漠更亮、更规整；
    // 不能再让它与环境底色混成一片，导致玩家以为自己只能在城里活动。
    if (this.caravanRoadTexture) this.caravanRoadTexture.repeat.set(1.18, 5.6);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 54),
      new THREE.MeshStandardMaterial({
        color: this.caravanRoadTexture ? 0xffffff : new THREE.Color(region.ground).lerp(new THREE.Color(0xe3cb91), 0.68),
        map: this.caravanRoadTexture ?? terrainTexture ?? null,
        bumpMap: this.caravanRoadTexture ?? terrainTexture ?? null,
        bumpScale: 0.075,
        roughness: 0.9,
        emissive: new THREE.Color(region.ground).lerp(new THREE.Color(0x372818), 0.2),
        emissiveIntensity: 0.08
      })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.012, -35);
    road.receiveShadow = true;
    road.userData.ground = true;
    this.world.add(road);

    const fortBack = this.fortBackZ(activeState);
    const floorDepth = fortBack + 12;
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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, floorDepth), floorMaterial);
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

    if (this.titlePreview) {
      const rig = this.library.character("ranger", region.accent);
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
        (["raider", "brute", "raider"] as const).forEach((kind, index) => {
          const enemyRig = this.library.character(kind, 0xb06a4c);
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

  /**
   * 给开放地图一个不规则、有厚度的地貌边缘。上层仍是可点击的平面，
   * 下层只负责远景、阴影和“驿站处在一片真实地形中”的空间感。
   */
  private buildTerrainShelf(region: RegionDefinition): void {
    const outline: Array<[number, number]> = [
      [-73, 53], [-54, 59], [-27, 56], [2, 62], [34, 57], [68, 51],
      [75, 34], [70, 12], [74, -12], [69, -38], [72, -65], [55, -78],
      [28, -75], [2, -82], [-27, -77], [-57, -79], [-76, -63], [-70, -36],
      [-75, -8], [-69, 18], [-74, 39]
    ];
    const shape = new THREE.Shape();
    outline.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    });
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 2.5,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.75,
      bevelThickness: 0.45,
      curveSegments: 2
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -2.72, -13);
    const shelf = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(region.ground).lerp(new THREE.Color(0x263839), 0.38),
        roughness: 1,
        metalness: 0
      })
    );
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    this.world.add(shelf);
  }

  /**
   * 原创远景只承担真实尺度、光照层次与区域氛围；前景仍是可交互的 Three.js 地形、建筑和单位。
   * 不参与射线检测，因而不会抢走地面移动或资源交互点击。
   */
  private buildDistantPanorama(region: RegionDefinition, nightPreview: boolean): void {
    if (!this.silkRoadPanoramaTexture) return;
    const tint = nightPreview ? 0x2a3b48 : region.id === "mist" ? 0xaab9af : region.id === "canyon" ? 0xc58a70 : region.id === "stardust" ? 0x9187ab : 0xffffff;
    const material = new THREE.MeshBasicMaterial({
      map: this.silkRoadPanoramaTexture,
      color: tint,
      transparent: false,
      fog: false,
      side: THREE.DoubleSide
    });
    const panorama = new THREE.Mesh(new THREE.PlaneGeometry(278, 156), material);
    panorama.renderOrder = -2;
    panorama.frustumCulled = false;
    panorama.raycast = () => undefined;
    this.world.add(panorama);
    this.distantPanorama = panorama;
    this.placeDistantPanorama();
  }

  /** 远景始终在镜头前方很远处，避免俯视角把它压到地面以下，同时不影响实际世界坐标。 */
  private placeDistantPanorama(): void {
    if (!this.distantPanorama) return;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.distantPanorama.position.copy(this.camera.position).addScaledVector(forward, 136);
    this.distantPanorama.quaternion.copy(this.camera.quaternion);
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
    for (const object of this.adventureProps) this.world.remove(object);
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
    this.enemyObjects.forEach((visual) => { this.world.remove(visual.object); visual.label.remove(); });
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
        bossKind: null, bossPhase: 0, attackRange: type === "archer" ? 15 : 1.6, windupUntil: 0
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
      } else if (enemy.attackCooldown <= 0) {
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
    const add = (name: string, x: number, z: number, rotation: number, scale = 2.15, tintStrength = 0.34): THREE.Object3D => {
      const object = this.library.model(name, 0x9c7654, tintStrength);
      object.position.set(x, 0, z);
      object.rotation.y = rotation;
      object.scale.setScalar(scale);
      this.world.add(object);
      return object;
    };
    const wallColor = region.id === "mist" ? 0x71807a : region.id === "canyon" ? 0x925e49 : 0x9b7958;
    const placeWall = (length: number, x: number, z: number, rotation = 0): void => {
      const segment = makeFortWallSegment(length, wallColor);
      segment.position.set(x, 0, z);
      segment.rotation.y = rotation;
      this.world.add(segment);
    };
    placeWall(13.7, -11.15, -12);
    placeWall(13.7, 11.15, -12);
    const backZ = this.fortBackZ();
    const sideLength = backZ + 12;
    const sideCenter = (backZ - 12) * 0.5;
    placeWall(36, 0, backZ);
    placeWall(sideLength, -18, sideCenter, Math.PI / 2);
    placeWall(sideLength, 18, sideCenter, Math.PI / 2);
    add("wall-corner", -18, -12, Math.PI / 2, 2.3);
    add("wall-corner", 18, -12, 0, 2.3);
    add("wall-corner", -18, backZ, Math.PI, 2.3);
    add("wall-corner", 18, backZ, -Math.PI / 2, 2.3);
    const gate = makeGatehouse(region.accent, wallColor);
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
  }

  private buildFortifications(region: RegionDefinition): void {
    if (!this.state) return;
    for (const fortification of this.state.fortifications) {
      const root = new THREE.Group();
      const active = fortification.built && fortification.hp > 0;
      const foundationMaterial = new THREE.MeshStandardMaterial({ color: active ? 0x6d6253 : 0x81745f, roughness: 0.96 });
      const foundation = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.18, 2.05), foundationMaterial);
      foundation.position.y = 0.09;
      foundation.receiveShadow = true;
      foundation.castShadow = true;
      root.add(foundation);
      const cornerMaterial = new THREE.MeshStandardMaterial({ color: active ? 0x815436 : region.accent, roughness: 0.7, metalness: active ? 0.06 : 0.2 });
      for (const [x, z] of [[-1.55, -0.72], [1.55, -0.72], [-1.55, 0.72], [1.55, 0.72]] as const) {
        const anchor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.17, 8), cornerMaterial);
        anchor.position.set(x, 0.25, z);
        anchor.castShadow = true;
        root.add(anchor);
      }
      if (active) {
        const branchColor = fortification.branch === "sand" ? 0xb38a55 : fortification.branch === "oil" ? 0x3f4544 : 0x6f4930;
        const material = new THREE.MeshStandardMaterial({ color: branchColor, roughness: 0.9, metalness: fortification.branch === "oil" ? 0.18 : 0.03 });
        for (const offset of [-1.18, -0.4, 0.4, 1.18]) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.15, 7), material);
          spike.rotation.x = Math.PI / 2;
          spike.position.set(offset, 0.88, 0);
          spike.castShadow = true;
          root.add(spike);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.26, 0.34), material);
        beam.position.y = 0.52;
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
        // 这不是城内石台：三处位置严格位于城门外商道，直接点击任意一处即可施工。
        const stakeMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3b28, roughness: 0.95 });
        for (const x of [-1.35, 1.35]) {
          const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.55, 7), stakeMaterial);
          stake.position.set(x, 0.78, 0);
          stake.castShadow = true;
          root.add(stake);
        }
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 2.72, 6), new THREE.MeshStandardMaterial({ color: 0xb99a63, roughness: 0.94 }));
        rope.rotation.z = Math.PI * 0.5;
        rope.position.y = 1.22;
        root.add(rope);
        // 两根斜置的预装木料让施工位从高处看也像“尚未完成的拒马”，而不是普通装饰旗。
        const previewBeamMaterial = new THREE.MeshStandardMaterial({ color: 0x96613d, roughness: 0.92 });
        for (const rotation of [-0.58, 0.58]) {
          const previewBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.7), previewBeamMaterial);
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
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(1.32, 1.48, 28),
          new THREE.MeshBasicMaterial({ color: 0xe5a840, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
        );
        marker.rotation.x = -Math.PI * 0.5;
        marker.position.y = 0.205;
        marker.name = "fortification-marker";
        marker.raycast = () => undefined;
        root.add(marker);
        const signal = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), new THREE.MeshStandardMaterial({ color: 0xe5a840, emissive: 0xe5a840, emissiveIntensity: 0.72, roughness: 0.48 }));
        signal.position.set(0, 5.62, -0.4);
        signal.name = "fortification-signal";
        root.add(signal);
      }
      root.position.copy(fortificationPosition(fortification.lane));
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
    const columns = 14;
    const backZ = this.fortBackZ();
    const rows = Math.ceil((backZ + 9) / 1.76);
    const paving = new THREE.InstancedMesh(geometry, material, columns * rows);
    const matrix = new THREE.Matrix4();
    let instance = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const offset = row % 2 === 0 ? 0 : 1.12;
        const x = -15.7 + column * 2.35 + offset;
        const z = -8.5 + row * 1.76;
        if (x > 16.3 || z > backZ - 1.4) {
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
    const unlockedPads = this.state
      ? this.state.mode === "survival"
        ? 8
        : Math.min(PAD_POSITIONS.length, 6 + this.state.expansionLevel * 2)
      : PAD_POSITIONS.length;
    PAD_POSITIONS.slice(0, unlockedPads).forEach((position, index) => {
      const isFreshExpansion = this.isFreshExpansionPad(index);
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(region.floor).lerp(new THREE.Color(0x4e463c), 0.34),
        roughness: 0.9,
        metalness: 0.03
      });
      // 可建位是驿站预留的石砌地基，而不是悬在地上的抽象圆圈：
      // 带倒角感的方形基座、压实石面、铜条和固定钉能与商栈/床弩的尺度对应。
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(4.62, 0.34, 4.08),
        baseMaterial
      );
      pad.position.copy(position).setY(0.15);
      pad.receiveShadow = true;
      pad.userData.padIndex = index;
      // 内嵌铜质压条与四枚固定钉也在未建造时给出明确但不刺眼的可放置提示。
      const isTutorialTarget = this.tutorialPadIndex() === index;
      const inlayMaterial = new THREE.MeshStandardMaterial({
        color: isTutorialTarget || isFreshExpansion ? region.accent : 0x5d786e,
        emissive: isTutorialTarget || isFreshExpansion ? region.accent : 0x000000,
        emissiveIntensity: isTutorialTarget ? 0.45 : isFreshExpansion ? 0.25 : 0,
        roughness: 0.45,
        metalness: 0.46
      });
      const inlay = new THREE.Mesh(new THREE.BoxGeometry(3.56, 0.035, 3.08), inlayMaterial);
      inlay.position.y = 0.19;
      inlay.name = "pad-inlay";
      inlay.receiveShadow = true;
      pad.add(inlay);
      const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xa68b5d, roughness: 0.48, metalness: 0.52 });
      for (const [x, z, width, depth] of [[0, -1.66, 3.78, 0.12], [0, 1.66, 3.78, 0.12], [-1.9, 0, 0.12, 3.42], [1.9, 0, 0.12, 3.42]] as const) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, depth), trimMaterial);
        trim.position.set(x, 0.23, z);
        trim.castShadow = true;
        pad.add(trim);
      }
      for (const [x, z] of [[-1.52, -1.28], [1.52, -1.28], [-1.52, 1.28], [1.52, 1.28]] as const) {
        const anchor = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.17, 0.12, 8),
          new THREE.MeshStandardMaterial({ color: 0x3c4544, roughness: 0.4, metalness: 0.72 })
        );
        anchor.position.set(x, 0.25, z);
        pad.add(anchor);
      }
      pad.userData.inlayMaterial = inlayMaterial;
      if (isFreshExpansion) {
        // 新院落并非只“多两个数字格子”：给未占用的新石台挂上可见的施工架，
        // 直到玩家在此建造，才撤走施工标识并回归正常院落。
        const marker = new THREE.Group();
        marker.name = "expansion-pad-marker";
        const timber = new THREE.MeshStandardMaterial({ color: 0x715036, roughness: 0.94 });
        for (const x of [-1.42, 1.42]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.05, 7), timber);
          post.position.set(x, 1.02, 1.22);
          post.castShadow = true;
          marker.add(post);
        }
        const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.11, 0.12), timber);
        crossbar.position.set(0, 1.86, 1.22);
        crossbar.castShadow = true;
        marker.add(crossbar);
        const banner = this.library.model("flag-banner-long", region.accent, 0.28);
        banner.position.set(0.18, 2.1, 1.18);
        banner.scale.setScalar(0.62);
        marker.add(banner);
        const signal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.22, 0),
          new THREE.MeshStandardMaterial({ color: 0xe4b04d, emissive: 0xe4b04d, emissiveIntensity: 0.55, roughness: 0.5 })
        );
        signal.name = "expansion-pad-signal";
        signal.position.set(0, 2.32, 1.16);
        marker.add(signal);
        pad.add(marker);
        pad.userData.expansionMarker = marker;
      }
      this.world.add(pad);
      this.buildPads.push(pad);
    });
    const core = makeCore(region.accent);
    core.position.copy(CORE_POSITION);
    core.userData.core = true;
    this.world.add(core);
    this.coreObject = core;
  }

  private fortBackZ(state = this.state): number {
    const expansion = state?.mode === "expedition" ? state.expansionLevel : 0;
    return 18 + Math.min(3, expansion) * 4;
  }

  private tutorialPadIndex(): number {
    if (!this.state || this.meta.seenTutorial) return -1;
    if (this.state.tutorialStep === 0) return 0;
    if (this.state.tutorialStep === 1) return 1;
    return -1;
  }

  /** 当前扩建刚解锁、且还没有被建筑占用的两座石台。 */
  private isFreshExpansionPad(index: number): boolean {
    if (!this.state || this.state.mode !== "expedition" || this.state.expansionLevel <= 0) return false;
    const firstNewIndex = 6 + (this.state.expansionLevel - 1) * 2;
    return index >= firstNewIndex
      && index < firstNewIndex + 2
      && !this.state.buildings.some((building) => building.padIndex === index);
  }

  private refreshTutorialPads(): void {
    const target = this.tutorialPadIndex();
    this.buildPads.forEach((pad, index) => {
      const material = pad.userData.inlayMaterial as THREE.MeshStandardMaterial | undefined;
      if (!material) return;
      const accent = regionById(this.state?.regionId ?? "oasis").accent;
      const expansionPad = this.isFreshExpansionPad(index);
      material.color.set(index === target || expansionPad ? accent : 0x5d786e);
      material.emissive.set(index === target || expansionPad ? accent : 0x000000);
      material.emissiveIntensity = index === target ? 0.45 : expansionPad ? 0.25 : 0;
    });
  }

  private spawnScenery(region: RegionDefinition): void {
    const terrainVariant = this.state?.terrainVariant ?? 0;
    // 底图有贴图时仍必须保留独立的主商道实体；只靠 ground 的颜色调整会被贴图覆盖，
    // 在俯视镜头里几乎看不出来。这条路从城门直达地图外缘，也是玩家离城后的第一条视觉引导。
    const mainRoadBed = new THREE.Mesh(
      new THREE.BoxGeometry(9.15, 0.036, 50.2),
      new THREE.MeshStandardMaterial({ color: 0x655039, roughness: 1 })
    );
    mainRoadBed.position.set(0, 0.042, -36.6);
    mainRoadBed.receiveShadow = true;
    mainRoadBed.userData.ground = true;
    const mainRoad = new THREE.Mesh(
      new THREE.BoxGeometry(7.55, 0.048, 49.8),
      new THREE.MeshStandardMaterial({
        color: this.caravanRoadTexture ? 0xffffff : region.id === "mist" ? 0xa6b8ad : region.id === "canyon" ? 0xd29b67 : region.id === "stardust" ? 0xb0a0c4 : 0xe4be73,
        map: this.caravanRoadTexture ?? null,
        roughness: 0.87,
        emissive: region.id === "mist" ? 0x17231f : region.id === "canyon" ? 0x27160d : region.id === "stardust" ? 0x21172a : 0x2d1a07,
        emissiveIntensity: 0.11
      })
    );
    mainRoad.position.set(0, 0.072, -36.6);
    mainRoad.receiveShadow = true;
    mainRoad.userData.ground = true;
    this.world.add(mainRoadBed, mainRoad);
    // 夯土之上嵌入稀疏石板。它能在顶部镜头里提供道路纹理和明确边界，
    // 同时只是一组实例化网格，不会为移动端额外制造大量 draw call。
    const paverRows = 32;
    const paverColumns = 5;
    const pavers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.22, 0.052, 0.84),
      new THREE.MeshStandardMaterial({
        color: region.id === "mist" ? 0xbac7bc : region.id === "canyon" ? 0xd6a66e : region.id === "stardust" ? 0xc0b0ce : 0xe8ca86,
        roughness: 0.93
      }),
      paverRows * paverColumns
    );
    const paverMatrix = new THREE.Matrix4();
    let paverIndex = 0;
    for (let row = 0; row < paverRows; row += 1) {
      for (let column = 0; column < paverColumns; column += 1) {
        const stagger = row % 2 === 0 ? 0 : 0.25;
        paverMatrix.makeTranslation(-2.9 + column * 1.45 + stagger, 0.12, -13.8 - row * 1.54);
        pavers.setMatrixAt(paverIndex, paverMatrix);
        paverIndex += 1;
      }
    }
    pavers.instanceMatrix.needsUpdate = true;
    pavers.receiveShadow = true;
    pavers.userData.ground = true;
    this.world.add(pavers);
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x9c7950, roughness: 0.96 });
    for (const x of [-4.02, 4.02]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 49.4), edgeMaterial);
      edge.position.set(x, 0.09, -36.6);
      edge.receiveShadow = true;
      edge.userData.ground = true;
      this.world.add(edge);
    }
    const rutMaterial = new THREE.MeshStandardMaterial({ color: 0x51483d, roughness: 1 });
    for (const x of [-1.75, 1.75]) {
      const rut = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 52), rutMaterial);
      rut.rotation.x = -Math.PI / 2;
      rut.position.set(x, 0.025, -35);
      rut.receiveShadow = true;
      rut.userData.ground = true;
      this.world.add(rut);
    }
    // 从城门向可采集物与事件点伸出的商道支路既是故事化布景，也是可走范围的视觉承诺。
    // 玩家看见浅色道路就知道可以出去，而不会再对大片环境装饰逐一试错。
    const pathBedMaterial = new THREE.MeshStandardMaterial({
      color: region.id === "mist" ? 0x55716c : region.id === "canyon" ? 0x704b38 : region.id === "stardust" ? 0x5e5868 : 0x786041,
      roughness: 1
    });
    const pathMaterial = new THREE.MeshStandardMaterial({
      color: region.id === "mist" ? 0xa7bab0 : region.id === "canyon" ? 0xd1a06e : region.id === "stardust" ? 0xb7a5c4 : 0xe2c27e,
      roughness: 0.9,
      emissive: region.id === "mist" ? 0x162521 : region.id === "canyon" ? 0x2d1710 : region.id === "stardust" ? 0x21192b : 0x2b1b09,
      emissiveIntensity: 0.1
    });
    const addPath = (points: Array<[number, number]>, width = 2.05): void => {
      for (let index = 1; index < points.length; index += 1) {
        const [fromX, fromZ] = points[index - 1]!;
        const [toX, toZ] = points[index]!;
        const dx = toX - fromX;
        const dz = toZ - fromZ;
        const length = Math.hypot(dx, dz);
        const x = (fromX + toX) * 0.5;
        const z = (fromZ + toZ) * 0.5;
        const rotation = Math.atan2(dx, dz);
        // 深色夯土路基 + 浅色石砂路面，远处也能一眼读出可探索的方向。
        const bed = new THREE.Mesh(new THREE.BoxGeometry(width + 0.46, 0.028, length + 0.28), pathBedMaterial);
        bed.position.set(x, 0.04, z);
        bed.rotation.y = rotation;
        bed.receiveShadow = true;
        bed.userData.ground = true;
        const segment = new THREE.Mesh(new THREE.BoxGeometry(width, 0.038, length + 0.16), pathMaterial);
        segment.position.set(x, 0.058, z);
        segment.rotation.y = rotation;
        segment.receiveShadow = true;
        segment.userData.ground = true;
        this.world.add(bed, segment);
      }
    };
    addPath([[0, -15.4], [0, -26.2], [-13.4, -30.2], [-18, -34]], 2.3);
    addPath([[0, -15.4], [0, -25.3], [13.8, -29.2], [18, -34]], 2.3);
    addPath([[0, -17.5], [-11.5, -19.2], [-24, -22]], 1.65);
    addPath([[0, -17.5], [11.5, -19.2], [23, -20]], 1.65);
    // 外圈分支刻意绕开水渠、采石坑与树丛的碰撞半径，保证道路表现和实际可走路线一致。
    addPath([[-18, -34], [-12, -30], [-28, -13]], 1.25);
    addPath([[18, -34], [12, -28], [28, -9]], 1.25);
    addPath([[-18, -34], [-30, -42], [-42, -48]], 1.35);
    addPath([[18, -34], [30, -40], [42, -46]], 1.35);
    addPath([[-28, -13], [-36, 0], [-43, 14]], 1.2);
    addPath([[28, -9], [36, 1], [43, 12]], 1.2);

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
      marker.position.set(x, 0, z);
      marker.rotation.y = heading;
      this.world.add(marker);
    };
    addWayMarker(-7.3, -22.1, -0.78);
    addWayMarker(7.2, -26.7, 0.72);
    addWayMarker(-14.6, -30.7, -0.26);
    for (const [x, z] of [[-4.7, -18], [4.7, -23], [-4.7, -30], [4.7, -37], [-4.7, -44]] as const) {
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
      post.position.set(x, 0, z);
      this.world.add(post);
    }
    const scrubGeometry = new THREE.ConeGeometry(0.34, 0.74, 7);
    const scrubMaterial = new THREE.MeshStandardMaterial({
      color: region.id === "mist" ? 0x536f66 : region.id === "canyon" ? 0x765d3f : 0x6d7446,
      roughness: 1
    });
    const scrub = new THREE.InstancedMesh(scrubGeometry, scrubMaterial, 88);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < 88; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (10 + (index * 7 % 51));
      const z = -66 + (index * 13 % 105);
      const scale = 0.55 + (index % 5) * 0.12;
      matrix.compose(
        new THREE.Vector3(x, 0.35 * scale, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.73, 0)),
        new THREE.Vector3(scale, scale, scale)
      );
      scrub.setMatrixAt(index, matrix);
    }
    scrub.castShadow = true;
    scrub.receiveShadow = true;
    this.world.add(scrub);

    const makeNaturalTree = (scale: number, seed: number): THREE.Group => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2 * scale, 0.34 * scale, 3.4 * scale, 12),
        new THREE.MeshStandardMaterial({ color: 0x5b3e2a, roughness: 0.98 })
      );
      trunk.position.y = 1.7 * scale;
      trunk.rotation.z = Math.sin(seed) * 0.04;
      trunk.castShadow = true;
      tree.add(trunk);
      const leafMaterial = new THREE.MeshStandardMaterial({ color: region.id === "mist" ? 0x3f685e : 0x4f7449, roughness: 0.92 });
      if (region.id === "oasis") {
        for (let index = 0; index < 9; index += 1) {
          const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.11 * scale, 1.55 * scale, 4, 8), leafMaterial);
          const angle = index / 9 * Math.PI * 2 + seed;
          leaf.position.set(Math.cos(angle) * 0.75 * scale, 3.65 * scale, Math.sin(angle) * 0.75 * scale);
          leaf.rotation.z = Math.PI * 0.36;
          leaf.rotation.y = -angle;
          leaf.castShadow = true;
          tree.add(leaf);
        }
      } else {
        for (const [x, y, z, size] of [[-0.45, 3.55, 0.1, 0.92], [0.42, 3.65, -0.16, 1], [0.02, 4.25, 0.12, 0.88], [-0.08, 3.45, -0.48, 0.82]] as const) {
          const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(size * scale, 2), leafMaterial);
          crown.position.set(x * scale, y * scale, z * scale);
          crown.scale.set(1.15, 0.82, 1.05);
          crown.rotation.y = seed + x;
          crown.castShadow = true;
          tree.add(crown);
        }
      }
      return tree;
    };

    const positions: Array<[string, number, number, number, number]> = [
      ["rocks-large", -34, -28, 1.8, 0.4],
      ["rocks-small", 33, -23, 2.1, 1.7],
      ["tree-large", -31, 12, 1.9, 2.2],
      ["tree-small", 29, 18, 2.2, 0.8],
      ["rocks-large", 34, 26, 1.5, 2.8],
      ["tree-small", -34, -3, 1.8, 1.1],
      ["rocks-small", -21, -27, 1.25, 2.4],
      ["rocks-small", 22, -31, 1.35, 0.3]
    ];
    for (const [name, x, z, scale, rotation] of positions) {
      const object = name.startsWith("tree")
        ? makeNaturalTree(scale * 0.62, x * 0.17 + z * 0.09)
        : makeWindWornMound(
            new THREE.MeshStandardMaterial({ color: new THREE.Color(region.ground).lerp(new THREE.Color(0x665b51), 0.5), roughness: 0.98 }),
            scale * 1.7,
            scale * 1.25,
            scale * 1.15,
            x * 0.12 + z * 0.07,
            22
          );
      object.position.set(x, 0, z);
      object.rotation.y = rotation;
      this.world.add(object);
    }

    const variantScenery = [
      [["rocks-large", -25, -15, 1.65], ["tree-small", 25, -9, 1.4]],
      [["tree-large", -27, -12, 1.55], ["rocks-small", 24, -18, 1.75]],
      [["rocks-small", -30, -20, 2.1], ["rocks-large", 28, -11, 1.45]],
      [["tree-small", -24, -26, 1.9], ["tree-large", 27, -24, 1.45]]
] as const;

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
  const vertices: number[] = [0, height, 0];
  const indices: number[] = [];
  const wobble = (index: number, factor: number): number => 1 + Math.sin(seed * 1.73 + index * 2.41) * factor + Math.cos(seed * 0.67 + index * 1.19) * factor * 0.58;
  for (const [radius, y, factor] of [[0.43, height * 0.52, 0.11], [1, 0, 0.16]] as const) {
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
    for (const [name, x, z, scale] of variantScenery[terrainVariant]!) {
      const object = name.startsWith("tree")
        ? makeNaturalTree(scale * 0.56, terrainVariant + x * 0.11)
        : makeWindWornMound(
            new THREE.MeshStandardMaterial({ color: new THREE.Color(region.ground).lerp(new THREE.Color(0x6d6054), 0.46), roughness: 0.98 }),
            scale * 1.65,
            scale * 1.18,
            scale,
            terrainVariant + x * 0.09 + z * 0.05,
            20
          );
      object.position.set(x, 0, z);
      object.rotation.y = (terrainVariant + x * 0.13) % Math.PI;
      this.world.add(object);
    }

    const duneMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(region.ground).lerp(new THREE.Color(region.id === "canyon" ? 0x723e34 : 0xc1a36b), 0.28),
      roughness: 1
    });
    for (const [x, z, sx, sz] of [
      [-30, -40, 8, 5],
      [29, -38, 10, 6],
      [-37, 30, 7, 5],
      [38, 31, 9, 6]
    ] as const) {
      const dune = makeWindWornMound(duneMaterial, sx, sz, 1.55, x * 0.17 + z * 0.11);
      dune.position.set(x, 0.015, z);
      this.world.add(dune);
    }

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
      base.position.set(x, 0.02, z);
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
      ridge.position.set(x, 0.01, z);
      this.world.add(ridge);
    }

    const caravan = makeBuildModel("market", this.library, region);
    caravan.position.set(-10.5, 0, -27);
    caravan.rotation.y = 0.28;
    caravan.scale.setScalar(0.62);
    this.world.add(caravan);
    const supplyTent = makeBuildModel("market", this.library, region);
    supplyTent.position.set(10.8, 0, -29);
    supplyTent.rotation.y = -0.42;
    supplyTent.scale.setScalar(0.5);
    this.world.add(supplyTent);

    // 两个商队停靠点把“城门外道路”变成可被相信的商路：货车、货箱、地毯与油灯
    // 都避开可走路径，仅承担生活痕迹、比例尺和故事氛围。
    const addCaravanStop = (x: number, z: number, rotation: number, clothColor: number): void => {
      const stop = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d29, roughness: 0.92 });
      const darkWood = new THREE.MeshStandardMaterial({ color: 0x3d2a20, roughness: 0.96 });
      const fabric = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.94, side: THREE.DoubleSide });
      const brass = new THREE.MeshStandardMaterial({ color: 0xb98b48, metalness: 0.48, roughness: 0.48, emissive: 0x4f3215, emissiveIntensity: 0.22 });
      const wagonBed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.42, 1.55), wood);
      wagonBed.position.set(0, 1.03, 0);
      wagonBed.castShadow = true;
      wagonBed.receiveShadow = true;
      stop.add(wagonBed);
      for (const wheelX of [-1.15, 1.15]) {
        for (const wheelZ of [-0.88, 0.88]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 14), darkWood);
          wheel.rotation.x = Math.PI * 0.5;
          wheel.position.set(wheelX, 0.55, wheelZ);
          wheel.castShadow = true;
          stop.add(wheel);
        }
      }
      for (const [boxX, boxZ, scale] of [[-0.55, 0, 0.72], [0.55, -0.12, 0.58], [1.68, 0.6, 0.52]] as const) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(scale, scale, scale), wood);
        crate.position.set(boxX, 1.34 + scale * 0.5, boxZ);
        crate.rotation.y = boxX * 0.8;
        crate.castShadow = true;
        crate.receiveShadow = true;
        stop.add(crate);
      }
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.45), fabric);
      rug.rotation.x = -Math.PI * 0.5;
      rug.position.set(-1.75, 0.035, 1.22);
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
      stop.position.set(x, 0, z);
      stop.rotation.y = rotation;
      this.world.add(stop);
    };
    addCaravanStop(-14.8, -28.2, 0.38, region.accent);
    addCaravanStop(14.6, -29.4, -0.34, new THREE.Color(region.accent).offsetHSL(0.06, -0.06, 0.04).getHex());

    for (const x of [-4.4, 4.4]) {
      const marker = this.library.model("wall-pillar", region.accent, 0.32);
      marker.position.set(x, 0, -30.5);
      marker.scale.setScalar(1.45);
      this.world.add(marker);
      const banner = this.library.model("flag-banner-long", region.accent, 0.5);
      banner.position.set(x, 4.1, -30.2);
      banner.scale.setScalar(1.2);
      this.world.add(banner);
    }

    if (region.id === "oasis") {
      for (const [x, z] of [[-19, -21], [-16, -32], [17, -24], [20, -34]] as const) {
        const tree = this.library.model("tree-large", 0x3e8b63, 0.18);
        tree.position.set(x, 0, z);
        tree.scale.setScalar(1.55);
        this.world.add(tree);
      }
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(4.5, 30),
        new THREE.MeshStandardMaterial({ color: 0x4d8f8b, roughness: 0.22, metalness: 0.06 })
      );
      water.rotation.x = -Math.PI / 2;
      water.scale.set(1.6, 0.75, 1);
      water.position.set(-23, 0.04, -36);
      this.world.add(water);
    } else if (region.id === "mist") {
      for (const [x, z, rotation] of [[-23, -24, 0.2], [20, -26, 1.1], [-27, -36, 0.6]] as const) {
        const ruin = this.library.model("wall-doorway", 0x687b75, 0.45);
        ruin.position.set(x, 0, z);
        ruin.rotation.y = rotation;
        ruin.scale.setScalar(1.45);
        this.world.add(ruin);
      }
      const wetGround = new THREE.Mesh(
        new THREE.CircleGeometry(7.5, 28),
        new THREE.MeshStandardMaterial({ color: 0x456b6d, roughness: 0.32 })
      );
      wetGround.rotation.x = -Math.PI / 2;
      wetGround.scale.set(1.55, 0.62, 1);
      wetGround.position.set(22, 0.035, -37);
      this.world.add(wetGround);
    } else if (region.id === "canyon") {
      for (const [x, z, scale] of [[-25, -22, 2.7], [26, -27, 3.1], [-22, -38, 2.4], [24, -41, 2.2]] as const) {
        const rock = this.library.model("rocks-large", 0x8d4c3d, 0.48);
        rock.position.set(x, 0, z);
        rock.scale.setScalar(scale);
        this.world.add(rock);
      }
    } else {
      for (const [x, z] of [[-21, -25], [22, -27], [-17, -38], [18, -40]] as const) {
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(1.15, 0),
          new THREE.MeshStandardMaterial({ color: region.accent, emissive: region.accent, emissiveIntensity: 0.36, roughness: 0.38 })
        );
        crystal.position.set(x, 1.1, z);
        crystal.scale.y = 2.2;
        crystal.castShadow = true;
        this.world.add(crystal);
      }
    }
  }

  private spawnPlayer(region: RegionDefinition): void {
    if (!this.state) return;
    const rig = this.library.character("ranger", region.accent);
    rig.root.position.set(this.state.player.position.x, 0, this.state.player.position.z);
    rig.root.rotation.y = Math.PI;
    rig.root.userData.player = true;
    this.playerRig = rig;
    this.world.add(rig.root);
  }

  private spawnResources(region: RegionDefinition): void {
    if (!this.state || !this.streams) return;
    const baseTypes: Array<"wood" | "stone" | "gear"> = ["wood", "stone", "wood", "stone", "gear", "wood", "stone", "gear", "wood", "stone"];
    const shift = this.state.terrainVariant % baseTypes.length;
    const types = baseTypes.map((_, index) => baseTypes[(index + shift) % baseTypes.length]!);
    const survivalYield = this.state.mode === "survival" ? Math.max(0.42, 1 - (this.state.epoch - 1) * 0.1) : 1;
    const layout = RESOURCE_LAYOUTS[this.state.terrainVariant % RESOURCE_LAYOUTS.length]!;
    const cacheStacks = this.state.relics.filter((entry) => entry === "field-cache").length;
    layout.slice(0, Math.min(layout.length, 8 + cacheStacks)).forEach((position, index) => {
      const id = `${this.state!.epoch}:${index}`;
      if (this.state!.gathered.includes(id)) return;
      const type = types[index]!;
      const object = makeResource(type, this.library, region.accent);
      object.position.copy(position);
      object.rotation.y = this.streams!.next("world") * Math.PI * 2;
      object.userData.resourceId = id;
      object.traverse((child) => { child.userData.resourceId = id; });
      const interaction = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 3.2, 12),
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
        position: position.clone()
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

  /** 地面光环和悬浮菱标表示“可点击且能收集”；没有标记的只是环境装饰。 */
  private addCollectibleMarker(object: THREE.Group, type: ResourceNode["type"], resourceId: string): void {
    const color = type === "wood" ? 0x77ae70 : type === "stone" ? 0xaeb4aa : 0xd3a255;
    const marker = new THREE.Group();
    marker.name = "collectible-marker";
    marker.userData.resourceId = resourceId;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.22, 1.58, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.raycast = () => undefined;
    const pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.7, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    pulseRing.rotation.x = -Math.PI / 2;
    pulseRing.position.y = 0.075;
    pulseRing.name = "collectible-pulse";
    pulseRing.raycast = () => undefined;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.11, 2.7, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false })
    );
    beam.position.y = 1.52;
    beam.name = "collectible-beam";
    beam.raycast = () => undefined;
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.82, roughness: 0.4 })
    );
    beacon.position.y = 3.06;
    beacon.name = "collectible-beacon";
    beacon.raycast = () => undefined;
    marker.add(ring, pulseRing, beam, beacon);
    object.add(marker);
  }

  private spawnFieldObjective(region: RegionDefinition): void {
    if (!this.state || !this.streams) return;
    if (!this.state.fieldObjective || this.state.fieldObjective.completed || !this.state.fieldObjective.id.startsWith(`${this.state.epoch}:`)) {
    const types = ["mine", "ruin", "caravan", "elite", "artisan", "aid"] as const;
    const type = this.streams.pick("event", [...types]);
      const node = this.streams.pick("event", FIELD_OBJECTIVE_POSITIONS);
      const position = { x: node.x, z: node.z };
      const reward: Partial<Record<ResourceKey, number>> = type === "caravan"
        ? { coin: 10, wood: 3 }
        : type === "ruin"
          ? { stone: 7, gear: 2 }
          : type === "mine"
            ? { stone: 9, gear: 2 }
            : type === "elite"
              ? { coin: 12, gear: 4 }
              : type === "artisan"
                ? { wood: 6, stone: 5 }
                : { coin: 4, wood: 4, gear: 2 };
      this.state.fieldObjective = { id: `${this.state.epoch}:${type}`, type, position, completed: false, reward };
    }
    const objective = this.state.fieldObjective;
    if (objective.completed) return;
    const object = makePedestal(region.accent, "route");
    object.scale.setScalar(0.72);
    object.position.set(objective.position.x, 0, objective.position.z);
    const typeColor = objective.type === "aid" ? 0x6aa9a0 : objective.type === "mine" ? 0x9d8568 : objective.type === "elite" ? 0xa55345 : region.accent;
    const beacon = new THREE.Mesh(
      objective.type === "mine" ? new THREE.DodecahedronGeometry(0.72, 0) : new THREE.OctahedronGeometry(0.56, 0),
      new THREE.MeshStandardMaterial({ color: typeColor, emissive: typeColor, emissiveIntensity: 0.28, roughness: 0.6 })
    );
    beacon.position.y = objective.type === "mine" ? 1.05 : 1.5;
    beacon.name = "artifact";
    object.add(beacon);
    if (objective.type === "aid") {
      const banner = this.library.model("flag-banner-long", typeColor, 0.3);
      banner.position.set(0, 2.7, 0);
      banner.scale.setScalar(0.9);
      object.add(banner);
    }
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
      ? "道路拒马：阻挡和减速敌人，不占基地石台，成本：木材 10、石料 4"
      : "道路拒马：完成第一夜教学后开放");
    fortify.innerHTML = `<span class="model-thumb-frame fortify-thumb"><i class="ph ph-fence"></i></span><strong>拒马</strong><small>${fortifyUnlocked ? this.formatCostMarkup({ wood: 10, stone: 4 }, true) : "首夜后开放"}</small>`;
    fortify.title = fortifyUnlocked
      ? "不占基地石台。城门外有三处金色施工架，点击施工架或这里即可部署"
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
    if (type === "trebuchet") return this.state.mode === "survival" ? lateNight >= 6 : this.state.expansionLevel >= 3;
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
    const requested = preferredId ? this.state.fortifications.find((entry) => entry.id === preferredId) : undefined;
    if (requested?.built && requested.hp > 0 && requested.level >= 3) {
      const branches: Array<NonNullable<typeof requested.branch>> = ["spike", "sand", "oil"];
      const current = Math.max(0, branches.indexOf(requested.branch ?? "spike"));
      requested.branch = branches[(current + 1) % branches.length]!;
      const names = { spike: "刺桩阵：接触伤害", sand: "流沙障：强力减速", oil: "火油障：与火油塔联动" };
      this.buildWorld();
      this.setPrompt("ph-fence", `拒马 Lv.3 · ${names[requested.branch]}`);
      this.sound.build();
      this.save();
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
      : "道路拒马已部署在城门外商道，不占基地石台");
    this.sound.build();
    this.save();
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
    if (!this.isTutorialBuildAllowed(type)) {
      this.setPrompt("ph-compass", this.state.tutorialStep === 0 ? "先建造发光的丝路商栈，它会持续产生钱币" : "先建造机关弩塔，第一夜它会自动射击城门外的敌军");
      return;
    }
    const definition = buildings[type];
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
      this.world.remove(this.rangeIndicator);
      this.rangeIndicator = undefined;
    }
    this.hud.context.classList.add("is-hidden");
    this.hud.hotbar.querySelectorAll<HTMLButtonElement>(".build-slot").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.build === this.selectedBuild);
    });
    this.updatePreview();
    if (this.selectedBuild) {
      this.setPrompt(definition.icon, `${definition.name}：${definition.purpose}。选择院内发光石台放置`);
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
    if (typeof padIndex === "number" && this.selectedBuild) {
      this.buildOnPad(this.selectedBuild, padIndex);
      return;
    }
    if (hit.object.userData.ground || this.findUserData(hit.object, "ground")) {
      this.selectedResourceId = null;
      this.selectedBuildingId = null;
      if (this.rangeIndicator) {
        this.world.remove(this.rangeIndicator);
        this.rangeIndicator = undefined;
      }
      this.hud.context.classList.add("is-hidden");
      this.setMoveTarget(hit.point.clone().setY(0));
      this.selectedBuildingId = null;
      this.hud.context.classList.add("is-hidden");
    }
  }

  private isInsideFort(position: THREE.Vector3): boolean {
    return Math.abs(position.x) < 17.2 && position.z > -11.4 && position.z < this.fortBackZ() - 0.25;
  }

  private raycast(event: PointerEvent): THREE.Intersection | undefined {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.children, true);
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
      this.world.remove(this.preview);
      this.preview = undefined;
    }
    if (!this.selectedBuild || this.hoveredPad < 0 || !this.state) return;
    const occupied = this.state.buildings.some((building) => building.padIndex === this.hoveredPad);
    const affordable = canAfford(this.state.resources, buildings[this.selectedBuild].cost);
    const preview = makeBuildModel(this.selectedBuild, this.library, regionById(this.state.regionId));
    preview.position.copy(PAD_POSITIONS[this.hoveredPad]!);
    preview.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.raycast = () => undefined;
      const current = Array.isArray(child.material) ? child.material[0] : child.material;
      const ghost = (current as THREE.MeshStandardMaterial).clone();
      ghost.transparent = true;
      ghost.opacity = 0.48;
      ghost.color.lerp(new THREE.Color(!occupied && affordable ? 0x56b98b : 0xca5644), 0.62);
      child.material = ghost;
    });
    this.preview = preview;
    this.world.add(preview);
  }

  private buildOnPad(type: BuildingType, padIndex: number): void {
    if (!this.state || !this.canBuildNow()) return;
    if (this.state.buildings.some((building) => building.padIndex === padIndex)) {
      this.setPrompt("ph-warning", "这座石台已经有建筑");
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
    this.burst(PAD_POSITIONS[padIndex]!.clone().setY(1), regionById(this.state.regionId).accent, 12);
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
    model.position.copy(PAD_POSITIONS[building.padIndex]!);
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

  private selectBuilding(id: string): void {
    if (!this.state) return;
    const building = this.state.buildings.find((entry) => entry.id === id);
    const object = this.buildingObjects.get(id);
    if (!building || !object) return;
    this.selectedBuildingId = id;
    if (this.rangeIndicator) {
      this.world.remove(this.rangeIndicator);
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
    building.level += 1;
    building.maxHp = Math.round(building.maxHp * 1.28);
    building.hp = building.maxHp;
    this.state.prosperity += 1;
    const object = this.buildingObjects.get(building.id);
    object?.scale.multiplyScalar(1.055);
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
    const object = this.buildingObjects.get(building.id);
    object?.scale.setScalar(Math.pow(1.055, Math.max(0, building.level - 1)));
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

  private gateRepairCost(): Partial<Record<ResourceKey, number>> {
    const levelScale = Math.floor(Math.max(0, (this.state?.gateLevel ?? 1) - 1) / 3);
    return this.discountRepairCost({ wood: 2 + levelScale, stone: 1 + Math.floor(levelScale * 0.5) });
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

  /** 拆除是换流派的工具：返还一部分原建造、升级投入，永远不会比投入更多。 */
  private demolishRefund(building: BuildingState): Partial<Record<ResourceKey, number>> {
    const spent: Partial<Record<ResourceKey, number>> = { ...buildings[building.type].cost };
    for (let level = 1; level < building.level; level += 1) {
      const upgrade = upgradeCost(building.type, level);
      for (const key of Object.keys(upgrade) as ResourceKey[]) spent[key] = (spent[key] ?? 0) + (upgrade[key] ?? 0);
    }
    return Object.fromEntries(
      Object.entries(spent)
        .filter(([, value]) => (value ?? 0) > 0)
        .map(([key, value]) => [key, Math.max(1, Math.floor((value ?? 0) * 0.58))])
    ) as Partial<Record<ResourceKey, number>>;
  }

  private demolishSelected(): void {
    if (!this.state || !this.selectedBuildingId || !this.canBuildNow()) return;
    const index = this.state.buildings.findIndex((building) => building.id === this.selectedBuildingId);
    if (index < 0) return;
    const building = this.state.buildings[index]!;
    const refund = this.demolishRefund(building);
    for (const key of Object.keys(refund) as ResourceKey[]) this.state.resources[key] += refund[key] ?? 0;
    const object = this.buildingObjects.get(building.id);
    if (object) {
      this.burst(object.position.clone().setY(1.2), 0xb79a65, 11);
      this.world.remove(object);
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
      this.world.remove(this.rangeIndicator);
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
      if (building.level < 3) return `自动产钱 +${amount} / 3秒，Lv.3 可选车队或军需专精`;
      if (this.activeSpecialization(building) === "supply") return `军需库：产币 +${amount}，并补给下一种材料 +1 / 3秒`;
      return `车队站：自动产钱 +${amount + 1} / 3秒`;
    }
    if (building.type === "workshop") {
      const amount = Math.max(1, Math.floor(1 + (building.level - 1) * 0.58));
      const specialization = this.activeSpecialization(building);
      if (specialization === "wood" || specialization === "stone" || specialization === "gear") return `每 3 秒固定生产${this.specializationModeName(specialization)} +${amount}`;
      const next = (["木材", "石料", "机巧"] as const)[this.state.workshopRotation % 3]!;
      return `每 3 秒轮换材料 +${amount} · 下一次：${next}`;
    }
    if (building.type === "ballista") return building.level < 3 ? `远程伤害 ${18 * building.level} · 射程 ${this.towerRange(building).toFixed(0)}` : this.activeSpecialization(building) === "watch" ? `瞭望弩：射程 ${this.towerRange(building).toFixed(0)}，射速提高` : `破甲弩：远程伤害 ${18 * building.level}，重甲目标更痛`;
    if (building.type === "fire") return building.level < 3 ? `快速伤害 ${11 * building.level}，Lv.3 可选燃烧或黏滞专精` : this.activeSpecialization(building) === "tar" ? `黏滞油：减速更强、更久` : `燃烧油：快速伤害 ${11 * building.level}，附带灼烧`;
    if (building.type === "antiair") return building.level < 3 ? `优先击落飞行机关，Lv.3 可选猎空或连射专精` : this.activeSpecialization(building) === "volley" ? `连射弩：优先连射多名飞行机关` : `猎空弩：对空伤害 ${26 * building.level}，专杀飞行机关`;
    if (building.type === "trebuchet") return building.level < 3 ? `远程震石 ${34 * building.level}，Lv.3 可选攻城或震裂专精` : this.activeSpecialization(building) === "shatter" ? `震裂投车：爆炸范围扩大` : `攻城投车：对攻城兽与重甲目标更强`;
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
      this.placeDistantPanorama();
      this.animateWorld(delta);
      this.updateTitlePreview();
      return;
    }
    if (!this.running || !this.state || this.paused) return;

    const simulationDelta = this.state.phase === "night" ? delta * this.state.nightSpeed : delta;
    this.sound.updateMusic(this.state.phase, delta);
    this.boundaryHintCooldown = Math.max(0, this.boundaryHintCooldown - delta);
    this.promptTimer = Math.max(0, this.promptTimer - delta);
    if (this.promptTimer <= 0 && this.state.tutorialStep >= 3) this.hud.prompt.classList.add("is-hidden");
    this.updatePlayer(delta);
    this.gateStatusTimer = Math.max(0, this.gateStatusTimer - delta);
    this.coreStatusTimer = Math.max(0, this.coreStatusTimer - delta);
    this.updateCamera(delta);
    this.updateGateAnimation(delta);
    this.animateWorld(delta);
    this.updateProjectiles(simulationDelta);
    this.updateParticles(simulationDelta);
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
    if (this.state?.qualityTier && this.state.qualityTier !== "auto") return;
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
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const cap = this.effectiveQuality === "high" ? 1.5 : this.effectiveQuality === "medium" ? 1.18 : 0.9;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarsePointer ? Math.min(cap, 1.18) : cap));
    this.renderer.shadowMap.enabled = this.effectiveQuality !== "low";
    this.renderer.toneMappingExposure = this.effectiveQuality === "low" ? 0.98 : 0.94;
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
    if (!moving) return;
    direction.normalize();
    const previous = this.playerRig.root.position.clone();
    const speed = this.state.mode === "training"
      ? (this.state.adventure?.moveSpeed ?? 6.8)
      : 6.8 * (this.state.relics.includes("speed") ? 1.12 : 1);
    this.playerRig.root.position.addScaledVector(direction, speed * delta);
    this.playerRig.root.rotation.y = Math.atan2(direction.x, direction.z);
    this.resolvePlayerBounds(previous);
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
      if (followTradeRoad && navigation.length <= 1) route.push(...this.tradeRoadWaypoints(destination));
      else route.push(...navigation);
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
    this.selectedResourceId = resource.id;
    const origin = this.playerRig.root.position.clone().setY(0);
    const vector = resource.position.clone().sub(origin).setY(0);
    if (vector.lengthSq() < 0.02) {
      this.setMoveTarget(resource.position);
      return;
    }
    const preferred = resource.position.clone().addScaledVector(vector.normalize(), -2.12).setY(0);
    // 地貌装饰会随区域变化。若资源入口恰好落在岩石或水域边缘，从资源周围挑选
    // 距玩家最近的可达入口，避免角色在模型边缘原地顶住或反复绕行。
    const candidates = [preferred];
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      candidates.push(resource.position.clone().add(new THREE.Vector3(Math.cos(angle) * 2.25, 0, Math.sin(angle) * 2.25)));
    }
    const approach = candidates
      .filter((candidate) => this.isNavigablePoint(candidate))
      .sort((a, b) => a.distanceToSquared(origin) - b.distanceToSquared(origin))[0] ?? preferred;
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
    if (!found) return [destination];
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
    const compressed: THREE.Vector3[] = [];
    let lastDirection = "";
    cells.forEach(([x, z], index) => {
      const previous = index === 0 ? [startX, startZ] : cells[index - 1]!;
      const direction = `${Math.sign(x - previous[0])}:${Math.sign(z - previous[1])}`;
      if (index > 0 && direction !== lastDirection) compressed.push(toWorld(previous[0], previous[1]));
      lastDirection = direction;
    });
    compressed.push(destination);
    return compressed;
  }

  private isNavigablePoint(point: THREE.Vector3): boolean {
    if (point.x < -62 || point.x > 62 || point.z < -72 || point.z > 42) return false;
    const backZ = this.fortBackZ();
    if (point.z > -13.4 && point.z < -10.1 && Math.abs(point.x) > 3.05 && Math.abs(point.x) < 19.2) return false;
    if (Math.abs(point.x) > 16.1 && Math.abs(point.x) < 19.4 && point.z > -12.8 && point.z < backZ + 1.2) return false;
    if (point.z > backZ - 1.2 && point.z < backZ + 1.4 && Math.abs(point.x) < 19.2) return false;
    const blockers: Array<[number, number, number]> = [
      [-34, -28, 3.8], [33, -23, 3.5], [-31, 12, 2.8], [29, 18, 2.7],
      [34, 26, 3.6], [-34, -3, 2.6], [-21, -27, 2.4], [22, -31, 2.4]
    ];
    if (this.state?.regionId === "oasis") blockers.push([-23, -36, 6.6]);
    if (this.state?.regionId === "mist") blockers.push([22, -37, 7.4]);
    return !blockers.some(([x, z, radius]) => Math.hypot(point.x - x, point.z - z) < radius);
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
    if (this.moveRouteGuide) this.world.remove(this.moveRouteGuide);
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
    if (Math.abs(position.x) > 16.4 && position.z > -11 && position.z < backZ + 1) {
      position.copy(previous);
      this.showBoundaryHint("围墙在此封闭，沿道路回到城门");
    }
    if (position.z > backZ - 1 && Math.abs(position.x) < 18.2) {
      position.copy(previous);
      this.showBoundaryHint("主帐后方是封闭营地，向两侧空地移动");
    }
    const blockers: Array<[number, number, number]> = [
      [-34, -28, 3.4], [33, -23, 3.1], [-31, 12, 2.4], [29, 18, 2.3],
      [34, 26, 3.2], [-34, -3, 2.2], [-21, -27, 2], [22, -31, 2]
    ];
    if (this.state?.regionId === "oasis") blockers.push([-23, -36, 6.2]);
    if (this.state?.regionId === "mist") blockers.push([22, -37, 7]);
    if (blockers.some(([x, z, radius]) => Math.hypot(position.x - x, position.z - z) < radius)) {
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
    const near = this.resources.find((resource) => resource.position.distanceTo(this.playerRig!.root.position) < 2.7);
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
      const near = this.resources.find((resource) => resource.position.distanceTo(this.playerRig!.root.position) < 3.5);
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
    const gateCost = this.gateRepairCost();
    if (this.state.phase === "night" && distanceGate < 4 && this.state.gateHp < this.state.gateMaxHp && canAfford(this.state.resources, gateCost)) {
      pay(this.state.resources, gateCost);
      this.state.gateHp = Math.min(this.state.gateMaxHp, this.state.gateHp + 28);
      this.sound.build();
      this.burst(new THREE.Vector3(0, 2.5, -12), 0xe2ad55, 7);
      this.setPrompt("ph-hammer", `城门修复 28 点耐久，支付 ${this.formatCost(gateCost)}`);
      return;
    } else if (this.state.phase === "night" && distanceGate < 4 && this.state.gateHp < this.state.gateMaxHp) {
      this.setPrompt("ph-hammer", `修复城门需要 ${this.formatCost(gateCost)}`);
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
    this.world.remove(resource.object);
    this.resourceLabels.get(resource.id)?.remove();
    this.resourceLabels.delete(resource.id);
    this.resources = this.resources.filter((node) => node !== resource);
    if (this.selectedResourceId === resource.id) this.selectedResourceId = null;
    this.sound.coin();
    this.burst(resource.position.clone().setY(1.2), regionById(this.state.regionId).accent, 10);
    this.setPrompt(key === "wood" ? "ph-tree" : key === "stone" ? "ph-mountains" : "ph-gear-six", `获得 ${amount}${key === "wood" ? " 木材" : key === "stone" ? " 石料" : " 机巧"}`);
    if (this.state.tutorialStep === 0) {
      // 城外采集是可选收益，不能把第一次的“商栈 → 床弩”教学顺序跳掉。
      this.setPrompt("ph-storefront", "材料已送回驿站。第一步仍是：点底部商栈，再点发光石台");
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
      this.world.remove(this.fieldObject);
      this.fieldObject = undefined;
    }
    if (objective.type === "elite") this.state.scoutIntel = Math.max(this.state.scoutIntel ?? 0, 1);
    if (objective.type === "aid") this.state.reinforcementNights = Math.max(this.state.reinforcementNights ?? 0, 1);
    if (objective.type === "artisan") {
      this.state.gateHp = Math.min(this.state.gateMaxHp, this.state.gateHp + 38);
      this.gateStatusTimer = 2.5;
    }
    this.state.eventsCompleted += 1;
    const names = { mine: "矿脉开采", ruin: "遗迹搜索", caravan: "商队护送", elite: "精英哨所", artisan: "流浪匠师", aid: "援军营地", scout: "营地侦察", repair: "机关维修", cache: "商路密匣" };
    this.sound.coin();
    const bonus = objective.type === "elite"
      ? "，下一夜敌军规模已被侦察削减"
      : objective.type === "aid"
        ? "，两名守卫会在下一夜加入防线"
        : objective.type === "artisan"
          ? "，城门额外修复 38 点耐久"
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
          target.enemy.slowedUntil = performance.now() + 720;
          target.visual.flash = 0.12;
        }
      } else {
        primary.enemy.hp -= damage;
        primary.visual.flash = 0.15;
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
      visual.flash = 0.15;
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
    this.placeDistantPanorama();
    this.updateOccluders(playerPosition, delta);
  }

  /** 注册有高度的场景实体；地面、石台和交互光环不参与遮挡判定。 */
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
        || this.findUserData(object, "resourceId")
      ) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.max.y < 0.55) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      const materials = source.map((material) => material.clone());
      object.material = Array.isArray(object.material) ? materials : materials[0]!;
      object.userData.occlusionRegistered = true;
      this.occluderMeshes.push({ mesh: object, materials, opacities: materials.map((material) => material.opacity) });
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
        for (const hit of intersections) {
          if (hit.distance >= targetDistance - 0.72) break;
          this.occludedMeshes.add(hit.object as THREE.Mesh);
        }
      }
    }
    for (const entry of this.occluderMeshes) {
      const targetOpacity = this.occludedMeshes.has(entry.mesh) ? 0.22 : 1;
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
        if (material) material.opacity = 0.36 + Math.sin(elapsed * 3.1 + object.id) * 0.16;
      } else if (object.name === "collectible-beacon") {
        object.position.y = 3.06 + Math.sin(elapsed * 2.8 + object.id) * 0.16;
      } else if (object.name === "collectible-beam") {
        const material = object instanceof THREE.Mesh ? object.material as THREE.MeshBasicMaterial : undefined;
        if (material) material.opacity = 0.24 + Math.sin(elapsed * 2.8 + object.id) * 0.12;
      } else if (object.name === "fortification-marker") {
        const pulse = 1 + Math.sin(elapsed * 2.4 + object.id) * 0.09;
        object.scale.set(pulse, pulse, pulse);
        const material = object instanceof THREE.Mesh ? object.material as THREE.MeshBasicMaterial : undefined;
        if (material) material.opacity = 0.52 + Math.sin(elapsed * 2.4 + object.id) * 0.18;
      } else if (object.name === "fortification-signal") {
        object.rotation.y += animationDelta * 1.4;
        object.position.y = 5.62 + Math.sin(elapsed * 2.3 + object.id) * 0.16;
      } else if (object.name === "flyer-rotor") {
        object.rotation.y += animationDelta * 13;
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
    // 军需库把“商栈的高等级石台”转换成稳定的材料补给，避免整局只等一座工坊的轮换。
    for (const building of markets) {
      if (building.level >= 3 && this.activeSpecialization(building) === "supply") rates[currentMaterial] += building.hp > 0 ? 1 : 0;
    }
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
    this.state.nightModifier ??= this.streams.pick("event", nightModifiers);
    this.state.buildings.forEach((building) => {
      building.status ??= { productionPaused: false, targeted: false, lastHitAt: 0 };
      building.status.targeted = false;
    });
    this.selectedBuild = null;
    this.updatePreview();
    this.hud.context.classList.add("is-hidden");
    const defensePower = this.state.buildings.reduce((sum, building) => {
      const definition = buildings[building.type];
      return sum + (definition.attack ?? 1) * building.level;
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
    const bossKind = this.state.tutorialStep < 3 ? null : bossForNight(this.state.epoch, regionById(this.state.regionId));
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
    const wave = this.state.tutorialStep < 3 ? ["raider", "raider", "raider"] as const : directorGenerated;
    this.spawnQueue = wave.map((type, index) => {
      const definition = enemies[type];
      const isBoss = Boolean(bossKind && index === 0);
      const elite = isBoss || (this.state!.epoch % 5 === 0 && index < 2);
      const healthScale = enemyHealthScale(this.state!.epoch, this.state!.mode) * (isBoss ? 3.6 : elite ? 1.5 : 1);
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
        damage: definition.damage * damageScale * (isBoss ? 1.55 : elite ? 1.28 : 1) * (this.state!.nightModifier?.enemyDamage ?? 1),
        position: { x: (this.streams!.next("combat") - 0.5) * 5.8, z: -23.4 - (index % 3) * 0.65 },
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
        windupUntil: 0
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
      this.spawnCooldown = 0.35 + (this.streams?.next("combat") ?? 0.5) * 0.2;
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
      const rig = this.library.character("ranger", accent);
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
        target.visual.flash = 0.12;
        this.burst(target.visual.object.position.clone().setY(1.15), 0x73b0a2, 4);
      }
    }
  }

  private createEnemyVisual(enemy: EnemyState): void {
    const region = regionById(this.state?.regionId ?? "oasis");
    const root = new THREE.Group();
    let rig: CharacterRig | undefined;
    if (enemy.type === "ram") {
      const ram = this.library.model("siege-ram", region.accent);
      ram.scale.setScalar(1.5);
      ram.rotation.y = Math.PI;
      root.add(ram);
    } else if (enemy.type === "flyer") {
      // 独立的丝翼机关鸢，不复用人形骨骼。它通过高度层越过城墙，是兵种能力而非穿模。
      const metal = new THREE.MeshStandardMaterial({ color: 0x4d595d, metalness: 0.68, roughness: 0.34 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xa57b3f, metalness: 0.72, roughness: 0.3 });
      const silk = new THREE.MeshStandardMaterial({ color: 0x745f52, roughness: 0.68, metalness: 0.03, side: THREE.DoubleSide });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.35, 6, 12), metal);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.18;
      body.castShadow = true;
      root.add(body);
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(2.35, 0.48);
      wingShape.lineTo(1.72, -0.62);
      wingShape.lineTo(0.22, -0.28);
      wingShape.closePath();
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), silk);
        wing.scale.x = side;
        wing.rotation.x = -Math.PI / 2;
        wing.position.set(side * 0.1, 0.12, 0.1);
        wing.castShadow = true;
        root.add(wing);
        const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.4, 8), brass);
        spar.rotation.z = Math.PI / 2 - side * 0.18;
        spar.position.set(side * 1.05, 0.17, 0.05);
        root.add(spar);
      }
      const rotor = new THREE.Group();
      rotor.name = "flyer-rotor";
      rotor.position.set(0, 0.28, 0.82);
      for (const rotation of [0, Math.PI / 2]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 1.42), brass);
        blade.rotation.y = rotation;
        rotor.add(blade);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 12), metal);
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);
      root.add(rotor);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.05, 8), silk);
      tail.rotation.x = Math.PI / 2;
      tail.position.set(0, 0.08, 1.42);
      root.add(tail);
    } else {
      rig = this.library.character(enemyCharacterKind(enemy.type), region.accent);
      rig.setMoving(true);
      root.add(rig.root);
      if (enemy.type === "shield") {
        const shield = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 0.12, 10),
          new THREE.MeshStandardMaterial({ color: 0x8b7359, roughness: 0.68, metalness: 0.28 })
        );
        shield.rotation.z = Math.PI / 2;
        shield.position.set(-0.48, 1.05, 0.2);
        shield.castShadow = true;
        root.add(shield);
      }
      if (enemy.type === "sapper") {
        const charge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.82, 10),
          new THREE.MeshStandardMaterial({ color: 0x7f3a2f, roughness: 0.65 })
        );
        charge.position.set(0, 0.92, -0.32);
        charge.castShadow = true;
        root.add(charge);
      }
      if (enemy.type === "archer") {
        const bow = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.035, 6, 14, Math.PI * 1.45),
          new THREE.MeshStandardMaterial({ color: 0x85603d, roughness: 0.88 })
        );
        bow.position.set(0.5, 1.28, 0.15);
        bow.rotation.y = Math.PI / 2;
        bow.castShadow = true;
        root.add(bow);
      }
    }
    const baseScale = enemy.bossKind ? 1.48 : enemy.elite ? 1.22 : 1;
    root.scale.setScalar(baseScale);
    root.userData.baseScale = baseScale;
    root.position.set(enemy.position.x, enemy.type === "flyer" ? 3.2 : 0, enemy.position.z);
    root.userData.enemyId = enemy.id;
    root.traverse((child) => { child.userData.enemyId = enemy.id; });
    this.world.add(root);
    const label = document.createElement("button");
    label.type = "button";
    label.className = "enemy-world-label is-idle-status";
    label.innerHTML = `<strong><b>${enemy.bossKind ? "首领 " : enemy.elite ? "精锐 " : ""}${enemies[enemy.type].name}</b><small>${Math.ceil(enemy.hp)}/${enemy.maxHp}</small></strong><span><i></i></span>`;
    label.addEventListener("click", () => this.selectEnemy(enemy.id));
    this.hud.buildingLabels.appendChild(label);
    this.enemyObjects.set(enemy.id, { object: root, rig, flash: 0, stolen: false, label });
  }

  private selectEnemy(id: string): void {
    if (!this.state) return;
    const enemy = this.state.enemies.find((entry) => entry.id === id);
    if (!enemy) return;
    this.selectedEnemyId = id;
    enemy.targetedUntil = performance.now() + 4500;
    this.setPrompt("ph-crosshair", `${enemies[enemy.type].name} ${Math.ceil(enemy.hp)}/${enemy.maxHp} 生命`);
  }

  private updateEnemies(delta: number): void {
    if (!this.state) return;
    const now = performance.now();
    for (const enemy of this.state.enemies) {
      const visual = this.enemyObjects.get(enemy.id);
      if (!visual) continue;
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
      if (distance > attackRange) {
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
        enemy.attackCooldown = enemy.type === "ram" ? 2 : enemy.type === "archer" ? 1.65 : 1.15;
        if (enemy.type === "archer") enemy.windupUntil = now + 420;
        visual.rig?.attack();
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
      } else {
        visual.object.scale.setScalar(Number(visual.object.userData.baseScale ?? 1));
      }
      if (enemy.bossKind) {
        const ratio = enemy.hp / Math.max(1, enemy.maxHp);
        const phase = ratio <= 0.3 ? 2 : ratio <= 0.65 ? 1 : 0;
        if (phase > enemy.bossPhase) {
          enemy.bossPhase = phase as 0 | 1 | 2;
          enemy.combatSpeed *= 1.1;
          enemy.marchSpeed *= 1.08;
          enemy.damage *= 1.12;
          this.sound.warning();
          this.cameraShake = 0.32;
          this.setPrompt("ph-warning", `首领进入第 ${phase + 1} 阶段，攻击节奏加快`);
        }
      }
    }
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
    const order = preferred[enemy.type] ?? [];
    const candidates = this.state.buildings
      .filter((building) => building.hp > 0)
      .sort((a, b) => {
        const aPriority = order.indexOf(a.type);
        const bPriority = order.indexOf(b.type);
        const priorityA = aPriority < 0 ? 99 : aPriority;
        const priorityB = bPriority < 0 ? 99 : bPriority;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return PAD_POSITIONS[a.padIndex]!.distanceTo(from) - PAD_POSITIONS[b.padIndex]!.distanceTo(from);
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
      const damageBoost = this.state.relics.filter((entry) => entry === "damage").length * 0.15
        + (this.state.relics.includes("last-stand") && this.state.coreHp / this.state.coreMaxHp < 0.35 ? 0.25 : 0);
      const piercing = building.type === "ballista" && (nearest.type === "shield" || nearest.type === "ram")
        ? (this.state.relics.includes("pierce") ? 1.35 : 1) * (specialization === "pierce" ? 1.28 : 1)
        : 1;
      const airRelics = this.state.relics.filter((entry) => entry === "air-damage").length;
      const airMultiplier = building.type === "antiair" && nearest.type === "flyer" ? (specialization === "hunter" ? 2.25 : 1.8) * (1 + airRelics * 0.3) : 1;
      const siegeMultiplier = building.type === "trebuchet" && specialization === "siege" && (nearest.type === "ram" || nearest.type === "shield") ? 1.38 : 1;
      const fireDamageStacks = this.state.relics.filter((entry) => entry === "fire-damage").length;
      const fireMultiplier = building.type === "fire"
        ? (specialization === "burn" ? 1.2 : 1) * (1 + fireDamageStacks * 0.25)
        : 1;
      const antiRanged = nearest.type === "archer" && this.state.relics.includes("anti-ranged") ? 1.3 : 1;
      const bossDamage = nearest.bossKind ? 1 + this.state.relics.filter((entry) => entry === "boss-damage").length * 0.18 : 1;
      const damage = definition.attack * building.level * (1 + damageBoost) * piercing * airMultiplier * siegeMultiplier * fireMultiplier * antiRanged * bossDamage;
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
        target.flash = 0.1;
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
          secondaryVisual.flash = 0.08;
          this.fireProjectile(object.position.clone().setY(2.3), secondaryVisual.object.position.clone().setY(1.3), 0x9ed3d3);
        }
      }
      if (building.type === "trebuchet" && target) {
        for (const enemy of this.state.enemies) {
          if (enemy.id === nearest.id) continue;
          const visual = this.enemyObjects.get(enemy.id);
          const blastRelics = this.state!.relics.filter((entry) => entry === "blast").length;
          const blastRange = (specialization === "shatter" ? 4.35 : 3.1) * (1 + blastRelics * 0.12);
          if (!visual || visual.object.position.distanceTo(target.object.position) > blastRange) continue;
          enemy.hp -= damage * 0.48;
          visual.flash = 0.08;
        }
        this.burst(target.object.position.clone().setY(1.2), 0x9f7e5d, 12);
      }
      const rapidBonus = 1 + this.state.relics.filter((entry) => entry === "rapid").length * 0.08;
      const speedBonus = ((building.type === "ballista" && specialization === "watch") || (building.type === "antiair" && specialization === "volley") ? 1.18 : 1) * rapidBonus;
      const moduleSpeed = this.state.regionModule === "mechanism-emplacement" ? 1.1 : 1;
      this.buildingCooldowns.set(building.id, (definition.cooldown ?? 1) / ((1 + building.level * 0.08) * speedBonus * moduleSpeed));
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
    // 扩城后的后排石台距离城门更远，通过院墙上的传令标与抛射校准获得补偿射界。
    // 这不是隐藏增伤：建造预览与选中射程圈都调用同一函数，显示的就是实际范围。
    const pad = PAD_POSITIONS[building.padIndex];
    const rearRelayBonus = pad ? Math.min(16, Math.max(0, pad.z - 4) * 0.88) : 0;
    return (definition.range + specializationBonus + levelBonus + rearRelayBonus) * relicMultiplier * moduleMultiplier;
  }

  private cleanupEnemies(): void {
    if (!this.state) return;
    const defeated = this.state.enemies.filter((enemy) => enemy.hp <= 0);
    for (const enemy of defeated) {
      const visual = this.enemyObjects.get(enemy.id);
      if (visual) {
        this.burst(visual.object.position.clone().setY(1.2), 0xd6aa62, 10);
        this.world.remove(visual.object);
        visual.label.remove();
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
        this.state.resources.coin += 18;
        this.state.resources.gear += 5;
        this.setPrompt("ph-trophy", "首领已击败，本夜奖励至少为稀有品质");
      }
      this.state.kills += 1;
      this.state.renownEarned += enemy.type === "ram" ? 2 : 1;
    }
    this.state.enemies = this.state.enemies.filter((enemy) => enemy.hp > 0);
  }

  private finishNight(): void {
    if (!this.state) return;
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
    const xs = [-7.2, 0, 7.2];
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

  private selectChoice(index: number): void {
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
      this.state.regionId = regionId!;
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
    for (const object of this.choiceObjects) this.world.remove(object);
    this.choiceObjects = [];
    this.choiceLabels.forEach((label) => label.remove());
    this.choiceLabels = [];
  }

  private nextEpoch(): void {
    if (!this.state) return;
    this.clearChoices();
    this.state.epoch += 1;
    this.state.phase = "day";
    this.hornedThisDay = false;
    this.state.dayLength = this.state.mode === "survival" && this.state.epoch > 1 ? 12 : 20;
    this.state.phaseTime = this.state.dayLength;
    this.state.gathered = [];
    this.state.fieldObjective = null;
    this.state.nightModifier = this.streams?.pick("event", nightModifiers) ?? null;
    this.state.nightSpeed = 1;
    const dayHeal = this.state.relics.filter((entry) => entry === "day-heal").length * 18;
    this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 18 + dayHeal);
    this.state.player.position = { x: 0, z: 3.5 };
    if (this.state.epoch >= 3 && !this.meta.unlockedRegions.includes("stardust")) this.meta.unlockedRegions.push("stardust");
    this.buildWorld();
    const expansionMessage = this.state.tutorialStep === 4
      ? "第二夜：点击商栈或弩塔进行升级；城门外三面施工旗是拒马位，点旗或底部拒马即可部署"
      : this.state.mode === "survival"
      ? `固定驿站守至第 ${this.state.epoch} 夜。城外资源将逐渐减少，善用生产、维修与战利品`
      : this.state.expansionLevel === 1
      ? "新院落已开放：可用 8 座建筑石台，火油塔与防空连弩蓝图已解锁"
      : this.state.expansionLevel === 2
        ? "第二后院已开放：可用 10 座建筑石台，能建立更完整的生产与防空体系"
        : this.state.expansionLevel === 3
          ? "终级后院已开放：可用 12 座建筑石台，震石投车蓝图已解锁"
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
    finished.forEach((projectile) => this.world.remove(projectile.object));
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
    finished.forEach((particle) => this.world.remove(particle.object));
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  private updateLighting(night: boolean): void {
    const region = regionById(this.state?.regionId ?? "oasis");
    const sun = this.scene.getObjectByName("sun") as THREE.DirectionalLight | undefined;
    const ambient = this.scene.getObjectByName("ambient") as THREE.HemisphereLight | undefined;
    if (sun) {
      sun.intensity = night ? 0.78 : 3.65;
      sun.color.set(night ? 0x7890af : 0xffd8a1);
    }
    if (ambient) ambient.intensity = night ? 0.72 : 1.16;
    this.scene.background = new THREE.Color(night ? 0x142c38 : region.sky);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(night ? 0x1f3940 : region.fog);
      this.scene.fog.density = night ? 0.014 : 0.0068;
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
    const tutorialObjective = this.state.mode === "expedition" && !this.meta.seenTutorial && this.state.phase === "day"
      ? this.state.tutorialStep === 0
        ? "第一步：选择底部商栈，再点击院内第一座发光石台"
        : this.state.tutorialStep === 1
          ? "第二步：选择底部床弩，再点击第二座发光石台"
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
        ? `固定 8 石台 · 战备压力 ${Math.round(this.state.readinessPressure * 20)}% · ${this.state.epoch % 3 === 0 ? "本夜后补给" : `再守 ${3 - this.state.epoch % 3} 夜补给`}${productionHint}`
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
      .filter((enemy) => enemy.elite || enemy.hp < enemy.maxHp || enemy.targetedUntil > performance.now() || enemy.id === this.selectedEnemyId || enemy.target === "building" || enemy.target === "core" || (enemy.type === "looter" && enemy.target === "gate"))
      .sort((a, b) => Number(b.id === this.selectedEnemyId) - Number(a.id === this.selectedEnemyId) || a.hp / a.maxHp - b.hp / b.maxHp)
      .slice(0, 6)
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
        strong.innerHTML = enemy.id === this.selectedEnemyId
          ? `<b>${enemy.bossKind ? "首领 " : enemy.elite ? "精锐 " : ""}${enemies[enemy.type].name}</b><small>${Math.ceil(enemy.hp)}/${enemy.maxHp}</small>`
          : `<b aria-label="${enemies[enemy.type].name}${slowed ? "，已减速" : ""}"></b>`;
      }
      if (fill) fill.style.width = `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`;
      visual.label.classList.toggle("is-idle-status", !visibleEnemyIds.includes(enemy.id));
    }
    if (force) this.positionWorldUi();
  }

  private positionWorldUi(): void {
    if (this.gateObject) this.positionElement(this.hud.gateBar, new THREE.Vector3(0, 6.3, -12));
    if (this.coreObject) this.positionElement(this.hud.coreBar, CORE_POSITION.clone().setY(8.15));
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
        // 院内不让八个资源牌抢 HUD；出城后，附近资源和已点选资源才获得清晰标签。
        label.classList.toggle("is-idle-status", !(routeSelected || (outside && distance < 29)));
        this.positionElement(label, resource.position.clone().setY(4.25));
      }
    }
    for (const visual of this.enemyObjects.values()) {
      this.positionElement(visual.label, visual.object.position.clone().setY(visual.object.position.y + 3.6));
    }
  }

  private updateGateBarPosition(): void {
    if (this.gateObject) this.positionElement(this.hud.gateBar, new THREE.Vector3(0, 6.3, -12));
    if (this.coreObject) this.positionElement(this.hud.coreBar, CORE_POSITION.clone().setY(8.15));
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
    document.querySelector("#resultEpoch")!.textContent = finished.mode === "training" ? `行至第 ${finished.adventure?.room ?? 1} 处营地` : `守至第 ${finished.epoch} 夜`;
    document.querySelector("#resultStats")!.innerHTML = finished.mode === "training"
      ? `等级 ${finished.adventure?.level ?? 1}<br>获得装备 ${finished.adventure?.gear.length ?? 0}<br>获得声望 ${Math.max(1, Math.floor(finished.renownEarned / 3 + finished.epoch))}`
      : `击败敌军 ${finished.kills}<br>首领 ${finished.bossKills} · 事件 ${finished.eventsCompleted}<br>最终繁荣 ${finished.prosperity}<br>获得声望 ${Math.max(1, Math.floor(finished.renownEarned / 3 + finished.epoch))}`;
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

  /** 导入档案只做必要字段校验：既防止损坏 JSON 进入运行时，也不把未来版本的扩展字段误删。 */
  private isValidSaveRun(value: unknown): value is GameState {
    if (!value || typeof value !== "object") return false;
    const run = value as Partial<GameState>;
    if (run.version !== 7 || !["expedition", "survival", "training"].includes(run.mode ?? "") || typeof run.seed !== "string") return false;
    const requiredNumbers = [run.epoch, run.phaseTime, run.dayLength, run.gateHp, run.gateMaxHp, run.coreHp, run.coreMaxHp];
    if (!requiredNumbers.every((entry) => typeof entry === "number" && Number.isFinite(entry))) return false;
    if ((run.epoch ?? 0) < 1 || (run.epoch ?? 0) > 100_000 || (run.dayLength ?? 0) < 1 || (run.dayLength ?? 0) > 600) return false;
    if ((run.gateHp ?? -1) < 0 || (run.gateMaxHp ?? 0) <= 0 || (run.gateHp ?? 0) > (run.gateMaxHp ?? 0) * 1.01) return false;
    if ((run.coreHp ?? -1) < 0 || (run.coreMaxHp ?? 0) <= 0 || (run.coreHp ?? 0) > (run.coreMaxHp ?? 0) * 1.01) return false;
    if (typeof run.regionId !== "string" || !["day", "night", "clear", "relic", "route", "adventure", "adventure-choice", "gameover"].includes(run.phase ?? "")) return false;
    const resources = run.resources as Partial<Resources> | undefined;
    if (!resources || !(["coin", "wood", "stone", "gear"] as const).every((key) => typeof resources[key] === "number" && Number.isFinite(resources[key]!) && resources[key]! >= 0 && resources[key]! <= 1_000_000_000)) return false;
    const player = run.player;
    if (!player || !Number.isFinite(player.hp) || !Number.isFinite(player.maxHp) || !Number.isFinite(player.position?.x) || !Number.isFinite(player.position?.z)) return false;
    if (!(["auto", "low", "medium", "high"] as const).includes(run.qualityTier ?? "auto")) return false;
    if (!Number.isFinite(run.bossKills) || !Number.isFinite(run.eventsCompleted) || (run.bossKills ?? -1) < 0 || (run.eventsCompleted ?? -1) < 0) return false;
    if (typeof run.assetVersion !== "string" || run.assetVersion.length > 80) return false;
    return Array.isArray(run.buildings) && run.buildings.length <= 32
      && Array.isArray(run.enemies) && run.enemies.length <= 100
      && Array.isArray(run.relics) && run.relics.length <= 500
      && Array.isArray(run.fortifications) && run.fortifications.length <= 12;
  }

  private isValidSaveEnvelope(value: unknown): value is SaveEnvelope {
    if (!value || typeof value !== "object") return false;
    const envelope = value as Partial<SaveEnvelope>;
    if (envelope.schema !== "silk-road-bastion" || envelope.version !== 7 || !envelope.meta || typeof envelope.meta !== "object") return false;
    const meta = envelope.meta as Partial<MetaProgress>;
    const records = meta.records as Partial<Record<GameMode, unknown>> | undefined;
    if (
      meta.version !== 7
      || !Number.isFinite(meta.renown)
      || typeof meta.seenTutorial !== "boolean"
      || !records
      || !(["expedition", "survival", "training"] as const).every((mode) => typeof records[mode] === "number" && Number.isFinite(records[mode] as number))
      || !([meta.renown, ...Object.values(meta.prosperityRecords ?? {}), ...Object.values(meta.bossRecords ?? {}), ...Object.values(meta.eventRecords ?? {})]
        .every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0 && entry <= 1_000_000_000))
      || !Array.isArray(meta.unlockedRegions)
      || !meta.unlockedRegions.every((region) => typeof region === "string")
    ) return false;
    return envelope.run === null || this.isValidSaveRun(envelope.run);
  }

  private normalizeEnvelope(value: unknown): SaveEnvelope | null {
    const candidate = migrateSaveEnvelope(value);
    return candidate && this.isValidSaveEnvelope(candidate) ? candidate : null;
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
