import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createExtraProvider} from '../dist/engine/extra-provider.js';
import * as engine from '../private-packs/space-browser/selection.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const profile=await json('private-packs/space-browser/runtime-profile.json'),biomes=await json('private-packs/space-browser/biomes.json');
const provider=createExtraProvider(engine,profile,Object.fromEntries(biomes.map(b=>[b.id,String(b.id)])),{registry:{get:key=>key===undefined?undefined:{index:Number(key)}},yieldTask:async()=>{}});
const report={biomeQueries:0,pixels:0,structureQueries:0,structures:0,byKind:{},hashes:{}};
const ref=await json('private-packs/runtime-session/space-biome-reference.json');assert.equal(ref.complete,true);
for(const {query:q,response:r} of ref.cases){
  const dimension=q.id.split(':')[0],got=await provider.sampleBiomes({...q,dimension});
  assert.deepEqual([...got],r.ids,q.id);report.biomeQueries++;report.pixels+=got.length;
}
for(const [dimension,file] of [['ross128b','ross-alias-reference.json'],['deep_dark','deep-dark-alias-reference.json']]){
  const response=await json('private-packs/runtime-session/'+file);assert.equal(response.ok,true);assert.equal(response.protocol,21);
  const q={seed:'9223372036854775807',dimension,x:-517,z:-1031,width:19,height:35,step:128};
  const got=await provider.sampleBiomes(q);assert.deepEqual([...got],response.ids,dimension+' canonical biome IDs');
  report.biomeQueries++;report.pixels+=got.length;
  report.hashes['private-packs/runtime-session/'+file]=createHash('sha256').update(await readFile(new URL('private-packs/runtime-session/'+file,root))).digest('hex');
}
report.hashes['tools/space-biome-aliases.json']=createHash('sha256').update(await readFile(new URL('tools/space-biome-aliases.json',root))).digest('hex');
console.log(`Matched ${report.biomeQueries} biome queries / ${report.pixels} pixels.`);
const order=a=>a.map(({kind,subtype,x,z})=>({kind,subtype:kind.startsWith('ASTEROID_BASE_')?'':subtype,x,z})).sort((a,b)=>a.z-b.z||a.x-b.x||a.kind.localeCompare(b.kind));
for(const file of ['space-reference.json','space-special-reference.json','asteroid-structure-reference.json']){
  const ref=await json('private-packs/runtime-session/'+file);assert.equal(ref.complete,true);
  for(const {query:q,response:r} of ref.cases){
    const dimension=Object.keys(profile.dimensions).find(k=>profile.dimensions[k].id===q.dimension),query={seed:q.seed,dimension,bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height}};
    // The desktop also returns arsenopyrite ore markers here. The Web exposes
    // these through its already calibrated general resource layer, not duplicate POIs.
    const expected=r.structures.filter(m=>m.kind!=='ROSS_128B_ARSENOPYRITE_VEIN');
    const got=await provider.predictStructures(query);assert.deepEqual(order(got),order(expected),q.id);
    // Offset split exercises odd asteroid bounds and ruin attempts spilling across chunks.
    const middle=q.x+513,left=await provider.predictStructures({...query,bounds:{...query.bounds,maxX:middle}}),right=await provider.predictStructures({...query,bounds:{...query.bounds,minX:middle}});
    assert.deepEqual(order([...left,...right]),order(got),q.id+' split');
    report.structureQueries++;report.structures+=got.length;for(const m of got)report.byKind[m.kind]=(report.byKind[m.kind]||0)+1;
    console.log(`Matched ${q.id}: ${got.length} structures`);
  }
}
assert.equal(Object.keys(report.byKind).length,9);
for(const path of ['dist/engine/biome-raster-cache.js','dist/engine/asteroid-structures.js','private-packs/runtime-session/asteroid-structure-reference.json'])report.hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
for(const path of ['dist/engine/extra-provider.js','dist/engine/space-structures.js','dist/engine/random.js','dist/engine/prospecting.js','private-packs/space-browser/selection.js','private-packs/space-browser/runtime-profile.json','private-packs/space-browser/profile.json','private-packs/space-browser/biomes.json','private-packs/runtime-session/space-biome-reference.json','private-packs/runtime-session/space-reference.json','private-packs/runtime-session/space-special-reference.json'])
  report.hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/extra-validation.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,hashes:undefined}));
