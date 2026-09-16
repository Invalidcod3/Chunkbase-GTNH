import {JavaRandom,parseSeed} from './random.js';

export function strongholdLocations(seed){
  const r=new JavaRandom(parseSeed(seed)),result=[];let angle=r.nextDouble()*Math.PI*2;
  for(let i=0;i<3;i++){
    const distance=(1.25+r.nextDouble())*32;
    result.push({kind:'STRONGHOLD',x:Math.floor(Math.cos(angle)*distance+.5)*16,z:Math.floor(Math.sin(angle)*distance+.5)*16});
    angle+=Math.PI*2/3;
  }
  return result;
}
export const SPAWN_PROVIDERS={vanilla:'net.minecraft.world.WorldProviderSurface',bop:'biomesoplenty.common.world.WorldProviderSurfaceBOP'};
export const unavailableSpawn=()=>({kind:'WORLD_SPAWN',status:'UNAVAILABLE',reason:'SPAWN_SURFACE_UNAVAILABLE'});
export function acceptsSpawnSurface(provider,surface){
  if(!surface?.block)return false;
  if(provider===SPAWN_PROVIDERS.vanilla)return surface.block==='minecraft:grass';
  if(provider===SPAWN_PROVIDERS.bop)return surface.block==='minecraft:sand'||surface.block==='minecraft:stone'||surface.block==='minecraft:snow_layer'&&surface.spawnBiome===true;
  return false;
}
// Only a verified full surface replay may call this entry. A biome ID or its
// default top block cannot stand in for the actual post-cave surface column.
export async function rwgSpawn(seed,surfaceAt,provider,{signal,yieldTask=()=>Promise.resolve(),initial=()=>null}={}){
  if(!Object.values(SPAWN_PROVIDERS).includes(provider)||typeof surfaceAt!=='function')return unavailableSpawn();
  const r=new JavaRandom(parseSeed(seed)),start=initial(r);let x=start?.x??0,z=start?.z??0,attempts=0;
  while(attempts<1000){
    if(signal?.aborted)throw new Error('CANCELLED');
    const surface=await surfaceAt(x,z);if(signal?.aborted)throw new Error('CANCELLED');
    if(acceptsSpawnSurface(provider,surface))return {kind:'WORLD_SPAWN',status:'ESTIMATED',x,z,subtype:'',source:'RWG',certainty:'POSSIBLE',attempts,viable:true};
    x+=r.nextInt(64)-r.nextInt(64);z+=r.nextInt(64)-r.nextInt(64);attempts++;
    if(attempts%8===0)await yieldTask();
  }
  if(signal?.aborted)throw new Error('CANCELLED');
  return {kind:'WORLD_SPAWN',status:'ESTIMATED',x,z,subtype:'',source:'RWG',certainty:'POSSIBLE',attempts,viable:false};
}
