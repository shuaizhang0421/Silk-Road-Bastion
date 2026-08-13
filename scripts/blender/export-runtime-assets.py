"""Deterministic Blender exporter for authored Silk Road Bastion collections.

Usage:
  blender --background source.blend --python export-runtime-assets.py -- --output public/assets/models/authored

Collections must be named EXPORT_<asset-id>_LOD0, EXPORT_<asset-id>_LOD1 or
EXPORT_<asset-id>_LOD2. Colliders use COLLIDER_<asset-id>. Nothing outside an
EXPORT collection is written to the runtime package.
"""

import argparse
import json
import math
import os
import sys

import bpy


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", default="asset-export-report.json")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])


def export_collection(collection, output_path):
    bpy.ops.object.select_all(action="DESELECT")
    objects = [obj for obj in collection.all_objects if obj.type in {"MESH", "ARMATURE", "EMPTY"}]
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_add_webp=True,
        export_image_webp_fallback=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )


def main():
    args = arguments()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    os.makedirs(args.output, exist_ok=True)
    report = []
    for collection in sorted(bpy.data.collections, key=lambda item: item.name):
        if not collection.name.startswith("EXPORT_"):
            continue
        name = collection.name.removeprefix("EXPORT_").lower().replace("_", "-")
        path = os.path.join(args.output, f"{name}.glb")
        export_collection(collection, path)
        dimensions = []
        triangles = 0
        for obj in collection.all_objects:
            if obj.type != "MESH":
                continue
            dimensions.append([round(value, 4) for value in obj.dimensions])
            triangles += sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)
        report.append({"asset": name, "file": path, "triangles": triangles, "objectDimensions": dimensions})
    report_path = os.path.join(args.output, args.report)
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(f"Exported {len(report)} authored collections; report: {report_path}")


if __name__ == "__main__":
    main()
