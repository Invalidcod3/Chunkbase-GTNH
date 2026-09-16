import {markerTypeKey,roguelikeTypes} from './engine/catalog.js';

const parent='ROGUELIKE_DUNGEON';
const subtypeKeys=roguelikeTypes.map(type=>type.key);

export function restoreStructureFilters(saved){
  const filtered=new Set(saved);
  // The former single checkbox hid every entrance type.
  if(filtered.delete(parent))for(const key of subtypeKeys)filtered.add(key);
  return filtered;
}

export function structureFilterCounts(markers,optionalKinds=[]){
  const counts=new Map();
  const addKind=kind=>{if(!counts.has(kind))counts.set(kind,0);};
  const addRoguelike=()=>subtypeKeys.forEach(addKind);
  for(const marker of markers){
    if(marker.kind===parent)addRoguelike();
    const key=markerTypeKey(marker);
    counts.set(key,(counts.get(key)||0)+1);
  }
  for(const kind of optionalKinds){
    if(kind===parent)addRoguelike();else addKind(kind);
  }
  return counts;
}
