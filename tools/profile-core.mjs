// Reproducible V8 sampling profiles of the installed CPU engines. No browser,
// game attachment, production edits, profiler dependency or remote connection.
import {Session} from 'node:inspector';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpus,totalmem} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),preview=new URL('private-packs/rwg-local-preview/',root);
const output=new URL('.test-work/cpu-profile-2026-09-15/',root);
const json=async path=>JSON.parse(await readFile(new URL(path,preview),'utf8'));
const cases={
  'overworld-4':{dimension:'overworld',step:4},'overworld-16':{dimension:'overworld',step:16},
  'twilight-4':{dimension:'twilight',step:4},'twilight-16':{dimension:'twilight',step:16},
  'nether-16':{dimension:'nether',step:16},'dungeons':{dimension:'overworld',dungeons:true},
};
const id=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
if(!id) {
  await mkdir(output,{recursive:true});
  for(const name of Object.keys(cases)) {
    const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--case='+name],{stdio:'inherit',timeout:180000});
    if(child.error)throw child.error;if(child.status!==0)throw Error('Profile failed: '+name);
  }
} else {
  const spec=cases[id];if(!spec)throw Error('Unknown profile case');
  globalThis.fetch=async url=>{try{return {ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))};}catch{return {ok:false,status:404};}};
  const {loadProviders,findProvider}=await import(new URL('engine/packs.js',preview));
  const installed=await loadProviders();if(installed.some(p=>p.error)||installed.registryError)throw Error('Function pack initialization failed');
  const config=await json('environment.json'),action=spec.dungeons?'predictStructures':'sampleBiomes';
  const provider=findProvider(installed,spec.dimension,action);
  const makeQuery=i=>spec.dungeons?{
    seed:'-17',dimension:'overworld',structureGroup:'dungeons',config,
    bounds:{minX:-512+i*512,minZ:1024,maxX:i*512,maxZ:1536},
  }:{seed:'-17',dimension:spec.dimension,x:-4096+i*128*spec.step,z:2048,width:128,height:128,step:spec.step,config};
  // Small unprofiled JIT warmup at a different position. Timed queries are all
  // previously unseen tiles of one seed, preserving real engine cache behavior.
  if(!spec.dungeons)await provider[action]({...makeQuery(-1),width:32,height:32});
  const session=new Session();session.connect();
  const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,value)=>error?reject(error):resolve(value)));
  await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});
  const cpu=process.cpuUsage(),started=performance.now(),rows=[];
  await post('Profiler.start');
  try {
    for(let i=0;i<48&&(i<3||performance.now()-started<2500);i++) {
      const query=makeQuery(i),t=performance.now(),data=await provider[action](query);
      rows.push({query,ms:performance.now()-t,count:data.length,hash:createHash('sha256').update(data instanceof Uint16Array?new Uint8Array(data.buffer):JSON.stringify(data)).digest('hex')});
    }
  } finally {
    const wallMs=performance.now()-started,cpuUsage=process.cpuUsage(cpu),{profile}=await post('Profiler.stop');session.disconnect();
    await mkdir(output,{recursive:true});await writeFile(new URL(id+'.cpuprofile',output),JSON.stringify(profile));
    const repeat=[];
    for(let i=0;i<20;i++) {const t=performance.now(),data=await provider[action](makeQuery(rows.length-1));repeat.push(performance.now()-t);if(data.length!==rows.at(-1).count)throw Error('Cached result length changed');}
    const hashes={};
    for(const path of ['engine/rwg-provider.js','engine/twilight-provider.js','engine/extra-provider.js','engine/dungeons.js','packs/rwg/selection.js','packs/twilight/selection.js','packs/extra/selection.js']) {
      try{hashes[path]=createHash('sha256').update(await readFile(new URL(path,preview))).digest('hex');}catch{}
    }
    const report={id,spec,runtime:process.version,cpu:cpus()[0]?.model,logicalProcessors:cpus().length,memoryGiB:totalmem()/2**30,
      scope:'Actual installed CPU provider in an isolated Node process; no browser UI, transport, GPU or original Java runtime timing',samplingIntervalUs:1000,
      wallMs,cpuUsage,rows,repeatMs:repeat,hashes};
    await writeFile(new URL(id+'.json',output),JSON.stringify(report,null,2));
    console.log(JSON.stringify({id,queries:rows.length,wallMs:Math.round(wallMs),samples:profile.samples?.length,repeatMedianMs:repeat.sort((a,b)=>a-b)[10]}));
  }
}
