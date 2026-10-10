import { regionRandom } from "./random.js";
import { validateBounds } from "./native.js";
import { gpuCompute } from './gpu-compute.js';
import {validateVillageRules, outsideVillageOrigin} from './village-rules.js';

export async function rwgStructures(q, viable, { signal, villageRules, yieldTask = () => new Promise(r => setTimeout(r, 0)) } = {}) {
  if (q.dimension !== "overworld") throw new Error("RWG 结构只支持主世界");
  validateBounds(q.bounds);
  if (signal?.aborted) throw new Error("CANCELLED");
  const result = await gpuCompute.structures(q,{signal});
  if (q.config?.villagesEnabled === false) return result;
  const rules = validateVillageRules(villageRules), {distance, separation} = rules;
  const regionSize = distance * 16;
  const b = q.bounds;
  let deadline = performance.now() + 16;
  for (let rz = Math.floor((b.minZ - 4) / regionSize); rz <= Math.floor((b.maxZ - 5) / regionSize); rz++) {
    for (let rx = Math.floor((b.minX - 4) / regionSize); rx <= Math.floor((b.maxX - 5) / regionSize); rx++) {
      const random = regionRandom(q.seed, rx, rz, 10387312);
      const cx = rx * distance + random.nextInt(distance - separation), cz = rz * distance + random.nextInt(distance - separation);
      const x = cx * 16 + 4, z = cz * 16 + 4;
      if (x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ && outsideVillageOrigin(cx, cz, rules) && viable(cx * 16 + 8, cz * 16 + 8))
        result.push({ kind: "VILLAGE", subtype: "", x, z, certainty: "POSSIBLE", source: rules.algorithm === 'rwg' ? 'RWG' : 'Village Names' });
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
