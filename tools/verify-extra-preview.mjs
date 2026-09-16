import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.argv[2]?pathToFileURL(path.resolve(process.argv[2])+path.sep):new URL('../private-packs/rwg-local-preview/',import.meta.url);
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  const u=new URL(url);assert.ok(u.href.startsWith(root.href),'Installed local pack requests only');
  return {ok:true,json:async()=>JSON.parse(await readFile(u,'utf8'))};
};
try{
  const {loadProviders,findProvider}=await import(new URL('engine/packs.js',root));
  const {dimensions,registerDimension,biomeRegistry}=await import(new URL('engine/catalog.js',root));
  const {validateConfig}=await import(new URL('engine/config.js',root));
  const installed=await loadProviders();
  assert.ok(!installed.registryError);assert.ok(installed.every(p=>!p.error),'Every installed provider must load');
  for(const {descriptor} of installed)for(const entry of descriptor.dimensions){
    const d=registerDimension(entry);d.map||=entry.capabilities.includes('biomes');d.structures||=entry.capabilities.includes('structures');d.resources||=entry.capabilities.includes('resources');
  }
  const config=validateConfig(JSON.parse(await readFile(new URL('environment.json',root),'utf8')));
  const spawn=await findProvider(installed,'overworld','predictSpawn').predictSpawn({seed:'9223372036854775807',dimension:'overworld',config});assert.equal(spawn.status,'ESTIMATED');assert.deepEqual([spawn.x,spawn.z],[41,-41]);assert.equal(spawn.y,undefined);
  const around=await findProvider(installed,'overworld','predictStructures').predictStructures({seed:'9223372036854775807',dimension:'overworld',config,excludedKinds:['VANILLA_SPAWNER_DUNGEON','THAUMCRAFT_AURA_NODE','THAUMCRAFT_ELDRITCH_ALTAR'],bounds:{minX:-64,minZ:-64,maxX:64,maxZ:64}});assert.deepEqual(around.filter(m=>m.kind==='WORLD_SPAWN').map(m=>[m.x,m.z]),[[41,-41]]);
  assert.equal(dimensions.length,42);assert.equal(dimensions.filter(d=>d.resources).length,41);assert.equal(dimensions.filter(d=>d.map).length,42);
  for(const d of dimensions)assert.ok(Number.isInteger(config.dimensionIds[d.key]));
  assert.notEqual(config.dimensionIds.mehen,config.dimensionIds.makemake);
  assert.notEqual(config.dimensionIds.deep_dark,config.dimensionIds.everglades);
  const extra=installed.find(p=>p.descriptor.id==='local-extra-dimensions-calibrated');assert.ok(extra);
  for(const d of extra.descriptor.dimensions){
    for(const step of [1,4,8]){
      const values=await findProvider(installed,d.key,'sampleBiomes').sampleBiomes({seed:'-17',dimension:d.key,config,x:-517,z:219,width:8,height:5,step});
      assert.equal(values.length,40);assert.ok([...values].every(id=>biomeRegistry.at(id)));
    }
    if(d.capabilities.includes('structures')){
      const values=await findProvider(installed,d.key,'predictStructures').predictStructures({seed:'-17',dimension:d.key,config,bounds:{minX:-256,minZ:-256,maxX:256,maxZ:256}});
      assert.ok(values.every(m=>d.structureKinds.includes(m.kind)));
    }
  }
  for(const key of ['nether','io','pluto'])assert.equal(findProvider(installed,key,'predictStructures'),undefined,'Keep native structure routing: '+key);
  for(const [dimension,id] of [['ross128b',6560],['deep_dark',160]]){
    const q={seed:'9223372036854775807',dimension,config,x:251,z:3065,width:2,height:1,step:128};
    const values=await findProvider(installed,dimension,'sampleBiomes').sampleBiomes(q);
    assert.deepEqual([...values],[biomeRegistry.get('amidst:extra_biome_'+id).index,biomeRegistry.get('amidst:extra_biome_'+id).index],'Installed canonical biome alias: '+dimension);
  }
  const uniform=installed.find(p=>p.descriptor.id==='local-uniform-biomes-calibrated');assert.equal(uniform.descriptor.dimensions.length,24);
  for(const d of uniform.descriptor.dimensions){
    const b=biomeRegistry.get(d.uniformBiome);assert.ok(b);
    const values=await findProvider(installed,d.key,'sampleBiomes').sampleBiomes({seed:'-17',dimension:d.key,config,x:-513,z:219,width:8,height:5,step:16});
    assert.equal(values.length,40);assert.ok([...values].every(i=>biomeRegistry.at(i)===b));
    assert.equal(findProvider(installed,d.key,'predictStructures'),undefined);
    assert.ok(findProvider(installed,d.key,'predictResources'));
  }
  console.log('Installed preview verified: 42 biome maps, 41 resource dimensions, 24 configured constant biome maps, existing structure routing preserved.');
}finally{globalThis.fetch=originalFetch;}
