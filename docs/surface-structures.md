# Roguelike 与神秘时代结构接入

本地静态包新增 Roguelike 地牢、Thaumcraft 灵气节点和邪术祭坛。入口图标沿用参考 Amidst，包括 Roguelike 的沙漠、森林、冰原、丛林、恶地、山地、平原和沼泽入口。

节点和祭坛默认不勾选。勾选后执行地形扫描；关闭两者时不扫描这部分地形。单独隐藏其中一种不会改变另一种的随机数顺序。勾选或关闭图层、切换种子和维度都会取消过期查询。

## 与实例一致的部分

使用已经通过校准的 RWG 最终群系采样，结合实例中的初始化配置：

- Roguelike 区域间距、50 次尝试、拒绝群系、内置与自定义设置的原顺序、权重、维度规则和最终入口类型。内置抽签仍在自定义覆盖之前消耗随机数。
- 神秘时代生成开关、维度与群系黑名单、银树判定、宏伟之木概率、沙漠花朵随机数消耗、散布结构节点和野生节点、邪术祭坛候选。
- 沿用原 Worker 的限制：树木等造成随机数不确定的区块不继续预测；启用会改变随机数的神秘时代矿石生成时停止节点／祭坛预测。Roguelike 最终入口的方块检查没有重放，因此仍是候选位置。

当前 5 个种子、正负坐标和 long 极值的 20 组 Worker 查询中，9 个 Roguelike 地牢、717 个灵气节点和 353 个祭坛的位置、类型与可信度完全一致。更大范围与实际生成后的世界仍需要额外检验。

368 项 Node 测试和 13 项 Python 工具测试通过。已在本地浏览器检查村庄图标、节点／祭坛开关及扫描结果，并确认切换回末地后底图正常。

## 更新本地包

`capture-resources.py` 在现有 Worker tick 队列中读取固定的模组配置，额外生成被忽略的 `private-packs/runtime-session/surface-structure-profile.json`。不生成区块，不读取存档。导出器不会调用 Roguelike `SpawnCriteria.isValid`，因为当前版本的方法会修改自身名单；只读取判定需要的字段。

```sh
python tools/capture-resources.py --instance "实例目录" --pid 进程ID
node tools/plan-surface-calibration.mjs
python tools/collect-calibration.py --instance "实例目录" --plan private-packs/runtime-session/surface-plan.json --output private-packs/runtime-session/surface-reference.json
node tools/calibrate-surface-structures.mjs
node tools/calibrate-resources.mjs
python tools/build-rwg-preview.py --resources --surface
node tools/serve.mjs --rwg-preview
```

前提是已经具备通过原有校准的 RWG、村庄、模组结构和资源产物。地表结构报告绑定代码、原始样本、设置和 RWG 函数哈希；旧报告不能用于新配置。未指定 `--surface` 的包不会安装这套初始化设置。

## 图标修复

候选状态原来被网页绘成额外灰色虚线框，已删除；状态仍在详情和导出里。村庄 PNG 实际为 20×26，原代码将所有图标拉伸为 16×16；现在与 Amidst 一样以图片原始宽高居中绘制，资源图标也保持宽高比。素材自身的像素描边以及选中时的提示仍保留。

原版刷怪笼及暮色特征已另行接入，见 [twilight-and-dungeons.md](twilight-and-dungeons.md)；末地矿物小行星见 [asteroids.md](asteroids.md)。默认静态／源码包不含实际运行时设置，本地完整预览仍在 `private-packs/`。
