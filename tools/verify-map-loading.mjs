// Requires the calibrated local packs. Verifies the new query paths, not browser latency.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
import {collectStructureView} from '../dist/engine/structure-query.js';
import {collectDungeonView,DUNGEON_KIND} from '../dist/engine/dungeon-query.js';
import * as twilight from '../private-packs/twilight-browser/selection.js';
import * as terrain from '../private-packs/rwg-terrain-browser/selection.js';
import * as caves from '../private-packs/cave-browser/selection.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const profile=await json('private-packs/twilight-browser/profile.json');
const keys=Object.fromEntries(Object.values(profile.biomes).map(b=>[b.id,String(b.id)]));
let calls=0;
const engine={...twilight,biomes(...args){calls++;return twilight.biomes(...args);}};
const make=()=>createTwilightProvider(engine,profile,keys,{registry:{get:key=>({index:Number(key)})},yieldTask:async()=>{}});
const report={scope:'local Node; saved instance samples; no browser timing',twilight:[],hashes:{}};
for(const x of [0,1536,-2048]) {
  const values=[];
  for(const [width,step] of [[128,4],[64,8]]){
    const p=make();calls=0;const start=performance.now();
    const data=await p.sampleBiomes({seed:'0',dimension:'twilight',x,z:0,width,height:width,step});
    values.push({data,width,step,calls,ms:Math.round((performance.now()-start)*100)/100});
  }
  for(let row=0;row<64;row++)for(let col=0;col<64;col++)assert.equal(values[1].data[row*64+col],values[0].data[row*2*128+col*2]);
  assert.equal(values[1].calls,4);
  report.twilight.push({x,samples:values.map(({data,...v})=>v)});console.log(JSON.stringify(report.twilight.at(-1)));
}
// Compare every sparse stride against the original per-point entry, with negative unaligned origins.
const p=make();let compared=0;
for(const step of [1,2,3,5,8,16,32,64,128,256]) {
  const q={seed:'0',dimension:'twilight',x:-517,z:-1031,width:19,height:17,step};
  const actual=await p.sampleBiomes(q),scale=step>=4?4:1;
  for(let row=0;row<q.height;row++)for(let col=0;col<q.width;col++){
    const expected=twilight.biomes(Math.floor((q.x+col*step)/scale),Math.floor((q.z+row*step)/scale),1,1,step>=4)[0];
    assert.equal(actual[row*q.width+col],expected);compared++;
  }
}
report.twilightSparsePixels=compared;
const canonical=values=>values.map(m=>`${m.kind}|${m.subtype}|${m.x}|${m.z}`).sort();
const tfq={seed:'0',dimension:'twilight',bounds:{minX:-2101,minZ:-1025,maxX:2311,maxZ:1233}};
const tfFull=await p.predictStructures(tfq),tfParts=await collectStructureView((_,q)=>p.predictStructures(q),tfq);
assert.deepEqual(canonical(tfParts.items),canonical(tfFull));report.twilightStructures=tfFull.length;
const rwg=await json('private-packs/rwg-terrain-browser/profile.json'),caveProfile=await json('private-packs/cave-browser/profile.json');
const surfaceProfile=await json('private-packs/runtime-session/surface-structure-profile.json'),config=await json('dist/environment.json');
const provider=createRwgProvider(terrain,rwg,{}, {surfaceProfile,caveEngine:caves,dungeonProfile:caveProfile,yieldTask:async()=>{}});
const reference=await json('private-packs/runtime-session/dungeon-reference.json'),first=reference.cases[0].query;
const q={seed:first.seed,dimension:'overworld',config,bounds:{minX:first.x,minZ:first.z,maxX:first.x+first.width,maxZ:first.z+first.height}};
const full=await provider.predictStructures(q);
assert.deepEqual(canonical(full.filter(m=>m.kind==='VANILLA_SPAWNER_DUNGEON')),canonical(reference.cases[0].response.structures));
let batches=0;
const parts=await collectStructureView((_,query)=>{batches++;return provider.predictStructures(query);},q);
assert.ok(batches>1);assert.deepEqual(canonical(parts.items),canonical(full));
report.rwgStructures={batches,markers:full.length,dungeons:full.filter(m=>m.kind==='VANILLA_SPAWNER_DUNGEON').length};
const standard=await collectStructureView((_,query)=>provider.predictStructures(query),{...q,excludedKinds:[DUNGEON_KIND]});
const dungeonParts=await collectDungeonView((_,query)=>provider.predictStructures(query),q);
assert.ok(standard.items.every(m=>m.kind!==DUNGEON_KIND));
assert.deepEqual(canonical([...standard.items,...dungeonParts.items]),canonical(full));
report.rwgStructures.independentGroupsMatch=true;
for(const path of ['dist/map.js','dist/app.js','dist/engine/worker.js','dist/engine/worker-client.js','dist/engine/structure-query.js','dist/engine/twilight-provider.js','dist/engine/dungeon-query.js','dist/engine/dungeons.js','dist/engine/rwg-provider.js'])
  report.hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
await mkdir(new URL('.test-work/',root),{recursive:true});
await writeFile(new URL('.test-work/map-loading-verification.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,hashes:undefined}));
