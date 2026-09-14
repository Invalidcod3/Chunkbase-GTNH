# 来源、许可与开发状态

本项目为非官方 GTNH 种子预览工具。预测不保证世界中实际生成的结果；模组名称及素材归各自权利人所有。

问题反馈、来源更正和权利人联系：[Amidst-GTNH 项目 Issues](https://github.com/Invalidcod3/Amidst-GTNH/issues)。

## 代码

地图交互和部分预测逻辑移植自 [Amidst-GTNH](https://github.com/Invalidcod3/Amidst-GTNH)，参考提交为 `c5e09fedf99ee211b8073d38060b048fb4e03179`。该参考项目包含 Amidst 及其贡献者的工作。随附 `LICENSE.txt` 为 GPL-3.0；Web 移植代码遵循该许可。新仓库尚未发布，源码位于本地独立 Web 仓库；对外提供网页包时应同时提供对应源码。

## 模组与图标

当前使用的模组标记来自旧项目已跟踪图标，逐个对应原地图中的图标。来源包括 Minecraft、Hardcore Ender Expansion、Draconic Evolution、Galacticraft 和 GalaxySpace。保留来源不意味着这些第三方素材自动适用项目的 GPL 许可。

新增村庄、下界要塞、LootGames、Tinkers' Construct、AE2 及尖塔标记同样沿用参考项目中的对应图标；Automagy 尖塔与旧图一致使用 Thaumcraft 祭坛图标。资源绘制规则移植自参考项目的 `ProspectingOverlay`，可接受维护者函数包提供的本地 PNG；当前没有随包安装真实资源目录或矿脉纹理。

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

离线新增：LootGames 地牢、主世界史莱姆空岛、AE2 陨石候选、下界要塞和 Automagy 尖塔候选；下界史莱姆空岛算法已移植，但当前环境关闭。RWG 村庄位于私有本地函数包。这些新增结果通过原 Java 离线对照，尚待实际 Worker 复核。

矿脉和流体的模式切换、筛选、详情及 CSV／JSON／JourneyMap 导出接口已接通；真实资源预测函数包仍待接入。未安装函数包时显示待接入状态，不展示示例矿脉。

未接入：RWG/BOP 主世界完整底图、下界和暮色底图、其他复杂星球底图、矿脉与地下流体、其余原 Worker 能力、存档分析。HEE 结果按全新末地计算，岛屿形状不是实际方块轮廓。配置和模组版本会影响结果。

JVM 中间包、游戏 JAR、原始配置、存档、认证令牌和运行时采集目录均不包含在静态网页包中。
