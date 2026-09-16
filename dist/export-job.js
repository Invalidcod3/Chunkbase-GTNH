import {validateBounds} from './engine/native.js';

export function exportBounds(mode,coordinates,current) {
  if(mode!=='custom')return {...current};
  const b=Object.fromEntries(['minX','minZ','maxX','maxZ'].map((k,i)=>[k,Number(coordinates[i])]));
  if(coordinates.some(v=>String(v).trim()===''))throw new Error('请填写完整导出范围');
  validateBounds(b,3600000000000000);return b;
}
// One independent export; aborting it never resets map providers or their caches.
export class ExportJob {
  constructor(update=()=>{}){this.update=update;this.active=null;}
  begin(){
    if(this.active)throw new Error('已有导出任务正在执行');
    const controller=new AbortController();this.active=controller;this.update(true,{scanned:0,total:0});return controller;
  }
  cancel(){this.active?.abort();}
  progress(p){if(this.active&&!this.active.signal.aborted)this.update(true,p);}
  finish(controller){if(this.active===controller){this.active=null;this.update(false);}}
}
