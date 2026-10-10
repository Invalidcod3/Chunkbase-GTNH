import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rwgStructures} from '../dist/engine/rwg-structures.js';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
import {validateVillageRules, outsideVillageOrigin} from '../dist/engine/village-rules.js';

const reference = JSON.parse(await readFile(new URL('./fixtures/village-names-reference.json', import.meta.url)));
const releaseProfile = JSON.parse(await readFile(new URL('../dist/data/village-profile.json', import.meta.url)));
const encode = values => values.filter(v => v.kind === 'VILLAGE').map(v => `${v.x},${v.z}`).sort();
const rules = {...releaseProfile, biomeNames: ['Plains'], biomeNamesById: {1: 'Plains', 2: 'plains'}};
const q = {seed: '0', dimension: 'overworld', bounds: {minX: -4092, minZ: -4092, maxX: 4085, maxZ: 4085}, config: {mineshaftsEnabled: false}};
const terrainProfile = {noise: 'wrapped-perlin', groups: {snow: [], cold: [], hot: [], wet: [], small: []}};

test('VN candidate selection matches native runtime JAR fixtures across seeds, spacing, radius and signed overflow', async () => {
  assert.equal(reference.referenceJarSha256, '7433fa393f513378bf359a8085a01044131b9f8eef20585c0c02041c1a235629');
  for (const f of reference.cases) {
    const query = {...q, seed: f.seed, bounds: {minX: f.minChunk * 16 + 4, minZ: f.minChunk * 16 + 4, maxX: f.maxChunk * 16 + 5, maxZ: f.maxChunk * 16 + 5}};
    const actual = await rwgStructures(query, () => true, {villageRules: {...rules, ...f}, yieldTask: async () => {}});
    assert.deepEqual(encode(actual), f.villages.map(v => v.join(',')).sort(), JSON.stringify({...f, villages: undefined}));
  }
});

test('VN provider checks final centre biome names exactly, bypasses RWG terrain gate and invalidates seed cache', async () => {
  let seed, calls = 0;
  const engine = {configure(s) {seed = s;}, villageViable() {throw Error('Legacy gate called');}, finalChunk() {calls++; return new Int32Array(256).fill(seed === '0' ? 1 : 2);}};
  const provider = createRwgProvider(engine, terrainProfile, {}, {villageProfile: rules, yieldTask: async () => {}});
  const got = await provider.predictStructures(q);
  assert.equal(encode(got).length, 108);
  assert.ok(got.filter(v => v.kind === 'VILLAGE').every(v => v.source === 'Village Names'));
  const before = calls;
  await provider.predictStructures(q); assert.equal(calls, before);
  assert.equal(encode(await provider.predictStructures({...q, seed: '1'})).length, 0);
  assert.equal(encode(await provider.predictStructures(q)).length, 108);
});

test('VN disabled switch, unknown biomes and unsupported profiles cannot silently fall back', async () => {
  const engine = {configure() {}, finalChunk() {throw Error('Unexpected sample');}};
  const p = createRwgProvider(engine, terrainProfile, {}, {villageProfile: rules});
  assert.equal(encode(await p.predictStructures({...q, config: {...q.config, villagesEnabled: false}})).length, 0);
  const unknown = createRwgProvider({...engine, finalChunk: () => new Int32Array(256).fill(99)}, terrainProfile, {}, {villageProfile: rules});
  await assert.rejects(unknown.predictStructures(q), /缺少实际群系名称/);
  assert.throws(() => validateVillageRules({...rules, algorithm: 'unknown'}), /Unsupported/);
  assert.throws(() => validateVillageRules({...rules, separation: rules.distance}), /Invalid/);
  assert.equal(outsideVillageOrigin(50000, 0, rules), false);
  assert.equal(outsideVillageOrigin(5, 0, {...rules, originRadius: 5}), true);
});

test('VN windows split at negative coordinates without losing or duplicating markers', async () => {
  const opts = {villageRules: rules, yieldTask: async () => {}};
  const full = await rwgStructures(q, () => true, opts);
  const left = await rwgStructures({...q, bounds: {...q.bounds, maxX: -4}}, () => true, opts);
  const right = await rwgStructures({...q, bounds: {...q.bounds, minX: -4}}, () => true, opts);
  assert.deepEqual(encode([...left, ...right]), encode(full));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(rwgStructures(q, () => true, {...opts, signal: controller.signal}), /CANCELLED/);
});

test('release profile retains named configuration provenance and undecorated biome names', () => {
  assert.equal(releaseProfile.distance, 50); assert.equal(releaseProfile.separation, 30);
  assert.equal(releaseProfile.originRadius, 0);
  assert.ok(releaseProfile.biomeNames.includes('Heathland'));
  assert.ok(!releaseProfile.biomeNames.some(name => name.includes('|')));
  assert.equal(releaseProfile.biomeNamesById[228], 'Hot Plains');
  assert.equal(releaseProfile.provenance.configCommit, '83b3fb26cd9979e0256c7568bdf8c6f87579b532');
});
