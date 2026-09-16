// Local paired compute benchmark, not browser latency or desktop-client FPS.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createExtraProvider} from '../dist/engine/extra-provider.js';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const baseline=process.argv[2]||'.test-work/dimension-performance-before/';
async function oldProvider(name) {
  const source=await readFile(new URL(baseline.replace(/\/?$/,'/')+name+'.js',root),'utf8');
  const linked=source.replace(/from (['"])(\.\/[^'"]+)\1/g,(_,quote,p)=>`from '${new URL(p,new URL('dist/engine/',root)).href}'`);
  return import('data:text/javascript;base64,'+Buffer.from(linked).toString('base64'));
}
const oldTwilight=await oldProvider('twilight-provider'),oldExtra=await oldProvider('extra-provider');
const tfProfile=await json('private-packs/twilight-browser/profile.json'),exProfile=await json('private-packs/space-browser/runtime-profile.json');
const tfKeys=Object.fromEntries(Object.values(tfProfile.biomes).map(b=>[b.id,String(b.id)]));
const exKeys=Object.fromEntries((await json('private-packs/space-browser/biomes.json')).map(b=>[b.id,String(b.id)]));
const engines={};
for(const type of ['twilight','space'])for(const version of ['old','new'])
  engines[type+version]=await import(new URL(`private-packs/${type}-browser/selection.js?paired=${version}`,root));
const registry={get:k=>k===undefined?null:{index:Number(k)}};
function make(dimension,version) {
  const tf=dimension==='twilight',engine=engines[(tf?'twilight':'space')+version];
  const factory=tf?(version==='old'?oldTwilight.createTwilightProvider:createTwilightProvider):(version==='old'?oldExtra.createExtraProvider:createExtraProvider);
  return factory(engine,tf?tfProfile:exProfile,tf?tfKeys:exKeys,{registry});
}
const measure=async fn=>{const t=performance.now(),data=await fn();return {data,ms:performance.now()-t};};
const rows=[],dimensions=['twilight',...Object.entries(exProfile.dimensions).filter(([,d])=>d.graph).map(([k])=>k)];
for(const dimension of dimensions) {
  // Give both compiled engines a small warm-up. Fresh providers below avoid hits.
  for(const version of ['old','new'])await make(dimension,version).sampleBiomes({seed:'0',dimension,x:0,z:0,width:16,height:16,step:4});
  for(const step of dimension==='twilight'?[4,8,16]:[4,16]) {
    const samples=[];
    for(let trial=0;trial<3;trial++) {
      const q={seed:String(trial),dimension,x:-512,z:1024,width:128,height:128,step};
      const providers={old:make(dimension,'old'),new:make(dimension,'new')},values={};
      for(const version of trial%2?['new','old']:['old','new'])values[version]=await measure(()=>providers[version].sampleBiomes(q));
      assert.deepEqual(values.new.data,values.old.data,dimension+' '+step);
      const repeat=await measure(()=>providers.new.sampleBiomes(q));assert.deepEqual(repeat.data,values.old.data);
      samples.push({before:values.old.ms,after:values.new.ms,repeat:repeat.ms});
    }
    const median=k=>samples.map(s=>s[k]).sort((a,b)=>a-b)[1],round=n=>Math.round(n*100)/100;
    const row={dimension,step,beforeMs:round(median('before')),afterMs:round(median('after')),repeatMs:round(median('repeat')),speedup:round(median('before')/median('after')),pixelsEqual:true};
    rows.push(row);console.log(JSON.stringify(row));
  }
}
const hashes={};
for(const file of ['dist/engine/twilight-provider.js','dist/engine/extra-provider.js','dist/engine/biome-raster-cache.js',baseline.replace(/\/?$/,'/')+'twilight-provider.js',baseline.replace(/\/?$/,'/')+'extra-provider.js','private-packs/twilight-browser/selection.js','private-packs/space-browser/selection.js'])
  hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await mkdir(new URL('.test-work/',root),{recursive:true});
await writeFile(new URL('.test-work/dimension-loading-benchmark.json',root),JSON.stringify({scope:'Local Node paired compute; median of 3 seeds; 128x128; no browser/Java timing; alternating version order',rows,hashes},null,2));
