# 来源、许可与开发状态

本项目为非官方 GTNH 种子预览工具。预测不保证世界中实际生成的结果；模组名称及素材归各自权利人所有。

源码、问题反馈和来源更正：[Chunkbase-GTNH](https://github.com/Invalidcod3/Chunkbase-GTNH)。

## 代码

地图交互和部分预测逻辑移植自 [Amidst-GTNH](https://github.com/Invalidcod3/Amidst-GTNH)，参考提交为 `c5e09fedf99ee211b8073d38060b048fb4e03179`。该参考项目包含 Amidst 及其贡献者的工作。随附 `LICENSE.txt` 为 GPL-3.0；Web 移植代码遵循该许可。网页作者为 InvalidCode，源码仓库为 [Chunkbase-GTNH](https://github.com/Invalidcod3/Chunkbase-GTNH)，完整部署包应同时提供对应的 `chunkbase-gtnh-source.zip`。

## 模组与图标

矿物译名对照 [Kiwi233/Translation-of-GTNH](https://github.com/Kiwi233/Translation-of-GTNH)，固定版本 `d2635d9e7137f7886ad29f9d20c8b445cefa9e09`，感谢 Kiwi 及该项目贡献者。本页提取实际使用的材料名称，用于界面显示和双语搜索；没有更改预测标识或采集记录。汉化项目 README 标注翻译内容采用 CC-BY-NC-SA，同时仓库附有 MIT LICENSE；原始许可与来源清单随附于 `i18n/Translation-of-GTNH-LICENSE.txt`、`i18n/Translation-of-GTNH-NOTICE.txt` 和 `i18n/resource-translation-sources.json`。

Chunkbase NH 页面主题来自维护者提供的 Illustrator / PDF 设计。NH 标志为源稿中的矢量图形；界面 SVG 和 Minecraft / Minecraft Ten 字体来自同目录所附素材，维度后备方块图标来自原 Amidst 的 profileicons。此说明记录素材来源，不改变其原有权利归属。

维度立体图标 `assets/ui/dimension-*.png` 使用本地 GT5-Unofficial 源码中的 `assets/gtneioreplugin/textures/blocks/*_{top,front,right}.png`，对应 `DimensionHelper` 的缩写映射。通过 `tools/ImportDimensionIcons.java` 按 Amidst `ProspectingTextures.dimensionIcon` 相同的最近邻采样和三面仿射变换生成；原素材权利归其作者所有。NH 矢量标志同时用于浏览器标签页图标。

资源图标 `assets/resources/` 复用本地采集的 GT/Visual Prospecting 矿石贴图。小行星优先匹配相同维度、相同矿脉的贴图，否则复用同矿物贴图；冰矿脉按 GT5 OreMixes 的主要矿物、MaterialBuilder 的材质与配色叠加在浮冰上。流体使用 GT5、IC2、GalaxySpace 和 Minecraft 的静态首帧，自动生成的流体使用对应材质色。筛选中的矿物图标使用相同立方体投影与侧面明暗，流体保持平面。`tools/import-resource-icons.py` 与 `tools/RenderResourceIcons.java` 可重建这些显示素材，图标目录不包含预测参数、存档或运行时代码。

当前使用的模组标记来自旧项目已跟踪图标，逐个对应原地图中的图标。来源包括 Minecraft、Hardcore Ender Expansion、Draconic Evolution、Galacticraft 和 GalaxySpace。保留来源不意味着这些第三方素材自动适用项目的 GPL 许可。

新增村庄、下界要塞、LootGames、Tinkers' Construct、AE2 及尖塔标记同样沿用参考项目中的对应图标；Automagy 尖塔与旧图一致使用 Thaumcraft 祭坛图标。资源绘制规则移植自参考项目的 `ProspectingOverlay`。资源算法依据原 Worker / GregTech 的预测规则；维护者私有包中的配置来自 GregTech / GalacticGreg，名称、配色和纹理由 Visual Prospecting 提供。默认分发包不包含该运行时资源目录或纹理。

末地小行星使用参考项目中的 GregTech 硅岩粉、白钨矿粉和铂粉标记。私有小行星包读取 GalacticGreg 初始化的矿物权重，并按输入种子的全新末地计算岛屿避让；默认包不包含这套实际配置。原 Worker 的 HEE 避让读取已加载世界，可能与输入种子的全新末地不同。

暮色森林的 17 类可预测特征沿用原魔法地图图标，刷怪笼候选沿用 Minecraft 标记。暮色底图、原版洞穴及 Hodgepodge 随机数优化在私有维护包中编译为浏览器函数。暮色配色运行参考 Amidst 的默认配色规则生成；命名空间是本工具声明的旧群系别名。刷怪笼仅为候选，额外生成事件和存档变化可能影响实际结果。

| 来源 | 当前用途 | 授权核对入口 |
| --- | --- | --- |
| Minecraft / Amidst | 要塞、矿井、末影之眼、程序图标 | [Minecraft EULA](https://www.minecraft.net/eula)、原项目 |
| Hardcore Ender Expansion | 三类末地岛屿材质 | [GTNH 分支说明](https://github.com/GTNewHorizons/Hardcore-Ender-Expansion) |
| Draconic Evolution | 混沌核心标记 | [GTNH 分支](https://github.com/GTNewHorizons/Draconic-Evolution) |
| Galacticraft | 月球村庄、星球地牢及火星洞穴图标 | [GTNH 分支许可](https://github.com/GTNewHorizons/Galacticraft/blob/master/LICENSE.txt) |
| GalaxySpace | 谷神星、木卫一、土卫二、海卫八、冥王星地牢图标 | [官方项目](https://www.curseforge.com/minecraft/mc-mods/galaxy-space-addon-for-galacticraft) |

此包为本地开发预览，第三方素材的公开再分发授权尚未逐项确认。来源说明、免责声明和联系渠道不代替必要的授权。

## 实际支持边界

已接入：末地圆形示意底图；月球及部分星球的单一生物群系；HEE 岛屿和塔、混沌岛、主世界要塞/矿井、月球村庄/地牢、火星洞穴及部分星球地牢预测。

新增：LootGames 地牢、主世界史莱姆空岛、AE2 陨石候选、下界要塞和 Automagy 尖塔候选；下界史莱姆空岛算法已移植，但当前环境关闭。RWG 村庄位于私有本地函数包。原 Java 离线对照已通过；村庄、矿井及新增模组结构也通过当前实例样本复核。下界要塞仍以原 Java 离线对照为依据。

本地私有包另支持 Roguelike 地牢、Thaumcraft 灵气节点和邪术祭坛。已通过 20 组实例查询对照，保留原 Worker 对不确定区块的省略规则。Roguelike 的入口图标沿用参考 Amidst 对应的 Minecraft 结构图标，节点／祭坛沿用 Thaumcraft 图标。维护者需显式安装已校准的地表结构配置。

矿脉和流体的模式切换、筛选、详情及 CSV／JSON／JourneyMap 导出已接通；真实资源预测可通过显式安装已校准的私有包启用。41 个维度、252 组实例数值对照通过。未安装函数包时显示待接入状态，不展示示例矿脉。

默认分发包不含 RWG/BOP、暮色底图、洞穴函数和真实资源配置；本地校准预览可安装。仍未接入：下界底图、其他复杂星球底图、其余原 Worker 能力、存档分析。HEE 结果按全新末地计算，岛屿形状不是实际方块轮廓。配置和模组版本会影响结果。

JVM 中间包、游戏 JAR、原始配置、存档、认证令牌和运行时采集目录均不包含在静态网页包中。
