// GalacticGreg asteroid prefix, matching desktop AsteroidOrePredictor (GPL-3.0).
import {long} from './random.js';
import {XstrRandom} from './prospecting.js';
import {chaosExcludes, freshIslandExcludes} from './asteroids.js';
import {islandInRegion} from './end.js';
import {validateResources} from './resources.js';

export const asteroidDimensions = new Set(['end','asteroids','mehen','kuiper_belt']);
export function validateAsteroidResources(p) {
  const int=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
  if(p?.schemaVersion!==1||p.algorithm!=='galacticgreg-asteroid-resources'||!Array.isArray(p.dimensions)||p.dimensions.length>128)
    throw new Error('小行星资源配置无效');
  const ids=new Set();
  for(const d of p.dimensions) {
    if(!int(d.id,-2147483648,2147483647)||ids.has(d.id)||!['asteroids','end'].includes(d.routing))throw new Error('小行星维度无效');
    ids.add(d.id);
    const c=d.config;
    if(!c||typeof c.enabled!=='boolean'||!int(c.probability,0,100)||!int(c.minY,0,254)||!int(c.maxY,c.minY+1,255)
      ||!int(c.minRadius,1,127)||!int(c.maxRadius,c.minRadius,127)||!Array.isArray(d.materials)||d.materials.length>1024)
      throw new Error('小行星高度、大小或材料配置无效');
    if(d.routing==='end'&&(!p.end||typeof p.end.heeEnabled!=='boolean'||typeof p.end.chaosEnabled!=='boolean'
      ||!int(p.end.chaosRadius,0,30000000)||!int(p.end.chaosSeparation,256,30000000)))throw new Error('末地分流配置无效');
    for(const stone of d.materials)for(const [field,kind] of [['veins','ASTEROID_VEIN'],['small','ASTEROID_SMALL']]) {
      if(!Array.isArray(stone[field])||stone[field].length>4096)throw new Error('小行星矿物列表无效');
      let total=0;
      for(const e of stone[field]) {
        if(!int(e.weight,0,2147483647))throw new Error('小行星矿物权重无效');
        total+=e.weight;
        validateResources([{...e.display,kind,source:'PREDICTED',x:0,z:0,y:64,size:2,minY:61,maxY:66}],'ORES');
      }
      if(total>2147483647)throw new Error('小行星总权重无效');
    }
  }
  return p;
}

export function selectAsteroidResource(seed,dimension,cx,cz,d) {
  const c=d.config;
  if(!c.enabled||!d.materials.length)return null;
  const state=long(BigInt(seed)+BigInt(cx)*341873128712n+BigInt(cz)*132897987541n+BigInt(dimension)+588283n);
  if(new XstrRandom(state).nextInt(100)>c.probability)return null;
  const stone=d.materials[d.materials.length===1?0:new XstrRandom(state).nextInt(d.materials.length)];
  const random=new XstrRandom(state),small=random.nextInt(5)===0,entries=stone[small?'small':'veins'];
  const total=entries.reduce((n,e)=>n+e.weight,0);
  if(!total)return null;
  let roll=new XstrRandom(random.state).nextInt(total),display;
  for(const entry of entries){roll-=entry.weight;if(roll<0){display=entry.display;break;}}
  if(!display)return null;
  const x=cx*16+random.nextInt(16),y=c.minY+random.nextInt(c.maxY-c.minY),z=cz*16+random.nextInt(16);
  const size=2*(c.minRadius+random.nextInt(c.maxRadius-c.minRadius+1));
  return {...display,kind:small?'ASTEROID_SMALL':'ASTEROID_VEIN',source:'PREDICTED',x,y,z,size,
    minY:Math.max(0,y-size-1),maxY:Math.min(254,y+size)};
}

// Explicit seed-only model: it does not claim to reproduce a regenerated or loaded End.
export function createFreshEndClassifier(seed,input,config={}) {
  const p={...input,chaosEnabled:config.chaosEnabled??input.chaosEnabled,chaosSeparation:config.chaosSeparation??input.chaosSeparation};
  if(typeof p.chaosEnabled!=='boolean'||!Number.isInteger(p.chaosSeparation)||p.chaosSeparation<256||p.chaosSeparation>30000000)
    throw new Error('末地混沌岛配置无效');
  const cache=new Map(),lookup=(s,x,z)=>{const key=`${x}:${z}`;if(!cache.has(key))cache.set(key,islandInRegion(s,x,z));return cache.get(key);};
  return (cx,cz)=>((Math.imul(cx,cx)+Math.imul(cz,cz))|0)>256
    && !chaosExcludes(cx,cz,p)&&!(p.heeEnabled&&freshIslandExcludes(seed,cx,cz,lookup));
}
