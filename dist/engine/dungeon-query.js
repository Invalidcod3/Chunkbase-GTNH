import {validateBounds} from './native.js';

export const DUNGEON_KIND='VANILLA_SPAWNER_DUNGEON';

// Dedicated small requests let the existing worker schedule biome jobs between scans.
// The normal structure/resource collectors and their export order remain unchanged.
export async function collectDungeonView(request,query,{
  limit=20000,onBatch=()=>{},isCancelled=()=>false,
}={}) {
  validateBounds(query.bounds,3600000000000000);
  if(!Number.isInteger(limit)||limit<1)throw new Error('Invalid dungeon limit');
  const check=()=>{if(isCancelled())throw new Error('CANCELLED');};check();
  const b=query.bounds,size=256;
  const count=(Math.ceil(b.maxX/size)-Math.floor(b.minX/size))*(Math.ceil(b.maxZ/size)-Math.floor(b.minZ/size));
  function* regions(){
    for(let z=Math.floor(b.minZ/size)*size;z<b.maxZ;z+=size)
      for(let x=Math.floor(b.minX/size)*size;x<b.maxX;x+=size)
        yield {minX:Math.max(x,b.minX),minZ:Math.max(z,b.minZ),maxX:Math.min(x+size,b.maxX),maxZ:Math.min(z+size,b.maxZ)};
  }
  let batches=regions();
  if(count<=16384){
    const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
    batches=[...batches].sort((a,c)=>Math.hypot((a.minX+a.maxX)/2-cx,(a.minZ+a.maxZ)/2-cz)-Math.hypot((c.minX+c.maxX)/2-cx,(c.minZ+c.maxZ)/2-cz));
  }
  const items=[],seen=new Set();let scanned=0;
  for(const bounds of batches){
    check();
    const values=await request('predictStructures',{...query,bounds,structureGroup:'dungeons'});check();
    if(!Array.isArray(values))throw new Error('刷怪笼函数返回了无效结果');
    let overflow=false;
    for(const m of values){
      // Ignore unrelated records from older packs which do not understand the group.
      if(m.kind!==DUNGEON_KIND||m.x<bounds.minX||m.x>=bounds.maxX||m.z<bounds.minZ||m.z>=bounds.maxZ)continue;
      const key=`${m.x}:${m.z}:${m.subtype??''}`;
      if(seen.has(key))continue;
      if(items.length===limit){overflow=true;break;}
      seen.add(key);items.push(m);
    }
    scanned++;
    const truncated=overflow||(items.length===limit&&scanned<count);
    onBatch(items,{scanned,total:count,truncated});check();
    if(truncated)return {items,truncated:true};
  }
  return {items,truncated:false};
}
