import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createUniformProvider} from '../dist/engine/uniform-provider.js';
import {BiomeRegistry} from '../dist/engine/biome-registry.js';
import {matchingSavedSpawn} from '../dist/saved-spawn.js';

test('configured constant biomes preserve registry identity and reject wrong environments, cancellation and invalid bounds',()=>{
  const registry=new BiomeRegistry();
  registry.register({key:'test:space',zh:'Space',en:'Space',color:'#778899'});
  registry.register({key:'test:venus',zh:'Venus',en:'Venus',color:'#8899aa'});
  const profile={dimensions:[{key:'mercury',id:37,uniformBiome:'test:space'},{key:'venus',id:39,uniformBiome:'test:venus'}]};
  const p=createUniformProvider(profile,{registry});profile.dimensions[0].uniformBiome='test:venus';
  const q={seed:'9223372036854775807',dimension:'mercury',x:-513,z:-257,width:4,height:3,step:256};
  assert.deepEqual([...p.sampleBiomes(q)],Array(12).fill(registry.get('test:space').index));
  assert.deepEqual([...p.sampleBiomes({...q,dimension:'venus'})],Array(12).fill(registry.get('test:venus').index));
  const controller=new AbortController();controller.abort();assert.throws(()=>p.sampleBiomes(q,{signal:controller.signal}),/CANCELLED/);
  assert.throws(()=>p.sampleBiomes({...q,config:{dimensionIds:{mercury:39}}}),/ID/);
  for(const extra of [{width:0},{height:1.5},{step:257},{x:29999999},{dimension:'overworld'}])assert.throws(()=>p.sampleBiomes({...q,...extra}));
  assert.equal(p.predictStructures,undefined);assert.equal(p.predictResources,undefined);
});

test('dimension switching shows registered names immediately and removes fixed-biome labels on complex maps',async()=>{
  const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  const elements=new Map();const $=id=>{
    if(!elements.has(id))elements.set(id,{replaceChildren(){},textContent:'',attributes:new Set(),style:{setProperty(k,v){this[k]=v;}},toggleAttribute(k,on){if(on)this.attributes.add(k);else this.attributes.delete(k);}});
    return elements.get(id);
  };
  const biome={zh:'Space',en:'Space',color:'#788088'};
  const s={$,Option:function(text,value){Object.assign(this,{text,value});},seed:'0',strongholdLocations:()=>[],dimension:'mercury',language:'zh',dimensions:[{key:'mercury',zh:'水星',en:'Mercury',map:true,uniformBiome:'test:space',note:'configured'},{key:'overworld',zh:'主世界',en:'Overworld',map:true,note:'RWG'}],biomeRegistry:{get:k=>k==='test:space'?biome:undefined},view:{markerMode:'STRUCTURE',resourceFilter:{}},resourceStatus(){}};
  Object.assign(s,{matchingSavedSpawn,savedSpawn:null,themeUI:{sync(){}}});vm.createContext(s);vm.runInContext(source.slice(source.indexOf('function worldText()'),source.indexOf('function resourceStatus(')),s);
  s.worldText();assert.equal($('mode-note').textContent,'生物群系：Space');assert.equal($('biome-name').textContent,'水星 · Space');assert.ok($('mode-note').attributes.has('data-biome'));
  s.language='en';s.worldText();assert.equal($('biome-name').textContent,'Mercury · Space');
  s.dimension='overworld';s.worldText();assert.equal($('biome-name').textContent,'');assert.ok(!$('mode-note').attributes.has('data-biome'));assert.equal(s.view.backgroundColor,null);
});
