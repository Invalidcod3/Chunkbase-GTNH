// Capability hints are approximate, never measurements of available memory.
// A primary coarse pointer is deliberately conservative, including tablets;
// touch-capable laptops with a primary mouse retain the desktop budget.
export function deviceHints() {
  const nav=globalThis.navigator;
  return {hardwareConcurrency:nav?.hardwareConcurrency,deviceMemory:nav?.deviceMemory,
    coarsePointer:globalThis.matchMedia?.('(pointer: coarse)').matches===true};
}
export function deviceBudget({hardwareConcurrency,deviceMemory,coarsePointer=false}={}) {
  const cores=Number.isInteger(hardwareConcurrency)&&hardwareConcurrency>0?hardwareConcurrency:null;
  const memory=Number.isFinite(deviceMemory)&&deviceMemory>0?deviceMemory:null;
  const low=(memory!==null&&memory<=2)||(cores!==null&&cores<=2);
  const conservative=low||coarsePointer||memory===null||memory<=4;
  return {
    workers:Math.min(64,cores===null?4:Math.max(1,cores-1),
      memory===null?4:memory<=2?2:memory<=4?4:64,coarsePointer?2:64),
    maxDpr:low?1:2,
    maxCanvasPixels:(low?2:conservative?4:8)*1024*1024,
    maxCanvasDimension:4096,
    historyBytes:(low?2:conservative?4:8)*1024*1024,
  };
}
export function canvasSize(width,height,dpr=1,hints={}) {
  const budget=deviceBudget(hints);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
    return {width:1,height:1,scaleX:1,scaleY:1};
  const requested=Number.isFinite(dpr)&&dpr>0?dpr:1;
  const ratio=Math.min(requested,budget.maxDpr,Math.sqrt(budget.maxCanvasPixels/width/height),
    budget.maxCanvasDimension/width,budget.maxCanvasDimension/height);
  const w=Math.max(1,Math.floor(width*ratio)),h=Math.max(1,Math.floor(height*ratio));
  return {width:w,height:h,scaleX:w/width,scaleY:h/height};
}
