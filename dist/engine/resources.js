// Browser-pack boundary. Save records use the separate future save adapter.
import {resourceSearchText} from '../resource-names.js';
export function validateResources(value, mode) {
  if (value === null) return null; // No installed implementation; distinct from an empty result.
  if (!['ORES','FLUID'].includes(mode) || !Array.isArray(value) || value.length>65536) throw new Error('无效资源结果');
  const seen=new Set();
  for(const d of value) {
    if(!d || typeof d.id!=='string' || !d.id || typeof d.name!=='string'
      || !Number.isSafeInteger(d.x) || !Number.isSafeInteger(d.z) || Math.max(Math.abs(d.x),Math.abs(d.z))>30000000
      || !/^#[0-9a-f]{6}$/i.test(d.color)) throw new Error('资源结果缺少有效身份、坐标或颜色');
    const key=`${d.x}:${d.z}`;if(seen.has(key))throw new Error('资源结果包含重复位置');seen.add(key);
    if(mode==='ORES') {
      const asteroid=['ASTEROID_SMALL','ASTEROID_VEIN'].includes(d.kind);
      if(d.source!=='PREDICTED' || !Number.isInteger(d.minY) || !Number.isInteger(d.maxY) || d.minY<0 || d.maxY>255 || d.minY>d.maxY
        || (asteroid ? !Number.isInteger(d.y)||d.y<0||d.y>254||!Number.isInteger(d.size)||d.size<2||d.size>254||d.size%2
          ||d.minY!==Math.max(0,d.y-d.size-1)||d.maxY!==Math.min(254,d.y+d.size)
          ||!d.id.startsWith(d.kind==='ASTEROID_SMALL'?'asteroid.small:':'asteroid.vein:')
          : d.kind!=='ORE_VEIN'||d.size!==16||(d.x-8)%16||(d.z-8)%16))
        throw new Error('无效矿脉预测');
    } else if(d.kind!=='FLUID_FIELD' || d.source!=='INITIAL' || d.size!==128 || d.x%128 || d.z%128
      || !Array.isArray(d.amounts) || d.amounts.length!==64 || d.amounts.some(v=>!Number.isInteger(v)||v<0||v>429496))
      throw new Error('无效初始流体产量');
    if(d.depleted || d.saveId || d.currentAmounts?.some(Boolean)) throw new Error('预测函数包不能返回存档状态');
    if(d.icon!==undefined && (typeof d.icon!=='string' || d.icon.length>100000 || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(d.icon)))throw new Error('矿脉图标必须是本地 PNG 数据');
  }
  return value;
}
export function resourceMatches(d, {text='',minimum=0,id='',minY=0,maxY=255,excludedIds=[]}={}) {
  const search=text.trim().toLowerCase();
  return (!search || resourceSearchText(d).includes(search))
    && (!id || d.id===id)
    && !excludedIds.includes(d.id)
    && (d.amounts ? d.amounts.some(v=>v>=minimum) : d.maxY>=minY && d.minY<=maxY);
}
export function resourcePoints(deposits,filter,bounds) {
  const result=[],inside=(x,z)=>x>=bounds.minX&&x<bounds.maxX&&z>=bounds.minZ&&z<bounds.maxZ;
  for(const d of deposits.filter(d=>resourceMatches(d,filter))) {
    if(!d.amounts){if(inside(d.x,d.z))result.push({...d,certainty:d.certainty||'POSSIBLE'});continue;}
    const chunks=[];
    for(let dx=0;dx<8;dx++)for(let dz=0;dz<8;dz++) {
      const x=d.x+dx*16+8,z=d.z+dz*16+8,amount=d.amounts[dx*8+dz];
      if(amount>=(filter.minimum||0)&&inside(x,z))chunks.push({kind:d.kind,id:d.id,name:d.name,x,z,size:16,fieldX:d.x,fieldZ:d.z,amount,unit:'L/Op',source:'INITIAL',certainty:'INITIAL_PRODUCTION',color:d.color});
    }
    if(filter.fluidChunks==='best') {const best=chunks.reduce((best,c)=>!best||c.amount>best.amount?c:best,null);if(best)result.push(best);}
    else result.push(...chunks);
  }
  return result;
}
