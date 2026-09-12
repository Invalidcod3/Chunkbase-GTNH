# RWG 主世界底图接入进度

主世界地图还没有启用。当前完成的是原始群系选择和邻域混合，输出是 RWG realistic ID；它不等于 Minecraft 最终群系 ID，不能直接接到默认底图。

## 已验证的编译链路

```sh
python tools/export-runtime.py --instance "PATH_TO_INSTANCE" --entry rwg.world.ChunkManagerRealistic --entry rwg.world.ChunkGeneratorRealistic --output private-packs/rwg-worldgen-extraction.zip
python tools/compile-worldgen.py --input private-packs/rwg-worldgen-extraction.zip
node tools/verify-worldgen.mjs
node tools/preview-worldgen-validation.mjs
```

导出工具对缺失的完整游戏依赖返回非零退出码，并留下报告及中间包。后续的编译器仅消费已明确适配的选择子集，不忽略报告后假定整包可运行。先运行一次 `compile-noise.py` 准备固定版本的 Maven、TeaVM、ASM 依赖；主世界子集编译使用离线依赖缓存。

`tools/worldgen-compiler/profile.json` 固定八个输入 class 的哈希。版本改变或运行时变换改变字节码时，工具拒绝套用旧适配器，需要重新检查字段、入口与数值对照。

保留原字节码的计算方法：

- `ChunkManagerRealistic` 的 `getBiomeDataAt` 两个重载、`getOceanValue`、`diff`、`getRiverStrength`、`calculateRiver`。
- `ChunkGeneratorRealistic` 的 `getNewNoise`、`mix4`。
- Perlin、OpenSimplex、CellNoise 及噪声包装器。

明确适配的边界：构造器改为显式初始化字段；long 缓存和区块坐标打包使用独立适配；RealisticBiomeBase 只提供身份目录。原 `getNewNoise` 同时计算地形高度，当前给地形回调提供零值并丢弃所有高度结果，只检验群系选择输出，不将这些高度交给地表 painter。

JVM 对照先执行未经浮点降级处理的提取字节码；浏览器版本再为 JVM 的 float 运算和转换加入 `Math.fround`，保持单精度舍入。新增调用用于数值语义适配，不是重写群系判断规则。该实现使用 [TeaVM 的 JavaScript 调用接口](https://teavm.org/docs/runtime/jso.html)。

验证覆盖 6 个种子（含 long 极值和大于 2^53）、4 种噪声模式、3 套受控目录、6 组正负及远距离区块坐标，共 432 个案例：110,592 个群系像素、1,296 项原始群系/河流强度/海洋参数完全一致。受控目录包含稀疏 ID、重复权重、可选湿润/小群系组与单一群系。浏览器 Web Worker 同样通过，实测约 1.7 秒；这是这批验证的耗时，不是正式地图性能保证。

## 实际环境目录采集工具

```sh
python tools/build-profile-agent.py
python tests/test_profile_agent.py
```

输出 `artifacts/profile-agent/amidst-rwg-profile.jar`。需要采集时，维护者在指定 GTNH 实例现有 JVM 参数中追加（不要覆盖原有参数）：

```text
-javaagent:PATH_TO/amidst-rwg-profile.jar=PATH_TO_PRIVATE_PROFILE_DIRECTORY
```

启动 GTNH 后，创建 RWG 群系管理器时会自动采集；仅到主菜单可能尚未创建管理器。可通过原 Worker 的种子预览触发管理器创建，无需生成或写入存档。采集结束后移除本次追加的参数；当前没有自动修改用户的启动器配置，也没有启动游戏。

这个独立 agent 与之前的纯字节码观察工具不同：它在 RWG 构造器返回前插入一次读取回调。回调只读取选定初始化字段，写入独立目录，不调用区块生成、游戏网络或存档接口。读不到字段时报告失败，不猜测配置。它记录的是构造器返回时状态，不能证明后续模组修改或更晚注册的变换器没有改变行为。

采集文件记录气候组的原始顺序、重复条目、realistic ID、基础/河流群系 ID 与名称和类、噪声模式、观察到的管理器字节码哈希。相同目录按内容哈希去重；不记录种子、世界名称或认证 token。真实命名空间与色板仍需明确映射，不能从中文/英文显示名直接猜测。

采集器已在独立 JVM fixture 中验证构造器仍正常执行、重复权重/顺序保留、JSON 转义和哈希正确；尚未在 GTNH 中运行。`tools/rwg-profile.mjs` 在调用编译函数前检查目录、字节码版本、可选组开关和种子范围。

## 接下来的接入门槛

1. 在实际实例取得初始化目录和运行时字节码，核对噪声模式及完整环境来源。
2. 对照实际 Worker 查询结果，接入基础/河流群系映射、真实地形高度与地表替换逻辑；对未知 painter 继续提取或重放，不能凭名字猜规则。
3. 对最终群系逐像素校准，校准色板，并确认分块查询、连续切种子和跨维度取消保持一致。
4. 只有最终地表阶段通过的函数包才安装进 `dist/packs/`。当前的私有选择模块不注册为地图 Provider，不打进公共静态包。
