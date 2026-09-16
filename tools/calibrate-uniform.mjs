import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createUniformProvider} from '../dist/engine/uniform-provider.js';
import {BiomeRegistry} from '../dist/engine/biome-registry.js';
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const input=await read('private-packs/uniform-input/profile.json'),profile=await read('private-packs/uniform-browser/profile.json');
const registry=new BiomeRegistry();for(const b of profile.biomes)registry.register(b);
const provider=createUniformProvider(profile,{registry});let pixels=0;
assert.equal(input.dimensions.length,24);assert.equal(profile.dimensions.length,24);
for(const d of input.dimensions)for(const s of d.samples){
  const q={dimension:d.key,seed:'0',x:s.x,z:s.z,width:4,height:4,step:1};
  const values=provider.sampleBiomes(q);
  assert.deepEqual([...values].map(i=>registry.at(i).legacy[0].id),s.ids);pixels+=values.length;
  for(const seed of ['-17','9007199254740993','-9223372036854775808','9223372036854775807'])for(const step of [4,16,256])assert.deepEqual(provider.sampleBiomes({...q,seed,step}),values);
}
const hashes={};for(const p of ['dist/engine/uniform-provider.js','private-packs/uniform-input/profile.json','private-packs/uniform-browser/profile.json','tools/uniform-biomes/LiveCapture.java','tools/prepare-uniform-profile.py'])hashes[p]=createHash('sha256').update(await readFile(new URL(p,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/uniform-validation.json',root),JSON.stringify({dimensions:24,biomes:profile.biomes.length,pixels,mismatches:0,hashes},null,2));
console.log(`Constant biome pack matched ${pixels} live pixels across 24 dimensions; seed/stride invariance verified.`);
