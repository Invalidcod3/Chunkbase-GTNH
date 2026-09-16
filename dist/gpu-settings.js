import {deviceBudget} from './device-budget.js';
export const GPU_MODES=['off','auto','on','aggressive','maximum'];
export function gpuModeAtLevel(value) {
  if(value===''||value===null||typeof value==='boolean')return 'off';
  const level=Number(value);return Number.isInteger(level)?GPU_MODES[level]||'off':'off';
}
export const gpuLevelForMode=mode=>Math.max(0,GPU_MODES.indexOf(mode));
export const gpuComputeLevel=mode=>gpuLevelForMode(mode)>=3?gpuLevelForMode(mode):0;
export const MAX_PARALLELISM=64;
export function normalizeParallelism(value) {
  const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=MAX_PARALLELISM?n:1;
}
export function readParallelism(storage) {
  try{return normalizeParallelism(storage.getItem('amidst-compute-parallelism-v1'));}catch{return 1;}
}
export function writeParallelism(storage,value) {
  try{storage.setItem('amidst-compute-parallelism-v1',String(normalizeParallelism(value)));return true;}catch{return false;}
}
export const parallelismBudget=hints=>deviceBudget(hints).workers;
export function readParallelismSelection(storage) {
  const threads=readParallelism(storage);
  try {
    const saved=storage.getItem('amidst-compute-custom-v1');
    return {level:storage.getItem('amidst-compute-selection-v1')==='custom'||threads>4?5:threads,
      custom:saved===null||saved===undefined?(threads>4?threads:8):normalizeParallelism(saved),threads};
  } catch{return {level:threads>4?5:threads,custom:threads>4?threads:8,threads};}
}
export function writeParallelismSelection(storage,level,custom) {
  const threads=level===5?normalizeParallelism(custom):normalizeParallelism(level);
  try {
    storage.setItem('amidst-compute-custom-v1',String(normalizeParallelism(custom)));
    storage.setItem('amidst-compute-selection-v1',level===5?'custom':'preset');
    return writeParallelism(storage,threads);
  }catch{return false;}
}
const PREF_KEY='amidst-gpu-rendering-v1';
export function readGpuPreference(storage) {
  try {const mode=storage.getItem(PREF_KEY);return GPU_MODES.includes(mode)?mode:'off';} catch {return 'off';}
}
export function writeGpuPreference(storage,mode) {
  if(!GPU_MODES.includes(mode))return false;
  try {storage.setItem(PREF_KEY,mode);return true;} catch {return false;}
}
