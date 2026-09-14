package amidst.web.profile;
import static amidst.web.profile.ResourceCapture.*;
import java.lang.instrument.*;
import java.security.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.jar.*;

/** Capture fixed generation classes and initialized biome identities, never save data. */
final class TerrainCapture {
    static void capture(ClassLoader loader,Path out,Instrumentation instrumentation)throws Exception {
        List<String> names=new ArrayList<>();
        for(String name:new String[]{"GenLayerTF","GenLayerTF5x5Preset","GenLayerTF6x6Preset","GenLayerTF7x7Preset","GenLayerTFBiomeBorders","GenLayerTFBiomeStabilize","GenLayerTFBiomes","GenLayerTFBiomes1Point7","GenLayerTFCheckBad","GenLayerTFCompanionBiomes","GenLayerTFFeatureZoom","GenLayerTFKeyBiomes","GenLayerTFRiverMix","GenLayerTFStream","GenLayerTFThornBorder"})names.add("twilightforest.world.layer."+name);
        for(String name:new String[]{"GenLayer","GenLayerZoom","GenLayerSmooth","GenLayerVoronoiZoom"})names.add("net.minecraft.world.gen.layer."+name);
        names.addAll(Arrays.asList("net.minecraft.world.gen.MapGenBase","net.minecraft.world.gen.MapGenCaves","net.minecraft.util.MathHelper","com.mitchej123.hodgepodge.core.fml.hooks.mc.RandomAid","com.mitchej123.hodgepodge.util.StdLCG"));
        final Map<String,byte[]> bytes=new ConcurrentHashMap<>();final Set<String> allowed=new HashSet<>();
        List<Class<?>> selected=new ArrayList<>();for(String name:names){selected.add(loader.loadClass(name));allowed.add(name.replace('.','/'));}
        ClassFileTransformer observer=new ClassFileTransformer(){public byte[] transform(ClassLoader l,String name,Class<?> c,ProtectionDomain p,byte[] b){if(c!=null&&allowed.contains(name))bytes.put(name,b.clone());return null;}};
        instrumentation.addTransformer(observer,true);
        try{instrumentation.retransformClasses(selected.toArray(new Class<?>[0]));}finally{instrumentation.removeTransformer(observer);}
        Map<String,Object> hashes=new TreeMap<>();
        try(JarOutputStream jar=new JarOutputStream(Files.newOutputStream(out.resolve("terrain-input.jar")))) {
            for(String name:new TreeSet<>(allowed)) {
                byte[] b=bytes.get(name);if(b==null)throw new IllegalStateException("Missing observed class: "+name);
                jar.putNextEntry(new JarEntry(name+".class"));jar.write(b);jar.closeEntry();
                StringBuilder hash=new StringBuilder();for(byte v:MessageDigest.getInstance("SHA-256").digest(b))hash.append(String.format("%02x",v&255));hashes.put(name,hash.toString());
            }
        }
        Map<String,Object> biomes=new TreeMap<>();Class<?> base=loader.loadClass("net.minecraft.world.biome.BiomeGenBase");
        for(Field f:loader.loadClass("twilightforest.biomes.TFBiomeBase").getDeclaredFields())if(Modifier.isStatic(f.getModifiers())&&base.isAssignableFrom(f.getType())) {
            f.setAccessible(true);Object b=f.get(null);if(b==null)continue;
            biomes.put(f.getName(),map("id",SurfaceStructureCapture.mcField(b,"biomeID","field_76756_M"),"name",SurfaceStructureCapture.mcField(b,"biomeName","field_76791_y"),"class",b.getClass().getName()));
        }
        Class<?> tf=loader.loadClass("twilightforest.TwilightForestMod"),rwg=loader.loadClass("rwg.config.ConfigRWG");
        Map<String,Object> profile=map("schemaVersion",1,"inputClasses",hashes,"oldMapGen",field(tf,"oldMapGen"),"maxBiomeIDs",field(tf,"maxBiomeIDs"),"dimensionId",field(tf,"dimensionID"),"biomes",biomes,
            "undergroundLakes",field(rwg,"generateUndergroundLakes"),"undergroundLavaLakes",field(rwg,"generateUndergroundLavaLakes"));
        Files.write(out.resolve("terrain-profile.json"),RuntimeProfileAgent.json(profile).getBytes(StandardCharsets.UTF_8));
        Class<?> predictorClass=loader.loadClass("amidst.gtnh.worker.VanillaDungeonPredictor");
        Constructor<?> ctor=predictorClass.getDeclaredConstructor();ctor.setAccessible(true);Object predictor=ctor.newInstance();
        Method prepare=predictorClass.getDeclaredMethod("prepareCaveContext",long.class);prepare.setAccessible(true);
        List<Object> masks=new ArrayList<>();
        for(long seed:new long[]{0,-17,9007199254740993L,Long.MIN_VALUE,Long.MAX_VALUE}) {
            prepare.invoke(predictor,seed);
            String generator=field(predictor,"caveGenerator").getClass().getName();
            if(!generator.equals("net.minecraft.world.gen.MapGenCaves"))throw new IllegalStateException("Unreviewed cave generator "+generator);
            for(int[] p:new int[][]{{0,0},{-1,-1},{-17,8},{80,-120},{256,-512},{1874900,-1874900},{-1874900,1874900}}) {
                Object mask=invoke(predictor,"getCaveMask",p[0],p[1]);BitSet air=(BitSet)field(mask,"air"),solid=(BitSet)field(mask,"solid");
                byte[] cells=new byte[65536];for(int i=0;i<cells.length;i++)cells[i]=(byte)(air.get(i)?1:solid.get(i)?0:2);
                StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(cells))hash.append(String.format("%02x",b&255));
                masks.add(map("seed",Long.toString(seed),"cx",p[0],"cz",p[1],"sha256",hash.toString(),"air",air.cardinality(),"solid",solid.cardinality()));
            }
        }
        Files.write(out.resolve("cave-oracle.json"),RuntimeProfileAgent.json(map("schemaVersion",1,"masks",masks)).getBytes(StandardCharsets.UTF_8));
    }
}
