import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {ComputePool} from '../dist/engine/compute-pool.js';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {biomeRegistry,registerDimension} from '../dist/engine/catalog.js';
import {registerPackBiomes} from '../dist/engine/packs.js';
const root=new URL('../private-packs/rwg-local-preview/',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const manifest=await json('packs/registry.json'),config=await json('environment.json');
for(const pack of manifest.packs){registerPackBiomes(pack);for(const d of pack.dimensions)registerDimension(d);}
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))});
const threads=[];
const parallelism=process.argv.includes('--eight')?8:4;
const allocation=Number(process.argv.find(arg=>arg.startsWith('--allocation='))?.split('=')[1]||0);
assert.ok(Number.isInteger(allocation)&&allocation>=0&&allocation<=100);
const pool=new ComputePool(()=>{
  const thread=new Worker(new URL('../tests/helpers/compute-worker.mjs',import.meta.url),{workerData:{entry:new URL('engine/worker.js',root).href}});
  threads.push(thread);const adapter={postMessage:m=>thread.postMessage(m),terminate:()=>thread.terminate()};
  const client=new WorkerClient(()=>adapter);thread.on('message',data=>adapter.onmessage({data}));thread.on('error',()=>adapter.onerror());return client;
},{getHints:()=>({hardwareConcurrency:65,deviceMemory:8})});
try {
  const {loadProviders,findProvider}=await import(new URL('engine/packs.js',root));
  const {biomeRegistry:referenceRegistry}=await import(new URL('engine/catalog.js',root));
  const installed=await loadProviders();assert.ok(installed.every(p=>!p.error));
  pool.setParallelism(parallelism);
  pool.setAllocation(allocation);
  const queries=['twilight','overworld','pluto','ross128b','nether','deep_dark','twilight','overworld'].map((dimension,i)=>({
    dimension,seed:i%2?'9223372036854775807':'-17',x:-517+i*256,z:219-i*128,width:19,height:17,step:i%2?1:16,config,
  }));
  const values=await Promise.all(queries.map((q,i)=>pool.request('sampleBiomes',q,{workClass:i%2?'refine':'coverage'})));
  assert.equal(threads.length,parallelism);
  let pixels=0;
  for(let i=0;i<queries.length;i++) {
    const expected=await findProvider(installed,queries[i].dimension,'sampleBiomes').sampleBiomes(queries[i]);
    assert.deepEqual([...values[i]].map(id=>biomeRegistry.at(id).key),[...expected].map(id=>referenceRegistry.at(id).key));pixels+=expected.length;
  }
  pool.setParallelism(1);pool.reset();
  const again=await pool.request('sampleBiomes',queries[0]);assert.deepEqual(again,values[0]);
  console.log(JSON.stringify({independentWorkers:parallelism,allocation,queries:queries.length+1,pixels:pixels+again.length,dimensions:[...new Set(queries.map(q=>q.dimension))],mismatches:0}));
} finally {pool.close();await Promise.all(threads.map(t=>t.terminate()));globalThis.fetch=originalFetch;}
