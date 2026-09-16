// Local compute benchmark; does not claim browser first-screen latency.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as engine from '../private-packs/rwg-terrain-browser/selection.js';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
const root=new URL('../',import.meta.url);
const coarseFactor=Number(process.argv.find(arg=>arg.startsWith('--coarse-factor='))?.split('=')[1] || 2);
if(![2,4].includes(coarseFactor))throw new Error('Use --coarse-factor=2 or --coarse-factor=4');
const profile=JSON.parse(await readFile(new URL('private-packs/rwg-terrain-browser/profile.json',root),'utf8'));
const keys=Object.fromEntries(profile.biomes.flatMap(b=>[b.base,b.river]).map(b=>[b.legacyId,String(b.legacyId)]));
const make=()=>createRwgProvider(engine,profile,keys,{registry:{get:key=>key?{index:Number(key)}:null}});
const measure=async(fn)=>{const t=performance.now(),data=await fn();return {data,ms:Math.round((performance.now()-t)*100)/100};};
const cases=[];
for(const step of [4,8,16]) {
  const q={seed:'0',dimension:'overworld',x:1536,z:0,width:128,height:128,step};
  let provider=make();
  const exact=await measure(()=>provider.sampleBiomes(q)),repeat=await measure(()=>provider.sampleBiomes(q));
  assert.deepEqual(exact.data,repeat.data);
  provider=make();
  const coarse=await measure(()=>provider.sampleBiomes({...q,width:128/coarseFactor,height:128/coarseFactor,step:step*coarseFactor}));
  const refined=await measure(()=>provider.sampleBiomes(q));assert.deepEqual(refined.data,exact.data);
  const row={step,previewSize:128/coarseFactor,exactMs:exact.ms,repeatMs:repeat.ms,previewMs:coarse.ms,previewAndRefineMs:Math.round((coarse.ms+refined.ms)*100)/100,sha256:createHash('sha256').update(exact.data).digest('hex')};
  cases.push(row);console.log(JSON.stringify(row));
}
const hashes={};
for(const path of ['dist/engine/rwg-provider.js','private-packs/rwg-terrain-browser/selection.js','private-packs/rwg-terrain-browser/profile.json'])hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
await mkdir(new URL('.test-work/',root),{recursive:true});
await writeFile(new URL('.test-work/rwg-progressive-benchmark.json',root),JSON.stringify({scope:'single local Node run; same world area for preview/refinement; not browser latency',cases,hashes},null,2));
