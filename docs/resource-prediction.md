# 浏览器资源预测与实例校准

当前本地静态预览已经接入界面现有的 11 个维度：主世界、下界、末地、暮色、月球、火星、谷神星、木卫一、土卫二、海卫八、冥王星。没有流体配置的维度会显示明确提示。其余 30 个资源维度已采集和校准，尚未扩展到界面维度菜单。

矿脉显示种子候选，流体显示各区块初始产量（L/Op）。数据来源不包含 Visual Prospecting 的存档记录、已枯竭矿脉或已抽取的流体状态。计算在浏览器 Web Worker 内完成；维护者的实例只用于导出和校准，访问者无需运行游戏。

## 本次验证

- 41 个资源维度、4 个种子、252 组 512×512 方块查询。
- 种子包括大于 2^53 的整数、long 最小值和最大值、负种子；查询包括跨零和未对齐的负坐标。
- 18,375 个矿脉的坐标、类型、中文名、材料、Y 范围、颜色、PNG 图标完全一致。
- 1,804 个流体区域、115,456 个区块的初始产量、类型、名称和颜色完全一致。
- 700 组混合随机调用及矿脉选择哈希与未改写的原 Worker Java 对照通过。
- 全套 360 项 Node 测试、13 项 Python 工具测试通过；已安装的 11 个界面维度和 17 个有效资源图层另通过入口模块、无配置图层及导出点检查。
- 新增结构另与当前 Worker 对照：24 个村庄、232 个矿井、122 个 LootGames 地牢、13 个史莱姆空岛、36 个 AE2 陨石、489 个 Automagy 尖塔。此检查不涵盖主世界要塞的群系调整、下界要塞及其他未移植结构。

这些是预测器数值对照，不能替代实际生成世界与完整视觉验收。

## 维护者更新流程

在当前受支持的 GTNH 2.9.0-beta-3 / Worker 协议 21 环境中，启动实例并保持 Worker 可响应。明确选择该实例的 Java 进程 ID，执行：

```sh
python tools/capture-resources.py --instance "实例目录" --pid 进程ID
node tools/plan-resource-calibration.mjs
python tools/collect-calibration.py --instance "实例目录" --plan private-packs/runtime-session/resource-plan.json --output private-packs/runtime-session/resource-reference.json
node tools/calibrate-resources.mjs
python tools/collect-calibration.py --instance "实例目录" --plan tools/calibration-plan.json --output private-packs/runtime-session/remaining-reference.json
node tools/calibrate-live-structures.mjs
python tools/build-rwg-preview.py --resources
node tools/serve.mjs --rwg-preview
```

导出器使用现有 Worker 的 tick 队列读取初始化后的 GT / GalacticGreg / Visual Prospecting 注册表，不修改类，不请求世界区块。导出包含候选顺序、权重、维度生成概率、矿脉间距模式、流体参数、显示名称、颜色和图标。JVM 给出的浮点根值保留在包中，避免浏览器 `Math.pow` 的细微差异。GT、VP 及 Worker JAR 指纹记录在本地 receipt；不会保存认证令牌。

资源模块保留 Java long 溢出、XSTR 有符号余数、FNV 有符号字节、流体权重的包含端点判断和 Java float 取整。零权重流体和无显示信息的矿脉候选也保留位置，不能在导出时排序或删除它们。

报告记录代码、配置和对照样本的 SHA-256。更换环境或算法后旧报告会失效，打包器拒绝将未通过当前校准的资源包接入预览。导入不同维度 ID 的设置会要求重新导出，避免拿旧资源注册表误算新维度。

资源包与原始运行时数据均在被忽略的 `private-packs/`。`--resources` 是显式启用选项，默认源码/静态分发包不包含实例配置、运行时纹理或参考存档。本地完整预览包仍为 `private-packs/amidst-gtnh-rwg-local-preview.zip`，地址 `http://127.0.0.1:4175/`。游戏启动后的文件导出与未来存档分析接口相互独立。

该工具适配当前观察到的注册表接口，不等于任意模组版本均可无适配导出。字段或生成器语义变化需要再次检查和校准。
