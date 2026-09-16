import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAsteroidResource,validateAsteroidResources,createFreshEndClassifier} from '../dist/engine/asteroid-resources.js';
import {createProspectingProvider} from '../dist/engine/prospecting.js';
import {createAsteroidProvider} from '../dist/engine/asteroids.js';
import {validateResources,resourceMatches,resourcePoints} from '../dist/engine/resources.js';
import {journeyMap,resourceCsv} from '../dist/export.js';
const display=small=>({id:small?'asteroid.small:ore.small.iron':'asteroid.vein:ore.mix.naquadah',name:'Iron',materials:'Iron',color:'#abcdef'});
const def={id:30,routing:'asteroids',config:{enabled:true,probability:100,minY:48,maxY:180,minRadius:3,maxRadius:15},materials:[{veins:[{weight:1,display:display(false)}],small:[{weight:1,display:display(true)}]}]};
const end={heeEnabled:true,chaosEnabled:false,chaosRadius:200,chaosSeparation:10000};
const ap={schemaVersion:1,algorithm:'galacticgreg-asteroid-resources',end,dimensions:[def,{...def,id:1,routing:'end'}]};
const profile={schemaVersion:1,orePattern:'EQUAL_SPACING',dimensions:[30,1].map(id=>({id,name:String(id),oreChance:100,ores:[{weight:1,display:'ordinary'}]})),ores:{ordinary:{id:'ore.mix.iron',name:'Iron',materials:'Iron',color:'#aabbcc',minY:20,maxY:80}}};
const q={seed:'0',dimension:'asteroids',mode:'ORES',bounds:{minX:-1024,minZ:-1024,maxX:1024,maxZ:1024}};
const provider=opts=>createProspectingProvider(profile,{asteroids:30,end:1},{asteroidProfile:ap,...opts});

test('asteroid coordinates, small branch and radius match independent desktop Java fixtures',()=>{
  for(const [seed,dim,cx,cz,small,x,y,z,radius] of [
    ['0',-30,0,0,false,14,63,8,13],['0',25,-17,22,true,-258,61,364,6],
    ['0',1,321,-321,false,5143,174,-5121,14],['0',200,-512,-1025,false,-8187,167,-16387,4],
    ['1',25,-17,22,true,-259,176,365,7],['-1',1,321,-321,false,5142,71,-5122,14],
    ['-9223372036854775808',-30,0,0,true,14,172,10,3],['-9223372036854775808',1,321,-321,true,5143,167,-5123,14],
    ['123456789012345',1,321,-321,false,5142,77,-5136,14],['123456789012345',200,-512,-1025,true,-8182,156,-16395,15],
  ]) {
    const d=selectAsteroidResource(BigInt(seed),dim,cx,cz,def);
    assert.deepEqual([d.kind==='ASTEROID_SMALL',d.x,d.y,d.z,d.size],[small,x,y,z,radius*2]);validateResources([d],'ORES');
  }
  const zero={...def,config:{...def.config,probability:0}};
  assert.ok(selectAsteroidResource(-588283n,0,0,0,zero));
  assert.equal(selectAsteroidResource(0n,30,0,0,{...def,config:{...def.config,enabled:false}}),null);
});
test('asteroid results scan every chunk, split cleanly and never substitute ordinary veins',async()=>{
  const p=provider(),all=await p.predictResources(q);assert.equal(all.length,128*128);
  assert.ok(all.some(d=>d.kind==='ASTEROID_SMALL'));assert.ok(all.every(d=>d.kind.startsWith('ASTEROID_')));
  const split=await Promise.all([-1,0].map((_,i)=>p.predictResources({...q,bounds:{...q.bounds,...(i?{minX:-7}:{maxX:-7})}})));
  const order=a=>a.sort((a,b)=>a.z-b.z||a.x-b.x);assert.deepEqual(order(split.flat()),order(all));
  validateResources(all,'ORES');
  await assert.rejects(createProspectingProvider(profile,{asteroids:30}).predictResources(q),/小行星/);
  await assert.rejects(p.predictResources({...q,config:{dimensionIds:{asteroids:31}}}),/ID/);
});
test('End routes island veins and void asteroids with explicit fresh-state certainty',async()=>{
  const p=provider(),result=await p.predictResources({...q,dimension:'end'});
  assert.ok(result.some(d=>d.kind==='ORE_VEIN'));assert.ok(result.some(d=>d.kind==='ASTEROID_VEIN'));
  const isVoid=createFreshEndClassifier(0n,end);
  for(const d of result){assert.equal(d.kind!=='ORE_VEIN',isVoid(Math.floor(d.x/16),Math.floor(d.z/16)));assert.equal(d.certainty,'EXACT_FRESH_END');}
  assert.equal(isVoid(0,0),false);assert.equal(isVoid(16,0),false);
  // Java's int multiplication overflows here; preserve the original routing contract.
  assert.equal(isVoid(65536,0),false);
  const legacy={schemaVersion:1,algorithm:'galacticgreg-current',enabled:true,probability:100,minY:48,maxY:180,materials:[[{name:'ore.mix.naquadah',weight:1}]],...end};
  const structures=await createAsteroidProvider(legacy,{resourceProfile:ap}).predictStructures({...q,dimension:'end'});
  const resources=new Map(result.filter(d=>d.kind==='ASTEROID_VEIN').map(d=>[`${d.x}:${d.z}`,d]));
  const asteroids=structures.filter(d=>d.kind==='END_NAQUADAH_ASTEROID');assert.ok(asteroids.length>0);
  for(const s of asteroids){const d=resources.get(`${s.x}:${s.z}`);assert.ok(d);assert.equal(s.y,d.y);assert.equal(s.size,d.size);}
});
test('asteroid validation, height filtering and exports retain clipped envelope and centre',async()=>{
  const d={...display(true),kind:'ASTEROID_SMALL',source:'PREDICTED',x:-258,z:364,y:250,size:12,minY:237,maxY:254,certainty:'EXACT_FRESH_END'};
  validateResources([d],'ORES');assert.ok(resourceMatches(d,{id:d.id,minY:249,maxY:251}));assert.ok(!resourceMatches(d,{minY:0,maxY:236}));
  const points=resourcePoints([d],{},{minX:-300,minZ:300,maxX:0,maxZ:400});assert.equal(points[0].certainty,'EXACT_FRESH_END');
  assert.match(resourceCsv(points,{seed:'0',dimension:'end',dimensionId:1}),/"250","12","237","254"/);
  async function wp(dim,seed='0',point=d){const b=new Uint8Array(await journeyMap([point],{seed,dimension:'end',dimensionId:dim},64).arrayBuffer()),v=new DataView(b.buffer),n=v.getUint16(26,true);return JSON.parse(new TextDecoder().decode(b.slice(30+n,30+n+v.getUint32(18,true))));}
  const a=await wp(1);assert.equal(a.y,250);assert.notEqual(a.id,(await wp(30)).id);assert.notEqual(a.id,(await wp(1,'1')).id);
  for(const bad of [{...d,y:256},{...d,size:3},{...d,minY:238},{...d,id:'ore.mix.iron'},{...d,depleted:true}])assert.throws(()=>validateResources([bad],'ORES'));
  assert.throws(()=>validateAsteroidResources({...ap,dimensions:[{...def,config:{...def.config,minRadius:0}}]}));
});
test('asteroid providers isolate profile changes and cancel cooperatively',async()=>{
  const input=structuredClone(ap),p=provider({asteroidProfile:input}),before=await p.predictResources(q);input.dimensions[0].materials=[];
  assert.deepEqual(await p.predictResources(q),before);
  const c=new AbortController();let time=0;
  await assert.rejects(provider({now:()=>time+=20,yieldTask:async()=>c.abort()}).predictResources(q,{signal:c.signal}),/CANCELLED/);
});
