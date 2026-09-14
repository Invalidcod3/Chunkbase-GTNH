import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceStructures,validateSurfaceProfile,rogueTower} from '../dist/engine/surface-structures.js';
const setting={weight:1,names:null,tags:null,whitelist:null,tower:'PLAINS'};
const profile={schemaVersion:1,thaumcraft:{genAura:true,genStructure:true,genTrees:true,genCinnibar:false,genAmber:false,genInfusedStone:false,nodeRarity:5,dimensionBlacklist:-1},roguelike:{natural:true,novelty:true,frequency:10,base:setting,builtin:[setting],custom:[],blacklist:[],whitelist:[0]},biomes:{1:{name:'Test',tags:['PLAINS'],blacklist:-1,greatwood:.3,silverwood:true,hotSand:false,temple:null}}};
const q={seed:'9007199254740993',dimension:'overworld',bounds:{minX:-513,minZ:-257,maxX:511,maxZ:767}};
test('surface queries split at non-chunk boundaries without omissions or duplicates',async()=>{
 const p=validateSurfaceProfile(profile),all=await surfaceStructures(q,()=>1,p);
 const left=await surfaceStructures({...q,bounds:{...q.bounds,maxX:-11}},()=>1,p),right=await surfaceStructures({...q,bounds:{...q.bounds,minX:-11}},()=>1,p);
 const canonical=a=>a.map(d=>`${d.kind}:${d.x}:${d.z}:${d.subtype}`).sort();
 assert.deepEqual(canonical([...left,...right]),canonical(all));assert.ok(all.some(d=>d.kind==='ROGUELIKE_DUNGEON'));assert.ok(all.some(d=>d.kind==='THAUMCRAFT_AURA_NODE'));assert.ok(all.some(d=>d.kind==='THAUMCRAFT_ELDRITCH_ALTAR'));
});
test('disabled layers skip terrain work while hiding one TC layer preserves later RNG',async()=>{
 const kinds=['ROGUELIKE_DUNGEON','THAUMCRAFT_AURA_NODE','THAUMCRAFT_ELDRITCH_ALTAR'];
 assert.deepEqual(await surfaceStructures({...q,excludedKinds:kinds},()=>{throw Error('Unnecessary terrain');},profile),[]);
 const all=await surfaceStructures(q,()=>1,profile);
 const filtered=await surfaceStructures({...q,excludedKinds:['THAUMCRAFT_AURA_NODE']},()=>1,profile);
 assert.deepEqual(filtered,all.filter(d=>d.kind!=='THAUMCRAFT_AURA_NODE'));
});
test('unknown biome and cancellation fail explicitly; configuration stays immutable',async()=>{
 const p=validateSurfaceProfile(profile),before=JSON.stringify(p),control=new AbortController();
 await assert.rejects(surfaceStructures(q,()=>999,p),/缺少群系/);
 await assert.rejects(surfaceStructures(q,()=>1,p,{signal:control.signal,now:(()=>{let n=0;return()=>n+=20;})(),yieldTask:async()=>control.abort()}),/CANCELLED/);
 assert.equal(JSON.stringify(p),before);
});
test('Rogue consumes builtin roll before custom override and combines dimension whitelists',()=>{
 const calls=[],random={nextInt:n=>{calls.push(n);return n-1;}},p=structuredClone(profile.roguelike);
 p.builtin=[{...setting,weight:4}];p.custom=[{...setting,weight:2,tower:'DESERT',whitelist:[1]}];
 assert.equal(rogueTower(profile.biomes[1],random,p),'DESERT');assert.deepEqual(calls,[4,2]);
 p.blacklist=[0];assert.equal(rogueTower(profile.biomes[1],random,p),null);
});
test('ore generation suppresses unstable TC predictions and rejected Rogue biomes produce no dungeon',async()=>{
 const p=structuredClone(profile);p.thaumcraft.genAmber=true;p.biomes[1].tags=['RIVER'];
 assert.deepEqual(await surfaceStructures(q,()=>1,p),[]);
});
