import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {rwgStructures} from "../dist/engine/rwg-structures.js";
import {configureSelection} from "./rwg-profile.mjs";
const root=new URL("../private-packs/rwg-terrain-browser/",import.meta.url);
const engine=await import(new URL("selection.js",root));
const profile=JSON.parse(await readFile(new URL("profile.json",root),"utf8"));
const manifest=JSON.parse(await readFile(new URL("manifest.json",root),"utf8"));
const fixtures=JSON.parse(await readFile(new URL("village-reference.json",root),"utf8"));
let villages=0;
for(const f of fixtures){
  configureSelection(engine,profile,manifest.inputClasses["rwg/world/ChunkManagerRealistic"],f.seed);
  const [x,z,w,h]=f.area,q={seed:f.seed,dimension:"overworld",bounds:{minX:x,minZ:z,maxX:x+w,maxZ:z+h},config:{mineshaftsEnabled:false}};
  const actual=(await rwgStructures(q,(x,z)=>engine.villageViable(x,z))).filter(v=>v.kind==="VILLAGE").map(v=>[v.x,v.z]);
  assert.deepEqual(actual,f.villages,`${f.seed} ${f.area}`);villages+=actual.length;
  assert.equal((await rwgStructures({...q,config:{villagesEnabled:false,mineshaftsEnabled:false}},()=>{throw Error("Disabled predicate invoked");})).filter(v=>v.kind==="VILLAGE").length,0);
}
assert.ok(villages>0);
const report={cases:fixtures.length,matchedVillages:villages,engineSha256:createHash("sha256").update(await readFile(new URL("selection.js",root))).digest("hex"),scope:"offline original Java reference plus captured RWG terrain"};
await writeFile(new URL("village-validation.json",root),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
