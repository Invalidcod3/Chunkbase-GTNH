import { JavaRandom, regionRandom, parseSeed, long } from "./random.js";
import { endBiomes, endStructures } from "./end.js";
import { dimensions, biomeRegistry, legacyDisplayKeys } from "./catalog.js";
export function validateBounds(b, maxArea = 67108864) {
  if (
    !b ||
    !["minX", "minZ", "maxX", "maxZ"].every(
      (k) => Number.isSafeInteger(b[k]) && Math.abs(b[k]) <= 30000000,
    ) ||
    b.maxX <= b.minX ||
    b.maxZ <= b.minZ
  )
    throw new Error("坐标范围无效（±30,000,000 方块）");
  if ((b.maxX - b.minX) * (b.maxZ - b.minZ) > maxArea)
    throw new Error("查询范围过大，请放大地图或缩小导出范围");
}
export function sampleBiomes(q) {
  parseSeed(q.seed);
  if (
    !Number.isSafeInteger(q.x) ||
    !Number.isSafeInteger(q.z) ||
    !Number.isInteger(q.step) ||
    q.step < 1 ||
    q.step > 256 ||
    !Number.isInteger(q.width) ||
    !Number.isInteger(q.height) ||
    q.width < 1 ||
    q.height < 1 ||
    q.width * q.height > 262144
  )
    throw new Error("底图请求无效");
  const d = dimensions.find((d) => d.key === q.dimension);
  if (!d?.map) return null;
  if (d.key === "end") {
    const legacy = endBiomes(q.seed, q.x, q.z, q.width, q.height, q.step);
    return Uint16Array.from(
      legacy,
      (id) => biomeRegistry.get(legacyDisplayKeys[id]).index,
    );
  }
  return new Uint16Array(q.width * q.height).fill(
    biomeRegistry.get(d.biome).index,
  );
}
function chunks(b, offset, visit) {
  for (
    let z = Math.ceil((b.minZ - offset) / 16);
    z <= Math.floor((b.maxZ - 1 - offset) / 16);
    z++
  )
    for (
      let x = Math.ceil((b.minX - offset) / 16);
      x <= Math.floor((b.maxX - 1 - offset) / 16);
      x++
    )
      visit(x, z);
}
export function predictStructures(q) {
  parseSeed(q.seed);
  validateBounds(
    q.bounds,
    ["end", "ceres", "io", "enceladus", "proteus", "pluto"].includes(
      q.dimension,
    )
      ? 4294967296
      : 67108864,
  );
  const { seed, dimension, bounds: b, config = {} } = q;
  if (dimension === "end") return endStructures(seed, b, config);
  const result = [];
  const inside = (x, z) =>
    x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ;
  const add = (kind, x, z, source, certainty = "EXPECTED") => {
    if (inside(x, z))
      result.push({ kind, x, z, subtype: "", source, certainty });
  };
  if (dimension === "overworld") {
    const r = new JavaRandom(seed);
    let angle = r.nextDouble() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const distance = (1.25 + r.nextDouble()) * 32;
      add(
        "STRONGHOLD",
        Math.floor(Math.cos(angle) * distance + 0.5) * 16,
        Math.floor(Math.sin(angle) * distance + 0.5) * 16,
        "RWG",
      );
      angle += (Math.PI * 2) / 3;
    }
    if (config.mineshaftsEnabled !== false) {
      const base = new JavaRandom(seed),
        a = base.nextLong(),
        c = base.nextLong();
      chunks(b, 8, (cx, cz) => {
        const r = new JavaRandom(
          long(BigInt(cx) * a) ^ long(BigInt(cz) * c) ^ BigInt(seed),
        );
        r.nextInt();
        if (
          r.nextDouble() < 0.004 &&
          r.nextInt(80) < Math.max(Math.abs(cx), Math.abs(cz))
        )
          add("MINESHAFT", cx * 16 + 8, cz * 16 + 8, "RWG", "POSSIBLE");
      });
    }
  }
  const d = dimensions.find((d) => d.key === dimension);
  if (
    ["moon", "mars", "ceres", "io", "enceladus", "proteus", "pluto"].includes(
      dimension,
    )
  ) {
    const gs = dimension === "ceres" || dimension === "io";
    const id = config.dimensionIds?.[dimension] ?? d.id;
    for (
      let rz = Math.floor((b.minZ - 8) / 704);
      rz <= Math.floor((b.maxZ - 9) / 704);
      rz++
    )
      for (
        let rx = Math.floor((b.minX - 8) / 704);
        rx <= Math.floor((b.maxX - 9) / 704);
        rx++
      ) {
        const r = regionRandom(seed, rx, rz, gs ? 4291726 : 4291754 + id);
        add(
          `${dimension.toUpperCase()}_DUNGEON`,
          (rx * 44 + r.nextInt(44)) * 16 + 8,
          (rz * 44 + r.nextInt(44)) * 16 + 8,
          gs ? "GalaxySpace" : "Galacticraft",
        );
      }
  }
  if (dimension === "moon" && config.moonVillagesEnabled !== false)
    chunks(b, 8, (cx, cz) => {
      const ax = cx < 0 ? cx - 31 : cx,
        az = cz < 0 ? cz - 31 : cz,
        r = regionRandom(seed, ax, az, 10387312);
      if (
        cx === Math.trunc(ax / 32) * 32 + r.nextInt(24) &&
        cz === Math.trunc(az / 32) * 32 + r.nextInt(24)
      )
        add("MOON_VILLAGE", cx * 16 + 8, cz * 16 + 8, "Galacticraft");
    });
  if (dimension === "mars") {
    const base = new JavaRandom(seed),
      a = base.nextLong(),
      c = base.nextLong();
    for (
      let cz = Math.floor(b.minZ / 16);
      cz <= Math.floor((b.maxZ - 1) / 16);
      cz++
    )
      for (
        let cx = Math.floor(b.minX / 16);
        cx <= Math.floor((b.maxX - 1) / 16);
        cx++
      ) {
        const r = new JavaRandom(
          long(BigInt(cx) * a) ^ long(BigInt(cz) * c) ^ BigInt(seed),
        );
        if (r.nextInt(100) === 0)
          add(
            "MARS_CAVERN",
            cx * 16 + r.nextInt(16),
            cz * 16 + r.nextInt(16),
            "Galacticraft",
          );
      }
  }
  return result;
}
export const nativeProvider = {
  id: "native-v1",
  sampleBiomes,
  predictStructures,
};
