import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {XstrRandom,oreSelectionSeed,createProspectingProvider,validateProspectingProfile,fluidAmounts} from '../dist/engine/prospecting.js';
const ore={id:'ore.test',name:'Test',materials:'A',minY:4,maxY:40,color:'#123456'};
const profile={schemaVersion:1,orePattern:'EQUAL_SPACING',ores:{a:ore},dimensions:[{id:0,oreChance:100,ores:[{weight:1,display:'a'}],fluidWeight:1,fluids:[{weight:1,minRoot:10,drawBound:20,display:{id:'oil',name:'Oil',color:'#000000'}}]}]};
const query={seed:'9007199254740993',dimension:'overworld',bounds:{minX:-257,minZ:-129,maxX:255,maxZ:383},mode:'ORES'};
test('XSTR and signed-byte hashes replay independent original JVM fixtures',async()=>{
 const rows=JSON.parse(await readFile(new URL('fixtures/xstr.json',import.meta.url),'utf8'));let r,previous;
 for(const [seed,i,bound,value,double,float,hash] of rows){
  if(seed!==previous){r=new XstrRandom(seed);previous=seed;}
  assert.equal(r.nextInt(1000),Number(bound));assert.equal(r.nextLong().toString(),value);assert.equal(r.nextDouble(),Number(double));assert.equal(r.nextFloat(),Math.fround(Number(float)));
  assert.equal(oreSelectionSeed(BigInt.asIntN(64,BigInt(seed)+BigInt(i))).toString(),hash);
 }
});
test('negative partial bounds cover intersecting ore chunks and fluid fields; split queries agree',async()=>{
 const p=createProspectingProvider(profile,{overworld:0});
 const sort=a=>[...new Map(a.map(d=>[`${d.x}:${d.z}`,d])).values()].sort((a,b)=>a.z-b.z||a.x-b.x);
 for(const mode of ['ORES','FLUID']){
  const full=await p.predictResources({...query,mode});
  const left=await p.predictResources({...query,mode,bounds:{...query.bounds,maxX:-3}});
  const right=await p.predictResources({...query,mode,bounds:{...query.bounds,minX:-3}});
  assert.deepEqual(sort([...left,...right]),sort(full));assert.ok(full.length>0);
  if(mode==='ORES')assert.ok(full.some(d=>d.x<0)&&full.every(d=>(((d.x-8)/16)%3+3)%3===1));
  else assert.equal(full[0].x,-384);
 }
});
test('GT fluid selection retains inclusive zero-weight entries and invisible ore candidates',async()=>{
 const altered=structuredClone(profile);altered.dimensions[0].fluids.unshift({weight:0,minRoot:0,drawBound:1,display:null});
 altered.dimensions[0].ores=[{weight:1,display:null}];
 const p=createProspectingProvider(altered,{overworld:0});
 assert.deepEqual(await p.predictResources({...query,mode:'FLUID',seed:'0',bounds:{minX:0,minZ:0,maxX:1,maxZ:1}}),[]);
 assert.deepEqual(await p.predictResources(query),[]);
});
test('provider isolates seeds and profile edits, rejects changed dimension IDs and supports cancellation',async()=>{
 const source=structuredClone(profile),controller=new AbortController();
 const p=createProspectingProvider(source,{overworld:0});const first=await p.predictResources(query);
 source.dimensions[0].ores=[];await p.predictResources({...query,seed:'-1'});assert.deepEqual(await p.predictResources(query),first);
 assert.equal(await p.predictResources({...query,dimension:'unknown'}),null);
 await assert.rejects(p.predictResources({...query,config:{dimensionIds:{overworld:1}}}),/ID/);
 const interrupt=createProspectingProvider(profile,{overworld:0},{now:(()=>{let n=0;return()=>n+=20;})(),yieldTask:async()=>controller.abort()});
 await assert.rejects(interrupt.predictResources(query,{signal:controller.signal}),/CANCELLED/);
 await assert.rejects(p.predictResources({...query,seed:'9223372036854775808'}));
});
test('malformed profiles and excessive result areas are rejected',async()=>{
 const bad=structuredClone(profile);bad.dimensions.push(bad.dimensions[0]);assert.throws(()=>validateProspectingProfile(bad));
 const p=createProspectingProvider(profile,{overworld:0});await assert.rejects(p.predictResources({...query,bounds:{minX:0,minZ:0,maxX:30000000,maxZ:30000000}}));
 await assert.rejects(p.predictResources({...query,bounds:{minX:0,minZ:0,maxX:1,maxZ:2000000}}),/区块过多/);
 assert.throws(()=>new XstrRandom(0).nextInt(0));
});
test('fluid float multiplication saturates like a Java int cast',()=>{
 const amounts=fluidAmounts({minRoot:1e8,drawBound:1},new XstrRandom(0));
 assert.equal(amounts.length,64);assert.ok(amounts.every(v=>v===322122));
});
