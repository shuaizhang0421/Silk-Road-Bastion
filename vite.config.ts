import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 4096,
    // Three.js 与游戏规则分包：首屏加载仍保持静态部署，但浏览器可以独立缓存大型渲染运行时，
    // 后续热更新、返回封面和跨模式切换不会重复下载整包。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three-runtime";
          if (id.includes("node_modules/@phosphor-icons/")) return "interface-icons";
          return undefined;
        }
      }
    }
  }
});
