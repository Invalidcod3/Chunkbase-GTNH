import { nativeProvider } from "./native.js";
import { biomeRegistry } from "./catalog.js";
import { loadProviders, findProvider, retryProviders } from "./packs.js";
import { validateResources } from "./resources.js";
import { gpuCompute } from './gpu-compute.js';
let computeRevision=0;
gpuCompute.onStatus=state=>self.postMessage({type:'gpuCompute',revision:computeRevision,state});
let installed = loadProviders();
// Startup readiness is distinct from GPU checks and from individual queries.
// Pack errors remain query errors; a responsive Worker can still retry packs.
installed.then(()=>self.postMessage({type:'ready'}),()=>self.postMessage({type:'ready'}));
let epoch = 0,
  running = false,
  queue = [],
  activeJob = null;
self.onmessage = ({ data }) => {
  if(data.action==='gpuCompute') {
    computeRevision=data.revision;gpuCompute.setLevel(data.level??(data.enabled===true?3:0));return;
  }
  if (data.action === "reset") {
    epoch = data.epoch;
    for(const job of queue)job.controller.abort();
    queue = [];
    activeJob?.controller.abort();
    return;
  }
  if ((data.epoch ?? epoch) !== epoch) return;
  if(data.action==='cancel') {
    queue=queue.filter(job=>{if(job.id!==data.id)return true;job.controller.abort();return false;});
    if(activeJob?.id===data.id)activeJob.controller.abort();
    return;
  }
  const controller=new AbortController();
  queue.push({
    ...data,
    epoch: data.epoch ?? epoch,
    signal: controller.signal,
    controller,
    priority:[0,1,2].includes(data.priority)?data.priority:2,
  });
  queue.sort((a,b)=>a.priority-b.priority);
  void drain();
};
async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      if (job.epoch !== epoch) continue;
      activeJob=job;
      const { id, action, query, signal } = job;
      try {
        if(action==='retryPacks'){
          let providers=await installed;
          if(providers.registryError){installed=loadProviders();providers=await installed;}
          const errors=providers.registryError?[{id:'registry',error:providers.registryError.message}]:await retryProviders(providers);
          self.postMessage({id,epoch:job.epoch,result:errors});continue;
        }
        if (!["sampleBiomes", "predictStructures", "predictResources", "predictSpawn"].includes(action))
          throw new Error("未知计算请求");
        const providers = await installed;
        if (signal.aborted) continue;
        const provider =
          findProvider(providers, query.dimension, action) || nativeProvider;
        if (typeof provider[action] !== "function")
          throw new Error("函数包未实现所声明的功能");
        let result;
        if(provider===nativeProvider&&action==='sampleBiomes'&&query.dimension==='end')
          result=await gpuCompute.sampleEnd(query,{signal})??await provider[action](query,{signal});
        else if(provider===nativeProvider&&action==='predictStructures')result=await gpuCompute.structures(query,{signal});
        else result=await provider[action](query,{signal});
        if(action === "predictResources") result=validateResources(result,query.mode);
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
      } finally {
        activeJob=null;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    running = false;
  }
}
