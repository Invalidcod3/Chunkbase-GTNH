// Bounds describe valid sample coordinates, including RWG's quarter-cell offset.
export function clipBiomeQuery(q) {
  const offset = q.dimension === 'overworld' && q.step === 4 ? 2 : 0;
  const min = q.dimension === 'overworld' ? -29999983 : -30000000;
  const max = q.dimension === 'overworld' ? 29999983 : 29999999;
  const left = Math.max(0, Math.ceil((min-offset-q.x)/q.step));
  const top = Math.max(0, Math.ceil((min-offset-q.z)/q.step));
  const right = Math.min(q.width, Math.floor((max-offset-q.x)/q.step)+1);
  const bottom = Math.min(q.height, Math.floor((max-offset-q.z)/q.step)+1);
  if (right <= left || bottom <= top) return null;
  return {query:{...q,x:q.x+left*q.step,z:q.z+top*q.step,width:right-left,height:bottom-top},left,top};
}

export function biomeExportQuery(bounds, dimension) {
  const span = Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
  let step = 2 ** Math.max(0, Math.ceil(Math.log2(span/512)));
  for (; step <= 256; step *= 2) {
    // Align to the map grid; an unaligned square can otherwise grow to 513x513.
    const x = Math.floor(bounds.minX/step)*step, z = Math.floor(bounds.minZ/step)*step;
    const clipped = clipBiomeQuery({dimension,x,z,step,width:Math.ceil((bounds.maxX-x)/step),height:Math.ceil((bounds.maxZ-z)/step)});
    if (!clipped) throw new Error('当前视野没有可导出的生物群系');
    if (clipped.query.width*clipped.query.height <= 262144) return clipped.query;
  }
  throw new Error('导出范围过大，请放大地图');
}
