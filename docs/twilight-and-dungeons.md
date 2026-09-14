# 暮色森林与主世界刷怪笼候选

私有静态包增加暮色底图、17 类特征，以及主世界原版刷怪笼候选。全部计算在浏览器 Worker 内完成；仅维护时需要游戏实例。旧 Amidst 参考仓库保持不变。

切换可选结构筛选时只重新请求结构结果，保留已经完成的底图和当前可见标记；取消中的底图请求可自动补取，避免慢扫描触发整幅地图清空。

## 暮色森林

捕获当前实例实际加载的 Twilight GenLayer、Minecraft 缩放层及 Hodgepodge `RandomAid`，保留生成方法原始字节码，排除游戏启动流程。配置适配器只提供初始化群系身份与整数数组分配。特征定位编译原 Worker 源码，群系判断调用同一生成链的完整分辨率结果。

编译时使用显式 Java 48 位随机数兼容层：TeaVM 0.15 的 `Random.nextInt(bound)` 采用不同的取值算法，不能直接用于种子预测。已核对的类哈希固定在 `tools/generation-adapters.json`，模组更新后必须复核适配器，不能直接接受变化的输入。

界面沿用原魔法地图图标，支持独立筛选矿山、树篱迷宫、娜迦庭院、巫妖塔、极光宫殿、任务岛、任务树丛、九头蛇巢穴、地下迷宫、黑暗高塔、骑士要塞、雪怪巢穴、巨魔洞窟、最终城堡和蘑菇塔。原目录包含但原预测器不返回的德鲁伊树丛、浮空遗迹、世界树不宣称已定位。

19 个群系使用显式命名空间别名，数字 ID 只在当前环境和暮色维度内解释。颜色直接执行原 Amidst `GtnhBiomeColorPalette`。1 方块图使用完整层，4 方块图使用原始四分之一层；更远缩放从四分之一层取样，避免把地图平均成其他群系。每次换种子重新配置生成链；不缓存失败底图；分段处理支持取消。

当前实例 `oldMapGen=false`。五个种子覆盖 long 极值、超过 2^53 的数值、负坐标和接近世界边界的区域，40 组实例查询中 76,800 个像素与 3,845 个特征完全一致，覆盖全部 17 类可返回特征。旧生成模式有适配入口，但未作为当前实例的已校准模式发布。

## 主世界刷怪笼

原 Worker 在填满石头的虚拟区块上运行洞穴生成器，再筛选 RWG 的八次地牢尝试。浏览器编译当前 `MapGenBase` / `MapGenCaves` 和 Hodgepodge `StdLCG`，保留后者直接写入种子的特殊行为；只移除经检查不被读取的 Mixin 包装回调，保留包装函数本身的随机数逻辑。浮点运算逐步降为 `Math.fround`，与 JVM 的 float 精度一致。

游戏适配器提供种子、石头／空气／岩浆身份，以及全石头掩码所需的实体地表材料。它不模拟游戏世界，不生成存档区块，也不表示最终地形。原 Worker 同样使用这种全石头洞穴掩码；35 个区块共 2,293,760 个单元的掩码摘要与实例完全一致。

候选判断保留地下水湖／岩浆湖的随机消耗、原 RWG 地表高度、洞穴开口数量、地板及天花板完整性。扫描额外获取周边 144 方块的原版结构，避让村庄、矿井和要塞；第一处成功尝试后停止，避免错误复用战利品消耗后的随机数。即使候选落在请求范围外，也保留这项停止规则，使拆分查询一致。

15 组区域的 99 个候选位置及 Y 高度、142 个周边结构通过实例对照。集成提供器和跨区块拆分另行核对。结果仍标为 `POSSIBLE`；默认不扫描，勾选“刷怪笼候选”后开启，建议先放大地图。详情显示 Y，CSV／JSON 保留原 Worker 的 `subtype` 高度。JourneyMap 名称包含预测 Y，标记高度仍遵循现有导出窗口的手动设置。

## 更新与校准

维护工具临时安装返回 null 的类观察器，读取初始化配置及独立种子预览对象的摘要。它不更改 Worker 代码或真实游戏区块。捕获与函数输出在被忽略的 `private-packs/` 内，默认静态包与源码包均不携带实际模组字节码。

```sh
python tools/capture-resources.py --instance "实例目录" --pid JVM进程号
python tools/compile-twilight.py
python tools/compile-caves.py
node tools/plan-twilight-calibration.mjs
node tools/plan-dungeon-calibration.mjs
python tools/collect-calibration.py --instance "实例目录" --plan private-packs/runtime-session/twilight-plan.json --output private-packs/runtime-session/twilight-reference.json
python tools/collect-calibration.py --instance "实例目录" --plan private-packs/runtime-session/dungeon-plan.json --output private-packs/runtime-session/dungeon-reference.json
node tools/calibrate-twilight.mjs
node tools/calibrate-dungeons.mjs
node tools/calibrate-surface-structures.mjs
node tools/calibrate-live-structures.mjs
node tools/calibrate-asteroids.mjs
node tools/calibrate-resources.mjs
python tools/build-rwg-preview.py --resources --surface --asteroids --twilight --dungeons
```

原有 RWG 原始函数与环境配置必须已校准。每份报告绑定代码／配置／样本哈希；可选功能全部预检通过后才开始覆盖本地预览。省略对应开关会移除构建目录中的旧可选函数和注册信息。
