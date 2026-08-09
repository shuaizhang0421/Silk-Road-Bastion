import "./style.css";
import phosphorFontUrl from "@phosphor-icons/web/regular/Phosphor.woff2?url";
import type { GameMode } from "./types";

const canvas = document.querySelector<HTMLCanvasElement>("#gameCanvas")!;
const loading = document.querySelector<HTMLElement>("#loading")!;
const loadingStatus = document.querySelector<HTMLElement>("#loadingStatus")!;
const loadingProgress = document.querySelector<HTMLElement>("#loadingProgress")!;
const fatal = document.querySelector<HTMLElement>("#fatalError")!;
const fatalText = document.querySelector<HTMLElement>("#fatalText")!;

// 只异步注册项目实际使用的单一图标字体。CSS 不再携带整套 fill/SVG/TTF 回退，
// 字体失败也不会阻止 WebGL 场景进入（按钮仍有 title 与文字语义）。
void new FontFace("Phosphor", `url(${phosphorFontUrl})`).load()
  .then((font) => document.fonts.add(font))
  .catch(() => undefined);

function showFatal(message: string): void {
  loading.classList.add("is-hidden");
  fatalText.textContent = message;
  fatal.classList.remove("is-hidden");
}

async function boot(): Promise<void> {
  if (!document.createElement("canvas").getContext("webgl2")) {
    showFatal("当前浏览器或显卡未启用 WebGL 2。请更新浏览器并开启硬件加速。");
    return;
  }

  // 先让加载界面完成首帧，再异步获取 Three.js、游戏逻辑和模型加载器。
  // 这样静态首页壳不会被大型 3D 运行时阻塞，音频仍只会在玩家首次操作后创建。
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const [{ SilkRoadGame }, { AssetLibrary }] = await Promise.all([
    import("./game"),
    import("./models")
  ]);

  const library = new AssetLibrary((loaded, total) => {
    const ratio = total > 0 ? loaded / total : 0.08;
    loadingProgress.style.width = `${Math.max(8, Math.round(ratio * 100))}%`;
    loadingStatus.textContent = ratio < 0.42 ? "正在搭建城墙" : ratio < 0.78 ? "正在召集行者" : "正在点亮驿站";
  });

  try {
    await library.load();
    loadingProgress.style.width = "100%";
    const game = new SilkRoadGame(canvas, library);
    game.showTitle();
    game.animate();
    loading.classList.add("is-hidden");

    const startScreen = document.querySelector<HTMLElement>("#startScreen")!;
    const continueButton = document.querySelector<HTMLButtonElement>("#continueBtn")!;
    let selectedMode: GameMode = "expedition";

    startScreen.classList.remove("is-hidden");
    game.refreshTitleUi();

    document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedMode = button.dataset.mode as GameMode;
        game.setMode(selectedMode);
        document.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
        const modeCopy = {
          expedition: ["守商路，逐夜扩建", "从一座小驿站出发，每 3 夜开辟新的防线。"],
          survival: ["一座城，守得更久", "没有扩城机会，靠布局、维修与针对性火力抵住战术攻势。"],
          training: ["一名行者，一次远行", "选择职业，清理随机营地，带着不同装备挑战最终首领。"]
        } as const;
        document.querySelector("#modeKicker")!.textContent = modeCopy[selectedMode][0];
        document.querySelector("#modeDescription")!.textContent = modeCopy[selectedMode][1];
      });
    });

    document.querySelector("#newGameBtn")?.addEventListener("click", () => {
      game.newGame(selectedMode, "");
    });
    continueButton.addEventListener("click", () => {
      game.continueGame();
    });
    game.renderSaveSlots();
    document.querySelector("#exportSaveBtn")?.addEventListener("click", () => game.exportSaves());
    document.querySelector<HTMLInputElement>("#importSaveInput")?.addEventListener("change", async (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const file = (input.files ?? [])[0];
      if (file) await game.importSaves(file);
      input.value = "";
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知资源加载错误";
    console.error(error);
    showFatal(`3D 模型加载失败：${message}`);
  }
}

void boot();
