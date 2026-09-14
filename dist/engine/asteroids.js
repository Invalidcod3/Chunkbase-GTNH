// GalacticGreg selector from reference EndAsteroidPredictor (GPL-3.0).
// Exclusions model a fresh End for the requested seed, without a loaded game world.
import {long,parseSeed} from './random.js';
import {XstrRandom} from './prospecting.js';
import {islandInRegion} from './end.js';
import {predictStructures,validateBounds} from './native.js';

export const asteroidKinds=Object.freeze({
  'ore.mix.naquadah':'END_NAQUADAH_ASTEROID',
  'ore.mix.tungstate':'END_SCHEELITE_ASTEROID',
  'ore.mix.platinum':'END_PLATINUM_ASTEROID',
});
export function validateAsteroidProfile(p) {
  const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  if(p?.schemaVersion!==1||p.algorithm!=='galacticgreg-current'||typeof p.enabled!=='boolean'
      ||!int(p.probability,0,100)||!int(p.minY,0,255)||!int(p.maxY,p.minY+1,256)
      ||typeof p.chaosEnabled!=='boolean'||!int(p.chaosSeparation,256,30000000)||!int(p.chaosRadius,0,30000000)
      ||!Array.isArray(p.materials)||p.materials.length>1024)throw new Error('末地小行星配置无效');
  for(const entries of p.materials) {
    if(!Array.isArray(entries)||entries.length>4096)throw new Error('小行星矿物列表无效');
    let total=0;
    for(const e of entries) {
      if(typeof e.name!=='string'||e.name.length>256||!int(e.weight,0,2147483647))throw new Error('小行星矿物权重无效');
      total+=e.weight;
    }
    if(total>2147483647)throw new Error('小行星矿物总权重无效');
  }
  return p;
}
export function selectAsteroid(seed,cx,cz,p) {
  if(!p.enabled||cx*cx+cz*cz<=256||!p.materials.length)return null;
  const state=long(BigInt(seed)+BigInt(cx)*341873128712n+BigInt(cz)*132897987541n+588284n);
  if(new XstrRandom(state).nextInt(100)>p.probability)return null;
  // Both the stone and vein selectors receive copies; their draws never advance the main stream.
  const material=p.materials.length===1?0:new XstrRandom(state).nextInt(p.materials.length);
  const entries=p.materials[material],random=new XstrRandom(state);
  if(random.nextInt(5)===0)return null;
  const total=entries.reduce((n,e)=>n+e.weight,0);if(!total)return null;
  let roll=new XstrRandom(random.state).nextInt(total),kind;
  for(const e of entries) {roll-=e.weight;if(roll<0){kind=asteroidKinds[e.name];break;}}
  if(!kind)return null;
  const x=cx*16+random.nextInt(16);random.nextInt(p.maxY-p.minY);
  return {kind,x,z:cz*16+random.nextInt(16)};
}
export function chaosExcludes(cx,cz,{chaosEnabled,chaosRadius,chaosSeparation:s}) {
  if(!chaosEnabled||chaosRadius<=0)return false;
  // DE rounds absolute coordinates; negative half-spacing ties round away from zero.
  const nearest=v=>Math.sign(v)*(Math.abs(v)-Math.abs(v)%s+(Math.abs(v)%s>=Math.trunc(s/2)?s:0));
  const x=nearest(cx*16),z=nearest(cz*16);
  return Boolean(x||z)&&(cx*16+8-x)**2+(cz*16+8-z)**2<=chaosRadius**2;
}
export function freshIslandExcludes(seed,cx,cz,lookup=islandInRegion) {
  // GT's scanner stores the island start at index +7 then checks a +/-7 window.
  // Thus the exclusion is an inclusive 15x15 chunk square starting at the island start.
  for(let rx=Math.floor((cx-14)/28);rx<=Math.floor(cx/28);rx++)
    for(let rz=Math.floor((cz-14)/28);rz<=Math.floor(cz/28);rz++) {
      const i=lookup(seed,rx,rz);
      if(i&&cx>=i.cx&&cx<=i.cx+14&&cz>=i.cz&&cz<=i.cz+14)return true;
    }
  return false;
}
export function createAsteroidProvider(input,{yieldTask=()=>new Promise(r=>setTimeout(r,0)),now=()=>performance.now()}={}) {
  const profile=validateAsteroidProfile(structuredClone(input));
  return {apiVersion:1,async predictStructures(q,{signal}={}) {
    if(q.dimension!=='end')return null;
    const seed=BigInt(parseSeed(q.seed)),b=q.bounds;validateBounds(b);
    if(signal?.aborted)throw new Error('CANCELLED');
    if(q.config?.dimensionIds?.end!==undefined&&q.config.dimensionIds.end!==1)throw new Error('末地维度 ID 与小行星配置不匹配');
    const config={...profile,chaosEnabled:q.config?.chaosEnabled??profile.chaosEnabled,chaosSeparation:q.config?.chaosSeparation??profile.chaosSeparation};
    validateAsteroidProfile(config);
    const result=predictStructures({...q,config:{...q.config,chaosEnabled:config.chaosEnabled,chaosSeparation:config.chaosSeparation}});
    const excluded=new Set(q.excludedKinds||[]);
    if(Object.values(asteroidKinds).every(k=>excluded.has(k))||!profile.enabled)return result;
    const minX=Math.floor(b.minX/16),maxX=Math.floor((b.maxX-1)/16),minZ=Math.floor(b.minZ/16),maxZ=Math.floor((b.maxZ-1)/16);
    if((maxX-minX+1)*(maxZ-minZ+1)>262144)throw new Error('小行星扫描范围过大，请放大地图');
    const cache=new Map(),lookup=(s,rx,rz)=>{const key=`${rx}:${rz}`;if(!cache.has(key))cache.set(key,islandInRegion(s,rx,rz));return cache.get(key);};
    let deadline=now()+16;
    for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++) {
      const c=selectAsteroid(seed,cx,cz,profile);
      if(c&&!excluded.has(c.kind)&&c.x>=b.minX&&c.x<b.maxX&&c.z>=b.minZ&&c.z<b.maxZ
          &&!chaosExcludes(cx,cz,config)&&!freshIslandExcludes(seed,cx,cz,lookup))
        result.push({...c,subtype:'GalacticGreg End asteroid',certainty:'EXACT_FRESH_END',source:'GregTech / GalacticGreg'});
      if(now()>=deadline){await yieldTask();if(signal?.aborted)throw new Error('CANCELLED');deadline=now()+16;}
    }
    if(signal?.aborted)throw new Error('CANCELLED');
    return result;
  }};
}
