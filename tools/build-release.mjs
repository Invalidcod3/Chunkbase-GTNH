// Package current UI + explicitly selected calibrated browser runtime.
// Original captures, instance files and credentials are never copied.
import {readdir,readFile,writeFile,mkdir,mkdtemp,copyFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {zipStore} from '../dist/export.js';
import {writeReleaseAssets} from './release-assets.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length && (args.length!==2||args[0]!=='--runtime-dir'))throw new Error('Usage: node tools/build-release.mjs [--runtime-dir <calibrated browser directory>]');
const runtime=path.resolve(root,args[1]||'runtime');
const out=path.join(root,'artifacts');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const runtimeInfo=JSON.parse(await readFile(path.join(runtime,'build-info.json'),'utf8'));
const villageProfile=JSON.parse(await readFile(path.join(root,'dist/data/village-profile.json'),'utf8'));
const rwgProvider=await readFile(path.join(runtime,'packs/rwg/provider.js'),'utf8');
if(!rwgProvider.includes('villageProfile')||!rwgProvider.includes('../../data/village-profile.json'))
  throw new Error('Rebuild the runtime provider with the current Village Names profile before packaging.');
if(!runtimeInfo.environmentId||!runtimeInfo.options?.space||!runtimeInfo.options?.resources)
  throw new Error('A complete calibrated runtime is required; use --runtime-dir private-packs/rwg-local-preview in the maintainer workspace.');

async function files(dir,prefix=''){
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error('Symlinks are not release inputs: '+prefix+entry.name);
    if(['__pycache__','node_modules','.git','.wrangler'].includes(entry.name)||/\.(pyc|log)$/.test(entry.name))continue;
    if(entry.isDirectory())result.push(...await files(path.join(dir,entry.name),prefix+entry.name+'/'));
    else result.push(prefix+entry.name);
  }
  return result.sort();
}
async function copyTree(from,to){
  for(const name of await files(from))await copy(from,name,to);
}
async function copy(from,name,to){
  await mkdir(path.dirname(path.join(to,name)),{recursive:true});
  await copyFile(path.join(from,name),path.join(to,name));
}
function run(script,...extra){
  const result=spawnSync(process.execPath,[path.join(root,'tools',script),...extra],{cwd:root,stdio:'inherit'});
  if(result.status!==0)throw new Error(script+' failed');
}
run('check.mjs');
await mkdir(out,{recursive:true});
// A fresh staging directory avoids stale outputs without deleting user files.
const stage=await mkdtemp(path.join(out,'release-build-'));
const source=path.join(stage,'source'),web=path.join(stage,'cloudflare');
await mkdir(source,{recursive:true});await mkdir(web,{recursive:true});
for(const name of ['dist','docs','tests','tools'])await copyTree(path.join(root,name),path.join(source,name));
for(const name of ['README.md','LICENSE','.gitignore','.gitattributes','package.json','reference-lock.json'])await copy(root,name,source);

// Only the already-built browser payload is carried into the source archive.
// Keeping it with the source makes this specific deployment reproducible without Minecraft.
const payload=path.join(source,'runtime');
await mkdir(payload,{recursive:true});
await copyTree(path.join(runtime,'packs'),path.join(payload,'packs'));
for(const name of ['environment.json','build-info.json','display-revision.json','cpu-optimization.json'])await copy(runtime,name,payload);
await copyTree(path.join(root,'dist'),web);
await copyTree(payload,web);
await writeReleaseAssets(web);
const info={...runtimeInfo,type:'calibrated-static',environment:'GTNH 2.9.0-beta-3',version:pkg.version,sourceRepository:'https://github.com/Invalidcod3/Chunkbase-GTNH'};
info.villagePrediction={revision:'vn-2026-10-10',algorithm:villageProfile.algorithm,configCommit:villageProfile.provenance.configCommit,scope:'candidate selection; native JAR controlled comparison; building assembly not replayed'};
await writeFile(path.join(web,'build-info.json'),JSON.stringify(info,null,2)+'\n');
// CLI launchers belong in the source/local package, not the hosted assets.
const excludedHosted=new Set(['Start.cmd','start-local.mjs','HOW-TO-RUN.txt']);
for(const name of excludedHosted)await unlink(path.join(web,name));
run('check.mjs',web);
run('verify-extra-preview.mjs',web);
run('verify-resource-preview.mjs',web);

const checksums=[],summaries={};
for(const [name,dir] of [['chunkbase-gtnh-cloudflare.zip',web],['chunkbase-gtnh-source.zip',source]]){
  const entries=[];
  for(const file of await files(dir))entries.push([file,new Uint8Array(await readFile(path.join(dir,file)))]);
  const bytes=Buffer.from(await zipStore(entries).arrayBuffer());
  await writeFile(path.join(out,name),bytes);
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  summaries[name]={files:entries.length,bytes:bytes.length};
}
await writeFile(path.join(out,'RELEASE-SHA256SUMS.txt'),checksums.join('\n')+'\n');
await writeFile(path.join(out,'release-report.json'),JSON.stringify({version:pkg.version,sourceDirectory:path.relative(root,source),deploymentDirectory:path.relative(root,web),environmentId:info.environmentId,archives:summaries},null,2)+'\n');
console.log(JSON.stringify({source,web,...summaries},null,2));
