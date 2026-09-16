import {readFile,writeFile} from "node:fs/promises";
import {configureSelection} from "./rwg-profile.mjs";
import {createHash} from "node:crypto";
const root=new URL("../private-packs/",import.meta.url);
const terrain=process.argv.includes("--terrain"),folder=terrain?"rwg-terrain-browser":"rwg-selection-browser";
const sparse=process.argv.includes('--sparse');
const engine=await import(new URL(folder+"/selection.js",root));
const profile=JSON.parse(await readFile(new URL("runtime-session/active-profile.json",root),"utf8"));
const manifest=JSON.parse(await readFile(new URL(folder+"/manifest.json",root),"utf8"));
const suffix=process.argv.includes("--extra")?"extra-":process.argv.includes("--coverage")?"coverage-":"";
const referenceName="worker-"+suffix+"reference.json";
const fixtures=JSON.parse(await readFile(new URL("runtime-session/"+referenceName,root),"utf8"));
const biomes=new Map(profile.biomes.map(b=>[b.id,b]));
const summary={stage:terrain?"terrain-and-dune-surface":"blended-base-plus-river; no surface replacement",cases:fixtures.cases.length,pixels:0,matches:0,mismatches:0,byTransition:{},examples:[]};
const started=performance.now();
let seed;
for(const f of fixtures.cases){
  if(f.seed!==seed){configureSelection(engine,profile,manifest.inputClasses["rwg/world/ChunkManagerRealistic"],f.seed);seed=f.seed;}
  const [cx,cz]=f.chunk,selected=engine.blendedChunk(cx,cz);
  const final=terrain?(sparse?engine.finalSamples(cx*16,cz*16,16,16,1):engine.finalChunk(cx,cz)):null;
  for(let i=0;i<256;i++){
    const x=cx*16+i%16,z=cz*16+Math.floor(i/16),b=biomes.get(selected[i]);
    if(!b)throw new Error("Missing realistic identity "+selected[i]);
    const predicted=final?final[i]:(engine.riverAt(x,z)?b.river:b.base).legacyId,expected=f.ids[i];
    summary.pixels++;
    if(predicted===expected)summary.matches++;
    else{
      summary.mismatches++;
      const key=`${predicted} -> ${expected}`;summary.byTransition[key]=(summary.byTransition[key]||0)+1;
      if(summary.examples.length<20)summary.examples.push({seed,x,z,realisticId:b.id,predicted,expected});
    }
  }
}
summary.elapsedMs=Math.round(performance.now()-started);
summary.engineSha256=createHash("sha256").update(await readFile(new URL(folder+"/selection.js",root))).digest("hex");
summary.profileSha256=createHash("sha256").update(await readFile(new URL("runtime-session/active-profile.json",root))).digest("hex");
await writeFile(new URL("runtime-session/"+(sparse?'sparse-':'')+(terrain?"terrain-":"")+suffix+"calibration.json",root),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,examples:summary.examples.slice(0,3)}));
if(summary.mismatches) process.exitCode=1;
