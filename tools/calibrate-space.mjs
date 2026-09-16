import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {regionalSpaceStructures} from '../dist/engine/space-structures.js';
const root=new URL('../',import.meta.url),file='private-packs/runtime-session/space-reference.json';
const ref=JSON.parse(await readFile(new URL(file,root),'utf8'));assert.equal(ref.complete,true);
const keys={100:'deep_dark',92:'anubis',93:'horus'},report={queries:0,matched:0,byKind:{},hashes:{}};
const order=a=>a.map(({kind,subtype,x,z})=>({kind,subtype,x,z})).sort((a,b)=>a.z-b.z||a.x-b.x);
for(const {query:q,response:r} of ref.cases){
  const query={seed:q.seed,dimension:keys[q.dimension],bounds:{minX:q.x,minZ:q.z,maxX:q.x+q.width,maxZ:q.z+q.height}};
  const got=regionalSpaceStructures(query);assert.deepEqual(order(got),order(r.structures),q.id);
  const split=q.x+513,a=regionalSpaceStructures({...query,bounds:{...query.bounds,maxX:split}}),b=regionalSpaceStructures({...query,bounds:{...query.bounds,minX:split}});
  assert.deepEqual(order([...a,...b]),order(got));report.queries++;report.matched+=got.length;
  for(const m of got)report.byKind[m.kind]=(report.byKind[m.kind]||0)+1;
}
for(const path of [file,'dist/engine/space-structures.js','dist/engine/random.js'])report.hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
await writeFile(new URL('private-packs/runtime-session/space-validation.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,hashes:undefined}));
