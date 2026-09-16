import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinateDestination} from '../dist/theme-ui.js';
import {resourceMatches,resourcePoints} from '../dist/engine/resources.js';
import {collectResourceView} from '../dist/engine/resource-query.js';

test('editing one map axis preserves the other camera coordinate and rejects partial or invalid input',()=>{
  const centre={x:12.75,z:-99.125};
  assert.deepEqual(coordinateDestination('x','-29999000',centre),{x:-29999000,z:-99.125});
  assert.deepEqual(coordinateDestination('z','29999000',centre),{x:12.75,z:29999000});
  for(const raw of ['', ' ', '1.5', '1e3', '12px', '30000000','-30000000'])assert.equal(coordinateDestination('x',raw,centre),null);
  assert.deepEqual(centre,{x:12.75,z:-99.125});
});

test('multiple deselected resources are excluded before the map limit and from fluid exports',async()=>{
  const ore={kind:'ORE_VEIN',name:'Ore',minY:20,maxY:40,x:8,z:8};
  const filter={excludedIds:['iron','copper']};
  for(const id of filter.excludedIds)assert.equal(resourceMatches({...ore,id},filter),false);
  assert.equal(resourceMatches({...ore,id:'tin'},filter),true);
  let calls=0;
  const result=await collectResourceView(async(_,q)=>{calls++;return [{...ore,x:q.bounds.minX+8,id:calls===1?'iron':'tin'}];},
    {bounds:{minX:0,minZ:0,maxX:2048,maxZ:512}}, {limit:1,select:values=>values.filter(d=>resourceMatches(d,filter))});
  assert.equal(calls,2);assert.equal(result.items[0].id,'tin');assert.equal(result.truncated,false);
  const fields=['oil','gas'].map((id,i)=>({id,name:id,kind:'FLUID_FIELD',x:i*128,z:0,amounts:Array(64).fill(100)}));
  const points=resourcePoints(fields,{excludedIds:['oil'],fluidChunks:'best'},{minX:0,minZ:0,maxX:256,maxZ:128});
  assert.equal(points.length,1);assert.equal(points[0].id,'gas');
});
