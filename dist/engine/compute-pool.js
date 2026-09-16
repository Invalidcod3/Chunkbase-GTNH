import {WorkerClient} from './worker-client.js';
import {deviceHints} from '../device-budget.js';
import {normalizeParallelism,parallelismBudget} from '../gpu-settings.js';
import {normalizeAllocation,refinementWorkers,nextAllocatedWork} from '../compute-allocation.js';

// Each client has its own Worker/module graph, Java state and existing caches.
// Workers serialize their own requests; never parallelize one mutable engine.
export class ComputePool {
  constructor(createClient=({primary})=>new WorkerClient(undefined,{startupTimeoutMs:primary?0:15000,waitForReady:true}),{getHints=deviceHints,now=()=>performance.now(),idleTimeoutMs=60000}={}) {
    if(!Number.isFinite(idleTimeoutMs)||idleTimeoutMs<1000)throw Error('Invalid idle worker timeout');
    this.idleTimeoutMs=idleTimeoutMs;this.idleSince=new WeakMap();
    this.allocation=0;
    Object.assign(this,{createClient,getHints,now,clients:[],states:new Map(),queue:[],jobs:new Set(),running:new Map(),costs:new Map(),startupMs:0,parallelism:1,computeLevel:0,epoch:0,adaptiveLimit:Infinity,reason:null,handledFailures:new WeakSet()});
    this.addClient();
  }
  get effectiveParallelism(){return Math.min(this.parallelism,this.adaptiveLimit,parallelismBudget(this.getHints()));}
  addClient() {
    // Slow pack loading must not destroy the only engine. Auxiliary startup
    // still has a deadline, since healthy workers can take over its work.
    const started=this.now(),client=this.createClient({primary:!this.clients.some(c=>!c.failure&&!c.closed)});this.clients.push(client);
    client.onGpuComputeStatus=state=>{
      if(!this.clients.includes(client))return;
      this.states.set(client,state);this.reportStatus();
    };
    client.onReady=()=>{if(this.clients.includes(client)){
      this.startupMs=Math.max(this.startupMs,this.now()-started);this.idleSince.set(client,this.now());this.reportCapacity();this.pump();this.scheduleIdleTrim();
    }};
    client.onFailure=error=>this.workerFailed(client,error);
    try {if(this.computeLevel)client.setGpuCompute(this.computeLevel);}
    catch(error){this.clients.pop();this.states.delete(client);client.close();throw error;}
    return client;
  }
  reportCapacity() {
    if(this.closed)return;
    const healthy=this.clients.filter(c=>!c.failure&&!c.closed),budget=parallelismBudget(this.getHints());
    this.onParallelismStatus?.({requested:this.parallelism,effective:this.effectiveParallelism,
      started:healthy.length,ready:healthy.filter(c=>c.isReady!==false).length,
      draining:Math.max(0,healthy.length-this.effectiveParallelism),
      allocation:this.allocation,refinement:refinementWorkers(Math.max(1,Math.min(healthy.filter(c=>c.isReady!==false).length,this.effectiveParallelism)),this.allocation),
      reason:this.reason||(budget<this.parallelism?'device':null)});
  }
  constrain(reason) {
    this.adaptiveLimit=Math.min(this.adaptiveLimit,Math.max(1,this.clients.filter(c=>!c.failure&&!c.closed).length));
    this.reason=reason;this.retire();this.reportStatus();
  }
  workerFailed(client,error) {
    if(!this.clients.includes(client)||this.handledFailures.has(client))return;
    this.handledFailures.add(client);
    this.constrain(error?.message==='WORKER_STARTUP_TIMEOUT'?'timeout':'worker');
    // Let rejected in-flight requests rejoin the queue before redispatching.
    queueMicrotask(()=>this.pump());
  }
  reportStatus() {
    const values=this.clients.filter(c=>!c.failure).slice(0,this.effectiveParallelism).map(c=>this.states.get(c)||'idle');
    const failed=values.filter(v=>['failed','unavailable','lost'].includes(v));
    const working=['active','ready','starting'].find(state=>values.includes(state));
    this.onGpuComputeStatus?.(!this.computeLevel?'off':failed.length&&working?'partial':working||failed[0]||'idle');
    this.reportCapacity();
  }
  setParallelism(value) {
    this.parallelism=normalizeParallelism(value);this.retire();this.reportStatus();this.pump();
  }
  setAllocation(value) {this.allocation=normalizeAllocation(value);this.reportCapacity();this.pump();}
  setPaused(paused) {
    this.paused=!!paused;
    if(!this.paused){this.retire();this.reportCapacity();this.pump();}
    else this.trimIdleWorkers();
  }
  retryCapacity() {
    if(this.closed)return;
    this.adaptiveLimit=Infinity;this.reason=null;
    if(!this.clients.some(c=>!c.failure&&!c.closed))try{this.addClient();}catch{this.constrain('startup');return;}
    this.reportStatus();this.pump();
  }
  retire() {
    let retained=0;
    this.clients=this.clients.filter(c=>{
      if(c.failure||retained++>=this.effectiveParallelism) {
        if(!c.pending.size){this.states.delete(c);c.close();return false;}
      }
      return true;
    });
  }
  scheduleIdleTrim() {
    clearTimeout(this.idleTimer);
    if(this.closed)return;
    const idle=this.clients.slice(1).filter(c=>c.isReady!==false&&!c.pending.size&&!this.running.has(c)&&this.idleSince.has(c));
    if(!idle.length)return;
    const delay=Math.max(1000,Math.min(...idle.map(c=>this.idleTimeoutMs-(this.now()-this.idleSince.get(c)))));
    this.idleTimer=setTimeout(()=>this.trimIdleWorkers(),delay);this.idleTimer.unref?.();
  }
  trimIdleWorkers() {
    // Keep the primary module graph and its warm caches. Idle auxiliary graphs
    // can be recreated on demand without changing the user's requested limit.
    if(this.paused||!this.queue.some(job=>!job.done))this.clients=this.clients.filter((c,index)=>{
      if(index&&!c.pending.size&&!this.running.has(c)&&(this.paused||
        (c.isReady!==false&&this.idleSince.has(c)&&this.now()-this.idleSince.get(c)>=this.idleTimeoutMs))){
        this.states.delete(c);c.close();return false;
      }
      return true;
    });
    this.reportStatus();this.scheduleIdleTrim();
  }
  setGpuCompute(value) {
    this.computeLevel=value===true?3:[3,4].includes(value)?value:0;
    for(const c of [...this.clients])if(!c.failure){this.states.set(c,this.computeLevel?'idle':'off');
      try{c.setGpuCompute(this.computeLevel);}catch(error){c.fail(error);}}
    this.reportStatus();
  }
  reset() {
    this.epoch++;for(const job of this.jobs)this.finish(job,new Error('CANCELLED'));
    this.queue=[];for(const c of this.clients)c.reset();this.retire();this.reportCapacity();
  }
  async request(action,query,options={}) {
    if(this.closed)throw new Error('CANCELLED');
    if(options.signal?.aborted)throw new Error('CANCELLED');
    // Recovery must reach every loaded module graph, including draining ones.
    if(action==='retryPacks') {
      if(!this.clients.some(c=>!c.failure&&!c.closed))this.retryCapacity();
      const clients=this.clients.filter(c=>!c.failure&&!c.closed);
      if(!clients.length)throw new Error('无法重建计算线程，请重试或刷新页面');
      try {
        const results=await Promise.all(clients.map(c=>c.request(action,query,options)));
        return [...new Map(results.flat().map(e=>[e.id,e])).values()];
      } finally {this.retire();this.reportCapacity();this.pump();}
    }
    const key=[action,query.seed,query.dimension,Math.floor((query.x??query.bounds?.minX??0)/512),Math.floor((query.z??query.bounds?.minZ??0)/512)].join('/');
    let hash=0;for(const c of key)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
    return new Promise((resolve,reject)=>{
      const job={action,query,options,hash,epoch:this.epoch,resolve,reject,priority:[0,1,2].includes(options.priority)?options.priority:2};
      job.workClass=action==='sampleBiomes'&&options.workClass==='refine'?'refine':'coverage';
      job.abort=()=>{this.finish(job,new Error('CANCELLED'));this.pump();};
      options.signal?.addEventListener('abort',job.abort,{once:true});
      this.jobs.add(job);this.queue.push(job);this.pump();
    });
  }
  finish(job,error,result) {
    if(job.done)return;
    job.done=true;this.jobs.delete(job);job.options.signal?.removeEventListener('abort',job.abort);
    if(error)job.reject(error);else job.resolve(result);
  }
  worthStarting(readyCount) {
    let work=0;
    for(const job of this.queue) {
      const cost=this.costs.get(`${job.action}/${job.query.dimension}`);
      if(cost===undefined)return true; // Permit gradual discovery for a new workload.
      work+=cost;
    }
    // Expansion must have a chance to help before warm workers drain the queue.
    // Never retire warm caches merely because the current batch is cheap.
    return work/Math.max(1,readyCount)>this.startupMs;
  }
  pump() {
    if(this.closed||this.paused||this.pumping)return;
    this.pumping=true;
    try {
      this.queue=this.queue.filter(job=>!job.done).sort((a,b)=>a.priority-b.priority);
      while(this.queue.length) {
        const candidates=this.clients.filter(c=>!c.failure&&!c.closed).slice(0,this.effectiveParallelism);
        if(!candidates.length){for(const job of this.queue)this.finish(job,new Error('没有可用的计算线程，请刷新页面'));this.queue=[];break;}
        const idle=candidates.filter(c=>c.isReady!==false&&!c.pending.size&&!this.running.has(c));
        if(idle.length) {
          const index=nextAllocatedWork(this.queue,[...this.running.values()],Math.max(1,candidates.filter(c=>c.isReady!==false).length),this.allocation);
          const [job]=this.queue.splice(index,1),preferred=candidates[job.hash%candidates.length];
          const client=idle.includes(preferred)?preferred:idle[0];
          this.idleSince.delete(client);
          this.running.set(client,job);void this.execute(client,job);continue;
        }
        // Keep unassigned work here: a ready worker can take it immediately,
        // instead of waiting behind another worker's initialization or job.
        if(candidates.length<this.effectiveParallelism&&candidates.every(c=>c.isReady!==false)&&this.worthStarting(candidates.length)) {
          try{this.addClient();this.reportCapacity();continue;}
          catch{this.constrain('startup');}
        }
        break;
      }
    } finally {this.pumping=false;}
  }
  async execute(client,job) {
    const started=this.now();
    try {
      const result=await client.request(job.action,job.query,job.options);
      if(!job.done) {
        const key=`${job.action}/${job.query.dimension}`,elapsed=Math.max(0,this.now()-started),previous=this.costs.get(key);
        this.costs.set(key,previous===undefined?elapsed:(previous+elapsed)/2);
        if(this.costs.size>256)this.costs.delete(this.costs.keys().next().value);
      }
      this.finish(job,null,result);
    }
    catch(error) {
      if(client.failure&&!job.done&&job.epoch===this.epoch&&!job.options.signal?.aborted&&!this.closed) {
        this.workerFailed(client,error);this.queue.push(job);
      } else this.finish(job,error);
    } finally {
      this.running.delete(client);this.idleSince.set(client,this.now());this.retire();this.reportCapacity();this.pump();
      if(this.paused)this.trimIdleWorkers();else this.scheduleIdleTrim();
    }
  }
  close() {
    clearTimeout(this.idleTimer);
    this.closed=true;this.epoch++;for(const job of this.jobs)this.finish(job,new Error('CANCELLED'));
    this.queue=[];const clients=this.clients;this.clients=[];this.states.clear();for(const c of clients)c?.close();
  }
}
