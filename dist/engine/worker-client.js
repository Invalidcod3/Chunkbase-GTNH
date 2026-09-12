import { biomeRegistry } from "./catalog.js";

// Keep a single module graph alive for the page's lifetime. World switches
// cancel requests rather than downloading a potentially newer implementation.
export class WorkerClient {
  constructor(
    createWorker = () =>
      new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
  ) {
    this.worker = createWorker();
    this.pending = new Map();
    this.epoch = 0;
    this.nextId = 0;
    this.worker.onmessage = ({ data }) => this.receive(data);
    this.worker.onerror = () => {
      this.failure = new Error("计算线程失败，请刷新页面重试");
      this.cancel(this.failure);
    };
  }
  cancel(error = new Error("CANCELLED")) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
  reset() {
    this.cancel();
    this.worker.postMessage({ action: "reset", epoch: ++this.epoch });
  }
  request(action, query) {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, action });
      try {
        this.worker.postMessage({ id, epoch: this.epoch, action, query });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  receive(data) {
    if (data.epoch !== this.epoch) return;
    const request = this.pending.get(data.id);
    if (!request) return;
    this.pending.delete(data.id);
    try {
      if (data.error) throw new Error(data.error);
      if (request.action === "sampleBiomes" && data.result !== null) {
        if (
          !(data.result instanceof Uint16Array) ||
          !Array.isArray(data.palette)
        )
          throw new Error("地图数据格式与页面不一致，请刷新页面");
        const indices = data.palette.map((key) => {
          const biome = biomeRegistry.get(key);
          if (!biome) throw new Error(`页面缺少生物群系 ${key}，请刷新页面`);
          return biome.index;
        });
        const result = Uint16Array.from(data.result, (index) => {
          if (indices[index] === undefined)
            throw new Error("地图包含未声明的生物群系索引");
          return indices[index];
        });
        request.resolve(result);
      } else request.resolve(data.result);
    } catch (error) {
      request.reject(error);
    }
  }
  close() {
    this.cancel();
    this.worker.terminate();
  }
}
