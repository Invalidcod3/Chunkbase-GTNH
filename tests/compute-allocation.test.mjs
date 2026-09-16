import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAllocation,refinementWorkers,readAllocation,writeAllocation,nextAllocatedWork} from '../dist/compute-allocation.js';
test('allocation defaults to speed, persists independently and rejects invalid preferences',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  assert.equal(readAllocation(storage),0);assert.equal(writeAllocation(storage,73),true);assert.equal(readAllocation(storage),73);
  for(const value of [-1,101,1.5,null,true,'bad',''])assert.equal(normalizeAllocation(value),0);
  assert.equal(readAllocation({getItem(){throw Error();}}),0);assert.equal(writeAllocation({setItem(){throw Error();}},50),false);
});
test('every allocation reserves coverage and rounds proportionally across 1 to 64 workers',()=>{
  for(let workers=1;workers<=64;workers++) {
    let previous=0;
    for(let value=0;value<=100;value++) {
      const slots=refinementWorkers(workers,value);assert.ok(slots>=previous&&slots<workers);previous=slots;
    }
    assert.equal(refinementWorkers(workers,0),0);assert.equal(refinementWorkers(workers,100),workers-1);
  }
  assert.deepEqual([0,25,50,75,100].map(v=>refinementWorkers(4,v)),[0,1,2,3,3]);
});
test('single-class queues borrow capacity; one-worker mode and mixed queues always retain coverage',()=>{
  const refine={workClass:'refine'},coverage={workClass:'coverage'};
  assert.equal(nextAllocatedWork([refine,coverage],[],1,100),1);
  assert.equal(nextAllocatedWork([refine,coverage],[coverage,coverage],4,50),0);
  assert.equal(nextAllocatedWork([refine,coverage],[refine,refine],4,50),1);
  assert.equal(nextAllocatedWork([refine],[],4,0),0);
  assert.equal(nextAllocatedWork([coverage],[],4,100),0);
  assert.equal(nextAllocatedWork([],[],4,100),-1);
});
