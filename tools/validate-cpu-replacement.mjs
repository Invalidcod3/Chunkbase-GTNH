// Re-run original JVM/instance fixtures against the installed optimized engines.
// No game process, Java agent or network access is used.
import {spawnSync} from 'node:child_process';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const commands=[
  ['verify-terrain.mjs'],['verify-rwg-villages.mjs'],
  ...['--coverage','--extra'].flatMap(flag=>[['calibrate-rwg.mjs','--terrain',flag],['calibrate-rwg.mjs','--terrain','--sparse',flag]]),
  ['calibrate-surface-structures.mjs'],['calibrate-live-structures.mjs'],['calibrate-dungeons.mjs'],
  ['calibrate-twilight.mjs'],['calibrate-extra.mjs'],['calibrate-spawn.mjs'],
];
const checks=[];
for(const [script,...args] of commands) {
  const start=performance.now(),run=spawnSync(process.execPath,[fileURLToPath(new URL('tools/'+script,root)),...args],{cwd:fileURLToPath(root),encoding:'utf8',timeout:180000});
  if(run.error||run.status!==0){process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');throw run.error||Error('Calibration failed: '+script);}
  checks.push({script,args,elapsedMs:performance.now()-start,output:run.stdout.trim()});
  console.log(script+' '+args.join(' ')+' OK: '+run.stdout.trim().split('\n').at(-1));
}
const hashes={};
for(const folder of ['rwg-terrain','twilight','space','cave'])for(const file of ['selection.js','cpu-optimization.json']) {
  const path=`private-packs/${folder}-browser/${file}`;hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
}
await mkdir(new URL('.test-work/cpu-replacement/',root),{recursive:true});
await writeFile(new URL('.test-work/cpu-replacement/calibration.json',root),JSON.stringify({checks,hashes},null,2));
