import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import * as engine from '../private-packs/twilight-browser/selection.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const profile=await json('private-packs/twilight-browser/profile.json'),reference=await json('private-packs/runtime-session/twilight-reference.json');
assert.equal(reference.complete,true);
const keys=Object.fromEntries(Object.values(profile.biomes).map(b=>[b.id,String(b.id)]));
const provider=createTwilightProvider(engine,profile,keys,{registry:{get:key=>key?{index:Number(key)}:null},yieldTask:async()=>{}});
const report={queries:reference.cases.length,pixels:0,features:0,byType:{},hashes:{}};
const canonical=values=>values.map(({kind,subtype,x,z,certainty})=>({kind,subtype,x,z,certainty})).sort((a,b)=>a.z-b.z||a.x-b.x);
for(const {query:q,response} of reference.cases) {
  if(q.command==='biomes') {
    const actual=await provider.sampleBiomes({...q,dimension:'twilight'});assert.deepEqual(Array.from(actual),response.ids,q.id);report.pixels+=actual.length;
  } else {
    const actual=await provider.predictStructures({seed:q.seed,dimension:'twilight',bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height}});
    assert.deepEqual(canonical(actual),canonical(response.structures),q.id);report.features+=actual.length;
    for(const m of actual)report.byType[m.subtype]=(report.byType[m.subtype]||0)+1;
  }
}
assert.ok(report.features>0);
for(const file of ['dist/engine/twilight-provider.js','dist/engine/biome-raster-cache.js','private-packs/twilight-browser/selection.js','private-packs/twilight-browser/profile.json','private-packs/runtime-session/twilight-reference.json'])
  report.hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/twilight-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,hashes:undefined}));
