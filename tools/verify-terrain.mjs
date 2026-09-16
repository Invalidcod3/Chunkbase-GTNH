import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {configureSelection} from "./rwg-profile.mjs";
import {createHash} from "node:crypto";
const dir=new URL("../private-packs/rwg-terrain-browser/",import.meta.url);
const engine=await import(new URL("selection.js",dir));
const profile=JSON.parse(await readFile(new URL("profile.json",dir),"utf8"));
const manifest=JSON.parse(await readFile(new URL("manifest.json",dir),"utf8"));
const fixtures=JSON.parse(await readFile(new URL("reference.json",dir),"utf8"));
let pixels=0,heights=0,sparsePixels=0;
for(const f of fixtures){
  configureSelection(engine,profile,manifest.inputClasses["rwg/world/ChunkManagerRealistic"],f.seed);
  assert.deepEqual(Array.from(engine.finalChunk(...f.chunk)),f.ids,`IDs ${f.seed} ${f.chunk}`);
  assert.deepEqual(Array.from(engine.fastHeights(...f.chunk)),f.heights.map(Math.fround),`height ${f.seed} ${f.chunk}`);
  for(const step of [1,2,4,8,16]) for(const offset of new Set([0,step-1])) {
    const size=Math.ceil((16-offset)/step),x=f.chunk[0]*16+offset,z=f.chunk[1]*16+offset;
    const samples=Array.from(engine.finalSamples(x,z,size,size,step));
    const expected=Array.from({length:size*size},(_,i)=>f.ids[(offset+Math.floor(i/size)*step)*16+offset+(i%size)*step]);
    assert.deepEqual(samples,expected,`sparse ${f.seed} ${f.chunk} step=${step} offset=${offset}`);
    sparsePixels+=samples.length;
  }
  pixels+=f.ids.length;heights+=f.heights.length;
}
const result={cases:fixtures.length,exactPixels:pixels,exactSparsePixels:sparsePixels,exactBinary32Heights:heights,engineSha256:createHash("sha256").update(await readFile(new URL("selection.js",dir))).digest("hex")};
await writeFile(new URL("jvm-validation.json",dir),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
