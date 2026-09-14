import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../private-packs/runtime-session/',import.meta.url);
const profile=JSON.parse(await readFile(new URL('resource-profile.json',root),'utf8'));
const cases=[];
for(const d of profile.dimensions)for(const [seed,x,z] of [['9007199254740993',-256,-256],['-9223372036854775808',-513,127],['9223372036854775807',512,-512],['-17',-257,-129]])
  for(const mode of ['ORES','FLUID'])if(d[mode==='ORES'?'ores':'fluids']?.length)
    cases.push({id:`${d.id}:${mode}:${seed}`,command:'prospecting',seed,dimension:d.id,marker_mode:mode,x,z,width:512,height:512});
await writeFile(new URL('resource-plan.json',root),JSON.stringify({schemaVersion:1,cases},null,2));
console.log(`Planned ${cases.length} live resource queries across ${profile.dimensions.length} dimensions.`);
