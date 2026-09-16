import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resourceIcon,depositIcon} from '../dist/resource-icons.js';
import {resourceIconCatalog} from '../dist/assets/resources/catalog.js';
import {drawResources} from '../dist/resource-view.js';

test('resource catalogue supplies existing cube minerals and flat fluids for every mapped entry',async()=>{
  const files=new Set();
  for(const [dimension,modes] of Object.entries(resourceIconCatalog))for(const [mode,entries] of Object.entries(modes))for(const [id,entry] of Object.entries(entries)){
    assert.ok(entry.flat,dimension+':'+id);files.add(entry.flat);
    if(mode==='ORES'){assert.ok(entry.cube);files.add(entry.cube);assert.notEqual(resourceIcon(dimension,mode,id,'cube'),resourceIcon(dimension,mode,id));}
    else {assert.equal(entry.cube,undefined);assert.equal(resourceIcon(dimension,mode,id,'cube'),resourceIcon(dimension,mode,id));}
  }
  for(const file of files){const png=await readFile(new URL('../dist/assets/resources/'+file+'.png',import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),32);assert.equal(png.readUInt32BE(20),32);}
});

test('asteroid drawing uses mineral sprites, shares loaded images and keeps coordinates and hit size',()=>{
  const deposit=Object.freeze({kind:'ASTEROID_VEIN',id:'asteroid.vein:ore.mix.naquadah',name:'Naquadah',x:12,z:34,color:'#323232'});
  const source=depositIcon('end',deposit);assert.ok(source?.endsWith('-flat.png'));
  const image={complete:true,naturalWidth:32,naturalHeight:32},drawn=[],fills=[];
  const c=new Proxy({},{get:(_,k)=>(...args)=>{if(k==='drawImage')drawn.push(args);if(k==='fillRect')fills.push(args);}});
  drawResources({dimension:'end',markerMode:'ORES',scale:1,resourceImages:new Map([[source,image]]),visibleResources:()=>[deposit],screen:(x,z)=>({x,y:z})},c);
  assert.deepEqual(drawn,[[image,0,22,24,24]]);assert.deepEqual(fills,[]);
  assert.equal(deposit.icon,undefined,'display assets do not change prediction records');
  assert.equal(depositIcon('end',{...deposit,icon:'provided'}),'data:image/png;base64,provided');
  assert.equal(resourceIcon('unknown','ORES','missing'),null);
});
