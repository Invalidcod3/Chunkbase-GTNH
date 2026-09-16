const encoder = new TextEncoder();
const escapeCsv = (value) =>
  '"' + String(value ?? "").replaceAll('"', '""') + '"';
export function csv(markers, context) {
  return (
    "\ufeff" +
    [
      [
        "seed",
        "dimension_key",
        "dimension_id",
        "kind",
        "subtype",
        "x",
        "z",
        "y",
        "certainty",
        "source",
      ],
      ...markers.map((m) => [
        context.seed,
        context.dimension,
        context.dimensionId,
        m.kind,
        m.subtype,
        m.x,
        m.z,
        m.y,
        m.certainty,
        m.source,
      ]),
    ]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n")
  );
}
export function resourceCsv(markers,context){
  const rows=[['seed','dimension_key','dimension_id','kind','resource_id','name','materials','x','z','y','size','min_y','max_y','initial_l_per_op','source','certainty'],
    ...markers.map(m=>[context.seed,context.dimension,context.dimensionId,m.kind,m.id,m.name,m.materials,m.x,m.z,m.y,m.size,m.minY,m.maxY,m.amount,m.source,m.certainty])];
  return '\ufeff'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
}
export function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipStore(files) {
  const chunks = [],
    central = [];
  let offset = 0,
    centralLength = 0;
  for (const [name, content] of files) {
    const filename = encoder.encode(name),
      data = typeof content === "string" ? encoder.encode(content) : content,
      crc = crc32(data);
    const header = new Uint8Array(30 + filename.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, filename.length, true);
    header.set(filename, 30);
    const dir = new Uint8Array(46 + filename.length),
      d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 33, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, filename.length, true);
    d.setUint32(42, offset, true);
    dir.set(filename, 46);
    chunks.push(header, data);
    central.push(dir);
    offset += header.length + data.length;
    centralLength += dir.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralLength, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
export function journeyMap(markers, context, y = 64) {
  return zipStore(
    markers
      .map((m, i) => {
        const identity=JSON.stringify([String(context.seed),context.dimension,context.dimensionId,m.kind,m.id||m.subtype||'',m.x,m.y??null,m.z]);
        const id = `${context.dimensionId}_${m.kind}_${m.x}_${m.z}_${crc32(encoder.encode(identity)).toString(16)}`,
          value = {
            id,
            name: `${m.name || (m.kind==='TWILIGHT_FEATURE'?m.subtype:m.kind)}${m.kind==='VANILLA_SPAWNER_DUNGEON'?` [Y: ${m.subtype}]`:''}${m.amount===undefined?'':` ${m.amount} L/Op`} (${m.certainty})`,
            icon: "waypoint-normal.png",
            x: m.x,
            y: (m.kind==='WORLD_SPAWN'&&m.status==='RECORDED'||['ASTEROID_SMALL','ASTEROID_VEIN'].includes(m.kind)||m.kind?.startsWith('END_')&&m.kind.endsWith('_ASTEROID'))&&Number.isInteger(m.y)?m.y:y,
            z: m.z,
            r: 220,
            g: 192,
            b: 100,
            enable: true,
            type: "Normal",
            origin: "Amidst GTNH Web",
            dimensions: [context.dimensionId],
          };
        return [
          `waypoints/${String(i).padStart(5, "0")}_${id}.json`,
          JSON.stringify(value, null, 2),
        ];
      })
      .concat([
        [
          "README.txt",
          `Seed: ${context.seed}\nDimension: ${context.dimension} (${context.dimensionId})\nCopy the JSON files into the matching JourneyMap world waypoint directory.\nAsteroids use their predicted centre Y; recorded spawn uses its saved Y. Other points use the supplied Y=${y}, not sampled terrain height. EXACT_FRESH_END assumes a fresh End; it does not include saved island or dragon state.\n`,
        ],
      ]),
  );
}
export function download(name, content, type = "application/json") {
  const blob =
      content instanceof Blob ? content : new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
