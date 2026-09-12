import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../dist/engine/config.js";
import { validateRegistry, findProvider } from "../dist/engine/packs.js";
import { mergeRecords } from "../dist/engine/save-contract.js";
test("environment import preserves integer dimension IDs and rejects malformed values", () => {
  assert.equal(
    validateConfig({ schemaVersion: 1, dimensionIds: { moon: 28 } })
      .dimensionIds.moon,
    28,
  );
  for (const value of [
    { schemaVersion: 999 },
    { schemaVersion: 1, dimensionIds: { moon: 1.5 } },
    { schemaVersion: 1, chaosEnabled: "false" },
    { schemaVersion: 1, biomeColors: { 3000: "url(evil)" } },
  ])
    assert.throws(() => validateConfig(value));
});
test("raw JVM and remote packages cannot be installed as browser code", () => {
  const pack = {
      id: "rwg",
      apiVersion: 1,
      browserExecutable: true,
      entry: "./rwg/index.js",
      dimensions: [{ key: "overworld", capabilities: ["biomes"] }],
    },
    base = "https://example.test/tool/packs/registry.json";
  assert.equal(
    validateRegistry({ schemaVersion: 1, packs: [pack] }, base).length,
    1,
  );
  for (const p of [
    { ...pack, browserExecutable: false },
    { ...pack, entry: "https://other.test/run.js" },
    { ...pack, entry: "../app.js" },
  ])
    assert.throws(() =>
      validateRegistry({ schemaVersion: 1, packs: [p] }, base),
    );
  const provider = {};
  assert.equal(
    findProvider([{ descriptor: pack, provider }], "overworld", "sampleBiomes"),
    provider,
  );
  assert.equal(
    findProvider([{ descriptor: pack, provider }], "end", "sampleBiomes"),
    undefined,
  );
});
test("save overlay must carry recorded provenance and replaces matching predictions", () => {
  const prediction = { id: "ore:1", certainty: "POSSIBLE" },
    record = {
      id: "ore:1",
      source: "recorded",
      certainty: "RECORDED",
      saveId: "local-1",
      exhausted: true,
    };
  assert.deepEqual(
    mergeRecords([prediction], [record], (m) => m.id),
    [record],
  );
  assert.throws(() =>
    mergeRecords(
      [prediction],
      [{ ...record, source: "prediction" }],
      (m) => m.id,
    ),
  );
});
