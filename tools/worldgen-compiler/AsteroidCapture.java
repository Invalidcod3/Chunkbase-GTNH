package amidst.web.profile;
import static amidst.web.profile.ResourceCapture.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Initialized selectors only. Oracle owns its predictor; never changes the live Worker or world. */
final class AsteroidCapture {
    static boolean freshExcludes(ClassLoader loader,Method island,long seed,int cx,int cz)throws Exception {
        Class<?> region=loader.loadClass("gregtech.common.worldgen.HEEIslandScanner$RegionInfo");
        Constructor<?> constructor=region.getDeclaredConstructor(int.class,int.class);constructor.setAccessible(true);
        for(int rz=(cz-7)>>5;rz<=((cz+7)>>5);rz++)for(int rx=(cx-7)>>5;rx<=((cx+7)>>5);rx++) {
            int bx=rx*32,bz=rz*32;Object local=constructor.newInstance(bx,bz);BitSet bits=(BitSet)field(local,"presence");
            // Feed original RegionInfo.check with fresh-seed presence, bypassing the live-world cache.
            for(int iz=Math.floorDiv(bz-7,28);iz<=Math.floorDiv(bz+24,28);iz++)for(int ix=Math.floorDiv(bx-7,28);ix<=Math.floorDiv(bx+24,28);ix++) {
                Object b=island.invoke(null,seed,ix,iz);if(b==null)continue;
                int x=(Integer)field(b,"chunkX")+7-bx,z=(Integer)field(b,"chunkZ")+7-bz;
                if(x>=0&&x<32&&z>=0&&z<32)bits.set(x+z*32);
            }
            if(Boolean.TRUE.equals(invoke(local,"check",cx-7,cx+7,cz-7,cz+7)))return true;
        }
        return false;
    }
    static void capture(ClassLoader loader,Path out)throws Exception {
        Object def=field(field(loader.loadClass("galacticgreg.api.enums.DimensionDef"),"EndAsteroids"),"modDimensionDef");
        Object config=invoke(loader.loadClass("galacticgreg.dynconfig.DynamicDimensionConfig"),"getAsteroidConfig",def);
        List<Object> materials=new ArrayList<>();
        Class<?> queries=loader.loadClass("gregtech.common.worldgen.WorldgenQuery");
        for(Object stone:(List<?>)invoke(def,"getAsteroidMaterials")) {
            Object query=invoke(invoke(invoke(queries,"veins"),"inDimension",def),"inStone",invoke(stone,"getCategory"));
            if(!Boolean.TRUE.equals(field(query,"checkWeight")))throw new IllegalStateException("Weighted asteroid query required");
            List<Object> entries=new ArrayList<>();
            for(Object layer:(List<?>)field(query,"list"))if(Boolean.TRUE.equals(invoke(query,"matches",layer)))
                entries.add(map("name",field(layer,"mWorldGenName"),"weight",invoke(layer,"getWeight")));
            materials.add(entries);
        }
        Class<?> chaos=loader.loadClass("com.brandon3055.draconicevolution.common.handler.ConfigHandler");
        Object galactic=field(loader.loadClass("galacticgreg.GalacticGreg"),"GalacticConfig");
        Map<String,Object> profile=map("schemaVersion",1,"algorithm","galacticgreg-current","enabled",field(config,"Enabled"),
            "probability",field(config,"Probability"),"minY",field(config,"AsteroidMinY"),"maxY",field(config,"AsteroidMaxY"),"materials",materials,
            "chaosRadius",field(galactic,"ChaosIslandExclusionRadius"),"chaosSeparation",field(chaos,"chaosIslandSeparation"),
            "chaosEnabled",Boolean.TRUE.equals(field(chaos,"generateChaosIslands"))&&Boolean.TRUE.equals(field(loader.loadClass("com.brandon3055.draconicevolution.common.world.DraconicWorldGenerator"),"chaosIslandsEnabled")));
        Files.write(out.resolve("asteroid-profile.json"),RuntimeProfileAgent.json(profile).getBytes(StandardCharsets.UTF_8));

        Class<?> type=loader.loadClass("amidst.gtnh.worker.EndAsteroidPredictor");
        Constructor<?> constructor=type.getDeclaredConstructor();constructor.setAccessible(true);Object predictor=constructor.newInstance();
        invoke(predictor,"prepareRuntimeRegistry");
        // Only these fields on this private, new instance are changed: detach world-dependent exclusions.
        for(String name:new String[]{"currentHeeExclusion","currentChaosExclusion"}) {Field f=type.getDeclaredField(name);f.setAccessible(true);f.set(predictor,null);}
        Method select=type.getDeclaredMethod("selectCurrent",long.class,int.class,int.class);select.setAccessible(true);
        Method island=loader.loadClass("amidst.gtnh.worker.EndStructurePredictor").getDeclaredMethod("biomeIslandInRegion",long.class,int.class,int.class);island.setAccessible(true);
        List<Object> samples=new ArrayList<>(),islands=new ArrayList<>(),exclusions=new ArrayList<>(),fresh=new ArrayList<>();
        Random points=new Random(7381902L);
        for(long seed:new long[]{0,-17,9007199254740993L,Long.MIN_VALUE,Long.MAX_VALUE})for(int i=0;i<2048;i++) {
            int x=points.nextInt(3750000)-1875000,z=points.nextInt(3750000)-1875000;
            if(i<512){x=points.nextInt(512)-256;z=points.nextInt(512)-256;}
            Object c=select.invoke(predictor,seed,x,z);
            samples.add(map("seed",Long.toString(seed),"cx",x,"cz",z,"result",c==null?null:map("kind",field(c,"kind"),"x",field(c,"x"),"z",field(c,"z"))));
            if(i<512)fresh.add(map("seed",Long.toString(seed),"cx",x,"cz",z,"excluded",freshExcludes(loader,island,seed,x,z)));
            if(i<128) {
                int rx=points.nextInt(100)-50,rz=points.nextInt(100)-50;Object b=island.invoke(null,seed,rx,rz);
                islands.add(map("seed",Long.toString(seed),"rx",rx,"rz",rz,"result",b==null?null:map("cx",field(b,"chunkX"),"cz",field(b,"chunkZ"))));
            }
        }
        Class<?> locator=loader.loadClass("gregtech.common.worldgen.ChaosIslandLocator");
        int separation=(Integer)profile.get("chaosSeparation");
        for(int center:new int[]{-2,-1,0,1,2})for(int dx=-50;dx<=50;dx++)for(int dz:new int[]{-25,-1,0,1,25}) {
            int cx=center*separation/16+dx,cz=dz;
            exclusions.add(map("cx",cx,"cz",cz,"excluded",invoke(locator,"isWithinRange",cx,cz,profile.get("chaosRadius"))));
        }
        Files.write(out.resolve("asteroid-oracle.json"),RuntimeProfileAgent.json(map("schemaVersion",1,"selection",samples,"islands",islands,"chaos",exclusions,"freshExclusions",fresh)).getBytes(StandardCharsets.UTF_8));
    }
}
