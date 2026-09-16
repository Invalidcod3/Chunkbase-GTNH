const key='amidst-compute-allocation-v1';
export function normalizeAllocation(value) {
  if(value===null||typeof value==='boolean'||value==='')return 0;
  const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=100?n:0;
}
export function refinementWorkers(workers,balance) {
  const count=Number.isInteger(workers)&&workers>0?workers:1;
  return Math.min(count-1,Math.round(count*normalizeAllocation(balance)/100));
}
export function readAllocation(storage) {try{return normalizeAllocation(storage.getItem(key));}catch{return 0;}}
export function writeAllocation(storage,value) {try{storage.setItem(key,String(normalizeAllocation(value)));return true;}catch{return false;}}

// Both the map producer and the worker consumer use the same work classes.
// Reserve capacity while both classes have work; otherwise lend every slot.
// Existing work finishes normally when the slider or worker capacity changes.
export function nextAllocatedWork(queue,running,workers,balance) {
  if(!queue.length)return -1;
  if(!normalizeAllocation(balance))return 0; // Preserve the original speed policy.
  const quality=refinementWorkers(workers,balance),coverage=Math.max(1,workers-quality);
  const normalIndex=queue.findIndex(job=>job.workClass!=='refine'),refineIndex=queue.findIndex(job=>job.workClass==='refine');
  if(normalIndex<0)return refineIndex;if(refineIndex<0)return normalIndex;
  const busyCoverage=running.filter(job=>job.workClass!=='refine').length;
  const busyQuality=running.length-busyCoverage;
  if(busyCoverage<coverage||!quality)return normalIndex;
  if(busyQuality<quality)return refineIndex;
  return normalIndex;
}
