import test from 'node:test';
import assert from 'node:assert/strict';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {MapView} from '../dist/map.js';
const q={seed:'9007199254740993',dimension:'twilight',x:-260,z:-516,width:32,height:33,step:4};
function fixture(options={}) {
  let seed,calls=0;
  const engine={configure:value=>{seed=value;},biomes:(x,z,w,h)=>{calls++;return Array.from({length:w*h},(_,i)=>(x+i%w+z+Math.floor(i/w))%2?170:171);},features:()=>['LICH_TOWER|-8|24','HEDGE_MAZE|8|24']};
  return {engine,get calls(){return calls;},get seed(){return seed;},provider:createTwilightProvider(engine,{oldMapGen:false,dimensionId:7},{170:'tf:a',171:'tf:b'},{registry:{get:key=>key?{index:key==='tf:a'?3:7}:null},yieldTask:async()=>{},...options})};
}
test('Twilight raster strips preserve namespace palettes and arbitrary query splits',async()=>{
  const {provider:p}=fixture(),full=await p.sampleBiomes(q);
  const top=await p.sampleBiomes({...q,height:17}),bottom=await p.sampleBiomes({...q,z:q.z+17*4,height:16});
  assert.deepEqual([...top,...bottom],[...full]);assert.deepEqual(new Set(full),new Set([3,7]));
  const original=await p.sampleBiomes(q);await p.sampleBiomes({...q,seed:'-17'});assert.deepEqual(await p.sampleBiomes(q),original);
});
test('Twilight malformed tiles fail without poisoning later requests and cancellation stops queued strips',async()=>{
  const f=fixture(),generate=f.engine.biomes;f.engine.biomes=()=>[];
  await assert.rejects(f.provider.sampleBiomes(q),/不完整/);f.engine.biomes=generate;assert.equal((await f.provider.sampleBiomes(q)).length,1056);
  const controller=new AbortController(),g=fixture({yieldTask:async()=>controller.abort()});
  await assert.rejects(g.provider.sampleBiomes(q,{signal:controller.signal}),/CANCELLED/);assert.equal(g.calls,1);
  await assert.rejects(f.provider.sampleBiomes({...q,x:1}),/对齐/);
  await assert.rejects(f.provider.sampleBiomes({...q,config:{dimensionIds:{twilight:99}}}),/ID/);
});
test('individual Twilight landmark filters retain original wire kind and subtype',async()=>{
  const {provider:p}=fixture(),query={seed:'0',dimension:'twilight',bounds:{minX:-100,minZ:0,maxX:100,maxZ:100}};
  const all=await p.predictStructures(query),filtered=await p.predictStructures({...query,excludedKinds:['TWILIGHT_LICH_TOWER']});
  assert.equal(filtered.length,1);assert.equal(filtered[0].kind,'TWILIGHT_FEATURE');assert.equal(filtered[0].subtype,'HEDGE_MAZE');
  assert.deepEqual(MapView.prototype.visibleMarkers.call({markers:all,filtered:new Set(['TWILIGHT_LICH_TOWER'])}),filtered);
  assert.deepEqual(await p.predictStructures({...query,excludedKinds:['TWILIGHT_FEATURE']}),[]);
});
