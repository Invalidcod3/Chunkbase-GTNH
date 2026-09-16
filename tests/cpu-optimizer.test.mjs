import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {optimizeGenerated,LONG_CREATE,CELL_ORIGINAL} from '../tools/cpu-optimizer.mjs';
test('constant folding preserves signed longs, dynamic calls, literals and comments',()=>{
  const source=`const ${LONG_CREATE};
  const a=Long_create(4294967295, 2147483647),b=Long_create(0, 2147483648),c=Long_create(-1,0);
  const text="Long_create(1,2)", template=\`Long_create(1,2)\`;
  // Long_create(1,2)
  /* Long_create(1,2) */
  const d=Long_create(Number('17'),2); globalThis.values=[a,b,c,d,text,template];`;
  const result=optimizeGenerated(source);assert.equal(result.constants,3);
  const before={},after={};vm.runInNewContext(source,before);vm.runInNewContext(result.source,after);
  assert.deepEqual([...after.values],[...before.values]);assert.ok(result.source.includes("Long_create(Number('17'),2)"));
  assert.ok(result.source.includes('// Long_create(1,2)'));assert.ok(result.source.includes('/* Long_create(1,2) */'));
});
test('changed runtime or CellNoise implementations fail closed instead of applying a stale adapter',()=>{
  assert.throws(()=>optimizeGenerated(LONG_CREATE.replace('64','63')),/Unreviewed/);
  assert.throws(()=>optimizeGenerated(LONG_CREATE+';'+CELL_ORIGINAL.replace('60493','60494'),{cellNoise:true}),/CellNoise source changed/);
  assert.throws(()=>optimizeGenerated(LONG_CREATE,{cellNoise:true}),/CellNoise source changed/);
});
test('CellNoise integer adapter matches a full signed-64-bit polynomial oracle',()=>{
  const result=optimizeGenerated('let '+LONG_CREATE+';let '+CELL_ORIGINAL,{cellNoise:true});
  const context={};vm.runInNewContext(result.source+'globalThis.noise=ru_CellNoise_valueNoise2D;',context);
  const long=n=>BigInt.asIntN(64,n),oracle=(x,z,seed)=>{
    const n=long(BigInt(((Math.imul(1619,x)+Math.imul(6971,z))|0))+long(1013n*seed))&2147483647n;
    const v=(n>>13n)^n;
    return 1-Number(long(long(v*long(long(long(v*v)*60493n)+19990303n))+1376312589n)&2147483647n)/1073741824;
  };
  let state=17;const next=()=>state=(Math.imul(state,1664525)+1013904223)|0;
  for(let i=0;i<50000;i++) {
    const x=next(),z=next(),seed=i<5?[0n,1n,-1n,9223372036854775807n,-9223372036854775808n][i]:long((BigInt(next())<<32n)|BigInt(next()>>>0));
    assert.equal(context.noise(x,z,seed),oracle(x,z,seed));
  }
});
