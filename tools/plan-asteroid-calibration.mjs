import {writeFile} from 'node:fs/promises';
// Central samples cannot depend on HEE's loaded-world cache. Fresh-End island logic is checked separately.
const cases=['0','1','-17','9007199254740993','-9223372036854775808','9223372036854775807'].map(seed=>({
  id:`end:${seed}`,command:'structures',seed,dimension:1,dimension_key:'minecraft:the_end',x:-513,z:-511,width:1024,height:1024,
}));
await writeFile(new URL('../private-packs/runtime-session/asteroid-plan.json',import.meta.url),JSON.stringify({schemaVersion:1,cases},null,2));
console.log(`Planned ${cases.length} End queries.`);
