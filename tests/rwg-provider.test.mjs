import test from "node:test";
import assert from "node:assert/strict";
import { createRwgProvider } from "../dist/engine/rwg-provider.js";
const profile={noise:"wrapped-perlin",groups:{snow:[1],cold:[1],hot:[1],wet:[],small:[]}};
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
