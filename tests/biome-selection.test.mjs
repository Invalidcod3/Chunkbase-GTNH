import test from 'node:test';
import assert from 'node:assert/strict';
import {BiomeSelection,biomeRgb,dimensionBiomes} from '../dist/biome-selection.js';
import {gpuPalette} from '../dist/gpu-biome-renderer.js';
import {MapView} from '../dist/map.js';
import {biomeRegistry} from '../dist/engine/catalog.js';
import {readPreferences,writePreferences} from '../dist/preferences.js';

test('Amidst selection defaults, toggles and all/none apply to newly encountered keys too',()=>{
  const s=new BiomeSelection(),a={key:'a:plains',color:'#123456'};
  assert.equal(s.isSelected(a.key),false);assert.equal(biomeRgb(a,s),0x123456);
  s.enabled=true;assert.equal(biomeRgb(a,s),0x050608);
  s.toggle(a.key);assert.equal(biomeRgb(a,s),0x123456);
  assert.equal(s.isSelected('b:plains'),false,'namespaces cannot collide');
  s.selectAll(true);assert.equal(s.isSelected('new:biome'),true);
  s.toggle(a.key);assert.equal(biomeRgb(a,s),0x050608);
  s.enabled=false;assert.equal(biomeRgb(a,s),0x123456);
  const restored=new BiomeSelection(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.isSelected(a.key),false);assert.equal(restored.isSelected('new:biome'),true);
  restored.selectAll(false);assert.equal(restored.isSelected('new:biome'),false);
});

test('CPU cached tiles and GPU palettes dim identically and restore custom colors without resampling',()=>{
  const biome=biomeRegistry.indices[0],old=biome.color;
  const selection=new BiomeSelection();selection.enabled=true;
  let pixels,writes=0;
  const canvas={getContext:()=>({createImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData:p=>{pixels=[...p.data];writes++;}})};
  const tile={data:Uint16Array.of(biome.index),query:{x:0,z:0,step:1,width:1,height:1},tx:0,tz:0,step:1,image:canvas};
  const map=Object.assign(Object.create(MapView.prototype),{biomeSelection:selection,paletteRevision:0,request:assert.fail});
  try{
    biome.color='#80c020';
    map.prepareTileImage(tile);assert.deepEqual(pixels,[16,18,12,255]);
    const gpu=gpuPalette([biome],selection);
    assert.deepEqual([...gpu.slice(biome.index*4,biome.index*4+4)],pixels);
    assert.deepEqual([...gpu.slice(65535*4)],[9,9,9,255]);
    map.prepareTileImage(tile);assert.equal(writes,1);
    selection.toggle(biome.key);map.recolorTiles();map.prepareTileImage(tile);
    assert.deepEqual(pixels,[128,192,32,255]);
    biome.color='#ffffff';map.recolorTiles();map.prepareTileImage(tile);assert.deepEqual(pixels,[255,255,255,255]);
    selection.toggle(biome.key);map.recolorTiles();map.prepareTileImage(tile);assert.deepEqual(pixels,[34,34,34,255]);
    selection.enabled=false;map.recolorTiles();map.prepareTileImage(tile);assert.deepEqual(pixels,[255,255,255,255]);
    assert.deepEqual([...tile.data],[biome.index]);
  }finally{biome.color=old;}
});

test('dimension lists use scoped palettes and captured uniform biomes instead of obsolete preview aliases',()=>{
  const entries=[{key:'a:preview',legacy:[{dimension:'moon'}]},{key:'b:actual'},{key:'c:modded'}];
  assert.deepEqual(dimensionBiomes({key:'moon',biome:'a:preview',uniformBiome:'b:actual'},entries),[entries[1]]);
  assert.deepEqual(dimensionBiomes({key:'modded',biomeKeys:['b:actual','c:modded']},entries),entries.slice(1));
  assert.deepEqual(dimensionBiomes({key:'moon'},entries),[entries[0]]);
  assert.deepEqual(dimensionBiomes({key:'unknown'},entries),[]);
});

test('biome preferences are optional for old saves and reject malformed selections',()=>{
  let data;const storage={getItem:()=>data,setItem:(_,v)=>{data=v;}};
  const p={seed:'0',dimension:'end',markerMode:'STRUCTURE',x:0,z:0,level:0,filtered:[],resourceFilter:{id:'',text:'',minimum:0,minY:0,maxY:255},flags:{showBiomes:true,showStructures:true,grid:false,inertia:true,smooth:false},config:{schemaVersion:2}};
  writePreferences(storage,'p',p);assert.ok(readPreferences(storage,'p',['end']));
  const selection=new BiomeSelection();selection.enabled=true;selection.toggle('a:plains');
  writePreferences(storage,'p',{...p,biomeSelection:selection});
  assert.equal(new BiomeSelection(readPreferences(storage,'p',['end']).biomeSelection).isSelected('a:plains'),true);
  for(const bad of [null,{enabled:'yes',defaultSelected:false,exceptions:[]},{enabled:true,defaultSelected:false,exceptions:[2]}]){
    writePreferences(storage,'p',{...p,biomeSelection:bad});assert.equal(readPreferences(storage,'p',['end']),null);
  }
});
