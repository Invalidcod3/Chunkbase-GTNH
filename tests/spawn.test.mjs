import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpawnPredictor} from '../dist/engine/spawn.js';
import {SPAWN_PROVIDERS} from '../dist/engine/navigation.js';
const profile={schemaVersion:2,provider:SPAWN_PROVIDERS.bop,blocks:['minecraft:air','minecraft:stone','minecraft:grass'],spawnBiomes:[],generateCaves:true,caveClass:'net.minecraft.world.gen.MapGenCaves'};
function chunk(block=1){const a=new Int32Array(1024);for(let i=0;i<1024;i+=4){a[i]=block;a[i+1]=42;a[i+2]=70;}return a;}
const q=(seed='0')=>({seed,dimension:'overworld'});
test('spawn replay loads lazily and keeps completed result immutable to callers',async()=>{
 let loads=0,configs=0,calls=0;const predict=createSpawnPredictor(profile,()=>{loads++;return {configureSeed(){configs++;},surfaces(){calls++;return chunk();}};},{yieldTask:()=>Promise.resolve()});
 assert.equal(loads,0);assert.equal((await predict({...q(),dimension:'end'})).status,'UNAVAILABLE');assert.equal(loads,0);
 const result=await predict(q());assert.equal(result.status,'ESTIMATED');assert.equal(result.y,undefined);result.x=900;
 assert.equal((await predict(q())).x,0);assert.deepEqual([loads,configs,calls],[1,1,1]);
});
test('spawn module load failures and configure failures remain retryable',async()=>{
 let attempts=0,configs=0;const predict=createSpawnPredictor(profile,()=>{if(++attempts===1)throw Error('network');return {configureSeed(){if(++configs===1)throw Error('configure');},surfaces:()=>chunk()};},{yieldTask:()=>Promise.resolve()});
 await assert.rejects(predict(q()),/network/);await assert.rejects(predict(q()),/configure/);assert.equal((await predict(q())).x,0);assert.equal(attempts,2);
});
test('cancellation after lazy load prevents engine configuration',async()=>{
 let resolve,configured=0;const controller=new AbortController();const predict=createSpawnPredictor(profile,()=>new Promise(r=>{resolve=r;}));
 const pending=predict(q(),{signal:controller.signal});await Promise.resolve();controller.abort();resolve({configureSeed(){configured++;},surfaces:()=>chunk()});
 await assert.rejects(pending,/CANCELLED/);assert.equal(configured,0);
});
test('cancelled and incomplete surface arrays never enter completed caches',async()=>{
 const controller=new AbortController();let calls=0;
 const predict=createSpawnPredictor(profile,()=>({configureSeed(){},surfaces(){calls++;if(calls===1){controller.abort();return chunk();}if(calls===2)return new Int32Array(4);return chunk();}}),{yieldTask:()=>Promise.resolve()});
 await assert.rejects(predict(q(),{signal:controller.signal}),/CANCELLED/);await assert.rejects(predict(q()),/Incomplete/);assert.equal((await predict(q())).x,0);assert.equal(calls,3);
});
test('invalid surface identities and coordinates are rejected rather than estimated',async()=>{
 for(const [offset,value] of [[0,99],[1,-1],[2,62],[3,2]]){const a=chunk();a[offset]=value;const predict=createSpawnPredictor(profile,()=>({configureSeed(){},surfaces:()=>a}),{yieldTask:()=>Promise.resolve()});await assert.rejects(predict(q()),/Invalid spawn surface/);}
});
test('new seeds configure independent state and final result cache is bounded',async()=>{
 let configs=0;const predict=createSpawnPredictor(profile,()=>({configureSeed(){configs++;},surfaces:()=>chunk()}),{yieldTask:()=>Promise.resolve()});
 for(const s of ['0','1','2','3','4'])await predict(q(s));await predict(q('4'));assert.equal(configs,5);await predict(q('0'));assert.equal(configs,6);
});
test('profile validation accepts an empty actual spawn-biome list and rejects invalid metadata',()=>{
 assert.doesNotThrow(()=>createSpawnPredictor(profile,()=>{}));
 for(const changes of [{schemaVersion:1},{provider:'unknown'},{blocks:['minecraft:stone','minecraft:stone']},{spawnBiomes:[-1]},{generateCaves:1},{caveClass:'unknown'}])assert.throws(()=>createSpawnPredictor({...profile,...changes},()=>{}),/Invalid spawn replay profile/);
});
test('cancellation between chunks yields without reusing incomplete work',async()=>{
 const c=new AbortController();let calls=0,yields=0;const predict=createSpawnPredictor(profile,()=>({configureSeed(){},surfaces(){calls++;return chunk(0);}}),{yieldTask:async()=>{if(++yields===2)c.abort();}});
 await assert.rejects(predict(q(),{signal:c.signal}),/CANCELLED/);assert.equal(calls,1);
});
