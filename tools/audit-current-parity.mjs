// Local source/contract audit. Does not connect to or mutate a game instance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import {validateResources} from '../dist/engine/resources.js';
import {createProspectingProvider} from '../dist/engine/prospecting.js';
import {journeyMap} from '../dist/export.js';
import {collectStructureView} from '../dist/engine/structure-query.js';
import {kinds,markerTypeKey} from '../dist/engine/catalog.js';
import {strongholdLocations} from '../dist/engine/navigation.js';
import {predictStructures} from '../dist/engine/native.js';

if(!process.argv[2])throw Error('Provide the current desktop project checkout');
const desktop=path.resolve(process.argv[2]),root=new URL('../',import.meta.url);
const json=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const files=['gtnh-worker/src/main/java/amidst/gtnh/worker/BiomeWorkerServer.java',
  'gtnh-worker/src/main/java/amidst/gtnh/worker/AsteroidOrePredictor.java',
  'gtnh-worker/src/main/java/amidst/gtnh/worker/AsteroidProspecting.java',
  'gtnh-worker/src/main/java/amidst/gtnh/worker/ProspectingService.java',
  'gtnh-worker/src/main/java/amidst/gtnh/worker/EndAsteroidPredictor.java',
  'gtnh-worker/src/main/java/amidst/gtnh/worker/AccuracyValidation.java',
  'src/main/java/amidst/gtnh/export/RadialCoordinateLocator.java',
  'src/main/java/amidst/gtnh/export/GtnhMapWaypoint.java',
  'src/main/java/amidst/gtnh/cache/MapStorage.java'];
const report={capturedAt:new Date().toISOString(),desktop,desktopCommit:execFileSync('git',['-c',`safe.directory=${desktop.replaceAll('\\','/')}`,'rev-parse','HEAD'],{cwd:desktop,encoding:'utf8'}).trim(),
  scope:'Current desktop source versus Web dist and complete private preview; no live game truth or fresh calibration',hashes:{},probes:{}};
for(const file of files){const data=await readFile(path.join(desktop,file));report.hashes[file]=createHash('sha256').update(data).digest('hex');
  if(file.endsWith('BiomeWorkerServer.java'))report.desktopProtocol=Number(data.toString().match(/PROTOCOL_VERSION\s*=\s*(\d+)/)[1]);}
const client=await readFile(new URL('tools/worker-query.py',root),'utf8');
report.webCalibrationProtocol=Number(client.match(/'protocol':(\d+)/)[1]);
const fixture={kind:'ASTEROID_SMALL',id:'asteroid.small:ore.small.iron',name:'Iron',materials:'Iron',source:'PREDICTED',
  x:-258,z:364,y:250,size:12,minY:237,maxY:254,color:'#aaaacc'};
try{validateResources([fixture],'ORES');report.probes.asteroidContract='accepted';}
catch(e){report.probes.asteroidContract=e.message;}
assert.equal(report.probes.asteroidContract,'accepted');
const pack='private-packs/rwg-local-preview/';
const profile=await json(pack+'packs/resources/profile.json'),config=await json(pack+'environment.json');
const provider=createProspectingProvider(profile,config.dimensionIds,{asteroidProfile:await json(pack+'packs/resources/asteroids.json')});
report.probes.installedResources=[];
for(const dimension of ['end','asteroids','kuiper_belt','mehen']) {
  const values=await provider.predictResources({seed:'0',dimension,mode:'ORES',bounds:{minX:0,minZ:0,maxX:512,maxZ:512}});
  report.probes.installedResources.push({dimension,id:config.dimensionIds[dimension],count:values?.length,
    kinds:[...new Set(values?.map(v=>v.kind))],allChunkCenters:values?.every(v=>(v.x-8)%16===0&&(v.z-8)%16===0),
    withCenterY:values?.filter(v=>Number.isInteger(v.y)).length});
}
async function waypoint(dimension,dimensionId,point) {
  const bytes=new Uint8Array(await journeyMap([point],{seed:'0',dimension,dimensionId}).arrayBuffer()),header=new DataView(bytes.buffer);
  const size=header.getUint32(18,true),nameLength=header.getUint16(26,true),extra=header.getUint16(28,true),decode=new TextDecoder();
  return {file:decode.decode(bytes.slice(30,30+nameLength)),value:JSON.parse(decode.decode(bytes.slice(30+nameLength+extra,30+nameLength+extra+size)))};
}
const ordinary={kind:'ORE_VEIN',name:'Iron',x:8,z:8,certainty:'POSSIBLE'};
const a=await waypoint('overworld',0,ordinary),b=await waypoint('moon',28,ordinary),ast=await waypoint('asteroids',30,fixture);
report.probes.journeyMap={crossDimensionFileCollision:a.file===b.file,crossDimensionIdCollision:a.value.id===b.value.id,
  suppliedAsteroidCenterY:fixture.y,exportedY:ast.value.y};
assert.notEqual(a.file,b.file);assert.notEqual(a.value.id,b.value.id);assert.equal(ast.value.y,fixture.y);
const source=await readFile(new URL('dist/app.js',root),'utf8'),bounds={minX:0,minZ:0,maxX:2048,maxZ:1024};let calls=0;
const state={structureRevision:0,worldRevision:0,markerController:null,loadedBounds:null,structuresTruncated:false,resourcesTruncated:false,
  seed:'0',dimension:'moon',language:'zh',AbortController,collectStructureView,kinds,markerTypeKey,
  $:()=>({}),view:{markerMode:'STRUCTURE',showStructures:true,filtered:new Set(['MINESHAFT']),markers:[],resources:[]},renderFilters(){},toast(){},updateCount(){},
  request:async()=>++calls===1?Array.from({length:20000},(_,i)=>({kind:'MINESHAFT',x:i%1000,z:Math.floor(i/1000)})):[{kind:'MOON_DUNGEON',x:1032,z:8}]};
vm.createContext(state);vm.runInContext(source.slice(source.indexOf('function invalidateMarkers('),source.indexOf('function renderFilters(')),state);
await state.refreshStructures(bounds);
report.probes.hiddenStructureLimit={requests:calls,truncated:state.structuresTruncated,visible:state.view.markers.filter(m=>!state.view.filtered.has(m.kind)).length};
assert.equal(calls,1);assert.equal(state.structuresTruncated,true);
const seed='5942749603128060499';
const points=strongholdLocations(seed).map(({x,z})=>({x,z}));
const mapPoints=predictStructures({seed,dimension:'overworld',bounds:{minX:-2048,minZ:-2048,maxX:2048,maxZ:2048},config:{mineshaftsEnabled:false}})
  .filter(m=>m.kind==='STRONGHOLD').map(({x,z})=>({x,z}));
assert.deepEqual(points,mapPoints);
assert.deepEqual(points,[{x:-592,z:816},{x:-416,z:-944},{x:1104,z:112}]);
report.probes.webStrongholdMenuAndMap={seed,points,equal:true};
await mkdir(new URL('.test-work/',root),{recursive:true});
await writeFile(new URL('.test-work/current-parity-audit-2026-09-16.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,hashes:undefined},null,2));
