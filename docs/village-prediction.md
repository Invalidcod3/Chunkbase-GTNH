# 村庄预测同步（2026-10-10）

同步桌面项目「调查 Village Name 定位准确度」中的主世界修复。网页保留 JavaScript 预测器，
不复制桌面游戏线程、反射或已加载存档接口。月球候选公式不变。

## 当前发布配置

`dist/data/village-profile.json` 明确选择 Village Names 4.x 策略：

- 最大间距 50、最小间距 30 区块，随机范围 `nextInt(20)`。
- 原点排除半径 0 区块；保留 VN 的 Java int 乘法和加法溢出行为。
- 根据区块中心 `chunk * 16 + 8` 的最终地表群系**原始名称**精确匹配准入名单。
- 输出标记仍为起始区块 `chunk * 16 + 4`；它不是村庄建筑中心。

间距和 105 个允许名称来自官方配置快照
`83b3fb26cd9979e0256c7568bdf8c6f87579b532` 的
`config/VillageNames4/newvillages/village_gen.cfg`，启用 VN，Median=40、Range=10、Radius=0。
配置哈希随 profile 保存。群系 ID 与原始名称来自当前浏览器包采集的运行时注册表，
不使用可翻译的界面名称。配置名单的 `|类型|材料` 后缀按核对版本的解析规则去除。

生成后的 `packs/rwg/provider.js` 显式加载并传入该 profile，普通结构查询和原版刷怪笼
周边结构查询共用新规则。发布器拒绝仍使用旧入口的函数包；源码发布包保留本次入口。

## 兼容边界

`village-rules.js` 分离版本策略与参数，支持 `rwg` 和 `village-names-4`。
不带 profile 的既有 RWG 引擎接口保留 24/8 与地形准入，用于旧参考校准和明确的原版分支。
正式 VN 发布入口必须显式提供 profile。未知策略、非法间距和缺失群系名称会报错。
更换模组、最终生成器或配置时需要新的已核验 profile，不能把当前参数视为所有 GTNH 版本的默认值。

旧 `verify-rwg-villages.mjs` 和旧实时校准报告验证的是原版 RWG 分支，不能作为新 VN 规则的实测依据。
新证据在 `tests/fixtures/village-names-reference.json`，由
`tools/worldgen-compiler/VillageNamesOracle.java` 提取官方 VN 4.5.18 运行 JAR 的候选检查与
群系解析指令生成。参考 JAR SHA-256：
`7433fa393f513378bf359a8085a01044131b9f8eef20585c0c02041c1a235629`。

该工具需要 JDK 17+ 和 ASM 9 的 `asm`、`asm-tree`、`asm-commons`：

```text
javac -cp <ASM-classpath> -d <classes> tools/worldgen-compiler/VillageNamesOracle.java
java -cp <classes-and-ASM-classpath> VillageNamesOracle <VillageNames-runtime.jar> tests/fixtures/village-names-reference.json
node --test tests/village-names.test.mjs tests/rwg-provider.test.mjs
```

30 个受控用例覆盖 6 个种子（包括 long 极值）、正负坐标、24/8、50/30、73/21 间距、
80/50000 半径和远坐标 int 溢出，共枚举 2,813,718 个参考区块。
另有名称大小写、最终群系分支、种子缓存失效、禁用开关、窗口拆分、取消与未知配置测试。
这些验证仅证明候选选点规则一致；未执行完整游戏的建筑组装或存档实测。

使用须知已将村庄移入收到不一致反馈的类别，说明本次修复和候选精度边界。
