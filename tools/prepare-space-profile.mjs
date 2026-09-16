import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const p=await json('private-packs/space-input/profile.json'),h=await json('private-packs/runtime-session/space-hello.json'),r=await json('private-packs/runtime-session/space-biome-reference.json');
if(!r.complete)throw new Error('Complete biome samples required');
const defs={nether:[-1,'nether',0,'下界','Nether'],io:[h.ioDimensionId,'io',4864,'木卫一','Io'],pluto:[h.plutoDimensionId,'pluto',5120,'冥王星','Pluto'],barnarda_c:[h.barnardaCDimensionId,'barnarda_c',5632,'巴纳德 C','Barnarda C'],ross128b:[h.ross128bDimensionId,'rwg_vanilla',6400,'Ross 128b','Ross 128b'],deep_dark:[h.deepDarkDimensionId,'rwg_vanilla',0,'深暗之域','Deep Dark'],anubis:[h.anubisDimensionId,null,0,'阿努比斯','Anubis'],horus:[h.horusDimensionId,null,0,'荷鲁斯','Horus'],asteroids:[h.asteroidsDimensionId,null,0,'小行星带','Asteroids'],mehen:[h.mehenBeltDimensionId,null,0,'Mehen 小行星带','Mehen Belt']};
const dimensions={};for(const [key,[id,graph,offset,zh,en]] of Object.entries(defs)){
  const d=dimensions[key]={id,graph,offset,zh,en};
  if(!graph){const values=new Set(r.cases.filter(c=>c.query.id.startsWith(key+':')).flatMap(c=>c.response.ids));if(values.size!==1)throw new Error('Single-biome assumption failed: '+key);d.uniform=[...values][0];}
}
const names=Object.fromEntries(Object.values(await json('tools/dimension-names.json')).map(v=>[v[0],v]));
for(const [key,d] of Object.entries(dimensions)){d.zh=names[key][1];d.en=names[key][2];}
const aliases=await json('tools/space-biome-aliases.json');
if(createHash('sha256').update(await readFile(new URL('private-packs/space-input/profile.json',root))).digest('hex')!==aliases.generatorProfileSha256)throw new Error('Changed biome registry: revalidate canonical biome IDs before preparing this pack');
for(const d of Object.values(dimensions))if(d.graph===aliases.graph)d.biomeAliases=aliases.aliases;
const taint=p.biomes.find(b=>b.class==='thaumcraft.common.lib.world.biomes.BiomeGenTaint'),magic=p.biomes.find(b=>b.class==='thaumcraft.common.lib.world.biomes.BiomeGenMagicalForest');
dimensions.ross128b.replacements={14:5,15:25};if(taint)dimensions.ross128b.replacements[taint.id]=5;if(magic&&p.disableMagicalForest)dimensions.ross128b.replacements[magic.id]=27;
await writeFile(new URL('private-packs/space-browser/runtime-profile.json',root),JSON.stringify({schemaVersion:1,dimensions,rossRuinChance:p.rossRuinChance},null,2));
await writeFile(new URL('private-packs/space-browser/biomes.json',root),JSON.stringify(h.biomes,null,2));
console.log('Prepared 10 extra biome dimensions and 5 structure kinds.');
