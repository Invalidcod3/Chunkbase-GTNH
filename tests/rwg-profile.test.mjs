import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSelectionProfile,
  configureSelection,
} from "../tools/rwg-profile.mjs";
const hash = "a".repeat(64);
function profile() {
  const base = { legacyId: 31, name: "Fixture", class: "fixture.Biome" };
  return {
    schemaVersion: 1,
    kind: "rwg-runtime-selection-profile",
    managerClass: "rwg.world.ChunkManagerRealistic",
    observedManagerSha256: hash,
    finalSurfaceReady: false,
    noise: "wrapped-open-simplex",
    groups: { snow: [3, 3, 7], cold: [7, 3], hot: [3], wet: [], small: [] },
    wetEnabled: false,
    smallEnabled: false,
    biomes: [3, 7].map((id) => ({
      id,
      class: "fixture.Realistic",
      base,
      river: base,
    })),
  };
}
test("runtime climate order and duplicate weights survive configuration", () => {
  let received;
  configureSelection(
    {
      configure(...args) {
        received = args;
      },
    },
    profile(),
    hash,
    "9223372036854775807",
  );
  assert.equal(received[0], "9223372036854775807");
  assert.deepEqual([...received[2]], [3, 3, 7]);
  assert.deepEqual([...received[3]], [7, 3]);
});
test("unverified bytecode, missing identities and incompatible switches cannot configure", () => {
  assert.throws(
    () => validateSelectionProfile(profile(), "b".repeat(64)),
    /bytecode/,
  );
  const missing = profile();
  missing.groups.snow.push(9);
  assert.throws(() => validateSelectionProfile(missing, hash), /climate group/);
  const switched = profile();
  switched.wetEnabled = true;
  assert.throws(() => validateSelectionProfile(switched, hash), /switches/);
  const duplicate = profile();
  duplicate.biomes.push(duplicate.biomes[0]);
  assert.throws(() => validateSelectionProfile(duplicate, hash), /duplicate/);
});
test("selection-stage metadata and seeds cannot be mistaken for a final provider", () => {
  const wrong = profile();
  wrong.finalSurfaceReady = true;
  assert.throws(() => validateSelectionProfile(wrong, hash), /Unsupported/);
  assert.throws(
    () => configureSelection({}, profile(), hash, "9223372036854775808"),
    /64-bit/,
  );
});
