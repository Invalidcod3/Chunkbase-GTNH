import {JavaRandom,parseSeed,long} from './random.js';
import {XstrRandom} from './prospecting.js';
import {validateBounds} from './native.js';
import {biomeRegistry} from './catalog.js';
import {regionalSpaceStructures} from './space-structures.js';
import {asteroidStructures} from './asteroid-structures.js';
import {createBiomeRasterCache} from './biome-raster-cache.js';

const f=Math.fround;
export function asteroidPointRandom(x,z){
  let n=(x+Math.imul(z,57))|0;n^=n<<13;
  n=(Math.imul(n,(Math.imul(Math.imul(n,n),15731)+789221)|0)+1376312589)&0x3fffffff;
  return f(1-f(f(n)/1073741824));
}
export function createExtraProvider(engine,input,keys,{registry=biomeRegistry,yieldTask=()=>new Promise(r=>setTimeout(r,0)),now=()=>performance.now(),rasterCacheBytes=8*1024*1024}={}){
  const profile=structuredClone(input),palette={...keys};let layerKey,noiseSeed;
  const rasters=createBiomeRasterCache(rasterCacheBytes);
  if(!profile.dimensions||!Number.isInteger(profile.rossRuinChance)||profile.rossRuinChance<1)throw new Error('扩展维度配置无效');
  const check=s=>{if(s?.aborted)throw new Error('CANCELLED');};
  function context(q){
    const d=profile.dimensions[q.dimension];if(!d)throw new Error('扩展函数包不支持此维度');
    if(q.config?.dimensionIds?.[q.dimension]!==undefined&&q.config.dimensionIds[q.dimension]!==d.id)throw new Error('维度 ID 与已校准函数包不匹配');
    return {d,seed:parseSeed(q.seed)};
  }
  function configure(graph,seed){const key=graph+':'+seed;if(key!==layerKey){layerKey=undefined;engine.configure(graph,seed);layerKey=key;}}
  function raster(x,z,w,h){w=Math.ceil(w/4)*4;h=Math.ceil(h/4)*4;const a=engine.biomes(x,z,w,h,false);if(a?.length!==w*h)throw new Error('扩展底图返回不完整');return {a,w};}
  const index=id=>{const b=registry.get(palette[id]);if(!b)throw new Error('扩展底图返回未登记群系：'+id);return b.index;};
  return {apiVersion:1,async sampleBiomes(q,{signal}={}){
    check(signal);const {d,seed}=context(q);
    if(!Number.isSafeInteger(q.x)||!Number.isSafeInteger(q.z)||!Number.isInteger(q.width)||!Number.isInteger(q.height)||q.width<1||q.height<1||q.width*q.height>262144||!Number.isInteger(q.step)||q.step<1||q.step>256)throw new Error('扩展底图请求无效');
    validateBounds({minX:q.x,minZ:q.z,maxX:q.x+(q.width-1)*q.step+1,maxZ:q.z+(q.height-1)*q.step+1},17179869184);
    const out=new Uint16Array(q.width*q.height);
    if(d.uniform!==undefined){out.fill(index(d.uniform));return out;}
    if(!d.graph)return null;
    const space=`${seed}/${q.dimension}/full`,cached=rasters.get(space,q);if(cached)return cached;
    configure(d.graph,seed);let deadline=now()+16;
    const columns=Math.max(1,Math.floor(255/q.step)+1),rows=Math.max(1,Math.floor(63/q.step)+1);
    for(let row=0;row<q.height;row+=rows)for(let col=0;col<q.width;col+=columns){
      check(signal);
      const w=Math.min(columns,q.width-col),h=Math.min(rows,q.height-row),raw=raster(q.x+col*q.step,q.z+row*q.step,(w-1)*q.step+1,(h-1)*q.step+1);
      for(let dz=0;dz<h;dz++)for(let dx=0;dx<w;dx++){
        let id=raw.a[dz*q.step*raw.w+dx*q.step];
        // A registry slot can hold a biome whose reported ID differs (161→160
        // in the calibrated 1.7.10 registry). Match the manager before scoping.
        id=d.biomeAliases?.[id]??id;id=d.replacements?.[id]??id;
        out[(row+dz)*q.width+col+dx]=index(id+(d.offset||0));
      }
      if(now()>=deadline){await yieldTask();check(signal);deadline=now()+16;}
    }
    await yieldTask();check(signal);rasters.put(space,q,out);return out;
  },async predictStructures(q,{signal}={}){
    validateBounds(q.bounds);check(signal);const {seed,d}=context(q),b=q.bounds;
    if(['deep_dark','anubis','horus'].includes(q.dimension))return regionalSpaceStructures(q);
    const result=[];let deadline=now()+16;
    if(q.dimension==='asteroids'){
      if(noiseSeed!==seed){noiseSeed=undefined;engine.configureNoise(seed);noiseSeed=seed;}
      return asteroidStructures({...q,seed,dimensionId:d.id},{engine,pointRandom:asteroidPointRandom,signal,yieldTask,now});
    }
    if(q.dimension==='mehen'){
      if(q.excludedKinds?.includes('MEHEN_DARK_MATTER_ASTEROID'))return [];
      if((b.maxX-b.minX)*(b.maxZ-b.minZ)>1048576)throw new Error('小行星扫描范围过大，请放大地图');
      if(noiseSeed!==seed){noiseSeed=undefined;engine.configureNoise(seed);noiseSeed=seed;}
      for(let z=b.minZ+(b.minZ&1);z<b.maxZ;z+=2){
        for(let x=b.minX+(b.minX&1);x<b.maxX;x+=2){
          if(asteroidPointRandom(x,z)>=f(f(engine.density(x,z)+f(.4))/800))continue;
          const random=new JavaRandom(BigInt((x+Math.imul(z,3067))|0));random.nextInt(160);const size=random.nextInt(20)+5;
          if(Math.trunc(110*Math.pow(random.nextDouble(),(size+5)*.05))===109)result.push({kind:'MEHEN_DARK_MATTER_ASTEROID',subtype:'',x,z,source:'Amun-Ra',certainty:'POSSIBLE'});
        }
        if(now()>=deadline){await yieldTask();check(signal);deadline=now()+16;}
      }
    }else if(q.dimension==='ross128b'){
      if(q.excludedKinds?.includes('ROSS_128B_RUIN'))return [];
      configure('vanilla',seed);const seen=new Set();
      const minCx=Math.floor((b.minX-18)/16),maxCx=Math.floor((b.maxX-4)/16);
      for(let cz=Math.floor((b.minZ-18)/16);cz<=Math.floor((b.maxZ-4)/16);cz++){
        for(let start=minCx;start<=maxCx;start+=64){
          const end=Math.min(maxCx,start+63),biomes=raster(start*16+16,cz*16+16,(end-start)*16+1,1);
          for(let cx=start;cx<=end;cx++){
          const id=biomes.a[(cx-start)*16];if([0,24,7,10,11].includes(id))continue;
          const random=new XstrRandom(seed);
          if(cx%4===0||cz%4===0){const a=random.nextLong()/2n*2n+1n,c=random.nextLong()/2n*2n+1n;random.setSeed(long(BigInt(cx)*a+BigInt(cz)*c)^BigInt(seed));}
          if(id!==2&&id!==17){random.nextInt(16);const y=random.nextInt(256);random.nextInt(16);const lake=random.nextInt(8);if((lake===0||lake===4)&&y>4)continue;}
          if(random.nextInt(profile.rossRuinChance)!==0)continue;
          const x=cx*16+random.nextInt(16)+3;random.nextInt(256);const z=cz*16+random.nextInt(16)+3,key=x+':'+z;
          if(x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ&&!seen.has(key)){seen.add(key);result.push({kind:'ROSS_128B_RUIN',subtype:'Terrain-dependent ruin attempt',x,z,source:'BartWorks',certainty:'POSSIBLE'});}
          }
          if(now()>=deadline){await yieldTask();check(signal);deadline=now()+16;}
        }
        if(now()>=deadline){await yieldTask();check(signal);deadline=now()+16;}
      }
    }
    check(signal);return result;
  }};
}
