import {JavaRandom,forgeRandom,regionRandom,long,parseSeed} from './random.js';
import {validateBounds} from './native.js';

export function validateSurfaceProfile(input) {
  const p=structuredClone(input),t=p?.thaumcraft,r=p?.roguelike;
  if(p?.schemaVersion!==1||!t||!r||!p.biomes||!Number.isInteger(t.nodeRarity)||t.nodeRarity<1||!Number.isInteger(r.frequency)||r.frequency<1||r.frequency>100000)
    throw new Error('无效地表结构配置');
  for(const k of ['genAura','genStructure','genTrees','genCinnibar','genAmber','genInfusedStone'])if(typeof t[k]!=='boolean')throw new Error('缺少神秘时代生成开关');
  if(!Array.isArray(r.builtin)||!Array.isArray(r.custom)||r.builtin.length+r.custom.length>4096)throw new Error('无效 Roguelike 设置列表');
  for(const s of [...r.builtin,...r.custom,r.base])if(!s||!Number.isInteger(s.weight)||s.weight<0||typeof s.tower!=='string')throw new Error('无效 Roguelike 权重');
  for(const b of Object.values(p.biomes))if(!Array.isArray(b.tags)||typeof b.name!=='string'||!Number.isFinite(b.greatwood))throw new Error('无效结构群系目录');
  return p;
}

export function rogueTower(biome,random,r) {
  // Mirrors SpawnCriteria for dimension 0. This version checks the global blacklist;
  // its local-blacklist self-add bug does not affect validity, so no mutation is replayed.
  const valid=s=>{
    if(s.disabled||r.blacklist?.includes(0))return false;
    const whitelist=[...(r.whitelist||[]),...(s.whitelist||[])];
    return (!whitelist.length||whitelist.includes(0)) && (s.names===null&&s.tags===null||s.names?.includes(biome.name)||s.tags?.some(t=>biome.tags.includes(t)));
  };
  const select=list=>{
    const candidates=list.filter(valid),sum=candidates.reduce((n,s)=>n+s.weight,0);
    if(!sum)return null;if(sum>2147483647)throw new Error('Roguelike 总权重溢出');
    let roll=random.nextInt(sum);
    for(const s of candidates){roll-=s.weight;if(roll<0)return s.tower;}
    return null;
  };
  const builtin=select(r.builtin),custom=select(r.custom);
  return custom || (builtin&&r.novelty?builtin:valid(r.base)?r.base.tower:null);
}

export async function surfaceStructures(q,sample,p,{signal,yieldTask=()=>new Promise(r=>setTimeout(r,0)),now=()=>performance.now()}={}) {
  parseSeed(q.seed);validateBounds(q.bounds);if(q.dimension!=='overworld')throw new Error('地表结构只支持主世界');
  const b=q.bounds,t=p.thaumcraft,r=p.roguelike,result=[],seed=BigInt(q.seed);
  const biome=(x,z)=>{const id=sample(x,z);if(!Object.hasOwn(p.biomes,id))throw new Error('结构包缺少群系 '+id);return p.biomes[id];};
  const wanted=kind=>!q.excludedKinds?.includes(kind);
  const add=(kind,subtype,x,z,source)=>{if(wanted(kind)&&x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ)result.push({kind,subtype,x,z,certainty:'POSSIBLE',source});};
  const cancel=()=>{if(signal?.aborted)throw new Error('CANCELLED');};
  let deadline=now()+16;cancel();
  const pause=async()=>{await yieldTask();cancel();deadline=now()+16;};
  if(r.natural&&wanted('ROGUELIKE_DUNGEON')) {
    const min=Math.max(2,Math.trunc(8*r.frequency/10)),max=Math.max(8,Math.trunc(32*r.frequency/10));
    const rx0=Math.floor(Math.floor((b.minX-103)/16)/max),rz0=Math.floor(Math.floor((b.minZ-103)/16)/max);
    const rx1=Math.floor(Math.floor((b.maxX-1+95)/16)/max),rz1=Math.floor(Math.floor((b.maxZ-1+95)/16)/max);
    if((rx1-rx0+1)*(rz1-rz0+1)>4096)throw new Error('Roguelike 查询范围过大');
    for(let rz=rz0;rz<=rz1;rz++)for(let rx=rx0;rx<=rx1;rx++) {
      const placement=regionRandom(seed,rx,rz,10387312),cx=rx*max+placement.nextInt(max-min),cz=rz*max+placement.nextInt(max-min),random=forgeRandom(seed,cx,cz);
      for(let attempt=0;attempt<50;attempt++) {
        const distance=40+random.nextInt(60),angle=random.nextDouble()*2*Math.PI;
        const x=cx*16+4+Math.trunc(Math.cos(angle)*distance),z=cz*16+4+Math.trunc(Math.sin(angle)*distance),found=biome(x,z);
        if(found.tags.some(tag=>['RIVER','BEACH','MUSHROOM','OCEAN'].includes(tag)))continue;
        const type=rogueTower(found,random,r);if(type)add('ROGUELIKE_DUNGEON',type,x,z,'Roguelike Dungeons');break;
      }
      if(now()>=deadline)await pause();
    }
  }
  // The reference deliberately omits chunks whose tree/node generation would alter RNG unpredictably.
  if((wanted('THAUMCRAFT_AURA_NODE')||wanted('THAUMCRAFT_ELDRITCH_ALTAR'))&&!t.genCinnibar&&!t.genAmber&&!t.genInfusedStone) {
    const minX=Math.floor((b.minX-15)/16),minZ=Math.floor((b.minZ-15)/16),maxX=Math.floor((b.maxX-1)/16),maxZ=Math.floor((b.maxZ-1)/16);
    if((maxX-minX+1)*(maxZ-minZ+1)>262144)throw new Error('神秘时代查询区块过多');
    function vegetation(random,cx,cz) {
      if(t.dimensionBlacklist!==-1||!t.genTrees||biome(cx*16+8,cz*16+8).blacklist!==-1)return true;
      if(random.nextInt(60)===3){const x=cx*16+random.nextInt(16),z=cz*16+random.nextInt(16);if(biome(x,z).silverwood)return false;}
      if(random.nextInt(25)===7){const x=cx*16+random.nextInt(16),z=cz*16+random.nextInt(16);if(biome(x,z).greatwood>random.nextFloat())return false;}
      const x=cx*16+random.nextInt(16),z=cz*16+random.nextInt(16);
      if(biome(x,z).hotSand&&random.nextInt(30)===0)for(let i=0;i<18;i++){random.nextInt(8);random.nextInt(8);random.nextInt(4);random.nextInt(4);random.nextInt(8);random.nextInt(8);}
      return true;
    }
    function temple(cx,cz) {
      const rx=Math.floor(cx/32),rz=Math.floor(cz/32),placement=regionRandom(seed,rx,rz,14357617);
      if(cx!==rx*32+placement.nextInt(24)||cz!==rz*32+placement.nextInt(24))return null;
      const type=biome(cx*16+8,cz*16+8).temple;if(!type)return null;
      const random=new JavaRandom(seed),a=random.nextLong(),c=random.nextLong();random.setSeed(long(BigInt(cx)*a)^long(BigInt(cz)*c)^seed);
      const orientation=random.nextInt(4),even=orientation===0||orientation===2;
      return type==='JUNGLE'?[cx*16+(even?5:7),cz*16+(even?7:5)]:type==='SWAMP'?[cx*16+(even?3:4),cz*16+(even?4:3)]:[cx*16+10,cz*16+10];
    }
    function chunk(cx,cz) {
      const random=forgeRandom(seed,cx,cz);if(!vegetation(random,cx,cz))return;
      if(t.genAura&&t.dimensionBlacklist!==0&&t.dimensionBlacklist!==2) {
        const point=temple(cx,cz);
        if(point){add('THAUMCRAFT_AURA_NODE','SCATTERED_FEATURE',...point,'Thaumcraft');return;}
        if(random.nextInt(t.nodeRarity)===0){const x=cx*16+random.nextInt(16),z=cz*16+random.nextInt(16);add('THAUMCRAFT_AURA_NODE','WILD',x,z,'Thaumcraft');return;}
      }
      if(t.dimensionBlacklist===-1&&t.genStructure) {
        const x=cx*16+random.nextInt(16),z=cz*16+random.nextInt(16);
        if(random.nextInt(150)!==0&&random.nextInt(66)===0)add('THAUMCRAFT_ELDRITCH_ALTAR','',x,z,'Thaumcraft');
      }
    }
    for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++){chunk(cx,cz);if(now()>=deadline)await pause();}
  }
  cancel();return result;
}
