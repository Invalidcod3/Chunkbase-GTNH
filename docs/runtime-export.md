# GTNH 环境导出

## 1. 只读环境检查

```sh
python tools/inspect-environment.py --instance "PATH_TO_INSTANCE" --output private-packs/environment.json --probe-worker
node tools/make-environment.mjs private-packs/environment.json dist/environment.json
```

支持 Prism 实例根目录和直接 `.minecraft` 目录。只读取相关模组的名称/哈希及选定生成配置。可选的 `--probe-worker` 只查询本机 Worker 的 hello；认证 token 只在内存中使用，不写入报告或静态目录。不启动游戏、不修改存档。

配置核对不能替代注册表快照：动态模组初始化、变换器、运行时开关和版本差异仍需在运行环境内验证。检查工具当前没有导出完整矿脉/流体目录。

## 2. 静态依赖提取

```sh
python tools/export-runtime.py --instance "PATH_TO_INSTANCE" --entry rwg.world.ChunkManagerRealistic --output private-packs/rwg.zip
```

可以重复 `--entry`，也可使用 `package.Class#method` 校验指定入口方法存在。输出包含：

- `classes/`：选中类及保守的类依赖闭包。
- `graph.json`：类来源、SHA-256、父类、接口、方法签名、静态调用边、字段访问。
- `manifest.json`：入口、可选环境 profile、来源 JAR 哈希、来源许可文件名。
- `report.json`：缺失类、多版本冲突、反射、invokedynamic/native、所需平台适配及未完成步骤。

该工具解析 class 文件，不执行未知 JAR。扫描实例 mods、libraries、versions。启动器外部共享库需要另行补入选定输入环境；不会遍历整个用户目录猜测依赖。多版本 JAR 不会被默默认定正确，报告中会列出歧义。输出使用独占创建，不覆盖已有中间包。

调用图为静态分析，闭包当前保留整类，因此可能包含地图计算用不到的方法。它不证明所有动态分派和反射路径已被发现。资源加载、静态字段值和对象图不从字节码中自动推断。

首次实际 RWG 提取得到 135 个类，缺少 Minecraft、Forge、Guava、Trove 等类，说明原始 JAR 层面的提取不是完整函数运行环境。该中间结果保存在私有目录，没有放进静态包。

## 3. JVM 字节码采集

```sh
node tools/build-agent.mjs
```

生成 `artifacts/capture-agent/amidst-runtime-capture.jar`。复制并修改 `tools/capture-agent/example.properties`，指定独立输出目录与需要观察的类名前缀。维护者为 GTNH JVM 添加参数：

```text
-javaagent:PATH_TO/amidst-runtime-capture.jar=PATH_TO/capture.properties
```

启动游戏后，在原 Worker 中覆盖计划支持的维度、种子和查询，再关闭本次采集进程。工具只观察类加载，不修改字节码，不注入方法计数器，也不是方法运行轨迹。对于 LaunchWrapper，看到的是提交给 JVM 时的类字节；之后注册的其他 Java agent 仍可能改变它。没有宣称捕获任意顺序下的最终定义。

```sh
python tools/export-runtime.py --instance "PATH_TO_INSTANCE" --entry rwg.world.ChunkManagerRealistic --capture "PATH_TO_CAPTURE" --output private-packs/rwg-captured.zip
```

采集的定义覆盖原 JAR 定义。同名类存在不同采集版本时显式报错，需要选择同一次、同一套加载环境。采集未覆盖的类仍可来自原始 JAR；报告逐项标注来源，不能把混合来源说成已完成转换。

## 4. 浏览器转换仍是独立步骤

当前未实现任意模组字节码到 Web 的自动编译器。中间包始终标记 `browserExecutable: false`。不能通过修改该布尔值使其可运行。

后续需解决入口裁剪、Minecraft/Forge 类适配、反射目标、配置与注册表初始化、资源、数值语义、转译，以及与原 Worker 的差分验证。[TeaVM 官方说明](https://teavm.org/docs/intro/overview.html)明确列出反射、资源、类加载、JNI 的限制，因此采用 TeaVM 也需要实际适配。

真正编译完成的 JS/Wasm 包才按 `docs/architecture.md` 的接口安装到 `dist/packs/`。网页不允许把用户上传的任意 JAR/ZIP 当脚本执行。
