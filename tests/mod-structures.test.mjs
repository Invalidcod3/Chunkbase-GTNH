import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {predictStructures} from "../dist/engine/native.js";
import {validateConfig} from "../dist/engine/config.js";
import {validateModConfig} from "../dist/engine/mod-structures.js";
const fixtures=JSON.parse(await readFile(new URL("fixtures/mod-structures.json",import.meta.url)));
const profiles=[{lootGamesEnabled:true,lootGamesRhombus:20,slimeOverworldEnabled:true,slimeNetherEnabled:false,slimeRarity:8000,meteoritesEnabled:true,meteoriteDistance:707,meteoriteSurfaceChance:0.3,netherSpiresEnabled:true,netherSpireChance:140}];
profiles.push({...profiles[0],lootGamesRhombus:5,slimeNetherEnabled:true,slimeRarity:37,meteoriteDistance:129,netherSpireChance:19});
const relevant=m=>!["MINESHAFT","STRONGHOLD"].includes(m.kind);
const encoded=m=>[m.kind,m.subtype,m.x,m.z,m.certainty].join("|");
for(const [i,f] of fixtures.entries()) test(`mod structures match original Java ${i}`,()=>{
  const q={...f,config:{modStructures:profiles[f.profile],mineshaftsEnabled:false}};
  assert.deepEqual(predictStructures(q).filter(relevant).map(encoded).sort(),f.values);
  const split=Math.floor((f.bounds.minX+f.bounds.maxX)/2);
  const parts=[{...f.bounds,maxX:split},{...f.bounds,minX:split}].flatMap(bounds=>predictStructures({...q,bounds}));
  assert.deepEqual(parts.filter(relevant).map(encoded).sort(),f.values);
});
test("environment preserves mod parameters and rejects invalid imports",()=>{
  assert.deepEqual(validateConfig({schemaVersion:2,modStructures:profiles[0]}).modStructures,profiles[0]);
  for(const value of [null,[],{slimeRarity:0},{lootGamesRhombus:101},{meteoriteDistance:7},{netherSpireChance:2.5},{meteoriteSurfaceChance:NaN},{lootGamesEnabled:"true"}]) assert.throws(()=>validateModConfig(value));
});
test("unspecified mod configuration produces no enabled mod markers",()=>{
  assert.equal(predictStructures({seed:"0",dimension:"overworld",bounds:fixtures[0].bounds,config:{mineshaftsEnabled:false}}).filter(relevant).length,0);
});
