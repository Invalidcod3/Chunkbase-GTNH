import { biomeRegistry } from "./catalog.js";

// Keep this worker's module graph alive across requests. World switches
// cancel requests rather than downloading a potentially newer implementation.
export class WorkerClient {
  constructor(
    createWorker = () =>
      new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
    {startupTimeoutMs=0,waitForReady=false}={},
  ) {
    this.worker = createWorker();
    this.pending = new Map();
    this.epoch = 0;
    this.nextId = 0;
    this.computeRevision=0;
    this.isReady=!waitForReady&&startupTimeoutMs===0;
    if(startupTimeoutMs>0)this.startupTimer=setTimeout(()=>this.fail(new Error('WORKER_STARTUP_TIMEOUT')),startupTimeoutMs);
    this.worker.onmessage = ({ data }) => this.receive(data);
    this.worker.onerror = () => this.fail(new Error('计算线程失败，请刷新页面重试'));
  }
  fail(error) {
    if(this.failure||this.closed)return;
    clearTimeout(this.startupTimer);this.failure=error;this.cancel(error);
    this.onFailure?.(error);this.onGpuComputeStatus?.('failed');
  }
  cancel(error = new Error("CANCELLED")) {
    for (const request of this.pending.values()) {request.cleanup?.();request.reject(error);}
    this.pending.clear();
  }
  reset() {
    this.cancel();
    this.worker.postMessage({ action: "reset", epoch: ++this.epoch });
  }
  setGpuCompute(value) {
    const level=value===true?3:[3,4].includes(value)?value:0;
    this.worker.postMessage({action:'gpuCompute',enabled:level>=3,level,revision:++this.computeRevision});
  }
  request(action, query, {signal,priority=2} = {}) {
    if(this.closed)return Promise.reject(new Error('CANCELLED'));
    if (this.failure) return Promise.reject(this.failure);
    if (signal?.aborted) return Promise.reject(new Error('CANCELLED'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const abort=()=>{
        if(!this.pending.delete(id))return;
        cleanup();reject(new Error('CANCELLED'));
        this.worker.postMessage({action:'cancel',id,epoch:this.epoch});
      };
      const cleanup=()=>signal?.removeEventListener('abort',abort);
      this.pending.set(id, { resolve, reject, action, cleanup });
      signal?.addEventListener('abort',abort,{once:true});
      try {
        this.worker.postMessage({ id, epoch: this.epoch, action, query, priority });
      } catch (error) {
        cleanup();
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  receive(data) {
    if(this.closed||this.failure)return;
    if(data.type==='ready') {
      if(!this.isReady){clearTimeout(this.startupTimer);this.isReady=true;this.onReady?.();}
      return;
    }
    if(data.type==='gpuCompute') {
      if(data.revision===this.computeRevision)this.onGpuComputeStatus?.(data.state);
      return;
    }
    if (data.epoch !== this.epoch) return;
    const request = this.pending.get(data.id);
    if (!request) return;
    request.cleanup?.();
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
    this.closed=true;clearTimeout(this.startupTimer);
    this.cancel();
    this.worker.terminate();
  }
}
