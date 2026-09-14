import test from 'node:test';
import assert from 'node:assert/strict';
import {createDungeonPredictor} from '../dist/engine/dungeons.js';
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
