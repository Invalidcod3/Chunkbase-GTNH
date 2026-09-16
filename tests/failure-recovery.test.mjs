import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProviders,findProvider,retryProviders} from '../dist/engine/packs.js';
import {BiomeRegistry} from '../dist/engine/biome-registry.js';
const descriptor=(id,key,biomes=[])=>({id,url:`https://local.test/packs/${id}.js`,dimensions:[{key,capabilities:['biomes']}],biomes});
const biome=key=>({key,zh:key,en:key,color:'#123456'});
test('optional provider failures isolate capabilities; retry preserves successful modules and palettes',async()=>{
  const registry=new BiomeRegistry(),calls=[],healthy={apiVersion:1,sampleBiomes:()=>[3],cache:new Map([['kept',42]])};let failed=true;
  const installed=await loadProviders({registry,descriptors:[descriptor('healthy','overworld',[biome('test:a')]),descriptor('broken','twilight',[biome('test:b')])],importer:async url=>{calls.push(url);if(url.includes('broken')&&failed)throw new Error('missing file');return {provider:healthy};}});
  assert.equal(findProvider(installed,'end','sampleBiomes'),undefined);
  assert.equal(findProvider(installed,'overworld','sampleBiomes'),healthy);
  assert.throws(()=>findProvider(installed,'twilight','sampleBiomes'),/broken/);
  assert.equal(findProvider(installed,'twilight','predictStructures'),undefined);
  failed=false;assert.deepEqual(await retryProviders(installed),[]);
  assert.equal(calls.filter(u=>u.includes('healthy')).length,1);assert.match(calls.at(-1),/retry=1/);
  assert.equal(healthy.cache.get('kept'),42);assert.equal(registry.indices.length,2);
  assert.equal(findProvider(installed,'twilight','sampleBiomes'),healthy);
});
test('invalid palettes commit nothing and cannot contaminate later packs',async()=>{
  const registry=new BiomeRegistry();let imports=0;
  const installed=await loadProviders({registry,descriptors:[descriptor('bad','twilight',[biome('test:valid'),biome('bad key')]),descriptor('good','overworld',[biome('test:valid')])],importer:async()=>{imports++;return {provider:{apiVersion:1,sampleBiomes(){}}};}});
  assert.equal(registry.indices.length,1);assert.equal(imports,1);assert.throws(()=>findProvider(installed,'twilight','sampleBiomes'),/bad/);
  assert.equal((await retryProviders(installed)).length,1);assert.equal(imports,1);
});
test('a module missing a declared method fails only its own pack',async()=>{
  const installed=await loadProviders({registry:new BiomeRegistry(),descriptors:[descriptor('missing','moon')],importer:async()=>({provider:{apiVersion:1}})});
  assert.throws(()=>findProvider(installed,'moon','sampleBiomes'),/method missing/);
  assert.equal(findProvider(installed,'end','sampleBiomes'),undefined);
});
