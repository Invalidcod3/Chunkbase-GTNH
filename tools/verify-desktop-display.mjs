import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const manifest=await json('tools/desktop-display/manifest.json');
for(const [name,file] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(new URL('tools/desktop-display/'+name,root))).digest('hex'),file.sha256);
const names=Object.values(await json('tools/dimension-names.json')),translations=await json('tools/desktop-display/zh_CN.json');
assert.equal(names.length,42);
const packRoot=new URL('private-packs/rwg-local-preview/',root),registry=await json('private-packs/rwg-local-preview/packs/registry.json');
const {registerDimension,dimensions,biomeRegistry}=await import(new URL('engine/catalog.js',packRoot));
const {registerPackBiomes}=await import(new URL('engine/packs.js',packRoot));
const {validateConfig}=await import(new URL('engine/config.js',packRoot));
for(const pack of registry.packs){registerPackBiomes(pack);for(const d of pack.dimensions)registerDimension(d);}
for(const [key,zh,en] of names){
  const desktopKey=({'The End':'End',Proteus:'Proteus (海卫八)'})[en]||en;
  assert.equal(zh,translations[desktopKey],key+' pinned translation');
  assert.equal(dimensions.find(d=>d.key===key)?.zh,zh,key+' installed name');
}
const pluto={Pluto:'#a57e61',Pluto2:'#f9f0d6',Pluto3:'#c3b9af',Pluto4:'#8c5235'};
const palette=biomeRegistry.indices.filter(b=>Object.hasOwn(pluto,b.en));assert.equal(new Set(palette.map(b=>b.en)).size,4);
assert.ok(palette.length>=4);
for(const b of palette)assert.equal(b.color,pluto[b.en]);
const key=palette[0].key;assert.equal(validateConfig({schemaVersion:2,biomeColors:{[key]:'#123456'}}).biomeColors[key],'#123456','Explicit user colors remain accepted');
const display=await json('private-packs/rwg-local-preview/display-revision.json');assert.equal(display.paletteSha256,manifest.files['GtnhBiomeColorPalette.java'].sha256);
// All algorithm/profile provenance must still match: display sync cannot silently recompile generators.
let checks=0;
for(const path of ['packs/rwg/spawn-provenance.json','packs/extra/provenance.json','packs/extra/uniform-provenance.json']){
  const report=await json('private-packs/rwg-local-preview/'+path);
  for(const [file,hash] of Object.entries(report.hashes)){assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),hash,file);checks++;}
}
const result={dimensions:names.length,pluto,plutoDisplayEntries:palette.length,sourceState:manifest.sourceState,unchangedProvenanceHashes:checks};
await writeFile(new URL('private-packs/runtime-session/display-validation.json',root),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
