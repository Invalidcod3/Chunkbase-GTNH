import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDungeonView,DUNGEON_KIND} from '../dist/engine/dungeon-query.js';
const query={seed:'0',dimension:'overworld',bounds:{minX:-300,minZ:-300,maxX:700,maxZ:700}};
test('dungeon scans publish small central regions first, cover negative bounds, and discard unrelated records',async()=>{
  const queries=[],progress=[];
  const result=await collectDungeonView(async(action,q)=>{
    assert.equal(action,'predictStructures');queries.push(q);
    const m={kind:DUNGEON_KIND,x:q.bounds.minX,z:q.bounds.minZ,subtype:'20'};
    return [m,{...m},{...m,x:q.bounds.maxX},{...m,kind:'VILLAGE'}];
  },query,{onBatch:(items,p)=>progress.push({...p,length:items.length})});
  assert.deepEqual(queries[0].bounds,{minX:0,minZ:0,maxX:256,maxZ:256});
  assert.ok(queries.every(q=>q.structureGroup==='dungeons'&&q.bounds.maxX-q.bounds.minX<=256&&q.bounds.maxZ-q.bounds.minZ<=256));
  assert.equal(queries.reduce((sum,q)=>sum+(q.bounds.maxX-q.bounds.minX)*(q.bounds.maxZ-q.bounds.minZ),0),1000000);
  assert.equal(result.items.length,25);assert.equal(progress.at(-1).scanned,25);assert.equal(result.truncated,false);
});
test('dungeon cancellation stops before the next region and limits stop scanning',async()=>{
  let cancelled=false,calls=0;
  const request=async(a,q)=>{calls++;return [{kind:DUNGEON_KIND,x:q.bounds.minX,z:q.bounds.minZ}];};
  await assert.rejects(collectDungeonView(request,query,{isCancelled:()=>cancelled,onBatch:()=>cancelled=true}),/CANCELLED/);assert.equal(calls,1);
  calls=0;const result=await collectDungeonView(request,query,{limit:2});assert.equal(calls,2);assert.equal(result.items.length,2);assert.equal(result.truncated,true);
});
