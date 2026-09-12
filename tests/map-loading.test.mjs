import test from "node:test";
import assert from "node:assert/strict";
import { MapView } from "../dist/map.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
function view(request) {
  return Object.assign(Object.create(MapView.prototype), {
    request,
    showBiomes: true,
    width: 1,
    height: 1,
    scale: 1,
    x: 0,
    z: 0,
    generation: 1,
    tiles: new Map(),
    pending: new Set(),
    failedTiles: new Map(),
    step: () => 1,
    bounds: () => ({ minX: 0, minZ: 0, maxX: 1, maxZ: 1 }),
  });
}

test("transient tile failure can recover without caching a blank tile", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let calls = 0;
  const map = view(() =>
    ++calls === 1
      ? Promise.reject(new Error("temporary"))
      : Promise.resolve(null),
  );
  map.ensureTiles();
  await settle();
  assert.equal(map.tiles.size, 0);
  assert.equal(map.isFullyLoaded(), false);
  map.ensureTiles();
  assert.equal(calls, 1);
  t.mock.timers.tick(500);
  map.ensureTiles();
  await settle();
  assert.equal(calls, 2);
  assert.equal(map.isFullyLoaded(), true);
  assert.equal(map.failedTiles.size, 0);
});

test("late success from an old world cannot populate current tiles or remove its pending request", async () => {
  let finish;
  const map = view(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  map.ensureTiles();
  map.generation++;
  finish(null);
  await settle();
  assert.equal(map.tiles.size, 0);
  assert.equal(map.pending.size, 1);
});

test("permanent tile failures stop retrying after three attempts", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let calls = 0;
  const map = view(() => {
    calls++;
    return Promise.reject(new Error("failed"));
  });
  for (let i = 0; i < 5; i++) {
    map.ensureTiles();
    await settle();
    t.mock.timers.tick(10000);
  }
  assert.equal(calls, 3);
  assert.equal(map.tiles.size, 0);
});
