import { parseSeed } from "./random.js";
import { biomeRegistry } from "./catalog.js";
import { rwgStructures } from "./rwg-structures.js";
import { surfaceStructures, validateSurfaceProfile } from "./surface-structures.js";
import { createDungeonPredictor } from "./dungeons.js";
import {unavailableSpawn} from './navigation.js';
import {createSpawnPredictor} from './spawn.js';

// The site installs a calibrated engine and its environment-specific palette.
// Calls are serialized by engine/worker.js; the engine owns mutable Java state.
export function createRwgProvider(engine, profile, keys, options = {}) {
  const registry = options.registry || biomeRegistry;
  const yieldTask = options.yieldTask || (() => new Promise(resolve => setTimeout(resolve, 0)));
  const cacheLimit = options.cacheLimit ?? 4096;
  const rasterCacheBytes = options.rasterCacheBytes ?? 8 * 1024 * 1024;
  const now = options.now || (() => performance.now());
  if (!Number.isInteger(cacheLimit) || cacheLimit < 1) throw new Error("Invalid RWG cache limit");
  if (!Number.isInteger(rasterCacheBytes) || rasterCacheBytes < 0) throw new Error('Invalid raster cache size');
  const groups = ["snow", "cold", "hot", "wet", "small"].map(name => Int32Array.from(profile.groups[name]));
  let currentSeed;
  if(options.spawnProfile && options.spawnProfile.schemaVersion!==2 && (options.spawnProfile.schemaVersion!==1||!Array.isArray(options.spawnProfile.grassBiomes)||!options.spawnProfile.grassBiomes.length||options.spawnProfile.grassBiomes.some(id=>!Number.isInteger(id)||id<0||id>65535)))throw new Error('Invalid spawn profile');
  const spawn=options.spawnProfile?.schemaVersion===2&&typeof options.loadSpawnEngine==='function'
    ?createSpawnPredictor(options.spawnProfile,options.loadSpawnEngine,{yieldTask}):null;
  const chunks = new Map();
  const rawChunks = new Map();
  const rasters = new Map();
  let rasterBytes = 0;
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
      rasters.clear(); rasterBytes = 0;
      engine.configure(seed, profile.noise, ...groups);
      currentSeed = seed;
    }
  }
  return {
    apiVersion: 1,
    async predictSpawn(q,{signal}={}) {
      checkSignal(signal);
      if(q.dimension!=='overworld'||!options.spawnProfile)throw new Error('此环境尚未提供出生点预测');
      parseSeed(q.seed);
      return spawn?spawn(q,{signal}):unavailableSpawn();
    },
    async predictStructures(q, { signal } = {}) {
      checkSignal(signal);
      configure(parseSeed(q.seed).toString());
      if(typeof engine.villageViable !== "function") throw new Error("RWG 函数包尚未提供村庄地形检查");
      const dungeonOnly=q.structureGroup==='dungeons';
      const result=dungeonOnly?[]:await rwgStructures(q, (x,z) => engine.villageViable(x,z), {signal,yieldTask});
      if(surfaceProfile&&!dungeonOnly) result.push(...await surfaceStructures(q,(x,z)=>{
        const cx=Math.floor(x/16),cz=Math.floor(z/16);
        return rawChunk(cx,cz)[(z-cz*16)*16+x-cx*16];
      },surfaceProfile,{signal,yieldTask,now}));
      if(dungeons&&!q.excludedKinds?.includes('VANILLA_SPAWNER_DUNGEON')) {
        const b=q.bounds,margin=144;
        const nearby=await rwgStructures({...q,bounds:{minX:Math.max(-30000000,b.minX-margin),minZ:Math.max(-30000000,b.minZ-margin),maxX:Math.min(30000000,b.maxX+margin),maxZ:Math.min(30000000,b.maxZ+margin)}},(x,z)=>engine.villageViable(x,z),{signal,yieldTask});
        result.push(...await dungeons(q,nearby,{signal}));
      }
      if(options.spawnProfile&&!dungeonOnly&&!q.excludedKinds?.includes('WORLD_SPAWN')){
        const spawn=await this.predictSpawn(q,{signal}),b=q.bounds;
        if(spawn.x>=b.minX&&spawn.x<b.maxX&&spawn.z>=b.minZ&&spawn.z<b.maxZ)result.push(spawn);
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
      const rasterKey = `${q.x}:${q.z}:${q.width}:${q.height}:${q.step}`;
      const cached = rasters.get(rasterKey);
      if (cached) {
        rasters.delete(rasterKey); rasters.set(rasterKey,cached);
        // Worker transfers detach the returned buffer; cache owns a separate copy.
        return cached.slice();
      }
      const result = new Uint16Array(q.width * q.height);
      let deadline = now() + 16;
      if (q.step > 1 && typeof engine.finalSamples === 'function') {
        // Bounded strips retain cancellation points without interleaving engine state.
        for (let row=0; row<q.height; row++) {
          for (let col=0; col<q.width; col+=32) {
            const width=Math.min(32,q.width-col);
            const raw=engine.finalSamples(q.x+col*q.step+offset,q.z+row*q.step+offset,width,1,q.step);
            if (raw?.length !== width) throw new Error('RWG 返回了不完整的采样');
            for(let i=0;i<width;i++) {
              const biome=registry.get(keys[raw[i]]);
              if(!biome)throw new Error('RWG 返回了未登记的群系：'+raw[i]);
              result[row*q.width+col+i]=biome.index;
            }
            if(now()>=deadline){await yieldTask();checkSignal(signal);deadline=now()+16;}
          }
        }
      } else for (let row = 0; row < q.height; row++) for (let col = 0; col < q.width; col++) {
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
      if (result.byteLength <= rasterCacheBytes) {
        rasters.set(rasterKey,result.slice());rasterBytes+=result.byteLength;
        while(rasterBytes>rasterCacheBytes) {
          const key=rasters.keys().next().value;
          rasterBytes-=rasters.get(key).byteLength;rasters.delete(key);
        }
      }
      return result;
    },
  };
}
