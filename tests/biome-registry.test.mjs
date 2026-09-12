import test from "node:test";
import assert from "node:assert/strict";
import {
  BiomeRegistry,
  assertResourceKey,
} from "../dist/engine/biome-registry.js";
import { validateConfig } from "../dist/engine/config.js";
const entry = (key, dimension) => ({
  key,
  zh: "群系",
  en: "Biome",
  color: "#526b48",
  legacy: [{ environment: "pack-a", dimension, id: 42 }],
});
test("the same legacy ID can map to distinct namespaced biomes in different dimensions", () => {
  const r = new BiomeRegistry();
  r.register(entry("mod:forest", "overworld"));
  r.register(entry("mod:ash", "nether"));
  assert.equal(r.resolveLegacy("pack-a", "overworld", 42), "mod:forest");
  assert.equal(r.resolveLegacy("pack-a", "nether", 42), "mod:ash");
  assert.notEqual(r.get("mod:forest").index, r.get("mod:ash").index);
});
test("registry collisions fail without partially mutating the registry", () => {
  const r = new BiomeRegistry();
  r.register(entry("mod:forest", "overworld"));
  assert.throws(() => r.register(entry("other:forest", "overworld")));
  assert.equal(r.get("other:forest"), undefined);
  assert.throws(() => r.register(entry("mod:forest", "nether")));
  assert.equal(r.indices.length, 1);
});
test("renderer indices are ephemeral; persisted keys are stable", () => {
  const a = new BiomeRegistry(),
    b = new BiomeRegistry();
  a.register(entry("mod:forest", "overworld"));
  a.register(entry("mod:ash", "nether"));
  b.register(entry("mod:ash", "nether"));
  b.register(entry("mod:forest", "overworld"));
  assert.notEqual(a.get("mod:forest").index, b.get("mod:forest").index);
  assert.equal(
    a.at(a.encode(["mod:forest"])[0]).key,
    b.at(b.encode(["mod:forest"])[0]).key,
  );
});
test("legacy environment colors migrate into namespaced v2 format", () => {
  const config = validateConfig({
    schemaVersion: 1,
    biomeColors: { 3000: "#17131f" },
  });
  assert.equal(config.schemaVersion, 2);
  assert.deepEqual(config.biomeColors, { "amidst:end_void": "#17131f" });
  assert.throws(() =>
    validateConfig({ schemaVersion: 2, biomeColors: { 3000: "#17131f" } }),
  );
});
test("namespace validation rejects implicit namespaces and display labels", () => {
  for (const key of [
    "Forest",
    "mod:Forest",
    "biome",
    "mod:../escape",
    "mod:",
    "mod:/a",
  ])
    assert.throws(() => assertResourceKey(key));
  assert.equal(
    assertResourceKey("biomesoplenty:forest"),
    "biomesoplenty:forest",
  );
});
