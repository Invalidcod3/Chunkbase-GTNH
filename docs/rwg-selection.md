# RWG 主世界底图接入

2026-09-13：已在私有本地静态预览接入当前 GTNH 2.9.0-beta-3 实例的主世界底图。浏览器独立计算，游戏只在维护时提供采集和校准数据。默认 `dist/packs/registry.json` 为空；本地校准包单独组装，不自动分发第三方函数。

## 当前结果

- 实际模式 `wrapped-perlin`，77 个 realistic 条目，59 个最终基础/河流群系。气候表保留顺序和重复权重。
- 182 个区块覆盖全部 realistic 条目，46,592 像素与实际 Worker 一致。
- 另外 193 个区块覆盖多个种子、long 极值、超过 2^53 的种子、负坐标和远距离坐标，49,408 像素一致。
- 网页 Provider 的 32×32、step=4、负起点、大种子查询，另有 1,024 像素与 Worker 一致。
- 15 个 JVM 原字节码地形案例：3,840 个最终 ID 和 3,840 个 binary32 高度与优化后的 JavaScript 一致。
- 早期选择子集保留 432 个受控案例，110,592 像素和 1,296 个标量完全一致，含四种噪声模式。

最初只映射基础/河流群系时，覆盖测试出现 3,106 个差异，全部涉及 Hot Desert 地表替换。加入实际 terrain 和 SurfaceDuneValley 参数后修正。RWG 高度是 X-major，群系结果是 Z-major，必须转换索引；Amidst 的 step=4 查询还需要两个方块的采样中心偏移。

浏览器函数复用参考 Worker 的紧凑混合、八格采样缓存和共享卷积点缓存。保留大于 95% 的群系选择规则，但高度仍混合全部邻居。仅地表需要时求高度。外层区块缓存有上限，约每 16ms 让出任务，响应维度/种子取消。Node 本机测得 128×128、step=4 地图块首次约 1.3 秒，缓存后约 5ms；不代表整个首屏或所有浏览器性能。

## 读取已运行实例

先以只读 Worker 请求初始化种子 0 采样器：

```sh
python tools/worker-query.py --instance "PATH_TO_INSTANCE" --command biomes --seed 0 --output private-packs/runtime-session/tile-0.json
python tools/worker-query.py --instance "PATH_TO_INSTANCE" --command hello --output private-packs/runtime-session/hello.json
python tools/build-profile-agent.py
```

采集器提供稳定入口 `artifacts/profile-agent/amidst-capture-entry.jar` 和按内容哈希命名的不可变 helper JAR。`private-packs/live-capture.properties` 指定 helper 和输出目录。用目标游戏 PID 附加：

```sh
java --add-modules jdk.attach -cp artifacts/profile-agent AttachCapture GAME_PID PATH_TO/amidst-capture-entry.jar PATH_TO/live-capture.properties
```

`mode=worker` 尝试读取 Worker 已保留的观察定义；本次缓存缺少管理器定义，实际采用 `mode=observed`：临时注册 JVM retransformation observer，其回调始终返回 null，采集后移除。对象读取排入 Worker 的 tick 队列。它不安装构造器钩子，无需重启，不写游戏存档；不能据此宣称其他已注册 agent 在 retransformation 时没有执行自己的逻辑。

读取的是有界 RWG 配置对象图，包括真实 terrain/surface 参数及共享引用。不会跟随世界/存档对象或外部类的任意字段。结果按内容哈希保存；从 `live-isolated/profiles/` 明确选定本次文件，复制为 `private-packs/runtime-session/active-profile.json`。失败必须查看报告，不能把 attach 返回当作采集成功。工具不打印或存储 Worker token。

稳定入口使用独立 ClassLoader，避免 RFB 系统加载器缓存可变 JAR 的旧 ZIP 偏移。更新 helper 会创建新哈希文件；不要覆盖正在使用的 helper。

另有启动时 premain 构造器观察方案，以及 `prepare-runtime-capture.py prepare/restore` 参数辅助工具。本次已恢复临时追加的参数，实际采集使用用户自行启动的实例。日常维护优先连接现有实例。

## 编译和对照

依赖缓存由 `compile-noise.py` 首次准备；后续使用缓存中的 Maven、TeaVM 0.15.0、ASM 9.8 离线编译，输出在项目 `.test-work/`。

```sh
python tools/export-runtime.py --instance "PATH_TO_INSTANCE" --entry rwg.world.ChunkManagerRealistic --entry rwg.world.ChunkGeneratorRealistic --capture private-packs/live-isolated/classes --output private-packs/rwg-live-extraction.zip
python tools/compile-worldgen.py --input private-packs/rwg-live-extraction.zip --adapter-profile tools/worldgen-compiler/runtime-profile.json --runtime-profile private-packs/runtime-session/active-profile.json
node tools/verify-terrain.mjs
node tools/verify-rwg-villages.mjs
python tools/collect-rwg-reference.py --instance "PATH_TO_INSTANCE" --targets private-packs/runtime-session/coverage-targets.json
node tools/calibrate-rwg.mjs --terrain --coverage
node tools/calibrate-rwg.mjs --terrain --extra
python tools/build-rwg-preview.py
node tools/serve.mjs --rwg-preview
node tools/verify-rwg-preview.mjs
```

维护者须在检查运行时字节码、字段布局和入口之后更新 `runtime-profile.json` 的 `inputClasses`，不能只自动接受新哈希。选择适配器有八个固定输入；`surface-adapter-profile.json` 另固定已检查的 realistic/surface 定义，新类或变化会拒绝旧适配。原始提取仍可能报告缺失完整 Minecraft/Forge 依赖；编译器只消费明确适配的子集。

`--extra` 使用 `worker-extra-reference.json`，可用 `collect-rwg-reference.py --targets FILE --output FILE` 采集额外样本；不覆盖覆盖率样本。构建器检查校准报告的函数和配置哈希，防止沿用旧结果。生产前应扩充边界和随机覆盖，有限样本不是完整证明。

保留的模组字节码包括 manager 的选择、河流、海洋函数，generator 的混合函数，实际 rNoise、terrain 和噪声函数。构造器改由明确字段和捕获对象图重建；long 缓存、坐标打包是环境适配。优化混合代码来自参考 Worker 的 `SurfaceBiomeSampler` 与 `RwgBiomeGrid`，以未优化原 generator 的 JVM 输出作独立对照。

JVM 对照在加入浮点适配之前执行。浏览器代码在 float 运算/转换后使用 `Math.fround` 保留 binary32 舍入，实现依据 [TeaVM JS 调用接口](https://teavm.org/docs/runtime/jso.html)。

## 配色、身份与边界

59 种颜色直接运行参考 Amidst 的 `GtnhBiomeColorPalette.defaultColor` 得到，沿用实际 Worker 的标签、温度、旧 ID 等输入。不会将 RWG 的 mapColor=0 直接画成黑色。暂保留实际英文显示名称。

`biome-aliases.json` 声明 Web 命名空间别名，以实际类及共享 River 类的具体变体区分身份。它们不是声称 1.7.10 官方存在的 registry key，也不保证等同于后续版本的命名。数字 ID 只放在本环境兼容映射中。

当前是 RWG 洞穴生成、population、Forge 后置事件及存档编辑之前的群系预测。当前 77 个实例条目中无 IslandTropical map generator；未知 surface/class 不自动沿用旧适配器。仍需覆盖更多地表组合和新版本。

实际函数、配置图、字节码和含函数的静态 ZIP 均在被忽略的 `private-packs/`。默认源码/静态打包不收录它们，再分发许可需独立确认。完整跨维度视觉验收、低性能设备首屏加载和其他复杂维度仍未完成。
