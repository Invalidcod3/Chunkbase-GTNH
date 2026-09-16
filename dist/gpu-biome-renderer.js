// Rendering only: integer biome samples and generator caches remain CPU-owned.
import {GPU_MODES} from './gpu-settings.js';
import {biomeRgb} from './biome-selection.js';
export {GPU_MODES,readGpuPreference,writeGpuPreference} from './gpu-settings.js';
export function gpuPalette(biomes, selection) {
  const colors=new Uint8Array(256*256*4),fallback=biomeRgb(undefined,selection);
  for(let i=0;i<colors.length;i+=4)colors.set([fallback>>16,(fallback>>8)&255,fallback&255,255],i);
  for(const b of biomes)if(b&&Number.isInteger(b.index)&&b.index>=0&&b.index<65536){
    const rgb=biomeRgb(b,selection);colors.set([rgb>>16,(rgb>>8)&255,rgb&255,255],b.index*4);
  }
  return colors;
}
export const vertexShader = `#version 300 es
precision highp float;
uniform vec4 u_rect;
uniform vec2 u_view;
out vec2 v_uv;
void main() {
  vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
  v_uv=corners[gl_VertexID];
  vec2 p=(u_rect.xy+v_uv*u_rect.zw)/u_view;
  gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0,1);
}`;
export const fragmentShader = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D u_ids;
uniform highp sampler2D u_palette;
uniform ivec2 u_size;
uniform bool u_smooth;
in vec2 v_uv;
out vec4 result;
vec4 colorAt(ivec2 p) {
  uint id=texelFetch(u_ids,clamp(p,ivec2(0),u_size-1),0).r;
  return texelFetch(u_palette,ivec2(int(id&255u),int(id>>8u)),0);
}
void main() {
  vec2 p=v_uv*vec2(u_size);
  if(!u_smooth){result=colorAt(ivec2(floor(p)));return;}
  p-=vec2(0.5);ivec2 cell=ivec2(floor(p));vec2 f=fract(p);
  result=mix(mix(colorAt(cell),colorAt(cell+ivec2(1,0)),f.x),
             mix(colorAt(cell+ivec2(0,1)),colorAt(cell+ivec2(1,1)),f.x),f.y);
}`;

export class GpuBiomeRenderer {
  constructor({canvasFactory=()=>document.createElement('canvas'),onStatus=()=>{},maxTextureBytes=32*1024*1024}={}) {
    if(!Number.isSafeInteger(maxTextureBytes)||maxTextureBytes<32768)throw new Error('Invalid GPU texture budget');
    Object.assign(this,{canvasFactory,onStatus,maxTextureBytes,mode:'off',active:false,state:'off',textures:new Map(),textureBytes:0});
  }
  status(state) { this.state=state;this.onStatus({mode:this.mode,state}); }
  setMode(mode) {
    if(!GPU_MODES.includes(mode))throw new Error('Invalid GPU mode');
    this.release();this.mode=mode;
    if(mode==='off'){this.status('off');return;}
    this.status('starting');
    try {
      this.canvas=this.canvasFactory();
      const gl=this.canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:['on','aggressive','maximum'].includes(mode)?'high-performance':'default'});
      if(!gl){this.release();this.status('unavailable');return;}
      this.gl=gl;
      this.lost=e=>{e.preventDefault();this.active=false;this.textures.clear();this.textureBytes=0;this.status('lost');};
      this.restored=()=>{if(this.mode!=='off')this.setMode(this.mode);};
      this.canvas.addEventListener('webglcontextlost',this.lost);
      this.canvas.addEventListener('webglcontextrestored',this.restored);
      const compile=(type,source)=>{
        const s=gl.createShader(type);if(!s)throw new Error('Shader allocation failed');
        gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw new Error('Shader compilation failed');}
        return s;
      };
      this.shaders=[];
      this.shaders.push(compile(gl.VERTEX_SHADER,vertexShader));this.shaders.push(compile(gl.FRAGMENT_SHADER,fragmentShader));
      this.program=gl.createProgram();if(!this.program)throw new Error('Program allocation failed');
      for(const s of this.shaders)gl.attachShader(this.program,s);gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Shader linking failed');
      this.uniforms=Object.fromEntries(['rect','view','ids','palette','size','smooth'].map(k=>[k,gl.getUniformLocation(this.program,'u_'+k)]));
      this.paletteTexture=this.newTexture();
      this.maxSize=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
      if(this.maxSize<256)throw new Error('Texture limits too small');
      this.selfTest();this.active=true;this.status('active');
    } catch { this.release();this.status('failed'); }
  }
  newTexture() {
    const gl=this.gl,t=gl.createTexture();if(!t)throw new Error('Texture allocation failed');
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }
  setPalette(colors) {
    const gl=this.gl;if(!gl)return;
    if(!(colors instanceof Uint8Array)||colors.length!==262144)throw new Error('Invalid GPU palette');
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.paletteTexture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,256,256,0,gl.RGBA,gl.UNSIGNED_BYTE,colors);
  }
  deleteTexture(tile) {
    const entry=this.textures.get(tile);if(!entry)return;
    this.gl.deleteTexture(entry.texture);this.textureBytes-=entry.bytes;this.textures.delete(tile);
  }
  texture(tile) {
    const gl=this.gl,q=tile.query;
    let entry=this.textures.get(tile);
    if(entry&&entry.data===tile.data&&entry.width===q.width&&entry.height===q.height){this.textures.delete(tile);this.textures.set(tile,entry);return entry.texture;}
    if(entry)this.deleteTexture(tile);
    if(!(tile.data instanceof Uint16Array)||tile.data.length!==q.width*q.height||q.width>this.maxSize||q.height>this.maxSize||tile.data.byteLength>this.maxTextureBytes)throw new Error('Invalid GPU tile');
    while(this.textures.size&&(this.textureBytes+tile.data.byteLength>this.maxTextureBytes||this.textures.size>=1024))this.deleteTexture(this.textures.keys().next().value);
    gl.activeTexture(gl.TEXTURE0);const texture=this.newTexture();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R16UI,q.width,q.height,0,gl.RED_INTEGER,gl.UNSIGNED_SHORT,tile.data);
    entry={texture,data:tile.data,width:q.width,height:q.height,bytes:tile.data.byteLength};
    this.textures.set(tile,entry);this.textureBytes+=entry.bytes;return texture;
  }
  frame(items,width,height,cssWidth,cssHeight,smooth) {
    const gl=this.gl,u=this.uniforms;
    if(gl.isContextLost()||![width,height,cssWidth,cssHeight].every(n=>Number.isFinite(n)&&n>0)||Math.max(width,height)>this.maxSize)throw new Error('GPU surface unavailable');
    if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;
    if(gl.drawingBufferWidth!==width||gl.drawingBufferHeight!==height)throw new Error('GPU surface size mismatch');
    gl.viewport(0,0,width,height);
    for(const cap of [gl.BLEND,gl.DEPTH_TEST,gl.STENCIL_TEST,gl.CULL_FACE,gl.DITHER])gl.disable(cap);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);
    gl.uniform2f(u.view,cssWidth,cssHeight);gl.uniform1i(u.ids,0);gl.uniform1i(u.palette,1);gl.uniform1i(u.smooth,smooth?1:0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.paletteTexture);
    for(const {tile,rect} of items){
      const texture=this.texture(tile);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.uniform4f(u.rect,...rect);gl.uniform2i(u.size,tile.query.width,tile.query.height);gl.drawArrays(gl.TRIANGLES,0,6);
    }
    if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw new Error('GPU rendering failed');
    return this.canvas;
  }
  selfTest() {
    this.setPalette(gpuPalette([{index:1,color:'#123456'},{index:256,color:'#abcdef'},{index:4096,color:'#a57e61'},{index:65535,color:'#f9f0d6'}]));
    const tile={query:{width:2,height:2},data:new Uint16Array([1,256,4096,65535])};
    this.frame([{tile,rect:[0,0,2,2]}],2,2,2,2,false);
    const pixels=new Uint8Array(16),gl=this.gl;gl.readPixels(0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const expected=[165,126,97,255,249,240,214,255,18,52,86,255,171,205,239,255];
    if(gl.getError()!==gl.NO_ERROR||pixels.some((v,i)=>v!==expected[i]))throw new Error('GPU pixel self-test failed');
    this.deleteTexture(tile);
  }
  render(tiles,view) {
    if(!this.active)return null;
    try {
      const items=[];
      for(const tile of tiles){
        if(!tile.data||!tile.query)continue;
        const q=tile.query,p=view.screen(q.x,q.z),w=q.width*q.step*view.scale,h=q.height*q.step*view.scale;
        if(p.x<view.width&&p.y<view.height&&p.x+w>0&&p.y+h>0)items.push({tile,rect:[p.x,p.y,w,h]});
      }
      const keep=new Set(items.map(item=>item.tile));for(const tile of this.textures.keys())if(!keep.has(tile))this.deleteTexture(tile);
      return this.frame(items,view.canvas.width,view.canvas.height,view.width,view.height,view.smooth);
    } catch {
      // Loss can be observed before its DOM event is delivered. Keep listeners
      // alive so preventDefault/recovery still run instead of losing the retry.
      if(this.gl?.isContextLost()){this.active=false;this.status('lost');}
      else {this.release();this.status('failed');}
      return null;
    }
  }
  release() {
    this.active=false;
    if(this.canvas){this.canvas.removeEventListener('webglcontextlost',this.lost);this.canvas.removeEventListener('webglcontextrestored',this.restored);}
    if(this.gl){
      for(const tile of this.textures.keys())this.deleteTexture(tile);
      if(this.paletteTexture)this.gl.deleteTexture(this.paletteTexture);
      if(this.program)this.gl.deleteProgram(this.program);
      for(const s of this.shaders||[])this.gl.deleteShader(s);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl=null;this.canvas=null;this.program=null;this.paletteTexture=null;this.shaders=[];this.textures.clear();this.textureBytes=0;
  }
}
