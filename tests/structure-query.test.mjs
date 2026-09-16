import test from 'node:test';
import assert from 'node:assert/strict';
import {collectStructureView} from '../dist/engine/structure-query.js';
import {predictStructures} from '../dist/engine/native.js';
const encode=a=>a.map(m=>`${m.kind}:${m.subtype}:${m.x}:${m.z}`).sort();
test('bounded structure batches match whole queries across negative and unaligned region edges',async()=>{
  for(const dimension of ['overworld','nether','moon','end']) {
    const q={seed:'9007199254740993',dimension,bounds:{minX:-2101,minZ:-1025,maxX:2311,maxZ:1233}};
    const full=predictStructures(q).filter(m=>m.x>=q.bounds.minX&&m.x<q.bounds.maxX&&m.z>=q.bounds.minZ&&m.z<q.bounds.maxZ);
    const result=await collectStructureView(async(action,q)=>predictStructures(q),q);
    assert.deepEqual(encode(result.items),encode(full),dimension);assert.equal(result.truncated,false);
  }
});
test('large structure views respect provider limits; export filtering stops the scan at its limit',async()=>{
  const q={seed:'0',dimension:'moon',bounds:{minX:0,minZ:0,maxX:15360,maxZ:7200}};
  const result=await collectStructureView(async(action,q)=>{
    assert.equal(action,'predictStructures');assert.ok((q.bounds.maxX-q.bounds.minX)*(q.bounds.maxZ-q.bounds.minZ)<=1048576);
    return predictStructures(q);
  },q,{centreFirst:true});
  assert.ok(result.items.length>0);assert.equal(result.truncated,false);
  let calls=0;
  const limited=await collectStructureView(async(action,q)=>{calls++;return [{kind:'DROP',x:1,z:1},{kind:'KEEP',x:2,z:2},{kind:'KEEP',x:2,z:2},{kind:'KEEP',subtype:'other',x:2,z:2}];},q,{limit:2,select:a=>a.filter(m=>m.kind==='KEEP')});
  assert.equal(calls,1);assert.equal(limited.items.length,2);assert.equal(limited.truncated,true);
});
test('cancelled structure batches publish nothing late and launch no further regions',async()=>{
  let cancelled=false,calls=0;
  await assert.rejects(collectStructureView(async()=>{calls++;cancelled=true;return [];},{bounds:{minX:0,minZ:0,maxX:4096,maxZ:4096}},{isCancelled:()=>cancelled,onBatch:()=>assert.fail('late batch')}),/CANCELLED/);
  assert.equal(calls,1);
});
