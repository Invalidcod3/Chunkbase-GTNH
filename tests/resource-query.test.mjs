import test from 'node:test';
import assert from 'node:assert/strict';
import {collectResourceView} from '../dist/engine/resource-query.js';
import {createProspectingProvider} from '../dist/engine/prospecting.js';
import {resourcePoints} from '../dist/engine/resources.js';
import {MapView} from '../dist/map.js';

const profile={schemaVersion:1,orePattern:'EQUAL_SPACING',ores:{a:{id:'ore.test',name:'Test',materials:'A',minY:4,maxY:40,color:'#123456'}},dimensions:[{id:0,oreChance:100,ores:[{weight:1,display:'a'}],fluidWeight:1,fluids:[{weight:1,minRoot:10,drawBound:20,display:{id:'oil',name:'Oil',color:'#000000'}}]}]};
const provider=createProspectingProvider(profile,{overworld:0},{yieldTask:async()=>{}});
const query={seed:'9007199254740993',dimension:'overworld',bounds:{minX:-1027,minZ:-517,maxX:1451,maxZ:1091},mode:'ORES'};
const order=a=>[...a].sort((a,b)=>a.z-b.z||a.x-b.x);
const call=async(action,q)=>{assert.equal(action,'predictResources');return provider.predictResources(q);};

test('large and zoomed-out resource views use bounded requests and stop at a visible density limit',async()=>{
  for(const [width,height,scale] of [[1920,900,.25],[1280,600,.125],[3840,2000,.03125]]) {
    const bounds=MapView.prototype.bounds.call({world:MapView.prototype.world,x:1900,z:0,width,height,scale});
    let calls=0;
    const result=await collectResourceView(async(action,q)=>{
      calls++;assert.ok((q.bounds.maxX-q.bounds.minX)*(q.bounds.maxZ-q.bounds.minZ)<=1048576);
      return call(action,q);
    },{...query,bounds},{limit:1000,centreFirst:true});
    assert.equal(result.items.length,1000);assert.equal(result.truncated,true);assert.ok(calls<10);
  }
});

test('ore and fluid batching agrees with an unsplit query across zero and unaligned edges',async()=>{
  for(const mode of ['ORES','FLUID']) {
    const q={...query,mode},original=await provider.predictResources(q);
    const result=await collectResourceView(call,q);
    const expected=mode==='ORES'?original.filter(d=>d.x>=q.bounds.minX&&d.x<q.bounds.maxX&&d.z>=q.bounds.minZ&&d.z<q.bounds.maxZ):original;
    assert.deepEqual(order(result.items),order(expected));assert.equal(result.truncated,false);
    assert.equal(new Set(result.items.map(d=>`${d.x}:${d.z}`)).size,result.items.length);
  }
});

test('fluid export applies initial production thresholds before the limit, preserves boundary centres and stops scanning',async()=>{
  const q={...query,mode:'FLUID'},filter={text:'oil',minimum:1};
  let calls=0;
  const result=await collectResourceView(async(...args)=>{calls++;return call(...args);},q,{limit:17,select:values=>resourcePoints(values,filter,q.bounds)});
  assert.equal(result.items.length,17);assert.ok(calls<=3);assert.equal(result.truncated,true);
  assert.ok(result.items.every(d=>d.amount>=1&&d.source==='INITIAL'&&d.x>=q.bounds.minX&&d.z>=q.bounds.minZ));
  const full=await collectResourceView(call,q,{limit:20000,select:values=>resourcePoints(values,filter,q.bounds)});
  assert.deepEqual(order(full.items),order(resourcePoints(await provider.predictResources(q),filter,q.bounds)));
});

test('obsolete viewport results are discarded without starting another batch or invoking progress',async()=>{
  let cancelled=false,calls=0,progress=0;
  await assert.rejects(collectResourceView(async(...args)=>{calls++;const result=await call(...args);cancelled=true;return result;},query,{isCancelled:()=>cancelled,onBatch:()=>progress++}),/CANCELLED/);
  assert.equal(calls,1);assert.equal(progress,0);
});

test('uninstalled resource layers remain distinct from empty predictions; failures never become empty success',async()=>{
  let calls=0;
  const absent=await collectResourceView(async()=>{calls++;return null;},query);
  assert.equal(absent.available,false);assert.equal(calls,1);
  const empty=await collectResourceView(async()=>[],query);assert.equal(empty.available,true);assert.deepEqual(empty.items,[]);
  await assert.rejects(collectResourceView(async()=>{throw new Error('broken pack');},query),/broken pack/);
});
