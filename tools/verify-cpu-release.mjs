import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),preview=new URL('private-packs/rwg-local-preview/',root);
const json=async url=>JSON.parse(await readFile(url,'utf8'));
const digest=data=>createHash('sha256').update(data).digest('hex');
const records=await json(new URL('cpu-optimization.json',preview));
for(const [name,pack] of [['rwg-terrain','rwg'],['twilight','twilight'],['space','extra'],['cave','caves'],['spawn','spawn']]) {
  const record=records.engines[name];
  assert.equal(record.outputSha256,digest(await readFile(new URL(`packs/${pack}/selection.js`,preview))));
  assert.equal(record.inputSha256,digest(await readFile(new URL(`private-packs/${name}-browser/selection.unoptimized.js`,root))));
}
for(const path of ['index.html','style.css','app.js','saved-spawn.js','export.js','engine/navigation.js','engine/spawn.js','engine/rwg-provider.js','compute-allocation.js','map.js','map-memory.js','gpu-biome-renderer.js','engine/compute-pool.js','engine/packs.js'])assert.deepEqual(await readFile(new URL(path,preview)),await readFile(new URL('dist/'+path,root)));
const registry=await json(new URL('packs/registry.json',preview));
const dimensions=registry.packs.flatMap(p=>p.dimensions).filter(d=>d.capabilities.includes('biomes'));
const profile=await json(new URL('private-packs/space-browser/runtime-profile.json',root));
const direct=new Set(['twilight',...Object.entries(profile.dimensions).filter(([,d])=>d.graph).map(([key])=>key)]);
for(const dimension of dimensions)assert.equal(dimension.biomePreview==='direct',direct.has(dimension.key),dimension.key);
if(process.argv.includes('--http')) {
  for(const path of ['','style.css','app.js','saved-spawn.js','export.js','engine/navigation.js','engine/spawn.js','engine/rwg-provider.js','compute-allocation.js','map.js','map-memory.js','gpu-biome-renderer.js','engine/compute-pool.js','engine/packs.js','cpu-optimization.json','packs/registry.json','packs/rwg/provider.js','packs/rwg/spawn-profile.json','packs/rwg/selection.js','packs/spawn/selection.js']) {
    const response=await fetch('http://127.0.0.1:4175/'+path);assert.equal(response.status,200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL(path||'index.html',preview)));
  }
}
console.log(JSON.stringify({optimizedEngines:5,directDimensions:[...direct],previewMatchesSource:true,httpChecked:process.argv.includes('--http')}));
