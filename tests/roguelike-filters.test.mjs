import test from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {roguelikeTypes,markerTypeKey} from '../dist/engine/catalog.js';
import {restoreStructureFilters,structureFilterCounts} from '../dist/structure-filters.js';
import {MapView} from '../dist/map.js';
import {collectStructureView} from '../dist/engine/structure-query.js';

const marker=(subtype,x=0)=>({kind:'ROGUELIKE_DUNGEON',subtype,x,z:0});

test('Roguelike entrance order and assets match the desktop enum',async()=>{
  // Snapshot of GtnhRoguelikeDungeonType; source ZIP tests need no sibling checkout.
  const entries=[
    ['DESERT','Desert','Pyramid entrance','desert'],
    ['FOREST','Forest','House entrance','woodland_mansion'],
    ['ICE','Ice','Bunker entrance','igloo'],
    ['JUNGLE','Jungle','Jungle entrance','jungle'],
    ['MESA','Mesa','Etho entrance','desert'],
    ['MOUNTAIN','Mountain','Eniko entrance','stronghold'],
    ['PLAINS','Plains','Rogue tower entrance','village'],
    ['SWAMP','Swamp','Witch-house entrance','witch'],
  ];
  assert.deepEqual(roguelikeTypes.map(t=>[t.subtype,t.en,t.entranceEn,t.icon]),entries);
  for(const type of roguelikeTypes)assert.ok((await stat(new URL(`../dist/assets/${type.icon}.png`,import.meta.url))).size>0);
});

test('counts split entrances and retain zero-count options in desktop order',()=>{
  const counts=structureFilterCounts([{kind:'VILLAGE'},marker('SWAMP'),marker('DESERT'),marker('SWAMP')]);
  assert.deepEqual([...counts.keys()],['VILLAGE',...roguelikeTypes.map(t=>t.key)]);
  assert.equal(counts.get('ROGUELIKE_DUNGEON_SWAMP'),2);
  assert.equal(counts.get('ROGUELIKE_DUNGEON_DESERT'),1);
  assert.equal(counts.get('ROGUELIKE_DUNGEON_FOREST'),0);
  assert.equal(structureFilterCounts([],['ROGUELIKE_DUNGEON']).size,8);
  assert.equal(structureFilterCounts([],[]).size,0);
  assert.equal(markerTypeKey(marker(' forest ')),'ROGUELIKE_DUNGEON_FOREST');
  assert.equal(markerTypeKey(marker('CUSTOM')),'ROGUELIKE_DUNGEON');
});

test('old hidden-category preference migrates and an entrance can be independently restored',()=>{
  const saved=['ROGUELIKE_DUNGEON','MINESHAFT'],filtered=restoreStructureFilters(saved);
  assert.deepEqual(saved,['ROGUELIKE_DUNGEON','MINESHAFT']);
  const markers=[marker('DESERT'),marker('FOREST'),{kind:'VILLAGE'},{kind:'MINESHAFT'}];
  const visible=()=>MapView.prototype.visibleMarkers.call({markers,filtered});
  assert.deepEqual(visible(),[{kind:'VILLAGE'}]);
  filtered.delete('ROGUELIKE_DUNGEON_FOREST');
  assert.deepEqual(visible(),[marker('FOREST'),{kind:'VILLAGE'}]);
  assert.deepEqual(restoreStructureFilters([...filtered]),filtered);
});

test('export filtering applies entrance selection before its result limit',async()=>{
  const excluded=new Set(['ROGUELIKE_DUNGEON_DESERT']);
  const result=await collectStructureView(async()=>[marker('DESERT'),marker('FOREST',1),marker('SWAMP',2)],
    {dimension:'overworld',bounds:{minX:0,minZ:0,maxX:16,maxZ:16}},
    {limit:1,select:values=>values.filter(m=>!excluded.has(m.kind)&&!excluded.has(markerTypeKey(m)))});
  assert.deepEqual(result.items,[marker('FOREST',1)]);
});
