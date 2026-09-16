# 本地包类型与重建

## 选择包

公开发布使用新增的 `chunkbase-gtnh-source.zip` 与 `chunkbase-gtnh-cloudflare.zip`，见 [发布说明](release.md)。下列旧名称用于基础包和维护者本地采集流程，不要与完整发布包混淆。

- `artifacts/amidst-gtnh-web-static.zip`：基础静态包。仅包含源码库公开的内置生成器，不能代表完整 GTNH 实例。
- `private-packs/amidst-gtnh-rwg-local-preview.zip`：当前实例的本地校准包。包括 RWG、资源、暮色、刷怪笼、扩展维度、出生点等已通过校准的内容。当前环境为 GTNH 2.9.0-beta-3；不自动公开发布。
- `artifacts/amidst-gtnh-web-source.zip`：可修改源码、测试和构建工具；不含私有采集数据、游戏文件或本机编译依赖。

每个 ZIP 解压到独立目录。Windows 安装 Node.js 后双击 `Start.cmd`，它会启动只绑定本机的 HTTP 服务并打开浏览器；关闭启动窗口即停止服务。也可执行 `node start-local.mjs`，打开输出的地址。仍不支持双击 `index.html`，无需为 `file://` 改写生成器。

启动器优先使用固定端口 4177，已占用时使用系统分配的端口，也可通过 `PORT` 环境变量指定。浏览器偏好按来源保存；固定地址可以稳定保留偏好。现有开发预览仍是 4175。

“来源”面板显示包类型、环境说明和环境标识。完整包的 `build-info.json` 保留启用选项；各提供器的 `provenance.json` 和出生点的 `spawn-provenance.json` 保留校准依据。

## 在已有采集工作区重建

基础包：`node tools/build.mjs`。

完整本地包：

```text
python tools/build-rwg-preview.py --resources --surface --asteroids --twilight --dungeons --space
```

`--asteroids` 指末地矿物小行星；小行星带四类结构及出生点随 `--space` 接入。构建前检查各项校准报告及其源文件哈希，报告过期会停止，不会将未校准修改当成有效采集结果。

本次新增来源的复现顺序：

1. 保留已有已校准的 RWG/Space 编译器输出及相同实例，按 `docs/extra-dimensions.md`、`docs/architecture.md` 和相关采集文档准备前置输入。
2. `node tools/plan-navigation-calibration.mjs` 生成小行星结构和出生点的只读对照计划；`tools/collect-calibration.py` 指定实例、计划和输出文件，采集 `asteroid-structure-reference.json`、`spawn-reference.json`。
3. `python tools/build-spawn-capture.py` 构建只读群系属性采集辅助程序；通过已有 `AttachCapture` 对明确选定、正在运行的本地 Worker 执行一次采集，输出 `spawn-profile.json`。使用辅助 JAR 和 properties 的绝对路径。它只读取初始化群系的草地属性，不读取或生成存档区块。
4. 运行 `node tools/calibrate-extra.mjs`、`node tools/calibrate-spawn.mjs`。出生点依赖已审查 RWG 管理器的 `findBiomePosition` 返回空值；若类哈希改变，必须重新审查，不接受直接替换哈希。
5. 被修改源文件影响的旧报告也需重新执行对应校准，例如 `calibrate-resources.mjs`、`calibrate-dungeons.mjs`、`calibrate-surface-structures.mjs`。最后重建完整包并运行 `verify-extra-preview.mjs`、`verify-resource-preview.mjs`、`verify-rwg-preview.mjs`。

换整合包版本不等于修改页面上的版本文字：必须重新采集配置、审查字节码适配器并校准。当前没有自动兼容任意 GTNH 版本的保证，也没有从源码 ZIP 凭空还原私有包的流程。

## 同步原项目的名称与配色

仅有显示更新时，先指定实际原项目工作区运行：

```text
python tools/sync-desktop-display.py --source <原项目工作区绝对路径>
python tools/build-rwg-preview.py --resources --surface --asteroids --twilight --dungeons --space
node tools/verify-desktop-display.mjs
node tools/build.mjs
```

同步器固定原项目的汉化、Java 配色源文件及说明，并保存文件哈希。允许来源含未提交修改，但会明确记录该状态；不替换旧算法参考目录。完整包的 `display-revision.json` 记录显示版本，生成器环境身份和既有校准数据保持独立。已自定义的群系颜色不会被新的默认色强制覆盖。

若同时改变生成算法或实例配置，不能沿用该显示同步流程冒充重新校准。2026-09-15 核对的原项目 Worker 源码为协议 23，现有采集工具固定协议 21，升级 Worker 前需先完成协议适配；不影响现有静态包。见 [本轮审计](audit-desktop-sync-2026-09-15.md)。

## 恢复边界

模块入口或配置加载失败时，其他成功加载的包继续可用。重试只重新加载失败包，成功包、Worker 和已有瓦片保留。修改了模块依赖文件但浏览器仍保留失败的依赖图时，需要刷新页面；总目录损坏、Worker 自身崩溃也会提示刷新。不会为恢复单包而自动清空全部生成器缓存。
