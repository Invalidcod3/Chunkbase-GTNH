import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {trimMapTiles,tileBytes} from '../dist/map-memory.js';
// Deterministic storage accounting, NOT a browser heap/RSS measurement.
// Canvas backing pixels are counted as RGBA8; driver overhead is excluded.
const width=1920,height=1080,old=new Map(),current=new Map(),rows=[];
let oldPeak=0,newPeak=0,evicted=0;
const make=(tx,tz,step)=>({tx,tz,step,data:new Uint16Array(128*128),image:{width:128,height:128}});
const bytes=tiles=>[...tiles.values()].reduce((sum,t)=>sum+tileBytes(t),0);
for(let phase=0;phase<28;phase++) {
  const step=[4,8,16,32,16,8,4][phase%7],scale=1/step,size=128*step;
  const minX=phase*7*size,minZ=phase*size;
  const bounds={minX,minZ,maxX:minX+width/scale,maxZ:minZ+height/scale},visible=new Set(),cells=[];
  for(let z=Math.floor(bounds.minZ/size);z<Math.ceil(bounds.maxZ/size);z++)for(let x=Math.floor(bounds.minX/size);x<Math.ceil(bounds.maxX/size);x++){
    const key=`${step}:${x}:${z}`;visible.add(key);cells.push({key,x,z});
  }
  for(const key of visible){const tile=current.get(key);if(tile){current.delete(key);current.set(key,tile);}}
  evicted+=trimMapTiles(current,{bounds,visible}).evicted;
  for(const {key,x,z} of cells) {
    if(!old.has(key)) {
      old.set(key,make(x,z,step));
      // Prior MapView capacity and FIFO eviction, reproduced verbatim.
      const screenTile=128*step*scale,capacity=Math.max(256,Math.min(4096,2*Math.ceil(width/screenTile+2)*Math.ceil(height/screenTile+2)));
      if(old.size>capacity)old.delete(old.keys().next().value);
    }
    if(!current.has(key))current.set(key,make(x,z,step));
    else current.get(key).image||={width:128,height:128};
    evicted+=trimMapTiles(current,{bounds,visible}).evicted;
    oldPeak=Math.max(oldPeak,bytes(old));newPeak=Math.max(newPeak,bytes(current));
  }
  for(const key of visible)assert.ok(current.has(key),'Visible exact tile must survive');
  rows.push({phase,step,visible:visible.size,oldTiles:old.size,newTiles:current.size,oldBytes:bytes(old),newBytes:bytes(current)});
}
const result={scope:'1920x1080 viewport, 28 pan/zoom stages, unchanged 128x128 exact samples; estimated tile data + RGBA canvas storage + 256 bytes metadata per tile; excludes generators, GPU, main canvas and browser overhead',oldPeakBytes:oldPeak,newPeakBytes:newPeak,reduction:1-newPeak/oldPeak,evicted,rows};
await mkdir(new URL('../.test-work/map-memory/',import.meta.url),{recursive:true});
await writeFile(new URL('../.test-work/map-memory/comparison.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,rows:undefined}));
