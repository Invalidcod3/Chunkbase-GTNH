import {parseSeed} from './engine/random.js';
const LIMIT=8*1024*1024;
export function parseSavedSpawn(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length>LIMIT)throw Error('存档数据过大或格式无效');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=0,nodes=0;
  const take=n=>{if(n<0||offset+n>bytes.length)throw Error('存档 NBT 数据不完整');const p=offset;offset+=n;return p;};
  const u8=()=>view.getUint8(take(1)),i32=()=>view.getInt32(take(4));
  const string=()=>{const n=view.getUint16(take(2));return new TextDecoder().decode(bytes.subarray(take(n),offset));};
  function tag(type,depth=0){
    if(depth>64||++nodes>200000)throw Error('存档 NBT 结构超出限制');
    switch(type){
      case 1:return view.getInt8(take(1));case 2:return view.getInt16(take(2));case 3:return i32();
      case 4:return view.getBigInt64(take(8));case 5:take(4);return null;case 6:take(8);return null;
      case 7:case 11:case 12:{const n=i32();if(n<0)throw Error('无效 NBT 数组');take(n*(type===7?1:type===11?4:8));return null;}
      case 8:return string();
      case 9:{const child=u8(),n=i32();if(n<0||n>200000||child===0&&n)throw Error('无效 NBT 列表');for(let i=0;i<n;i++)tag(child,depth+1);return null;}
      case 10:{const result=new Map();for(let child;(child=u8())!==0;){const name=string();if(result.has(name))throw Error('重复 NBT 字段');result.set(name,{type:child,value:tag(child,depth+1)});}return result;}
      default:throw Error('不支持的 NBT 类型');
    }
  }
  if(u8()!==10)throw Error('请选择 Minecraft level.dat 文件');string();const root=tag(10);
  if(offset!==bytes.length)throw Error('NBT 文件存在多余数据');
  const data=root.get('Data');if(data?.type!==10)throw Error('缺少存档 Data');
  const field=(name,type)=>{const value=data.value.get(name);if(value?.type!==type)throw Error('缺少存档字段：'+name);return value.value;};
  const seed=field('RandomSeed',4).toString(),x=field('SpawnX',3),y=field('SpawnY',3),z=field('SpawnZ',3);
  if(Math.abs(x)>30000000||Math.abs(z)>30000000)throw Error('存档出生点超出地图范围');
  return {kind:'WORLD_SPAWN',status:'RECORDED',certainty:'RECORDED',source:'level.dat',recordSource:'saved-world',seed,x,y,z,subtype:''};
}
export async function readSavedSpawn(file){
  if(file.size>LIMIT)throw Error('level.dat 文件超过 8 MiB');
  let bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]===31&&bytes[1]===139){
    if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持读取压缩存档');
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT)throw Error('解压后的存档超过 8 MiB');chunks.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    bytes=new Uint8Array(size);let p=0;for(const chunk of chunks){bytes.set(chunk,p);p+=chunk.length;}
  }
  return parseSavedSpawn(bytes);
}
export function matchingSavedSpawn(record,query){return record&&query.dimension==='overworld'&&record.seed===parseSeed(query.seed).toString()?{...record}:null;}
export function includeSavedSpawn(items,record,query){
  const spawn=matchingSavedSpawn(record,query);if(!spawn)return items;
  const result=items.filter(m=>m.kind!=='WORLD_SPAWN'),b=query.bounds;
  if(query.structureGroup!=='dungeons'&&!query.excludedKinds?.includes('WORLD_SPAWN')&&spawn.x>=b.minX&&spawn.x<b.maxX&&spawn.z>=b.minZ&&spawn.z<b.maxZ)result.push(spawn);
  return result;
}
