import {writeFile} from 'node:fs/promises';
const cases=[];
for(const seed of ['0','-17','9007199254740993','-9223372036854775808','9223372036854775807']) {
  for(const [x,z,step] of [[-260,-516,4],[8192,-16384,4],[-19,13,1],[29998000,-29998000,4],[1791,-2061,1]])
    cases.push({id:`biomes:${seed}:${x}:${step}`,command:'biomes',seed,dimension:7,dimension_key:'twilightforest:twilight_forest',x,z,width:64,height:48,step});
  for(const [x,z] of [[-2057,-1031],[8192,-16384],[29995000,-29999000]])
    cases.push({id:`features:${seed}:${x}`,command:'structures',seed,dimension:7,dimension_key:'twilightforest:twilight_forest',x,z,width:4096,height:4096});
}
await writeFile(new URL('../private-packs/runtime-session/twilight-plan.json',import.meta.url),JSON.stringify({schemaVersion:1,cases},null,2));
console.log(`Planned ${cases.length} Twilight queries.`);
