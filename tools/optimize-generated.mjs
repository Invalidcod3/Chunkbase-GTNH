import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {optimizeGenerated} from './cpu-optimizer.mjs';
const target=resolve(process.argv[2]||'');
if(!process.argv[2]||!target.endsWith('selection.js'))throw Error('Provide a generated selection.js path');
const hash=s=>createHash('sha256').update(s).digest('hex');
const backup=join(dirname(target),'selection.unoptimized.js'),record=join(dirname(target),'cpu-optimization.json');
let source=await readFile(target,'utf8');
if(source.startsWith('// amidst-cpu-optimizer-v1')) {
  const previous=JSON.parse(await readFile(record,'utf8')),original=await readFile(backup,'utf8');
  if(hash(source)!==previous.outputSha256||hash(original)!==previous.inputSha256)throw Error('Generated engine or backup changed; refusing to overwrite');
  source=original;
}
const result=optimizeGenerated(source,{cellNoise:process.argv.includes('--cell-noise')});
const report={schemaVersion:1,optimizer:'exact-cpu-v1',inputSha256:hash(source),outputSha256:hash(result.source),
  optimizerSha256:hash(await readFile(new URL('./cpu-optimizer.mjs',import.meta.url))),constantExpressions:result.constants,cellNoise:result.cellNoise};
await writeFile(backup,source);
await writeFile(target+'.tmp',result.source);await rename(target+'.tmp',target);
await writeFile(record,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({target,constants:result.constants,cellNoise:result.cellNoise}));
