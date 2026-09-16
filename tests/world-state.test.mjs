import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseSeed} from '../dist/engine/random.js';
import {validateConfig} from '../dist/engine/config.js';
import {biomeExportQuery} from '../dist/engine/biome-query.js';
import {ExportJob} from '../dist/export-job.js';

const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
// Exercise the actual application event handlers, including their commit order.
function section(start,end) {
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a);return source.slice(a,b);
}
function setup(draft='invalid') {
  const elements=Object.fromEntries(['seed','dimension','marker-mode','chaos','chaos-separation','detail','biome-name','config-file'].map(id=>[id,{}]));
  Object.assign(elements.seed,{value:draft});Object.assign(elements.dimension,{value:'end'});Object.assign(elements['marker-mode'],{value:'STRUCTURE'});
  const state={parseSeed,validateConfig,$:id=>elements[id],seed:'0',dimension:'end',config:validateConfig({schemaVersion:2}),worldRevision:3,structureRevision:5,loadedBounds:{},resourcesTruncated:true,resets:0,toasts:[],view:{seed:'0',dimension:'end',markerMode:'STRUCTURE',setWorld(seed,dimension){this.seed=seed;this.dimension=dimension;},goto(){throw new Error('unexpected navigation');}},toast:message=>state.toasts.push(message),applyColors(){},workerClient:{reset(){state.resets++;}},worldText(){},renderFilters(){}};
  vm.createContext(state);
  vm.runInContext([
    section('function loadWorld(', 'async function refreshStructures'),
    section('$("dimension").onchange', 'function resourceFilterChanged'),
    section('function updateConfig()', '$("config-download").onclick'),
  ].join('\n'),state);
  return {state,elements};
}

test('invalid draft seeds never change the active dimension, mode, config or request revision',async()=>{
  for(const draft of ['', 'not a seed', '9223372036854775808', '-9223372036854775809']) {
    const {state:s,elements:e}=setup(draft),config=JSON.stringify(s.config);
    e.dimension.value='moon';e.dimension.onchange();
    assert.equal(s.dimension,'end');assert.equal(e.dimension.value,'end');assert.equal(s.view.dimension,'end');
    e['marker-mode'].value='FLUID';e['marker-mode'].onchange();
    assert.equal(s.view.markerMode,'STRUCTURE');assert.equal(e['marker-mode'].value,'STRUCTURE');
    e.chaos.checked=false;e['chaos-separation'].value='20000';s.updateConfig();
    e['config-file'].files=[{size:100,text:async()=>JSON.stringify({schemaVersion:2,chaosSeparation:30000,dimensionIds:{moon:99}})}];
    await e['config-file'].onchange();
    assert.equal(JSON.stringify(s.config),config);assert.equal(s.worldRevision,3);assert.equal(s.structureRevision,5);assert.equal(s.resets,0);
    assert.equal(e['seed'].value,draft);assert.ok(s.toasts.every(m=>m!=='已导入环境配置'));
  }
});

test('a corrected seed and selected dimension commit together and cancel previous work once',()=>{
  const {state:s,elements:e}=setup();e.dimension.value='moon';e.dimension.onchange();
  e.seed.value='9007199254740993';e.dimension.value='moon';e.dimension.onchange();
  assert.equal(s.seed,'9007199254740993');assert.equal(s.view.seed,s.seed);assert.equal(s.dimension,'moon');assert.equal(s.view.dimension,s.dimension);
  assert.equal(s.worldRevision,4);assert.equal(s.resets,1);assert.equal(s.loadedBounds,null);assert.equal(s.resourcesTruncated,false);
  e['marker-mode'].value='ORES';e['marker-mode'].onchange();assert.equal(s.view.markerMode,'ORES');assert.equal(s.resets,2);
});

test('successful config import commits the exact validated config and synchronizes controls',async()=>{
  const {state:s,elements:e}=setup('-17');
  e['config-file'].files=[{size:100,text:async()=>JSON.stringify({schemaVersion:2,chaosEnabled:false,chaosSeparation:12345})}];
  await e['config-file'].onchange();
  assert.equal(s.config.chaosSeparation,12345);assert.equal(e['chaos-separation'].value,12345);assert.equal(e.chaos.checked,false);
  assert.equal(s.seed,'-17');assert.equal(s.resets,1);assert.equal(s.toasts.at(-1),'已导入环境配置');
});

test('the actual biome export handler records the aligned raster separately from the requested view',async()=>{
  const elements={'export-biomes':{}},bounds={minX:1,minZ:-517,maxX:1281,maxZ:83};
  let sent,exported;
  const state={$:id=>elements[id],view:{bounds:()=>bounds},worldRevision:2,seed:'9007199254740993',dimension:'twilight',language:'zh',biomeExportQuery,
    chosenExportBounds:()=>({...bounds}),exportJob:new ExportJob(),
    request:async(action,q)=>{assert.equal(action,'sampleBiomes');sent=q;return new Uint16Array(q.width*q.height);},
    biomeByIndex:()=>({key:'twilightforest:forest'}),toast(){},download:(name,text)=>{exported=JSON.parse(text);}};
  vm.createContext(state);vm.runInContext(section('$("export-biomes").onclick','$("screenshot").onclick'),state);
  await elements['export-biomes'].onclick();
  assert.equal(sent.x,0);assert.equal(sent.z,-520);assert.equal(sent.step,4);
  assert.deepEqual(exported.requestedBounds,bounds);assert.equal(exported.x,sent.x);assert.equal(exported.z,sent.z);
  assert.equal(exported.indices.length,exported.width*exported.height);assert.equal(elements['export-biomes'].disabled,false);
});

test('PNG waits for the current viewport marker batches, then allows a completed boundary map',()=>{
  const elements={screenshot:{},progress:{hidden:false}},bounds={minX:29999000,minZ:0,maxX:30000000,maxZ:512};
  let saved=0,warnings=0;
  const state={$:id=>elements[id],loadedBounds:bounds,language:'zh',seed:'0',dimension:'overworld',view:{bounds:()=>bounds,markerMode:'ORES',showStructures:false,isFullyLoaded:()=>true,draw(){},canvas:{toBlob:fn=>fn('png')}},toast:()=>warnings++,download:()=>saved++};
  vm.createContext(state);vm.runInContext(section('$("screenshot").onclick','const originalColors'),state);
  elements.screenshot.onclick();assert.equal(saved,0);assert.equal(warnings,1);
  elements.progress.hidden=true;state.loadedBounds={...bounds,minX:29998000};elements.screenshot.onclick();assert.equal(saved,0);
  state.loadedBounds=bounds;elements.screenshot.onclick();assert.equal(saved,1);
});
