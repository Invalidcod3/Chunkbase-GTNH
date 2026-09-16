import {parseSeed} from './random.js';
import {validateBounds} from './native.js';
import {biomeRegistry,markerTypeKey} from './catalog.js';
import {createBiomeRasterCache} from './biome-raster-cache.js';

export function createTwilightProvider(engine,input,keys,{registry=biomeRegistry,yieldTask=()=>new Promise(r=>setTimeout(r,0)),now=()=>performance.now(),rasterCacheBytes=8*1024*1024}={}) {
  const profile=structuredClone(input),palette={...keys};
  const rasters=createBiomeRasterCache(rasterCacheBytes);
  if(typeof profile.oldMapGen!=='boolean'||!Number.isInteger(profile.dimensionId))throw new Error('暮色配置无效');
  let currentSeed;
  const check=signal=>{if(signal?.aborted)throw new Error('CANCELLED');};
  function configure(q){
    if(q.dimension!=='twilight')throw new Error('暮色函数包只支持暮色森林');
    if(q.config?.dimensionIds?.twilight!==undefined&&q.config.dimensionIds.twilight!==profile.dimensionId)throw new Error('暮色维度 ID 与函数包不匹配');
    const seed=parseSeed(q.seed);if(seed!==currentSeed){currentSeed=undefined;engine.configure(seed,profile.oldMapGen);currentSeed=seed;}
  }
  const index=id=>{const biome=registry.get(palette[id]);if(!biome)throw new Error('暮色返回了未登记的群系：'+id);return biome.index;};
  function raster(x,z,width,height,quarter) {
    // Vanilla VoronoiZoom sizes its intermediate raster with width >> 2.
    // Pad full-resolution requests so an unaligned origin cannot overrun it.
    const w=quarter?width:Math.ceil(width/4)*4,h=quarter?height:Math.ceil(height/4)*4;
    const data=engine.biomes(x,z,w,h,quarter);
    if(data?.length!==w*h)throw new Error('暮色返回了不完整的底图');
    return {data,width:w};
  }
  return {apiVersion:1,async sampleBiomes(q,{signal}={}) {
    if(!Number.isInteger(q.width)||!Number.isInteger(q.height)||q.width<1||q.height<1||q.width*q.height>262144
      ||!Number.isInteger(q.step)||q.step<1||q.step>256||!Number.isSafeInteger(q.x)||!Number.isSafeInteger(q.z))throw new Error('暮色底图请求无效');
    validateBounds({minX:q.x,minZ:q.z,maxX:q.x+(q.width-1)*q.step+1,maxZ:q.z+(q.height-1)*q.step+1},17179869184);
    check(signal);
    const quarter=q.step>=4;
    if(q.step===4&&(q.x%4||q.z%4))throw new Error('暮色四分之一底图须对齐 4 方块网格');
    const space=`${parseSeed(q.seed)}/${q.dimension}/${quarter?'quarter':'full'}`;
    configure(q);
    const cached=rasters.get(space,q);if(cached)return cached;
    const result=new Uint16Array(q.width*q.height);
    let deadline=now()+16;
    if(q.step===1||q.step===4) {
      for(let row=0;row<q.height;row+=32) {
        check(signal);
        const height=Math.min(32,q.height-row),raw=raster(q.x/q.step,q.z/q.step+row,q.width,height,quarter);
        for(let dz=0;dz<height;dz++)result.set(Uint16Array.from(raw.data.slice(dz*raw.width,dz*raw.width+q.width),index),(row+dz)*q.width);
        if(now()>=deadline){await yieldTask();check(signal);deadline=now()+16;}
      }
    } else {
      // Batch a bounded source rectangle before downsampling. GenLayer's shared
      // neighbourhood work is much more expensive than copying extra pixels.
      const scale=quarter?4:1,stride=q.step/scale;
      const columns=Math.max(1,Math.floor(127/stride)+1),rows=Math.max(1,Math.floor(63/stride)+1);
      for(let row=0;row<q.height;row+=rows)for(let col=0;col<q.width;col+=columns) {
        check(signal);
        const w=Math.min(columns,q.width-col),h=Math.min(rows,q.height-row);
        const x=Math.floor((q.x+col*q.step)/scale),z=Math.floor((q.z+row*q.step)/scale);
        const width=Math.floor((q.x+(col+w-1)*q.step)/scale)-x+1,height=Math.floor((q.z+(row+h-1)*q.step)/scale)-z+1;
        const raw=raster(x,z,width,height,quarter);
        for(let dz=0;dz<h;dz++)for(let dx=0;dx<w;dx++) {
          const sx=Math.floor((q.x+(col+dx)*q.step)/scale)-x,sz=Math.floor((q.z+(row+dz)*q.step)/scale)-z;
          result[(row+dz)*q.width+col+dx]=index(raw.data[sz*raw.width+sx]);
        }
        if(now()>=deadline){await yieldTask();check(signal);deadline=now()+16;}
      }
    }
    // Even short requests allow queued cancellation before caching completion.
    await yieldTask();check(signal);rasters.put(space,q,result);return result;
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
