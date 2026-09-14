import { parseSeed } from "./random.js";
import { biomeRegistry } from "./catalog.js";
import { rwgStructures } from "./rwg-structures.js";
import { surfaceStructures, validateSurfaceProfile } from "./surface-structures.js";
import { createDungeonPredictor } from "./dungeons.js";

// The site installs a calibrated engine and its environment-specific palette.
// Calls are serialized by engine/worker.js; the engine owns mutable Java state.
export function createRwgProvider(engine, profile, keys, options = {}) {
  const registry = options.registry || biomeRegistry;
  const yieldTask = options.yieldTask || (() => new Promise(resolve => setTimeout(resolve, 0)));
  const cacheLimit = options.cacheLimit ?? 4096;
  const now = options.now || (() => performance.now());
  if (!Number.isInteger(cacheLimit) || cacheLimit < 1) throw new Error("Invalid RWG cache limit");
  const groups = ["snow", "cold", "hot", "wet", "small"].map(name => Int32Array.from(profile.groups[name]));
  let currentSeed;
  const chunks = new Map();
  const rawChunks = new Map();
  const surfaceProfile = options.surfaceProfile ? validateSurfaceProfile(options.surfaceProfile) : null;
  const dungeons=options.caveEngine?createDungeonPredictor(options.caveEngine,options.dungeonProfile,(x,z)=>engine.rawHeight(x,z),{yieldTask,now}):null;
  function rawChunk(cx,cz) {
    const key=`${cx}:${cz}`;
    if(!rawChunks.has(key)) {
      const raw=engine.finalChunk(cx,cz);
      if(raw?.length!==256)throw new Error('RWG 返回了不完整的区块');
      rawChunks.set(key,Int32Array.from(raw));
      if(rawChunks.size>cacheLimit)rawChunks.delete(rawChunks.keys().next().value);
    }
    return rawChunks.get(key);
  }
  function checkSignal(signal) {
    if (signal?.aborted) throw new Error("CANCELLED");
  }
  function configure(seed) {
    if (seed !== currentSeed) {
      currentSeed = undefined;
      chunks.clear();
      rawChunks.clear();
      engine.configure(seed, profile.noise, ...groups);
      currentSeed = seed;
    }
  }
  return {
    apiVersion: 1,
    async predictStructures(q, { signal } = {}) {
      checkSignal(signal);
      configure(parseSeed(q.seed).toString());
      if(typeof engine.villageViable !== "function") throw new Error("RWG 函数包尚未提供村庄地形检查");
      const result=await rwgStructures(q, (x,z) => engine.villageViable(x,z), {signal,yieldTask});
      if(surfaceProfile) result.push(...await surfaceStructures(q,(x,z)=>{
        const cx=Math.floor(x/16),cz=Math.floor(z/16);
        return rawChunk(cx,cz)[(z-cz*16)*16+x-cx*16];
      },surfaceProfile,{signal,yieldTask,now}));
      if(dungeons&&!q.excludedKinds?.includes('VANILLA_SPAWNER_DUNGEON')) {
        const b=q.bounds,margin=144;
        const nearby=await rwgStructures({...q,bounds:{minX:Math.max(-30000000,b.minX-margin),minZ:Math.max(-30000000,b.minZ-margin),maxX:Math.min(30000000,b.maxX+margin),maxZ:Math.min(30000000,b.maxZ+margin)}},(x,z)=>engine.villageViable(x,z),{signal,yieldTask});
        result.push(...await dungeons(q,nearby,{signal}));
      }
      return result;
    },
    async sampleBiomes(q, { signal } = {}) {
      const seed = parseSeed(q.seed).toString();
      // Amidst/Worker quarter-resolution tiles sample the centre of each 4x4 cell.
      const offset = q.step === 4 ? 2 : 0;
      if (q.dimension !== "overworld" || !Number.isSafeInteger(q.x) || !Number.isSafeInteger(q.z)
          || !Number.isInteger(q.step) || q.step < 1 || q.step > 256
          || !Number.isInteger(q.width) || !Number.isInteger(q.height) || q.width < 1 || q.height < 1
          || q.width * q.height > 262144
          || [q.x + offset, q.z + offset, q.x + (q.width - 1) * q.step + offset, q.z + (q.height - 1) * q.step + offset].some(v => Math.abs(v) > 29999983))
        throw new Error("RWG 底图请求超出有效范围");
      checkSignal(signal);
      configure(seed);
      const result = new Uint16Array(q.width * q.height);
      let deadline = now() + 16;
      for (let row = 0; row < q.height; row++) for (let col = 0; col < q.width; col++) {
        const x = q.x + col * q.step + offset, z = q.z + row * q.step + offset;
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16), key = `${cx}:${cz}`;
        let tile = chunks.get(key);
        if (!tile) {
          checkSignal(signal);
          const raw = rawChunk(cx, cz);
          if (raw.length !== 256) throw new Error("RWG 返回了不完整的区块");
          tile = Uint16Array.from(raw, id => {
            const biome = registry.get(keys[id]);
            if (!biome) throw new Error("RWG 返回了未登记的群系：" + id);
            return biome.index;
          });
          chunks.set(key, tile);
          if (chunks.size > cacheLimit) chunks.delete(chunks.keys().next().value);
        }
        result[row * q.width + col] = tile[(z - cz * 16) * 16 + x - cx * 16];
        if (now() >= deadline) {
          await yieldTask();
          checkSignal(signal);
          deadline = now() + 16;
        }
      }
      checkSignal(signal);
      return result;
    },
  };
}
