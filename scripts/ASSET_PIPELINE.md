# Runtime 3D asset pipeline

Only project-authored, CC0, or individually reviewed CC BY sources may enter a `.blend` source file. Source files, raw textures, and references live in the sibling local-only `Silk-Road-Bastion-Source` directory. The deployable repository contains only reviewed GLB/WebP outputs, license copies, and the machine-readable manifest.

## Blender contract

- Metric units, one Blender unit equals one metre.
- The ground contact is at `Y=0` after glTF conversion; authored origins sit on the footprint centre unless the geometry contract says otherwise.
- Runtime collections are named `EXPORT_<asset-id>_LOD0`, `LOD1`, or `LOD2`.
- Collision helpers are named `COLLIDER_<asset-id>` and are not rendered.
- Buildings must contain a continuous foundation, body, roof, and entrance.
- LOD variants preserve world dimensions, origin, skeleton and collision bounds.
- All required animation names must exist in the GLB; the game may not silently substitute a made-up clip.

Run the exporter with the repository's `scripts/blender/export-runtime-assets.py`, then run `pnpm test:visual-assets`, `pnpm test:geometry`, `pnpm test:assets`, and a production build before accepting the outputs.
