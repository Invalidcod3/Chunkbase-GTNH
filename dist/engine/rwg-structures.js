import { regionRandom } from "./random.js";
import { predictStructures, validateBounds } from "./native.js";

export async function rwgStructures(q, viable, { signal, yieldTask = () => new Promise(r => setTimeout(r, 0)) } = {}) {
  if (q.dimension !== "overworld") throw new Error("RWG 结构只支持主世界");
  validateBounds(q.bounds);
  if (signal?.aborted) throw new Error("CANCELLED");
  const result = predictStructures(q);
  if (q.config?.villagesEnabled === false) return result;
  const b = q.bounds;
  let deadline = performance.now() + 16;
  for (let rz = Math.floor((b.minZ - 4) / 384); rz <= Math.floor((b.maxZ - 5) / 384); rz++) {
    for (let rx = Math.floor((b.minX - 4) / 384); rx <= Math.floor((b.maxX - 5) / 384); rx++) {
      const random = regionRandom(q.seed, rx, rz, 10387312);
      const cx = rx * 24 + random.nextInt(16), cz = rz * 24 + random.nextInt(16);
      const x = cx * 16 + 4, z = cz * 16 + 4;
      if (x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ && viable(cx * 16 + 8, cz * 16 + 8))
        result.push({ kind: "VILLAGE", subtype: "", x, z, certainty: "POSSIBLE", source: "RWG" });
      if (performance.now() >= deadline) {
        await yieldTask();
        if (signal?.aborted) throw new Error("CANCELLED");
        deadline = performance.now() + 16;
      }
    }
  }
  if (signal?.aborted) throw new Error("CANCELLED");
  return result;
}
