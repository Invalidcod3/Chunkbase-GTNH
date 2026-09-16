// Reproduce remaining audit issues with real application helpers; no production writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {journeyMap} from '../dist/export.js';
import {collectStructureView} from '../dist/engine/structure-query.js';
import {kinds,markerTypeKey} from '../dist/engine/catalog.js';
const root=new URL('../',import.meta.url);
const point={kind:'ORE_VEIN',name:'Iron',x:8,z:8,certainty:'POSSIBLE'};
async function firstWaypoint(dimension,dimensionId){
  const bytes=new Uint8Array(await journeyMap([point],{seed:'0',dimension,dimensionId}).arrayBuffer()),header=new DataView(bytes.buffer);
  const size=header.getUint32(18,true),nameLength=header.getUint16(26,true),extra=header.getUint16(28,true);
  return {file:new TextDecoder().decode(bytes.slice(30,30+nameLength)),value:JSON.parse(new TextDecoder().decode(bytes.slice(30+nameLength+extra,30+nameLength+extra+size)))};
}
const a=await firstWaypoint('overworld',0),b=await firstWaypoint('moon',28);
assert.equal(a.file,b.file);assert.equal(a.value.id,b.value.id);
const source=await readFile(new URL('dist/app.js',root),'utf8'),bounds={minX:0,minZ:0,maxX:2048,maxZ:1024};let calls=0;
const progress={},s={structureRevision:0,worldRevision:0,markerController:null,loadedBounds:null,structuresTruncated:false,resourcesTruncated:false,seed:'0',dimension:'moon',language:'zh',AbortController,collectStructureView,kinds,markerTypeKey,
  $:()=>progress,view:{markerMode:'STRUCTURE',showStructures:true,filtered:new Set(['MINESHAFT']),markers:[],resources:[]},renderFilters(){},toast(){},updateCount(){},
  request:async(_,q)=>{calls++;return calls===1?Array.from({length:20000},(_,i)=>({kind:'MINESHAFT',x:i%1000,z:Math.floor(i/1000)})):[{kind:'MOON_DUNGEON',x:1032,z:8}];}};
vm.createContext(s);vm.runInContext(source.slice(source.indexOf('function invalidateMarkers('),source.indexOf('function renderFilters(')),s);await s.refreshStructures(bounds);
assert.equal(calls,1);assert.equal(s.structuresTruncated,true);assert.equal(s.view.markers.filter(m=>!s.view.filtered.has(m.kind)).length,0);
const report={journeyMapCollision:{filename:a.file,id:a.value.id,dimensions:[a.value.dimensions,b.value.dimensions]},hiddenStructureLimit:{requests:calls,truncated:s.structuresTruncated,visible:0,secondRegionNotScanned:true}};
if(process.argv[2]){
  const files=['gtnh-worker/src/main/java/amidst/gtnh/worker/BiomeWorkerServer.java','gtnh-worker/src/main/java/amidst/gtnh/worker/MapCacheIdentity.java','gtnh-worker/src/main/java/amidst/gtnh/worker/AdditionalDimensionBiomes.java','src/main/java/amidst/gtnh/cache/MapStorage.java','src/main/java/amidst/gtnh/cache/MapViewState.java','src/main/java/amidst/gtnh/export/RadialCoordinateLocator.java','src/main/java/amidst/gtnh/export/JourneyMapAutoImport.java','src/main/java/amidst/gtnh/export/GtnhMapWaypoint.java','src/main/java/amidst/gtnh/worker/GtnhBiomeColorPalette.java','src/main/resources/amidst/i18n/zh_CN.json'];
  const snapshot={capturedAt:new Date().toISOString(),source:path.resolve(process.argv[2]),state:'uncommitted local working copy; point-in-time audit',files:{}};
  for(const file of files){
    const data=await readFile(path.join(process.argv[2],file)),target=new URL('private-packs/desktop-audit-source/'+file,root);
    await mkdir(new URL('./',target),{recursive:true});await writeFile(target,data);
    snapshot.files[file]=createHash('sha256').update(data).digest('hex');
    if(file.endsWith('BiomeWorkerServer.java'))snapshot.workerProtocol=Number(data.toString().match(/PROTOCOL_VERSION\s*=\s*(\d+)/)[1]);
  }
  await writeFile(new URL('docs/desktop-audit-source-2026-09-15.json',root),JSON.stringify(snapshot,null,2));
  report.desktopProtocol=snapshot.workerProtocol;report.capturedAt=snapshot.capturedAt;
}
await writeFile(new URL('private-packs/runtime-session/followup-audit.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
