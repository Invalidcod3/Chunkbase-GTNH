import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {selectAsteroid,chaosExcludes,freshIslandExcludes,validateAsteroidProfile,createAsteroidProvider,asteroidKinds} from '../dist/engine/asteroids.js';
import {islandInRegion} from '../dist/engine/end.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const profile=validateAsteroidProfile(await json('private-packs/runtime-session/asteroid-profile.json'));
const oracle=await json('private-packs/runtime-session/asteroid-oracle.json');
const report={selection:oracle.selection.length,selected:0,byKind:{},islands:oracle.islands.length,chaos:oracle.chaos.length,freshExclusions:oracle.freshExclusions.length,liveQueries:0,liveMarkers:0,hashes:{}};
for(const s of oracle.selection) {
  const actual=selectAsteroid(BigInt(s.seed),s.cx,s.cz,profile);
  assert.deepEqual(actual,s.result,JSON.stringify({...s,result:undefined}));
  if(actual){report.selected++;report.byKind[actual.kind]=(report.byKind[actual.kind]||0)+1;}
}
for(const s of oracle.islands) {
  const i=islandInRegion(BigInt(s.seed),s.rx,s.rz);
  assert.deepEqual(i?{cx:i.cx,cz:i.cz}:null,s.result);
}
for(const s of oracle.chaos)assert.equal(chaosExcludes(s.cx,s.cz,profile),s.excluded,JSON.stringify(s));
for(const s of oracle.freshExclusions)assert.equal(freshIslandExcludes(BigInt(s.seed),s.cx,s.cz),s.excluded,JSON.stringify(s));
assert.ok(oracle.freshExclusions.some(s=>s.excluded));
assert.ok(Object.values(asteroidKinds).every(k=>report.byKind[k]>0));
const reference=await json('private-packs/runtime-session/asteroid-reference.json');assert.equal(reference.complete,true);
const provider=createAsteroidProvider(profile),kinds=new Set(Object.values(asteroidKinds));
const canonical=values=>values.filter(v=>kinds.has(v.kind)).map(({kind,x,z})=>({kind,x,z})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.z-b.z||a.x-b.x);
for(const {query:q,response} of reference.cases) {
  const actual=canonical(await provider.predictStructures({seed:q.seed,dimension:'end',bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height}}));
  assert.deepEqual(actual,canonical(response.structures),q.id);
  report.liveQueries++;report.liveMarkers+=actual.length;
}
assert.ok(report.liveMarkers>0);
for(const file of ['dist/engine/asteroids.js','dist/engine/end.js','dist/engine/native.js','dist/engine/random.js','dist/engine/prospecting.js',
    'private-packs/runtime-session/asteroid-profile.json','private-packs/runtime-session/asteroid-oracle.json','private-packs/runtime-session/asteroid-reference.json'])
  report.hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/asteroid-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,hashes:undefined}));
