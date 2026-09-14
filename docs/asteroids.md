# 末地矿物小行星

已接入 `END_NAQUADAH_ASTEROID`、`END_SCHEELITE_ASTEROID`、`END_PLATINUM_ASTEROID`，保留原 Worker 的矿物筛选范围、图标、过滤和导出方式。实际矿物配置仅安装在私有静态预览中；浏览器不连接游戏，不上传种子。

## 算法与适用范围

`AsteroidCapture` 读取当前 GalacticGreg 的 `EndAsteroids` 初始化对象、概率、高度范围、石材列表及每种石材对应的有序加权矿脉列表。保留所有未显示的矿物及权重，不按三个可见类型重新归一化。浏览器复现原 Worker `EndAsteroidPredictor.selectCurrent` 的 64 位种子、XSTR、独立随机数副本、一成不漏的坐标抽样顺序；旧 GT5U 算法包不自动适配。

结果标为“全新末地位置”，不标为存档记录。中央 16 区块半径内排除；HEE 排除范围按输入种子的岛屿起始区块重建，包含起点至正方向第 14 区块的正方形；混沌岛使用原 DE 最近中心规则和 GT 排除半径。HEE 配色图层的圆形示意不能用于小行星避让。界面的混沌岛开关／间距同时影响显示和避让。

旧 Worker 直接调用 GT 的 `HEEIslandScanner`。该扫描器读取当前已加载的末地和按区域缓存的岛屿信息，未将查询种子作为参数；未加载末地时也可能缓存空结果。因此不能把任意远端区域的旧 Worker 输出当作输入种子的独立真值。网页沿用已有 HEE 预览的全新末地约定，避让缓存仅在单次查询内存在，切换种子和维度不会复用旧状态。末影龙重生历史、存档修改及已有世界未纳入预测。

## 对照验证

维护工具新建一个独立的原 Worker 预测器，仅在这个临时对象上关闭依赖已加载世界的两种避让方法，直接运行原 Java `selectCurrent`。不修改游戏中的 Worker、配置、世界或存档。

- 五个种子（含 long 极值、超过 2^53 的值），10,240 个正负／远端区块样本完全一致，其中 35 个可显示结果覆盖三种矿物。
- 640 个原 Java HEE 区域结果、2,560 个原 GT `RegionInfo.check` 边界样本、2,525 个原 GT 混沌岛避让样本完全一致。`RegionInfo` 使用临时 BitSet，由原 Java 全新末地预测器填充，绕过游戏的世界缓存。
- 六组中央区域的真实 Worker 完整查询共 62 个矿物小行星位置一致；这些样本不依赖远端 HEE 存档状态。
- 自动回归覆盖半开范围裁剪、负坐标、跨区块拆分、过滤、既有 HEE／混沌岛保留、配置隔离、切换种子及取消任务。

校准报告绑定引擎代码、配置及原始样本的 SHA-256，修改后必须重新校准才可打包。所有真实环境配置和样本均留在被忽略的 `private-packs/`。

## 维护流程

```sh
python tools/capture-resources.py --instance "实例目录" --pid JVM进程号
node tools/plan-asteroid-calibration.mjs
python tools/collect-calibration.py --instance "实例目录" --plan private-packs/runtime-session/asteroid-plan.json --output private-packs/runtime-session/asteroid-reference.json
node tools/calibrate-asteroids.mjs
python tools/build-rwg-preview.py --resources --surface --asteroids
```

已有 RWG、资源和地表结构校准报告也必须匹配当前产物。新导出的配置变化时，先按对应文档重新校准。省略 `--asteroids` 会移除构建目录中的旧小行星配置和注册信息，不影响基础末地底图。模组更新后应先核对对应字节码和固定反射字段，再运行维护工具。
