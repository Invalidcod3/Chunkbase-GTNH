package amidst.web.profile;
import static amidst.web.profile.ResourceCapture.*;
import amidst.gtnh.worker.AsteroidReferenceBridge;
import java.lang.instrument.Instrumentation;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Read-only initialized registries, on the Worker's owning tick thread. */
public final class AsteroidResourceCapture {
    static Object call(Object owner,String name,Object...args)throws ReflectiveOperationException {
        try{return invoke(owner,name,args);}catch(ReflectiveOperationException e){throw e;}catch(Exception e){throw new IllegalStateException(e);}
    }
    static Map<String,Object> describe(Object layer,boolean small)throws Exception {
        String name=(String)invoke(layer,"getName");Map<String,String> materials=new LinkedHashMap<>();
        for(float control:new float[]{0,.25F,.5F,.75F,.999F}) {
            Object m=invoke(layer,"getOre",control);
            if(m!=null){String label;try{label=(String)invoke(m,"getLocalizedName");}catch(NoSuchMethodException e){label=(String)invoke(m,"getDefaultLocalName");}
                materials.put((String)invoke(m,"getInternalName"),label.replaceAll("\u00a7.",""));}
        }
        String names=String.join(", ",materials.values());Object m=invoke(layer,"getOre",.5F);
        short[] rgba=m==null?null:(short[])invoke(m,"getRGBA");
        int color=rgba==null?0xaaaacc:(rgba[0]&255)<<16|(rgba[1]&255)<<8|rgba[2]&255;
        return map("id",(small?"asteroid.small:":"asteroid.vein:")+name,"name",names.isEmpty()?name:names,"materials",names,"color",String.format("#%06x",color));
    }
    static Object query(Class<?> queries,Object def,Object stone,boolean small)throws ReflectiveOperationException {
        return call(call(call(queries,small?"small":"veins"),"inDimension",def),"inStone",call(stone,"getCategory"));
    }
    public static void agentmain(String directory,Instrumentation instrumentation)throws Exception {
        final Path out=Paths.get(directory);Files.createDirectories(out);
        Class<?> hooks=null;for(Class<?> c:instrumentation.getAllLoadedClasses())if(c.getName().equals("amidst.gtnh.worker.WorkerTickHooks"))hooks=c;
        if(hooks==null)throw new IllegalStateException("Loaded Worker required");
        final ClassLoader loader=hooks.getClassLoader();final Object server=field(hooks,"worker");
        BlockingQueue<Runnable> queue=(BlockingQueue<Runnable>)field(server,"serverThreadQueries");
        FutureTask<Void> task=new FutureTask<>(()->{
            Object service=field(server,"prospectingService");invoke(service,"catalog");
            Map<?,?> defs=(Map<?,?>)field(service,"definitions"),names=(Map<?,?>)field(service,"names");
            Class<?> type=loader.loadClass("galacticgreg.api.enums.DimensionDef"),queries=loader.loadClass("gregtech.common.worldgen.WorldgenQuery");
            Object end=field(field(type,"TheEnd"),"modDimensionDef");
            List<Object> dimensions=new ArrayList<>(),samples=new ArrayList<>();Random points=new Random(19820317L);
            for(Object id:defs.keySet()) {
                Object base=defs.get(id);boolean isEnd=base==end;
                final Object def=isEnd?field(field(type,"EndAsteroids"),"modDimensionDef"):base;
                if(!Boolean.TRUE.equals(invoke(def,"generatesAsteroids")))continue;
                if(!isEnd&&Boolean.TRUE.equals(invoke(base,"generatesOre")))throw new IllegalStateException("Review mixed asteroid/ordinary dimension");
                Object config=invoke(loader.loadClass("galacticgreg.dynconfig.DynamicDimensionConfig"),"getAsteroidConfig",def);
                final boolean enabled=(Boolean)field(config,"Enabled");
                final int chance=(Integer)field(config,"Probability"),minY=(Integer)field(config,"AsteroidMinY"),maxY=(Integer)field(config,"AsteroidMaxY"),min=(Integer)field(config,"MinSize"),max=(Integer)field(config,"MaxSize");
                List<Object> materials=new ArrayList<>();
                for(Object stone:(List<?>)invoke(def,"getAsteroidMaterials")) {
                    Map<String,Object> material=new LinkedHashMap<>();materials.add(material);
                    for(boolean small:new boolean[]{false,true}) {
                        Object q=query(queries,def,stone,small);if(!Boolean.TRUE.equals(field(q,"checkWeight")))throw new IllegalStateException("Weighted query required");
                        List<Object> entries=new ArrayList<>();material.put(small?"small":"veins",entries);
                        for(Object layer:(List<?>)field(q,"list"))if(Boolean.TRUE.equals(invoke(q,"matches",layer)))entries.add(map("weight",invoke(layer,"getWeight"),"display",describe(layer,small)));
                    }
                }
                dimensions.add(map("id",id,"name",names.get(id),"routing",isEnd?"end":"asteroids","config",map("enabled",enabled,"probability",chance,"minY",minY,"maxY",maxY,"minRadius",min,"maxRadius",max),"materials",materials));
                AsteroidReferenceBridge.Registry registry=new AsteroidReferenceBridge.Registry(){
                    public Object stone(Random r)throws ReflectiveOperationException{return call(def,"getRandomAsteroidMaterial",r);}
                    public Object ore(Object s,boolean small,Random r)throws ReflectiveOperationException{return call(query(queries,def,s,small),"findRandom",r);}
                };
                for(long seed:new long[]{0,1,-17,9007199254740993L,Long.MIN_VALUE,Long.MAX_VALUE})for(int i=0;i<768;i++) {
                    int cx=points.nextInt(3750000)-1875000,cz=points.nextInt(3750000)-1875000;
                    if(i<384){cx=points.nextInt(512)-256;cz=points.nextInt(512)-256;}
                    Object[] c=AsteroidReferenceBridge.select(seed,(Integer)id,cx,cz,enabled,chance,minY,maxY,min,max,registry);
                    Map<String,Object> result=null;
                    if(c!=null){result=describe(c[0],(Boolean)c[1]);int y=(Integer)c[3],size=2*(Integer)c[5];result.putAll(map("kind",(Boolean)c[1]?"ASTEROID_SMALL":"ASTEROID_VEIN","source","PREDICTED","x",c[2],"y",y,"z",c[4],"size",size,"minY",Math.max(0,y-size-1),"maxY",Math.min(254,y+size)));}
                    samples.add(map("seed",Long.toString(seed),"dimension",id,"cx",cx,"cz",cz,"result",result));
                }
            }
            Class<?> mods=loader.loadClass("gregtech.api.enums.Mods"),chaos=loader.loadClass("com.brandon3055.draconicevolution.common.handler.ConfigHandler");
            Object galactic=field(loader.loadClass("galacticgreg.GalacticGreg"),"GalacticConfig");
            Map<String,Object> endConfig=map("heeEnabled",invoke(field(mods,"HardcoreEnderExpansion"),"isModLoaded"),"chaosEnabled",Boolean.TRUE.equals(field(chaos,"generateChaosIslands"))&&Boolean.TRUE.equals(field(loader.loadClass("com.brandon3055.draconicevolution.common.world.DraconicWorldGenerator"),"chaosIslandsEnabled")),"chaosSeparation",field(chaos,"chaosIslandSeparation"),"chaosRadius",field(galactic,"ChaosIslandExclusionRadius"));
            Files.write(out.resolve("asteroid-resource-profile.json"),RuntimeProfileAgent.json(map("schemaVersion",1,"algorithm","galacticgreg-asteroid-resources","end",endConfig,"dimensions",dimensions)).getBytes(StandardCharsets.UTF_8));
            Files.write(out.resolve("asteroid-resource-oracle.json"),RuntimeProfileAgent.json(map("schemaVersion",1,"samples",samples)).getBytes(StandardCharsets.UTF_8));
            return null;
        });
        queue.add(task);try{task.get(60,TimeUnit.SECONDS);}catch(Exception e){task.cancel(false);queue.remove(task);throw e;}
    }
}
