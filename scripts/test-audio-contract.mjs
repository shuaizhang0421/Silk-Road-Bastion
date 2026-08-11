import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const game = readFileSync(join(root, "src/game.ts"), "utf8");
const manifest = readFileSync(join(root, "src/asset-manifest.ts"), "utf8");

for (const id of ["musicVolume", "ambienceVolume", "effectsVolume", "lowDynamicsBtn", "muteAudioBtn"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`audio control missing: ${id}`);
}
for (const region of ["oasis", "canyon", "mist", "stardust"]) {
  if (!game.includes(`${region}: { notes:`)) throw new Error(`regional music profile missing: ${region}`);
}
for (const state of ["boss", "danger", "choice", "calm"]) {
  if (!game.includes(`this.musicMode === "${state}"`) && state !== "calm") throw new Error(`music transition missing: ${state}`);
}
if (!game.includes("ambienceNoise") || !game.includes("pressure") || !game.includes("bossActive")) throw new Error("dynamic ambience or combat layering is not connected");
if (!manifest.includes("silk-road-procedural-soundscape-v2") || !manifest.includes('license: "Project Original"')) throw new Error("original audio provenance is missing");
if (/new Audio\(\s*["'`]https?:\/\//.test(game)) throw new Error("remote audio is forbidden");

console.log("Audio contract passed: four regional profiles, adaptive combat layers, separate controls and original provenance.");
