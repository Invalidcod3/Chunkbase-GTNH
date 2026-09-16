import test from 'node:test';
import assert from 'node:assert/strict';
import {createBiomeRasterCache} from '../dist/engine/biome-raster-cache.js';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createExtraProvider} from '../dist/engine/extra-provider.js';
const base={x:-8,z:-8,width:4,height:4,step:4};

test('raster cache owns buffers across response transfer and reuses only exact sample subsets',()=>{
  const cache=createBiomeRasterCache(64),data=Uint16Array.from({length:16},(_,i)=>i);
  cache.put('seed/dim/quarter',base,data);
  structuredClone(data,{transfer:[data.buffer]});
  const first=cache.get('seed/dim/quarter',base);assert.equal(first[15],15);first.fill(0);
  assert.equal(cache.get('seed/dim/quarter',base)[15],15);
  assert.deepEqual([...cache.get('seed/dim/quarter',{x:-4,z:-4,width:2,height:2,step:8})],[5,7,13,15]);
  for(const q of [{...base,x:-7},{...base,step:2},{...base,width:5}])assert.equal(cache.get('seed/dim/quarter',q),null);
  for(const space of ['seed/dim/full','other/dim/quarter','seed/other/quarter'])assert.equal(cache.get(space,base),null);
});

test('raster storage evicts least recently used entries, handles replacement and can be disabled',()=>{
  const cache=createBiomeRasterCache(64),a=new Uint16Array(16);
  cache.put('a',base,a);cache.put('b',base,a);cache.get('a',base);cache.put('c',base,a);
  assert.equal(cache.get('b',base),null);assert.ok(cache.get('a',base));assert.ok(cache.get('c',base));
  cache.put('a',base,a);assert.ok(cache.get('c',base));
  cache.put('large',{...base,width:100},new Uint16Array(400));assert.ok(cache.get('a',base));
  const off=createBiomeRasterCache(0);off.put('a',base,a);assert.equal(off.get('a',base),null);
  for(const n of [-1,NaN,1.5])assert.throws(()=>createBiomeRasterCache(n));
});

for(const type of ['twilight','extra']) {
  function setup(options={}) {
    let calls=0,seed=0,graph='a';
    const engine={configure(...args){if(type==='twilight'){seed=Number(args[0]);}else{graph=args[0];seed=Number(args[1]);}},
      biomes(x,z,w,h,quarter){calls++;return Int32Array.from({length:w*h},(_,i)=>((x+i%w+z+Math.floor(i/w)+seed+(graph==='b'?30:0)+(quarter?100:0))%500+500)%500);}};
    const opts={registry:{get:k=>k===undefined?null:{index:Number(k)}},yieldTask:async()=>{},...options};
    const keys=Object.fromEntries(Array.from({length:500},(_,i)=>[i,String(i)]));
    const provider=type==='twilight'?createTwilightProvider(engine,{dimensionId:7,oldMapGen:false},keys,opts):createExtraProvider(engine,{rossRuinChance:512,dimensions:{io:{id:36,graph:'a'},pluto:{id:49,graph:'b'}}},keys,opts);
    return {provider,engine,get calls(){return calls;}};
  }
  const query={seed:'0',dimension:type==='twilight'?'twilight':'io',...base,width:16,height:16};
  test(`${type}: cache hits preserve seed/dimension validation and transferred results`,async()=>{
    const f=setup(),p=f.provider,expected=await p.sampleBiomes(query),saved=expected.slice(),calls=f.calls;
    structuredClone(expected,{transfer:[expected.buffer]});
    assert.deepEqual(await p.sampleBiomes(query),saved);assert.equal(f.calls,calls);
    const coarse={...query,width:8,height:8,step:8},result=await p.sampleBiomes(coarse);
    assert.equal(f.calls,calls);assert.deepEqual([...result],Array.from({length:64},(_,i)=>saved[Math.floor(i/8)*2*16+i%8*2]));
    assert.notDeepEqual(await p.sampleBiomes({...query,seed:'1'}),saved);
    assert.deepEqual(await p.sampleBiomes(query),saved);
    await assert.rejects(p.sampleBiomes({...query,config:{dimensionIds:{[query.dimension]:999}}}),/ID/);
    const controller=new AbortController();controller.abort();await assert.rejects(p.sampleBiomes(query,{signal:controller.signal}),/CANCELLED/);
    if(type==='extra')assert.notDeepEqual(await p.sampleBiomes({...query,dimension:'pluto'}),saved);
    else {
      const full={...coarse,step:2};const before=f.calls;await p.sampleBiomes(full);assert.ok(f.calls>before,'quarter map cannot serve full-resolution semantics');
    }
  });
  test(`${type}: cancellation and malformed arrays never enter completed cache`,async()=>{
    let time=0,abort=true;const controller=new AbortController();
    const f=setup({now:()=>time+=20,yieldTask:async()=>{if(abort)controller.abort();}});
    await assert.rejects(f.provider.sampleBiomes({...query,width:64,height:64},{signal:controller.signal}),/CANCELLED/);
    assert.equal(f.calls,1);abort=false;const old=f.calls;await f.provider.sampleBiomes({...query,width:64,height:64});assert.ok(f.calls>old);
    const g=setup(),biomes=g.engine.biomes;g.engine.biomes=()=>[];
    await assert.rejects(g.provider.sampleBiomes(query),/不完整/);g.engine.biomes=biomes;
    assert.equal((await g.provider.sampleBiomes(query)).length,256);
  });
  test(`${type}: cheap bounded batches share a time slice and still yield before completion`,async()=>{
    let yields=0;const f=setup({now:()=>0,yieldTask:async()=>{yields++;}});
    await f.provider.sampleBiomes({...query,width:128,height:128,step:16});
    assert.ok(f.calls>1);assert.equal(yields,1);
  });
}
