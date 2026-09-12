import { nativeProvider } from "./native.js";
import { loadProviders, findProvider } from "./packs.js";
const installed = loadProviders();
installed.catch(() => {}); // Rejection is reported to each caller below.
self.onmessage = async ({ data }) => {
  const { id, action, query } = data;
  try {
    if (!["sampleBiomes", "predictStructures"].includes(action))
      throw new Error("未知计算请求");
    const provider =
      findProvider(await installed, query.dimension, action) || nativeProvider;
    if (typeof provider[action] !== "function")
      throw new Error("函数包未实现所声明的功能");
    const result = await provider[action](query);
    self.postMessage({ id, result }, result?.buffer ? [result.buffer] : []);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
