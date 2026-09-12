import { readFile, writeFile } from "node:fs/promises";
const root = new URL(
  "../private-packs/rwg-selection-browser/",
  import.meta.url,
);
const engine = await import(new URL("selection.js", root));
const fixtures = JSON.parse(
  await readFile(new URL("reference.json", root), "utf8"),
);
const groups = [
  [
    [3, 3, 7],
    [17, 31, 17],
    [64, 92, 127],
    [151, 151, 190],
    [221, 255],
  ],
  [[3, 7], [17, 31], [64, 92, 127], [], []],
  [[255], [255], [255], [255], [255]],
];
let key,
  pixels = 0,
  scalars = 0;
const started = performance.now();
for (const f of fixtures) {
  const next = `${f.seed}:${f.noise}:${f.profile}`;
  if (key !== next) {
    engine.configure(
      f.seed,
      f.noise,
      ...groups[f.profile].map((g) => Int32Array.from(g)),
    );
    key = next;
  }
  const [cx, cz] = f.chunk,
    x = cx * 16,
    z = cz * 16;
  for (const [method, expected] of [
    ["rawBiome", f.raw],
    ["riverStrength", Math.fround(f.river)],
    ["oceanValue", Math.fround(f.ocean)],
  ]) {
    const actual = engine[method](x, z);
    if (actual !== expected)
      throw new Error(
        `${key} at ${x},${z} ${method}: ${actual} != ${expected}`,
      );
    scalars++;
  }
  const actual = engine.blendedChunk(cx, cz);
  for (let i = 0; i < 256; i++) {
    if (actual[i] !== f.blended[i])
      throw new Error(
        `${key} at chunk ${cx},${cz} pixel ${i}: ${actual[i]} != ${f.blended[i]}`,
      );
    pixels++;
  }
}
const validation = {
  cases: fixtures.length,
  exactBiomePixels: pixels,
  exactScalars: scalars,
  scope:
    "original RWG selection bytecode on JVM with controlled registry identities; terrain output excluded",
  runtimeEnvironmentVerified: false,
  elapsedMs: Math.round(performance.now() - started),
};
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", root), "utf8"),
);
manifest.validation = validation;
await writeFile(
  new URL("manifest.json", root),
  JSON.stringify(manifest, null, 2),
);
console.log(JSON.stringify(validation));
