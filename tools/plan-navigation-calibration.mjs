import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../private-packs/runtime-session/',import.meta.url);
const hello=JSON.parse(await readFile(new URL('space-hello.json',base),'utf8'));
const seeds=['0','-17','9007199254740993','-9223372036854775808','9223372036854775807'];
const cases=seeds.flatMap(seed=>[[-513,-257],[4097,-8193],[29990000,-29999900]].map(([x,z])=>({id:`asteroids:${seed}:${x}`,command:'structures',seed,dimension:hello.asteroidsDimensionId,dimension_key:'galacticraftasteroids:asteroids',x,z,width:1024,height:1024})));
await writeFile(new URL('asteroid-structure-plan.json',base),JSON.stringify({schemaVersion:1,cases},null,2));
await writeFile(new URL('spawn-plan.json',base),JSON.stringify({schemaVersion:1,cases:seeds.map(seed=>({id:`spawn:${seed}`,command:'spawn',seed,dimension:0}))},null,2));
