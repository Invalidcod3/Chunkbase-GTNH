import {Worker} from 'node:worker_threads';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {ComputePool} from '../dist/engine/compute-pool.js';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {registerPackBiomes} from '../dist/engine/packs.js';
const root=new URL('../',import.meta.url),preview=new URL('private-packs/rwg-local-preview/',root);
const json=async path=>JSON.parse(await readFile(new URL(path,preview),'utf8'));
for(const p of (await json('packs/registry.json')).packs)registerPackBiomes(p);
const config=await json('environment.json'),results=[],references=new Map();
for(const dimension of ['overworld','twilight'])for(const target of [1,2,4,8]) {
  const threads=[];
  const pool=new ComputePool(({primary})=>{
    const worker=new Worker(new URL('../tests/helpers/compute-worker.mjs',import.meta.url),{workerData:{entry:new URL('engine/worker.js',preview).href}});
    threads.push(worker);const adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};
    const client=new WorkerClient(()=>adapter,{startupTimeoutMs:primary?0:15000,waitForReady:true});
    worker.on('message',data=>adapter.onmessage({data}));worker.on('error',()=>adapter.onerror());return client;
  },{getHints:()=>({hardwareConcurrency:16,deviceMemory:8})});
  pool.setParallelism(target);
  try {
    for(const phase of ['cold','next-region']) {
      // No repeated complete tiles: measure useful generation rather than the
      // front-end tile cache. Keep the seed and each worker's caches alive.
      const queries=Array.from({length:8},(_,i)=>({seed:'-17',dimension,x:-8192+(i%4)*2048+(phase==='next-region'?8192:0),z:2048+Math.floor(i/4)*2048,width:128,height:128,step:16,config}));
      const cpu=process.cpuUsage(),start=performance.now();let firstMs;
      const values=await Promise.all(queries.map(q=>pool.request('sampleBiomes',q,{priority:0}).then(v=>{firstMs??=performance.now()-start;return v;})));
      const wallMs=performance.now()-start,usage=process.cpuUsage(cpu),cpuMs=(usage.user+usage.system)/1000;
      const key=dimension+'/'+phase;
      if(references.has(key))assert.deepEqual(values,references.get(key));else references.set(key,values);
      const row={dimension,target,phase,workers:threads.length,ready:pool.clients.filter(c=>c.isReady).length,queries:8,firstMs,wallMs,cpuMs,cpuCoresEquivalent:cpuMs/wallMs,rssMiB:process.memoryUsage().rss/2**20,pixels:131072,mismatches:0};
      results.push(row);console.log(JSON.stringify(row));
    }
  } finally {pool.close();await Promise.all(threads.map(w=>w.terminate()));}
}
await writeFile(new URL('.test-work/cpu-profile-2026-09-15/parallel-efficiency.json',root),JSON.stringify({scope:'Single sweep, 16 logical processors; real production pool and isolated Node workers; CPU time sums process threads, includes V8 overhead; RSS process-wide and affected by allocator retention; GPU off; no browser FPS test',results},null,2));
