import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateAsteroidResources,selectAsteroidResource} from '../dist/engine/asteroid-resources.js';
import {validateResources} from '../dist/engine/resources.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const base='private-packs/runtime-session/';
const profile=validateAsteroidResources(await json(base+'asteroid-resource-profile.json'));
const receipt=await json(base+'asteroid-resource-receipt.json'),oracle=await json(base+'asteroid-resource-oracle.json');
const report={scope:'Desktop Java prefix with live initialized registries; seed-only, not generated blocks or saved End state',samples:0,selected:0,byDimension:{},byKind:{},mismatches:0,hashes:{...receipt.hashes}};
for(const [file,expected] of Object.entries(receipt.hashes))assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),expected,file);
for(const s of oracle.samples) {
  const d=profile.dimensions.find(d=>d.id===s.dimension);assert.ok(d);
  const result=selectAsteroidResource(BigInt(s.seed),s.dimension,s.cx,s.cz,d);
  assert.deepEqual(result,s.result,`${s.dimension}/${s.seed}/${s.cx}/${s.cz}`);
  report.samples++;
  if(result){validateResources([result],'ORES');report.selected++;report.byKind[result.kind]=(report.byKind[result.kind]||0)+1;report.byDimension[s.dimension]=(report.byDimension[s.dimension]||0)+1;}
}
assert.ok(report.samples>=10000&&report.byKind.ASTEROID_VEIN>0);
report.smallOreConfigured=profile.dimensions.some(d=>d.materials.some(m=>m.small.some(e=>e.weight>0)));
if(report.smallOreConfigured)assert.ok(report.byKind.ASTEROID_SMALL>0);
assert.equal(Object.keys(report.byDimension).length,profile.dimensions.length);
for(const file of ['dist/engine/asteroid-resources.js','dist/engine/asteroids.js','dist/engine/prospecting.js','dist/engine/resources.js','dist/engine/random.js',base+'asteroid-resource-receipt.json'])
  report.hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL(base+'asteroid-resource-validation.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,hashes:undefined}));
