// Exact transformations for the reviewed TeaVM BigInt runtime. Never replace
// all Java longs with Number, change cache layout, or approximate float math.
export const LONG_CREATE='Long_create = (lo, hi) => BigInt.asIntN(64, BigInt.asUintN(64, BigInt(lo)) | BigInt.asUintN(64, BigInt(hi) << BigInt(32)))';
export const CELL_ORIGINAL=`ru_CellNoise_valueNoise2D = ($x, $z, $seed) => {
    let $n;
    $n = Long_and(Long_add(Long_fromInt((1619 * $x | 0) + (6971 * $z | 0) | 0), Long_mul(Long_fromInt(1013), $seed)), Long_fromInt(2147483647));
    $seed = Long_xor(Long_shr($n, 13), $n);
    return 1.0 - Long_toNumber(Long_and(Long_add(Long_mul($seed, Long_add(Long_mul(Long_mul($seed, $seed), Long_fromInt(60493)), Long_fromInt(19990303))), Long_fromInt(1376312589)), Long_fromInt(2147483647))) / 1.073741824E9;
};`;
export const CELL_OPTIMIZED=`ru_CellNoise_valueNoise2D = ($x, $z, $seed) => {
    // The polynomial is observed only modulo 2^31. imul preserves these low
    // bits exactly, including Java int/long overflow and negative coordinates.
    const seed32 = Number(BigInt.asIntN(32, $seed));
    const n = (Math.imul(1619, $x) + Math.imul(6971, $z) + Math.imul(1013, seed32)) & 2147483647;
    const v = (n >>> 13) ^ n;
    const hash = (Math.imul(v, (Math.imul(Math.imul(v, v), 60493) + 19990303) | 0) + 1376312589) & 2147483647;
    return 1 - hash / 1073741824;
};`;

export function optimizeGenerated(source,{cellNoise=false}={}) {
  if(!source.includes(LONG_CREATE))throw Error('Unreviewed Java long runtime; review before optimizing');
  if(source.includes('// amidst-cpu-optimizer-v1'))throw Error('Use the preserved unoptimized input');
  if(cellNoise) {
    const matches=[...source.matchAll(/ru_CellNoise_valueNoise2D = \(\$x, \$z, \$seed\) => \{[\s\S]*?\n\};/g)];
    if(matches.length!==1||matches[0][0].replaceAll('\r\n','\n')!==CELL_ORIGINAL)throw Error('CellNoise source changed; revalidate the integer adapter');
    source=source.replace(matches[0][0],CELL_OPTIMIZED);
  }
  let output='',constants=0;
  // Skip literals and comments, rather than rewriting a matching string or
  // changing a property call. Generated template literals are left untouched.
  for(let i=0;i<source.length;) {
    const start=i,c=source[i];
    if(c==='"'||c==="'"||c==='`') {
      i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i++]===c)break;}
    } else if(source.startsWith('//',i)) {const end=source.indexOf('\n',i);i=end<0?source.length:end;}
    else if(source.startsWith('/*',i)) {const end=source.indexOf('*/',i+2);if(end<0)throw Error('Unterminated comment');i=end+2;}
    else {
      const match=!/[\w$.]/.test(source[i-1]||' ')&&source.slice(i,i+12)==='Long_create('
        ? source.slice(i).match(/^Long_create\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/):null;
      if(match) {
        if(![match[1],match[2]].every(n=>Number.isSafeInteger(Number(n))))throw Error('Unsafe constant literal');
        const value=BigInt.asIntN(64,BigInt.asUintN(64,BigInt(match[1]))|BigInt.asUintN(64,BigInt(match[2])<<32n));
        output+='('+value+'n)';constants++;i+=match[0].length;continue;
      }
      i++;
    }
    output+=source.slice(start,i);
  }
  return {source:'// amidst-cpu-optimizer-v1: exact constants'+(cellNoise?' and CellNoise low bits':'')+'\n'+output,constants,cellNoise};
}
