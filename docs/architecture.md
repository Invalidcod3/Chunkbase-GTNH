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

资源叠层沿用原 `ProspectingOverlay` 的矿脉图标尺寸、虚线、流体区块透明度、最高产量金框、标签缩放阈值与 X 优先的 8×8 产量数组顺序。实际资源函数包和目录尚未接入，因此暂未完成真实资源的外观验收；没有示例矿脉混入用户地图。

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
- `predictResources({seed, dimension, bounds, mode, config}, {signal})` → 资源数组，`mode` 为 `ORES` 或 `FLUID`；未安装实现返回 `null`，正常计算无结果返回 `[]`。模式切换与维度切换共用请求取消机制。

资源包的维度声明可附 `resourceModes: ["ORES", "FLUID"]`，只列实际配置的模式。已安装包但维度未配置某种资源时也返回 `null`，界面根据模式声明显示“该维度未配置”，不会误报为包尚未安装。当前私有包使用 `createProspectingProvider` 读取导出的 GT/VP 注册表，算法与校准流程见 [资源预测说明](resource-prediction.md)。查询最多覆盖 65,536 个矿脉区块或流体区域，并在计算中响应取消。

资源项共同字段为 `{kind,id,name,x,z,size,color,source}`，颜色为 `#rrggbb`，身份是维护者声明的资源标识。矿脉 `kind: ORE_VEIN`、`size:16`，坐标为区块中心，另含 `minY,maxY,materials` 和可选的 PNG base64 `icon`，`source` 必须为 `PREDICTED`。流体 `kind: FLUID_FIELD`、`size:128`，坐标为流体区左上角，`amounts` 是 64 个初始 L/Op 整数，索引 `dx*8+dz`，`source` 必须为 `INITIAL`。边缘流体区可以与 bounds 相交而原点在视野外。函数包结果不能夹带已记录、枯竭或当前余量状态。

界面按名称／材料筛选矿脉，按名称与最低初始产量筛选流体。流体导出展开成通过阈值、中心落在当前视野内的区块；CSV 与 JSON 保留初始 L/Op，JourneyMap 使用区块中心和用户指定高度。资源显示和导出不会访问存档。

`seed` 始终是十进制字符串。bounds 使用左闭右开整数范围，X/Z 单位为方块。命名空间目录在主线程与 Worker 分别注册，传输时不依赖两边索引顺序一致。每一 Worker 具有独立 Provider 状态，游戏端全局可变对象不应穿过此边界。

当前只支持覆盖内置维度；动态新增维度目录仍需实现。版本未知或目录冲突时必须报错，不退回伪造数据。

## 存档接口（首版不实现分析）

`save-contract.js` 定义 `open(files, {signal})`、`queryChunks`、`queryResources` 和 `close`。输入为玩家主动选择的本地 File，后续实现不需要服务器上传。

记录必须携带 `source: recorded`、`certainty: RECORDED` 和 `saveId`。预测不得生成已记录、已枯竭或当前流体状态。合并时按稳定位置键用存档记录覆盖预测，且必须来自当前选定环境/存档。取消时释放文件句柄与缓存。

## 导出

结构 CSV/JSON/JourneyMap 按当前视野和筛选重新查询，排序后应用上限。PNG 保存已加载的地图画布。群系 JSON 以命名空间 palette 加局部索引持久化，不把绘图索引误当 Minecraft ID。

JourneyMap ZIP 格式及 CRC 已验证，尚未在真实游戏中进行导入验收。文件中的高度由用户指定，不能解释为采样得到的地形高度。
