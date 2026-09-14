import {writeFile} from 'node:fs/promises';
const cases=[];
for(const seed of ['0','-17','9007199254740993','-9223372036854775808','9223372036854775807'])
 for(const [x,z,width] of [[-513,-257,1024],[4096,-8192,512]])for(const group of ['standard','thaumcraft'])
  cases.push({id:`${seed}:${x}:${z}:${group}`,command:'structures',seed,dimension:0,dimension_key:'minecraft:overworld',structure_group:group,x,z,width,height:width});
await writeFile(new URL('../private-packs/runtime-session/surface-plan.json',import.meta.url),JSON.stringify({schemaVersion:1,cases},null,2));
console.log(`Planned ${cases.length} surface structure queries.`);
