import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {validateResources,resourcePoints} from '../dist/engine/resources.js';
const root=new URL('../private-packs/rwg-local-preview/',import.meta.url);
const json=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const config=await json('environment.json'),registry=await json('packs/registry.json');
const descriptor=registry.packs.find(p=>p.id==='local-resources-calibrated');
const thread=new Worker(new URL('../tests/helpers/compute-worker.mjs',import.meta.url),{workerData:{entry:new URL('engine/worker.js',root).href}});
const adapter={postMessage:m=>thread.postMessage(m),terminate:()=>thread.terminate()},client=new WorkerClient(()=>adapter);
thread.on('message',data=>adapter.onmessage({data}));thread.on('error',()=>adapter.onerror());
const counts={};
try {
  for(const dimension of ['asteroids','mehen','kuiper_belt','end']) {
    const q={dimension,seed:'9007199254740993',config,mode:'ORES',bounds:{minX:-2048,minZ:-2048,maxX:2048,maxZ:2048}};
    const values=validateResources(await client.request('predictResources',q),'ORES');
    const asteroids=values.filter(d=>d.kind==='ASTEROID_VEIN'||d.kind==='ASTEROID_SMALL');
    assert.ok(asteroids.length>0);if(dimension!=='end')assert.equal(asteroids.length,values.length);
    const options=descriptor.dimensions.find(d=>d.key===dimension).resourceOptions.ORES;
    assert.ok(asteroids.every(d=>options.some(o=>o.id===d.id)));
    if(dimension!=='end')assert.ok(options.every(o=>o.id.startsWith('asteroid.')));
    const id=asteroids[0].id,points=resourcePoints(values,{id},q.bounds);assert.ok(points.length>0&&points.every(d=>d.id===id&&Number.isInteger(d.y)));
    if(dimension==='end') {
      const structures=await client.request('predictStructures',q),byPosition=new Map(asteroids.map(d=>[`${d.x}:${d.z}`,d]));
      const mapped=structures.filter(d=>['END_NAQUADAH_ASTEROID','END_SCHEELITE_ASTEROID','END_PLATINUM_ASTEROID'].includes(d.kind));assert.ok(mapped.length>0);
      for(const s of mapped){const d=byPosition.get(`${s.x}:${s.z}`);assert.ok(d);assert.equal(s.y,d.y);assert.equal(s.size,d.size);}
    }
    counts[dimension]={deposits:values.length,asteroids:asteroids.length,options:options.length};
  }
  console.log(JSON.stringify({installedWorker:true,counts,mismatches:0}));
} finally {client.close();await thread.terminate();}
