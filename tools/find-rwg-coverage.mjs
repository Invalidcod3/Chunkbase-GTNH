import {readFile,writeFile} from "node:fs/promises";
import {configureSelection} from "./rwg-profile.mjs";
const root=new URL("../private-packs/",import.meta.url);
const profile=JSON.parse(await readFile(new URL("runtime-session/active-profile.json",root),"utf8"));
const manifest=JSON.parse(await readFile(new URL("rwg-selection-browser/manifest.json",root),"utf8"));
const engine=await import(new URL("rwg-selection-browser/selection.js",root));
const found=new Map(),targets=[];
configureSelection(engine,profile,manifest.inputClasses["rwg/world/ChunkManagerRealistic"],"0");
for(let z=-20000;z<=20000;z+=256)for(let x=-20000;x<=20000;x+=256){
  const id=engine.rawBiome(x,z),count=found.get(id)||0;
  const b=profile.biomes.find(b=>b.id===id);
  // More samples for surface-sensitive dunes; otherwise cover every identity.
  const limit=/Dune|Desert|Canyon|Mesa|Oasis/.test(b.class+" "+b.base.name)?8:1;
  if(count<limit){targets.push({seed:"0",chunk:[Math.floor(x/16),Math.floor(z/16)],rawId:id});found.set(id,count+1);}
}
const report={targets,coveredIds:[...found.keys()].sort((a,b)=>a-b),missingIds:profile.biomes.filter(b=>!found.has(b.id)).map(b=>b.id)};
await writeFile(new URL("runtime-session/coverage-targets.json",root),JSON.stringify(report,null,2));
console.log(JSON.stringify({targets:targets.length,covered:found.size,missingIds:report.missingIds}));
