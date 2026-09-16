# 剩余维度与专属结构（2026-09-15）

完整本地包目前有 42 个维度入口、42 个群系底图、41 个资源维度。Deep Dark 没有当前 GT 资源配置，所以不是 42 个资源维度。原先仅支持资源查询的 24 个维度现已根据整合包实际注册数据接入固定群系。

中央提示卡片保持移除。固定维度左上角显示注册群系名与色块，坐标栏同时显示“维度 · 群系”，切换后立即更新；不再使用统一灰蓝色占位。地图取样、群系 JSON 和 PNG 均使用同一套实际群系映射。

## 固定群系关联补充

从初始化后的星体注册表取得真实维度 ID、提供器及群系管理器；仅创建无 World 的对象，读取其 `getBiome()`，再用最终方块层矩形取样核验。Everglades 单独核对 `GenLayerBiomes.allowedBiomes` 仅含一种群系，并检查真实最终生成层。24 个维度的 1,536 个实机像素全部匹配；另外核验种子极值、负坐标和不同步长保持一致。

| 注册群系 | 关联维度 | 默认配色 |
| --- | --- | --- |
| Space | 水星、木卫二、火卫一、火卫二、木卫三、木卫四、天卫四、海卫一、天卫五、妊神星、鸟神星、Barnarda E/F、Vega B、Tau Ceti E、Centauri Bb | #788088 |
| space | Neper、Maahes、Seth | #8fa664 |
| Venus | 金星 | #737b83 |
| Titan | 土卫六 | #727a82 |
| Kuiper Belt | 柯伊伯带 | #707880 |
| moon | Ross 128ba | #8c8c84 |
| Toxic Everglades | 废土世界 | #4c7f51 |

名称保留实际注册值（包括 Space/space 大小写），配色由原 Amidst 默认配色函数结合群系元数据与维度显示标签生成。1.7.10 注册表使用数字 ID，这里的稳定名称空间为工具别名，不冒充模组官方注册键。多个星球共用同一个群系时不编造不同群系名；维度名称独立显示。

新增 `uniform-provider.js` 为独立的数据提供器，不改写原 RWG、暮色、刷怪笼或资源缓存。当前共有 428 项 Node 测试；已安装包核对了 42 个底图、41 个资源维度及原结构路由。

重采集使用 `tools/build-uniform-capture.py` 及既有只读附加入口，结果保存到 `private-packs/uniform-input/`。随后运行 `python tools/prepare-uniform-profile.py`、`node tools/calibrate-uniform.mjs`；完整本地包的 `--space` 构建自动包含固定群系包，构建前检查报告哈希。

## 本轮补齐

| 内容 | 接入范围 |
| --- | --- |
| 动态维度目录 | 从功能包的稳定键、真实维度 ID、中英文名称和能力声明建立入口；旧环境配置会补全新目录的默认 ID |
| 资源入口 | 原来 11 个增加到全部 41 个，包含 63 个实际配置的矿脉/流体图层 |
| 多群系底图 | 下界 BOP、Io、Pluto、Barnarda C、Ross 128b、Deep Dark |
| 单群系底图 | 小行星带、Mehen、Anubis、Horus；与原 Worker 的单群系显示语义一致 |
| 专属结构 | Mehen 暗物质小行星、Ross 128b 遗迹候选、Deep Dark 地牢、Anubis 机器人村庄、Horus 黑曜石金字塔 |
| 标记和导出 | 沿用原项目图标；独立图层筛选、详情和现有 CSV/JSON/JourneyMap 导出可用 |

维度 ID 从当前实例获得，不把旧桌面的默认 ID 当作实际 ID。例如 Mehen 是 95、Makemake 是 25，Deep Dark 是 100、Everglades 是 227。资源包与额外底图包分别核对同一稳定键的 ID，错误时拒绝构建或查询。

Ross 的毒砂等矿脉由通用资源层提供，不重复伪装成建筑结构。Barnarda C 的原预测器没有指定可定位 POI，本轮也没有编造结构。

## 生成链与隔离

`extra-provider.js` 和独立编译包承载新增底图及结构，`space-structures.js` 承载三个区域结构算法。原 RWG、暮色、矿脉/流体、刷怪笼缓存，以及 Worker 调度与地图粗细加载均未改写。Io、Pluto、下界只增加底图提供器，其原有地牢/要塞继续走原结构路径。

采集器在现有 Worker 队列上创建不含存档的生成对象，读取实际 GenLayer 图、参数、群系规则和噪声类。字节码观察器返回 null，不修改游戏类或存档。编译时保留生成方法，使用已捕获字段重建图，恢复 Java Random 和二进制 32 位浮点运算；输入类哈希固定在 `tools/space-compiler/accepted-inputs.json`。类字节码改变后须先复核，不能自动发布。

BOP 的覆写群系不能仅凭数字 ID 或类名推断等价关系。当前环境的海洋列表含旧对象，而 ID 0 已被替换；按 ID 重建会错误改变河岸、群系边缘和陆地。适配器读取真正生效的对象成员关系与群系等价结果，并用逐层样本和最终像素校准。

新维度的每个缩放级别都从最终方块层取样，不把四分之一生成层当最终底图。按有界矩形批量采样后抽取像素，支持取消；Ross 遗迹按一行多个区块批量取得群系，避免逐点启动整条生成链。超出支持范围会明确报错，不返回假空结果。

这是新世界的种子预览，不读取已保存区块或玩家修改；Ross 遗迹仍是受地形影响的候选，结果没有提升为“必定生成”。

## 校准与验收

- 新底图：十个维度、五个种子（含 long 极值和大于 2^53 的数值），不同步长、负坐标和接近世界边界，150 组查询的 **115,200 个像素一致**。
- 新结构：75 组实机查询及每组的非对齐拆分，**6,998 个位置一致**：63 个 Deep Dark 地牢、59 个机器人村庄、58 个黑曜石金字塔、24 个暗物质小行星、6,794 个遗迹候选。
- 最初扩展的已安装包验收：42 个目录条目、41 个资源维度、18 个底图维度；本节固定群系补充后底图维度为 42 个。63 个资源图层及空配置语义、五类结构、旧结构路由和维度 ID 隔离均保持。
- 426 项 Node 测试、13 项 Python 工具测试通过。此记录不等于所有设备、所有模组版本或真实游戏导入均完成验收。

## 构建与后续

已有校准输入时：

最新 Worker `hello` 响应保存在 `private-packs/runtime-session/space-hello.json`；`tools/plan-space-calibration.mjs` 按其真实维度 ID 生成三组采样计划，再用现有 `collect-calibration.py` 收集对应 reference 文件。

```sh
node tools/prepare-space-profile.mjs
node tools/calibrate-space.mjs
node tools/calibrate-extra.mjs
python tools/build-rwg-preview.py --resources --surface --asteroids --twilight --dungeons --space
node tools/verify-extra-preview.mjs
node tools/verify-resource-preview.mjs
```

生成输入与实机样本保存在忽略的 `private-packs/`，默认分发 ZIP 不包含模组字节码。需要更新生成输入时，使用独立 `tools/build-space-capture.py` 构建采集器，再按明确的游戏 PID 和绝对路径运行；生成包由 `tools/compile-space.py` 重建。不要复用旧报告掩盖新的输入或代码变化。

此前审计中的“30 个资源入口、五类 POI、上述复杂底图”已不再是缺失项。后续仍有世界出生点、资源类型/Y 范围筛选、导出取消、失败瓦片重试、环境版本适配与交互验收；它们是独立功能，不属于本轮维度和结构移植的完成声明。
