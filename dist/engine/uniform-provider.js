import {biomeRegistry} from './catalog.js';
import {parseSeed} from './random.js';
import {validateBounds} from './native.js';

// Only confirmed constant managers belong here. Existing world generators stay independent.
export function createUniformProvider(input,{registry=biomeRegistry}={}) {
  const dimensions=new Map(input.dimensions.map(d=>[d.key,structuredClone(d)]));
  return {apiVersion:1,sampleBiomes(q,{signal}={}) {
    if(signal?.aborted)throw new Error('CANCELLED');
    parseSeed(q.seed);
    const d=dimensions.get(q.dimension);
    if(!d)throw new Error('固定群系包不支持此维度');
    if(q.config?.dimensionIds?.[d.key]!==undefined&&q.config.dimensionIds[d.key]!==d.id)throw new Error('维度 ID 与已采集群系不匹配');
    if(!Number.isSafeInteger(q.x)||!Number.isSafeInteger(q.z)||!Number.isInteger(q.width)||!Number.isInteger(q.height)||q.width<1||q.height<1||q.width*q.height>262144||!Number.isInteger(q.step)||q.step<1||q.step>256)throw new Error('固定群系请求无效');
    validateBounds({minX:q.x,minZ:q.z,maxX:q.x+(q.width-1)*q.step+1,maxZ:q.z+(q.height-1)*q.step+1},17179869184);
    const biome=registry.get(d.uniformBiome);
    if(!biome)throw new Error('固定群系未登记：'+d.uniformBiome);
    return new Uint16Array(q.width*q.height).fill(biome.index);
  }};
}
