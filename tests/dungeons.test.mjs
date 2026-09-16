import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonPredictor} from '../dist/engine/dungeons.js';
import {JavaRandom} from '../dist/engine/random.js';
const profile={undergroundLakes:false,undergroundLavaLakes:false},q={seed:'0',dimension:'overworld',bounds:{minX:-20,minZ:-20,maxX:20,maxZ:20}};
test('dungeon candidates require cave openings and skip nearby map structures before terrain work',async()=>{
  let calls=0;const engine={configure:()=>{},mask:()=>{calls++;return new Uint8Array(65536);}};
  const p=createDungeonPredictor(engine,profile,()=>128);
  assert.deepEqual(await p(q,[{kind:'VILLAGE',x:8,z:8}]),[]);assert.equal(calls,0);
  assert.deepEqual(await p(q,[]),[]);assert.ok(calls>0);
});
test('dungeon masks clear on seed changes and failed masks can be retried',async()=>{
  const seeds=[];let bad=true,calls=0;const engine={configure:s=>seeds.push(s),mask:()=>{calls++;return new Uint8Array(bad?1:65536);}};
  const p=createDungeonPredictor(engine,profile,()=>128);
  await assert.rejects(p(q,[]),/不完整/);bad=false;await p(q,[]);const before=calls;
  await p({...q,seed:'-17'},[]);assert.ok(calls>before);assert.deepEqual(seeds,['0','-17']);
  await assert.rejects(createDungeonPredictor(engine,profile,()=>NaN)(q,[]),/高度无效/);
});
test('disabled dungeon scans perform no work and active scans stop at cancellation',async()=>{
  let calls=0;const engine={configure:()=>calls++,mask:()=>new Uint8Array(65536)};
  const controller=new AbortController();let time=0;
  const p=createDungeonPredictor(engine,profile,()=>128,{now:()=>time+=20,yieldTask:async()=>controller.abort()});
  assert.deepEqual(await p({...q,excludedKinds:['VANILLA_SPAWNER_DUNGEON']},[]),[]);assert.equal(calls,0);
  await assert.rejects(p(q,[],{signal:controller.signal}),/CANCELLED/);
});

test('completed empty chunks survive mask eviction; exclusions are rechecked without caching them',async()=>{
  let heights=0,masks=0;
  const p=createDungeonPredictor({configure(){},mask(){masks++;return new Uint8Array(65536);}},profile,()=>{heights++;return 128;},{cacheLimit:1,yieldTask:async()=>{}});
  await p(q,[{kind:'VILLAGE',x:0,z:0}]);assert.equal(heights,0);
  await p(q,[]);const before=[heights,masks];assert.ok(heights>0&&masks>1);
  await p(q,[]);assert.deepEqual([heights,masks],before);
  await p({...q,seed:'1'},[]);assert.ok(heights>before[0]&&masks>before[1]);
});

test('cached positive chunks retain out-of-view successes, protect records, and obey changed exclusions',async()=>{
  const random=new JavaRandom('0'),x=random.nextInt(16)+8,y=random.nextInt(128),z=random.nextInt(16)+8,rx=random.nextInt(2)+2;
  const airX=x-rx-1,airZ=z;
  let heights=0;
  const engine={configure(){},mask(cx,cz){
    const a=new Uint8Array(65536);
    if(Math.floor(airX/16)===cx&&Math.floor(airZ/16)===cz){const i=((airX-cx*16)*16+airZ-cz*16)*256+y;a[i]=a[i+1]=1;}
    return a;
  }};
  const p=createDungeonPredictor(engine,profile,()=>{heights++;return 200;},{yieldTask:async()=>{}});
  const full={...q,bounds:{minX:8,minZ:8,maxX:24,maxZ:24}};
  // The left query checks source chunk 0 but clips out its first success.
  await p({...full,bounds:{...full.bounds,maxX:x}},[]);
  const first=await p(full,[]);assert.ok(first.some(m=>m.x===x&&m.z===z&&m.subtype===String(y)));
  const expected=structuredClone(first),before=heights;first[0].x=99999;
  assert.deepEqual(await p(full,[]),expected);assert.equal(heights,before);
  assert.deepEqual(await p(full,[{kind:'VILLAGE',x:0,z:0}]),[]);
  assert.deepEqual(await p(full,[]),expected);assert.equal(heights,before);
});

test('result cache is bounded and cancelled partial chunks are retried',async()=>{
  let heights=0,controller=new AbortController(),cancel=true;
  const p=createDungeonPredictor({configure(){},mask:()=>new Uint8Array(65536)},profile,()=>{heights++;if(cancel)controller.abort();return 128;},{cacheLimit:1,resultCacheLimit:1,yieldTask:async()=>{}});
  await assert.rejects(p(q,[],{signal:controller.signal}),/CANCELLED/);
  const failed=heights;cancel=false;controller=new AbortController();await p(q,[],{signal:controller.signal});assert.ok(heights>failed);
  const before=heights;await p(q,[]);assert.ok(heights>before);
  assert.throws(()=>createDungeonPredictor({},profile,()=>128,{resultCacheLimit:-1}),/缓存配置/);
});
