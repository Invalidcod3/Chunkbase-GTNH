"""Compile observed Twilight GenLayers and the reference feature locator to a private browser library."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
def run(args,**kw):return subprocess.run(list(map(str,args)),check=True,**kw)
def build():
    source=ROOT/'private-packs/runtime-session';profile=json.loads((source/'terrain-profile.json').read_text('utf-8'))
    expected=json.loads((ROOT/'tools/generation-adapters.json').read_text('utf-8'))['twilight']
    for name,digest in expected.items():
        if profile['inputClasses'].get(name)!=digest:raise ValueError('Review changed Twilight adapter input: '+name)
    work=ROOT/'.test-work/twilight-compiler';work.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(source/'terrain-input.jar') as jar:
        for name,digest in profile['inputClasses'].items():
            if hashlib.sha256(jar.read(name+'.class')).hexdigest()!=digest:raise ValueError('Changed captured class '+name)
    cache=ROOT/'.test-work/noise-compiler'
    cp=os.pathsep.join(str(cache/f'repository/org/ow2/asm/{n}/9.8/{n}-9.8.jar') for n in ['asm','asm-tree','asm-commons'])
    run(['javac','-cp',cp,'-d',work,ROOT/'tools/worldgen-compiler/GenerationSlice.java'])
    with (work/'dependencies.txt').open('w') as log:run(['java','-cp',str(work)+os.pathsep+cp,'GenerationSlice',source/'terrain-input.jar',work/'selection-input.jar'],stdout=log)
    src=work/'src/main/java';src.mkdir(parents=True,exist_ok=True)
    def java(name,code):(src/name).write_text(code,'utf-8')
    java('BiomeGenBase.java','package net.minecraft.world.biome; public class BiomeGenBase {public final int field_76756_M;public BiomeGenBase(int id){field_76756_M=id;}}')
    java('IntCache.java','package net.minecraft.world.gen.layer; public class IntCache {public static int[] func_76445_a(int n){return new int[n];}}')
    java('TwilightForestMod.java','package twilightforest; public class TwilightForestMod {public static int maxBiomeIDs='+str(profile['maxBiomeIDs'])+';}')
    java('TFBiomeBase.java','package twilightforest.biomes; import net.minecraft.world.biome.BiomeGenBase; public class TFBiomeBase {'+''.join('public static final BiomeGenBase '+key+'=new BiomeGenBase('+str(value['id'])+');' for key,value in profile['biomes'].items())+'}')
    reference=ROOT/'reference/Amidst-GTNH/gtnh-worker/src/main/java/amidst/gtnh/worker'
    feature=(reference/'TwilightForestFeaturePredictor.java').read_text('utf-8').replace('import java.util.Random;','import amidst.web.JavaRandom;').replace('Random random = new Random(','JavaRandom random = new JavaRandom(')
    java('TwilightForestFeaturePredictor.java',feature)
    shutil.copyfile(ROOT/'tools/worldgen-compiler/JavaRandom.java',src/'JavaRandom.java')
    java('RoguelikeDungeonPredictor.java','package amidst.gtnh.worker; class RoguelikeDungeonPredictor {static class StructureDescriptor {final String kind,subtype,certainty;final int x,z;StructureDescriptor(String k,String s,int x,int z,String c){kind=k;subtype=s;this.x=x;this.z=z;certainty=c;}}}')
    features={'glacier':'GLACIER','tfSnow':'SNOW','tfLake':'LAKE','enchantedForest':'ENCHANTED_FOREST','fireSwamp':'FIRE_SWAMP','tfSwamp':'SWAMP','clearing':'CLEARING','oakSavanna':'OAK_SAVANNA','darkForest':'DARK_FOREST','darkForestCenter':'DARK_FOREST_CENTER','highlandsCenter':'HIGHLANDS_CENTER','highlands':'HIGHLANDS','deepMushrooms':'DEEP_MUSHROOMS'}
    java('TwilightForestBiomeSampler.java','package amidst.gtnh.worker; class TwilightForestBiomeSampler {boolean isOldMapGen(){return TwilightExports.old;}String getFeatureBiomeKey(int x,int z){switch(TwilightExports.point(x,z)){'+''.join('case '+str(profile['biomes'][key]['id'])+':return "'+value+'";' for key,value in features.items())+'default:return null;}}}')
    shutil.copyfile(ROOT/'tools/worldgen-compiler/TwilightExports.java',src/'TwilightExports.java')
    pom=(ROOT/'tools/noise-compiler/pom.xml').read_text('utf-8').replace('rwg-noise-browser','twilight-browser').replace('noise-input.jar','selection-input.jar').replace('amidst.web.NoiseExports','amidst.gtnh.worker.TwilightExports').replace('noise.js','twilight.js')
    (work/'pom.xml').write_text(pom,'utf-8')
    distro=cache/'apache-maven-3.9.9';launcher=next((distro/'boot').glob('plexus-classworlds-*.jar'))
    maven=['java',f'-Dmaven.home={distro}',f'-Dmaven.multiModuleProjectDirectory={work}',f'-Dclassworlds.conf={distro}/bin/m2.conf','-cp',launcher,'org.codehaus.plexus.classworlds.launcher.Launcher','-o','-B','-ntp',f'-Dmaven.repo.local={cache}/repository','-f',work/'pom.xml']
    run(maven+['compiler:compile'],cwd=work)
    run(maven+['org.teavm:teavm-maven-plugin:0.15.0:compile'],cwd=work)
    output=ROOT/'private-packs/twilight-browser';output.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(work/'target/browser/twilight.js',output/'selection.js')
    shutil.copyfile(source/'terrain-profile.json',output/'profile.json')
    print('Private Twilight function library compiled; live calibration required.')
if __name__=='__main__':build()
