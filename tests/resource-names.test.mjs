import test from 'node:test';
import assert from 'node:assert/strict';
import {localizeResourceText,resourceName} from '../dist/resource-names.js';
import {resourceMatches} from '../dist/engine/resources.js';
import {collectResourceView} from '../dist/engine/resource-query.js';
import {drawResources} from '../dist/resource-view.js';
import {parseLanguage} from '../tools/import-resource-translations.mjs';

test('upstream material keys translate asteroid combinations and legacy Sheldonite naming',()=>{
  assert.equal(localizeResourceText('Enriched Naquadah, Naquadah'),'富集硅岩, 硅岩');
  assert.equal(localizeResourceText('Pentlandite, Cobaltite, Nickel, Garnierite'),'镍黄铁矿, 辉钴矿, 镍, 硅镁镍矿');
  assert.equal(localizeResourceText('Iridium, Platinum, Palladium, Sheldonite'),'铱, 铂, 钯, 硫铂矿');
  assert.equal(localizeResourceText('Uranium 238, Uraninite'),'铀-238, 晶质铀矿');
  assert.equal(localizeResourceText('[Magnetite, Gold]'),'[磁铁矿, 金]');
  assert.equal(localizeResourceText('磁铁矿 & 金','en'),'Magnetite & Gold');
  assert.equal(localizeResourceText('BArTiMaEuSNeK'),'BArTiMaEuSNeK');
  assert.equal(localizeResourceText('Ironwood unknown'),'Ironwood unknown');
  assert.equal(localizeResourceText('未知矿物'),'未知矿物');
});

test('Chinese and English searches match before resource scan limits without changing saved IDs',async()=>{
  const ore=Object.freeze({kind:'ASTEROID_VEIN',id:'asteroid.vein:ore.mix.naquadah',name:'Enriched Naquadah, Naquadah',materials:'Enriched Naquadah, Naquadah',minY:0,maxY:100,x:8,z:8});
  for(const text of ['富集硅岩','ENRICHED NAQUADAH','ore.mix.naquadah'])assert.ok(resourceMatches(ore,{text}));
  assert.ok(resourceMatches({...ore,name:'磁铁矿 & 金',materials:'磁铁矿, 金'},{text:'Magnetite'}));
  assert.equal(resourceMatches(ore,{text:'硅岩',excludedIds:[ore.id]}),false);
  assert.equal(resourceMatches(ore,{text:'硅岩',minY:101}),false);
  let calls=0;
  const result=await collectResourceView(async(_,q)=>{calls++;return [{...ore,x:q.bounds.minX+8,name:calls===1?'Tin':ore.name,materials:''}];},
    {bounds:{minX:0,minZ:0,maxX:2048,maxZ:512}}, {limit:1,select:values=>values.filter(d=>resourceMatches(d,{text:'富集硅岩'}))});
  assert.equal(calls,2);assert.equal(result.items.length,1);assert.equal(result.items[0].id,ore.id);
  assert.equal(resourceName(ore),'富集硅岩, 硅岩');assert.equal(ore.name,'Enriched Naquadah, Naquadah');
});

test('map labels switch languages immediately while original records remain unchanged',()=>{
  const labels=[],ctx=new Proxy({}, {get:(_,k)=>(...args)=>{if(k==='fillText')labels.push(args[0]);}});
  const ore={id:'test',name:'Pentlandite',x:0,z:0,color:'#fff'};
  const view={language:'zh',dimension:'unknown',markerMode:'ORES',scale:4,resourceImages:new Map(),visibleResources:()=>[ore],screen:()=>({x:50,y:50})};
  drawResources(view,ctx);view.language='en';drawResources(view,ctx);
  assert.deepEqual(labels,['镍黄铁矿','Pentlandite']);assert.equal(ore.name,'Pentlandite');
});

test('language importer understands both Forge configuration and normal lang files as data',()=>{
  const data=parseLanguage('\uFEFF# ignored\nS:"Material.example"=§a矿物=名称\nMaterial.second=第二种\ninvalid\n');
  assert.equal(data.get('Material.example'),'矿物=名称');assert.equal(data.get('Material.second'),'第二种');assert.equal(data.size,2);
});
