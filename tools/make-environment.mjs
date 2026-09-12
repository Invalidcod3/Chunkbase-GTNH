import { readFile, writeFile } from "node:fs/promises";
import { validateConfig } from "../dist/engine/config.js";
const report = JSON.parse(
  await readFile(
    process.argv[2] || "private-packs/environment-inspection.json",
    "utf8",
  ),
);
const settings = new Map(
  Object.values(report.selectedSettings)
    .flat()
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(2, i).replaceAll('"', ""), line.slice(i + 1)];
    }),
);
const values = { schemaVersion: 1, dimensionIds: {} };
for (const [key, field] of Object.entries({
  moon: "idDimensionMoon",
  mars: "dimensionIDMars",
  ceres: "dimensionIDCeres",
  io: "dimensionIDIo",
  enceladus: "dimensionIDEnceladus",
  proteus: "dimensionIDProteus",
  pluto: "dimensionIDPluto",
  twilight: "dimensionID",
}))
  if (settings.has(field))
    values.dimensionIds[key] = Number(settings.get(field));
for (const [key, field] of Object.entries({
  chaosEnabled: "Generate Chaos Islands",
  mineshaftsEnabled: "Generate Mineshafts",
}))
  if (settings.has(field)) values[key] = settings.get(field) === "true";
if (settings.has("Disable Moon Village Gen"))
  values.moonVillagesEnabled =
    settings.get("Disable Moon Village Gen") !== "true";
if (settings.has("Chaos Island Separation"))
  values.chaosSeparation = Number(settings.get("Chaos Island Separation"));
function color(base, id) {
  const variation = ((((id * 17) % 13) + 13) % 13) - 6;
  return (
    "#" +
    [16, 8, 0]
      .map((shift) =>
        Math.max(0, Math.min(255, ((base >> shift) & 255) + variation))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
values.biomeColors = {
  3100: color(0x737b83, 3100),
  3101: color(0x737b83, 3101),
  3102: color(0x737b83, 3102),
};
for (const key of ["biomeIDMars", "idBiomeMars"])
  if (settings.has(key))
    values.biomeColors[3300] = color(
      0x9c563b,
      4352 + Number(settings.get(key)),
    );
const output = validateConfig(values);
await writeFile(
  process.argv[3] || "dist/environment.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    dimensionIds: output.dimensionIds,
    biomeColors: output.biomeColors,
  }),
);
