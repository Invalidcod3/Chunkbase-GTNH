# 接口与一致性边界

## 数据流

`默认 UI → MapView → Web Worker → 当前维度 Provider → 生物群系 / 结构结果`

UI 不依赖 GTNH Java 类；Provider 不依赖 DOM。更换 Illustrator 设计主要修改 `index.html`、`style.css` 和外围绑定，不替换地图计算。MapView 使用分块缓存，种子/维度变更后保留同一个 Worker，取消旧请求并清空排队任务，结果带请求代次，避免旧维度结果覆盖新地图，也减少开发期间新旧模块混用。

底图结果携带命名空间 palette，主线程按名称重映射本地索引；缺失名称或非法索引显式报错。失败瓦片不缓存为空白，最多尝试三次，切换世界后清空失败记录。Provider 的第二参数为 `{signal}`，异步计算应响应取消；同步函数只能在返回或主动让出执行权后处理取消，队列在任务间让出执行权。

## 地图

- 默认每方块 0.25 屏幕像素，8 级缩放相差两倍；缩放中心固定在鼠标位置。
- 相机按时间平滑，支持拖动惯性和触屏双指；旧 Amidst 拖动的精确弹性尚未逐帧复刻。
- 地图最近邻采样；平滑图像可单独启用。图标固定屏幕尺寸、不使用经纬度投影。
- 使用原末地色板与原图标。候选位置虚线，选中位置高亮。
- 比例尺使用 1/2/5 × 10^n 方块；负坐标以 floor 计算区块。
- 生物群系底图与结构各自请求，绘制已有缓存。界面显式显示未接入的地图，保留可用结构。
- 浏览器快捷键冲突需要适配；当前有地图焦点下的方向键、加减号和 Home。

未实现的矿脉/流体叠层不能被宣称完成外观一致性。后续仍需对照原图的透明度、标签阈值、候选/已记录样式和筛选语义。

## 生物群系

稳定标识是 `namespace:path`，由 `BiomeRegistry` 维护。显示名与标识分离。`Uint16` 仅作为内存绘图索引；跨会话、配置、导出和存档边界必须携带命名空间 key 或显式 palette。

每条旧 ID 映射包含 `environment`、`dimension`、`id`。相同数字可在不同维度映射到不同 key；相同范围内冲突直接报错。环境应以版本清单/配置哈希区别，不能对所有 GTNH 版本使用一个无版本映射。

`amidst:*` 表示工具合成的预览群系，不声称上游具有对应现代注册名。`galacticraftcore:moon` 等是显式声明的 Web 标识；旧版本只有实例/字段名时，导出 profile 记录那个来源。内置原 Worker 适配器保留 display-ID 到 namespace 的转换，不将原 ID 暴露为 Web 主键。

## 浏览器函数包 API v1

维护者在 `dist/packs/registry.json` 安装已经编译的包。示例结构：

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "rwg-specific-environment",
      "apiVersion": 1,
      "browserExecutable": true,
      "entry": "./rwg/provider.js",
      "dimensions": [
        { "key": "overworld", "capabilities": ["biomes", "structures"] }
      ],
      "biomes": []
    }
  ]
}
```

这里是接口示例，不是已提供 RWG 可执行包。包的来源、版本、许可和输入环境哈希应随附在包内。

入口导出 `provider`，包含 `apiVersion: 1` 和所声明的方法：

- `sampleBiomes({seed, dimension, x, z, width, height, step, config})` → `Uint16Array`。行优先，整数索引来自共享 `biomeRegistry`。包目录必须先注册群系；不要硬编码其他包的索引。
- `predictStructures({seed, dimension, bounds, config})` → `[{kind, subtype, x, z, certainty, source}]`。
- `predictResources` 为后续接口名称；当前 UI 尚未调用，不能把声明等同于已显示资源。

`seed` 始终是十进制字符串。bounds 使用左闭右开整数范围，X/Z 单位为方块。命名空间目录在主线程与 Worker 分别注册，传输时不依赖两边索引顺序一致。每一 Worker 具有独立 Provider 状态，游戏端全局可变对象不应穿过此边界。

当前只支持覆盖内置维度；新增维度目录和资源 UI 仍需实现。版本未知或目录冲突时必须报错，不退回伪造数据。

## 存档接口（首版不实现分析）

`save-contract.js` 定义 `open(files, {signal})`、`queryChunks`、`queryResources` 和 `close`。输入为玩家主动选择的本地 File，后续实现不需要服务器上传。

记录必须携带 `source: recorded`、`certainty: RECORDED` 和 `saveId`。预测不得生成已记录、已枯竭或当前流体状态。合并时按稳定位置键用存档记录覆盖预测，且必须来自当前选定环境/存档。取消时释放文件句柄与缓存。

## 导出

结构 CSV/JSON/JourneyMap 按当前视野和筛选重新查询，排序后应用上限。PNG 保存已加载的地图画布。群系 JSON 以命名空间 palette 加局部索引持久化，不把绘图索引误当 Minecraft ID。

JourneyMap ZIP 格式及 CRC 已验证，尚未在真实游戏中进行导入验收。文件中的高度由用户指定，不能解释为采样得到的地形高度。
