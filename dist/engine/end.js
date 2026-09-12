// Ported from reference EndStructurePredictor, commit c5e09fed (GPL-3.0).
// HEE preview models a fresh End. Circles are the desktop preview's schematic
// biome areas, not generated block silhouettes.
import { JavaRandom, regionRandom, long } from "./random.js";
export function islandInRegion(seed, rx, rz) {
  const r = regionRandom(seed, rx, rz, 358041);
  r.nextInt(1);
  const cx = rx * 28 + r.nextInt(15),
    cz = rz * 28 + r.nextInt(15);
  const x = cx * 16 + 104,
    z = cz * 16 + 104;
  const distance = Math.sqrt(x * x + z * z);
  if (distance < 1600 || r.nextInt(7) > 4) return null;
  const ramp = distance > 4000 ? 1 : (distance - 1600) / 2400;
  const chance = 0.65 + 0.35 * ramp;
  if (chance < 1 && r.nextDouble() >= chance) return null;
  const b = new JavaRandom(
    long(
      BigInt(Math.trunc((cx * 16) / 9)) * 238504n +
        BigInt(Math.trunc((cz * 16) / 9)) * 10058432215n,
    ) ^ BigInt(seed),
  );
  b.nextInt(25);
  return { x, z, cx, cz, biome: 3002 + b.nextInt(3) };
}
export function islands(seed, b) {
  const found = [];
  for (
    let rx = Math.floor((b.minX - 208) / 448);
    rx <= Math.floor((b.maxX - 1) / 448);
    rx++
  ) {
    for (
      let rz = Math.floor((b.minZ - 208) / 448);
      rz <= Math.floor((b.maxZ - 1) / 448);
      rz++
    ) {
      const i = islandInRegion(seed, rx, rz);
      if (
        i &&
        i.x + 104 >= b.minX &&
        i.x - 104 < b.maxX &&
        i.z + 104 >= b.minZ &&
        i.z - 104 < b.maxZ
      )
        found.push(i);
    }
  }
  return found;
}
export function endBiomes(seed, x, z, width, height, step) {
  const data = new Uint16Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const px = x + col * step,
        pz = z + row * step;
      data[row * width + col] = px * px + pz * pz <= 1048576 ? 3001 : 3000;
    }
  }
  for (const i of islands(seed, {
    minX: x,
    minZ: z,
    maxX: x + (width - 1) * step + 1,
    maxZ: z + (height - 1) * step + 1,
  })) {
    const minRow = Math.max(0, Math.ceil((i.z - 104 - z) / step));
    const maxRow = Math.min(height - 1, Math.floor((i.z + 104 - z) / step));
    const minCol = Math.max(0, Math.ceil((i.x - 104 - x) / step));
    const maxCol = Math.min(width - 1, Math.floor((i.x + 104 - x) / step));
    for (let row = minRow; row <= maxRow; row++)
      for (let col = minCol; col <= maxCol; col++) {
        if ((x + col * step - i.x) ** 2 + (z + row * step - i.z) ** 2 <= 10816)
          data[row * width + col] = i.biome;
      }
  }
  return data;
}
const inside = (x, z, b) =>
  x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ;
export function endStructures(seed, b, config = {}) {
  const result = [];
  for (const i of islands(seed, b))
    if (inside(i.x, i.z, b))
      result.push({
        kind: "HEE_BIOME_ISLAND",
        subtype: ["INFESTED_FOREST", "BURNING_MOUNTAINS", "ENCHANTED_ISLAND"][
          i.biome - 3002
        ],
        x: i.x,
        z: i.z,
        certainty: "EXACT_FRESH_END",
        source: "Hardcore Ender Expansion",
      });
  for (
    let rx = Math.floor((b.minX - 16) / 240);
    rx <= Math.floor((b.maxX - 17) / 240);
    rx++
  ) {
    for (
      let rz = Math.floor((b.minZ - 16) / 240);
      rz <= Math.floor((b.maxZ - 17) / 240);
      rz++
    ) {
      const r = regionRandom(seed, rx, rz, 358041);
      r.nextInt(1);
      const cx = rx * 15 + r.nextInt(6),
        cz = rz * 15 + r.nextInt(6);
      const x = cx * 16 + 16,
        z = cz * 16 + 16,
        distance = Math.sqrt(x * x + z * z);
      if (distance < 350 || r.nextInt(100) > 28) continue;
      if (distance > 900) {
        const falloff =
          distance > 3800 ? 0 : 1 - ((distance - 900) / 2900) ** 3;
        if (r.nextDouble() >= 0.25 + 0.75 * falloff) continue;
      }
      let near = false;
      for (
        let ix = Math.floor((cx - 12) / 28);
        ix <= Math.floor((cx + 12) / 28);
        ix++
      ) {
        for (
          let iz = Math.floor((cz - 12) / 28);
          iz <= Math.floor((cz + 12) / 28);
          iz++
        ) {
          const i = islandInRegion(seed, ix, iz);
          if (
            i &&
            i.cx >= cx - 12 &&
            i.cx <= cx + 12 &&
            i.cz >= cz - 12 &&
            i.cz <= cz + 12 &&
            Math.sqrt((x - i.x) ** 2 + (z - i.z) ** 2) < 125
          )
            near = true;
        }
      }
      if (!near && inside(x, z, b))
        result.push({
          kind: "HEE_DUNGEON_TOWER",
          subtype: "",
          x,
          z,
          certainty: "EXACT_FRESH_END",
          source: "Hardcore Ender Expansion",
        });
    }
  }
  if (config.chaosEnabled) {
    const s = config.chaosSeparation;
    if (!Number.isInteger(s) || s < 256)
      throw new Error("混沌岛间距须为至少 256 的整数");
    for (let x = Math.ceil(b.minX / s) * s; x < b.maxX; x += s)
      for (let z = Math.ceil(b.minZ / s) * s; z < b.maxZ; z += s) {
        if (x || z)
          result.push({
            kind: "DRACONIC_CHAOS_ISLAND",
            subtype: `SEPARATION_${s}`,
            x,
            z,
            certainty: "EXACT_CONFIG",
            source: "Draconic Evolution",
          });
      }
  }
  return result;
}
