import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  out = path.join(root, "artifacts/capture-agent"),
  classes = path.join(out, "classes");
await mkdir(classes, { recursive: true });
function run(command, args) {
  const p = spawnSync(command, args, { encoding: "utf8" });
  if (p.status !== 0) throw new Error(p.stderr || p.error);
}
run("javac", [
  "--release",
  "8",
  "-encoding",
  "UTF-8",
  "-d",
  classes,
  path.join(root, "tools/capture-agent/src/RuntimeCapture.java"),
]);
await writeFile(
  path.join(out, "MANIFEST.MF"),
  "Manifest-Version: 1.0\nPremain-Class: amidst.web.capture.RuntimeCapture\nCan-Redefine-Classes: false\nCan-Retransform-Classes: false\n\n",
);
run("jar", [
  "cfm",
  path.join(out, "amidst-runtime-capture.jar"),
  path.join(out, "MANIFEST.MF"),
  "-C",
  classes,
  ".",
]);
console.log("Built artifacts/capture-agent/amidst-runtime-capture.jar");
