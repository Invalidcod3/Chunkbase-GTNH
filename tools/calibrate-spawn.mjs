import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
import {createSpawnPredictor} from '../dist/engine/spawn.js';
import {SPAWN_PROVIDERS} from '../dist/engine/navigation.js';
import * as engine from '../private-packs/spawn-browser/selection.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const profile=await json('private-packs/rwg-terrain-browser/profile.json'),spawnProfile=await json('private-packs/spawn-browser/profile.json');
assert.equal(profile.observedManagerSha256,'90bc27fc385404b9ee36903d1b61f18512c38b37b4a93810df9238615680756e','Review findBiomePosition for changed RWG manager');
const reference=await json('private-packs/spawn-browser/reference.json');
const report={scope:'Copied desktop RwgChunkBiomeReplay and SpawnSearch on JVM, original captured surface/map/cave instructions, compared with browser seed-only prediction; excludes saved-world/population accuracy',status:'ESTIMATED',chunks:0,columns:0,queries:0,mismatches:0,searches:[],hashes:{}};
let seed;
for(const r of reference.chunks){if(seed!==r.seed){engine.configureSeed(r.seed);seed=r.seed;}assert.deepEqual(Array.from(engine.surfaces(...r.chunk)),r.surfaces,JSON.stringify([r.seed,r.chunk]));report.chunks++;report.columns+=256;}
for(const bop of [false,true]){
 const predict=createSpawnPredictor({...spawnProfile,provider:bop?SPAWN_PROVIDERS.bop:SPAWN_PROVIDERS.vanilla},()=>engine,{yieldTask:()=>Promise.resolve()});
 for(const r of reference.searches.filter(v=>v.bop===bop)){
  const q={seed:r.seed,dimension:'overworld'},start=performance.now(),got=await predict(q);
  assert.deepEqual([got.x,got.z,got.attempts,Number(got.viable)],r.result,r.seed+':'+bop);assert.equal(got.status,'ESTIMATED');assert.equal(got.y,undefined);
  assert.deepEqual(await predict(q),got);report.queries++;report.searches.push({seed:r.seed,provider:bop?'bop':'vanilla',x:got.x,z:got.z,moves:got.attempts,elapsedMs:Math.round(performance.now()-start)});
 }
}
// Routing through the real RWG provider must never configure or query its map engine.
const provider=createRwgProvider(new Proxy({},{get(){throw Error('Spawn touched map engine');}}),profile,{}, {spawnProfile,loadSpawnEngine:()=>engine,yieldTask:()=>Promise.resolve()});
const got=await provider.predictSpawn({seed:'0',dimension:'overworld'}),ref=reference.searches.find(v=>v.seed==='0'&&v.bop);
assert.deepEqual([got.x,got.z,got.attempts,Number(got.viable)],ref.result);
const manifest=await json('private-packs/spawn-browser/manifest.json');
manifest.validation='JVM desktop replay and search matched';manifest.validatedColumns=report.columns;manifest.validatedSearches=report.queries;
await writeFile(new URL('private-packs/spawn-browser/manifest.json',root),JSON.stringify(manifest,null,2));
for(const path of ['dist/engine/navigation.js','dist/engine/spawn.js','dist/engine/rwg-provider.js','dist/saved-spawn.js','tools/compile-spawn.py','tools/spawn-reference/SpawnSlice.java','tools/spawn-reference/SpawnMethods.java.fragment','tools/spawn-reference/RwgChunkBiomeReplay.java','tools/spawn-reference/SpawnSearch.java','tools/spawn-reference/DesktopReplayOracle.java','tools/spawn-reference/validation.json','private-packs/rwg-terrain-browser/selection.js','private-packs/rwg-terrain-browser/profile.json','private-packs/runtime-session/spawn-runtime-profile.json','private-packs/spawn-browser/selection.js','private-packs/spawn-browser/profile.json','private-packs/spawn-browser/reference.json','private-packs/spawn-browser/cpu-optimization.json'])report.hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/spawn-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({chunks:report.chunks,columns:report.columns,searches:report.queries,mismatches:0}));
