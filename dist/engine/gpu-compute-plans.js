import {JavaRandom, parseSeed} from './random.js';
import {islandInRegion, endBiomes} from './end.js';
import {predictStructures, validateBounds} from './native.js';
import {predictModStructures,validateModConfig} from './mod-structures.js';

const MAX_PIXELS=262144, MAX_REGIONS=65536;
const limbs=value=>{const n=BigInt.asUintN(48,BigInt(value));return [Number(n&65535n),Number((n>>16n)&65535n),Number(n>>32n)];};
export function endPlan(q) {
  if(q.dimension!=='end'||![q.x,q.z,q.width,q.height,q.step].every(Number.isSafeInteger)
    ||q.width<1||q.height<1||q.width*q.height>MAX_PIXELS||q.step<1||q.step>256)return null;
  const lastX=q.x+(q.width-1)*q.step,lastZ=q.z+(q.height-1)*q.step;
  if([q.x,q.z,lastX,lastZ].some(n=>Math.abs(n)>30000000))return null;
  const seed=parseSeed(q.seed),rx=Math.floor(q.x/448),rz=Math.floor(q.z/448);
  const cols=Math.floor(lastX/448)-rx+1,rows=Math.floor(lastZ/448)-rz+1;
  if(cols*rows>MAX_REGIONS)return null;
  // Each island circle is wholly within its 448-block region (offset 0..432).
  // Keep the exact Java random and double-precision island placement on CPU;
  // the GPU can look up one region per pixel instead of scanning all islands.
  const regions=new Int32Array(cols*rows*4);
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++) {
    const island=islandInRegion(seed,rx+x,rz+z);
    if(island)regions.set([island.x,island.z,island.biome,1],(z*cols+x)*4);
  }
  return {kernel:'end',count:q.width*q.height,params:new Int32Array([q.x,q.z,q.width,q.height,q.step,rx,rz,cols]),input:regions,
    reference:()=>Uint32Array.from(endBiomes(seed,q.x,q.z,q.width,q.height,q.step))};
}
export function mineshaftPlan(q) {
  if(q.dimension!=='overworld'||q.config?.mineshaftsEnabled===false)return null;
  validateBounds(q.bounds);const seed=parseSeed(q.seed),b=q.bounds;
  const x=Math.ceil((b.minX-8)/16),z=Math.ceil((b.minZ-8)/16);
  const width=Math.floor((b.maxX-9)/16)-x+1,height=Math.floor((b.maxZ-9)/16)-z+1;
  if(width<1||height<1||width*height>MAX_PIXELS)return null;
  const r=new JavaRandom(seed),a=limbs(r.nextLong()),c=limbs(r.nextLong());
  // nextDouble is an exact integer / 2^53. Compare against ceil(.004 * 2^53)
  // in 26+27 bits, avoiding any GPU floating-point probability rounding.
  const threshold=BigInt(Math.ceil(.004*9007199254740992));
  const params=new Int32Array([x,z,width,height,...a,0,...c,0,...limbs(seed),0,Number(threshold>>27n),Number(threshold&134217727n),0,0]);
  return {kernel:'mineshafts',count:width*height,params,input:new Uint32Array(4),
    reference:()=>{
      const flags=new Uint32Array(width*height);
      for(const m of predictStructures({...q,config:{mineshaftsEnabled:true}}))if(m.kind==='MINESHAFT')
        flags[((m.z-8)/16-z)*width+(m.x-8)/16-x]=1;
      return flags;
    },
    markers:flags=>{
      const result=[];
      for(let i=0;i<flags.length;i++)if(flags[i])result.push({kind:'MINESHAFT',x:(x+i%width)*16+8,z:(z+Math.floor(i/width))*16+8,subtype:'',source:'RWG',certainty:'POSSIBLE'});
      return result;
    }};
}

export function forgePlan(q) {
  if(!['overworld','nether'].includes(q.dimension))return null;
  validateBounds(q.bounds);const seed=parseSeed(q.seed),c=validateModConfig(q.config?.modStructures);
  const slime=q.dimension==='nether'?c.slimeNetherEnabled:c.slimeOverworldEnabled,spires=q.dimension==='nether'&&c.netherSpiresEnabled;
  if(!slime&&!spires)return null;
  const b=q.bounds,x=Math.floor((b.minX-16)/16),z=Math.floor((b.minZ-16)/16);
  const width=Math.floor((b.maxX-5)/16)-x+1,height=Math.floor((b.maxZ-5)/16)-z+1;
  if(width*height>MAX_PIXELS)return null;
  const r=new JavaRandom(seed),a=limbs(r.nextLong()>>3n),d=limbs(r.nextLong()>>3n);
  const params=new Int32Array([x,z,width,height,...a,0,...d,0,...limbs(seed),0,c.slimeRarity,c.netherSpireChance,(slime?1:0)|(spires?2:0),0]);
  return {kernel:'forge',params,input:new Uint32Array(4),count:width*height,
    reference:()=>{
      const out=new Uint32Array(width*height);
      const bounds={minX:x*16+4,minZ:z*16+4,maxX:(x+width-1)*16+17,maxZ:(z+height-1)*16+17};
      const config={modStructures:{...c,lootGamesEnabled:false,meteoritesEnabled:false}};
      for(const m of predictModStructures({...q,bounds,config})) {
        const isSpire=m.kind==='AUTOMAGY_NETHER_SPIRE',cx=isSpire?Math.floor((m.x-4)/16):(m.x-16)/16,cz=isSpire?Math.floor((m.z-4)/16):(m.z-16)/16;
        if(cx<x||cx>=x+width||cz<z||cz>=z+height)continue;
        out[(cz-z)*width+cx-x]|=isSpire?2|((m.x-cx*16-4)<<2)|((m.z-cz*16-4)<<5):1;
      }
      return out;
    },
    markers:values=>{
      const result={slime:[],spires:[]};
      const add=(group,kind,mx,mz,source,certainty)=>{
        if(mx>=b.minX&&mx<b.maxX&&mz>=b.minZ&&mz<b.maxZ)result[group].push({kind,x:mx,z:mz,source,certainty,subtype:''});
      };
      for(let i=0;i<values.length;i++) {
        const cx=x+i%width,cz=z+Math.floor(i/width),v=values[i];
        if(slime&&(v&1))add('slime',q.dimension==='nether'?'TINKERS_NETHER_SLIME_ISLAND':'TINKERS_SLIME_ISLAND',cx*16+16,cz*16+16,"Tinkers' Construct",'EXPECTED');
        if(spires&&(v&2))add('spires','AUTOMAGY_NETHER_SPIRE',cx*16+4+((v>>2)&7),cz*16+4+((v>>5)&7),'Automagy','POSSIBLE');
      }
      return result;
    }};
}
export function validComputeValue(kernel,v) {
  if(kernel==='end')return v>=3000&&v<=3004;
  if(kernel==='mineshafts')return v<=1;
  return kernel==='forge'&&v<=255&&((v&2)?((v>>2)&7)<=5&&((v>>5)&7)<=5:v<=1);
}

export function mineshaftRejectionPlan() {
  const seed='244302013495138';
  const plan=mineshaftPlan({seed:'0',dimension:'overworld',bounds:{minX:480,minZ:0,maxX:992,maxZ:512}});
  // A deliberately fixed per-chunk seed: after the discarded int and double,
  // next(31) is 2147483647. nextInt(80) must reject 47 and ultimately return 22.
  plan.params.fill(0,4,16);plan.params.set(limbs(seed),12);
  plan.reference=()=>{
    const out=new Uint32Array(plan.count);
    for(let i=0;i<out.length;i++) {
      const r=new JavaRandom(seed);r.nextInt();
      out[i]=+(r.nextDouble()<.004&&r.nextInt(80)<Math.max(30+i%32,Math.floor(i/32)));
    }
    return out;
  };
  return plan;
}

export const computeShader=`
@group(0) @binding(0) var<storage, read> p: array<i32>;
@group(0) @binding(1) var<storage, read> regions: array<vec4<i32>>;
@group(0) @binding(2) var<storage, read_write> result: array<u32>;
fn floorRegion(v: i32) -> i32 { return v / 448 - select(0, 1, v < 0 && v % 448 != 0); }
@compute @workgroup_size(64)
fn end(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i=gid.x;
  if(i>=u32(p[2]*p[3])) { return; }
  let x=p[0]+i32(i%u32(p[2]))*p[4]; let z=p[1]+i32(i/u32(p[2]))*p[4];
  var biome=3000u;
  // Guard before squaring: exact signed 32-bit arithmetic even at world edges.
  if(abs(x)<=1024 && abs(z)<=1024) { if(x*x+z*z<=1048576) { biome=3001u; } }
  let region=regions[u32((floorRegion(z)-p[6])*p[7]+floorRegion(x)-p[5])];
  if(region.w!=0) {
    let dx=x-region.x; let dz=z-region.y;
    if(abs(dx)<=104 && abs(dz)<=104) { if(dx*dx+dz*dz<=10816) { biome=u32(region.z); } }
  }
  result[i]=biome;
}
// Java Random needs the low 48 bits only. Three 16-bit limbs preserve signed
// chunk multiplication and LCG overflow without floats or optional features.
fn mul48(a: vec3<u32>, b: vec3<u32>) -> vec3<u32> {
  let t=a.x*b.x;
  let u=a.x*b.y; let v=a.y*b.x;
  let middle=(t>>16u)+(u&65535u)+(v&65535u);
  let high=(middle>>16u)+(u>>16u)+(v>>16u)+a.x*b.z+a.y*b.y+a.z*b.x;
  return vec3<u32>(t&65535u,middle&65535u,high&65535u);
}
fn signed48(n: i32) -> vec3<u32> { return vec3<u32>(u32(n)&65535u,(u32(n)>>16u)&65535u,select(0u,65535u,n<0)); }
fn nextState(s: ptr<function, vec3<u32>>) {
  let n=mul48(*s,vec3<u32>(58989u,57068u,5u));
  let low=n.x+11u;let middle=n.y+(low>>16u);
  *s=vec3<u32>(low&65535u,middle&65535u,(n.z+(middle>>16u))&65535u);
}
fn add48(a: vec3<u32>, b: vec3<u32>) -> vec3<u32> {
  let low=a.x+b.x;let middle=a.y+b.y+(low>>16u);
  return vec3<u32>(low&65535u,middle&65535u,(a.z+b.z+(middle>>16u))&65535u);
}
fn bounded(s: ptr<function, vec3<u32>>, bound: u32) -> u32 {
  for(var attempts=0u;attempts<64u;attempts++) {
    nextState(s);let bits=((*s).y>>1u)|((*s).z<<15u);
    if((bound&(bound-1u))==0u) { return bits/(2147483648u/bound); }
    let value=bits%bound;
    if(bits-value+bound-1u<2147483648u) { return value; }
  }
  return 4294967295u;
}
@compute @workgroup_size(64)
fn forge(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i=gid.x;if(i>=u32(p[2]*p[3])) { return; }
  let x=p[0]+i32(i%u32(p[2]));let z=p[1]+i32(i/u32(p[2]));
  let initial=add48(mul48(signed48(x),vec3<u32>(u32(p[4]),u32(p[5]),u32(p[6]))),
                    mul48(signed48(z),vec3<u32>(u32(p[8]),u32(p[9]),u32(p[10]))))
    ^vec3<u32>(u32(p[12]),u32(p[13]),u32(p[14]))^vec3<u32>(58989u,57068u,5u);
  var flags=0u;
  if((p[18]&1)!=0) {
    var s=initial;let value=bounded(&s,u32(p[16]));
    if(value==4294967295u) { result[i]=value;return; }
    if(value==0u) { flags=1u; }
  }
  if((p[18]&2)!=0) {
    var s=initial;let value=bounded(&s,u32(p[17]));
    if(value==4294967295u) { result[i]=value;return; }
    if(value==0u) {
      let dx=bounded(&s,6u);let dz=bounded(&s,6u);
      if(dx>5u||dz>5u) { result[i]=4294967295u;return; }
      flags=flags|2u|(dx<<2u)|(dz<<5u);
    }
  }
  result[i]=flags;
}
@compute @workgroup_size(64)
fn mineshafts(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i=gid.x;
  if(i>=u32(p[2]*p[3])) { return; }
  let x=p[0]+i32(i%u32(p[2]));let z=p[1]+i32(i/u32(p[2]));
  var s=mul48(signed48(x),vec3<u32>(u32(p[4]),u32(p[5]),u32(p[6])))
       ^mul48(signed48(z),vec3<u32>(u32(p[8]),u32(p[9]),u32(p[10])))
       ^vec3<u32>(u32(p[12]),u32(p[13]),u32(p[14]))^vec3<u32>(58989u,57068u,5u);
  nextState(&s); // discarded nextInt()
  nextState(&s);let hi=(s.y>>6u)|(s.z<<10u);
  nextState(&s);let lo=(s.y>>5u)|(s.z<<11u);
  result[i]=0u;
  if(hi>u32(p[16]) || (hi==u32(p[16]) && lo>=u32(p[17]))) { return; }
  for(var attempts=0u;attempts<64u;attempts++) {
    nextState(&s);let bits=(s.y>>1u)|(s.z<<15u);let value=bits%80u;
    if(bits-value+79u<2147483648u) { result[i]=select(0u,1u,value<u32(max(abs(x),abs(z))));return; }
  }
  result[i]=2u; // Unexpected rejection tail: discard this dispatch and use CPU.
}`;
