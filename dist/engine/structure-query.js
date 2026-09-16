import {validateBounds} from './native.js';

// Providers retain their own generation neighbourhoods; only the requested
// output bounds are split. In particular RWG keeps its dungeon exclusion halo.
export async function collectStructureView(request,query,{
  limit=20000,select=values=>values,onBatch=()=>{},isCancelled=()=>false,centreFirst=false,
}={}) {
  validateBounds(query.bounds,3600000000000000);
  if(!Number.isInteger(limit)||limit<1)throw new Error('Invalid structure limit');
  const check=()=>{if(isCancelled())throw new Error('CANCELLED');};
  const b=query.bounds,size=1024;
  const count=(Math.ceil(b.maxX/size)-Math.floor(b.minX/size))*(Math.ceil(b.maxZ/size)-Math.floor(b.minZ/size));
  function* regions(){
    for(let z=Math.floor(b.minZ/size)*size;z<b.maxZ;z+=size)
      for(let x=Math.floor(b.minX/size)*size;x<b.maxX;x+=size)
        yield {minX:Math.max(x,b.minX),minZ:Math.max(z,b.minZ),maxX:Math.min(x+size,b.maxX),maxZ:Math.min(z+size,b.maxZ)};
  }
  let batches=regions();
  if(centreFirst&&count<=16384){
    const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
    batches=[...batches].sort((a,c)=>Math.hypot((a.minX+a.maxX)/2-cx,(a.minZ+a.maxZ)/2-cz)-Math.hypot((c.minX+c.maxX)/2-cx,(c.minZ+c.maxZ)/2-cz));
  }
  const items=[],seen=new Set();let scanned=0;
  for(const bounds of batches){
    check();const values=await request('predictStructures',{...query,bounds});check();
    if(!Array.isArray(values))throw new Error('结构函数返回了无效结果');
    let overflow=false;
    for(const m of select(values)){
      if(m.x< b.minX||m.x>=b.maxX||m.z<b.minZ||m.z>=b.maxZ)continue;
      const key=`${m.kind}:${m.subtype??''}:${m.x}:${m.z}:${m.y??''}`;
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
