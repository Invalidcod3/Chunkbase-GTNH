import {writeFile} from 'node:fs/promises';
const cases=[];
for(const seed of ['0','-17','9007199254740993','-9223372036854775808','9223372036854775807'])
  for(const [x,z] of [[-513,-257],[4096,-8192],[1008,-1232]]) {
    cases.push({id:`dungeons:${seed}:${x}`,command:'structures',seed,dimension:0,x,z,width:512,height:512,vanilla_dungeons:true});
    cases.push({id:`nearby:${seed}:${x}`,command:'structures',seed,dimension:0,x:x-144,z:z-144,width:800,height:800});
  }
await writeFile(new URL('../private-packs/runtime-session/dungeon-plan.json',import.meta.url),JSON.stringify({schemaVersion:1,cases},null,2));
console.log(`Planned ${cases.length} dungeon and surrounding-structure queries.`);
