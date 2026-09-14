import { JavaRandom, long, parseSeed } from './random.js';
import { validateBounds } from './native.js';
import { validateResources } from './resources.js';

// GT XSTR keeps the seed directly; nextInt uses signed remainder, not Random's rejection loop.
export class XstrRandom extends JavaRandom {
  setSeed(seed) { this.state = long(seed); }
  advance() {
    let value = long(this.state ^ (this.state << 21n));
    value = long(value ^ (BigInt.asUintN(64, value) >> 35n));
    this.state = long(value ^ (value << 4n));
    return this.state;
  }
  next(bits) { return Number(BigInt.asIntN(32, this.advance() & ((1n << BigInt(bits)) - 1n))); }
  nextInt(bound) {
    if (bound === undefined) return this.next(32);
    if (!Number.isInteger(bound) || bound < 1 || bound > 2147483647) throw new Error('Invalid XSTR bound');
    return Math.abs(Number(BigInt.asIntN(32, this.advance())) % bound);
  }
}
export function oreSelectionSeed(seed) {
  let hash = 0xcbf29ce484222325n;
  for (let shift = 56n; shift >= 0n; shift -= 8n)
    hash = long((hash ^ BigInt.asIntN(8, seed >> shift)) * 0x100000001b3n);
  for (let i = 0; i < 4; i++) hash = long(hash * 0x100000001b3n);
  return hash;
}
const intCast = v => Math.max(-2147483648, Math.min(2147483647, Math.trunc(v)));
const f = Math.fround;
export function fluidAmounts(config, random) {
  // Roots are exported by the JVM to avoid Math.pow differences between engines.
  const v = Math.max(config.minRoot, random.nextInt(config.drawBound) + random.nextDouble());
  const square = v * v, fourth = square * square;
  const average = intCast(v * fourth / 100); // GTUtility.powInt(v, 5), exact operation order.
  return Array.from({ length: 64 }, () => Math.max(0, Math.trunc(intCast(f(f(average) * f(.75 + f(random.nextFloat() / 2)))) / 5000)));
}

export function validateProspectingProfile(profile) {
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (profile?.schemaVersion !== 1 || !['EQUAL_SPACING','LEGACY'].includes(profile.orePattern)
      || !Array.isArray(profile.dimensions) || profile.dimensions.length > 128 || !profile.ores || typeof profile.ores !== 'object')
    throw new Error('资源配置包格式无效');
  const ids = new Set();
  for (const d of profile.dimensions) {
    if (!integer(d.id, -2147483648, 2147483647) || ids.has(d.id)) throw new Error('资源配置维度无效');
    ids.add(d.id);
    if (d.ores !== undefined) {
      if (!integer(d.oreChance, 0, 100) || !Array.isArray(d.ores) || d.ores.length > 4096) throw new Error('矿脉配置无效');
      let total = 0;
      for (const entry of d.ores) {
        if (!integer(entry.weight, 0, 2147483647) || (entry.display !== null && !Object.hasOwn(profile.ores, entry.display))) throw new Error('矿脉权重或显示信息无效');
        total += entry.weight;
        if (entry.display !== null) validateResources([{...profile.ores[entry.display],kind:'ORE_VEIN',source:'PREDICTED',size:16,x:8,z:8}], 'ORES');
      }
      if (total > 2147483647) throw new Error('矿脉总权重超出支持范围');
    }
    if (d.fluids !== undefined) {
      if (!Array.isArray(d.fluids) || d.fluids.length > 1024 || !integer(d.fluidWeight, 1, 2147483647)) throw new Error('流体权重无效');
      for (const entry of d.fluids) {
        if (!integer(entry.weight, 0, 2147483647) || !integer(entry.drawBound, 1, 2147483647) || !Number.isFinite(entry.minRoot) || entry.minRoot < 0) throw new Error('流体产量配置无效');
        if (entry.display !== null) validateResources([{...entry.display,kind:'FLUID_FIELD',source:'INITIAL',size:128,x:0,z:0,amounts:Array(64).fill(0)}], 'FLUID');
      }
    }
  }
  return profile;
}

export function createProspectingProvider(input, dimensionIds, { yieldTask = () => new Promise(r => setTimeout(r,0)), now = () => performance.now() } = {}) {
  // Clone once: later configuration edits cannot silently change an installed profile.
  const profile = validateProspectingProfile(structuredClone(input));
  const ids = {...dimensionIds}, dimensions = new Map(profile.dimensions.map(d => [d.id,d]));
  return { apiVersion: 1, async predictResources(q, { signal } = {}) {
    const seed = BigInt(parseSeed(q.seed)); validateBounds(q.bounds, 16777216);
    if (!['ORES','FLUID'].includes(q.mode)) throw new Error('未知资源图层');
    if (signal?.aborted) throw new Error('CANCELLED');
    const id = ids[q.dimension], d = dimensions.get(id);
    if (!d || !Object.hasOwn(ids,q.dimension)) return null;
    if (q.config?.dimensionIds?.[q.dimension] !== undefined && q.config.dimensionIds[q.dimension] !== id)
      throw new Error('维度 ID 已改变，请重新导出匹配的资源配置包');
    const fluids = q.mode === 'FLUID', entries = fluids ? d.fluids : d.ores;
    if (!entries?.length) return null;
    const stride = fluids ? 8 : 1, b = q.bounds, result = [];
    const minX = Math.floor(b.minX / (16*stride))*stride, minZ = Math.floor(b.minZ / (16*stride))*stride;
    const endX = Math.floor((b.maxX-1) / (16*stride))*stride, endZ = Math.floor((b.maxZ-1) / (16*stride))*stride;
    if (((endX-minX)/stride+1)*((endZ-minZ)/stride+1)>65536)
      throw new Error('资源查询区块过多，请放大地图或缩小导出范围');
    const total = fluids ? d.fluidWeight : entries.reduce((n,e) => n + e.weight,0);
    let deadline = now()+16;
    for (let cz=minZ;cz<=endZ;cz+=stride) for(let cx=minX;cx<=endX;cx+=stride) {
      if (fluids) {
        const random = new XstrRandom(seed + BigInt(id)*2n + BigInt(cx>>3) + 8267n*BigInt(cz>>3));
        let roll = random.nextInt(1000), chosen;
        for (const entry of entries) {
          const weight = Math.trunc(Math.imul(entry.weight,1000) / total);
          if (roll <= weight) { chosen=entry; break; } // Inclusive even at zero weight, as in GT.
          roll -= weight;
        }
        if (chosen?.display) result.push({...chosen.display,kind:'FLUID_FIELD',source:'INITIAL',x:cx*16,z:cz*16,size:128,amounts:fluidAmounts(chosen,random)});
      } else {
        const mod = x => profile.orePattern === 'EQUAL_SPACING' ? (x%3+3)%3 : Math.abs(x)%3;
        if (mod(cx)===1 && mod(cz)===1 && total>0) {
          const oreSeed = long(seed<<16n) ^ ((BigInt(id)&255n)<<56n | (BigInt(cx)&0xfffffffn)<<28n | BigInt(cz)&0xfffffffn);
          if (new XstrRandom(oreSeed).nextInt(100) < d.oreChance) {
            let roll = new XstrRandom(oreSelectionSeed(oreSeed)).nextInt(total);
            for(const entry of entries) {
              roll -= entry.weight;
              if(roll<0) {
                if(entry.display!==null) result.push({...profile.ores[entry.display],kind:'ORE_VEIN',source:'PREDICTED',size:16,x:cx*16+8,z:cz*16+8});
                break;
              }
            }
          }
        }
      }
      if(now()>=deadline) { await yieldTask(); if(signal?.aborted)throw new Error('CANCELLED'); deadline=now()+16; }
    }
    if(signal?.aborted)throw new Error('CANCELLED');
    return result;
  }};
}
