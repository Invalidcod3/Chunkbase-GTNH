# 源码与网页发布

当前版本：0.1.0。源码仓库：<https://github.com/Invalidcod3/Chunkbase-GTNH>。

## 生成与检查

1. `npm run check` 与 `npm test`。
2. 在维护者工作区执行 `node tools/build-release.mjs --runtime-dir private-packs/rwg-local-preview`；解压完整源码发布包后执行 `npm run build:release`。
3. `npm run verify:release` 检查 ZIP 校验和、CRC、归档路径、敏感文件、已知凭据格式以及 Cloudflare 文件数量/大小限制。
4. 将源码 ZIP 解压到独立目录，运行检查、测试和 `npm run build:release`。重建后的网页 ZIP 应与原网页 ZIP 的 SHA-256 一致。

构建不会改写或删除采集工作区。它使用当前 `dist/`，附加指定浏览器包的 `packs/`、环境配置、构建标识与校准来源；不会复制旧 UI、诊断页面、游戏 JAR 或原始采集目录。新 staging 目录及两个 ZIP 的路径记录在 `artifacts/release-report.json`。

## GitHub

仓库保留 `dist/`、`tests/`、`tools/`、`docs/`、README、LICENSE 和包元数据。不要提交 `.openai/`、`.github/`、`deploy/`、`artifacts/`、`private-packs/`、运行凭据或游戏实例。前三个目录也不收录进源码 ZIP；本地副本可保留。Cloudflare 响应头和 404 页面由 `tools/release-assets.mjs` 在打包时生成，构建不依赖本地部署目录。GitHub Actions 工作流不再随仓库发布。

以 `v0.1.0` 创建版本发布，附上：

- `chunkbase-gtnh-source.zip`：完整可重建源码，含本次部署的浏览器函数包。
- `chunkbase-gtnh-cloudflare.zip`：完整静态部署包。
- `RELEASE-SHA256SUMS.txt`：校验和。

GitHub 自动生成的 Source code ZIP 只包含 Git 已跟踪文件；它不等同于另附的完整源码 ZIP。完整包的 `runtime/` 已保留生成后代码与校准来源；Java 原始游戏文件不随包提供。重新采集而非重复打包需要本机游戏环境及相关工具，见 [本地重建](local-delivery.md)。

## Cloudflare Pages

新项目建议名为 `chunkbase-gtnh`。这是纯静态网站，不需要数据库、Pages Functions、应用密钥或服务器端环境变量。

### 控制台上传

在 Workers & Pages 中创建 Pages 的直接上传项目，选择 `chunkbase-gtnh-cloudflare.zip` 并部署。上传的 ZIP 根目录直接含 `index.html`，不要再套一层源码目录。

### 命令行

通过官方 Wrangler 登录后，使用构建报告中的 `deploymentDirectory`：

```sh
npx wrangler pages project create chunkbase-gtnh --production-branch main
npx wrangler pages deploy <deploymentDirectory> --project-name chunkbase-gtnh --branch main
```

Wrangler 上传目录，控制台可以上传 ZIP。直接上传项目以后不能直接切换为 Git 集成项目；需要自动部署时另行配置合适的项目。详见 [Cloudflare 官方直接上传文档](https://developers.cloudflare.com/pages/get-started/direct-upload/)。

`_headers` 让未带内容哈希的模块与环境目录在更新后重新验证缓存，并设置正确的内容类型保护。独立 `404.html` 避免不存在的模块路径被当作地图首页返回。

部署后检查首页、主世界/暮色/太空维度、矿物/流体筛选、设置与信息面板，并核对完整包环境标识。网站域名改变后，旧本地预览的浏览器偏好不会自动迁移。
