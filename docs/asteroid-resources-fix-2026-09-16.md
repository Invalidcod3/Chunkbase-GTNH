# 小行星资源补齐（2026-09-16）

## 已实现

- 末地、小行星带、Mehen、柯伊伯带接入新版原项目的通用小行星选择器，不再把虚空中的资源套用普通矿脉网格。
- 按实际石材分别读取混合矿和小型矿的有序权重，保留独立随机流、64 位种子、负坐标、概率的包含边界及半径的包含上限。
- 输出 `ASTEROID_VEIN` / `ASTEROID_SMALL`、各自资源 ID、真实 X/Y/Z 中心、直径和保守高度范围。
- 末地按全新世界的主岛、HEE 岛屿及混沌岛范围分流。岛屿内继续普通矿脉，虚空内使用小行星。资源与原有三种末地小行星结构标记共用选择器，中心高度和大小一致。
- 原有详情、筛选、坐标复制、JSON、CSV 和 JourneyMap 接通新字段。JourneyMap 使用小行星中心高度，并区分维度、种子及资源身份。
- 缺少新小行星配置时明确报错，避免悄悄退回错误的普通矿脉网格。
- 保留现有布局；本次只增加必要字段和说明，没有启动两套 UI 模板的设计。

## 真实配置和验证

从用户已启动的 GTNH 2.9.0-beta-3 实例读取初始化注册表，在游戏线程内运行独立加载的 Java 参考选择器。未生成方块、修改存档或替换 Worker 类。

Java 参考来自原项目 `0800217de08a041f0a694ac258292151ab84ccda`。采集收据记录参考源码和游戏 jar 的 SHA-256。

- 18,432 个独立 Java 样本：零差异，1,310 个非空小行星结果；覆盖四维度、六个种子（含 long 极值）、正负及远距离坐标。
- 当前实例所有小行星石材的小型矿列表为空，因此不会凭空显示小型矿。小型矿分支使用原项目的十组专门样例测试。
- 普通资源回归：236 个查询、16,567 个矿脉、1,804 个流体区域（115,456 个区块产量），零差异。旧 Worker 的 16 个小行星普通网格样例已由新 Java 校准替代。
- 原末地选择和避让校准、其他维度的底图和结构校准继续通过。
- 536 项自动化测试通过；最终安装包另外通过资源菜单、实际 Worker、末地结构与资源坐标一致性检查。

当前游戏的矿物名称接口与新版原项目不同，采集器兼容 `getLocalizedName` 和 `getDefaultLocalName`，不影响矿物选择及坐标。

## 精度边界

末地显示 `EXACT_FRESH_END`（全新末地位置），未读取实际存档的 HEE 岛屿或末影龙重生状态。最新版桌面项目要求加载匹配的末地，能够利用实际世界状态；网页本轮实现的是明确标注的种子预览，不能声称与已变化的末地存档完全一致。

本轮验证的是原项目预测算法和真实初始化配置，不等同于逐个生成并检查实际矿石方块。高度范围是生成器的保守包围范围，不是逐方块实测范围。

## 复现

1. 游戏进入世界后运行 `tools/capture-asteroid-resources.py --instance <实例> --pid <Java进程>`。
2. 运行 `node tools/calibrate-asteroid-resources.mjs`、`node tools/calibrate-resources.mjs`、`node tools/calibrate-asteroids.mjs`、`node tools/calibrate-extra.mjs`。
3. 运行 `python tools/build-rwg-preview.py --resources --surface --asteroids --twilight --dungeons --space`。
4. 运行 `node tools/verify-asteroid-preview.mjs`、`node tools/verify-resource-preview.mjs`、`node tools/verify-extra-preview.mjs` 和 `npm test`。

完整本地包：`private-packs/amidst-gtnh-rwg-local-preview.zip`。基础静态包不含私有实例配置。
