import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuCompute} from '../dist/engine/gpu-compute.js';
import {endPlan,mineshaftPlan,mineshaftRejectionPlan,computeShader,forgePlan,validComputeValue} from '../dist/engine/gpu-compute-plans.js';
import {predictModStructures} from '../dist/engine/mod-structures.js';
import {predictStructures,sampleBiomes} from '../dist/engine/native.js';
import {WorkerClient} from '../dist/engine/worker-client.js';
import {readGpuPreference,writeGpuPreference} from '../dist/gpu-biome-renderer.js';

// Integer interpretation of the kernel's operations, not a real shader run.
// Independent CPU oracles below exercise geometry and Java 64/48-bit semantics.
function interpret(kernel,p,input) {
  const result=new Uint32Array(p[2]*p[3]);
  if(kernel==='end') {
    for(let i=0;i<result.length;i++) {
      const x=p[0]+i%p[2]*p[4],z=p[1]+Math.floor(i/p[2])*p[4];
      let id=Math.abs(x)<=1024&&Math.abs(z)<=1024&&x*x+z*z<=1048576?3001:3000;
      const at=((Math.floor(z/448)-p[6])*p[7]+Math.floor(x/448)-p[5])*4;
      const dx=x-input[at],dz=z-input[at+1];
      if(input[at+3]&&Math.abs(dx)<=104&&Math.abs(dz)<=104&&dx*dx+dz*dz<=10816)id=input[at+2];
      result[i]=id;
    }
  } else {
    const mul=(a,b)=>{
      const t=Math.imul(a[0],b[0])>>>0,u=Math.imul(a[0],b[1])>>>0,v=Math.imul(a[1],b[0])>>>0;
      const mid=(t>>>16)+(u&65535)+(v&65535);
      return [t&65535,mid&65535,((mid>>>16)+(u>>>16)+(v>>>16)+Math.imul(a[0],b[2])+Math.imul(a[1],b[1])+Math.imul(a[2],b[0]))&65535];
    };
    const signed=n=>[n&65535,(n>>>16)&65535,n<0?65535:0];
    for(let i=0;i<result.length;i++) {
      const x=p[0]+i%p[2],z=p[1]+Math.floor(i/p[2]);
      const a=mul(signed(x),p.slice(4,7)),b=mul(signed(z),p.slice(8,11));
      const low=a[0]+b[0],middle=a[1]+b[1]+(low>>>16);
      const combined=kernel==='forge'?[low&65535,middle&65535,(a[2]+b[2]+(middle>>>16))&65535]:a.map((v,k)=>v^b[k]);
      let s=combined.map((v,k)=>v^p[12+k]^[58989,57068,5][k]);
      const next=()=>{const n=mul(s,[58989,57068,5]),lo=n[0]+11,mid=n[1]+(lo>>>16);s=[lo&65535,mid&65535,(n[2]+(mid>>>16))&65535];};
      if(kernel==='forge') {
        const initial=s.slice();
        const bounded=bound=>{
          for(let attempt=0;attempt<64;attempt++) {
            next();const bits=(s[1]>>>1)|(s[2]<<15);
            if((bound&(bound-1))===0)return Math.floor(bits/(2147483648/bound));
            const value=bits%bound;if(bits-value+bound-1<2147483648)return value;
          }
          return 4294967295;
        };
        let flags=0;
        if(p[18]&1){const value=bounded(p[16]);if(value===4294967295){result[i]=value;continue;}if(value===0)flags=1;}
        if(p[18]&2){s=initial.slice();const value=bounded(p[17]);if(value===4294967295){result[i]=value;continue;}
          if(value===0){const dx=bounded(6),dz=bounded(6);if(dx>5||dz>5){result[i]=4294967295;continue;}flags|=2|(dx<<2)|(dz<<5);}}
        result[i]=flags;continue;
      }
      next();next();const hi=(s[1]>>>6)|(s[2]<<10);next();const lo=(s[1]>>>5)|(s[2]<<11);
      if(hi>p[16]||hi===p[16]&&lo>=p[17])continue;
      result[i]=2;
      for(let n=0;n<64;n++) {next();const bits=(s[1]>>>1)|(s[2]<<15),value=bits%80;
        if(bits-value+79<2147483648){result[i]=+(value<Math.max(Math.abs(x),Math.abs(z)));break;}
      }
    }
  }
  return result;
}
const endQuery={seed:'12345',dimension:'end',x:-5377,z:2303,width:65,height:67,step:17};
const mineQuery={seed:'12345',dimension:'overworld',bounds:{minX:-8195,minZ:67,maxX:-6147,maxZ:2115}};
test('End region lookup exactly matches original circles for all steps, seams and world edges',()=>{
  for(const seed of ['0','-1','123456789','9223372036854775807','-9223372036854775808'])
    for(const step of [1,2,3,4,16,31,64,128,256])
      for(const [x,z] of [[-1073,-1043],[-1,-449],[-7169,2047],[-30000000,29980000],[29980000,-30000000]]) {
        const plan=endPlan({...endQuery,seed,x,z,step});
        assert.deepEqual(interpret('end',plan.params,plan.input),plan.reference(),`${seed}/${x}/${z}/${step}`);
      }
});
test('48-bit limb multiplication, rejection sampling and exact probability match Java mineshafts',()=>{
  let hits=0;
  for(const seed of ['0','1','-1','1234567890123456789','9223372036854775807','-9223372036854775808'])
    for(const [x,z] of [[-519,-521],[3,7],[-8195,4097],[-30000000,29998000],[29998000,-30000000]]) {
      const q={...mineQuery,seed,bounds:{minX:x,minZ:z,maxX:x+1024,maxZ:z+1024}},plan=mineshaftPlan(q);
      const flags=interpret('mineshafts',plan.params,plan.input);hits+=flags.reduce((a,b)=>a+b,0);
      assert.deepEqual(flags,plan.reference(),`${seed}/${x}/${z}`);
      assert.deepEqual(plan.markers(flags),predictStructures(q).filter(m=>m.kind==='MINESHAFT'));
    }
  assert.ok(hits>300);
  const rejection=mineshaftRejectionPlan();
  assert.deepEqual(interpret('mineshafts',rejection.params,rejection.input),rejection.reference());
  assert.ok(rejection.reference().every(v=>v===1));
});

// API lifecycle double executes the integer interpretation. The production
// enable path separately runs all self-tests on the actual WebGPU device.
function harness(options={}) {
  const devices=[],states=[],calls=[];let adapterCalls=0;
  const getGpu=()=>({requestAdapter:async()=>{
    adapterCalls++;if(options.unavailable)return null;
    return {requestDevice:async()=>{
      let lost;const listeners={},buffers=[],device={buffers,destroyed:false,
        limits:{maxBufferSize:options.lowLimit?16:8*1024*1024,maxStorageBufferBindingSize:8*1024*1024,maxComputeWorkgroupsPerDimension:65535},
        lost:new Promise(r=>{lost=r;}),addEventListener:(k,f)=>listeners[k]=f,
        destroy(){this.destroyed=true;lost({reason:'destroyed'});},lose(){lost({reason:'unknown'});},
        createShaderModule:({code})=>{assert.equal(code,computeShader);return {};},
        createComputePipelineAsync:async({compute})=>{if(options.compileFailure)throw Error('compile');return {kernel:compute.entryPoint,getBindGroupLayout:()=>compute.entryPoint};},
        pushErrorScope(){},popErrorScope:async()=>options.validationError?{}:null,
        createBuffer({size,usage}) {const b={bytes:new Uint8Array(size),usage,destroyed:false,
          mapAsync:async()=>{if(options.mapFailure)throw Error('map');if(options.onMap)await options.onMap();},getMappedRange(){return this.bytes.buffer;},unmap(){},destroy(){this.destroyed=true;}};buffers.push(b);return b;},
        createBindGroup({layout,entries}) {assert.deepEqual(entries.map(e=>e.binding),layout==='end'?[0,1,2]:[0,2]);return Object.fromEntries(entries.map(e=>[e.binding,e.resource.buffer]));},
        createCommandEncoder(){let kernel,bindings;return {beginComputePass:()=>({setPipeline:p=>kernel=p.kernel,setBindGroup:(_,b)=>bindings=b,dispatchWorkgroups:n=>calls.push(['dispatch',kernel,n]),end(){}}),
          copyBufferToBuffer(out,_,read){const params=new Int32Array(bindings[0].bytes.buffer),input=bindings[1]?new Int32Array(bindings[1].bytes.buffer):null;
            const data=interpret(kernel,params,input);if(options.corrupt)data[0]=options.invalid?99:data[0]===1?0:1;
            out.bytes.set(new Uint8Array(data.buffer));read.bytes.set(out.bytes);},finish:()=>({})};},
        queue:{writeBuffer:(b,_,array)=>b.bytes.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)),submit(){}},
      };devices.push(device);return device;
    }};
  }});
  const compute=new GpuCompute({getGpu,onStatus:s=>states.push(s)});
  return {compute,devices,states,calls,get adapterCalls(){return adapterCalls;}};
}
test('disabled, tiny and unsupported queries do not request a device',async()=>{
  const h=harness();assert.equal(await h.compute.sampleEnd(endQuery),null);
  assert.deepEqual(await h.compute.structures(mineQuery),predictStructures(mineQuery));
  h.compute.setEnabled(true);
  assert.equal(await h.compute.sampleEnd({...endQuery,width:1,height:1}),null);
  assert.equal(await h.compute.sampleEnd({...endQuery,dimension:'twilight'}),null);
  assert.equal(endPlan({...endQuery,width:262144,height:1,step:256}),null);
  assert.equal(h.adapterCalls,0);
});
test('actual enable self-tests and first-query validation precede results; exact output and ordering preserved',async()=>{
  const h=harness();h.compute.setEnabled(true);
  assert.equal(await h.compute.sampleEnd(endQuery),null,'CPU serves the first query while prewarming');
  assert.equal(await h.compute.ready(),true);
  assert.deepEqual(await h.compute.sampleEnd(endQuery),sampleBiomes(endQuery));
  const q={...mineQuery,config:{modStructures:{lootGamesEnabled:true},villagesEnabled:false}};
  assert.deepEqual(await h.compute.structures(q),predictStructures(q));
  assert.equal(h.adapterCalls,1);assert.equal(h.compute.state,'active');
  assert.equal(h.calls.filter(c=>c[0]==='dispatch').length,9);
  assert.ok(h.devices[0].buffers.every(b=>b.destroyed));
  h.compute.setEnabled(false);assert.equal(h.devices[0].destroyed,true);
  assert.equal(h.compute.verified.size,0);assert.equal(h.compute.state,'off');
});
test('unavailable, compile, mapping, limits, validation and numeric errors fall back without repeated retries',async()=>{
  for(const options of [{unavailable:true},{compileFailure:true},{mapFailure:true},{lowLimit:true},{validationError:true},{corrupt:true},{corrupt:true,invalid:true}]) {
    const h=harness(options);h.compute.setEnabled(true);
    assert.equal(await h.compute.sampleEnd(endQuery),null);
    await h.compute.ready();
    assert.deepEqual(await h.compute.structures(mineQuery),predictStructures(mineQuery));
    assert.equal(h.adapterCalls,1);
    assert.ok(['unavailable','failed'].includes(h.compute.state));
    assert.ok(h.devices.every(d=>d.destroyed&&d.buffers.every(b=>b.destroyed)));
  }
});
test('device loss falls back and explicit retry creates and validates a new device',async()=>{
  const h=harness();h.compute.setEnabled(true);await h.compute.ready();await h.compute.sampleEnd(endQuery);
  h.devices[0].lose();await Promise.resolve();assert.equal(h.compute.state,'lost');
  assert.deepEqual(await h.compute.structures(mineQuery),predictStructures(mineQuery));
  h.compute.setEnabled(true);await h.compute.ready();assert.deepEqual(await h.compute.sampleEnd(endQuery),sampleBiomes(endQuery));
  assert.equal(h.adapterCalls,2);
});
test('cancellation and changing acceleration during a read cannot return stale GPU output',async()=>{
  const options={},h=harness(options);h.compute.setEnabled(true);await h.compute.ready();await h.compute.sampleEnd(endQuery);
  let resume;options.onMap=()=>new Promise(r=>resume=r);
  const controller=new AbortController(),pending=h.compute.sampleEnd(endQuery,{signal:controller.signal});
  await new Promise(r=>setImmediate(r));controller.abort();resume();await assert.rejects(pending,/CANCELLED/);
  assert.equal(h.compute.state,'active');
  const changed=h.compute.sampleEnd(endQuery);await new Promise(r=>setImmediate(r));
  h.compute.setEnabled(false);resume();assert.equal(await changed,null);assert.equal(h.compute.state,'off');
  assert.ok(h.devices[0].buffers.every(b=>b.destroyed));
});
test('first real query mismatch discards GPU data and disables compute',async()=>{
  const options={},h=harness(options);h.compute.setEnabled(true);assert.equal(await h.compute.ready(),true);
  options.corrupt=true;
  assert.deepEqual(await h.compute.structures(mineQuery),predictStructures(mineQuery));
  assert.equal(h.compute.state,'failed');assert.ok(h.devices[0].destroyed);
});
test('mode preference persists independently; worker mode changes neither reset nor cancel pending queries',async()=>{
  const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  writeGpuPreference(storage,'aggressive');assert.equal(readGpuPreference(storage),'aggressive');
  const messages=[],states=[],worker={postMessage:m=>messages.push(m)},client=new WorkerClient(()=>worker);
  client.onGpuComputeStatus=s=>states.push(s);
  const pending=client.request('predictStructures',mineQuery),query=messages.at(-1);
  client.setGpuCompute(true);const first=messages.at(-1);client.setGpuCompute(false);
  worker.onmessage({data:{type:'gpuCompute',revision:first.revision,state:'active'}});
  worker.onmessage({data:{type:'gpuCompute',revision:client.computeRevision,state:'off'}});
  assert.deepEqual(states,['off']);assert.equal(client.pending.size,1);assert.equal(client.epoch,0);
  worker.onmessage({data:{...query,result:[]}});assert.deepEqual(await pending,[]);
  assert.equal(messages.some(m=>m.action==='reset'||m.action==='cancel'),false);
});

test('Forge GPU arithmetic and marker boundaries match CPU across seeds, dimensions and configured chances',()=>{
  for(const seed of ['0','-17','9223372036854775807','-9223372036854775808'])
    for(const dimension of ['overworld','nether'])
      for(const [x,z] of [[-517,219],[29998000,-30000000],[-30000000,29998000]])
        for(const [rarity,chance] of [[1,1],[2,8],[37,19],[8000,140],[1073741825,2147483647]]) {
          const q={seed,dimension,bounds:{minX:x,minZ:z,maxX:x+511,maxZ:z+513},config:{modStructures:{slimeOverworldEnabled:true,slimeNetherEnabled:true,netherSpiresEnabled:true,slimeRarity:rarity,netherSpireChance:chance}}};
          const plan=forgePlan(q),values=interpret('forge',plan.params,plan.input);
          assert.ok(values.every(v=>validComputeValue('forge',v)));assert.deepEqual(values,plan.reference());
          const markers=plan.markers(values);assert.deepEqual([...markers.slime,...markers.spires],predictModStructures(q));
        }
  assert.equal(forgePlan({...mineQuery,config:{}}),null);
  for(const value of [4294967295,256,4,2|(6<<2),2|(6<<5)])assert.equal(validComputeValue('forge',value),false);
});
test('maximum level enables Forge kernels and smaller batches; all other markers retain CPU ordering',async()=>{
  const h=harness();h.compute.setEnabled(true);
  const small={...endQuery,width:16,height:16};assert.equal(await h.compute.sampleEnd(small),null);
  h.compute.setLevel(4);await h.compute.ready();assert.deepEqual(await h.compute.sampleEnd(small),sampleBiomes(small));
  const config={modStructures:{slimeOverworldEnabled:true,slimeNetherEnabled:true,netherSpiresEnabled:true,slimeRarity:8,netherSpireChance:19,lootGamesEnabled:true,meteoritesEnabled:true}};
  for(const dimension of ['overworld','nether']) {
    const q={...mineQuery,dimension,config};assert.deepEqual(await h.compute.structures(q),predictStructures(q));
  }
  assert.ok(h.compute.verified.has('forge'));assert.equal(h.compute.minSamples,256);
  h.compute.setLevel(3);assert.equal(h.compute.minSamples,1024);
  const q={...mineQuery,dimension:'nether',config};
  const before=h.calls.length;assert.deepEqual(await h.compute.structures(q),predictStructures(q));assert.equal(h.calls.length,before);
});

test('pending GPU initialization never holds CPU fallback or a new world query',async()=>{
  let resume,adapters=0;
  const compute=new GpuCompute({getGpu:()=>({requestAdapter:()=>{adapters++;return new Promise(r=>resume=r);}})});
  compute.setLevel(4);
  const controller=new AbortController();
  const first=compute.sampleEnd(endQuery,{signal:controller.signal});controller.abort();
  assert.equal(await first,null);
  assert.equal(await compute.sampleEnd({...endQuery,seed:'-17'}),null);
  assert.deepEqual(await compute.structures(mineQuery),predictStructures(mineQuery));
  assert.equal(adapters,1);assert.equal(compute.state,'starting');
  const initialization=compute.ready();compute.setLevel(0);resume(null);await initialization;
  assert.equal(compute.state,'off');
});

test('obsolete device self-tests cannot dispatch into the next GPU generation',async()=>{
  const options={},h=harness(options);h.compute.setLevel(4);
  let resume;options.onMap=()=>new Promise(r=>resume=r);
  const old=h.compute.ready();await new Promise(setImmediate);
  assert.equal(h.calls.length,1);
  h.compute.setLevel(3);options.onMap=null;
  assert.equal(await h.compute.ready(),true);const dispatches=h.calls.length;
  resume();assert.equal(await old,false);
  assert.equal(h.calls.length,dispatches);assert.equal(h.compute.state,'ready');
  assert.deepEqual(await h.compute.sampleEnd(endQuery),sampleBiomes(endQuery));h.compute.setLevel(0);
});
