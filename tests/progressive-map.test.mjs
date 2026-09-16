import test from 'node:test';
import assert from 'node:assert/strict';
import {MapView} from '../dist/map.js';

function setup(t,dimension='overworld') {
  const previous=globalThis.document,images=[],queries=[],progress=[];
  globalThis.document={createElement:()=>{const canvas={getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})};images.push(canvas);return canvas;}};
  t.after(()=>{globalThis.document=previous;});
  const map=Object.assign(Object.create(MapView.prototype),{dimension,seed:'0',progressive:true,showBiomes:true,width:128,height:128,scale:.25,x:256,z:256,generation:1,tiles:new Map(),pending:new Set(),failedTiles:new Map(),markers:[],resources:[],bounds:()=>({minX:0,minZ:0,maxX:512,maxZ:512}),onMapProgress:value=>progress.push(value),onError:error=>{throw error;},request:async(action,q)=>{queries.push(q);return new Uint16Array(q.width*q.height).fill(q.step===4?1:0);}});
  return {map,queries,images,progress};
}
const settle=async map=>{while(map.pending.size)await new Promise(setImmediate);};

test('quality allocation refines an existing preview while other tiles still need coverage',async t=>{
  const {map}=setup(t),jobs=[];map.allocation=50;map.allocationWorkers=4;map.tileConcurrency=4;
  map.bounds=()=>({minX:0,minZ:0,maxX:4096,maxZ:512});
  map.request=(action,q,options)=>new Promise(resolve=>jobs.push({q,options,resolve}));
  map.ensureTiles();assert.equal(jobs.length,4);assert.ok(jobs.every(j=>j.options.workClass==='coverage'));
  jobs[0].resolve(new Uint16Array(4096));await new Promise(setImmediate);
  map.ensureTiles();assert.equal(jobs[4].options.workClass,'refine');assert.equal(jobs[4].q.step,4);assert.equal(jobs[4].q.x,jobs[0].q.x);
  jobs[4].resolve(new Uint16Array(16384).fill(1));await new Promise(setImmediate);
  const exact=map.tiles.get(`4:${jobs[0].q.x/512}:0`);assert.equal(exact.preview,false);assert.equal(exact.data[0],1);
  map.allocation=0;map.ensureTiles();assert.equal(jobs.at(-1).options.workClass,'coverage');
  assert.ok(jobs.every(j=>!j.options.signal.aborted));
  jobs.forEach(j=>j.resolve(new Uint16Array(j.q.width*j.q.height)));await settle(map);
  assert.equal(map.tiles.get(`4:${jobs[0].q.x/512}:0`),exact);
});

test('a provider can bypass redundant preview work while preserving tiles and other dimensions',async t=>{
  const {map,queries}=setup(t,'twilight');map.previewPolicy=key=>key!=='twilight';
  map.ensureTiles();await settle(map);
  assert.equal(queries.length,1);assert.equal(queries[0].width,128);assert.equal(queries[0].step,4);assert.equal(map.isFullyLoaded(),true);
  const tile=map.tiles.get('4:0:0');map.ensureTiles();assert.equal(queries.length,1);assert.equal(map.tiles.get('4:0:0'),tile);
  map.changed=()=>{};map.setWorld('0','overworld');map.ensureTiles();await settle(map);
  assert.equal(queries[1].width,64);assert.equal(map.isFullyLoaded(),false);
  map.ensureTiles();await settle(map);assert.equal(map.isFullyLoaded(),true);
});

test('higher tile concurrency feeds custom worker counts and lowering it preserves running queries',async t=>{
  const {map}=setup(t),jobs=[];
  map.bounds=()=>({minX:0,minZ:0,maxX:5120,maxZ:512});map.tileConcurrency=8;
  map.request=(action,q,options)=>new Promise(resolve=>jobs.push({q,options,resolve}));
  map.ensureTiles();assert.equal(map.pending.size,8);
  map.tileConcurrency=4;map.ensureTiles();assert.equal(jobs.length,8);assert.ok(jobs.every(j=>!j.options.signal.aborted));
  jobs.forEach(j=>j.resolve(new Uint16Array(j.q.width*j.q.height)));await settle(map);
});
test('terminal tile failures report failure and retry retains successful tiles and generation',async t=>{
  const {map,queries,progress}=setup(t);map.progressive=false;map.ensureTiles();await settle(map);
  const good=map.tiles.get('4:0:0'),generation=map.generation;
  map.bounds=()=>({minX:0,minZ:0,maxX:1024,maxZ:512});map.failedTiles.set('4:1:0',{attempts:3,retryAfter:Infinity});
  map.ensureTiles();assert.equal(progress.at(-1).failed,1);assert.equal(queries.length,1);assert.equal(map.isFullyLoaded(),false);
  map.retryFailedTiles();map.ensureTiles();await settle(map);
  assert.equal(queries.length,2);assert.equal(map.tiles.get('4:0:0'),good);assert.equal(map.generation,generation);assert.equal(map.isFullyLoaded(),true);
  map.recolorTiles();assert.equal(queries.length,2);assert.equal(map.tiles.get('4:0:0'),good);
});

test('panning releases obsolete tile slots immediately and ignores even uncancellable late replies',async t=>{
  const {map}=setup(t),jobs=[];
  map.request=(action,q,options)=>new Promise(resolve=>jobs.push({q,...options,resolve}));
  map.ensureTiles();assert.equal(map.pending.size,1);
  map.bounds=()=>({minX:4096,minZ:0,maxX:4608,maxZ:512});map.ensureTiles();
  assert.equal(jobs[0].signal.aborted,true);assert.equal(jobs[1].priority,0);assert.equal(map.pending.size,1);
  jobs[0].resolve(new Uint16Array(4096));await new Promise(setImmediate);
  assert.equal(map.tiles.has('4:0:0'),false);assert.equal(map.pending.size,1);
  map.showBiomes=false;map.ensureTiles();assert.equal(jobs[1].signal.aborted,true);assert.equal(map.pending.size,0);
  jobs[1].resolve(new Uint16Array(4096));await new Promise(setImmediate);assert.equal(map.tiles.size,0);
});

test('the same viewport gets a labelled preview then exact tiles for every dimension',async t=>{
  for(const dimension of ['overworld','twilight','end','moon']) {
    const {map,queries,images,progress}=setup(t,dimension);
    map.ensureTiles();await settle(map);
    assert.equal(queries[0].width,64);assert.equal(queries[0].step,8);assert.equal(images[0].width,64);
    assert.equal(map.isFullyLoaded(),false);assert.equal(map.biomeAt(300,300),0);
    map.ensureTiles();await settle(map);
    assert.ok(progress.some(p=>p.previews===1));assert.equal(queries[1].width,128);assert.equal(queries[1].step,4);
    assert.equal(map.biomeAt(300,300),1);assert.equal(map.isFullyLoaded(),true);
    map.ensureTiles();assert.equal(queries.length,2);assert.equal(progress.at(-1).remaining,0);
  }
});

test('newly visible empty tiles are scheduled before refinement of existing previews',async t=>{
  const {map,queries}=setup(t);map.ensureTiles();await settle(map);
  map.bounds=()=>({minX:0,minZ:0,maxX:1024,maxZ:512});map.ensureTiles();await settle(map);
  assert.equal(queries[1].x,512);assert.equal(queries[1].step,8);
  assert.equal(queries[2].x,0);assert.equal(queries[2].step,4);
});

test('layer-only refresh keeps completed biomes but cancels stale in-flight tiles; seed changes discard them',async t=>{
  const {map}=setup(t);map.progressive=false;map.ensureTiles();await settle(map);
  const tile=map.tiles.get('4:0:0');map.changed=()=>{};
  map.setWorld('0','overworld',{preserveBiomes:true});assert.equal(map.tiles.get('4:0:0'),tile);
  map.setWorld('1','overworld',{preserveBiomes:true});assert.equal(map.tiles.size,0);
});

test('missing biome implementations finish without endless refinement; coarse failures can retry exact',async t=>{
  const {map,queries}=setup(t);map.request=async()=>null;
  map.ensureTiles();await settle(map);map.ensureTiles();assert.equal(map.isFullyLoaded(),true);
  map.tiles.clear();map.onError=()=>{};
  map.request=async(action,q)=>{queries.push(q);if(q.step===8)throw new Error('coarse failed');return new Uint16Array(q.width*q.height);};
  map.ensureTiles();await settle(map);map.failedTiles.get('4:0:0').retryAfter=0;
  map.ensureTiles();await settle(map);assert.equal(queries.at(-1).step,4);assert.equal(map.isFullyLoaded(),true);
});

test('preview and refinement independently crop the world edge and use their own query coordinates',async t=>{
  const {map,queries}=setup(t);
  map.bounds=()=>({minX:-30000000,minZ:0,maxX:-29999616,maxZ:512});
  map.ensureTiles();await settle(map);
  const coarse=queries[0];assert.equal(coarse.step,8);
  assert.ok(coarse.x>=-29999983);assert.equal(map.biomeAt(-30000000,0),undefined);
  assert.equal(map.biomeAt(coarse.x,0),0);assert.equal(map.isFullyLoaded(),false);
  map.ensureTiles();await settle(map);
  const fine=queries[1];assert.equal(fine.step,4);assert.ok(fine.x+2>=-29999983);
  assert.ok(fine.x<coarse.x);assert.equal(map.biomeAt(fine.x,0),1);
  assert.equal(map.biomeAt(-30000000,0),undefined);assert.equal(map.isFullyLoaded(),true);
});

test('zoom previews cannot cover sharper cached terrain; rendering and hover agree until refinement',async t=>{
  for(const oldStep of [2,8]) {
    const {map}=setup(t);
    const old={step:oldStep,tx:0,tz:0,preview:false,imageVersion:0,image:{name:'retained'},data:new Uint16Array(128*128).fill(2),query:{x:0,z:0,step:oldStep,width:128,height:128}};
    map.tiles.set(`${oldStep}:0:0`,old);
    const drawOrder=()=>{const drawn=[];map.drawBiomes({drawImage:(image,...position)=>drawn.push({image,position})});return drawn;};
    assert.equal(drawOrder().at(-1).image,old.image);assert.equal(map.biomeAt(100,100),2);
    assert.equal(map.isFullyLoaded(),false);
    map.ensureTiles();await settle(map);
    const preview=map.tiles.get('4:0:0');
    // A finer retained tile stays on top. Equal-resolution target previews may replace it.
    assert.equal(drawOrder().at(-1).image,oldStep<8?old.image:preview.image);
    assert.equal(map.biomeAt(100,100),oldStep<8?2:0);
    if(oldStep===2)assert.equal(map.biomeAt(300,300),0); // uncovered area still uses preview
    assert.equal(map.isFullyLoaded(),false);
    map.ensureTiles();await settle(map);
    assert.equal(drawOrder().at(-1).image,map.tiles.get('4:0:0').image);
    assert.equal(map.biomeAt(100,100),1);assert.equal(map.isFullyLoaded(),true);
    map.x+=40;
    const moved=drawOrder().find(d=>d.image===old.image);
    assert.equal(moved.position[0],-10); // world-anchored while panning
    map.changed=()=>{};map.setWorld('1','overworld');
    assert.equal(drawOrder().length,0);assert.equal(map.biomeAt(100,100),undefined);
  }
});
