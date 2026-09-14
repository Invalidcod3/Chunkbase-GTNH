import test from 'node:test';
import assert from 'node:assert/strict';
import {createAsteroidProvider,validateAsteroidProfile,freshIslandExcludes,chaosExcludes} from '../dist/engine/asteroids.js';
const profile={schemaVersion:1,algorithm:'galacticgreg-current',enabled:true,probability:100,minY:50,maxY:100,
  materials:[[{name:'ore.mix.naquadah',weight:1},{name:'ore.mix.gold',weight:1},{name:'ore.mix.platinum',weight:1}]],
  chaosEnabled:true,chaosSeparation:10000,chaosRadius:200};
const query={seed:'9007199254740993',dimension:'end',bounds:{minX:-513,minZ:-511,maxX:511,maxZ:513}};
const asteroids=a=>a.filter(v=>v.kind.endsWith('_ASTEROID'));
const order=a=>a.sort((a,b)=>a.kind.localeCompare(b.kind)||a.z-b.z||a.x-b.x);
test('asteroid queries split at arbitrary block boundaries without missing or duplicating markers',async()=>{
  const provider=createAsteroidProvider(profile),full=asteroids(await provider.predictStructures(query));
  const left=asteroids(await provider.predictStructures({...query,bounds:{...query.bounds,maxX:-7}}));
  const right=asteroids(await provider.predictStructures({...query,bounds:{...query.bounds,minX:-7}}));
  assert.ok(full.length>100);assert.deepEqual(order([...left,...right]),order(full));
  assert.ok(full.every(v=>v.x>=query.bounds.minX&&v.x<query.bounds.maxX&&v.z>=query.bounds.minZ&&v.z<query.bounds.maxZ));
  assert.ok(full.every(v=>v.certainty==='EXACT_FRESH_END'&&(Math.floor(v.x/16)**2+Math.floor(v.z/16)**2)>256));
});
test('fresh HEE exclusion uses the island start and inclusive square, including region boundaries',()=>{
  const lookup=(_s,x,z)=>x===-1&&z===1?{cx:-14,cz:31}:null;
  for(const [x,z,expected] of [[-14,31,true],[0,45,true],[-15,31,false],[1,45,false],[-14,30,false],[0,46,false]])
    assert.equal(freshIslandExcludes(0n,x,z,lookup),expected,`${x},${z}`);
  assert.equal(chaosExcludes(0,0,profile),false);
  assert.equal(chaosExcludes(625,0,profile),true);
  assert.equal(chaosExcludes(-625,0,profile),true);
  assert.equal(chaosExcludes(625,0,{...profile,chaosEnabled:false}),false);
});
test('installed asteroid profiles isolate edits and seed changes, honor filters, and retain existing End structures',async()=>{
  const input=structuredClone(profile),p=createAsteroidProvider(input);
  const initial=await p.predictStructures(query);input.materials=[];
  await p.predictStructures({...query,seed:'-17'});
  assert.deepEqual(await p.predictStructures(query),initial);
  const hidden=await p.predictStructures({...query,excludedKinds:['END_NAQUADAH_ASTEROID','END_PLATINUM_ASTEROID','END_SCHEELITE_ASTEROID']});
  assert.deepEqual(hidden,initial.filter(v=>!v.kind.endsWith('_ASTEROID')));
  const filtered=await p.predictStructures({...query,excludedKinds:['END_PLATINUM_ASTEROID']});
  assert.deepEqual(filtered,initial.filter(v=>v.kind!=='END_PLATINUM_ASTEROID'));
  assert.equal(await p.predictStructures({...query,dimension:'overworld'}),null);
  const chaos=await p.predictStructures({...query,bounds:{minX:9900,minZ:-100,maxX:10100,maxZ:100}});
  assert.ok(chaos.some(v=>v.kind==='DRACONIC_CHAOS_ISLAND'));
});
test('asteroid work cancels during scanning and rejects incompatible settings or unsafe bounds',async()=>{
  const controller=new AbortController();let time=0;
  const p=createAsteroidProvider(profile,{now:()=>time+=20,yieldTask:async()=>controller.abort()});
  await assert.rejects(p.predictStructures(query,{signal:controller.signal}),/CANCELLED/);
  const ordinary=createAsteroidProvider(profile);
  await assert.rejects(ordinary.predictStructures({...query,config:{dimensionIds:{end:9}}}),/ID/);
  await assert.rejects(ordinary.predictStructures({...query,bounds:{minX:0,minZ:0,maxX:1,maxZ:10000000}}),/范围过大/);
  await assert.rejects(ordinary.predictStructures({...query,seed:'9223372036854775808'}));
  for(const p of [{...profile,maxY:50},{...profile,chaosSeparation:0},{...profile,materials:[[{name:'invalid',weight:-1}]]}])
    assert.throws(()=>validateAsteroidProfile(p));
});
