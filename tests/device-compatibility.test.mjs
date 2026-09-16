import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceBudget,canvasSize} from '../dist/device-budget.js';
import {parallelismBudget} from '../dist/gpu-settings.js';
import {observePageLifecycle} from '../dist/page-lifecycle.js';
import {MapView} from '../dist/map.js';
import {ComputePool} from '../dist/engine/compute-pool.js';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {trimMapTiles} from '../dist/map-memory.js';

test('missing/invalid memory hints and touch devices cannot inherit a many-core desktop budget',()=>{
  for(const deviceMemory of [undefined,NaN,Infinity,0,-1,'8'])
    assert.equal(parallelismBudget({hardwareConcurrency:64,deviceMemory}),4);
  assert.equal(parallelismBudget({hardwareConcurrency:16,deviceMemory:8,coarsePointer:true}),2);
  assert.equal(parallelismBudget({hardwareConcurrency:16,deviceMemory:8}),15);
  assert.equal(parallelismBudget({hardwareConcurrency:1,deviceMemory:8}),1);
  assert.equal(parallelismBudget({hardwareConcurrency:16,deviceMemory:2}),2);
});

test('canvas storage remains bounded for phones, tablets, 4K and large desktops without changing world geometry',()=>{
  for(const hints of [{},{deviceMemory:2},{deviceMemory:8},{deviceMemory:8,coarsePointer:true}])
    for(const [w,h] of [[390,600],[1024,1366],[1920,1080],[3840,2160],[8000,5000]])
      for(const dpr of [1,2,3,4,undefined,NaN,Infinity]) {
        const size=canvasSize(w,h,dpr,hints),budget=deviceBudget(hints);
        assert.ok(size.width*size.height<=budget.maxCanvasPixels);
        assert.ok(size.width<=4096&&size.height<=4096);
        assert.ok(Math.abs(size.width/size.scaleX-w)<1e-8);
        assert.ok(Math.abs(size.height/size.scaleY-h)<1e-8);
      }
  assert.equal(canvasSize(390,600,3,{deviceMemory:2}).width,390);
  assert.deepEqual(canvasSize(0,0,3),{width:1,height:1,scaleX:1,scaleY:1});
});

test('touch and unknown-memory history budgets do not evict visible exact samples',()=>{
  const tiles=new Map(Array.from({length:400},(_,i)=>[String(i),{tx:i,tz:0,step:1,data:new Uint16Array(16384)}]));
  const visible=new Set(Array.from({length:150},(_,i)=>String(i))),original=tiles.get('0');
  const stats=trimMapTiles(tiles,{visible,bounds:{minX:0,minZ:0,maxX:150*128,maxZ:128},coarsePointer:true,deviceMemory:8});
  assert.equal(stats.historyBytes,4*1024*1024);assert.equal(tiles.get('0'),original);
  assert.ok(stats.bytes<=stats.protectedBytes+stats.historyBytes);
  for(const key of visible)assert.ok(tiles.has(key));
});

test('visibility, freeze, pagehide and BFCache pageshow suspend/resume exactly once per transition',()=>{
  const page=new EventTarget(),target=new EventTarget(),events=[];page.hidden=true;
  const stop=observePageLifecycle({page,target,suspend:()=>events.push('pause'),resume:()=>events.push('resume')});
  page.dispatchEvent(new Event('visibilitychange'));target.dispatchEvent(new Event('pagehide'));
  page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events,['pause']);
  target.dispatchEvent(new Event('pageshow'));target.dispatchEvent(new Event('pageshow'));
  page.dispatchEvent(new Event('freeze'));page.dispatchEvent(new Event('visibilitychange'));
  page.dispatchEvent(new Event('resume'));
  assert.deepEqual(events,['pause','resume','pause','resume']);
  stop();page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(events.length,4);
});

function mapHarness(t) {
  const saved=new Map(),rafs=new Map(),transforms=[];let next=0;
  const install=(k,v)=>{saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});};
  install('ResizeObserver',class {observe(){}});
  install('requestAnimationFrame',fn=>{rafs.set(++next,fn);return next;});
  install('cancelAnimationFrame',id=>rafs.delete(id));
  install('devicePixelRatio',3);
  install('navigator',{hardwareConcurrency:8,deviceMemory:4});
  install('matchMedia',()=>({matches:true}));
  const canvas=new EventTarget();Object.assign(canvas,{width:0,height:0,focus(){},setPointerCapture(){},
    getContext:()=>({setTransform:(...args)=>transforms.push(args)}),
    getBoundingClientRect:()=>({left:0,top:0,width:390,height:600})});
  const selected=[],viewport=[];
  const map=new MapView(canvas,{request:async()=>null,onMove(){},onSelect:p=>selected.push(p),onViewport:b=>viewport.push(b)});
  map.resize();
  const send=(type,id,x,y)=>canvas.dispatchEvent(Object.assign(new Event(type),{pointerId:id,clientX:x,clientY:y}));
  t.after(()=>{clearTimeout(map.viewTimer);for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
  return {map,canvas,send,selected,rafs,transforms,viewport};
}

test('pinch to one finger remains continuous, cannot generate a tap, and ignores a third finger',t=>{
  const {map,send,selected}=mapHarness(t);
  send('pointerdown',1,100,100);send('pointerdown',2,200,100);
  send('pointerdown',3,300,100);assert.equal(map.pointers.size,2);
  send('pointermove',2,220,100);send('pointerup',2,220,100);
  const x=map.x,scale=map.scale;
  send('pointermove',1,101,100);
  assert.ok(Math.abs(map.x-(x-1/scale))<1e-8,'only the actual remaining finger displacement moves the map');
  send('pointerup',1,101,100);assert.equal(selected.length,0);
});

test('cancel and lost capture during pinch retain a valid one-finger state without false clicks',t=>{
  const {map,send}=mapHarness(t);
  send('pointerdown',1,100,100);send('pointerdown',2,200,100);
  send('pointercancel',2,200,100);
  const x=map.x;send('pointermove',1,102,100);assert.equal(map.x,x-2/map.scale);
  send('lostpointercapture',1,102,100);assert.equal(map.drag,null);assert.equal(map.pointers.size,0);
  assert.deepEqual(map.velocity,{x:0,z:0});
});

test('suspension cancels viewport work and drawing storage, retaining exact data and world coordinates on resume',t=>{
  const {map,canvas,rafs}=mapHarness(t),controller=new AbortController();
  const data=new Uint16Array([42]),tile={data,image:{width:128,height:128}};
  map.tiles.set('cached',tile);map.pending.add('pending');map.tileControllers.set('pending',controller);
  const bounds=map.bounds();map.setSuspended(true);map.setSuspended(true);
  assert.equal(controller.signal.aborted,true);assert.equal(rafs.size,0);
  assert.equal(canvas.width,1);assert.equal(tile.image,null);assert.equal(tile.data,data);
  let requests=0;map.request=async()=>{requests++;};map.ensureTiles();assert.equal(requests,0);
  map.setSuspended(false);map.setSuspended(false);
  assert.equal(rafs.size,1);assert.deepEqual(map.bounds(),bounds);assert.equal(tile.data[0],42);
  assert.equal(canvas.width,780);assert.equal(canvas.height,1200);assert.equal(map.lastFrame,0);
});

test('canvas restore resets the transform while preserving world position and sample cache',t=>{
  const {map,canvas,transforms}=mapHarness(t),bounds=map.bounds();
  canvas.dispatchEvent(new Event('contextlost'));assert.equal(map.contextLost,true);
  canvas.dispatchEvent(new Event('contextrestored'));
  assert.equal(map.contextLost,false);assert.deepEqual(map.bounds(),bounds);
  assert.deepEqual(transforms.at(-1),[2,0,0,2,0,0]);
});

test('background/foreground transitions do not repeatedly initialize a previously failed GPU',t=>{
  const {map}=mapHarness(t),calls=[];
  map.gpuMode='aggressive';map.gpuRenderer={active:false,setMode:mode=>calls.push(mode)};
  map.setSuspended(true);map.setSuspended(false);assert.deepEqual(calls,[]);
});

test('background pause releases unassigned starting helpers without turning background freeze into a startup failure',async()=>{
  const workers=[];
  const pool=new ComputePool(({primary})=>{
    const w={postMessage(m){this.last=m;},terminate(){this.terminated=true;}};
    const c=new WorkerClient(()=>w,{waitForReady:!primary,startupTimeoutMs:primary?0:1000});
    workers.push({w,c});return c;
  },{getHints:()=>({hardwareConcurrency:8,deviceMemory:8})});
  try {
    pool.setParallelism(2);
    const first=pool.request('predictStructures',{}),second=pool.request('predictStructures',{});
    const settled=Promise.allSettled([first,second]);
    assert.equal(workers.length,2);pool.setPaused(true);
    assert.equal(workers[1].w.terminated,true);assert.equal(pool.reason,null);
    assert.equal(pool.clients[0],workers[0].c);assert.equal(pool.clients.length,1);
    pool.setPaused(false);assert.equal(workers.length,3);
    pool.close();await settled;
  } finally {pool.close();}
});

test('paused pool holds exports, cancels obsolete viewport jobs, and resumes without resetting the primary engine',async()=>{
  const messages=[],worker={postMessage:m=>messages.push(m),terminate(){}};
  const primary=new WorkerClient(()=>worker),pool=new ComputePool(()=>primary,{getHints:()=>({hardwareConcurrency:2})});
  try {
    const signal=new AbortController(),job=pool.request('predictStructures',{}, {signal:signal.signal});
    const cancelled=assert.rejects(job,/CANCELLED/);
    pool.setPaused(true);signal.abort();await cancelled;
    const before=messages.filter(m=>m.id!==undefined&&m.action==='predictStructures').length;
    const exported=pool.request('predictStructures',{});
    await new Promise(setImmediate);
    assert.equal(messages.filter(m=>m.id!==undefined&&m.action==='predictStructures').length,before);
    pool.setPaused(false);const m=messages.at(-1);worker.onmessage({data:{...m,result:['kept']}});
    assert.deepEqual(await exported,['kept']);assert.equal(pool.clients[0],primary);
    assert.equal(messages.some(m=>m.action==='reset'),false);
  } finally {pool.close();}
});
