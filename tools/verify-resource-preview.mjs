import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resourcePoints,validateResources} from '../dist/engine/resources.js';
const root=new URL('../private-packs/rwg-local-preview/',import.meta.url);
const registry=JSON.parse(await readFile(new URL('packs/registry.json',root),'utf8'));
const descriptor=registry.packs.find(p=>p.id==='local-resources-calibrated');
assert.ok(descriptor,'Explicitly build --resources first');
// Exercise the installed provider module with the same local JSON bytes served by HTTP.
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  assert.equal(url.href,new URL('packs/resources/profile.json',root).href);
  return {ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))};
};
let provider;
try{({provider}=await import(new URL('packs/resources/provider.js',root)));}finally{globalThis.fetch=originalFetch;}
const q={seed:'9007199254740993',bounds:{minX:-256,minZ:-256,maxX:256,maxZ:256}};
let layers=0;
for(const d of descriptor.dimensions)for(const mode of ['ORES','FLUID']) {
  const deposits=validateResources(await provider.predictResources({...q,dimension:d.key,mode}),mode);
  if(!d.resourceModes.includes(mode)){assert.equal(deposits,null);continue;}
  assert.ok(deposits.length>0);layers++;
  const points=resourcePoints(deposits,{text:'',minimum:0},q.bounds);
  assert.ok(points.length>0&&points.every(p=>p.x>=q.bounds.minX&&p.x<q.bounds.maxX&&p.z>=q.bounds.minZ&&p.z<q.bounds.maxZ));
  if(mode==='FLUID')assert.ok(points.every(p=>p.source==='INITIAL'&&p.unit==='L/Op'));
}
console.log(`Installed resource pack verified: ${descriptor.dimensions.length} UI dimensions, ${layers} configured layers, absent layers and export points.`);
