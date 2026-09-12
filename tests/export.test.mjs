import test from "node:test";
import assert from "node:assert/strict";
import { csv, journeyMap, crc32 } from "../dist/export.js";
test("CSV keeps large seeds and quotes user-controlled text", () => {
  const output = csv([{ kind: 'a,"b', x: -1, z: 2, source: "mod" }], {
    seed: "9223372036854775807",
    dimension: "end",
    dimensionId: 1,
  });
  assert.ok(output.includes('"9223372036854775807"'));
  assert.ok(output.includes('"a,""b"'));
});
test("JourneyMap ZIP headers, CRCs, integer dimension and coordinates round trip", async () => {
  const markers = [
      {
        kind: "HEE_DUNGEON_TOWER",
        x: -16000,
        z: 8,
        certainty: "EXACT_FRESH_END",
      },
    ],
    blob = journeyMap(
      markers,
      { seed: "-1", dimension: "end", dimensionId: 1 },
      72,
    ),
    bytes = new Uint8Array(await blob.arrayBuffer()),
    v = new DataView(bytes.buffer);
  let offset = 0,
    seen = 0;
  while (v.getUint32(offset, true) === 0x04034b50) {
    const len = v.getUint32(offset + 18, true),
      nameLen = v.getUint16(offset + 26, true),
      name = new TextDecoder().decode(
        bytes.slice(offset + 30, offset + 30 + nameLen),
      ),
      data = bytes.slice(offset + 30 + nameLen, offset + 30 + nameLen + len);
    assert.equal(crc32(data), v.getUint32(offset + 14, true));
    if (name.endsWith(".json")) {
      const value = JSON.parse(new TextDecoder().decode(data));
      assert.deepEqual(value.dimensions, [1]);
      assert.equal(value.x, -16000);
      assert.equal(value.y, 72);
      seen++;
    }
    offset += 30 + nameLen + len;
  }
  assert.equal(seen, 1);
  assert.equal(v.getUint32(offset, true), 0x02014b50);
  assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50);
});
