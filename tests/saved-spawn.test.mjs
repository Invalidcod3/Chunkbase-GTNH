import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {parseSavedSpawn,readSavedSpawn,matchingSavedSpawn,includeSavedSpawn} from '../dist/saved-spawn.js';
import {acceptsSpawnSurface,SPAWN_PROVIDERS,rwgSpawn} from '../dist/engine/navigation.js';
import {JavaRandom} from '../dist/engine/random.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {csv,journeyMap} from '../dist/export.js';
const text=s=>{const value=Buffer.from(s),n=Buffer.alloc(2);n.writeUInt16BE(value.length);return Buffer.concat([n,value]);};
function fixture(seed=-8138049151491905853n,x=-58,y=64,z=-180){
  const long=Buffer.alloc(8);long.writeBigInt64BE(seed);
  const int=(name,n)=>{const value=Buffer.alloc(4);value.writeInt32BE(n);return Buffer.concat([Buffer.from([3]),text(name),value]);};
  return Buffer.concat([Buffer.from([10]),text(''),Buffer.from([10]),text('Data'),Buffer.from([4]),text('RandomSeed'),long,int('SpawnX',x),int('SpawnY',y),int('SpawnZ',z),Buffer.from([0,0])]);
}
test('raw and gzip level.dat preserve signed 64-bit seed and recorded XYZ',async()=>{
  for(const seed of [-8138049151491905853n,-9223372036854775808n,9223372036854775807n]){
    const raw=fixture(seed),point=parseSavedSpawn(raw),compressed=gzipSync(raw);
    assert.deepEqual([point.x,point.y,point.z],[-58,64,-180]);assert.equal(point.seed,seed.toString());assert.equal(point.status,'RECORDED');
    assert.deepEqual(await readSavedSpawn(new Blob([compressed])),point);
    const context={seed:point.seed,dimension:'overworld',dimensionId:0};assert.ok(csv([point],context).includes('"64"'));
    const zip=new Uint8Array(await journeyMap([point],context,200).arrayBuffer()),header=new DataView(zip.buffer),start=30+header.getUint16(26,true);
    const waypoint=JSON.parse(new TextDecoder().decode(zip.subarray(start,start+header.getUint32(18,true))));assert.equal(waypoint.y,64);
  }
});
test('import, same-seed replacement and clear synchronize the selected spawn and ignore late file reads',async()=>{
  const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8'),elements=new Map(),moves=[];
  const $=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
  const s={$,seed:0n,dimension:'overworld',language:'zh',savedSpawn:null,spawnImportRevision:0,worldRevision:0,readSavedSpawn,matchingSavedSpawn,
    dimensions:[{key:'overworld',spawn:true}],renderCapabilities(){},toast(){},view:{goto:(x,z)=>moves.push([x,z])}};
  s.loadWorld=()=>{s.seed=BigInt($('seed').value);s.worldRevision++;s.view.selected=null;s.detail=null;};
  s.showDetail=point=>s.detail=point;s.request=async()=>matchingSavedSpawn(s.savedSpawn,s)||{status:'UNAVAILABLE'};
  vm.runInNewContext(app.slice(app.indexOf("$('spawn').onclick="),app.indexOf('$("retry-map").onclick =')),s);
  $('saved-spawn-file').files=[new Blob([fixture()])];await $('saved-spawn-file').onchange();assert.equal(s.detail.x,-58);
  $('saved-spawn-file').files=[new Blob([fixture(-8138049151491905853n,123,75,-99)])];await $('saved-spawn-file').onchange();assert.equal(s.detail.x,123);assert.equal(s.view.selected.y,75);
  let resolve;s.readSavedSpawn=()=>new Promise(r=>resolve=r);const pending=$('saved-spawn-file').onchange();
  $('clear-saved-spawn').onclick();resolve(parseSavedSpawn(fixture()));await pending;
  assert.equal(s.savedSpawn,null);assert.equal(s.detail,null);assert.equal(s.view.selected,null);
  const before=moves.length;await $('spawn').onclick();assert.equal(moves.length,before,'unavailable coordinates never reach map.goto');
});
test('malformed NBT and decompression bombs are rejected with bounded decoded size',async()=>{
  const raw=fixture();assert.throws(()=>parseSavedSpawn(raw.subarray(0,-2)));assert.throws(()=>parseSavedSpawn(Buffer.concat([raw,Buffer.from([1])])));
  assert.throws(()=>parseSavedSpawn(fixture(0n,30000001)));
  await assert.rejects(readSavedSpawn(new Blob([gzipSync(Buffer.alloc(8*1024*1024+1))])),/8 MiB/);
});
test('saved spawn is isolated by seed/dimension; replacing the same-seed save wins and filters remain intact',()=>{
  const first=parseSavedSpawn(fixture()),second=parseSavedSpawn(fixture(-8138049151491905853n,123,75,-99));
  const q={seed:first.seed,dimension:'overworld',bounds:{minX:-1000,minZ:-1000,maxX:1000,maxZ:1000}};
  assert.equal(matchingSavedSpawn(first,{...q,seed:'1'}),null);assert.equal(matchingSavedSpawn(first,{...q,dimension:'nether'}),null);
  const village={kind:'VILLAGE',x:0,z:0},items=includeSavedSpawn([village,first],second,q);
  assert.deepEqual(items,[village,second]);assert.deepEqual(includeSavedSpawn(items,second,{...q,excludedKinds:['WORLD_SPAWN']}),[village]);
  assert.deepEqual(includeSavedSpawn([village],second,{...q,structureGroup:'dungeons'}),[village]);
  const copy=matchingSavedSpawn(second,q);copy.x=0;assert.equal(second.x,123);
});
test('desktop vanilla/BOP block rules are distinct, including snow precedence',()=>{
  const accept=(provider,block,spawnBiome=false)=>acceptsSpawnSurface(provider,{block:'minecraft:'+block,spawnBiome});
  assert.equal(accept(SPAWN_PROVIDERS.vanilla,'grass'),true);assert.equal(accept(SPAWN_PROVIDERS.bop,'grass',true),false);
  for(const block of ['stone','sand'])assert.equal(accept(SPAWN_PROVIDERS.bop,block),true);
  assert.equal(accept(SPAWN_PROVIDERS.bop,'snow_layer'),false);assert.equal(accept(SPAWN_PROVIDERS.bop,'snow_layer',true),true);
  assert.equal(accept('unknown','grass'),false);
});
test('spawn random walk preserves initial RNG use and never tests the 1000th endpoint',async()=>{
  const expected=new JavaRandom(42n);expected.nextInt(117);let x=-300,z=500,calls=0;
  for(let i=0;i<1000;i++){x+=expected.nextInt(64)-expected.nextInt(64);z+=expected.nextInt(64)-expected.nextInt(64);}
  const actual=await rwgSpawn('42',()=>{calls++;return {block:'minecraft:grass'};},SPAWN_PROVIDERS.bop,{initial:r=>{r.nextInt(117);return {x:-300,z:500};}});
  assert.deepEqual([actual.x,actual.z,actual.attempts,calls],[x,z,1000,1000]);assert.equal(actual.viable,false);assert.equal(actual.y,undefined);
  assert.equal((await rwgSpawn('42',()=>({block:'minecraft:grass'}),'unknown')).status,'UNAVAILABLE');
});
