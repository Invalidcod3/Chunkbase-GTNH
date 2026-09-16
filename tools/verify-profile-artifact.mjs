import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
const root=new URL('../.test-work/cpu-profile-2026-09-15/',import.meta.url);
const html=await readFile(new URL('flamegraphs.html',root),'utf8');
const script=html.match(/<script>([\s\S]+)<\/script>/)?.[1];assert.ok(script);new Script(script);
const charts=JSON.parse(script.match(/const data=(.+);\nconst labels=/)[1]);assert.equal(charts.length,6);
let frames=0;
function check(n){frames++;assert.ok(Number.isFinite(n.value)&&n.value>=0);assert.equal(n.value,n.self+n.children.reduce((sum,c)=>sum+c.value,0));for(const child of n.children)check(child);}
for(const chart of charts){assert.ok(chart.tree.value>0);check(chart.tree);assert.ok(chart.self.every(f=>f.percent>=0&&f.percent<=100));}
const experiment=JSON.parse(await readFile(new URL('experiments.json',root),'utf8'));
for(const [file,hash] of Object.entries(experiment.hashes)){
  const {createHash}=await import('node:crypto');
  const type=file.split('/').at(-2);
  const captured=await readFile(new URL('variants/'+type+'-baseline.mjs',root),'utf8');
  // The RWG experiment appended a diagnostic export; exclude it from the captured source hash.
  const original=type==='rwg'?captured.replace(/\nexport \{ru_CellNoise_valueNoise2D as auditCellNoise\};\n$/,''):captured;
  assert.equal(createHash('sha256').update(original).digest('hex'),hash,'captured baseline: '+file);
}
console.log(JSON.stringify({charts:charts.length,weightedFrames:frames,inlineScriptSyntax:'valid',capturedBaselines:'verified',browserVisualQA:false}));
