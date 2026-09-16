import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../private-packs/runtime-session/',import.meta.url);
const hello=JSON.parse(await readFile(new URL('space-hello.json',base),'utf8'));
const seeds=['0','-17','9007199254740993','-9223372036854775808','9223372036854775807'];
const cases=[];
for(const [key,id] of [['extrautilities:deep_dark',hello.deepDarkDimensionId],['amunra:anubis',hello.anubisDimensionId],['amunra:horus',hello.horusDimensionId]])
  for(const seed of seeds)
    for(const [x,z] of [[-1025,-513],[4095,-8193],[29997900,-29999900]])
      cases.push({id:`${key}:${seed}:${x}`,command:'structures',seed,dimension:id,dimension_key:key,x,z,width:1024,height:1024});
await writeFile(new URL('../private-packs/runtime-session/space-plan.json',import.meta.url),JSON.stringify({schemaVersion:1,cases},null,2));
console.log(`Planned ${cases.length} regional space structure queries.`);
const dimensions=[['nether',-1,'minecraft:the_nether'],['io',hello.ioDimensionId,'galaxyspace:io'],['pluto',hello.plutoDimensionId,'galaxyspace:pluto'],['barnarda_c',hello.barnardaCDimensionId,'galaxyspace:barnarda_c'],['ross128b',hello.ross128bDimensionId,'bartworks:ross128b'],['deep_dark',hello.deepDarkDimensionId,'extrautilities:deep_dark'],['anubis',hello.anubisDimensionId,'amunra:anubis'],['horus',hello.horusDimensionId,'amunra:horus'],['asteroids',hello.asteroidsDimensionId,'galacticraftasteroids:asteroids'],['mehen',hello.mehenBeltDimensionId,'amunra:asteroidbeltmehen']];
if(dimensions.some(d=>!Number.isInteger(d[1])))throw new Error('Fresh Worker hello with all dimension IDs required');
const biomeCases=[],specialCases=[];
for(const [key,dimension,dimension_key] of dimensions)for(const seed of seeds)
  for(const [x,z,step] of [[-513,-257,1],[4097,-8193,4],[29990000,-29999900,16]])
    biomeCases.push({id:`${key}:${seed}:${step}`,command:'biomes',seed,dimension,dimension_key,x,z,width:32,height:24,step});
for(const key of ['mehen','ross128b']){
  const [,dimension,dimension_key]=dimensions.find(d=>d[0]===key);
  for(const seed of seeds)for(const [x,z] of [[-513,-257],[4097,-8193],[29990000,-29999900]])
    specialCases.push({id:`${key}:${seed}:${x}`,command:'structures',seed,dimension,dimension_key,x,z,width:1024,height:1024});
}
await writeFile(new URL('space-biome-plan.json',base),JSON.stringify({schemaVersion:1,cases:biomeCases},null,2));
await writeFile(new URL('space-special-plan.json',base),JSON.stringify({schemaVersion:1,cases:specialCases},null,2));
console.log(`Planned ${biomeCases.length} biome and ${specialCases.length} special structure queries.`);
