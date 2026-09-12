import { parseSeed } from "./random.js";
import { biomeRegistry } from "./catalog.js";

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
  function checkSignal(signal) {
    if (signal?.aborted) throw new Error("CANCELLED");
  }
  return {
    apiVersion: 1,
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
      if (seed !== currentSeed) {
        currentSeed = undefined;
        chunks.clear();
        engine.configure(seed, profile.noise, ...groups);
        currentSeed = seed;
      }
      const result = new Uint16Array(q.width * q.height);
      let deadline = now() + 16;
      for (let row = 0; row < q.height; row++) for (let col = 0; col < q.width; col++) {
        const x = q.x + col * q.step + offset, z = q.z + row * q.step + offset;
        const cx = Math.floor(x / 16), cz = Math.floor(z / 16), key = `${cx}:${cz}`;
        let tile = chunks.get(key);
        if (!tile) {
          checkSignal(signal);
          const raw = engine.finalChunk(cx, cz);
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
