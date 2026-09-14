import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createDungeonPredictor} from '../dist/engine/dungeons.js';
import {rwgStructures} from '../dist/engine/rwg-structures.js';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
import {configureSelection} from './rwg-profile.mjs';
import * as caves from '../private-packs/cave-browser/selection.js';
import * as terrain from '../private-packs/rwg-terrain-browser/selection.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const oracle=await json('private-packs/runtime-session/cave-oracle.json'),profile=await json('private-packs/cave-browser/profile.json');
const report={caveChunks:0,caveCells:0,queries:0,dungeons:0,nearbyStructures:0,hashes:{}};
for(const s of oracle.masks) {
  caves.configure(s.seed);const mask=Buffer.from(caves.mask(s.cx,s.cz));
  assert.equal(createHash('sha256').update(mask).digest('hex'),s.sha256,JSON.stringify(s));
  report.caveChunks++;report.caveCells+=mask.length;
}
const reference=await json('private-packs/runtime-session/dungeon-reference.json');assert.equal(reference.complete,true);
const rwg=await json('private-packs/rwg-terrain-browser/profile.json'),manifest=await json('private-packs/rwg-terrain-browser/manifest.json'),config=await json('dist/environment.json');
const predict=createDungeonPredictor(caves,profile,(x,z)=>terrain.rawHeight(x,z),{yieldTask:async()=>{}});
const classic=new Set(['STRONGHOLD','MINESHAFT','VILLAGE']);
const order=values=>values.map(({kind,subtype,x,z})=>({kind,subtype,x,z})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.z-b.z||a.x-b.x);
for(let i=0;i<reference.cases.length;i+=2) {
  const {query:q,response}=reference.cases[i],near=reference.cases[i+1];
  configureSelection(terrain,rwg,manifest.inputClasses['rwg/world/ChunkManagerRealistic'],q.seed);
  const query={seed:q.seed,dimension:'overworld',config,bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height}};
  const nearby=(await rwgStructures({...query,bounds:{minX:near.query.x,minZ:near.query.z,maxX:near.query.x+near.query.width,maxZ:near.query.z+near.query.height}},(x,z)=>terrain.villageViable(x,z))).filter(m=>classic.has(m.kind));
  assert.deepEqual(order(nearby),order(near.response.structures.filter(m=>classic.has(m.kind))),near.query.id);
  const actual=await predict(query,nearby);
  assert.deepEqual(order(actual),order(response.structures),q.id);
  report.queries++;report.dungeons+=actual.length;report.nearbyStructures+=nearby.length;
  console.log(`Matched ${q.id}: ${actual.length} candidates`);
}
assert.ok(report.dungeons>0);
// Verify the installed provider's own margin query, including a split through a chunk.
const provider=createRwgProvider(terrain,rwg,{}, {caveEngine:caves,dungeonProfile:profile,yieldTask:async()=>{}});
const first=reference.cases[0].query,q={seed:first.seed,dimension:'overworld',config,bounds:{minX:first.x,minZ:first.z,maxX:first.x+first.width,maxZ:first.z+first.height}};
const only=values=>values.filter(v=>v.kind==='VANILLA_SPAWNER_DUNGEON');
const full=only(await provider.predictStructures(q));assert.deepEqual(order(full),order(reference.cases[0].response.structures));
const split=q.bounds.minX+251,left=only(await provider.predictStructures({...q,bounds:{...q.bounds,maxX:split}})),right=only(await provider.predictStructures({...q,bounds:{...q.bounds,minX:split}}));
assert.deepEqual(order([...left,...right]),order(full));report.providerQueries=3;
for(const file of ['dist/engine/dungeons.js','dist/engine/rwg-provider.js','dist/engine/rwg-structures.js','dist/engine/random.js','dist/environment.json',
  'private-packs/cave-browser/selection.js','private-packs/cave-browser/profile.json','private-packs/runtime-session/cave-oracle.json','private-packs/runtime-session/dungeon-reference.json','private-packs/rwg-terrain-browser/selection.js','private-packs/rwg-terrain-browser/profile.json'])
  report.hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/dungeon-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,hashes:undefined}));
