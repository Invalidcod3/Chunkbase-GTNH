import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MapView} from '../dist/map.js';
import {drawResources} from '../dist/resource-view.js';
test('the real 20×26 village asset renders at its natural aspect ratio without a candidate frame',async t=>{
 const png=await readFile(new URL('../dist/assets/village.png',import.meta.url)),drawn=[],rects=[];
 const image={complete:true,naturalWidth:png.readUInt32BE(16),naturalHeight:png.readUInt32BE(20)};
 const ctx=new Proxy({},{get:(_,k)=>(...args)=>{if(k==='drawImage')drawn.push(args);if(k==='strokeRect')rects.push(args);}});
 const previous=globalThis.document;globalThis.document={querySelector:()=>({style:{}})};
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 MapView.prototype.draw.call({ctx,width:100,height:100,scale:1,showBiomes:false,showStructures:true,markerMode:'STRUCTURE',images:new Map([['VILLAGE',image]]),screen:()=>({x:50,y:50}),visibleMarkers:()=>[{kind:'VILLAGE',subtype:'',x:0,z:0,certainty:'POSSIBLE'}]});
 assert.deepEqual(drawn,[[image,40,37,20,26]]);assert.deepEqual(rects,[]);
});
test('ore icons preserve their aspect ratio and do not receive an extra gray frame',()=>{
 const drawn=[],rects=[],image={complete:true,naturalWidth:20,naturalHeight:26};
 const ctx=new Proxy({},{get:(_,k)=>(...args)=>{if(k==='drawImage')drawn.push(args);if(k==='strokeRect')rects.push(args);}});
 drawResources({markerMode:'ORES',scale:1,resourceImages:new Map([['test',image]]),visibleResources:()=>[{id:'test',name:'Ore',icon:'test',x:0,z:0,color:'#ffffff'}],screen:()=>({x:50,y:50})},ctx);
 assert.deepEqual(drawn,[[image,38,34.4,24,31.2]]);assert.deepEqual(rects,[]);
});
