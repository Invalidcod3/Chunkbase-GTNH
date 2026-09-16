import test from 'node:test';
import assert from 'node:assert/strict';
import {trimMapTiles,tileBytes} from '../dist/map-memory.js';
import {MapView} from '../dist/map.js';
const tile=(tx,step=32)=>({tx,tz:0,step,query:{x:tx*128*step,z:0,width:128,height:128,step},data:new Uint16Array(16384).fill(tx&65535),image:{width:128,height:128},imageVersion:0});
const bounds={minX:0,minZ:0,maxX:4096,maxZ:4096};

test('panning releases canvas storage, bounds history bytes and protects the visible exact tile',()=>{
  const tiles=new Map(Array.from({length:1000},(_,i)=>['32:'+i+':0',tile(i)])),current=tiles.get('32:0:0'),far=tiles.get('32:999:0'),canvas=far.image;
  const released=[],stats=trimMapTiles(tiles,{bounds,visible:new Set(['32:0:0']),release:t=>released.push(t)});
  assert.equal(tiles.get('32:0:0'),current);assert.equal(current.image.width,128);
  assert.equal(far.image,null);assert.equal(canvas.width,0);assert.equal(far.data[0],999);
  assert.ok(stats.bytes<=stats.protectedBytes+stats.historyBytes);assert.ok(released.length>900);
  assert.equal(tiles.has('32:999:0'),true,'recent hidden data remains reusable');
});

test('visible tiles exceeding history budget do not thrash; overlapping fallback survives before distant history',()=>{
  const tiles=new Map([['old',tile(0,16)],...Array.from({length:80},(_,i)=>['32:'+i+':0',tile(i)])]);
  const visible=new Set([...tiles.keys()].filter(k=>k!=='old'));
  const stats=trimMapTiles(tiles,{bounds:{...bounds,maxX:80*4096},visible,deviceMemory:2});
  assert.equal(tiles.size,81);assert.ok(stats.protectedBytes>stats.historyBytes);assert.ok(tiles.has('old'));
});

test('GPU-only data creates its CPU canvas lazily after fallback, without another generator query',t=>{
  const previous=globalThis.document;let writes=0;
  globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){writes++;}})})};
  t.after(()=>globalThis.document=previous);
  const sample=tile(0),original=sample.data,tiles=new Map([['32:0:0',sample]]);
  trimMapTiles(tiles,{bounds,visible:new Set(tiles.keys()),gpu:true});
  assert.equal(sample.image,null);assert.equal(tileBytes(sample),original.byteLength+256);
  const map=Object.assign(Object.create(MapView.prototype),{paletteRevision:0,request(){throw Error('Unexpected query');}});
  const image=map.prepareTileImage(sample);assert.equal(image.width,128);assert.equal(writes,1);assert.equal(sample.data,original);
  map.prepareTileImage(sample);assert.equal(writes,1);
});
