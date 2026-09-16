// Compare real compiled generators through the saved pre-optimization adapter.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createExtraProvider} from '../dist/engine/extra-provider.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const baseline=process.argv[2]||'.test-work/dimension-performance-before/';
let activeQuery;
process.on('uncaughtException',error=>{console.error(JSON.stringify({query:activeQuery,error:error.message}));process.exitCode=1;});
async function previous(file) {
  const source=await readFile(new URL(baseline.replace(/\/?$/,'/')+file+'.js',root),'utf8');
  return import('data:text/javascript;base64,'+Buffer.from(source.replace(/from (['"])(\.\/[^'"]+)\1/g,(_,q,p)=>`from '${new URL(p,new URL('dist/engine/',root)).href}'`)).toString('base64'));
}
const oldTf=await previous('twilight-provider'),oldEx=await previous('extra-provider');
const tfProfile=await json('private-packs/twilight-browser/profile.json'),exProfile=await json('private-packs/space-browser/runtime-profile.json');
const tfKeys=Object.fromEntries(Object.values(tfProfile.biomes).map(b=>[b.id,String(b.id)])),exKeys=Object.fromEntries((await json('private-packs/space-browser/biomes.json')).map(b=>[b.id,String(b.id)]));
// The old adapter can emit unregistered slots. Normalize only the explicit,
// live-validated aliases when comparing; the current adapter uses real keys.
const oldKeys={...exKeys};
for(const d of Object.values(exProfile.dimensions))for(const [slot,id] of Object.entries(d.biomeAliases||{}))oldKeys[Number(slot)+(d.offset||0)]=String(id+(d.offset||0));
const opts={registry:{get:k=>k===undefined?null:{index:Number(k)}},yieldTask:async()=>{}};
let queries=0,pixels=0,subsetChecks=0;
const dimensions=['twilight',...Object.entries(exProfile.dimensions).filter(([,d])=>d.graph).map(([k])=>k)].filter(k=>!process.argv[3]||process.argv[3].split(',').includes(k));
for(const dimension of dimensions) {
  const tf=dimension==='twilight',dir=tf?'twilight':'space',profile=tf?tfProfile:exProfile,keys=tf?tfKeys:exKeys;
  const oldEngine=await import(new URL(`private-packs/${dir}-browser/selection.js?verify=old`,root)),newEngine=await import(new URL(`private-packs/${dir}-browser/selection.js?verify=new`,root));
  const old=(tf?oldTf.createTwilightProvider:oldEx.createExtraProvider)(oldEngine,profile,tf?keys:oldKeys,opts);
  const current=(tf?createTwilightProvider:createExtraProvider)(newEngine,profile,keys,opts);
  for(const seed of ['-17','9007199254740993','-9223372036854775808','9223372036854775807']) {
    for(const step of [1,2,3,4,5,8,16,32,64,128,256]) {
      const q={seed,dimension,x:tf&&step===4?-516:-517,z:tf&&step===4?-1032:-1031,width:19,height:35,step};
      activeQuery=q;
      const expected=await old.sampleBiomes(q),got=await current.sampleBiomes(q);assert.deepEqual(got,expected,`${dimension}/${seed}/${step}`);
      queries++;pixels+=got.length;
      const middle=17;
      const a=await current.sampleBiomes({...q,height:middle}),b=await current.sampleBiomes({...q,z:q.z+middle*step,height:q.height-middle});
      assert.deepEqual([...a,...b],[...expected],'split from completed raster');subsetChecks++;
    }
    const fine={seed,dimension,x:-512,z:1024,width:64,height:64,step:4};
    await current.sampleBiomes(fine);
    for(const step of [8,16]) {
      const coarse={...fine,width:256/step,height:256/step,step};
      assert.deepEqual(await current.sampleBiomes(coarse),await old.sampleBiomes(coarse),'finer cache serves exact coarse grid');subsetChecks++;
    }
  }
  console.log('Verified '+dimension);
}
const result={dimensions,queries,pixels,subsetChecks,scope:'Real compiled engines through old/new adapters; negative coordinates, 64-bit seeds, strides 1–256, split and coarse-cache reuse'};
await writeFile(new URL('.test-work/dimension-optimization-validation.json',root),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
