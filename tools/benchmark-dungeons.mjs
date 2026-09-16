// Local calibrated packs only. Measures computation, not browser latency.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createDungeonPredictor} from '../dist/engine/dungeons.js';
import {configureSelection} from './rwg-profile.mjs';
import * as caves from '../private-packs/cave-browser/selection.js';
import * as terrain from '../private-packs/rwg-terrain-browser/selection.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const profile=await json('private-packs/cave-browser/profile.json'),rwg=await json('private-packs/rwg-terrain-browser/profile.json');
const manifest=await json('private-packs/rwg-terrain-browser/manifest.json'),ref=await json('private-packs/runtime-session/dungeon-reference.json');
const r=ref.cases[0],q={seed:r.query.seed,dimension:'overworld',bounds:{minX:r.query.x,minZ:r.query.z,maxX:r.query.x+r.query.width,maxZ:r.query.z+r.query.height}};
const order=v=>v.map(({kind,subtype,x,z})=>({kind,subtype,x,z})).sort((a,b)=>a.z-b.z||a.x-b.x);
const report={scope:'Node computation only; one saved 512 x 512 instance sample; cold runs include different JIT warmup',query:q,runs:[],hashes:{}};
for(const resultCacheLimit of [0,65536]){
  configureSelection(terrain,rwg,manifest.inputClasses['rwg/world/ChunkManagerRealistic'],q.seed);
  let masks=0,heights=0;
  const p=createDungeonPredictor({configure:caves.configure,mask(x,z){masks++;return caves.mask(x,z);}},profile,(x,z)=>{heights++;return terrain.rawHeight(x,z);},{resultCacheLimit,yieldTask:async()=>{}});
  for(const phase of ['cold','repeat']){
    masks=0;heights=0;const t=performance.now(),out=await p(q,ref.cases[1].response.structures);
    const ms=Math.round((performance.now()-t)*100)/100;
    assert.deepEqual(order(out),order(r.response.structures));
    if(resultCacheLimit&&phase==='repeat'){assert.equal(masks,0);assert.equal(heights,0);}
    const run={resultCacheLimit,phase,ms,masks,heights,candidates:out.length};report.runs.push(run);console.log(JSON.stringify(run));
  }
}
for(const path of ['dist/engine/dungeons.js','private-packs/cave-browser/selection.js','private-packs/rwg-terrain-browser/selection.js'])
  report.hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
await mkdir(new URL('.test-work/',root),{recursive:true});
await writeFile(new URL('.test-work/dungeon-benchmark.json',root),JSON.stringify(report,null,2));
