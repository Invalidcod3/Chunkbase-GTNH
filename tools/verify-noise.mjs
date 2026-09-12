import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(
  new URL("../private-packs/rwg-noise-browser/", import.meta.url),
);
const module = await import(pathToFileURL(path.join(root, "noise.js")));
const fixtures = JSON.parse(
  await readFile(path.join(root, "reference.json"), "utf8"),
);
let exact = 0,
  total = 0,
  maxError = 0;
for (const fixture of fixtures) {
  module.setSeed(fixture.seed);
  for (const [index, name] of ["perlin3", "simplex3", "cell3"].entries()) {
    const value = module[name](...fixture.point),
      expected = fixture.values[index];
    if (!Number.isFinite(value)) throw new Error(`${name} produced ${value}`);
    const error = Math.abs(value - expected);
    maxError = Math.max(maxError, error);
    total++;
    if (value === expected) exact++;
    if (error > 1e-7)
      throw new Error(
        `${name} seed=${fixture.seed}: expected ${expected}, got ${value}, error=${error}`,
      );
  }
}
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
manifest.validation = {
  total,
  exact,
  maxAbsoluteError: maxError,
  tolerance: 1e-7,
  oracle: "JVM using original extracted class files",
};
await writeFile(
  path.join(root, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(JSON.stringify(manifest.validation));
