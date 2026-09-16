import {parseSeed} from './engine/random.js';
import {validateConfig} from './engine/config.js';
export function readPreferences(storage,key,dimensions){
  try{
    const p=JSON.parse(storage.getItem(key));if(p?.version!==1)return null;
    p.seed=parseSeed(p.seed);if(!dimensions.includes(p.dimension))return null;
    if(!['STRUCTURE','ORES','FLUID'].includes(p.markerMode))return null;
    if(![p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=29999000)||!Number.isFinite(p.level)||p.level< -40||p.level>24)return null;
    if(!Array.isArray(p.filtered)||p.filtered.length>512||p.filtered.some(v=>typeof v!=='string'||v.length>100))return null;
    if(!p.flags||!['showBiomes','showStructures','grid','inertia','smooth'].every(k=>typeof p.flags[k]==='boolean'))return null;
    const f=p.resourceFilter;
    const b=p.biomeSelection;
    if(b!==undefined && (!b || typeof b.enabled!=='boolean' || typeof b.defaultSelected!=='boolean' || !Array.isArray(b.exceptions) || b.exceptions.length>65535 || b.exceptions.some(k=>typeof k!=='string'||k.length>256)))return null;
    if(f?.excludedIds!==undefined && (!Array.isArray(f.excludedIds)||f.excludedIds.length>4096||f.excludedIds.some(id=>typeof id!=='string'||id.length>256)))return null;
    if(!f||typeof f.text!=='string'||f.text.length>512||typeof f.id!=='string'||f.id.length>256||![f.minimum,f.minY,f.maxY].every(Number.isInteger)||f.minimum<0||f.minimum>429496||f.minY<0||f.maxY>255||f.minY>f.maxY)return null;
    p.config=validateConfig(p.config);return p;
  }catch{return null;}
}
export function writePreferences(storage,key,p){try{storage.setItem(key,JSON.stringify({version:1,...p}));return true;}catch{return false;}}
