import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ExportJob,exportBounds} from '../dist/export-job.js';
import {resourceMatches,resourcePoints} from '../dist/engine/resources.js';
import {collectResourceView} from '../dist/engine/resource-query.js';
import {collectStructureView} from '../dist/engine/structure-query.js';
import {strongholdLocations,rwgSpawn} from '../dist/engine/navigation.js';
import {predictStructures} from '../dist/engine/native.js';
import {readPreferences,writePreferences} from '../dist/preferences.js';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';

test('exact resource ID and overlapping Y filter apply before scan limits; best fluid chunks stay inside the export',async()=>{
  const ore={kind:'ORE_VEIN',id:'rare',name:'Rare',minY:20,maxY:40,x:8,z:8};
  assert.equal(resourceMatches(ore,{id:'rar'}),false);assert.equal(resourceMatches(ore,{minY:40,maxY:60}),true);assert.equal(resourceMatches(ore,{minY:41}),false);
  let calls=0;const result=await collectResourceView(async(_,q)=>{calls++;return [{...ore,x:q.bounds.minX+8,id:calls===1?'common':'rare'}];},{bounds:{minX:0,minZ:0,maxX:2048,maxZ:512}},{limit:1,select:values=>values.filter(d=>resourceMatches(d,{id:'rare'}))});
  assert.equal(calls,2);assert.equal(result.items[0].id,'rare');assert.equal(result.truncated,false);
  const fluid={kind:'FLUID_FIELD',id:'oil',name:'Oil',x:-128,z:-128,amounts:Array.from({length:64},(_,i)=>i)};
  const bounds={minX:-128,minZ:-128,maxX:-16,maxZ:-16};
  const best=resourcePoints([fluid],{fluidChunks:'best'},bounds);assert.equal(best.length,1);assert.deepEqual([best[0].x,best[0].z,best[0].amount],[-24,-24,54]);
  assert.equal(resourcePoints([fluid],{minimum:55,fluidChunks:'best'},bounds).length,0);
  assert.equal(resourcePoints([fluid],{fluidChunks:'all'},bounds).length,49);
});
test('custom export ranges reject empty, reversed, fractional and out-of-world inputs',()=>{
  const view={minX:0,minZ:0,maxX:512,maxZ:512};assert.deepEqual(exportBounds('view',[],view),view);
  assert.deepEqual(exportBounds('custom',['-100','-200','0','300'],view),{minX:-100,minZ:-200,maxX:0,maxZ:300});
  for(const values of [['','0','10','10'],['10','0','0','10'],['0.5','0','10','10'],['0','0','30000001','10']])assert.throws(()=>exportBounds('custom',values,view));
});
test('actual export cancellation stops after the pending batch without download or another query',async()=>{
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8'),bounds={minX:0,minZ:0,maxX:2048,maxZ:512};
  let release,calls=0,downloads=0;const job=new ExportJob(),elements={'export-limit':{value:100},'waypoint-y':{value:64},'export-json':{},'export-fluid-chunks':{value:'best'}};
  const s={$:id=>elements[id],chosenExportBounds:()=>bounds,exportJob:job,worldRevision:1,seed:'0',dimension:'overworld',language:'zh',view:{markerMode:'STRUCTURE',resourceFilter:{},filtered:new Set()},collectStructureView,markerTypeKey:m=>m.kind,toast:assert.fail,request:(_,q,o)=>{calls++;assert.equal(o.signal,job.active.signal);return new Promise(r=>release=()=>r([{kind:'VILLAGE',x:8,z:8}]));},download:()=>downloads++};
  vm.createContext(s);vm.runInContext(source.slice(source.indexOf('async function exportView('),source.indexOf('for (const format',source.indexOf('async function exportView('))),s);
  const work=s.exportView('json');assert.ok(job.active);assert.throws(()=>job.begin(),/已有导出/);job.cancel();release();await work;
  assert.equal(calls,1);assert.equal(downloads,0);assert.equal(job.active,null);assert.equal(elements['export-json'].disabled,false);
});
test('stronghold navigation matches existing map predictions at signed 64-bit seed extremes',()=>{
  for(const seed of ['0','9007199254740993','-9223372036854775808','9223372036854775807']){
    const q={seed,dimension:'overworld',bounds:{minX:-1600,minZ:-1600,maxX:1600,maxZ:1600},config:{mineshaftsEnabled:false}};
    assert.deepEqual(strongholdLocations(seed).map(({x,z})=>[x,z]),predictStructures(q).filter(m=>m.kind==='STRONGHOLD').map(({x,z})=>[x,z]));
  }
});
test('spawn bounds its attempts, supports cancellation, and refuses the obsolete biome heuristic',async()=>{
  const providerClass='net.minecraft.world.WorldProviderSurface';
  let count=0;const result=await rwgSpawn('0',()=>{count++;return {block:'minecraft:water'};},providerClass);assert.equal(result.attempts,1000);assert.equal(result.viable,false);assert.equal(count,1000);
  const controller=new AbortController();let samples=0;
  await assert.rejects(rwgSpawn('0',()=>{samples++;return {block:'minecraft:water'};},providerClass,{signal:controller.signal,yieldTask:async()=>controller.abort()}),/CANCELLED/);assert.equal(samples,8);
  let configured=0,chunks=0;const engine={configure(){configured++;},finalChunk(){chunks++;return new Int32Array(256).fill(1);}};
  const profile={noise:'perlin',groups:{snow:[1],cold:[1],hot:[1],wet:[],small:[]}},provider=createRwgProvider(engine,profile,{}, {spawnProfile:{schemaVersion:1,grassBiomes:[1]}});
  const q={seed:'9007199254740993',dimension:'overworld'};const a=await provider.predictSpawn(q);a.x=999;
  assert.equal((await provider.predictSpawn(q)).x,undefined);assert.equal((await provider.predictSpawn(q)).status,'UNAVAILABLE');assert.equal(configured,0);assert.equal(chunks,0);
  await provider.predictSpawn({...q,seed:'-17'});assert.equal(configured,0);assert.equal(chunks,0);
});
test('preferences round-trip long seed strings and isolate environments; invalid stored data is ignored',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const p={seed:'9223372036854775807',dimension:'end',markerMode:'ORES',x:-100,z:200,level:3,filtered:['VILLAGE'],resourceFilter:{id:'iron',text:'',minimum:0,minY:10,maxY:100},flags:{showBiomes:true,showStructures:true,grid:true,inertia:false,smooth:false},config:{schemaVersion:2}};
  assert.equal(writePreferences(storage,'a',p),true);assert.equal(readPreferences(storage,'a',['end']).seed,p.seed);assert.equal(readPreferences(storage,'b',['end']),null);
  for(const bad of [{...p,level:100},{...p,seed:9223372036854775807},{...p,dimension:'missing'},{...p,resourceFilter:{...p.resourceFilter,minY:200}}]){writePreferences(storage,'a',bad);assert.equal(readPreferences(storage,'a',['end']),null);}
  assert.equal(writePreferences({setItem(){throw new Error('quota');}},'a',p),false);
});
