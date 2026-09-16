// Provider-local, bounded cache of completed samples. Store indices, not colors.
// Callers supply an identity covering seed, dimension and sampling semantics.
export function createBiomeRasterCache(maxBytes = 8 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid biome raster cache size');
  const entries = new Map();
  let bytes = 0;
  const keyOf = (space, q) => `${space}/${q.x}/${q.z}/${q.width}/${q.height}/${q.step}`;
  function touch(key, entry) { entries.delete(key); entries.set(key, entry); }
  return {
    get(space, q) {
      const key = keyOf(space, q), exact = entries.get(key);
      if (exact) { touch(key, exact); return exact.data.slice(); }
      // A completed finer raster can serve an aligned subset without changing
      // any sample coordinate. Never interpolate or treat a preview as exact.
      for (const [id, entry] of [...entries].reverse()) {
        const p = entry.query;
        if (entry.space !== space || q.step % p.step ||
            (q.x - p.x) % p.step || (q.z - p.z) % p.step ||
            q.x < p.x || q.z < p.z ||
            q.x + (q.width - 1) * q.step > p.x + (p.width - 1) * p.step ||
            q.z + (q.height - 1) * q.step > p.z + (p.height - 1) * p.step) continue;
        const result = new Uint16Array(q.width * q.height), stride = q.step / p.step;
        const x = (q.x - p.x) / p.step, z = (q.z - p.z) / p.step;
        for (let row = 0; row < q.height; row++) for (let col = 0; col < q.width; col++)
          result[row * q.width + col] = entry.data[(z + row * stride) * p.width + x + col * stride];
        touch(id, entry);
        return result;
      }
      return null;
    },
    put(space, q, data) {
      if (!maxBytes || data.byteLength > maxBytes) return;
      const key = keyOf(space, q), old = entries.get(key);
      if (old) { bytes -= old.data.byteLength; entries.delete(key); }
      // Transfer of the response buffer and caller mutations cannot detach or
      // change our copy. Limit entry count as well as pixel storage.
      const copy = data.slice();
      entries.set(key, {space, query: {x:q.x,z:q.z,width:q.width,height:q.height,step:q.step}, data:copy});
      bytes += copy.byteLength;
      while (bytes > maxBytes || entries.size > 256) {
        const first = entries.keys().next().value;
        bytes -= entries.get(first).data.byteLength; entries.delete(first);
      }
    },
  };
}
