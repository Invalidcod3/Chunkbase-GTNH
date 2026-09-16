import test from 'node:test';
import {ExportJob} from '../dist/export-job.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {collectStructureView} from '../dist/engine/structure-query.js';
import {collectDungeonView,DUNGEON_KIND} from '../dist/engine/dungeon-query.js';
const workerSource=(await readFile(new URL('../dist/engine/worker.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const section=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)+a.length));

test('obsolete running and queued scans cancel independently; visible tiles precede exports without concurrent engines',async()=>{
  const events=[];let active=0,maxActive=0;
  const run=async(q,{signal})=>{
    active++;maxActive=Math.max(active,maxActive);events.push(q.label);
    try {if(q.label==='old')await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return null;}
    finally{active--;}
  };
  const provider={sampleBiomes:run,predictStructures:run};
  const worker={postMessage:data=>self.onmessage({data}),terminate(){}};
  const client=new WorkerClient(()=>worker);
  const self={postMessage:data=>worker.onmessage({data})};
  const gpuCompute={setLevel(level){this.onStatus(level?'idle':'off');}};
  vm.runInNewContext(workerSource,{self,gpuCompute,nativeProvider:{},loadProviders:async()=>[],findProvider:()=>provider,AbortController,setTimeout,biomeRegistry:{indices:[]}});
  const marker=new AbortController();
  const first=client.request('predictStructures',{label:'old'},{signal:marker.signal,priority:1});
  const rejected=assert.rejects(first,/CANCELLED/);
  await new Promise(setImmediate);
  client.setGpuCompute(true);client.setGpuCompute(false);
  assert.equal(client.pending.size,1,'changing compute mode preserves the running job');
  const queued=client.request('predictStructures',{label:'obsolete-queued'},{signal:marker.signal,priority:1});
  const rejectedQueued=assert.rejects(queued,/CANCELLED/);
  const exported=client.request('predictStructures',{label:'export'});
  const tile=client.request('sampleBiomes',{label:'visible'},{priority:0});
  marker.abort();
  await Promise.all([rejected,rejectedQueued,exported,tile]);
  assert.deepEqual(events,['old','visible','export']);assert.equal(maxActive,1);assert.equal(client.pending.size,0);
  await assert.rejects(client.request('predictStructures',{}, {signal:marker.signal}),/CANCELLED/);
});

test('hidden structures launch no automatic work and hiding cancels active batches without resetting the worker',async()=>{
  const b={minX:0,minZ:0,maxX:2048,maxZ:1024},progress={hidden:true};let calls=0,aborted=false;
  const s={structureRevision:0,worldRevision:0,markerController:null,loadedBounds:null,structuresTruncated:false,resourcesTruncated:false,
    seed:'0',dimension:'overworld',language:'zh',AbortController,collectStructureView,kinds:{},markerTypeKey:m=>m.kind,
    $:()=>progress,view:{showStructures:false,markerMode:'STRUCTURE',markers:[],resources:[],filtered:new Set(['VANILLA_SPAWNER_DUNGEON'])},DUNGEON_KIND:'VANILLA_SPAWNER_DUNGEON',updateCount(){},renderFilters(){},toast:assert.fail,
    request:async(action,q,{signal})=>{calls++;await new Promise(r=>signal.addEventListener('abort',()=>{aborted=true;r();},{once:true}));throw new Error('CANCELLED');}};
  vm.createContext(s);vm.runInContext(section('function invalidateMarkers(', 'function renderFilters('),s);
  await s.refreshStructures(b);assert.equal(calls,0);assert.equal(progress.hidden,true);
  s.view.showStructures=true;const pending=s.refreshStructures(b);await new Promise(setImmediate);
  s.view.showStructures=false;await s.refreshStructures(b);await pending;
  assert.equal(calls,1);assert.equal(aborted,true);assert.equal(progress.hidden,true);assert.equal(s.loadedBounds,null);
});

test('PNG file identity is captured before the asynchronous encoder returns',()=>{
  const elements={screenshot:{},progress:{hidden:true}},b={minX:0,minZ:0,maxX:512,maxZ:512};let callback,name;
  const s={$:id=>elements[id],loadedBounds:b,seed:'0',dimension:'overworld',language:'zh',toast:assert.fail,download:n=>name=n,
    view:{bounds:()=>b,markerMode:'STRUCTURE',showStructures:false,isFullyLoaded:()=>true,draw(){},canvas:{toBlob:fn=>callback=fn}}};
  vm.createContext(s);vm.runInContext(section('$("screenshot").onclick','const originalColors'),s);
  elements.screenshot.onclick();s.seed='123';s.dimension='moon';callback('png');
  assert.equal(name,'amidst-overworld-0.png');
});

test('the structure export handler batches a fixed view and filter snapshot independently of panning',async()=>{
  const b={minX:0,minZ:0,maxX:2048,maxZ:512};
  const elements={'export-limit':{value:'2'},'waypoint-y':{value:'64'},'export-json':{},'export-fluid-chunks':{value:'best'}};
  const requests=[];let exported;
  const s={$:id=>elements[id],worldRevision:0,seed:'0',dimension:'overworld',config:{dimensionIds:{overworld:0}},language:'zh',collectStructureView,markerTypeKey:m=>m.kind,
    chosenExportBounds:()=>({...b}),exportJob:new ExportJob(),
    view:{markerMode:'STRUCTURE',resourceFilter:{},filtered:new Set(),bounds:()=>b},toast(){},download:(name,text)=>exported=JSON.parse(text),
    request:async(action,q,options)=>{requests.push({q,options});s.view.bounds=()=>({minX:4096,minZ:0,maxX:6144,maxZ:512});s.view.filtered.add('VILLAGE');return [{kind:'VILLAGE',x:q.bounds.minX+8,z:8}];}};
  vm.createContext(s);vm.runInContext(section('async function exportView(', 'for (const format'),s);
  await s.exportView('json');
  assert.equal(requests.length,2);assert.ok(requests.every(r=>r.options.priority===2&&r.q.excludedKinds.length===0));
  assert.deepEqual(exported.bounds,b);assert.equal(exported.structures.length,2);assert.equal(exported.selectionOrder,'region-scan');
  assert.equal(elements['export-json'].disabled,false);
});

test('ordinary structures publish before dungeon scans and remain visible after a dungeon failure',async()=>{
  const b={minX:0,minZ:0,maxX:256,maxZ:256},progress={hidden:true},events=[],messages=[];
  const s={structureRevision:0,worldRevision:0,markerController:null,loadedBounds:null,structuresTruncated:false,resourcesTruncated:false,
    seed:'0',dimension:'overworld',language:'zh',AbortController,collectStructureView,collectDungeonView,DUNGEON_KIND,kinds:{},markerTypeKey:m=>m.kind,
    $:()=>progress,view:{showStructures:true,markerMode:'STRUCTURE',markers:[],resources:[],filtered:new Set()},updateCount(){},renderFilters(){},toast:m=>messages.push(m),
    request:async(action,q)=>{
      events.push(q);
      if(q.structureGroup==='dungeons'){
        assert.equal(s.view.markers.length,1);assert.equal(s.view.markers[0].kind,'VILLAGE');throw new Error('Cave failed');
      }
      assert.ok(q.excludedKinds.includes(DUNGEON_KIND));return [{kind:'VILLAGE',x:8,z:8}];
    }};
  vm.createContext(s);vm.runInContext(section('function invalidateMarkers(', 'function renderFilters('),s);
  await s.refreshStructures(b);assert.equal(events.length,2);assert.equal(s.view.markers.length,1);assert.equal(s.loadedBounds,null);
  assert.deepEqual(messages,['Cave failed']);assert.equal(progress.hidden,true);
});

test('dungeon completion joins ordinary markers; disabling it launches only the ordinary scan',async()=>{
  const b={minX:-256,minZ:-256,maxX:256,maxZ:256},progress={hidden:true},events=[];
  const s={structureRevision:0,worldRevision:0,markerController:null,loadedBounds:null,structuresTruncated:false,resourcesTruncated:false,
    seed:'0',dimension:'overworld',language:'zh',AbortController,collectStructureView,collectDungeonView,DUNGEON_KIND,kinds:{},markerTypeKey:m=>m.kind,
    $:()=>progress,view:{showStructures:true,markerMode:'STRUCTURE',markers:[],resources:[],filtered:new Set()},updateCount(){},renderFilters(){},toast:assert.fail,
    request:async(action,q)=>{events.push(q);return [{kind:q.structureGroup==='dungeons'?DUNGEON_KIND:'VILLAGE',x:q.bounds.minX+8,z:q.bounds.minZ+8}];}};
  vm.createContext(s);vm.runInContext(section('function invalidateMarkers(', 'function renderFilters('),s);
  await s.refreshStructures(b);assert.equal(s.view.markers.length,8);assert.equal(s.loadedBounds,b);assert.equal(events.filter(q=>q.structureGroup==='dungeons').length,4);
  s.view.filtered.add(DUNGEON_KIND);events.length=0;await s.refreshStructures(b);
  assert.equal(s.view.markers.length,4);assert.ok(events.every(q=>q.structureGroup!=='dungeons'));
});
