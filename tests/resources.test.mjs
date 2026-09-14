import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResources,resourceMatches,resourcePoints} from '../dist/engine/resources.js';
import {drawResources,hitResource} from '../dist/resource-view.js';
import {resourceCsv} from '../dist/export.js';
const fluid={kind:'FLUID_FIELD',id:'test:oil',name:'Test oil',x:-128,z:-128,size:128,color:'#aabbcc',source:'INITIAL',amounts:Array.from({length:64},(_,i)=>i)};
const ore={kind:'ORE_VEIN',id:'test:ore',name:'Test vein',materials:'Iron, copper',x:-8,z:8,size:16,color:'#abcdef',minY:10,maxY:40,source:'PREDICTED'};
test('resource protocol distinguishes unavailable, empty and predictions; rejects save state',()=>{
  assert.equal(validateResources(null,'ORES'),null);assert.deepEqual(validateResources([],'FLUID'),[]);
  assert.deepEqual(validateResources([fluid],'FLUID'),[fluid]);assert.deepEqual(validateResources([ore],'ORES'),[ore]);
  for(const d of [{...fluid,source:'CURRENT/INITIAL'},{...fluid,currentAmounts:[true]},{...fluid,amounts:[1]},{...fluid,x:-127},{...fluid,color:'url(test)'},{...fluid,amounts:Array(64).fill(-1)},{...fluid,depleted:true}]) assert.throws(()=>validateResources([d],'FLUID'));
  assert.throws(()=>validateResources([ore,ore],'ORES'));assert.throws(()=>validateResources([{...ore,minY:256}],'ORES'));
  assert.throws(()=>validateResources([{...ore,icon:'https://example.test/image.png'}],'ORES'));
});
test('fluid values use x-major chunk indexing, threshold and half-open view bounds',()=>{
  const bounds={minX:-128,minZ:-128,maxX:0,maxZ:0},points=resourcePoints([fluid],{minimum:56},bounds);
  assert.equal(points.length,8);assert.deepEqual(points.map(p=>[p.x,p.z,p.amount]),Array.from({length:8},(_,z)=>[-8,z*16-120,56+z]));
  assert.equal(resourcePoints([fluid],{minimum:0},{minX:-128,minZ:-128,maxX:-120,maxZ:0}).length,0);
  assert.ok(resourceMatches(ore,{text:'COPPER'}));assert.ok(!resourceMatches(fluid,{text:'copper'}));
  const text=resourceCsv(points,{seed:'9007199254740993',dimension:'overworld',dimensionId:0});
  assert.match(text,/initial_l_per_op/);assert.match(text,/9007199254740993/);assert.match(text,/INITIAL/);
});
test('resource hit testing excludes filtered-out fluid cells and uses native negative coordinates',()=>{
  const view={scale:4,resourceFilter:{minimum:56},visibleResources:()=>[fluid]};
  assert.equal(hitResource(view,{x:-1,z:-1}),fluid);assert.equal(hitResource(view,{x:-128,z:-128}),null);assert.equal(hitResource(view,{x:0,z:-1}),null);
});
test('resource drawing preserves Amidst chunk values and filtered cell geometry',()=>{
  const labels=[],rects=[],c=new Proxy({}, {get(target,key){if(key in target)return target[key];return (...args)=>{if(key==='fillText')labels.push(args);if(key==='fillRect')rects.push(args);};}});
  const view={markerMode:'FLUID',scale:4,width:512,height:512,bounds:()=>({minX:-128,minZ:-128,maxX:0,maxZ:0}),resourceFilter:{minimum:56},visibleResources:()=>[fluid],screen:(x,z)=>({x:(x+128)*4,y:(z+128)*4})};
  drawResources(view,c);assert.equal(labels.filter(([text])=>text.endsWith(' L/Op')).length,8);
  assert.deepEqual(rects.slice(1),Array.from({length:8},(_,z)=>[448,z*64,64,64]));
});
