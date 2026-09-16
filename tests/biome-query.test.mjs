import test from 'node:test';
import assert from 'node:assert/strict';
import {biomeExportQuery,clipBiomeQuery} from '../dist/engine/biome-query.js';
import {createTwilightProvider} from '../dist/engine/twilight-provider.js';
import {createRwgProvider} from '../dist/engine/rwg-provider.js';
import {MapView} from '../dist/map.js';

test('Twilight exports align after positive or negative panning and preserve correct pixel coordinates',async()=>{
  const engine={configure(){},biomes:(x,z,w,h)=>Int32Array.from({length:w*h},(_,i)=>Math.abs(x+i%w+z+Math.floor(i/w))%2)};
  const provider=createTwilightProvider(engine,{dimensionId:7,oldMapGen:false},{0:'tf:a',1:'tf:b'},{registry:{get:key=>({index:key==='tf:a'?0:1})},yieldTask:async()=>{}});
  for(const start of [1,-1,-517])for(const span of [128,1024,1280,2048,4096]) {
    const b={minX:start,minZ:start,maxX:start+span,maxZ:start+span/2};
    const q=biomeExportQuery(b,'twilight');
    assert.equal(Math.abs(q.x%q.step),0);assert.equal(Math.abs(q.z%q.step),0);
    assert.ok(q.x<=b.minX&&q.x+q.width*q.step>=b.maxX);
    const pixels=await provider.sampleBiomes({...q,seed:'0'});
    assert.equal(pixels.length,q.width*q.height);
    const sampleScale=q.step>=4?4:1;
    assert.equal(pixels[0],Math.abs(Math.floor(q.x/sampleScale)+Math.floor(q.z/sampleScale))%2);
  }
});

test('aligned export planning stays below the raster limit even for unaligned square bounds',()=>{
  for(const span of [512,1024,2048,65536]) {
    const q=biomeExportQuery({minX:1,minZ:-3,maxX:span+1,maxZ:span-3},'twilight');
    assert.ok(q.width*q.height<=262144&&q.step<=256);
  }
});

test('cropped boundary tiles load without retries and keep coordinate lookup and transparent padding correct',async t=>{
  const paints=[];
  t.mock.method(globalThis,'setTimeout',()=>0);
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),putImageData:(image,x,z)=>paints.push({image,x,z})})})};
  t.after(()=>{globalThis.document=previous;});
  const rwg=createRwgProvider({configure(){},finalChunk:()=>new Int32Array(256).fill(1)},{groups:{snow:[],cold:[],hot:[],wet:[],small:[]}},{1:'test:biome'},{registry:{get:()=>({index:0})},yieldTask:async()=>{}});
  for(const dimension of ['overworld','twilight'])for(const step of [1,2,4,8,32])for(const [sx,sz]of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    const x=sx<0?-30000000:29999990,z=sz<0?-30000000:29999990;
    let calls=0,errors=0;
    const map=Object.assign(Object.create(MapView.prototype),{dimension,seed:'0',width:1,height:1,showBiomes:true,scale:1/step,x,z,generation:1,tiles:new Map(),pending:new Set(),failedTiles:new Map(),step:()=>step,bounds:()=>({minX:x,minZ:z,maxX:x+1,maxZ:z+1}),onError:()=>errors++,request:async(action,q)=>{
      calls++;assert.equal(action,'sampleBiomes');
      const clip=clipBiomeQuery(q);assert.deepEqual(clip.query,q);
      return dimension==='overworld'?rwg.sampleBiomes(q):new Uint16Array(q.width*q.height);
    }});
    map.ensureTiles();while(map.pending.size)await new Promise(setImmediate);
    assert.equal(errors,0);assert.equal(map.isFullyLoaded(),true);map.ensureTiles();
    assert.ok(calls<=1);assert.equal(map.failedTiles.size,0);
    const tile=[...map.tiles.values()][0];
    if(tile.data){assert.equal(map.biomeAt(tile.query.x,tile.query.z),0);const paint=paints.at(-1);assert.equal(paint.image.width,tile.query.width);assert.equal(paint.x,(tile.query.x-tile.tx*128*step)/step);}
    if(tile.query)assert.equal(map.biomeAt(tile.query.x-step,tile.query.z),undefined);
  }
});

test('world-edge exports obey actual provider sample bounds including RWG quarter offsets',()=>{
  for(const dimension of ['overworld','twilight'])for(const sign of [-1,1]) {
    const b=sign>0?{minX:29996440,minZ:29998800,maxX:30000000,maxZ:30000000}:{minX:-30000000,minZ:-30000000,maxX:-29996440,maxZ:-29998800};
    const q=biomeExportQuery(b,dimension);
    assert.deepEqual(clipBiomeQuery(q).query,q);
    if(dimension==='twilight'&&q.step===4)assert.equal(Math.abs(q.x%4),0);
  }
});
