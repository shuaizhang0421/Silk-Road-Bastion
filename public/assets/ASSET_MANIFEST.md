# 资产清单

> v0.8 合规原则：运行时仅使用本清单所列原创、CC0 或逐项审核的 CC BY 资产；不加载其他游戏、影视或来源不明的远程素材。第三方代码声明见项目根目录 `THIRD_PARTY_NOTICES.md`。

## Kenney Castle Kit

- 来源：https://kenney.nl/assets/castle-kit
- 许可证：Creative Commons CC0 1.0 Universal
- 下载日期：2026-07-29
- 使用文件：城门、围墙、墙角、立柱、六角塔、弩炮、攻城锤、岩石、树木、旗帜
- 项目修改：统一丝路色调、改变缩放和组合、添加自定义光照、粒子、旗帜与建筑部件
- 许可证副本：`models/kenney/castle/LICENSE.txt`

## Kenney Animated Characters Protagonists

- 来源：https://kenney.nl/assets/animated-characters-protagonists
- 许可证：Creative Commons CC0 1.0 Universal
- 下载日期：2026-07-29
- 使用文件：基础人物骨骼、待机和奔跑动画、沙匪皮肤
- 项目修改：添加丝路披风、围巾、长矛、阵营材质与比例调整

## Kenney Animated Characters Survivors

- 来源：https://kenney.nl/assets/animated-characters-survivors
- 许可证：Creative Commons CC0 1.0 Universal
- 下载日期：2026-07-29
- 使用文件：行者和重甲敌军皮肤
- 项目修改：添加丝路披风、围巾、盾牌、爆破装置与阵营材质
- 许可证副本：`models/kenney/characters/LICENSE.txt`

## Quaternius Character Animated

- 来源：https://quaternius.com/packs/rpgcharacters.html
- 下载镜像：https://poly.pizza/m/DgOCW9ZCRJ
- 许可证：Creative Commons CC0 1.0 Universal
- 下载日期：2026-07-29
- 使用文件：`models/quaternius/character-animated.glb`
- 项目修改：调整场景比例、阴影、材质色调，并接入待机与奔跑动画

## Quaternius Medieval Village MegaKit Standard

- 来源：https://quaternius.com/packs/medievalvillagemegakit.html
- 官方分发：https://store.godotengine.org/asset/quaternius/medieval-village-megakit/
- 许可证：Creative Commons CC0 1.0 Universal
- 下载日期：2026-08-11
- 使用文件：`models/runtime/desktop/` 与 `models/runtime/mobile/` 中 10 个同名 GLB：`Wall_UnevenBrick_Straight`、`Wall_UnevenBrick_Door_Round`、`DoorFrame_Round_Brick`、`Door_2_Round`、`Wall_UnevenBrick_Window_Wide_Round`、`Prop_Crate`、`Prop_Wagon`、`Prop_WoodenFence_Single`、`Balcony_Cross_Straight`、`Prop_Chimney`
- 未随包发布：其余模型、原始 Blend/FBX/OBJ、高分辨率源纹理和示例场景
- 项目修改：使用 glTF Transform 4.4.2 转换为 Meshopt 压缩、WebP 纹理的自包含 GLB；移动端版本采用更低纹理预算；统一比例、命名、碰撞、阴影和丝路砂岩/木构配色；重新组合为原创驿站门楼、墙面、商栈、工坊与商队停靠区
- 许可证副本：`models/runtime/LICENSE.txt`

## Poly Haven 四区域公共 PBR 材质

- 来源与许可证说明：https://polyhaven.com/license
- 许可证：Creative Commons CC0 1.0 Universal
- 下载日期：2026-08-11
- 使用资产：Aerial Sand、Old Sandstone 02、Rough Wood、Rusty Metal 05
- 使用文件：每项 1K JPG 的 diffuse、OpenGL normal 与 roughness 贴图
- 项目修改：统一平铺比例、色调、法线强度和移动端显存预算；砂地用于绿洲，旧砂岩经顶点混色用于峡谷、雾港与星砂地表和建筑；不使用示例渲染、网站标志或用户作品
- 许可证记录：`materials/polyhaven/LICENSE.txt`

## 项目原创资产

- 商栈、机巧工坊、火油塔、拒马、双开城门、门楼、驿站核心、遗物台和区域沙盘由项目代码实时组合生成。
- 背景音乐、风声和所有音效由项目内 Web Audio API 实时合成，不包含第三方录音或受版权保护曲目。
- 音乐旋律采用项目原创短音列，白天、夜袭和选择阶段会动态切换节奏与配器。
- v7 丝翼机械鸢、三分支拒马（刺桩、流沙、火油）、扩展商道、导航标记、首领阶段反馈与远端地貌由项目代码原创生成，不引用现有游戏造型。

## 原创生成四区域地貌材质

- 生成日期：2026-08-09
- 发布使用文件：`art/region-oasis-ground-v1.jpg`、`art/region-canyon-ground-v1.jpg`、`art/region-mist-ground-v1.jpg`、`art/region-stardust-ground-v1.jpg`
- 用途：绿洲商路、赤岩峡谷、雾港遗址和星砂高原的独立近郊地表材质
- 生成方式：OpenAI 图像生成工具，四组项目专用原创提示词
- 内容约束：正交俯视、无人物、无文字、无商标、无既有游戏角色、地标、地图或画风复刻
- 项目修改：统一缩放为 1024 像素、JPEG 82 质量，设置为 Three.js 重复地表纹理；移动端与桌面端共享纹理并由渲染画质控制像素密度

## v7 原创角色与首领组合件

- 生成日期：2026-08-09
- 使用方式：合法 CC0 骨骼基模仅提供基础人体与通用动作，身份轮廓、武器、甲胄、丝路纹样、阵营配色和首领技能部件由项目代码原创组合
- 首领：盾卫统领的塔盾与军旗、爆破队长的火药架与引信、机械鸢群的丝翼阵列、披甲攻城兽的护甲与撞击架均为本项目独立设计
- 动作：复用基模的通用待机、行走和攻击骨骼片段，并以项目逻辑编排瞄准前摇、列阵、埋雷、分裂、俯冲、蓄力和阶段转换；不提取或临摹其他游戏动作

## 原创标题概念参考

- 生成日期：2026-07-29
- 本地设计源：同级非仓库目录 `Silk-Road-Bastion-Source/art-source/title-fortress-original.png`（不随发布包上传）
- 用途：动态 3D 首页的构图、光色与材质参考，不作为运行时背景图
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无现有游戏角色、无既有地图复刻
- 项目修改：实际首页直接复用游戏内城墙、道路、建筑、角色、天气和灯光；概念图不进入发布包

## 原创生成应用图标

- 生成日期：2026-08-02
- 发布使用文件：`icon/silk-road-bastion-icon-512.png`、`icon/silk-road-bastion-icon-192.png`、`icon/apple-touch-icon.png`
- 用途：浏览器标签、GitHub Pages 网站图标与手机/平板添加至主屏幕图标
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无既有游戏名称、角色或图标复刻
- 项目修改：从原图导出 512、192 与 180 像素 PNG；以城门、穹顶、床弩和灯火作为小尺寸下仍清晰的视觉锚点

## 原创生成 v5 驿站封面环境

- 生成日期：2026-08-01
- 本地设计源：同级非仓库目录 `Silk-Road-Bastion-Source/art-source/title-fortress-v5.png`（不随发布包上传）
- 用途：v5 首页与游戏内实时 3D 场景的美术参考，不作为运行时背景图
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无现有游戏角色、无既有地图复刻
- 项目修改：封面与游戏实际画面均使用实时 Three.js 城门、角色、防御建筑和地貌；本图仅用于统一材质、色彩、灯光和场景密度

## 原创生成绿洲道路地表

- 生成日期：2026-07-29
- 发布使用文件：`art/oasis-road-ground-v1-2048.jpg`
- 本地设计源：同级非仓库目录 `Silk-Road-Bastion-Source/art-source/oasis-road-ground-v1-2048.png`（不随发布包上传）
- 用途：绿洲商路的可平铺地面与驿站外道路材质
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无既有游戏角色、无现有地图复刻
- 项目修改：缩小至 2048 像素以控制移动端显存，并以重复平铺方式接入 Three.js 场景

## 原创生成商队石砂道路

- 生成日期：2026-08-02
- 使用文件：`art/silk-road-caravan-road-v1.jpg`
- 用途：城门外主商道与支路的可平铺表面材质
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无现有游戏角色、无既有地图复刻
- 项目修改：以 JPEG 82 质量压缩至约 736 KB 后作为共享 Three.js 贴图重复平铺；保留石板、砂砾和浅车辙，以使可探索商道在各区域地貌中清晰可辨

## 原创四区域连续高度场与动态远景

- 生成日期：2026-08-11
- 发布形式：`src/game.ts` 中按世界编号生成的分块高度场、地表混色、道路曲线、生态组群、动态天空与多层程序化山脉
- 用途：连接基地、近郊探索区和远景地平线；远景不参与碰撞与寻路，运行时不再加载固定全景背景图
- 原始构成：四区域地表贴图只提供微观砂石/湿土/岩层纹理，地形轮廓、坡度、道路、水域、地标和生态布局均由项目代码原创生成
- 内容约束：不复刻任何现有游戏地图、地标、角色或视觉识别；世界编号只组合项目自有规则和已登记本地资产
- 旧参考图：早期固定全景图已在 v0.8 清理，不进入 `public/`、构建产物或运行时请求

## 四区域独立运行包

- 实现日期：2026-08-11
- 包定义：`src/asset-manifest.ts` 中的 `regionAssetBundles`
- 公共层：角色、敌人、城墙、门窗、货物、床弩、拒马和三类资源共用已登记的原创或 CC0 资产
- 区域层：四张原创地表、区域顶点混色、独立道路轮廓、水体、天气、地标、生态组群和建筑配色
- 加载策略：首页只加载绿洲预览；新开局、续玩或迁营时加载目标区域地表，离开后释放上一非绿洲区域纹理；其他三区不进入首屏下载
- 回退策略：包加载失败时显示具体错误并中止迁营，不以未登记几何占位继续正式流程

## 原创生成丝路砂岩墙体

- 生成日期：2026-08-01
- 发布使用文件：`art/silk-road-sandstone-v1.jpg`
- 本地设计源：同级非仓库目录 `Silk-Road-Bastion-Source/art-source/silk-road-sandstone-v1.png`（不随发布包上传）
- 用途：围墙、门楼、塔楼与石制建筑基座的可重复材质
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无现有游戏、影视或现实地标的可识别复制
- 项目修改：作为共享的 Three.js 材质贴图接入；按对象尺寸平铺，并与本地光照、阴影和丝路色调共同渲染

## 原创生成驿站风蚀木料

- 生成日期：2026-08-01
- 发布使用文件：`art/silk-road-timber-v1.jpg`
- 本地设计源：同级非仓库目录 `Silk-Road-Bastion-Source/art-source/silk-road-timber-v1.png`（不随发布包上传）
- 用途：双开城门、商栈、工坊、核心帐篷木构与攻城器械的可重复材质
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无现有游戏、影视或现实地标的可识别复制
- 项目修改：作为共享的 Three.js 材质贴图接入；保留程序化结构、金属包角和场景内受光变化

## 原创生成驿站庭院砂岩铺装

- 生成日期：2026-08-01
- 发布使用文件：`art/silk-road-courtyard-paving-v1.jpg`
- 本地设计源：同级非仓库目录 `Silk-Road-Bastion-Source/art-source/silk-road-courtyard-paving-v1.png`（不随发布包上传）
- 用途：驿站院内连续砂岩地表；在所有区域中保持可辨认的基地边界和历史质感
- 生成方式：OpenAI 图像生成工具，项目专用原创提示词
- 内容约束：无文字、无商标、无可识别现有游戏或影视资产；正交、无物件、无光照烘焙的可平铺材质
- 项目修改：作为 Three.js 重复平铺贴图接入；贴图加载失败时回退到项目内程序化石砖，不影响玩法
