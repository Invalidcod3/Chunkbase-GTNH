import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipStore } from "../dist/export.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const check = spawnSync(
  process.execPath,
  [path.join(root, "tools/check.mjs")],
  { stdio: "inherit", cwd: root },
);
if (check.status !== 0) process.exit(check.status || 1);
async function collect(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name),
      name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...(await collect(file, name + "/")));
    else files.push([name, new Uint8Array(await readFile(file))]);
  }
  return files.sort(([a], [b]) => a.localeCompare(b));
}
const files = await collect(path.join(root, "dist"));
const out = path.join(root, "artifacts");
await mkdir(out, { recursive: true });
const target = path.join(out, "amidst-gtnh-web-static.zip");
const buffer = Buffer.from(await zipStore(files).arrayBuffer());
await writeFile(target, buffer);
await writeFile(
  path.join(out, "SHA256SUMS.txt"),
  `${createHash("sha256").update(buffer).digest("hex")}  amidst-gtnh-web-static.zip\n`,
);
console.log(
  `Packaged ${files.length} files (${Math.round(buffer.length / 1024)} KiB): artifacts/amidst-gtnh-web-static.zip`,
);
const sourceFiles = [];
for (const name of ["dist", "docs", "tests", "tools", "deploy", ".github"])
  for (const entry of await collect(path.join(root, name), name + "/"))
    if (!entry[0].includes("__pycache__/") && !entry[0].endsWith(".pyc"))
      sourceFiles.push(entry);
for (const name of [
  "README.md",
  "LICENSE",
  ".gitignore",
  ".gitattributes",
  "package.json",
  "reference-lock.json",
])
  sourceFiles.push([
    name,
    new Uint8Array(await readFile(path.join(root, name))),
  ]);
const source = Buffer.from(await zipStore(sourceFiles).arrayBuffer());
await writeFile(path.join(out, "amidst-gtnh-web-source.zip"), source);
await writeFile(
  path.join(out, "SHA256SUMS.txt"),
  `${createHash("sha256").update(buffer).digest("hex")}  amidst-gtnh-web-static.zip\n${createHash("sha256").update(source).digest("hex")}  amidst-gtnh-web-source.zip\n`,
);
console.log(
  `Packaged source (${Math.round(source.length / 1024)} KiB): artifacts/amidst-gtnh-web-source.zip`,
);
