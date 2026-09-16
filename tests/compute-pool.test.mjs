import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ComputePool} from '../dist/engine/compute-pool.js';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {sampleBiomes} from '../dist/engine/native.js';
import {GPU_MODES,gpuModeAtLevel,gpuLevelForMode,gpuComputeLevel,readGpuPreference,writeGpuPreference,readParallelism,writeParallelism,normalizeParallelism,parallelismBudget,readParallelismSelection,writeParallelismSelection} from '../dist/gpu-settings.js';

function fixture() {
  const workers=[];
  const pool=new ComputePool(()=>{
    const worker={messages:[],postMessage(data){this.messages.push(data);},terminate(){this.closed=true;}};
    worker.client=new WorkerClient(()=>worker);workers.push(worker);return worker.client;
  });
  const answer=(w,result)=>{const m=w.messages.findLast(m=>m.id);w.onmessage({data:{...m,result}});};
  return {pool,workers,answer};
}
const query={dimension:'end',seed:'123',x:-2048,z:1024,width:32,height:32,step:64};

test('idle auxiliary engines are released and recreated on demand without closing busy workers or primary caches',async()=>{
  const {pool,workers,answer}=fixture();let now=0;pool.now=()=>now;pool.setParallelism(4);
  const primary=pool.clients[0],jobs=Array.from({length:4},()=>pool.request('predictStructures',query));
  workers.slice(0,3).forEach(w=>answer(w,[]));await Promise.all(jobs.slice(0,3));
  now=59000;pool.trimIdleWorkers();assert.equal(pool.clients.length,4);
  now=61000;pool.trimIdleWorkers();assert.equal(pool.clients.length,2);assert.equal(pool.clients[0],primary);assert.ok(!workers[3].closed);
  answer(workers[3],[]);await jobs[3];now=122000;pool.trimIdleWorkers();assert.equal(pool.clients.length,1);
  assert.equal(pool.parallelism,4);assert.ok(!workers[0].closed);assert.ok(!workers[0].messages.some(m=>m.action==='reset'));
  const next=Array.from({length:4},()=>pool.request('predictStructures',{...query,dimension:'twilight'}));
  assert.equal(pool.clients.length,4);workers.filter(w=>!w.closed).forEach(w=>answer(w,[]));await Promise.all(next);pool.close();
});
test('settings map every slider stop to a real mode, preserve old preferences and clamp invalid parallelism',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  for(const [level,mode] of GPU_MODES.entries()) {
    assert.equal(gpuModeAtLevel(String(level)),mode);assert.equal(gpuLevelForMode(mode),level);
    assert.equal(gpuComputeLevel(mode),level>=3?level:0);
    writeGpuPreference(storage,mode);assert.equal(readGpuPreference(storage),mode);
  }
  for(const value of [-1,5,NaN,1.5,'',null,true])assert.equal(gpuModeAtLevel(value),'off');
  for(const n of [1,2,3,4]){writeParallelism(storage,n);assert.equal(readParallelism(storage),n);}
  for(const n of [0,65,-1,1.1,'bad'])assert.equal(normalizeParallelism(n),1);
  assert.equal(readParallelism({getItem(){throw Error();}}),1);
  assert.equal(readGpuPreference(storage),'maximum');
});
test('parallelism defaults to one persistent worker; higher settings distribute pending jobs and inherit GPU level',async()=>{
  const {pool,workers,answer}=fixture();assert.equal(workers.length,1);
  pool.setParallelism(4);pool.setGpuCompute(4);assert.equal(workers.length,1,'lazy creation');
  const jobs=Array.from({length:4},()=>pool.request('predictStructures',query));
  assert.equal(workers.length,4);assert.ok(workers.every(w=>w.client.pending.size===1));
  assert.ok(workers.every(w=>w.messages.some(m=>m.action==='gpuCompute'&&m.level===4)));
  workers.forEach((w,i)=>answer(w,[i]));assert.equal((await Promise.all(jobs)).flat().length,4);
  const primary=workers[0].client;pool.setParallelism(1);
  assert.equal(pool.clients[0],primary);assert.ok(workers.slice(1).every(w=>w.closed));
  assert.equal(workers[0].messages.some(m=>m.action==='reset'),false);pool.close();
});
test('decreasing parallelism drains active workers without cancellation and retains the primary caches',async()=>{
  const {pool,workers,answer}=fixture();pool.setParallelism(4);
  const jobs=Array.from({length:4},()=>pool.request('predictStructures',query));
  pool.setParallelism(1);assert.ok(workers.every(w=>!w.closed));
  workers.forEach((w,i)=>answer(w,[i]));await Promise.all(jobs);
  assert.ok(workers.slice(1).every(w=>w.closed));assert.ok(!workers[0].closed);
  assert.ok(workers.every(w=>!w.messages.some(m=>m.action==='cancel'||m.action==='reset')));pool.close();
});
test('world switches cancel every worker and late responses cannot contaminate new queries',async()=>{
  const {pool,workers,answer}=fixture();pool.setParallelism(3);
  const jobs=Array.from({length:3},()=>pool.request('predictStructures',query));
  const rejected=jobs.map(p=>assert.rejects(p,/CANCELLED/));pool.reset();await Promise.all(rejected);
  assert.ok(workers.every(w=>w.messages.some(m=>m.action==='reset')));
  workers.forEach(w=>answer(w,['old']));
  const next=pool.request('predictStructures',{...query,seed:'456'});
  const active=workers.find(w=>w.client.pending.size);answer(active,['new']);assert.deepEqual(await next,['new']);pool.close();
});
test('GPU status reports partial fallback and recovery reaches all live workers',async()=>{
  const {pool,workers,answer}=fixture(),states=[];pool.onGpuComputeStatus=s=>states.push(s);
  pool.setParallelism(2);const jobs=[pool.request('predictStructures',query),pool.request('predictStructures',query)];
  pool.setGpuCompute(4);
  for(const [i,w] of workers.entries())w.onmessage({data:{type:'gpuCompute',revision:w.client.computeRevision,state:i?'failed':'active'}});
  assert.equal(states.at(-1),'partial');workers.forEach(w=>answer(w,[]));await Promise.all(jobs);
  const retry=pool.request('retryPacks',{});workers.forEach(w=>answer(w,[{id:'same',error:'example'}]));assert.equal((await retry).length,1);
  pool.close();await assert.rejects(pool.request('predictStructures',query),/CANCELLED/);
});
test('a failed auxiliary worker falls back to primary, but cancellation or reset never retries obsolete work',async()=>{
  const {pool,workers,answer}=fixture();pool.setParallelism(2);
  const jobs=[pool.request('predictStructures',query),pool.request('predictStructures',query)];
  answer(workers[0],['primary']);workers[1].onerror();await new Promise(setImmediate);
  answer(workers[0],['fallback']);assert.deepEqual((await Promise.all(jobs)).flat().sort(),['fallback','primary']);
  pool.close();
  const other=fixture();other.pool.setParallelism(2);
  const pending=[other.pool.request('predictStructures',query),other.pool.request('predictStructures',query)];
  const rejected=pending.map(p=>assert.rejects(p));other.workers[1].onerror();other.pool.reset();await Promise.all(rejected);
  assert.equal(other.workers[0].messages.filter(m=>m.id).length,1);other.pool.close();
});
test('independent real worker threads produce identical biome data and remain correct across world resets',async t=>{
  const threads=[];
  const pool=new ComputePool(()=>{
    const thread=new Worker(new URL('./helpers/compute-worker.mjs',import.meta.url));threads.push(thread);
    const adapter={postMessage:m=>thread.postMessage(m),terminate:()=>thread.terminate()};
    const client=new WorkerClient(()=>adapter);
    thread.on('message',data=>adapter.onmessage({data}));thread.on('error',()=>adapter.onerror());return client;
  });
  t.after(async()=>{pool.close();await Promise.all(threads.map(w=>w.terminate()));});
  pool.setParallelism(4);
  const queries=Array.from({length:8},(_,i)=>({...query,x:query.x+i*3072,seed:i%2?'9223372036854775807':'-9223372036854775808'}));
  const result=await Promise.all(queries.map(q=>pool.request('sampleBiomes',q)));
  assert.equal(new Set(threads.map(w=>w.threadId)).size,4);
  for(const [i,data] of result.entries())assert.deepEqual(data,sampleBiomes(queries[i]));
  pool.reset();assert.deepEqual(await pool.request('sampleBiomes',query),sampleBiomes(query));
});
test('slider input previews its label; releasing it applies and persists one setting change',async()=>{
  const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  const start=app.indexOf("$('gpu-rendering').onchange="),end=app.indexOf('$("zoom-out").onclick',start);
  const elements={'gpu-rendering':{value:'4'},'gpu-retry':{},'compute-parallelism':{value:'3'},'custom-threads':{value:'8',checkValidity:()=>true},'parallelism-retry':{},'compute-allocation':{value:'50'}},calls=[];
  const context={$:id=>elements[id],gpuModeAtLevel,gpuComputeLevel,renderGpuLevel:()=>calls.push('gpuLabel'),renderParallelism:()=>calls.push('parallelLabel'),
    renderAllocation:()=>calls.push('allocationLabel'),writeAllocation:(_,n)=>calls.push(['saveAllocation',n]),
    view:{setGpuMode:m=>calls.push(['mode',m])},workerClient:{parallelism:1,setAllocation:n=>calls.push(['allocation',n]),setGpuCompute:n=>calls.push(['gpu',n]),setParallelism(n){this.parallelism=n;calls.push(['workers',n]);}},
    localStorage:{},writeGpuPreference:(_,m)=>calls.push(['saveGpu',m]),writeParallelismSelection:(_,n)=>calls.push(['saveWorkers',n]),gpuComputeState:'off'};
  vm.runInNewContext(app.slice(start,end),context);
  elements['gpu-rendering'].oninput();elements['compute-parallelism'].oninput();
  assert.deepEqual(calls,['gpuLabel','parallelLabel']);calls.length=0;
  elements['gpu-rendering'].onchange();elements['compute-parallelism'].onchange();
  assert.ok(calls.some(v=>v[0]==='gpu'&&v[1]===4));assert.ok(calls.some(v=>v[0]==='saveWorkers'&&v[1]===3));
  assert.equal(calls.filter(v=>v[0]==='workers').length,1);
  elements['compute-parallelism'].value='5';elements['custom-threads'].value='12';
  elements['custom-threads'].onchange();assert.ok(calls.some(v=>v[0]==='workers'&&v[1]===12));
  const before=calls.filter(v=>v[0]==='workers').length;
  elements['custom-threads'].checkValidity=()=>false;elements['custom-threads'].reportValidity=()=>calls.push('invalid');
  elements['custom-threads'].onchange();assert.equal(calls.filter(v=>v[0]==='workers').length,before);assert.ok(calls.includes('invalid'));
  elements['compute-allocation'].oninput();assert.ok(calls.some(v=>v[0]==='allocation'&&v[1]==='50'));
  assert.equal(calls.filter(v=>v[0]==='saveAllocation').length,0);
  elements['compute-allocation'].onchange();assert.ok(calls.some(v=>v[0]==='saveAllocation'&&v[1]==='50'));
});

test('mixed queues reserve refinement capacity, adjust live, lend unused slots and keep the total worker cap',async()=>{
  const {pool,workers,answer}=fixture();pool.setParallelism(4);pool.setAllocation(50);
  const jobs=[],submit=workClass=>jobs.push(pool.request('sampleBiomes',query,{workClass}).catch(error=>error.message));
  for(let i=0;i<4;i++)submit('coverage'); // Empty quality queue lends all slots.
  assert.equal(pool.running.size,4);assert.ok([...pool.running.values()].every(j=>j.workClass==='coverage'));
  for(let i=0;i<4;i++){submit('refine');submit('coverage');}
  const respond=w=>answer(w,new Uint16Array(query.width*query.height));
  respond(workers[0]);respond(workers[1]);await new Promise(setImmediate);
  assert.equal([...pool.running.values()].filter(j=>j.workClass==='refine').length,2);
  pool.setAllocation(100);respond(workers[2]);await new Promise(setImmediate);
  assert.equal([...pool.running.values()].filter(j=>j.workClass==='refine').length,3);
  assert.equal(pool.clients.length,4);assert.equal(pool.parallelism,4);
  assert.ok(workers.every(w=>!w.messages.some(m=>m.action==='reset'||m.action==='cancel')));
  pool.setAllocation(0);respond(workers[3]);await new Promise(setImmediate);
  pool.reset();await Promise.all(jobs);pool.close();
});

test('custom selection survives reload even below five workers, without changing legacy presets',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  writeParallelism(storage,4);assert.deepEqual(readParallelismSelection(storage),{level:4,custom:8,threads:4});
  for(const n of [1,2,8,32,64]) {
    writeParallelismSelection(storage,5,n);assert.deepEqual(readParallelismSelection(storage),{level:5,custom:n,threads:n});
  }
  writeParallelismSelection(storage,3,32);assert.deepEqual(readParallelismSelection(storage),{level:3,custom:32,threads:3});
  assert.equal(parallelismBudget({hardwareConcurrency:16,deviceMemory:8}),15);
  assert.equal(parallelismBudget({hardwareConcurrency:16,deviceMemory:2}),2);
  assert.equal(parallelismBudget({hardwareConcurrency:16,deviceMemory:4}),4);
  assert.equal(parallelismBudget({hardwareConcurrency:1}),1);
  assert.equal(parallelismBudget({}),4);
});

function controlledPool({failureAt=Infinity,startupTimeoutMs=0,primaryTimeoutMs=0,hints={hardwareConcurrency:65,deviceMemory:8},now=()=>performance.now()}={}) {
  const workers=[],statuses=[];let attempts=0,failAt=failureAt;
  const pool=new ComputePool(()=>{
    if(++attempts===failAt)throw new Error('Worker allocation failed');
    const w={messages:[],postMessage(m){this.messages.push(m);},terminate(){this.closed=true;}};
    w.client=new WorkerClient(()=>w,{startupTimeoutMs:workers.length?startupTimeoutMs:primaryTimeoutMs});workers.push(w);return w.client;
  },{getHints:()=>hints,now});
  pool.onParallelismStatus=s=>statuses.push(s);
  const finish=async()=>{
    for(let n=0;n<100&&pool.jobs.size;n++) {
      for(const w of workers)if(!w.closed) {
        w.onmessage({data:{type:'ready'}});
        for(const m of w.messages.filter(m=>m.id&&m.action!=='cancel'))w.onmessage({data:{...m,result:[]}});
      }
      await new Promise(setImmediate);
    }
    assert.equal(pool.jobs.size,0,'all central and in-flight jobs finished');
  };
  return {pool,workers,statuses,finish,attempts:()=>attempts,allow:()=>failAt=Infinity};
}
test('custom requests above four use the device budget and can distribute eight independent jobs',async()=>{
  const h=controlledPool({hints:{hardwareConcurrency:9,deviceMemory:8}});h.pool.setParallelism(32);
  const jobs=Array.from({length:12},()=>h.pool.request('predictStructures',query));
  assert.equal(h.workers.length,8);assert.equal(h.pool.parallelism,32);assert.equal(h.pool.effectiveParallelism,8);
  assert.equal(h.statuses.at(-1).reason,'device');await h.finish();await Promise.all(jobs);h.pool.close();
});
test('creation failure latches the available capacity and retries the query without retry storms',async()=>{
  const h=controlledPool({failureAt:3});h.pool.setParallelism(32);
  const jobs=Array.from({length:12},()=>h.pool.request('predictStructures',query));
  assert.equal(h.attempts(),3);assert.equal(h.pool.effectiveParallelism,2);assert.equal(h.statuses.at(-1).reason,'startup');
  h.pool.setParallelism(64);jobs.push(h.pool.request('predictStructures',query));assert.equal(h.attempts(),3);
  h.allow();h.pool.retryCapacity();jobs.push(h.pool.request('predictStructures',query));assert.equal(h.workers.length,jobs.length);
  await h.finish();await Promise.all(jobs);h.pool.close();
});
test('at most one auxiliary worker starts until its module graph becomes ready',async()=>{
  const h=controlledPool({startupTimeoutMs:1000});h.pool.setParallelism(16);
  const jobs=Array.from({length:8},()=>h.pool.request('predictStructures',query));
  assert.equal(h.workers.length,2);assert.equal(h.statuses.at(-1).ready,1);
  h.workers[1].onmessage({data:{type:'ready'}});
  jobs.push(h.pool.request('predictStructures',query));assert.equal(h.workers.length,3);
  assert.equal(h.statuses.at(-1).started-h.statuses.at(-1).ready,1);
  h.workers[2].onmessage({data:{type:'ready'}});await h.finish();await Promise.all(jobs);h.pool.close();
});
test('startup timeout releases the worker, falls back, ignores late readiness and waits for explicit retry',async()=>{
  const h=controlledPool({startupTimeoutMs:15});h.pool.setParallelism(16);
  const jobs=[h.pool.request('predictStructures',query),h.pool.request('predictStructures',query)];
  await new Promise(r=>setTimeout(r,30));
  assert.equal(h.pool.effectiveParallelism,1);assert.equal(h.statuses.at(-1).reason,'timeout');assert.ok(h.workers[1].closed);
  h.workers[1].onmessage({data:{type:'ready'}});jobs.push(h.pool.request('predictStructures',query));assert.equal(h.workers.length,2);
  await h.finish();await Promise.all(jobs);h.pool.close();
});
test('runtime worker loss shrinks capacity and queued queries migrate once to a healthy worker',async()=>{
  const h=controlledPool();h.pool.setParallelism(8);
  const jobs=Array.from({length:8},()=>h.pool.request('predictStructures',query));
  h.workers[4].onerror();await new Promise(setImmediate);
  assert.equal(h.pool.effectiveParallelism,7);assert.equal(h.statuses.at(-1).reason,'worker');
  jobs.push(h.pool.request('predictStructures',query));assert.equal(h.attempts(),8);
  await h.finish();await Promise.all(jobs);h.pool.close();
});
test('losing all workers stops allocation until an explicit retry creates a replacement',async()=>{
  const h=controlledPool();
  const pending=h.pool.request('predictStructures',query),rejected=assert.rejects(pending);
  h.workers[0].onerror();await rejected;
  await assert.rejects(h.pool.request('predictStructures',query),/没有可用/);assert.equal(h.attempts(),1);
  h.pool.retryCapacity();assert.equal(h.attempts(),2);
  const next=h.pool.request('predictStructures',query);await h.finish();assert.deepEqual(await next,[]);h.pool.close();
});

test('map pack retry rebuilds an empty pool and propagates replacement failure',async()=>{
  const {pool,workers,answer}=fixture();
  const failed=assert.rejects(pool.request('predictStructures',query));workers[0].onerror();await failed;
  const retry=pool.request('retryPacks',{});
  assert.equal(workers.length,2);answer(workers[1],[]);assert.deepEqual(await retry,[]);
  const next=pool.request('predictStructures',query);answer(workers[1],['recovered']);assert.deepEqual(await next,['recovered']);pool.close();
  const h=controlledPool({failureAt:2});h.workers[0].onerror();
  await assert.rejects(h.pool.request('retryPacks',{}),/无法重建/);assert.equal(h.attempts(),2);h.pool.close();
});

test('production primary waits for pack readiness without the auxiliary startup deadline',()=>{
  const OriginalWorker=globalThis.Worker;
  globalThis.Worker=class {postMessage(){} terminate(){}};
  let pool;
  try {
    pool=new ComputePool();
    assert.equal(pool.clients[0].isReady,false);assert.equal(pool.clients[0].startupTimer,undefined);
    pool.clients[0].receive({type:'ready'});assert.equal(pool.clients[0].isReady,true);
  } finally {pool?.close();globalThis.Worker=OriginalWorker;}
});

test('cold batch redistributes on readiness without waiting for new requests',async()=>{
  const h=controlledPool({primaryTimeoutMs:1000,startupTimeoutMs:1000});h.pool.setParallelism(4);
  const jobs=Array.from({length:8},()=>h.pool.request('predictStructures',query));
  assert.equal(h.workers.length,1);assert.equal(h.workers[0].client.pending.size,0);assert.equal(h.pool.queue.length,8);
  h.workers[0].onmessage({data:{type:'ready'}});
  assert.equal(h.workers.length,2);assert.equal(h.workers[0].client.pending.size,1);
  h.workers[1].onmessage({data:{type:'ready'}});
  assert.equal(h.workers.length,3);assert.equal(h.workers[1].client.pending.size,1);
  h.workers[2].onmessage({data:{type:'ready'}});h.workers[3].onmessage({data:{type:'ready'}});
  assert.ok(h.workers.every(w=>w.client.pending.size===1));assert.equal(h.pool.queue.length,4);
  await h.finish();await Promise.all(jobs);h.pool.close();
});

test('warm primary consumes remaining short work while an auxiliary is still starting',async()=>{
  const h=controlledPool({startupTimeoutMs:1000});h.pool.setParallelism(2);
  const jobs=[h.pool.request('predictStructures',query),h.pool.request('predictStructures',query)];
  const primary=h.workers[0],first=primary.messages.find(m=>m.id);
  primary.onmessage({data:{...first,result:['first']}});await new Promise(setImmediate);
  assert.equal(h.workers[1].client.isReady,false);assert.equal(h.workers[1].client.pending.size,0);
  const second=primary.messages.findLast(m=>m.id);assert.notEqual(second.id,first.id);
  primary.onmessage({data:{...second,result:['second']}});
  assert.deepEqual(await Promise.all(jobs),[['first'],['second']]);h.pool.close();
});

test('central queue preserves priority and cancellation without resetting worker caches',async()=>{
  const {pool,workers,answer}=fixture(),w=workers[0];
  const active=pool.request('predictStructures',query),low=pool.request('predictStructures',{...query,seed:'2'},{priority:2});
  const controller=new AbortController();
  const cancelled=assert.rejects(pool.request('predictStructures',{...query,seed:'3'},{priority:0,signal:controller.signal}),/CANCELLED/);
  const high=pool.request('predictStructures',{...query,seed:'4'},{priority:0});controller.abort();
  answer(w,[]);await active;await new Promise(setImmediate);
  assert.equal(w.messages.findLast(m=>m.id).query.seed,'4');answer(w,[]);await high;await new Promise(setImmediate);
  assert.equal(w.messages.findLast(m=>m.id).query.seed,'2');answer(w,[]);await low;await cancelled;
  assert.equal(w.messages.filter(m=>m.action==='reset'||m.action==='cancel').length,0);pool.close();
});

test('reset and close discard unassigned jobs as well as in-flight work',async()=>{
  for(const action of ['reset','close']) {
    const {pool,workers}=fixture();
    const results=Array.from({length:5},()=>assert.rejects(pool.request('predictStructures',query),/CANCELLED/));
    pool[action]();await Promise.all(results);
    assert.equal(pool.queue.length,0);assert.equal(pool.jobs.size,0);assert.equal(workers[0].messages.filter(m=>m.id).length,1);pool.close();
  }
});

test('observed cheap work reuses warm engines, while expensive backlogs can still expand',async()=>{
  let clock=0;
  const h=controlledPool({primaryTimeoutMs:1000,startupTimeoutMs:1000,now:()=>clock});
  clock=100;h.workers[0].onmessage({data:{type:'ready'}});
  const complete=async elapsed=>{
    clock+=elapsed;const w=h.workers[0],m=w.messages.findLast(m=>m.id);
    w.onmessage({data:{...m,result:[]}});await new Promise(setImmediate);
  };
  const warm=h.pool.request('predictStructures',query);await complete(1);await warm;
  h.pool.setParallelism(8);
  const cheap=Array.from({length:8},()=>h.pool.request('predictStructures',query));
  assert.equal(h.workers.length,1,'known tiny jobs cannot repay a 100ms engine startup');
  for(let i=0;i<8;i++)await complete(1);await Promise.all(cheap);
  const expensive=h.pool.request('predictStructures',query);await complete(1000);await expensive;
  const backlog=Array.from({length:8},()=>h.pool.request('predictStructures',query));
  assert.equal(h.workers.length,2,'expensive backlog still starts one auxiliary');
  await h.finish();await Promise.all(backlog);h.pool.close();
});
