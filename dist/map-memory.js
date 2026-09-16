import {deviceBudget} from './device-budget.js';
const MiB=1024*1024;
export function tileIntersects(tile,bounds) {
  const size=128*tile.step,x=tile.tx*size,z=tile.tz*size;
  return x<bounds.maxX&&z<bounds.maxZ&&x+size>bounds.minX&&z+size>bounds.minZ;
}
export function tileBytes(tile) {
  return (tile.data?.byteLength||0)+(tile.image?.width||0)*(tile.image?.height||0)*4+256;
}
export function releaseTileImage(tile) {
  if(tile.image){tile.image.width=tile.image.height=0;tile.image=null;tile.imageVersion=undefined;}
}
// Reserve the current viewport, then budget history in bytes rather than a
// fixed number of canvases. Device memory is only a hint, never free RAM.
export function trimMapTiles(tiles,{bounds,visible,gpu=false,deviceMemory,hardwareConcurrency,coarsePointer,release=()=>{}}) {
  const historyBytes=Math.min(deviceBudget({deviceMemory,hardwareConcurrency,coarsePointer}).historyBytes,Math.max(MiB,visible.size*32768));
  const history=[];let protectedBytes=0,retainedBytes=0,evicted=0,releasedImages=0;
  for(const [key,tile] of tiles) {
    const intersects=tileIntersects(tile,bounds);
    if(tile.image&&(gpu||!intersects)){releaseTileImage(tile);releasedImages++;}
    // Reserve a canvas that visible CPU drawing will recreate after this trim,
    // so lazily redrawing fallback levels cannot silently exceed the budget.
    const canvasBytes=intersects&&!gpu&&tile.data&&!tile.image?4*(128*tile.step/(tile.query?.step||tile.step))**2:0;
    const bytes=tileBytes(tile)+canvasBytes;
    if(visible.has(key)){protectedBytes+=bytes;continue;}
    history.push({key,tile,intersects,bytes});
  }
  // Recently used entries win within a class; overlapping old levels provide
  // useful fallback while new tiles arrive. Current exact tiles are never evicted.
  history.reverse();history.sort((a,b)=>Number(b.intersects)-Number(a.intersects));
  let retained=0;
  for(const entry of history) {
    if(retainedBytes+entry.bytes<=historyBytes&&retained<256){retainedBytes+=entry.bytes;retained++;}
    else {release(entry.tile);releaseTileImage(entry.tile);tiles.delete(entry.key);evicted++;}
  }
  return {bytes:protectedBytes+retainedBytes,historyBytes,protectedBytes,tiles:tiles.size,evicted,releasedImages};
}
