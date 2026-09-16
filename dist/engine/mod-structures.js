import { JavaRandom, forgeRandom, long } from "./random.js";

export const modDefaults = {
  lootGamesEnabled: false, lootGamesRhombus: 20,
  slimeOverworldEnabled: false, slimeNetherEnabled: false, slimeRarity: 8000,
  meteoritesEnabled: false, meteoriteDistance: 707, meteoriteSurfaceChance: 0.3,
  netherSpiresEnabled: false, netherSpireChance: 140,
};

export function validateModConfig(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("无效模组结构配置");
  const out = {...modDefaults};
  for (const key of Object.keys(out)) if (key in value) {
    const v = value[key];
    if (key.endsWith("Enabled")) {
      if (typeof v !== "boolean") throw new Error(`无效生成开关：${key}`);
    } else if (key === "meteoriteSurfaceChance") {
      if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error("无效陨石地表概率");
    } else {
      const [min,max] = key === "lootGamesRhombus" ? [5,100] : key === "meteoriteDistance" ? [8,1000000] : [1,2147483647];
      if (!Number.isInteger(v) || v < min || v > max) throw new Error(`无效生成参数：${key}`);
    }
    out[key] = v;
  }
  return out;
}

// Ported from the reference Worker's ModStructurePredictor/Ae2MeteoritePredictor.
// Caller validates the area; all markers use native dimension block coordinates.
export function predictModStructures({seed, dimension, bounds: b, config = {}}, candidates) {
  if (!["overworld", "nether"].includes(dimension)) return [];
  const c = validateModConfig(config.modStructures), result = [];
  const add = (kind,x,z,source,certainty="POSSIBLE",subtype="") => {
    if(x>=b.minX && x<b.maxX && z>=b.minZ && z<b.maxZ) result.push({kind,x,z,source,certainty,subtype});
  };
  const visit = (minOffset,maxOffset,fn) => {
    for(let z=Math.floor((b.minZ-maxOffset)/16);z<=Math.floor((b.maxZ-1-minOffset)/16);z++)
      for(let x=Math.floor((b.minX-maxOffset)/16);x<=Math.floor((b.maxX-1-minOffset)/16);x++) fn(x,z);
  };
  if(dimension === "overworld" && c.lootGamesEnabled) visit(8,8,(x,z)=>{
    const divisor=c.lootGamesRhombus*2,xc=x*2+z,zc=z*2+x;
    // Java division truncates toward zero; the left shift overflows at 32 bits.
    const r=new JavaRandom(long(BigInt(seed)+BigInt(Math.trunc(xc/divisor))+BigInt(Math.trunc(zc/divisor)<<14)));
    const p1=3+r.nextInt(divisor-3),p2=3+r.nextInt(divisor-3);
    const mx=(xc%divisor+divisor)%divisor,mz=(zc%divisor+divisor)%divisor;
    if(mx>=3 && mz>=3 && ((mx===p1 && mz===p2)||(mx===p1+1 && (mz===p2 || mz===p2+1))))
      add("LOOTGAMES_DUNGEON",x*16+8,z*16+8,"LootGames");
  });
  if(dimension === "nether" ? c.slimeNetherEnabled : c.slimeOverworldEnabled) {
    if(candidates?.slime)result.push(...candidates.slime);
    else visit(16,16,(x,z)=>{
    if(forgeRandom(seed,x,z).nextInt(c.slimeRarity)===0)
      add(dimension === "nether" ? "TINKERS_NETHER_SLIME_ISLAND" : "TINKERS_SLIME_ISLAND",x*16+16,z*16+16,"Tinkers' Construct","EXPECTED");
  });
  }
  if(dimension === "nether" && c.netherSpiresEnabled) {
    if(candidates?.spires)result.push(...candidates.spires);
    else visit(4,9,(x,z)=>{
    const r=forgeRandom(seed,x,z);
    if(r.nextInt(c.netherSpireChance)===0) add("AUTOMAGY_NETHER_SPIRE",x*16+r.nextInt(6)+4,z*16+r.nextInt(6)+4,"Automagy");
  });
  }
  if(dimension === "overworld" && c.meteoritesEnabled) {
    const distance=c.meteoriteDistance,margin=Math.max(1,Math.trunc(distance/10)),span=distance-2*margin;
    const x0=Math.floor((b.minX-(distance-margin-1))/distance),x1=Math.floor((b.maxX-1-margin)/distance);
    const z0=Math.floor((b.minZ-(distance-margin-1))/distance),z1=Math.floor((b.maxZ-1-margin)/distance);
    if((x1-x0+1)*(z1-z0+1)>65536) throw new Error("陨石查询范围过大，请放大地图");
    for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++) {
      const r=forgeRandom(seed,x,z),surface=r.nextDouble()<c.meteoriteSurfaceChance;
      add("AE2_METEORITE",x*distance+r.nextInt(span)+margin,z*distance+r.nextInt(span)+margin,"Applied Energistics 2","POSSIBLE",surface?"SURFACE_BIASED":"UNDERGROUND_BIASED");
    }
  }
  return result;
}

// GtnhNetherFortressProducer: +11 marker, unscaled Nether coordinates.
export function netherFortresses(seed,b) {
  const result=[];
  for(let rz=Math.floor(b.minZ/256);rz<=Math.floor((b.maxZ-1)/256);rz++)
    for(let rx=Math.floor(b.minX/256);rx<=Math.floor((b.maxX-1)/256);rx++) {
      const r=new JavaRandom(BigInt(rx^(rz<<4))^BigInt(seed));r.nextInt();
      if(r.nextInt(3)!==0) continue;
      const x=(rx*16+4+r.nextInt(8))*16+11,z=(rz*16+4+r.nextInt(8))*16+11;
      if(x>=b.minX && x<b.maxX && z>=b.minZ && z<b.maxZ)
        result.push({kind:"NETHER_FORTRESS",x,z,source:"Minecraft",certainty:"EXPECTED",subtype:""});
    }
  return result;
}
