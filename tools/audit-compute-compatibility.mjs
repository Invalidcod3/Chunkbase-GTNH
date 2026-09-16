// Read-only production-code probes. GPU probe uses an intentionally delayed
// adapter promise, not a GPU emulator or a hardware performance measurement.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {ComputePool} from '../dist/engine/compute-pool.js';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {GpuCompute} from '../dist/engine/gpu-compute.js';
import {endPlan} from '../dist/engine/gpu-compute-plans.js';
import {registerPackBiomes} from '../dist/engine/packs.js';
const root=new URL('../private-packs/rwg-local-preview/',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const config=await json('environment.json');
for(const p of (await json('packs/registry.json')).packs)registerPackBiomes(p);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fixed=process.argv.includes('--fixed');
const report={runtime:process.version,fixed,scope:'Node worker transport, actual preview CPU engines; no browser/GPU hardware test',batches:[]};
const queries=Array.from({length:8},(_,i)=>({dimension:'twilight',seed:'-17',x:-512+i*256,z:216-i*128,width:64,height:64,step:4,config}));
let baseline;
for(const trial of [1,2,3])for(const requested of [1,4,8]) {
  const workers=[],statuses=[];
  const pool=new ComputePool(({primary})=>{
    const thread=new Worker(new URL('../tests/helpers/compute-worker.mjs',import.meta.url),{workerData:{entry:new URL('engine/worker.js',root).href}});
    workers.push(thread);
    const adapter={postMessage:m=>thread.postMessage(m),terminate:()=>thread.terminate()};
    const client=new WorkerClient(()=>adapter,{startupTimeoutMs:fixed&&primary?0:15000,waitForReady:true});
    thread.on('message',data=>adapter.onmessage({data}));thread.on('error',()=>adapter.onerror());
    return client;
  },{getHints:()=>({hardwareConcurrency:65,deviceMemory:8})});
  pool.onParallelismStatus=s=>statuses.push(s);pool.setParallelism(requested);
  try {
    for(const phase of ['cold','repeat']) {
      const start=performance.now();
      const values=await Promise.all(queries.map(q=>pool.request('sampleBiomes',q,{priority:0})));
      const elapsedMs=Math.round(performance.now()-start);
      if(!baseline)baseline=values;else assert.deepEqual(values,baseline);
      report.batches.push({trial,requested,phase,elapsedMs,created:workers.length,ready:statuses.at(-1)?.ready,queries:8,pixels:32768,mismatches:0});
    }
  }finally{pool.close();await Promise.all(workers.map(w=>w.terminate()));}
}
// Cancellation is issued while the real GpuCompute.ready awaits an adapter.
let finishAdapter;
const gpu=new GpuCompute({getGpu:()=>({requestAdapter:()=>new Promise(resolve=>{finishAdapter=resolve;})})});
gpu.setLevel(4);
const controller=new AbortController();let settled=false;
const request=gpu.run(endPlan({dimension:'end',seed:'0',x:2048,z:1024,width:32,height:32,step:4}),{signal:controller.signal})
  .then(()=>{settled=true;return 'resolved';},e=>{settled=true;return e.message;});
controller.abort();await delay(100);
report.gpuCancellation={settledAfterAbortAnd100ms:settled};
assert.equal(settled,fixed);
finishAdapter(null);report.gpuCancellation.outcomeAfterAdapterFinishes=await request;
assert.equal(report.gpuCancellation.outcomeAfterAdapterFinishes,fixed?'resolved':'CANCELLED');gpu.setLevel(0);
// Exercise the primary startup deadline and the normal map-retry action.
let fake,client,workerCount=0;
const failedPool=new ComputePool(()=>{
  const number=++workerCount;
  fake={postMessage(m){if(fixed&&number>1&&m.id)queueMicrotask(()=>{
    this.onmessage({data:{type:'ready'}});this.onmessage({data:{...m,result:[]}});
  });},terminate(){this.terminated=true;}};
  client=new WorkerClient(()=>fake,{startupTimeoutMs:20});return client;
});
const failure=await failedPool.request('predictStructures',{seed:'0',dimension:'end'}).catch(e=>e.message);
const failedWorker=fake;
const retry=await failedPool.request('retryPacks',{});
const afterRetry=await failedPool.request('predictStructures',{seed:'0',dimension:'end'}).catch(e=>e.message);
report.primaryStartupTimeout={acceleratedDeadlineMs:20,failure,terminated:failedWorker.terminated,remainingWorkers:failedPool.clients.length,retryPacksResult:retry,queryAfterRetry:afterRetry};
assert.ok(['WORKER_STARTUP_TIMEOUT','没有可用的计算线程，请刷新页面'].includes(failure));assert.deepEqual(retry,[]);assert.equal(failedPool.clients.length,fixed?1:0);
if(fixed)assert.deepEqual(afterRetry,[]);
failedPool.retryCapacity();report.primaryStartupTimeout.workersAfterExplicitCapacityRetry=failedPool.clients.length;
assert.equal(failedPool.clients.length,1);
failedPool.close();
await mkdir(new URL('../.test-work/',import.meta.url),{recursive:true});
await writeFile(new URL(`../.test-work/compute-compatibility-audit${fixed?'-fixed':''}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
