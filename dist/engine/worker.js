import { nativeProvider } from "./native.js";
import { biomeRegistry } from "./catalog.js";
import { loadProviders, findProvider } from "./packs.js";
const installed = loadProviders();
installed.catch(() => {});
let epoch = 0,
  running = false,
  queue = [],
  controller = new AbortController();
self.onmessage = ({ data }) => {
  if (data.action === "reset") {
    epoch = data.epoch;
    queue = [];
    controller.abort();
    controller = new AbortController();
    return;
  }
  if ((data.epoch ?? epoch) !== epoch) return;
  queue.push({
    ...data,
    epoch: data.epoch ?? epoch,
    signal: controller.signal,
  });
  void drain();
};
async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      if (job.epoch !== epoch) continue;
      const { id, action, query, signal } = job;
      try {
        if (!["sampleBiomes", "predictStructures"].includes(action))
          throw new Error("未知计算请求");
        const providers = await installed;
        if (signal.aborted) continue;
        const provider =
          findProvider(providers, query.dimension, action) || nativeProvider;
        if (typeof provider[action] !== "function")
          throw new Error("函数包未实现所声明的功能");
        const result = await provider[action](query, { signal });
        if (job.epoch !== epoch || signal.aborted) continue;
        const palette =
          action === "sampleBiomes" && result !== null
            ? biomeRegistry.indices.map((biome) => biome.key)
            : undefined;
        self.postMessage(
          { id, epoch: job.epoch, result, palette },
          result?.buffer ? [result.buffer] : [],
        );
      } catch (error) {
        if (job.epoch === epoch)
          self.postMessage({ id, epoch: job.epoch, error: error.message });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    running = false;
  }
}
