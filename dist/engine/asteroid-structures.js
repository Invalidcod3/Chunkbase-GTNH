import {JavaRandom,long} from './random.js';

// Mirrors the desktop's GC4-compatible logical starts; not generated bases in GC 1.7.10.
export async function asteroidStructures(q,{engine,pointRandom,signal,yieldTask,now}) {
  const b=q.bounds,seed=BigInt(q.seed),result=[],excluded=new Set(q.excludedKinds||[]);
  const inside=(x,z)=>x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ;
  const check=()=>{if(signal?.aborted)throw new Error('CANCELLED');};check();
  if(!excluded.has('HOLLOW_ASTEROID')){
    if((b.maxX-b.minX)*(b.maxZ-b.minZ)>1048576)throw new Error('小行星查询过大，请分批扫描');
    let deadline=now()+16;
    for(let z=b.minZ+(b.minZ&1);z<b.maxZ;z+=2){
      for(let x=b.minX+(b.minX&1);x<b.maxX;x+=2){
        if(pointRandom(x,z)>=Math.fround(Math.fround(engine.density(x,z)+Math.fround(.4))/800))continue;
        const r=new JavaRandom(BigInt((x+Math.imul(z,3067))|0));r.nextInt(160);const size=r.nextInt(20)+5;
        r.nextDouble();if(r.nextInt(2)===0)r.nextInt(6);r.nextFloat();
        if(r.nextInt(10)===0&&size>=15)result.push({kind:'HOLLOW_ASTEROID',subtype:'',x,z,source:'Galacticraft',certainty:'POSSIBLE'});
      }
      if(now()>=deadline){await yieldTask();check();deadline=now()+16;}
    }
  }
  const world=new JavaRandom(seed),xm=world.nextLong(),zm=world.nextLong();
  for(let rz=Math.floor((b.minZ-8)/576);rz<=Math.floor((b.maxZ-9)/576);rz++)for(let rx=Math.floor((b.minX-8)/576);rx<=Math.floor((b.maxX-9)/576);rx++){
    const r=new JavaRandom(BigInt(rx)*341873128712n+BigInt(rz)*132897987541n+seed+10387340n+BigInt(q.dimensionId));
    const cx=rx*36+r.nextInt(36),cz=rz*36+r.nextInt(36),x=cx*16+8,z=cz*16+8;
    const type=new JavaRandom(long(BigInt(cx)*xm)^long(BigInt(cz)*zm)^seed);type.nextInt(5);
    const kind=['ASTEROID_BASE_HUMAN','ASTEROID_BASE_BIRD','ASTEROID_BASE_MECHANICAL'][type.nextInt(3)];
    if(!excluded.has(kind)&&inside(x,z))result.push({kind,subtype:'LOGICAL_START',x,z,source:'Galacticraft 4 compatibility',certainty:'POSSIBLE'});
  }
  check();return result;
}
