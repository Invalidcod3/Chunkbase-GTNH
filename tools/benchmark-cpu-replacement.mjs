import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createExtraProvider} from '../dist/engine/extra-provider.js';
const root=new URL('../',import.meta.url),out=new URL('.test-work/cpu-replacement/',root);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
await mkdir(out,{recursive:true});
const engines={},hashes={};
for(const [type,folder] of [['rwg','rwg-terrain'],['twilight','twilight'],['extra','space']]) {
  for(const mode of ['baseline','optimized']) {
    const path=`private-packs/${folder}-browser/selection${mode==='baseline'?'.unoptimized':''}.js`;
    const source=await readFile(new URL(path,root));
    hashes[path]=createHash('sha256').update(source).digest('hex');
    engines[type+'/'+mode]=await import(new URL(path,root));
  }
}
const profiles={rwg:await json('private-packs/rwg-terrain-browser/profile.json'),twilight:await json('private-packs/twilight-browser/profile.json'),extra:await json('private-packs/space-browser/runtime-profile.json')};
const keys={rwg:Object.fromEntries(profiles.rwg.biomes.flatMap(b=>[b.base,b.river]).map(b=>[b.legacyId,String(b.legacyId)])),
  twilight:Object.fromEntries(Object.values(profiles.twilight.biomes).map(b=>[b.id,String(b.id)])),
  extra:Object.fromEntries((await json('private-packs/space-browser/biomes.json')).map(b=>[b.id,String(b.id)]))};
const registry={get:k=>k===undefined?null:{index:Number(k)}};
const make=(type,mode)=>({rwg:createRwgProvider,twilight:createTwilightProvider,extra:createExtraProvider})[type](engines[type+'/'+mode],profiles[type],keys[type],{registry});
const rows=[];let pixels=0;
for(const pipeline of ['direct','map-policy'])for(const [type,dimension,step] of [['rwg','overworld',4],['rwg','overworld',16],['twilight','twilight',4],['twilight','twilight',16],['extra','nether',16]]) {
  if(pipeline==='map-policy'&&type==='rwg')continue;
  const modes=['baseline','optimized'],trials=[];
  for(const mode of modes)await make(type,mode).sampleBiomes({seed:'0',dimension,x:0,z:0,width:32,height:32,step});
  for(let trial=0;trial<3;trial++) {
    const q={seed:['-17','9223372036854775807','-9223372036854775808'][trial],dimension,x:-4096,z:2048,width:128,height:128,step};
    const results={},times={};
    for(const mode of trial%2?[...modes].reverse():modes) {
      const provider=make(type,mode),start=performance.now();
      if(pipeline==='map-policy'&&mode==='baseline')await provider.sampleBiomes({...q,width:64,height:64,step:step*2});
      results[mode]=await provider.sampleBiomes(q);times[mode]=performance.now()-start;
    }
    assert.deepEqual(results.optimized,results.baseline);pixels+=results.baseline.length;trials.push(times);
  }
  const median=key=>trials.map(t=>t[key]).sort((a,b)=>a-b)[1];
  const row={pipeline,dimension,step,baselineMs:median('baseline'),optimizedMs:median('optimized'),speedup:median('baseline')/median('optimized'),trials};
  rows.push(row);console.log(JSON.stringify(row));
}
await writeFile(new URL('benchmark.json',out),JSON.stringify({scope:'Actual production generated engines versus retained unoptimized originals; same providers and caches; three seeds, alternating order; Node CPU timings, not browser first paint',hashes,pixelComparisons:pixels,rows},null,2));
