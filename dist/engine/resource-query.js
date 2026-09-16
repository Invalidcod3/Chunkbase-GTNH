import { validateBounds } from './native.js';

// Align internal boundaries to both ore chunks and 128-block fluid fields.
// Each request stays far below the provider's area and scanned-cell limits.
export async function collectResourceView(request, query, {
  limit = 20000, select = values => values, onBatch = () => {},
  isCancelled = () => false, centreFirst = false,
} = {}) {
  validateBounds(query.bounds, 3600000000000000);
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid resource limit');
  const check = () => { if (isCancelled()) throw new Error('CANCELLED'); };
  const b = query.bounds, size = 1024, tiles = [];
  // A lazy row scan keeps export planning bounded even at large coordinates.
  function* regions() {
    for (let z = Math.floor(b.minZ / size) * size; z < b.maxZ; z += size)
      for (let x = Math.floor(b.minX / size) * size; x < b.maxX; x += size)
        yield {minX:Math.max(x,b.minX), minZ:Math.max(z,b.minZ), maxX:Math.min(x+size,b.maxX), maxZ:Math.min(z+size,b.maxZ)};
  }
  // Only the visible map uses centre-first ordering; exports use a stable scan.
  const count = (Math.ceil(b.maxX/size)-Math.floor(b.minX/size)) * (Math.ceil(b.maxZ/size)-Math.floor(b.minZ/size));
  if (centreFirst && count <= 16384) {
    tiles.push(...regions());
    const cx=(b.minX+b.maxX)/2, cz=(b.minZ+b.maxZ)/2;
    tiles.sort((a,c)=>Math.hypot((a.minX+a.maxX)/2-cx,(a.minZ+a.maxZ)/2-cz)-Math.hypot((c.minX+c.maxX)/2-cx,(c.minZ+c.maxZ)/2-cz));
  }
  const items = [], seen = new Set();
  let scanned = 0;
  for (const bounds of tiles.length ? tiles : regions()) {
    check();
    const values = await request('predictResources', {...query, bounds});
    check();
    if (values === null) return {items:[], available:false, truncated:false};
    // Edge queries may return an ore centre just outside the requested view.
    const visible = values.filter(d => d.amounts
      ? d.x < b.maxX && d.x+128 > b.minX && d.z < b.maxZ && d.z+128 > b.minZ
      : d.x >= b.minX && d.x < b.maxX && d.z >= b.minZ && d.z < b.maxZ);
    let overflow = false;
    for (const item of select(visible)) {
      const key = `${item.kind}:${item.x}:${item.z}`;
      if (seen.has(key)) continue;
      if (items.length === limit) { overflow = true; break; }
      seen.add(key); items.push(item);
    }
    scanned++;
    const truncated = overflow || (items.length === limit && scanned < count);
    onBatch(items, {scanned, total:count, truncated});
    check();
    if (truncated) return {items, available:true, truncated:true};
  }
  return {items, available:true, truncated:false};
}
