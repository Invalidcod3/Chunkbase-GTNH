import {computeShader, endPlan, mineshaftPlan, mineshaftRejectionPlan,forgePlan,validComputeValue} from './gpu-compute-plans.js';
import {predictStructures} from './native.js';
import {biomeRegistry, legacyDisplayKeys} from './catalog.js';

const check=signal=>{if(signal?.aborted)throw new Error('CANCELLED');};
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const deadline=async(promise,ms=10000)=>{
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('GPU timeout')),ms);})]);}
  finally{clearTimeout(timer);}
};
// Separate, disposable compute resources. No provider cache or world settings
// are stored here; all outputs return through the existing Worker protocol.
export class GpuCompute {
  constructor({getGpu=()=>globalThis.navigator?.gpu,onStatus=()=>{}}={}) {
    Object.assign(this,{getGpu,onStatus,enabled:false,level:0,generation:0,state:'off',verified:new Set()});
  }
  status(state) {this.state=state;this.onStatus(state);}
  setEnabled(enabled) {
    this.setLevel(enabled?3:0);
  }
  setLevel(level) {
    this.level=[3,4].includes(level)?level:0;
    const enabled=this.level>=3;
    this.generation++;this.release();this.enabled=enabled;
    this.status(enabled?'idle':'off');
  }
  get minSamples(){return this.level===4?256:1024;}
  release() {
    const d=this.device;this.device=null;this.initializing=null;this.pipelines=null;this.verified.clear();d?.destroy();
  }
  fail(state='failed') {this.generation++;this.release();this.status(state);}
  async ready() {
    if(!this.enabled||['unavailable','failed','lost'].includes(this.state))return false;
    if(this.initializing)return this.initializing;
    if(this.device)return true;
    const generation=this.generation;
    this.initializing=(async()=>{
      this.status('starting');
      try {
        const gpu=this.getGpu();
        if(!gpu){this.status('unavailable');return false;}
        const adapter=await deadline(gpu.requestAdapter({powerPreference:'high-performance'}));
        if(generation!==this.generation)return false;
        if(!adapter){this.status('unavailable');return false;}
        // Destroy a late device as well if the mode changed or creation timed out.
        const creation=adapter.requestDevice();
        creation.then(d=>{if(generation!==this.generation)d.destroy();},()=>{});
        const device=await deadline(creation);
        if(generation!==this.generation){device.destroy();return false;}
        this.device=device;
        device.lost.then(()=>{if(this.device===device)this.fail('lost');});
        device.addEventListener('uncapturederror',()=>{if(this.device===device)this.fail();});
        const module=device.createShaderModule({code:computeShader});
        const kernels=this.level===4?['end','mineshafts','forge']:['end','mineshafts'];
        const pipelines=Object.fromEntries(await deadline(Promise.all(kernels.map(async entryPoint=>[
          entryPoint,await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}}),
        ]))));
        if(generation!==this.generation)return false;
        this.pipelines=pipelines;
        // Real device checks: positive/negative coordinates, circle boundaries,
        // world edges and both signed-64-bit seed extremes, including RNG hits.
        for(const q of [
          {seed:'0',x:-1073,z:-1043,width:67,height:69,step:31},
          {seed:'9223372036854775807',x:-7169,z:2047,width:65,height:67,step:17},
          {seed:'-9223372036854775808',x:29996000,z:-30000000,width:31,height:29,step:127},
        ]) {
          if(generation!==this.generation)return false;
          const plan=endPlan({...q,dimension:'end'});
          if(!same(await this.dispatch(plan),plan.reference()))throw new Error('GPU End mismatch');
        }
        for(const [seed,x,z] of [['0',-512,-512],['9223372036854775807',29998000,-30000000],['-9223372036854775808',-30000000,29998000]]) {
          if(generation!==this.generation)return false;
          const plan=mineshaftPlan({seed,dimension:'overworld',bounds:{minX:x,minZ:z,maxX:x+1024,maxZ:z+1024}});
          if(!same(await this.dispatch(plan),plan.reference()))throw new Error('GPU RNG mismatch');
        }
        if(generation!==this.generation)return false;
        const rejection=mineshaftRejectionPlan();
        if(!same(await this.dispatch(rejection),rejection.reference()))throw new Error('GPU rejection mismatch');
        if(this.level===4)for(const [seed,x,z,rarity,chance] of [
          ['-9223372036854775808',-517,219,37,19],['9223372036854775807',29998000,-30000000,1,8],['0',-30000000,29998000,1073741825,2147483647],
        ]) {
          if(generation!==this.generation)return false;
          const plan=forgePlan({seed,dimension:'nether',bounds:{minX:x,minZ:z,maxX:x+512,maxZ:z+512},
            config:{modStructures:{slimeNetherEnabled:true,netherSpiresEnabled:true,slimeRarity:rarity,netherSpireChance:chance}}});
          if(!same(await this.dispatch(plan),plan.reference()))throw new Error('GPU Forge mismatch');
        }
        if(generation!==this.generation)return false;
        this.status('ready');return true;
      } catch {
        if(generation===this.generation)this.fail();
        return false;
      }
    })();
    return this.initializing;
  }
  async dispatch(plan) {
    const d=this.device,pipeline=this.pipelines?.[plan.kernel];
    if(!d||!pipeline)throw new Error('GPU not ready');
    const bytes=plan.count*4,buffers=[];
    // WebGPU usage flags: MAP_READ=1, COPY_SRC=4, COPY_DST=8, STORAGE=128.
    const buffer=(size,usage)=>{const b=d.createBuffer({size,usage});buffers.push(b);return b;};
    d.pushErrorScope('out-of-memory');d.pushErrorScope('internal');d.pushErrorScope('validation');
    try {
      if(Math.max(bytes,plan.input.byteLength,plan.params.byteLength)>Math.min(d.limits.maxBufferSize,d.limits.maxStorageBufferBindingSize)
        ||Math.ceil(plan.count/64)>d.limits.maxComputeWorkgroupsPerDimension)throw new Error('GPU limits');
      const params=buffer(plan.params.byteLength,136),input=buffer(plan.input.byteLength,136),output=buffer(bytes,132),read=buffer(bytes,9);
      d.queue.writeBuffer(params,0,plan.params);d.queue.writeBuffer(input,0,plan.input);
      const entries=[params,input,output].map((b,binding)=>({binding,resource:{buffer:b}})).filter(e=>plan.kernel==='end'||e.binding!==1);
      const bind=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries});
      const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();
      pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(plan.count/64));pass.end();
      encoder.copyBufferToBuffer(output,0,read,0,bytes);d.queue.submit([encoder.finish()]);
      await deadline(read.mapAsync(1));
      const values=new Uint32Array(read.getMappedRange()).slice();read.unmap();
      if(values.length!==plan.count||values.some(v=>!validComputeValue(plan.kernel,v)))throw new Error('Invalid GPU output');
      return values;
    } finally {
      for(const b of buffers)b.destroy();
      const errors=await Promise.all([d.popErrorScope(),d.popErrorScope(),d.popErrorScope()]);
      if(errors.some(Boolean))throw new Error('GPU dispatch failed');
    }
  }
  async run(plan,{signal}={}) {
    check(signal);
    if(!plan||!this.enabled||plan.count<this.minSamples)return null;
    const generation=this.generation;
    // Prewarm independently. CPU handles this query while the adapter,
    // pipelines and device self-tests are pending, so cancelled initialization
    // cannot hold the Worker's serial engine queue or delay another dimension.
    if(!['ready','active'].includes(this.state)){void this.ready();return null;}
    check(signal);
    if(generation!==this.generation)return null;
    try {
      const data=await this.dispatch(plan);check(signal);
      if(generation!==this.generation)return null;
      if(!this.verified.has(plan.kernel)) {
        if(!same(data,plan.reference()))throw new Error('GPU query mismatch');
        this.verified.add(plan.kernel);
      }
      this.status('active');return data;
    } catch(error) {
      check(signal);
      if(generation===this.generation)this.fail();
      return null;
    }
  }
  async sampleEnd(q,options) {
    if(!this.enabled||q.width*q.height<this.minSamples||['unavailable','failed','lost'].includes(this.state))return null;
    const data=await this.run(endPlan(q),options);
    return data===null?null:Uint16Array.from(data,id=>biomeRegistry.get(legacyDisplayKeys[id]).index);
  }
  async structures(q,options) {
    if(this.enabled) {
      const plan=mineshaftPlan(q),data=await this.run(plan,options);
      const modPlan=this.level===4?forgePlan(q):null,modData=await this.run(modPlan,options);
      if(data!==null||modData!==null) {
        // Use the unchanged native implementation for every other structure.
        // Append at the original mineshaft position, before RWG villages.
        check(options?.signal);
        const query=data===null?q:{...q,config:{...q.config,mineshaftsEnabled:false}};
        const result=predictStructures(query,{modCandidates:modData===null?undefined:modPlan.markers(modData)});
        if(data!==null)result.push(...plan.markers(data));return result;
      }
    }
    check(options?.signal);return predictStructures(q);
  }
}
export const gpuCompute=new GpuCompute();
