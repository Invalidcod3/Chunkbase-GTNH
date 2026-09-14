import { dimensions, legacyDisplayKeys } from "./catalog.js";
import { assertResourceKey } from "./biome-registry.js";
import { validateModConfig } from "./mod-structures.js";
export const defaults = {
  schemaVersion: 2,
  chaosEnabled: true,
  chaosSeparation: 10000,
  moonVillagesEnabled: true,
  villagesEnabled: true,
  mineshaftsEnabled: true,
  dimensionIds: Object.fromEntries(dimensions.map((d) => [d.key, d.id])),
};
export function validateConfig(value) {
  if (!value || ![1, 2].includes(value.schemaVersion))
    throw new Error("不支持的环境配置版本");
  const output = structuredClone(defaults);
  if ("modStructures" in value) output.modStructures = validateModConfig(value.modStructures);
  for (const key of [
    "chaosEnabled",
    "moonVillagesEnabled",
    "villagesEnabled",
    "mineshaftsEnabled",
  ])
    if (key in value) {
      if (typeof value[key] !== "boolean") throw new Error(`无效配置：${key}`);
      output[key] = value[key];
    }
  if ("chaosSeparation" in value) {
    if (
      !Number.isInteger(value.chaosSeparation) ||
      value.chaosSeparation < 256 ||
      value.chaosSeparation > 1000000
    )
      throw new Error("无效混沌岛间距");
    output.chaosSeparation = value.chaosSeparation;
  }
  for (const dimension of dimensions)
    if (value.dimensionIds && dimension.key in value.dimensionIds) {
      const id = value.dimensionIds[dimension.key];
      if (!Number.isInteger(id) || Math.abs(id) > 2147483647)
        throw new Error("无效维度 ID");
      output.dimensionIds[dimension.key] = id;
    }
  if (value.biomeColors) {
    if (
      typeof value.biomeColors !== "object" ||
      Array.isArray(value.biomeColors)
    )
      throw new Error("无效色板");
    output.biomeColors = {};
    for (const [id, color] of Object.entries(value.biomeColors)) {
      const key =
        value.schemaVersion === 1 && /^\d+$/.test(id)
          ? legacyDisplayKeys[id]
          : id;
      assertResourceKey(key);
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("无效生物群系颜色");
      output.biomeColors[key] = color;
    }
  }
  return output;
}
