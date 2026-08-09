import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 4096,
    // Three.js 单独缓存后的未压缩 vendor 包约 680KB，gzip 后约 178KB。
    // 以已审计的渲染运行时作为告警上限，避免把正常 vendor 分包误报为游戏逻辑膨胀。
    chunkSizeWarningLimit: 720,
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
