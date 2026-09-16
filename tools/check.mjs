import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url)),
  dist = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "dist");
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}
const files = await walk(dist),
  errors = [];
async function checkLink(from, reference) {
  if (!reference.startsWith("./") && !reference.startsWith("../")) return;
  try {
    const target = path.resolve(path.dirname(from), reference);
    if (!(await stat(target)).isFile()) errors.push(reference);
  } catch {
    errors.push(path.relative(root, from) + " → " + reference);
  }
}
for (const file of files) {
  if (/\.m?js$/.test(file)) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (result.status !== 0) errors.push(result.stderr);
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(
      /(?:from\s*|import\s*)['"]([^'"]+)['"]/g,
    ))
      await checkLink(file, match[1]);
  } else if (file.endsWith(".json")) JSON.parse(await readFile(file, "utf8"));
}
const html = await readFile(path.join(dist, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g))
  await checkLink(path.join(dist, "index.html"), match[1]);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
if (ids.length !== new Set(ids).size) errors.push("Duplicate HTML IDs");
const app = await readFile(path.join(dist, "app.js"), "utf8");
for (const match of app.matchAll(/\$\(['"]([^'"]+)['"]\)/g))
  if (!ids.includes(match[1])) errors.push("Missing DOM target: " + match[1]);
for (const match of app.matchAll(/:\s*['"]([a-z0-9_]+)['"]/g)) {
  if (
    match[1].includes("hee_") ||
    match[1].includes("galacticraft_") ||
    match[1].includes("galaxyspace_")
  )
    await checkLink(path.join(dist, "app.js"), "./assets/" + match[1] + ".png");
}
if (files.some((file) => /\.(jar|class|zip|properties|cfg)$/i.test(file)))
  errors.push("Private runtime material present in static output");
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  `Validated ${files.length} static files, JavaScript syntax and local references.`,
);
