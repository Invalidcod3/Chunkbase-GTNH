import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {XstrRandom,oreSelectionSeed} from '../dist/engine/prospecting.js';
const root=new URL('../',import.meta.url), work=new URL('.test-work/xstr-oracle/',root);
await mkdir(work,{recursive:true});
const source=await readFile(new URL('reference/Amidst-GTNH/gtnh-worker/src/main/java/amidst/gtnh/worker/GtnhXstrRandom.java',root),'utf8');
const service=await readFile(new URL('reference/Amidst-GTNH/gtnh-worker/src/main/java/amidst/gtnh/worker/ProspectingService.java',root),'utf8');
const selection=service.slice(service.indexOf('    static long selectionSeed'),service.indexOf('    private Deposit fluid'));
await writeFile(new URL('GtnhXstrRandom.java',work),source);
await writeFile(new URL('XstrOracle.java',work),`package amidst.gtnh.worker;
public class XstrOracle {
${selection}
public static void main(String[] args){for(String text:args){long seed=Long.parseLong(text);GtnhXstrRandom r=new GtnhXstrRandom(seed);
for(int i=0;i<100;i++)System.out.println(text+","+i+","+r.nextInt(1000)+","+r.nextLong()+","+r.nextDouble()+","+r.nextFloat()+","+selectionSeed(seed+i));}}
}`);
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.error);return r.stdout;}
run('javac',['-encoding','UTF-8','-d',fileURLToPath(work),fileURLToPath(new URL('GtnhXstrRandom.java',work)),fileURLToPath(new URL('XstrOracle.java',work))]);
const seeds=['0','1','-1','-17','9007199254740993','-9223372036854775808','9223372036854775807'];
const rows=run('java',['-cp',fileURLToPath(work),'amidst.gtnh.worker.XstrOracle',...seeds]).trim().split(/\r?\n/).map(s=>s.split(','));
let random,previous;
for(const [seed,i,bound,value,double,float,selectionSeed] of rows){
 if(seed!==previous){random=new XstrRandom(seed);previous=seed;}
 assert.equal(random.nextInt(1000),Number(bound));assert.equal(random.nextLong().toString(),value);assert.equal(random.nextDouble(),Number(double));assert.equal(random.nextFloat(),Math.fround(Number(float)));
 assert.equal(oreSelectionSeed(BigInt.asIntN(64,BigInt(seed)+BigInt(i))).toString(),selectionSeed);
}
await writeFile(new URL('tests/fixtures/xstr.json',root),JSON.stringify(rows));
console.log(`Verified ${rows.length} mixed XSTR sequences and signed-byte ore selection hashes against unchanged Worker Java.`);
