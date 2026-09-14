import test from "node:test";
import assert from "node:assert/strict";
import { createRwgProvider } from "../dist/engine/rwg-provider.js";
import { rwgStructures } from "../dist/engine/rwg-structures.js";
const profile={noise:"wrapped-perlin",groups:{snow:[1],cold:[1],hot:[1],wet:[],small:[]}};
test('an incomplete raw chunk is not cached and a subsequent retry can recover',async()=>{
 let calls=0;const engine={configure(){},finalChunk(){return ++calls===1?new Int32Array(0):new Int32Array(256).fill(1);}};
 const provider=createRwgProvider(engine,profile,{1:'test:biome'},{registry:{get:()=>({index:1})}});
 const q={dimension:'overworld',seed:'0',x:0,z:0,width:1,height:1,step:1};
 await assert.rejects(provider.sampleBiomes(q),/不完整/);assert.deepEqual(Array.from(await provider.sampleBiomes(q)),[1]);assert.equal(calls,2);
});
function setup(options={}) {
  const calls=[],seeds=[];
  const engine={configure(seed){seeds.push(seed);},finalChunk(cx,cz){calls.push([cx,cz]);return Int32Array.from({length:256},(_,i)=>((cx*16+i%16)+(cz*16+Math.floor(i/16))*3)&255);}};
  const registry={get(key){return key===undefined?undefined:{index:Number(key)+100};}};
  return {provider:createRwgProvider(engine,profile,Object.fromEntries(Array.from({length:256},(_,i)=>[i,String(i)])),{registry,...options}),calls,seeds};
}
test("RWG samples across negative chunk boundaries and maps palette indices",async()=>{
  const {provider,calls}=setup(),q={dimension:"overworld",seed:"9007199254740993",x:-17,z:-2,width:14,height:9,step:3};
  const result=await provider.sampleBiomes(q);
  assert.deepEqual(Array.from(result),Array.from({length:q.width*q.height},(_,i)=>(((q.x+i%q.width*3)+(q.z+Math.floor(i/q.width)*3)*3)&255)+100));
  const count=calls.length;await provider.sampleBiomes(q);assert.equal(calls.length,count);
});
test("RWG cache is bounded and resets for a new full-width seed",async()=>{
  const {provider,calls,seeds}=setup({cacheLimit:1});
  const q={dimension:"overworld",seed:"9007199254740992",x:0,z:0,width:1,height:1,step:1};
  await provider.sampleBiomes(q);await provider.sampleBiomes({...q,x:16});await provider.sampleBiomes(q);
  assert.equal(calls.length,3);await provider.sampleBiomes({...q,seed:"9007199254740993"});
  assert.deepEqual(seeds,["9007199254740992","9007199254740993"]);
});
test("RWG quarter-resolution sampling uses Amidst's two-block centre offset",async()=>{
  const {provider}=setup();
  const result=await provider.sampleBiomes({dimension:"overworld",seed:"0",x:-3,z:-5,width:2,height:2,step:4});
  assert.deepEqual(Array.from(result),[-1-3*3,3-3*3,-1+3,3+3].map(v=>(v&255)+100));
});
test("RWG abort and bounds errors never produce a successful empty tile",async()=>{
  const {provider,calls}=setup(),controller=new AbortController();controller.abort();
  const q={dimension:"overworld",seed:"0",x:0,z:0,width:1,height:1,step:1};
  await assert.rejects(provider.sampleBiomes(q,{signal:controller.signal}),/CANCELLED/);
  assert.equal(calls.length,0);
  await assert.rejects(provider.sampleBiomes({...q,x:30000000}),/范围/);
});
test("RWG yields during a long request and accepts a new seed after cancellation",async()=>{
  let clock=0;const controller=new AbortController();
  const {provider,seeds}=setup({now:()=>clock+=17,yieldTask:async()=>controller.abort()});
  const q={dimension:"overworld",seed:"0",x:0,z:0,width:128,height:128,step:4};
  await assert.rejects(provider.sampleBiomes(q,{signal:controller.signal}),/CANCELLED/);
  const result=await provider.sampleBiomes({...q,seed:"1",width:1,height:1});
  assert.equal(result.length,1);assert.deepEqual(seeds,["0","1"]);
});
test("RWG village and biome requests share seed state without reusing another seed's chunks",async()=>{
  const seeds=[];let current;
  const engine={configure(seed){current=seed;seeds.push(seed);},finalChunk(){return new Int32Array(256).fill(1);},villageViable(){return current==="0";}};
  const provider=createRwgProvider(engine,profile,{1:"test:biome"},{registry:{get:()=>({index:1})}});
  const q={seed:"0",dimension:"overworld",bounds:{minX:-1000,minZ:-1000,maxX:1000,maxZ:1000},config:{mineshaftsEnabled:false}};
  const tile={seed:"0",dimension:"overworld",x:0,z:0,width:1,height:1,step:1};
  await provider.sampleBiomes(tile);
  assert.ok((await provider.predictStructures(q)).some(m=>m.kind==="VILLAGE"));
  assert.ok(!(await provider.predictStructures({...q,seed:"1"})).some(m=>m.kind==="VILLAGE"));
  await provider.sampleBiomes(tile);assert.deepEqual(seeds,["0","1","0"]);
});
test("RWG village bounds split without omissions or duplicates, and cancellation rejects",async()=>{
  const q={seed:"9007199254740993",dimension:"overworld",bounds:{minX:-1001,minZ:-997,maxX:1100,maxZ:1075},config:{mineshaftsEnabled:false}};
  const encode=values=>values.filter(m=>m.kind==="VILLAGE").map(m=>`${m.x},${m.z}`).sort();
  const full=encode(await rwgStructures(q,()=>true));assert.ok(full.length);
  const left=await rwgStructures({...q,bounds:{...q.bounds,maxX:-4}},()=>true);
  const right=await rwgStructures({...q,bounds:{...q.bounds,minX:-4}},()=>true);
  assert.deepEqual(encode([...left,...right]),full);
  const controller=new AbortController();controller.abort();
  await assert.rejects(rwgStructures(q,()=>true,{signal:controller.signal}),/CANCELLED/);
});
