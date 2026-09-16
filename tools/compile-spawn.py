"""Compile isolated seed-only spawn replay from verified original RWG/cave instructions."""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, zipfile, importlib.util, re
ROOT=Path(__file__).resolve().parents[1]
def run(args,**kw): return subprocess.run(list(map(str,args)),check=True,**kw)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def build():
 work=ROOT/'.test-work/spawn-compiler';work.mkdir(parents=True,exist_ok=True)
 cache=ROOT/'.test-work/noise-compiler';source=ROOT/'private-packs/runtime-session'
 profile=json.loads((source/'spawn-runtime-profile.json').read_text('utf-8'))
 terrain=json.loads((ROOT/'private-packs/rwg-terrain-browser/profile.json').read_text('utf-8'))
 if profile['schemaVersion']!=2 or profile['manager']!='rwg.world.ChunkManagerRealistic' or profile['caveClass']!='net.minecraft.world.gen.MapGenCaves':raise ValueError('Unsupported spawn runtime')
 if profile['groups']!=terrain['groups']:raise ValueError('Changed runtime climate groups')
 if profile['noise']!=terrain['noise']:raise ValueError('Changed runtime noise selection')
 raw=ROOT/'.test-work/terrain-compiler/input.jar'
 pins=json.loads((ROOT/'tools/worldgen-compiler/surface-adapter-profile.json').read_text('utf-8'))['inputClasses']
 pins.update(json.loads((ROOT/'private-packs/rwg-terrain-browser/manifest.json').read_text('utf-8'))['inputClasses'])
 with zipfile.ZipFile(raw) as z:
  for name,h in pins.items():
   if hashlib.sha256(z.read(name+'.class')).hexdigest()!=h:raise ValueError('Changed RWG bytecode '+name)
 cavepins=json.loads((ROOT/'tools/generation-adapters.json').read_text('utf-8'))['caves']
 with zipfile.ZipFile(source/'terrain-input.jar') as z:
  for name,h in cavepins.items():
   if hashlib.sha256(z.read(name+'.class')).hexdigest()!=h:raise ValueError('Changed cave bytecode '+name)
 cp=os.pathsep.join(str(cache/f'repository/org/ow2/asm/{n}/9.8/{n}-9.8.jar') for n in ['asm','asm-tree','asm-commons'])
 run(['javac','-cp',cp,'-d',work,ROOT/'tools/spawn-reference/SpawnSlice.java',ROOT/'tools/worldgen-compiler/Slice.java',ROOT/'tools/worldgen-compiler/GenerationSlice.java'])
 java=['java','-cp',str(work)+os.pathsep+cp]
 run(java+['Slice','terrain',raw,work/'terrain.jar'])
 with (work/'surface-deps.txt').open('w') as log:run(java+['SpawnSlice',raw,work/'surface-input.jar'],stdout=log)
 with (work/'cave-deps.txt').open('w') as log:run(java+['GenerationSlice',source/'terrain-input.jar',work/'caves.jar','caves'],stdout=log)
 entries={}
 for p in ['terrain.jar','surface-input.jar','caves.jar']:
  with zipfile.ZipFile(work/p) as z:entries.update({n:z.read(n) for n in z.namelist() if n.endswith('.class')})
 with zipfile.ZipFile(work/'selection-input.jar','w') as z:
  for n,b in entries.items():z.writestr(n,b)
 run(java+['SpawnSlice',work/'selection-input.jar',work/'random.jar','random']);shutil.copyfile(work/'random.jar',work/'selection-input.jar')
 src=work/'src/main/java';src.mkdir(parents=True,exist_ok=True)
 def code(n,s):(src/n).write_text(s,'utf-8')
 for n in ['FloatPrecision.java','ChunkCoordIntPair.java','TLongObjectHashMap.java']:shutil.copyfile(ROOT/'tools/worldgen-compiler/src'/n,src/n)
 shutil.copyfile(ROOT/'tools/worldgen-compiler/JavaRandom.java',src/'JavaRandom.java')
 deps=(work/'surface-deps.txt').read_text()+(work/'cave-deps.txt').read_text()
 blockfields=dict(re.findall(r'net/minecraft/init/Blocks\.(\w+):L([^;]+);',deps))
 for field,v in profile['blocks'].items():
  if v['name'] in ['minecraft:air','minecraft:stone','minecraft:water','minecraft:bedrock','minecraft:grass','minecraft:sand','minecraft:snow_layer']:blockfields[field]=v['type'].replace('.','/')
 names={v['name'] for v in profile['blocks'].values() if v['name'] is not None}
 def collect(v):
  if isinstance(v,dict):
   if 'block'in v:names.add(v['block'])
   for a in v.values():collect(a)
  elif isinstance(v,list):
   for a in v:collect(a)
 collect(profile['objects'])
 for b in profile['biomes']:names.update([b['top'],b['filler']])
 names.discard(None);names=sorted(names);indices={n:i for i,n in enumerate(names)}
 types={profile['blocks'][f]['name']:t.replace('/','.') for f,t in blockfields.items() if t!='net/minecraft/block/Block'}
 code('Block.java','package net.minecraft.block;public class Block {public final int id;public Block(int id){this.id=id;}}')
 for t in set(types.values()):
  pkg,cls=t.rsplit('.',1);code(cls+'.java',f'package {pkg};public class {cls} extends Block {{public {cls}(int id){{super(id);}}}}')
 block=lambda name:'null' if name is None else f'amidst.web.Registry.BLOCKS[{indices[name]}]'
 code('Registry.java','package amidst.web;import net.minecraft.block.*;public class Registry {public static final Block[] BLOCKS={'+','.join(f'new {types.get(n,"net.minecraft.block.Block")}({i})' for i,n in enumerate(names))+'};}')
 code('Blocks.java','package net.minecraft.init;public class Blocks {'+'\n'.join(f'public static final {t.replace("/",".")} {f}=({t.replace("/",".")}){block(profile["blocks"][f]["name"])};' for f,t in blockfields.items())+'}')
 aliases_source=''.join(f'public static final net.minecraft.block.Block {n}={block("minecraft:"+n)};' for n in ['grass','stone','sand','snow_layer','air','water','bedrock'])
 code('Blocks.java',(src/'Blocks.java').read_text('utf-8')[:-1]+aliases_source+'}')
 aliases=set(re.findall(r'net/minecraft/world/biome/BiomeGenBase\.(\w+):Lnet/minecraft/world/biome/BiomeGenBase;',deps))
 code('BiomeGenBase.java','package net.minecraft.world.biome;import net.minecraft.block.Block;public class BiomeGenBase {public static final BiomeGenBase[] REGISTRY=new BiomeGenBase[65536];public final int id;public Block field_76752_A,field_76753_B;public BiomeGenBase(int i,Block t,Block f){id=i;field_76752_A=t;field_76753_B=f;REGISTRY[i]=this;}'+''.join('public static BiomeGenBase '+f+';' for f in aliases)+'}')
 code('World.java','package net.minecraft.world;import rwg.world.ChunkManagerRealistic;import net.minecraft.world.biome.BiomeGenBase;public class World {final long seed;final ChunkManagerRealistic manager;public World(long s,ChunkManagerRealistic m){seed=s;manager=m;}public long func_72905_C(){return seed;}public BiomeGenBase func_72807_a(int x,int z){return manager.func_76935_a(x,z);}}')
 code('IChunkProvider.java','package net.minecraft.world.chunk;public interface IChunkProvider {}')
 code('Operation.java','package com.llamalad7.mixinextras/injector/wrapoperation;public interface Operation {}'.replace('/','.'))
 code('RWGBiomes.java','package rwg.api;import net.minecraft.world.biome.BiomeGenBase;public class RWGBiomes {public static BiomeGenBase baseHotDesert;}')
 # Explicit configuration assignments for retained fields, including exact block identities.
 spec=importlib.util.spec_from_file_location('exporter',ROOT/'tools/export-runtime.py');exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
 classes={n[:-6].replace('/','.'):exporter.parse_class(b) for n,b in entries.items()}
 nodes=profile['objects'];selected={i:n for i,n in enumerate(nodes) if n['class'] in classes}
 def literal(v,d):
  if v is None:return 'null'
  if isinstance(v,dict):
   if 'ref'in v and v['ref'] in selected:return 'o'+str(v['ref'])
   if 'block'in v:return block(v['block'])
   if 'biomeId'in v:return f'BiomeGenBase.REGISTRY[{v["biomeId"]}]'
   raise ValueError('Unresolved object '+repr(v))
  if d.startswith('['):
   t={'F':'float','I':'int','D':'double','Z':'boolean','B':'byte'}.get(d[1:],d[2:-1].replace('/','.'))
   return 'new '+t+'[]{'+','.join(literal(a,d[1:]) for a in v)+'}'
  if isinstance(v,bool):return str(v).lower()
  if isinstance(v,(int,float)):return str(v)+({'F':'F','D':'D','J':'L'}.get(d,''))
  raise ValueError('Unsupported captured field '+repr(v))
 lines=['package amidst.web;import rwg.biomes.realistic.RealisticBiomeBase;import net.minecraft.world.biome.BiomeGenBase;public class RuntimeObjects {public static void install(){']
 for b in profile['biomes']:lines.append(f'new BiomeGenBase({b["id"]},{block(b["top"])},{block(b["filler"])});')
 for f in aliases:lines.append(f'BiomeGenBase.{f}=BiomeGenBase.REGISTRY[{profile["biomeStatics"][f]}];')
 desert={b['base']['legacyId'] for b in terrain['biomes'] if b['base']['class']=='rwg.biomes.base.BaseBiomeHotDesert'}
 if len(desert)!=1:raise ValueError('Ambiguous desert identity')
 lines.append(f'rwg.api.RWGBiomes.baseHotDesert=BiomeGenBase.REGISTRY[{desert.pop()}];')
 for i,n in selected.items():lines.append(f'{n["class"]} o{i}=new {n["class"]}();')
 for i,node in selected.items():
  c=node['class']
  while c in classes:
   for f in classes[c]['fields']:
    if f['access']&8:continue
    key=c+'#'+f['name']
    if key not in node['fields']:raise ValueError('Missing field '+key)
    lines.append(f'(({c})o{i}).{f["name"]}={literal(node["fields"][key],f["descriptor"])};')
   c=classes[c]['superclass'].replace('/','.')
 for b in profile['realistic']:lines.append(f'RealisticBiomeBase.biomeList[{b["id"]}]=o{b["object"]["ref"]};')
 lines.append('}}');code('RuntimeObjects.java','\n'.join(lines))
 entry=(ROOT/'tools/worldgen-compiler/src/BiomeExports.java').read_text('utf-8').replace('BiomeExports','SpawnExports')
 entry=entry.replace('biome == null ? new RealisticBiomeBase(id) : biome','biome')
 entry=entry.replace('Arrays.fill(RealisticBiomeBase.REGISTRY, null);','Arrays.fill(RealisticBiomeBase.biomeList, null); RuntimeObjects.install();')
 entry=entry.replace('m.perlin = selected;', 'm.borderNoise=new float[256]; m.perlin = selected;')
 entry=entry.replace('manager = m; generator = g;', 'manager = m; generator = g; world=new net.minecraft.world.World(value,m); caves=new net.minecraft.world.gen.MapGenCaves(); worldSeed=value;')
 start=entry.index('    public static void main(String[] arguments) {');entry=entry[:start]
 groups=','.join('new int[]{'+','.join(map(str,profile['groups'][g]))+'}' for g in ['snow','cold','hot','wet','small'])
 entry+='@JSExport public static void configureSeed(String seed){configure(seed,"'+terrain['noise']+'",'+groups+');}\n'
 fragment=(ROOT/'tools/spawn-reference/SpawnMethods.java.fragment').read_text('utf-8')
 replacements={'CAVES_ENABLED':str(profile['generateCaves']).lower(),'GRASS_ID':str(indices['minecraft:grass']),'SAND_ID':str(indices['minecraft:sand']),'STONE_ID':str(indices['minecraft:stone']),'SNOW_ID':str(indices['minecraft:snow_layer']),'ALLOWED_BIOMES':','.join(map(str,profile['spawnBiomes']))}
 for token,value in replacements.items():fragment=fragment.replace(token,value)
 fragment=fragment.replace('Random surfaceRandom=new Random(),mapRandom=new Random()', 'JavaRandom surfaceRandom=new JavaRandom(),mapRandom=new JavaRandom()')
 for token,name in [('AIR_ID','minecraft:air'),('WATER_ID','minecraft:water'),('BEDROCK_ID','minecraft:bedrock')]:fragment=fragment.replace(token,str(indices[name]))
 entry+=fragment+'\n}\n';code('SpawnExports.java',entry)
 # JVM oracle executes the copied desktop loop and replay, independently of the browser adapter loop.
 code('RwgChunkBiomeReplay.java',(ROOT/'tools/spawn-reference/RwgChunkBiomeReplay.java').read_text('utf-8').replace('import java.util.Random;', 'import amidst.web.JavaRandom;').replace('Random','JavaRandom').replace('JavaJavaRandom','JavaRandom'))
 shutil.copyfile(ROOT/'tools/spawn-reference/SpawnSearch.java',src/'SpawnSearch.java')
 shutil.copyfile(ROOT/'tools/spawn-reference/DesktopReplayOracle.java',src/'DesktopReplayOracle.java')
 code('ChunkPosition.java','package net.minecraft.world;public class ChunkPosition {public int chunkPosX,chunkPosZ;}')
 code('RwgSpawnCaves.java','package amidst.gtnh.worker;import net.minecraft.world.World;import net.minecraft.block.Block;import net.minecraft.world.gen.MapGenCaves;final class RwgSpawnCaves {final World world;final MapGenCaves generator=new MapGenCaves();RwgSpawnCaves(World w){world=w;}void carve(int x,int z,Block[] blocks){if('+str(profile['generateCaves']).lower()+')generator.func_151539_a(null,world,x,z,blocks);}}')
 pom=(ROOT/'tools/noise-compiler/pom.xml').read_text('utf-8').replace('rwg-noise-browser','spawn-browser').replace('noise-input.jar','selection-input.jar').replace('amidst.web.NoiseExports','amidst.web.SpawnExports').replace('noise.js','selection.js')
 (work/'pom.xml').write_text(pom,'utf-8')
 distro=cache/'apache-maven-3.9.9';launcher=next((distro/'boot').glob('plexus-classworlds-*.jar'))
 maven=['java',f'-Dmaven.home={distro}',f'-Dmaven.multiModuleProjectDirectory={work}',f'-Dclassworlds.conf={distro}/bin/m2.conf','-cp',launcher,'org.codehaus.plexus.classworlds.launcher.Launcher','-o','-B','-ntp',f'-Dmaven.repo.local={cache}/repository','-f',work/'pom.xml']
 run(maven+['compiler:compile'],cwd=work)
 output=ROOT/'private-packs/spawn-browser';output.mkdir(parents=True,exist_ok=True)
 with (output/'reference.json').open('w') as log:run(['java','-cp',str(work/'target/classes')+os.pathsep+str(work/'selection-input.jar'),'amidst.gtnh.worker.DesktopReplayOracle'],stdout=log)
 run(java+['SpawnSlice',work/'selection-input.jar',work/'rounded.jar','round']);shutil.copyfile(work/'rounded.jar',work/'selection-input.jar')
 run(java+['Slice','round-directory',work/'target/classes'])
 run(maven+['org.teavm:teavm-maven-plugin:0.15.0:compile'],cwd=work)
 shutil.copyfile(work/'target/browser/selection.js',output/'selection.js')
 run(['node',ROOT/'tools/optimize-generated.mjs',output/'selection.js','--cell-noise'])
 (output/'profile.json').write_text(json.dumps({'schemaVersion':2,'provider':profile['provider'],'spawnBiomes':profile['spawnBiomes'],'blocks':names,'generateCaves':profile['generateCaves'],'caveClass':profile['caveClass'],'runtimeProfileSha256':digest(source/'spawn-runtime-profile.json'),'terrainProfileSha256':digest(ROOT/'private-packs/rwg-terrain-browser/profile.json')},indent=2),'utf-8')
 (output/'manifest.json').write_text(json.dumps({'schemaVersion':1,'stage':'seed-only-spawn','inputClasses':{**pins,**cavepins},'engineSha256':digest(output/'selection.js'),'profileSha256':digest(output/'profile.json'),'excluded':['Forge ReplaceBiomeBlocks events','population','structures','saved-world coordinates'],'validation':'pending'},indent=2),'utf-8')
 print('Compiled independent spawn replay; validate JVM/browser output before installing.')
if __name__=='__main__':build()
