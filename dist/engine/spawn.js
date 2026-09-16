import {parseSeed} from './random.js';
import {rwgSpawn,SPAWN_PROVIDERS,unavailableSpawn} from './navigation.js';

// A separate, lazily loaded replay engine. Worker serialization owns its mutable state.
export function createSpawnPredictor(profile,loadEngine,{yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0)),cacheLimit=64}={}){
  if(profile?.schemaVersion!==2||!Object.values(SPAWN_PROVIDERS).includes(profile.provider)
    ||!Array.isArray(profile.blocks)||!profile.blocks.length||profile.blocks.length>65536
    ||profile.blocks.some(v=>typeof v!=='string'||!v.includes(':'))||new Set(profile.blocks).size!==profile.blocks.length
    ||!Array.isArray(profile.spawnBiomes)||profile.spawnBiomes.some(v=>!Number.isInteger(v)||v<0||v>65535)
    ||typeof profile.generateCaves!=='boolean'||profile.caveClass!=='net.minecraft.world.gen.MapGenCaves'
    ||!Number.isInteger(cacheLimit)||cacheLimit<1||cacheLimit>256)throw new Error('Invalid spawn replay profile');
  let loading,currentSeed;const chunks=new Map(),results=new Map();
  const check=signal=>{if(signal?.aborted)throw new Error('CANCELLED');};
  async function engine(){
    if(!loading)loading=Promise.resolve().then(loadEngine).then(e=>{
      if(typeof e?.configureSeed!=='function'||typeof e?.surfaces!=='function')throw new Error('Incomplete spawn replay engine');
      return e;
    }).catch(error=>{loading=undefined;throw error;});
    return loading;
  }
  return async (q,{signal}={})=>{
    check(signal);if(q.dimension!=='overworld')return unavailableSpawn();
    const seed=parseSeed(q.seed).toString();
    if(results.has(seed)){const result=results.get(seed);results.delete(seed);results.set(seed,result);return {...result};}
    const e=await engine();check(signal);
    if(currentSeed!==seed){currentSeed=undefined;chunks.clear();e.configureSeed(seed);currentSeed=seed;}
    const result=await rwgSpawn(seed,async(x,z)=>{
      check(signal);const cx=Math.floor(x/16),cz=Math.floor(z/16),key=`${cx}:${cz}`;
      let values=chunks.get(key);
      if(!values){
        await yieldTask();check(signal);
        const raw=e.surfaces(cx,cz);check(signal);
        if(raw?.length!==1024)throw new Error('Incomplete spawn surfaces');
        for(let i=0;i<1024;i+=4)if(!Number.isInteger(raw[i])||!profile.blocks[raw[i]]
          ||!Number.isInteger(raw[i+1])||raw[i+1]<0||raw[i+1]>65535
          ||!Number.isInteger(raw[i+2])||raw[i+2]<63||raw[i+2]>255
          ||(raw[i+3]!==0&&raw[i+3]!==1))throw new Error('Invalid spawn surface');
        values=Int32Array.from(raw);chunks.set(key,values);
        if(chunks.size>cacheLimit)chunks.delete(chunks.keys().next().value);
      }else{chunks.delete(key);chunks.set(key,values);}
      const i=((z-cz*16)*16+x-cx*16)*4;
      return {block:profile.blocks[values[i]],spawnBiome:values[i+3]===1};
    },profile.provider,{signal,yieldTask});
    check(signal);results.set(seed,Object.freeze({...result}));
    if(results.size>4)results.delete(results.keys().next().value);
    return result;
  };
}
