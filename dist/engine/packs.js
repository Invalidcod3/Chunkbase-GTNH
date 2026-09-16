// Packs are installed by the site maintainer, never executed from user uploads.
// A JVM extraction archive cannot pass this browser-pack contract.
import { biomeRegistry } from "./catalog.js";
import { BiomeRegistry } from "./biome-registry.js";
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
          typeof d.key === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(d.key) &&
          (d.id===undefined||(Number.isInteger(d.id)&&Math.abs(d.id)<=2147483647)) &&
          ['zh','en','noteEn'].every(k=>d[k]===undefined||(typeof d[k]==='string'&&d[k].length>0&&d[k].length<=512)) &&
          (d.uniformBiome===undefined||(typeof d.uniformBiome==='string'&&/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(d.uniformBiome))) &&
          (d.biomePreview===undefined||['direct','progressive'].includes(d.biomePreview)) &&
          Array.isArray(d.capabilities) &&
          (d.resourceModes === undefined || (Array.isArray(d.resourceModes) && d.resourceModes.every(m => ['ORES','FLUID'].includes(m)))) &&
          (d.resourceOptions === undefined || (d.resourceOptions && typeof d.resourceOptions==='object' && Object.entries(d.resourceOptions).every(([mode,options])=>['ORES','FLUID'].includes(mode)&&Array.isArray(options)&&options.length<=4096&&options.every(o=>o&&typeof o.id==='string'&&o.id.length>0&&o.id.length<=256&&typeof o.name==='string'&&o.name.length<=256)))) &&
          (d.structureKinds === undefined || (Array.isArray(d.structureKinds) && d.structureKinds.length<=256 && d.structureKinds.every(k=>typeof k==='string' && /^[A-Z0-9_]+$/.test(k)))) &&
          d.capabilities.every((c) =>
            ["biomes", "structures", "resources", "spawn"].includes(c),
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
export function registerPackBiomes(descriptor,registry=biomeRegistry) {
  // Validate a whole pack before committing any of its palette entries.
  const check=new BiomeRegistry();for(const b of registry.indices)check.register(b);
  for(const b of descriptor.biomes || [])check.register(b);
  return (descriptor.biomes || []).map(b=>registry.register(b));
}
export async function loadProviders({descriptors,registry=biomeRegistry,importer=url=>import(url)}={}) {
  try{descriptors??=await readRegistry();}catch(error){return Object.assign([],{registryError:error});}
  const installed=descriptors.map(descriptor=>({descriptor}));
  // Palette order stays deterministic even when module loading fails.
  for(const p of installed)try{registerPackBiomes(p.descriptor,registry);}catch(error){p.error=error;p.invalidPalette=true;}
  for(const p of installed)p.load=async()=>{
    if(p.invalidPalette)return;
    try{
      const url=new URL(p.descriptor.url);if(p.attempts)url.searchParams.set('retry',String(p.attempts));p.attempts=(p.attempts||0)+1;
      const module=await importer(url.href);
      if(module.provider?.apiVersion!==1)throw new Error('Invalid provider API: '+p.descriptor.id);
      for(const action of new Set(p.descriptor.dimensions.flatMap(d=>d.capabilities.map(c=>({biomes:'sampleBiomes',structures:'predictStructures',resources:'predictResources',spawn:'predictSpawn'})[c]))))
        if(typeof module.provider[action]!=='function')throw new Error('Function pack method missing: '+action);
      p.provider=module.provider;p.error=null;
    }catch(error){p.error=error;}
  };
  await Promise.all(installed.filter(p=>!p.error).map(p=>p.load()));return installed;
}
export async function retryProviders(installed) {
  await Promise.all(installed.filter(p=>p.error&&!p.invalidPalette).map(p=>p.load()));
  return installed.filter(p=>p.error).map(p=>({id:p.descriptor.id,error:p.error.message}));
}
export function findProvider(installed, dimension, action) {
  const capability = {
    sampleBiomes: "biomes",
    predictStructures: "structures",
    predictResources: "resources",
    predictSpawn: "spawn",
  }[action];
  if(installed.registryError && !(action==='sampleBiomes'&&['end','moon','mars','ceres','enceladus','proteus'].includes(dimension)))throw new Error('函数包目录加载失败：'+installed.registryError.message);
  const match=installed.find(({ descriptor }) =>
    descriptor.dimensions.some(
      (d) => d.key === dimension && d.capabilities.includes(capability),
    ),
  );
  if(match?.error)throw new Error('函数包 '+match.descriptor.id+' 加载失败：'+match.error.message);
  return match?.provider;
}
