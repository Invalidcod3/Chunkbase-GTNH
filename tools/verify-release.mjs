import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {crc32} from '../dist/export.js';
import {dimensions} from '../dist/engine/catalog.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'artifacts');
const report=JSON.parse(await readFile(path.join(out,'release-report.json'),'utf8'));
const hashes=await readFile(path.join(out,'RELEASE-SHA256SUMS.txt'),'utf8');
function entries(zip){
  const result=new Map();let offset=0;
  while(zip.readUInt32LE(offset)===0x04034b50){
    assert.equal(zip.readUInt16LE(offset+8),0,'Expected store-only ZIP');
    const size=zip.readUInt32LE(offset+18),nameSize=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28);
    const name=zip.subarray(offset+30,offset+30+nameSize).toString('utf8');
    assert.ok(!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..'),'Unsafe archive path');
    assert.ok(!result.has(name),'Duplicate archive path');
    const start=offset+30+nameSize+extra,data=zip.subarray(start,start+size);
    assert.equal(data.length,size);assert.equal(crc32(data),zip.readUInt32LE(offset+14),name);
    result.set(name,data);offset=start+size;
  }
  assert.equal(zip.readUInt32LE(offset),0x02014b50);
  assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length-12),result.size);
  return result;
}
const sensitiveName=/(?:^|\/)(?:\.git|\.env(?:\.[^/]*)?|node_modules|\.wrangler|runtime-session|diagnostics|logs|saves)(?:\/|$)|\.(?:jar|class|dat|mca|log|pyc)$/i;
const credentials=/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
for(const [name,summary] of Object.entries(report.archives)){
  const bytes=await readFile(path.join(out,name)),files=entries(bytes);
  assert.ok(hashes.includes(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`));
  assert.equal(bytes.length,summary.bytes);assert.equal(files.size,summary.files);
  for(const [file,data] of files){
    assert.ok(!sensitiveName.test(file),'Unexpected release material: '+file);
    if(/\.(?:m?js|json|md|html|txt|py|java|ps1|yml)$/.test(file))assert.ok(!credentials.test(data.toString('utf8')),'Credential pattern in '+file);
  }
  if(name.includes('cloudflare')){
    assert.ok(files.size<=1000,'Pages dashboard upload supports up to 1,000 files');
    for(const [file,data] of files)assert.ok(data.length<=25*1024*1024,'Pages asset too large: '+file);
    for(const file of ['index.html','404.html','_headers','app.js','packs/registry.json','LICENSE.txt','NOTICE.md'])assert.ok(files.has(file),file);
    const registry=JSON.parse(files.get('packs/registry.json'));
    assert.equal(new Set([...dimensions.filter(d=>d.map).map(d=>d.key),...registry.packs.flatMap(p=>p.dimensions.filter(d=>d.capabilities.includes('biomes')).map(d=>d.key))]).size,42);
    assert.ok(files.get('index.html').toString().includes('https://github.com/Invalidcod3/Chunkbase-GTNH'));
    for(const file of files.keys())assert.ok(!/^tools\/|^tests\/|^docs\/|^Start\.cmd$|^start-local\.mjs$/.test(file),file);
    const staged=path.resolve(root,report.deploymentDirectory);
    assert.ok(staged.startsWith(out+path.sep));
    for(const [file,data] of files)assert.deepEqual(await readFile(path.join(staged,file)),data,'Staging differs from archive: '+file);
  }else{
    for(const file of ['package.json','README.md','LICENSE','tools/build-release.mjs','.github/workflows/ci.yml','runtime/packs/registry.json'])assert.ok(files.has(file),file);
    assert.ok(!files.has('.openai/hosting.json'));
  }
  console.log(`${name}: ${files.size} files, hashes/CRC/path and content checks passed.`);
}
