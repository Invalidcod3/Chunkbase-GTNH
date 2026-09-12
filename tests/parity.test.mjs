import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { JavaRandom, parseSeed } from "../dist/engine/random.js";
import { sampleBiomes, predictStructures } from "../dist/engine/native.js";
import { biomeByIndex } from "../dist/engine/catalog.js";
const fixtures = JSON.parse(
  await readFile(new URL("./fixtures/reference.json", import.meta.url)),
);
for (const [index, f] of fixtures.entries())
  test(`Java parity ${index}: ${f.type} / ${f.seed}`, () => {
    if (f.type === "random") {
      const r = new JavaRandom(f.seed);
      for (const line of f.values) {
        const [a, b, c, d] = line.split("|");
        assert.equal(r.nextLong().toString(), a);
        assert.equal(r.nextInt(1073741825), Number(b));
        assert.equal(r.nextInt(1), Number(c));
        assert.equal(r.nextDouble(), Number(d));
      }
    } else if (f.type === "biomes") {
      const pixels = sampleBiomes({
          ...f,
          dimension: "end",
          width: 128,
          height: 128,
        }),
        buffer = Buffer.alloc(pixels.length * 2);
      pixels.forEach((p, i) =>
        buffer.writeUInt16BE(biomeByIndex(p).legacy[0].id, i * 2),
      );
      assert.equal(createHash("sha256").update(buffer).digest("hex"), f.hash);
    } else {
      const values = predictStructures({
        seed: f.seed,
        dimension: f.type,
        bounds: f.bounds,
        config: {
          chaosEnabled: true,
          chaosSeparation: 10000,
          ...(f.dimensionId === undefined
            ? {}
            : { dimensionIds: { [f.type]: f.dimensionId } }),
        },
      })
        .map((m) => `${m.kind}|${m.subtype || ""}|${m.x}|${m.z}|${m.certainty}`)
        .sort();
      assert.deepEqual(values, f.values);
    }
  });
test("64-bit seeds remain lossless and reject malformed or overflowing values", () => {
  assert.equal(parseSeed("+9007199254740993"), "9007199254740993");
  for (const seed of [
    "",
    "hello",
    "1.5",
    "9223372036854775808",
    "-9223372036854775809",
  ])
    assert.throws(() => parseSeed(seed));
});
test("query partition gives identical End structures at negative boundaries", () => {
  const q = { seed: "-4172144997902289642", dimension: "end" },
    bounds = { minX: -4500, minZ: -4000, maxX: 1200, maxZ: 1000 },
    key = (m) => `${m.kind}:${m.subtype}:${m.x}:${m.z}`;
  const whole = predictStructures({ ...q, bounds })
      .map(key)
      .sort(),
    left = predictStructures({ ...q, bounds: { ...bounds, maxX: -1 } }),
    right = predictStructures({ ...q, bounds: { ...bounds, minX: -1 } });
  assert.deepEqual([...left, ...right].map(key).sort(), whole);
});
test("unavailable worldgen has no fabricated biome map", () =>
  assert.equal(
    sampleBiomes({
      seed: "0",
      dimension: "overworld",
      x: 0,
      z: 0,
      width: 128,
      height: 128,
      step: 4,
    }),
    null,
  ));
test("invalid and excessive query areas fail explicitly", () => {
  for (const bounds of [
    { minX: 0, minZ: 0, maxX: 1e9, maxZ: 1 },
    { minX: 0, minZ: 0, maxX: 100000, maxZ: 100000 },
    { minX: 1, minZ: 0, maxX: 0, maxZ: 1 },
  ])
    assert.throws(() =>
      predictStructures({ seed: "0", dimension: "end", bounds }),
    );
});
