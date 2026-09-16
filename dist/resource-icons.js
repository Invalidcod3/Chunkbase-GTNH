import {resourceIconCatalog} from './assets/resources/catalog.js';

// Presentation only: keep prediction records and resource identities unchanged.
export function resourceIcon(dimension, mode, id, shape='flat') {
  const entry=resourceIconCatalog[dimension]?.[mode]?.[id];
  const file=entry?.[mode==='FLUID'?'flat':shape];
  return file ? `./assets/resources/${file}.png` : null;
}

export function depositIcon(dimension, deposit) {
  if(deposit.icon)return 'data:image/png;base64,'+deposit.icon;
  return resourceIcon(dimension,deposit.amounts?'FLUID':'ORES',deposit.id);
}
