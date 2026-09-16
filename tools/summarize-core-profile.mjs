import {readFile,writeFile,readdir} from 'node:fs/promises';
const output=new URL('../.test-work/cpu-profile-2026-09-15/',import.meta.url);
const summaries=[],charts=[];
for(const file of (await readdir(output)).filter(f=>f.endsWith('.cpuprofile'))) {
  const id=file.replace('.cpuprofile',''),profile=JSON.parse(await readFile(new URL(file,output),'utf8'));
  const run=JSON.parse(await readFile(new URL(id+'.json',output),'utf8'));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();
  for(const node of nodes.values())for(const child of node.children||[])parents.set(child,node.id);
  const totals=new Map(),self=new Map();let idleUs=0,totalUs=0,gcUs=0;
  const label=n=>({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber+1});
  const key=n=>JSON.stringify(label(n));
  const leafWeights=new Map();
  for(let i=0;i<profile.samples.length;i++) {
    const node=nodes.get(profile.samples[i]),weight=profile.timeDeltas[i];totalUs+=weight;
    if(node.callFrame.functionName==='(idle)'){idleUs+=weight;continue;}
    if(node.callFrame.functionName==='(garbage collector)')gcUs+=weight;
    leafWeights.set(node.id,(leafWeights.get(node.id)||0)+weight);
    self.set(key(node),(self.get(key(node))||0)+weight);
    const seen=new Set();let cursor=node;
    while(cursor) {const k=key(cursor);if(!seen.has(k)){seen.add(k);totals.set(k,(totals.get(k)||0)+weight);}cursor=nodes.get(parents.get(cursor.id));}
  }
  const active=totalUs-idleUs;
  const top=source=>[...source.entries()].map(([k,us])=>({...JSON.parse(k),sampleMs:us/1000,percent:100*us/active})).sort((a,b)=>b.sampleMs-a.sampleMs).slice(0,35);
  function tree(id) {
    const n=nodes.get(id),children=(n.children||[]).map(tree).filter(c=>c.value>0).sort((a,b)=>b.value-a.value);
    return {...label(n),self:leafWeights.get(id)||0,value:(leafWeights.get(id)||0)+children.reduce((sum,c)=>sum+c.value,0),children};
  }
  const summary={id,queries:run.rows.length,wallMs:run.wallMs,medianQueryMs:run.rows.map(r=>r.ms).sort((a,b)=>a-b)[Math.floor(run.rows.length/2)],
    repeatMedianMs:[...run.repeatMs].sort((a,b)=>a-b)[10],samples:profile.samples.length,sampledMs:totalUs/1000,idlePercent:100*idleUs/totalUs,gcActivePercent:100*gcUs/active,
    self:top(self),inclusive:top(totals)};
  summaries.push(summary);charts.push({...summary,tree:tree(profile.nodes[0].id)});
  console.log(JSON.stringify({id,medianMs:Math.round(summary.medianQueryMs),gcPercent:Math.round(summary.gcActivePercent*10)/10,topFunction:summary.self[0].name}));
}
await writeFile(new URL('summary.json',output),JSON.stringify(summaries,null,2));
const template=await readFile(new URL('./profile-viewer.html',import.meta.url),'utf8');
let parallel=[];try{parallel=JSON.parse(await readFile(new URL('parallel-efficiency.json',output),'utf8')).results;}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(new URL('flamegraphs.html',output),template.replace('/*PROFILE_DATA*/[]',JSON.stringify(charts).replaceAll('<','\\u003c')).replace('/*PARALLEL_DATA*/[]',JSON.stringify(parallel)));
