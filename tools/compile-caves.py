"""Compile captured cave-mask generation with explicit all-stone preview adapters."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
def run(args,**kw):return subprocess.run(list(map(str,args)),check=True,**kw)
def build():
    source=ROOT/'private-packs/runtime-session';profile=json.loads((source/'terrain-profile.json').read_text('utf-8'))
    expected=json.loads((ROOT/'tools/generation-adapters.json').read_text('utf-8'))['caves']
    for name,digest in expected.items():
        if profile['inputClasses'].get(name)!=digest:raise ValueError('Review changed cave adapter input: '+name)
    with zipfile.ZipFile(source/'terrain-input.jar') as jar:
        for name,digest in profile['inputClasses'].items():
            if hashlib.sha256(jar.read(name+'.class')).hexdigest()!=digest:raise ValueError('Changed captured class '+name)
    work=ROOT/'.test-work/cave-compiler';work.mkdir(parents=True,exist_ok=True);cache=ROOT/'.test-work/noise-compiler'
    cp=os.pathsep.join(str(cache/f'repository/org/ow2/asm/{n}/9.8/{n}-9.8.jar') for n in ['asm','asm-tree','asm-commons'])
    run(['javac','-cp',cp,'-d',work,ROOT/'tools/worldgen-compiler/GenerationSlice.java',ROOT/'tools/worldgen-compiler/Slice.java'])
    java=['java','-cp',str(work)+os.pathsep+cp]
    with (work/'dependencies.txt').open('w') as log:run(java+['GenerationSlice',source/'terrain-input.jar',work/'selection-input.jar','caves'],stdout=log)
    src=work/'src/main/java';src.mkdir(parents=True,exist_ok=True)
    def code(name,text):(src/name).write_text(text,'utf-8')
    code('Block.java','package net.minecraft.block; public class Block {}')
    for name in ['BlockGrass','BlockLiquid']:code(name+'.java','package net.minecraft.block; public class '+name+' extends Block {}')
    code('Blocks.java','package net.minecraft.init; import net.minecraft.block.*; public class Blocks {public static final Block field_150348_b=new Block(),field_150346_d=new Block(),field_150353_l=new Block(),field_150355_j=new Block();public static final BlockGrass field_150349_c=new BlockGrass();public static final BlockLiquid field_150358_i=new BlockLiquid();}')
    code('BiomeGenBase.java','package net.minecraft.world.biome;import net.minecraft.block.Block;import net.minecraft.init.Blocks;public class BiomeGenBase {public static final BiomeGenBase field_76789_p=new BiomeGenBase(),field_76787_r=new BiomeGenBase(),field_76769_d=new BiomeGenBase();public Block field_76752_A=Blocks.field_150349_c,field_76753_B=Blocks.field_150346_d;}')
    code('World.java','package net.minecraft.world;import net.minecraft.world.biome.BiomeGenBase;public class World {final long seed;final BiomeGenBase biome=new BiomeGenBase();public World(long seed){this.seed=seed;}public long func_72905_C(){return seed;}public BiomeGenBase func_72807_a(int x,int z){return biome;}}')
    code('IChunkProvider.java','package net.minecraft.world.chunk;public interface IChunkProvider {}')
    code('Operation.java','package com.llamalad7.mixinextras.injector.wrapoperation;public interface Operation {}')
    for name in ['CaveExports.java','JavaRandom.java']:shutil.copyfile(ROOT/'tools/worldgen-compiler'/name,src/name)
    shutil.copyfile(ROOT/'tools/worldgen-compiler/src/FloatPrecision.java',src/'FloatPrecision.java')
    pom=(ROOT/'tools/noise-compiler/pom.xml').read_text('utf-8').replace('rwg-noise-browser','cave-browser').replace('noise-input.jar','selection-input.jar').replace('amidst.web.NoiseExports','amidst.web.CaveExports').replace('noise.js','caves.js')
    (work/'pom.xml').write_text(pom,'utf-8')
    distro=cache/'apache-maven-3.9.9';launcher=next((distro/'boot').glob('plexus-classworlds-*.jar'))
    maven=['java',f'-Dmaven.home={distro}',f'-Dmaven.multiModuleProjectDirectory={work}',f'-Dclassworlds.conf={distro}/bin/m2.conf','-cp',launcher,'org.codehaus.plexus.classworlds.launcher.Launcher','-o','-B','-ntp',f'-Dmaven.repo.local={cache}/repository','-f',work/'pom.xml']
    run(maven+['compiler:compile'],cwd=work)
    run(java+['Slice','round',work/'selection-input.jar',work/'rounded-input.jar']);shutil.copyfile(work/'rounded-input.jar',work/'selection-input.jar')
    run(java+['Slice','round-directory',work/'target/classes'])
    run(maven+['org.teavm:teavm-maven-plugin:0.15.0:compile'],cwd=work)
    output=ROOT/'private-packs/cave-browser';output.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(work/'target/browser/caves.js',output/'selection.js');shutil.copyfile(source/'terrain-profile.json',output/'profile.json')
    print('Private cave mask library compiled; live calibration required.')
if __name__=='__main__':build()
