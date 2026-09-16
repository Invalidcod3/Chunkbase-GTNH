import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuBiomeRenderer,gpuPalette,readGpuPreference,writeGpuPreference} from '../dist/gpu-biome-renderer.js';
import {MapView} from '../dist/map.js';

// API/lifecycle double. Shader pixels are additionally checked on the user's
// actual WebGL implementation by the runtime self-test; this is not a GPU test.
function harness(options={}) {
  const canvases=[],calls=[],statuses=[];let id=0;
  const factory=()=>{
    const listeners=new Map(),canvas={width:300,height:150,listeners,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
    const gl={lost:false,error:0,unit:0,bound:new Map(),textures:new Set(),
      get drawingBufferWidth(){return canvas.width;},get drawingBufferHeight(){return canvas.height;},
      getShaderParameter:()=>!options.compileFailure,getProgramParameter:()=>!options.linkFailure,
      createShader:()=>({id:++id}),createProgram:()=>({id:++id}),getUniformLocation:(_,k)=>k,
      createTexture(){const t={id:++id};this.textures.add(t);return t;},
      deleteTexture(t){this.textures.delete(t);calls.push(['deleteTexture',t]);},
      activeTexture(v){this.unit=v;},bindTexture(_,t){this.bound.set(this.unit,t);},
      texImage2D(...args){calls.push(['upload',this.unit,this.bound.get(this.unit),...args]);},
      getParameter(p){return p===this.MAX_VIEWPORT_DIMS?[8192,8192]:8192;},
      getError(){const e=this.error;this.error=0;return e;},isContextLost(){return this.lost;},
      getExtension(){return {loseContext:()=>{this.lost=true;}};},
      readPixels(x,y,w,h,format,type,pixels){if(!options.pixelFailure)pixels.set([165,126,97,255,249,240,214,255,18,52,86,255,171,205,239,255]);},
    };
    for(const [i,key] of ['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','NEAREST','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','TEXTURE0','TEXTURE1','UNPACK_ALIGNMENT','RGBA8','RGBA','UNSIGNED_BYTE','R16UI','RED_INTEGER','UNSIGNED_SHORT','MAX_TEXTURE_SIZE','MAX_RENDERBUFFER_SIZE','MAX_VIEWPORT_DIMS','BLEND','DEPTH_TEST','STENCIL_TEST','CULL_FACE','DITHER','COLOR_BUFFER_BIT','TRIANGLES'].entries())gl[key]=i+1;
    gl.NO_ERROR=0;
    for(const key of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram','deleteProgram','texParameteri','pixelStorei','viewport','disable','clearColor','clear','useProgram','uniform2f','uniform1i','uniform4f','uniform2i','drawArrays'])gl[key]=(...args)=>calls.push([key,...args]);
    canvas.gl=gl;canvas.getContext=(kind,attrs)=>{calls.push(['context',kind,attrs]);return options.unavailable?null:gl;};canvases.push(canvas);return canvas;
  };
  const renderer=new GpuBiomeRenderer({canvasFactory:factory,onStatus:s=>statuses.push(s),maxTextureBytes:options.budget||32768});
  return {renderer,canvases,calls,statuses};
}
const tile=(index=1,size=128)=>({query:{x:-12,z:-20,width:size,height:size,step:4},data:new Uint16Array(size*size).fill(index)});
const view={canvas:{width:800,height:600},width:400,height:300,scale:.25,smooth:false,screen:(x,z)=>({x:x+12,y:z+20})};

test('GPU preference is device-local, optional, validated and resilient to blocked storage',()=>{
  const values=new Map([['existing-world-settings','keep']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  assert.equal(readGpuPreference(storage),'off');
  for(const mode of ['off','auto','on']){assert.equal(writeGpuPreference(storage,mode),true);assert.equal(readGpuPreference(storage),mode);}
  assert.equal(writeGpuPreference(storage,'fastest'),false);assert.equal(values.get('existing-world-settings'),'keep');
  assert.equal(readGpuPreference({getItem(){throw Error();}}),'off');assert.equal(writeGpuPreference({setItem(){throw Error();}},'on'),false);
});

test('GPU palette preserves all 16-bit indices, explicit colors, fallback and opaque alpha',()=>{
  const p=gpuPalette([{index:65535,color:'#a57e61'},{index:0,color:'#123456'}]);
  assert.equal(p.length,262144);assert.deepEqual([...p.slice(0,4)],[18,52,86,255]);
  assert.deepEqual([...p.slice(-4)],[165,126,97,255]);assert.deepEqual([...p.slice(4,8)],[69,69,69,255]);
});

test('off mode allocates no graphics context; unavailable and failed self-tests fall back',()=>{
  const h=harness();h.renderer.setMode('off');assert.equal(h.canvases.length,0);
  for(const options of [{unavailable:true},{compileFailure:true},{linkFailure:true},{pixelFailure:true}]){
    const f=harness(options);f.renderer.setMode('on');assert.equal(f.renderer.active,false);
    assert.equal(f.renderer.state,options.unavailable?'unavailable':'failed');assert.equal(f.renderer.render([],view),null);
    assert.equal(f.canvases[0].gl.textures.size,0);
  }
});

test('integer textures retain samples, odd row alignment, cropped geometry and HiDPI viewport',()=>{
  const h=harness();h.renderer.setMode('auto');assert.equal(h.renderer.active,true);
  const gl=h.canvases[0].gl,t=tile(65535,3),original=t.data.slice();t.query.height=2;t.data=t.data.slice(0,6);
  h.calls.length=0;h.renderer.setPalette(gpuPalette([]));assert.ok(h.renderer.render([t],view));
  assert.deepEqual(t.data,original.slice(0,6));
  const upload=h.calls.find(c=>c[0]==='upload'&&c[5]===gl.R16UI);assert.ok(upload);
  assert.equal(upload[6],3);assert.equal(upload[7],2);assert.equal(upload[9],gl.RED_INTEGER);assert.equal(upload[10],gl.UNSIGNED_SHORT);
  assert.ok(h.calls.some(c=>c[0]==='pixelStorei'&&c[1]===gl.UNPACK_ALIGNMENT&&c[2]===1));
  assert.ok(h.calls.some(c=>c[0]==='viewport'&&c[3]===800&&c[4]===600));
  assert.ok(h.calls.some(c=>c[0]==='uniform4f'&&c.slice(2).join(',')==='0,0,3,2'));
  h.calls.length=0;h.renderer.render([t],view);assert.equal(h.calls.filter(c=>c[0]==='upload').length,0);
  h.renderer.setPalette(gpuPalette([{index:65535,color:'#ffffff'}]));h.renderer.render([t],{...view,smooth:true});
  assert.equal(h.calls.filter(c=>c[0]==='upload').length,1,'palette update does not upload biome textures');
});

test('texture eviction is bounded, retired tiles are released, and painter order is retained',()=>{
  const h=harness();h.renderer.setMode('on');const a=tile(1),b=tile(2);
  h.calls.length=0;h.renderer.render([a,b],view);assert.equal(h.renderer.textures.size,1);assert.ok(h.renderer.textures.has(b));
  assert.ok(h.renderer.textureBytes<=32768);assert.equal(h.calls.filter(c=>c[0]==='drawArrays').length,2);
  h.renderer.render([],view);assert.equal(h.renderer.textureBytes,0);
  h.renderer.setMode('off');assert.equal(h.canvases[0].gl.textures.size,0);
});

test('GPU context loss falls back immediately, restoration rechecks pixels, errors allow retry',()=>{
  const h=harness();h.renderer.setMode('auto');const c=h.canvases[0],t=tile();h.renderer.render([t],view);
  c.gl.lost=true;assert.equal(h.renderer.render([t],view),null);assert.equal(h.renderer.canvas,c,'Keep recovery listener if loss precedes its event');
  let prevented=false;c.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});
  assert.ok(prevented);assert.equal(h.renderer.state,'lost');assert.equal(h.renderer.render([t],view),null);
  c.gl.lost=false;c.listeners.get('webglcontextrestored')();assert.equal(h.renderer.state,'active');assert.equal(h.canvases.length,2);
  h.canvases[1].gl.error=1285;assert.equal(h.renderer.render([t],view),null);assert.equal(h.renderer.state,'failed');
  h.renderer.setMode('on');assert.equal(h.renderer.state,'active');
  assert.equal(h.renderer.render([t],{...view,canvas:{width:10000,height:600}}),null);assert.equal(h.renderer.state,'failed');
});

test('MapView lazily prepares CPU pixels on GPU failure without new biome requests',()=>{
  let writes=0;const image={getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){writes++;}})};
  const t={...tile(0),tx:0,tz:0,step:4,image,query:{x:0,z:0,width:128,height:128,step:4}};
  const map=Object.assign(Object.create(MapView.prototype),{...view,tiles:new Map([['tile',t]]),paletteRevision:0,gpuPaletteRevision:0,gpuRenderer:{active:true,render(){this.active=false;return null;}},request(){throw Error('Unexpected generator request');}});
  const drawn=[];map.drawBiomes({drawImage:(...args)=>drawn.push(args)});
  assert.equal(writes,1);assert.equal(drawn[0][0],image);assert.equal(map.tiles.get('tile'),t);
  map.drawBiomes({drawImage(){}});assert.equal(writes,1);
  map.recolorTiles();assert.equal(writes,1,'recoloring is deferred until visible drawing');
  map.drawBiomes({drawImage(){}});assert.equal(writes,2);assert.equal(map.biomeAt(4,4),0);
});

test('GPU drops textures for offscreen tiles even when their CPU samples remain cached',()=>{
  const h=harness(),t=tile();
  h.renderer.setMode('on');h.renderer.render([t],view);assert.equal(h.renderer.textures.size,1);
  h.renderer.render([t],{...view,screen:()=>({x:1000,y:1000})});
  assert.equal(h.renderer.textures.size,0);assert.equal(h.renderer.textureBytes,0);assert.equal(t.data.length,16384);
});

test('GPU presentation remains inside the export canvas with overlays drawn afterward',t=>{
  const previous=globalThis.document;globalThis.document={querySelector:()=>({style:{}})};t.after(()=>globalThis.document=previous);
  const calls=[],ctx=new Proxy({}, {get:(_,k)=>(...args)=>calls.push([k,...args]),set:()=>true}),surface={gpu:true};
  const tileData={...tile(0),image:{},tx:0,tz:0,step:4};
  const map=Object.assign(Object.create(MapView.prototype),{...view,ctx,tiles:new Map([['tile',tileData]]),paletteRevision:0,gpuPaletteRevision:0,gpuRenderer:{active:true,render:()=>surface},showBiomes:true,showStructures:true,grid:false,markerMode:'STRUCTURE',markers:[{x:0,z:0,kind:'TEST'}],filtered:new Set(),images:new Map()});
  map.draw();const gpu=calls.findIndex(c=>c[0]==='drawImage'&&c[1]===surface),marker=calls.findIndex(c=>c[0]==='strokeRect');
  assert.ok(gpu>=0&&marker>gpu);assert.equal(map.ctx,ctx,'PNG still exports the same composition canvas');
});
