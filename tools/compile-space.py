"""Compile captured layer graphs without touching the existing RWG/Twilight engines."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,zipfile,sys
ROOT=Path(__file__).resolve().parents[1]
def run(args,**kw):return subprocess.run(list(map(str,args)),check=True,**kw)
def build():
    source=ROOT/'private-packs/space-input';p=json.loads((source/'profile.json').read_text('utf-8'))
    accepted=json.loads((ROOT/'tools/space-compiler/accepted-inputs.json').read_text('utf-8'))
    if p['inputClasses']!=accepted['inputClasses']:raise ValueError('Review changed extra-dimension input bytecode before compilation')
    with zipfile.ZipFile(source/'input.jar') as jar:
        for name,digest in p['inputClasses'].items():
            if hashlib.sha256(jar.read(name+'.class')).hexdigest()!=digest:raise ValueError('Changed capture: '+name)
    run([sys.executable,ROOT/'tools/prepare-space-compiler.py'])
    work=ROOT/'.test-work/space-compiler';src=work/'src/main/java';src.mkdir(parents=True,exist_ok=True)
    def java(name,code):(src/(name+'.java')).write_text(code,'utf-8')
    fieldtypes={line.split()[1]:line.split()[2] for line in (work/'dependencies.txt').read_text().splitlines() if line.startswith('FIELD ')}
    classes=sorted(set(b['class'] for b in p['biomes']));typeids={name:i for i,name in enumerate(classes)}
    code='package net.minecraft.world.biome; public class BiomeGenBase {public int field_76756_M;public static BiomeGenBase[] all=new BiomeGenBase[65536]; int type;boolean snow;TempCategory category; public enum TempCategory {OCEAN,COLD,MEDIUM,WARM} public BiomeGenBase(int id,int t,boolean s,TempCategory c){field_76756_M=id;type=t;snow=s;category=c;all[id]=this;} public boolean func_150559_j(){return snow;}public TempCategory func_150561_m(){return category;}public Class func_150562_l(){return types[type];}public boolean func_150569_a(BiomeGenBase b){if(b==null)return false;for(int id:equal[field_76756_M])if(id==b.field_76756_M)return true;return false;}public static BiomeGenBase func_150568_d(int id){return id>=0&&id<all.length?all[id]:null;} '
    code+='static int[][] equal=new int[65536][];static{'+''.join('equal['+key+']=new int[]{'+','.join(map(str,values))+'};' for key,values in p['biomeEquals'].items())+'}'
    code+=''.join('static class T'+str(i)+'{}' for i in range(len(classes)))+'static Class[] types={'+','.join('BiomeGenJungle.class' if name=='net.minecraft.world.biome.BiomeGenJungle' else 'T'+str(i)+'.class' for i,name in enumerate(classes))+'};static{'
    code+=''.join('new BiomeGenBase('+str(b['id'])+','+str(typeids[b['class']])+','+str(b['snow']).lower()+',TempCategory.'+b['category']+');' for b in p['biomes'])+'}'
    code+=''.join('public static BiomeGenBase '+key+'=all['+str(value)+'];' for key,value in p['biomeFields'].items())+'}'
    java('BiomeGenBase',code)
    java('BiomeGenJungle','package net.minecraft.world.biome;public class BiomeGenJungle {}')
    java('IntCache','package net.minecraft.world.gen.layer; public class IntCache {public static int[] func_76445_a(int n){return new int[n];}}')
    java('WeightedRandom','package net.minecraft.util; import java.util.*; public class WeightedRandom {public static class Item {public int field_76292_a;public Item(int w){field_76292_a=w;}} public static int func_76272_a(Collection<Item> c){int sum=0;for(Item i:c)sum+=i.field_76292_a;return sum;}public static Item getItem(Collection<Item> c,int n){for(Item i:c){n-=i.field_76292_a;if(n<0)return i;}return null;}}')
    java('BiomeManager','package net.minecraftforge.common;import java.util.*;import net.minecraft.world.biome.BiomeGenBase;public class BiomeManager {public enum BiomeType {DESERT,WARM,COOL,ICY} public static class BiomeEntry extends net.minecraft.util.WeightedRandom.Item {public BiomeGenBase biome;public BiomeEntry(BiomeGenBase b,int w){super(w);biome=b;}} static boolean[] modded={'+','.join(str(v).lower() for v in p['moddedBiomeTypes'])+'};public static boolean isTypeListModded(BiomeType t){return modded[t.ordinal()];}public static List<BiomeGenBase> oceanBiomes=Arrays.asList('+','.join('BiomeGenBase.all['+str(v['biome'])+']' for v in p['oceanBiomes'])+');}')
    java('LogManager','package org.apache.logging.log4j; public class LogManager {public static Logger getLogger(){return new Logger();}}')
    java('Logger','package org.apache.logging.log4j; public class Logger {public void debug(String s){}}')
    java('CrashReport','package net.minecraft.crash;public class CrashReport {public static CrashReport func_85055_a(Throwable t,String s){throw new IllegalStateException(s,t);}public CrashReportCategory func_85058_a(String s){throw new IllegalStateException(s);}}')
    java('CrashReportCategory','package net.minecraft.crash; public class CrashReportCategory {public void func_71500_a(String s,java.util.concurrent.Callable c){}public void func_71507_a(String s,Object o){}}')
    java('ReportedException','package net.minecraft.util;public class ReportedException extends RuntimeException{public ReportedException(net.minecraft.crash.CrashReport r){super("Invalid biome lookup");}}')
    shutil.copyfile(ROOT/'tools/worldgen-compiler/JavaRandom.java',src/'JavaRandom.java')
    def literal(v,typ=''):
        if v is None:return 'null'
        if isinstance(v,bool):return str(v).lower()
        if isinstance(v,(int,float)):return ('(float)' if typ=='F' else '')+str(v)
        if isinstance(v,str):return json.dumps(v)
        if isinstance(v,list):
            if typ in ['Ljava/util/List;','Ljava/util/ArrayList;']:return 'new java.util.ArrayList(java.util.Arrays.asList('+','.join(literal(x) for x in v)+'))'
            if typ.startswith('[Ljava/util/ArrayList;'):return 'new java.util.ArrayList[]{'+','.join('new java.util.ArrayList(java.util.Arrays.asList('+','.join(literal(x) for x in a)+'))' for a in v)+'}'
            if typ.startswith('[Ljava/util/List;'):return 'new java.util.List[]{'+','.join(literal(a,'Ljava/util/List;') for a in v)+'}'
            if typ.startswith('[L'):return 'new '+typ[2:-1].replace('/','.').replace('$','.')+'[]{'+','.join(literal(x) for x in v)+'}'
            return 'new int[]{'+','.join(literal(x) for x in v)+'}'
        if 'node' in v:return 'n'+str(v['node'])
        if 'long' in v:return v['long']+'L'
        if 'enum' in v:return 'mode('+json.dumps(v['name'])+')'
        if 'weight' in v:return 'new net.minecraftforge.common.BiomeManager.BiomeEntry('+literal(v['biome'])+','+str(v['weight'])+')'
        if 'biome' in v:return 'net.minecraft.world.biome.BiomeGenBase.all['+str(v['biome'])+']'
        raise ValueError('Unsupported graph field '+str(v))
    code='package amidst.web;import org.teavm.jso.JSExport;import net.minecraft.world.gen.layer.GenLayer; public class SpaceExports {static net.minecraft.world.gen.layer.GenLayerEdge$Mode mode(String name){for(net.minecraft.world.gen.layer.GenLayerEdge$Mode value:net.minecraft.world.gen.layer.GenLayerEdge$Mode.values())if(value.name().equals(name))return value;throw new IllegalArgumentException(name);}static GenLayer full,quarter;static GenLayer[] debugNodes;@JSExport public static int[] node(int i){return java.util.Arrays.copyOf(debugNodes[i].func_75904_a(4097,-8193,8,8),64);}static micdoodle8.mods.galacticraft.core.perlin.generator.Billowed noise; @JSExport public static void configure(String dimension,String s){long seed=Long.parseLong(s);full=null;quarter=null;switch(dimension){'
    for key,g in p['graphs'].items():
        code+='case "'+key+'":{'
        for i,n in enumerate(g['nodes']):code+=n['class'].replace('$','.')+' n'+str(i)+'=new '+n['class'].replace('$','.')+'();'
        for i,n in enumerate(g['nodes']):
            for keyfield,v in n['fields'].items():
                owner,field=keyfield.split('#');typ=fieldtypes[keyfield]
                rhs=literal(v,typ)
                if isinstance(v,dict) and 'node' in v:rhs='('+typ[1:-1].replace('/','.').replace('$','.')+')'+rhs
                code+='(('+owner.replace('$','.')+')n'+str(i)+').'+field+'='+rhs+';'
        roots=g['roots'];fine=next(v for k,v in roots.items() if any(s in k for s in ['#zoomedBiomes','#biomeIndexLayer','#field_76945_e']));coarse=next(v for k,v in roots.items() if any(s in k for s in ['#unzoomedBiomes','#genBiomes','#field_76944_d']))
        code+='debugNodes=new GenLayer[]{'+','.join('n'+str(i) for i in range(len(g['nodes'])))+'};'
        code+='full=n'+str(fine)+';quarter=n'+str(coarse)+';full.func_75905_a(seed);quarter.func_75905_a(seed);break;}'
    code+='default:throw new IllegalArgumentException(dimension);}} @JSExport public static int[] biomes(int x,int z,int w,int h,boolean q){return java.util.Arrays.copyOf((q?quarter:full).func_75904_a(x,z,w,h),w*h);} @JSExport public static void configureNoise(String s){noise=new micdoodle8.mods.galacticraft.core.perlin.generator.Billowed(new JavaRandom(Long.parseLong(s)).nextLong(),2,0.25F);noise.setFrequency(0.009F);noise.amplitude=0.6F;} @JSExport public static float density(int x,int z){return noise.getNoise((float)x,(float)z);} public static void main(String[]args){} }'
    java('SpaceExports',code)
    pom=(ROOT/'tools/noise-compiler/pom.xml').read_text().replace('rwg-noise-browser','space-browser').replace('noise-input.jar','selection-input.jar').replace('amidst.web.NoiseExports','amidst.web.SpaceExports').replace('noise.js','space.js')
    (work/'pom.xml').write_text(pom,'utf-8')
    cache=ROOT/'.test-work/noise-compiler';distro=cache/'apache-maven-3.9.9';launcher=next((distro/'boot').glob('plexus-classworlds-*.jar'))
    maven=['java',f'-Dmaven.home={distro}',f'-Dmaven.multiModuleProjectDirectory={work}',f'-Dclassworlds.conf={distro}/bin/m2.conf','-cp',launcher,'org.codehaus.plexus.classworlds.launcher.Launcher','-e','-o','-B','-ntp',f'-Dmaven.repo.local={cache}/repository','-f',work/'pom.xml']
    shutil.copyfile(ROOT/'tools/worldgen-compiler/src/FloatPrecision.java',src/'FloatPrecision.java')
    run(maven+['compiler:compile'],cwd=work)
    cp=os.pathsep.join(str(cache/f'repository/org/ow2/asm/{n}/9.8/{n}-9.8.jar') for n in ['asm','asm-tree','asm-commons'])
    run(['javac','-cp',cp,'-d',work,ROOT/'tools/worldgen-compiler/Slice.java'])
    command=['java','-cp',str(work)+os.pathsep+cp,'Slice']
    run(command+['round',work/'selection-input.jar',work/'rounded-input.jar']);shutil.copyfile(work/'rounded-input.jar',work/'selection-input.jar')
    run(command+['round-directory',work/'target/classes'])
    run(maven+['org.teavm:teavm-maven-plugin:0.15.0:compile'],cwd=work)
    output=ROOT/'private-packs/space-browser';output.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(work/'target/browser/space.js',output/'selection.js');shutil.copyfile(source/'profile.json',output/'profile.json')
    run(['node',ROOT/'tools/optimize-generated.mjs',output/'selection.js'])
    print('Compiled extra biome and space engine; calibration required.')
if __name__=='__main__':build()
