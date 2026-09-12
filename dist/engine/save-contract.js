/**
 * Future save adapters consume user-selected File objects locally.
 * Do not infer recorded/generated/exhausted state from seed predictions.
 *
 * @typedef {{seed:string, dimension:string, bounds:{minX:number,minZ:number,maxX:number,maxZ:number}}} WorldQuery
 * @typedef {{source:'recorded',saveId:string,dimension:string,chunkX:number,chunkZ:number,palette:string[],indices:Uint16Array}} SavedChunk
 * @typedef {{kind:string,x:number,z:number,source:'recorded',certainty:'RECORDED',saveId:string,exhausted?:boolean}} SavedResource
 */
export const SAVE_API_VERSION = 1;
export function assertSaveProvider(provider) {
  if (
    provider?.apiVersion !== SAVE_API_VERSION ||
    typeof provider.open !== "function" ||
    typeof provider.queryChunks !== "function" ||
    typeof provider.queryResources !== "function" ||
    typeof provider.close !== "function"
  )
    throw new Error("Unsupported save provider");
  return provider;
}
// Contract: open(files,{signal}) -> {saveId,seed,dimensions};
// queryChunks(query,{signal}) -> AsyncIterable<SavedChunk>;
// Each palette entry is a namespace:path key; indices address this local palette.
// An imported legacy ID must be resolved with its environment AND dimension.
// queryResources(query,{signal}) -> AsyncIterable<SavedResource>;
// close() releases local files, buffers, and per-save caches.
export function mergeRecords(predictions, records, key) {
  const merged = new Map(predictions.map((p) => [key(p), p]));
  for (const record of records) {
    if (
      record.source !== "recorded" ||
      record.certainty !== "RECORDED" ||
      typeof record.saveId !== "string"
    )
      throw new Error("Save record lacks provenance");
    merged.set(key(record), record);
  }
  return [...merged.values()];
}
