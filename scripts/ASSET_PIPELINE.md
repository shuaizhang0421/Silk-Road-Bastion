# 运行资产管线

仓库只保存浏览器运行所需的压缩资源。Blender、FBX、OBJ、原始 glTF 与高分辨率贴图保存在仓库外的本地设计源目录。

当前 Quaternius CC0 建筑模块由 glTF Transform CLI 4.4.2 转换为自包含 GLB：

```bash
gltf-transform optimize source.gltf output.glb --compress meshopt --texture-compress webp
```

导出后必须执行 `pnpm test:assets`。审计会检查许可证、桌面/移动资源数量、Meshopt、WebP、单文件大小、总下载预算以及远程资源请求。

角色与核心建筑的源文件应统一使用米制比例、Y 轴向上、对象原点位于地面中心，并为桌面、通用和移动端保留 LOD0、LOD1、LOD2。任何新增第三方资产必须先登记作者、来源、许可证、修改说明和许可证副本。
