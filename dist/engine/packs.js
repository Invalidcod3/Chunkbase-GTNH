// Packs are installed by the site maintainer, never executed from user uploads.
// A JVM extraction archive cannot pass this browser-pack contract.
import { biomeRegistry } from "./catalog.js";
export function validateRegistry(registry, base) {
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.packs))
    throw new Error("Invalid function pack registry");
  const seen = new Set();
  return registry.packs.map((pack) => {
    if (
      !pack ||
      typeof pack.id !== "string" ||
      seen.has(pack.id) ||
      pack.browserExecutable !== true ||
      pack.apiVersion !== 1
    )
      throw new Error(
        "Function pack is not browser executable or has a duplicate ID",
      );
    seen.add(pack.id);
    const url = new URL(pack.entry, base),
      root = new URL("./", base);
    if (
      url.origin !== root.origin ||
      !url.pathname.startsWith(root.pathname) ||
      !url.pathname.endsWith(".js") ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error(
        "Function pack must be installed under the local packs directory",
      );
    if (
      !Array.isArray(pack.dimensions) ||
      !pack.dimensions.every(
        (d) =>
          typeof d.key === "string" &&
          Array.isArray(d.capabilities) &&
          (d.resourceModes === undefined || (Array.isArray(d.resourceModes) && d.resourceModes.every(m => ['ORES','FLUID'].includes(m)))) &&
          d.capabilities.every((c) =>
            ["biomes", "structures", "resources"].includes(c),
          ),
      )
    )
      throw new Error("Invalid function pack capabilities");
    return { ...pack, url: url.href };
  });
}
export async function readRegistry() {
  const url = new URL("../packs/registry.json", import.meta.url),
    response = await fetch(url);
  if (!response.ok) throw new Error("Cannot load function pack registry");
  return validateRegistry(await response.json(), url);
}
export async function loadProviders() {
  const descriptors = await readRegistry();
  for (const descriptor of descriptors)
    for (const biome of descriptor.biomes || []) biomeRegistry.register(biome);
  return Promise.all(
    descriptors.map(async (descriptor) => {
      const module = await import(descriptor.url);
      if (module.provider?.apiVersion !== 1)
        throw new Error("Invalid provider API: " + descriptor.id);
      return { descriptor, provider: module.provider };
    }),
  );
}
export function findProvider(installed, dimension, action) {
  const capability = {
    sampleBiomes: "biomes",
    predictStructures: "structures",
    predictResources: "resources",
  }[action];
  return installed.find(({ descriptor }) =>
    descriptor.dimensions.some(
      (d) => d.key === dimension && d.capabilities.includes(capability),
    ),
  )?.provider;
}
