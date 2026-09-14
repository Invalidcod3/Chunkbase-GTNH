import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {surfaceStructures,validateSurfaceProfile} from '../dist/engine/surface-structures.js';
import {configureSelection} from './rwg-profile.mjs';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const profile=validateSurfaceProfile(await json('private-packs/runtime-session/surface-structure-profile.json'));
const reference=await json('private-packs/runtime-session/surface-reference.json');assert.equal(reference.complete,true);
const terrain=await json('private-packs/rwg-terrain-browser/profile.json'),manifest=await json('private-packs/rwg-terrain-browser/manifest.json');
const engine=await import('../private-packs/rwg-terrain-browser/selection.js');
const report={queries:reference.cases.length,matched:0,byKind:{},elapsedMs:0,hashes:{}};
const kinds=new Set(['ROGUELIKE_DUNGEON','THAUMCRAFT_AURA_NODE','THAUMCRAFT_ELDRITCH_ALTAR']);
const canonical=a=>a.filter(d=>kinds.has(d.kind)).map(({kind,subtype,x,z,certainty})=>({kind,subtype,x,z,certainty})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.z-b.z||a.x-b.x);
const start=performance.now();
for(let i=0;i<reference.cases.length;i+=2) {
 const {query:q,response:a}=reference.cases[i],b=reference.cases[i+1].response;
 configureSelection(engine,terrain,manifest.inputClasses['rwg/world/ChunkManagerRealistic'],q.seed);
 const chunks=new Map(),sample=(x,z)=>{const cx=Math.floor(x/16),cz=Math.floor(z/16),key=`${cx}:${cz}`;if(!chunks.has(key))chunks.set(key,Int32Array.from(engine.finalChunk(cx,cz)));return chunks.get(key)[(z-cz*16)*16+x-cx*16];};
 const actual=canonical(await surfaceStructures({seed:q.seed,dimension:'overworld',bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height}},sample,profile));
 const expected=canonical([...a.structures,...b.structures]);
 assert.deepEqual(actual,expected,q.id);
 for(const d of actual)report.byKind[d.kind]=(report.byKind[d.kind]||0)+1;
 report.matched+=actual.length;
 console.log(`Matched ${q.id}: ${actual.length} markers`);
}
assert.ok(report.byKind.ROGUELIKE_DUNGEON&&report.byKind.THAUMCRAFT_AURA_NODE&&report.byKind.THAUMCRAFT_ELDRITCH_ALTAR);
report.elapsedMs=Math.round(performance.now()-start);
for(const file of ['dist/engine/surface-structures.js','dist/engine/rwg-provider.js','dist/engine/random.js','private-packs/runtime-session/surface-structure-profile.json','private-packs/runtime-session/surface-reference.json','private-packs/rwg-terrain-browser/selection.js','private-packs/rwg-terrain-browser/profile.json'])
 report.hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/surface-structures-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,hashes:undefined}));
