import {JavaRandom,parseSeed} from './random.js';
import {validateBounds} from './native.js';

const rules={deep_dark:{kind:'DEEP_DARK_DUNGEON',source:'Extra Utilities'},anubis:{kind:'ANUBIS_ROBOT_VILLAGE',source:'Amun-Ra',salt:1098540180186541n},horus:{kind:'HORUS_OBSIDIAN_PYRAMID',source:'Amun-Ra',salt:549865610521n}};
export function regionalSpaceStructures(q){
  validateBounds(q.bounds);const seed=BigInt(parseSeed(q.seed)),rule=rules[q.dimension];
  if(!rule)throw new Error('未支持的区域结构维度');
  if(q.excludedKinds?.includes(rule.kind))return [];
  const b=q.bounds,result=[];
  for(let rz=Math.floor(b.minZ/512);rz<=Math.floor((b.maxZ-1)/512);rz++)for(let rx=Math.floor(b.minX/512);rx<=Math.floor((b.maxX-1)/512);rx++){
    let x,z;
    if(q.dimension==='deep_dark'){
      const r=new JavaRandom(seed+BigInt(rx)+65535n*BigInt(rz));x=rx*512+r.nextInt(390)+61;z=rz*512+r.nextInt(390)+61;
    }else{
      const r=new JavaRandom(seed^rule.salt^BigInt(rx)^BigInt(rz)),cx=rx*32+r.nextInt(32),cz=rz*32+r.nextInt(32);
      x=cx*16;z=cz*16;
      if(q.dimension==='anubis'){const offset=new JavaRandom(seed^rule.salt^BigInt(cx)^BigInt(cz));x+=offset.nextInt(16);z+=offset.nextInt(16);}
    }
    if(x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ)result.push({kind:rule.kind,subtype:'',x,z,source:rule.source,certainty:'POSSIBLE'});
  }
  return result;
}

export const provider={apiVersion:1,async predictStructures(q,{signal}={}){
  if(signal?.aborted)throw new Error('CANCELLED');return regionalSpaceStructures(q);
}};
