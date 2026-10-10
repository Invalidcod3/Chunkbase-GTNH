# Chunkbase GTNH

面向 GregTech: New Horizons 的浏览器种子地图。提供生物群系、结构、矿脉与流体筛选；地图计算在浏览器内完成，无需应用后端。

- [文档索引](docs/index.md)

## 功能

- 完整校准包包含 GTNH 2.9.0-beta-3 环境的 42 个维度底图与 41 个资源维度。
- 兴趣点、矿脉、流体、生物群系筛选，Roguelike 地牢按八种类型独立筛选。
- Amidst 风格图标、坐标网格与点位信息；双击 X/Z 编辑坐标并跳转。
- GPU 加速、计算线程数与算力分配设置；中文和英文界面。
- 深色界面、可折叠筛选面板、浏览器本地偏好保存；窄屏仅作基础适配。

预测基于所附环境的生成规则，不能保证与不同模组版本、配置、已生成区块或存档修改一致。部分结构显示候选位置。导出与存档导入的底层代码保留，当前界面暂不提供入口。

## 本地开发

需要 Node.js 22 或以上版本，无第三方 npm 运行依赖。

```sh
npm run dev
npm run check
npm test
```

开发服务器默认地址为 `http://127.0.0.1:4173/`，默认使用 `dist/` 中的基础引擎。请通过 HTTP 打开，不支持直接双击 HTML。

## 构建发布包

```sh
# 基础静态包与源码包
npm run build

# 完整发布源码 ZIP 已附 runtime/，可直接重建同一环境的部署包
npm run build:release
npm run verify:release
```

在维护者采集工作区第一次生成完整包时：

```sh
node tools/build-release.mjs --runtime-dir private-packs/rwg-local-preview
```

完整发布产物位于 `artifacts/`：

| 文件 | 用途 |
| --- | --- |
| `chunkbase-gtnh-source.zip` | 网页源码、测试、工具、文档以及本次发布所需的浏览器函数包 |
| `chunkbase-gtnh-cloudflare.zip` | 可直接上传 Cloudflare Pages 的完整静态网站，根目录为 `index.html` |
| `RELEASE-SHA256SUMS.txt` | 两个 ZIP 的 SHA-256 校验值 |
| `release-report.json` | 构建目录、文件数量及环境标识 |

源码仓库的 `dist/` 是基础引擎；完整发布源码 ZIP 另附 `runtime/`，以便不安装 Minecraft 也能重建该版本。`runtime/` 默认不纳入 Git，它作为版本发布附件提供。仅克隆仓库时，从同版本源码附件取得 `runtime/` 后再构建完整包。改变游戏环境需要重新采集与校准，见 [环境重建](docs/local-delivery.md)。

## 目录

| 目录 | 内容 |
| --- | --- |
| `dist/` | 手工维护的网页源码、引擎和界面素材，不是可删除的构建缓存 |
| `tests/` | 可独立运行的 Node.js 回归测试与固定参考数据 |
| `tools/` | 构建、验证、采集和素材导入工具；采集工具的外部依赖见对应文档 |
| `tools/release-assets.mjs` | 打包时生成 Cloudflare 响应头和 404 页面 |
| `docs/` | 架构、功能、验证与历史开发记录 |
| `runtime/` | 完整源码发布附件中附带的已编译浏览器函数及必要环境数据 |

游戏 JAR、存档、原始采集会话、连接凭据、编译缓存和本机诊断文件不进入发布包。

## 制作与许可

网页作者：**InvalidCode**。基于 [Amidst-GTNH](https://github.com/Invalidcod3/Amidst-GTNH) 与 Amidst 的工作；Amidst 原作者为 Skidoodle（skiphs），并包含其他贡献者的工作。感谢 GTNH、各模组作者及维护团队，矿物译名参考 Kiwi 的 [Translation-of-GTNH](https://github.com/Kiwi233/Translation-of-GTNH)。

网页代码遵循 [GPL-3.0](LICENSE)。第三方代码、素材与译文保留各自来源及许可，详见 [来源说明](dist/NOTICE.md)。
