import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensions,registerDimension} from '../dist/engine/catalog.js';
import {validateConfig} from '../dist/engine/config.js';
import {validateRegistry,findProvider} from '../dist/engine/packs.js';
import {createExtraProvider,asteroidPointRandom} from '../dist/engine/extra-provider.js';
import {regionalSpaceStructures} from '../dist/engine/space-structures.js';

test('new pack dimensions enter config without losing old IDs or duplicating the menu',()=>{
  const size=dimensions.length;
  try{
    const d=registerDimension({key:'example_planet',id:92,zh:'测试星球',en:'Example'});
    assert.equal(registerDimension({key:'example_planet'}),d);assert.equal(dimensions.length,size+1);
    const config=validateConfig({schemaVersion:2,dimensionIds:{moon:28,example_planet:123}});
    assert.equal(config.dimensionIds.moon,28);assert.equal(config.dimensionIds.example_planet,123);
    assert.equal(validateConfig({schemaVersion:2}).dimensionIds.example_planet,92);
    assert.throws(()=>validateConfig({schemaVersion:2,dimensionIds:{example_planet:1.5}}));
    assert.equal(d.map,false);assert.equal(d.structures,false);
    assert.throws(()=>registerDimension({key:'../invalid',id:2,zh:'a',en:'b'}));
  }finally{dimensions.splice(size);}
});
test('pack metadata is validated and map-only providers preserve ordinary structure routing',()=>{
  const p={id:'extra',apiVersion:1,browserExecutable:true,entry:'./extra/provider.js',dimensions:[{key:'io',id:36,zh:'木卫一',en:'Io',capabilities:['biomes']}]};
  const validate=pack=>validateRegistry({schemaVersion:1,packs:[pack]},'http://localhost/packs/registry.json');
  assert.equal(validate(p).length,1);
  for(const extra of [{id:1.5},{en:[]},{key:'../../x'}])assert.throws(()=>validate({...p,dimensions:[{...p.dimensions[0],...extra}]}));
  const provider={};assert.equal(findProvider([{descriptor:p,provider}],'io','sampleBiomes'),provider);assert.equal(findProvider([{descriptor:p,provider}],'io','predictStructures'),undefined);
});
function setup(options={}){
  const calls=[],configured=[];
  const engine={configure:(g,s)=>configured.push([g,s]),biomes(x,z,w,h,q){calls.push({x,z,w,h,q});return Int32Array.from({length:w*h},(_,i)=>((x+i%w+z+Math.floor(i/w))%5+5)%5);}};
  const input={rossRuinChance:512,dimensions:{io:{id:36,graph:'io',offset:10},pluto:{id:49,graph:'pluto',offset:10},anubis:{id:92,uniform:15}}};
  return {p:createExtraProvider(engine,input,Object.fromEntries(Array.from({length:6},(_,i)=>[i+10,String(i+10)])),{registry:{get:key=>key===undefined?undefined:{index:Number(key)}},yieldTask:async()=>{},...options}),calls,configured};
}
test('new biome sampling stays exact across negative coordinates and every supported stride',async()=>{
  const {p,calls,configured}=setup();
  for(const step of [1,2,3,4,8,16,64,256]){
    const q={seed:'9007199254740993',dimension:'io',x:-517,z:-231,width:19,height:7,step};
    const a=await p.sampleBiomes(q);assert.deepEqual([...a],Array.from({length:133},(_,i)=>((q.x+(i%19)*step+q.z+Math.floor(i/19)*step)%5+5)%5+10));
  }
  assert.ok(calls.every(c=>c.w%4===0&&c.h%4===0&&!c.q&&c.w<=256&&c.h<=64));assert.equal(configured.length,1);
  await p.sampleBiomes({seed:'0',dimension:'pluto',x:0,z:0,width:1,height:1,step:1});assert.deepEqual(configured.at(-1),['pluto','0']);
});
test('uniform maps avoid generator work; cancellation and changed dimension IDs are rejected',async()=>{
  const controller=new AbortController(),{p,calls}=setup({yieldTask:async()=>controller.abort()});
  const q={seed:'0',dimension:'anubis',x:0,z:0,width:2,height:2,step:4};assert.deepEqual([...await p.sampleBiomes(q)],[15,15,15,15]);assert.equal(calls.length,0);
  await assert.rejects(p.sampleBiomes({...q,config:{dimensionIds:{anubis:93}}}),/ID/);
  await assert.rejects(p.sampleBiomes({...q,dimension:'io'},{signal:controller.signal}),/CANCELLED/);
  await assert.rejects(p.sampleBiomes({...q,width:0}),/请求无效/);
});

test('captured registry aliases resolve before dimension replacements and display offsets',async()=>{
  const engine={configure(){},biomes:(x,z,w,h)=>new Int32Array(w*h).fill(161)};
  const input={rossRuinChance:512,dimensions:{ross128b:{id:64,graph:'rwg_vanilla',offset:6400,biomeAliases:{161:160}},deep_dark:{id:100,graph:'rwg_vanilla',offset:0,biomeAliases:{161:160},replacements:{160:5}}}};
  const p=createExtraProvider(engine,input,{6560:'ross:spruce',5:'minecraft:taiga'},{registry:{get:k=>k==='ross:spruce'?{index:12}:k==='minecraft:taiga'?{index:7}:null},yieldTask:async()=>{}});
  const q={seed:'9223372036854775807',dimension:'ross128b',x:251,z:3065,width:2,height:1,step:128};
  assert.deepEqual([...await p.sampleBiomes(q)],[12,12]);
  assert.deepEqual([...await p.sampleBiomes({...q,dimension:'deep_dark'})],[7,7]);
});
test('regional structures split identically at negative and odd boundaries and obey filters',()=>{
  const order=a=>a.sort((a,b)=>a.z-b.z||a.x-b.x);
  for(const dimension of ['deep_dark','anubis','horus'])for(const seed of ['0','-17','9007199254740993','-9223372036854775808','9223372036854775807']){
    const q={seed,dimension,bounds:{minX:-1025,minZ:-513,maxX:4097,maxZ:2049}},full=regionalSpaceStructures(q);
    assert.ok(full.length>0);const left=regionalSpaceStructures({...q,bounds:{...q.bounds,maxX:3}}),right=regionalSpaceStructures({...q,bounds:{...q.bounds,minX:3}});
    assert.deepEqual(order([...left,...right]),order(full));assert.deepEqual(regionalSpaceStructures({...q,excludedKinds:[full[0].kind]}),[]);
  }
  for(const x of [-30000000,-17,0,29999998])assert.ok(asteroidPointRandom(x,-x)>=0&&asteroidPointRandom(x,-x)<=1);
});
