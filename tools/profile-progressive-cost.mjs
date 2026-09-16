import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createExtraProvider} from '../dist/engine/extra-provider.js';
const root=new URL('../',import.meta.url),out=new URL('.test-work/cpu-profile-2026-09-15/',root);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const tf=await json('private-packs/twilight-browser/profile.json'),extra=await json('private-packs/space-browser/runtime-profile.json');
const tk=Object.fromEntries(Object.values(tf.biomes).map(b=>[b.id,String(b.id)]));
const ek=Object.fromEntries((await json('private-packs/space-browser/biomes.json')).map(b=>[b.id,String(b.id)]));
const registry={get:k=>k===undefined?null:{index:Number(k)}};
const engines={twilight:await import('../private-packs/twilight-browser/selection.js'),nether:await import('../private-packs/space-browser/selection.js')};
const rows=[];
for(const dimension of ['twilight','nether'])for(const step of [4,16]) {
  const make=()=>dimension==='twilight'?createTwilightProvider(engines[dimension],tf,tk,{registry}):createExtraProvider(engines[dimension],extra,ek,{registry});
  const trials=[];
  await make().sampleBiomes({seed:'0',dimension,x:0,z:0,width:32,height:32,step});
  for(let trial=0;trial<3;trial++) {
    const q={seed:String(trial-1),dimension,x:-4096,z:2048,width:128,height:128,step},result={},times={};
    for(const mode of trial%2?['progressive','direct']:['direct','progressive']) {
      const provider=make(),t=performance.now();
      if(mode==='progressive'){await provider.sampleBiomes({...q,width:64,height:64,step:step*2});times.preview=performance.now()-t;}
      result[mode]=await provider.sampleBiomes(q);times[mode]=performance.now()-t;
    }
    assert.deepEqual(result.direct,result.progressive);trials.push(times);
  }
  const median=k=>trials.map(t=>t[k]).sort((a,b)=>a-b)[1];
  const row={dimension,step,directMs:median('direct'),previewMs:median('preview'),progressiveMs:median('progressive'),workRatio:median('progressive')/median('direct'),trials};
  rows.push(row);console.log(JSON.stringify(row));
}
await writeFile(new URL('progressive-cost.json',out),JSON.stringify({scope:'Same covered area, unmodified CPU engines, three seeds, alternating order, identical final pixels',rows},null,2));
