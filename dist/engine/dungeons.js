import {JavaRandom,long,parseSeed} from './random.js';
import {validateBounds} from './native.js';

// Original Worker candidate test over a calibrated cave mask; never a guarantee of a generated spawner.
export function createDungeonPredictor(engine,input,height,{yieldTask=()=>new Promise(r=>setTimeout(r,0)),now=()=>performance.now(),cacheLimit=512}={}) {
  const profile=structuredClone(input),cache=new Map();let currentSeed;
  if(typeof profile.undergroundLakes!=='boolean'||typeof profile.undergroundLavaLakes!=='boolean'||!Number.isInteger(cacheLimit)||cacheLimit<1||cacheLimit>2048)throw new Error('刷怪笼配置无效');
  function cell(x,y,z) {
    if(y<0||y>=256)return 2;
    const cx=Math.floor(x/16),cz=Math.floor(z/16),key=`${cx}:${cz}`;
    if(!cache.has(key)) {
      const raw=engine.mask(cx,cz);if(raw?.length!==65536)throw new Error('洞穴函数返回了不完整的区块');
      cache.set(key,Uint8Array.from(raw));if(cache.size>cacheLimit)cache.delete(cache.keys().next().value);
    }
    return cache.get(key)[((x-cx*16)*16+z-cz*16)*256+y];
  }
  function possible(x,y,z,rx,rz) {
    if(y<6)return false;
    const surface=height(x,z);if(!Number.isFinite(surface))throw new Error('刷怪笼地表高度无效');
    if(y+5>=surface)return false;
    let openings=0;
    for(let px=x-rx-1;px<=x+rx+1;px++)for(let py=y-1;py<=y+4;py++)for(let pz=z-rz-1;pz<=z+rz+1;pz++) {
      if((py===y-1||py===y+4)&&cell(px,py,pz)!==0)return false;
      if((px===x-rx-1||px===x+rx+1||pz===z-rz-1||pz===z+rz+1)&&py===y&&cell(px,py,pz)===1&&cell(px,py+1,pz)===1)openings++;
    }
    return openings>=1&&openings<=5;
  }
  return async function predict(q,structures,{signal}={}) {
    if(q.dimension!=='overworld')throw new Error('刷怪笼候选只支持主世界');
    validateBounds(q.bounds);
    const check=()=>{if(signal?.aborted)throw new Error('CANCELLED');};check();
    if(q.excludedKinds?.includes('VANILLA_SPAWNER_DUNGEON'))return [];
    const seed=parseSeed(q.seed);
    if(seed!==currentSeed){currentSeed=undefined;cache.clear();engine.configure(seed);currentSeed=seed;}
    const b=q.bounds,base=new JavaRandom(seed),a=base.nextLong()/2n*2n+1n,c=base.nextLong()/2n*2n+1n;
    const nearby=structures.filter(m=>['STRONGHOLD','VILLAGE','MINESHAFT'].includes(m.kind)).map(m=>[Math.floor(m.x/16),Math.floor(m.z/16)]);
    const result=[];let deadline=now()+16;
    const minX=Math.floor((b.minX-23)/16),maxX=Math.floor((b.maxX-9)/16),minZ=Math.floor((b.minZ-23)/16),maxZ=Math.floor((b.maxZ-9)/16);
    if((maxX-minX+1)*(maxZ-minZ+1)>262144)throw new Error('刷怪笼扫描范围过大，请放大地图');
    for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++) {
      if(!nearby.some(([x,z])=>Math.abs(cx-x)<=8&&Math.abs(cz-z)<=8)) {
        const random=new JavaRandom(long(BigInt(cx)*a+BigInt(cz)*c)^BigInt(seed));
        if(!(profile.undergroundLakes&&random.nextInt(10)===0)&&!(profile.undergroundLavaLakes&&random.nextInt(18)===0)) {
          for(let attempt=0;attempt<8;attempt++) {
            const x=cx*16+random.nextInt(16)+8,y=random.nextInt(128),z=cz*16+random.nextInt(16)+8,rx=random.nextInt(2)+2,rz=random.nextInt(2)+2;
            if(possible(x,y,z,rx,rz)) {
              if(x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ)result.push({kind:'VANILLA_SPAWNER_DUNGEON',subtype:String(y),x,z,certainty:'POSSIBLE',source:'Minecraft / RWG'});
              break; // Loot changes the stream after the first successful attempt, even outside this query.
            }
          }
        }
      }
      if(now()>=deadline){await yieldTask();check();deadline=now()+16;}
    }
    check();return result;
  };
}
