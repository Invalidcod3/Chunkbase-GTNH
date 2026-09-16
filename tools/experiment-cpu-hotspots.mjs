// Isolated hypotheses, never copied into dist or the served/calibrated packs.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createExtraProvider} from '../dist/engine/extra-provider.js';
const root=new URL('../',import.meta.url),out=new URL('.test-work/cpu-profile-2026-09-15/',root),variants=new URL('variants/',out);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
await mkdir(variants,{recursive:true});
const engines={},changes={},hashes={};
for(const type of ['rwg','twilight','extra','caves']) {
  const path=`private-packs/rwg-local-preview/packs/${type}/selection.js`,source=await readFile(new URL(path,root),'utf8');
  hashes[path]=createHash('sha256').update(source).digest('hex');
  let replacements=0;
  const folded=source.replace(/Long_create\((-?\d+),\s*(-?\d+)\)/g,(_,lo,hi)=>{
    replacements++;
    return '('+BigInt.asIntN(64,BigInt.asUintN(64,BigInt(lo))|BigInt.asUintN(64,BigInt(hi)<<32n))+'n)';
  });
  changes[type]={constantExpressions:replacements};
  for(const mode of ['baseline','constants',...(type==='rwg'?['cell32']:[])]) {
    let code=mode==='baseline'?source:folded;
    if(mode==='cell32') {
      const expression=/ru_CellNoise_valueNoise2D = \(\$x, \$z, \$seed\) => \{[\s\S]*?\n\};/;
      assert.equal([...code.matchAll(new RegExp(expression.source,'g'))].length,1);
      code=code.replace(expression,`ru_CellNoise_valueNoise2D = ($x, $z, $seed) => {
        const seed32=Number(BigInt.asIntN(32,$seed));
        const n=(Math.imul(1619,$x)+Math.imul(6971,$z)+Math.imul(1013,seed32))&2147483647;
        const v=(n>>>13)^n;
        const hash=(Math.imul(v,(Math.imul(Math.imul(v,v),60493)+19990303)|0)+1376312589)&2147483647;
        return 1-hash/1073741824;
      };`);
    }
    if(type==='rwg')code+='\nexport {ru_CellNoise_valueNoise2D as auditCellNoise};\n';
    const path=new URL(`${type}-${mode}.mjs`,variants);await writeFile(path,code);engines[type+'/'+mode]=await import(path);
  }
}
let state=123456789,cellChecks=0;
const next=()=>state=(Math.imul(state,1664525)+1013904223)|0;
for(const seed of [0n,-1n,1n,9223372036854775807n,-9223372036854775808n])for(let i=0;i<10000;i++) {
  const x=next(),z=next();assert.equal(engines['rwg/cell32'].auditCellNoise(x,z,seed),engines['rwg/baseline'].auditCellNoise(x,z,seed));cellChecks++;
}
const profiles={rwg:await json('private-packs/rwg-terrain-browser/profile.json'),twilight:await json('private-packs/twilight-browser/profile.json'),extra:await json('private-packs/space-browser/runtime-profile.json')};
const keys={rwg:Object.fromEntries(profiles.rwg.biomes.flatMap(b=>[b.base,b.river]).map(b=>[b.legacyId,String(b.legacyId)])),
  twilight:Object.fromEntries(Object.values(profiles.twilight.biomes).map(b=>[b.id,String(b.id)])),
  extra:Object.fromEntries((await json('private-packs/space-browser/biomes.json')).map(b=>[b.id,String(b.id)]))};
const registry={get:k=>k===undefined?null:{index:Number(k)}};
const make=(type,mode)=>({rwg:createRwgProvider,twilight:createTwilightProvider,extra:createExtraProvider})[type](engines[type+'/'+mode],profiles[type],keys[type],{registry});
const rows=[];let pixels=0;
for(const [type,dimension,step] of [['rwg','overworld',4],['rwg','overworld',16],['twilight','twilight',4],['twilight','twilight',16],['extra','nether',16]]) {
  const modes=['baseline','constants',...(type==='rwg'?['cell32']:[])],trials=[];
  for(const mode of modes)await make(type,mode).sampleBiomes({seed:'0',dimension,x:0,z:0,width:32,height:32,step});
  for(let trial=0;trial<3;trial++) {
    const q={seed:['-17','9223372036854775807','-9223372036854775808'][trial],dimension,x:-4096,z:2048,width:128,height:128,step};
    const result={},times={};
    for(const mode of trial%2?[...modes].reverse():modes) {const provider=make(type,mode),t=performance.now();result[mode]=await provider.sampleBiomes(q);times[mode]=performance.now()-t;}
    for(const mode of modes.slice(1)){assert.deepEqual(result[mode],result.baseline);pixels+=result.baseline.length;}
    trials.push(times);
  }
  const median=key=>trials.map(t=>t[key]).sort((a,b)=>a-b)[1];
  const row={dimension,step,baselineMs:median('baseline'),constantsMs:median('constants'),constantsSpeedup:median('baseline')/median('constants'),
    ...(type==='rwg'?{cell32Ms:median('cell32'),cell32Speedup:median('baseline')/median('cell32')}:{}),trials};
  rows.push(row);console.log(JSON.stringify(row));
}
// Cave mask kernel check stays independent of the dungeon-filter and caches.
const caveRows=[];let caveCells=0;
for(let trial=0;trial<3;trial++) {
  const seed=['-17','9223372036854775807','-9223372036854775808'][trial],result={},times={};
  for(const mode of trial%2?['constants','baseline']:['baseline','constants']) {
    const engine=engines['caves/'+mode];engine.configure(seed);
    const t=performance.now();result[mode]=[];for(let i=0;i<16;i++)result[mode].push(engine.mask(-32+i,64));times[mode]=performance.now()-t;
  }
  assert.deepEqual(result.constants,result.baseline);caveCells+=result.baseline.reduce((n,a)=>n+a.length,0);caveRows.push(times);
}
const report={scope:'Isolated generated-module variants; same provider/cache implementations; three seeds and alternating execution order; no changes to production',changes,hashes,cellChecks,pixelComparisons:pixels,caveCells,caveRows,rows};
await writeFile(new URL('experiments.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({cellChecks,pixels,caveCells,caveRows}));
