import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createProspectingProvider} from '../dist/engine/prospecting.js';
import {validateResources} from '../dist/engine/resources.js';
const root=new URL('../private-packs/runtime-session/',import.meta.url);
const profile=JSON.parse(await readFile(new URL('resource-profile.json',root),'utf8'));
const reference=JSON.parse(await readFile(new URL('resource-reference.json',root),'utf8'));
assert.equal(reference.complete,true,'Incomplete live capture');
const provider=createProspectingProvider(profile,Object.fromEntries(profile.dimensions.map(d=>[d.name,d.id])));
const report={cases:0,dimensions:[],ores:0,fluidFields:0,fluidCells:0,mismatches:0};
const dimensions=new Set();
function normalize(d,mode) {
  assert.ok(!d.depleted&&!d.currentAmounts?.some(Boolean),'Save state is not a prediction oracle');
  assert.equal(d.source,mode==='ORES'?'PREDICTED':'INITIAL');
  const color=typeof d.color==='number'?'#'+(d.color&0xffffff).toString(16).padStart(6,'0'):d.color;
  const basic={id:d.id,name:d.name,x:d.x,z:d.z,size:d.size,source:d.source,color};
  return mode==='ORES'?{...basic,materials:d.materials,minY:d.minY,maxY:d.maxY,icon:d.icon}:{...basic,amounts:d.amounts};
}
for(const {query:q,response} of reference.cases) {
  const dimension=profile.dimensions.find(d=>d.id===q.dimension).name;
  const result=validateResources(await provider.predictResources({seed:q.seed,dimension,mode:q.marker_mode,bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height}}),q.marker_mode);
  const expected=response.prospecting.deposits;
  assert.deepEqual(result.map(d=>normalize(d,q.marker_mode)),expected.map(d=>normalize(d,q.marker_mode)),q.id);
  report.cases++;dimensions.add(q.dimension);
  if(q.marker_mode==='ORES')report.ores+=result.length;
  else{report.fluidFields+=result.length;report.fluidCells+=result.length*64;}
}
report.dimensions=[...dimensions].sort((a,b)=>a-b);
assert.ok(report.cases>=100&&report.ores>0&&report.fluidFields>0,'Insufficient coverage');
report.hashes={};
for(const name of ['private-packs/runtime-session/resource-profile.json','private-packs/runtime-session/resource-reference.json','private-packs/runtime-session/resource-capture-receipt.json','dist/engine/prospecting.js','dist/engine/random.js','dist/engine/resources.js'])
  report.hashes[name]=createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex');
await writeFile(new URL('resource-validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,hashes:undefined}));
