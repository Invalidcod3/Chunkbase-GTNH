import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {predictStructures} from '../dist/engine/native.js';
import {rwgStructures} from '../dist/engine/rwg-structures.js';
import {configureSelection} from './rwg-profile.mjs';
const root=new URL('../',import.meta.url);
const json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const reference=await json('private-packs/runtime-session/remaining-reference.json');
assert.equal(reference.complete,true);
const engine=await import('../private-packs/rwg-terrain-browser/selection.js');
const profile=await json('private-packs/rwg-terrain-browser/profile.json'),manifest=await json('private-packs/rwg-terrain-browser/manifest.json');
const config=await json('dist/environment.json');
// This check covers the newly ported kinds and mineshafts. Stronghold biome adjustment
// is outside this calibration; vanilla Nether fortresses are absent from Worker responses.
const supported=new Set(['VILLAGE','MINESHAFT','LOOTGAMES_DUNGEON','TINKERS_SLIME_ISLAND','AE2_METEORITE','AUTOMAGY_NETHER_SPIRE']);
const canonical=markers=>markers.filter(m=>supported.has(m.kind)).map(({kind,subtype='',x,z,certainty})=>({kind,subtype,x,z,certainty})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.z-b.z||a.x-b.x);
const report={cases:0,matched:0,byKind:{},hashes:{}};
for(const {query:q,response} of reference.cases.filter(c=>c.query.command==='structures')) {
  const query={seed:q.seed,dimension:q.dimension===0?'overworld':'nether',bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height},config};
  let actual;
  if(q.dimension===0) {
    configureSelection(engine,profile,manifest.inputClasses['rwg/world/ChunkManagerRealistic'],q.seed);
    actual=await rwgStructures(query,(x,z)=>engine.villageViable(x,z));
  }else actual=predictStructures(query);
  const expected=canonical(response.structures);
  assert.deepEqual(canonical(actual),expected,q.id);
  report.cases++;report.matched+=expected.length;
  for(const m of expected)report.byKind[m.kind]=(report.byKind[m.kind]||0)+1;
}
assert.ok(report.byKind.VILLAGE>0&&report.byKind.AUTOMAGY_NETHER_SPIRE>0);
for(const path of ['dist/environment.json','dist/engine/native.js','dist/engine/mod-structures.js','dist/engine/rwg-structures.js','dist/engine/random.js','private-packs/rwg-terrain-browser/selection.js','private-packs/rwg-terrain-browser/profile.json','private-packs/runtime-session/remaining-reference.json'])
  report.hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/live-structures-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,hashes:undefined}));
