import {parseSeed} from './random.js';
import {validateBounds} from './native.js';
import {biomeRegistry,markerTypeKey} from './catalog.js';

export function createTwilightProvider(engine,input,keys,{registry=biomeRegistry,yieldTask=()=>new Promise(r=>setTimeout(r,0)),now=()=>performance.now()}={}) {
  const profile=structuredClone(input),palette={...keys};
  if(typeof profile.oldMapGen!=='boolean'||!Number.isInteger(profile.dimensionId))throw new Error('暮色配置无效');
  let currentSeed;
  const check=signal=>{if(signal?.aborted)throw new Error('CANCELLED');};
  function configure(q){
    if(q.dimension!=='twilight')throw new Error('暮色函数包只支持暮色森林');
    if(q.config?.dimensionIds?.twilight!==undefined&&q.config.dimensionIds.twilight!==profile.dimensionId)throw new Error('暮色维度 ID 与函数包不匹配');
    const seed=parseSeed(q.seed);if(seed!==currentSeed){currentSeed=undefined;engine.configure(seed,profile.oldMapGen);currentSeed=seed;}
  }
  const index=id=>{const biome=registry.get(palette[id]);if(!biome)throw new Error('暮色返回了未登记的群系：'+id);return biome.index;};
  return {apiVersion:1,async sampleBiomes(q,{signal}={}) {
    if(!Number.isInteger(q.width)||!Number.isInteger(q.height)||q.width<1||q.height<1||q.width*q.height>262144
      ||!Number.isInteger(q.step)||q.step<1||q.step>256||!Number.isSafeInteger(q.x)||!Number.isSafeInteger(q.z))throw new Error('暮色底图请求无效');
    validateBounds({minX:q.x,minZ:q.z,maxX:q.x+(q.width-1)*q.step+1,maxZ:q.z+(q.height-1)*q.step+1},17179869184);
    check(signal);configure(q);
    const result=new Uint16Array(q.width*q.height),quarter=q.step>=4;
    if(q.step===1||q.step===4) {
      if(quarter&&(q.x%4||q.z%4))throw new Error('暮色四分之一底图须对齐 4 方块网格');
      for(let row=0;row<q.height;row+=16) {
        const height=Math.min(16,q.height-row),raw=engine.biomes(q.x/q.step,q.z/q.step+row,q.width,height,quarter);
        if(raw?.length!==q.width*height)throw new Error('暮色返回了不完整的底图');
        result.set(Uint16Array.from(raw,index),row*q.width);await yieldTask();check(signal);
      }
    } else {
      // Distant views downsample the same quarter layer used by Amidst, without huge intermediate rasters.
      let deadline=now()+16;
      for(let row=0;row<q.height;row++)for(let col=0;col<q.width;col++) {
        const scale=quarter?4:1,raw=engine.biomes(Math.floor((q.x+col*q.step)/scale),Math.floor((q.z+row*q.step)/scale),1,1,quarter);
        if(raw?.length!==1)throw new Error('暮色返回了不完整的底图');
        result[row*q.width+col]=index(raw[0]);
        if(now()>=deadline){await yieldTask();check(signal);deadline=now()+16;}
      }
    }
    return result;
  },async predictStructures(q,{signal}={}) {
    validateBounds(q.bounds);check(signal);configure(q);
    const b=q.bounds,result=[],excluded=new Set(q.excludedKinds||[]);
    if(excluded.has('TWILIGHT_FEATURE'))return result;
    for(let z=b.minZ;z<b.maxZ;z+=512) {
      const values=engine.features(b.minX,z,b.maxX-b.minX,Math.min(512,b.maxZ-z));
      for(const value of values) {
        const [subtype,x,z]=value.split('|'),marker={kind:'TWILIGHT_FEATURE',subtype,x:Number(x),z:Number(z),certainty:'EXACT',source:'Twilight Forest'};
        if(!Number.isInteger(marker.x)||!Number.isInteger(marker.z))throw new Error('暮色结构坐标无效');
        if(!excluded.has(markerTypeKey(marker)))result.push(marker);
      }
      await yieldTask();check(signal);
    }
    return result;
  }};
}
