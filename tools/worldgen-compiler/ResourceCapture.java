package amidst.web.profile;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Read only initialized GT/VP registries on the existing Worker's tick queue.
 * No transforms, world access, terrain requests or saved prospecting records. */
public final class ResourceCapture {
    static Object field(Object owner,String name) throws Exception {
        Class<?> type=owner instanceof Class?(Class<?>)owner:owner.getClass();
        for(Class<?> c=type;c!=null;c=c.getSuperclass())try {
            Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(owner instanceof Class?null:owner);
        }catch(NoSuchFieldException ignored){}
        throw new NoSuchFieldException(name);
    }
    static Object invoke(Object owner,String name,Object... args) throws Exception {
        Class<?> type=owner instanceof Class?(Class<?>)owner:owner.getClass();
        for(Class<?> c=type;c!=null;c=c.getSuperclass())for(Method m:c.getDeclaredMethods()) {
            if(!m.getName().equals(name)||m.getParameterTypes().length!=args.length)continue;
            boolean fits=true;Class<?>[] types=m.getParameterTypes();
            for(int i=0;i<args.length;i++)if(args[i]!=null&&!types[i].isInstance(args[i])
                &&!(types[i]==int.class&&args[i] instanceof Integer))fits=false;
            if(fits){m.setAccessible(true);return m.invoke(owner instanceof Class?null:owner,args);}
        }
        throw new NoSuchMethodException(type.getName()+"."+name);
    }
    static Map<String,Object> map(Object... args) {
        Map<String,Object> result=new LinkedHashMap<>();for(int i=0;i<args.length;i+=2)result.put((String)args[i],args[i+1]);return result;
    }
    private static String clean(Object s){return String.valueOf(s).replaceAll("\u00a7.","");}
    private static String color(Object n){return String.format("#%06x",((Number)n).intValue()&0xffffff);}
    public static void agentmain(String directory,Instrumentation instrumentation) throws Exception {
        final Path out=Paths.get(directory).toAbsolutePath().normalize();Files.createDirectories(out);
        Class<?> hooks=null;
        for(Class<?> c:instrumentation.getAllLoadedClasses())if(c.getName().equals("amidst.gtnh.worker.WorkerTickHooks"))hooks=c;
        if(hooks==null)throw new IllegalStateException("Loaded Worker required");
        final Object server=field(hooks,"worker");final ClassLoader loader=hooks.getClassLoader();
        final BlockingQueue<Runnable> queue=(BlockingQueue<Runnable>)field(server,"serverThreadQueries");
        FutureTask<Void> task=new FutureTask<>(new Callable<Void>(){public Void call() throws Exception {
            Object service=field(server,"prospectingService");invoke(service,"catalog");
            Map<?,?> definitions=(Map<?,?>)field(service,"definitions"), fluids=(Map<?,?>)field(service,"fluidDefinitions"), names=(Map<?,?>)field(service,"names");
            if(names.size()>128)throw new IllegalStateException("Unexpected dimension count");
            Class<?> queries=loader.loadClass("gregtech.common.worldgen.WorldgenQuery");
            Class<?> veins=loader.loadClass("com.sinthoras.visualprospecting.database.veintypes.VeinTypeCaching");
            Class<?> pos=loader.loadClass("com.sinthoras.visualprospecting.database.OreVeinPosition");
            Class<?> loc=loader.loadClass("com.sinthoras.visualprospecting.integration.model.locations.OreVeinLocation");
            Class<?> source=loader.loadClass("com.sinthoras.visualprospecting.database.VeinSource");
            Class<?> textures=loader.loadClass("amidst.gtnh.worker.ProspectingTextures");
            Class<?> fluidLoc=loader.loadClass("com.sinthoras.visualprospecting.integration.model.locations.UndergroundFluidLocation");
            List<Object> dimensions=new ArrayList<>();Map<String,Object> metadata=new LinkedHashMap<>();
            for(Object id:names.keySet()) {
                Map<String,Object> dimension=map("id",id,"name",names.get(id));dimensions.add(dimension);
                Object def=definitions.get(id);
                if(def!=null) {
                    dimension.put("oreChance",invoke(def,"getOreVeinChance"));
                    Object query=invoke(invoke(queries,"veins"),"inDimension",names.get(id));
                    if(!Boolean.TRUE.equals(field(query,"checkWeight")))throw new IllegalStateException("Weighted query required");
                    List<?> layers=(List<?>)field(query,"list");if(layers.size()>4096)throw new IllegalStateException("Too many ore layers");
                    List<Object> candidates=new ArrayList<>();dimension.put("ores",candidates);
                    for(Object layer:layers)if(Boolean.TRUE.equals(invoke(query,"matches",layer))) {
                        String key=(String)field(layer,"mWorldGenName");
                        Object vein=invoke(veins,"getVeinType",key);String display=null;
                        if(vein!=null&&field(vein,"representativeOre")!=null) {
                            display=id+":"+key;
                            Object position=pos.getConstructors()[0].newInstance(id,0,0,vein,false,source.getEnumConstants()[0]);
                            Object location=loc.getConstructors()[0].newInstance(position);
                            metadata.put(display,map("id",field(vein,"name"),"name",clean(invoke(vein,"getVeinName")),
                                "materials",clean(invoke(vein,"getOreMaterialNames")),"minY",field(vein,"minBlockY"),"maxY",field(vein,"maxBlockY"),
                                "color",color(invoke(location,"getColor")),"icon",invoke(textures,"oreIcon",location)));
                        }
                        // Preserve invisible candidates and list order: both affect selection.
                        candidates.add(map("weight",invoke(layer,"getWeight"),"display",display));
                    }
                }
                Object fluidDim=fluids.get(id);
                if(fluidDim!=null) {
                    dimension.put("fluidWeight",field(fluidDim,"maxChance"));List<Object> entries=new ArrayList<>();dimension.put("fluids",entries);
                    Map<?,?> registered=(Map<?,?>)invoke(fluidDim,"getFluids");
                    if(registered.size()>1024)throw new IllegalStateException("Too many fluids");
                    // HashBiMap iteration order is part of GT's selector; never sort it.
                    for(Object entry:registered.values()) {
                        Object fluid=invoke(entry,"getFluid");int min=(Integer)field(entry,"MinAmount"),max=(Integer)field(entry,"MaxAmount");
                        Map<String,Object> f=map("weight",field(entry,"Chance"),"min",min,"max",max,
                            "drawBound",(int)Math.floor(Math.pow(max*100.0*5000.0,.2)),"minRoot",Math.pow(min*100.0*5000.0,.2),"display",null);
                        if(fluid!=null)f.put("display",map("id",invoke(fluid,"getName"),"name",clean(invoke(fluid,"getLocalizedName")),"color",color(invoke(fluidLoc,"resolveColor",fluid))));
                        entries.add(f);
                    }
                }
            }
            String pattern=String.valueOf(invoke(loader.loadClass("gregtech.common.GTWorldgenerator"),"getOregenPattern"));
            Map<String,Object> result=map("schemaVersion",1,"source","initialized GT/VP registries; no save data",
                "orePattern",pattern.equals("EQUAL_SPACING")?pattern:"LEGACY","runtimeOrePattern",pattern,"dimensions",dimensions,"ores",metadata);
            Files.write(out.resolve("resource-profile.json"),RuntimeProfileAgent.json(result).getBytes(StandardCharsets.UTF_8));
            SurfaceStructureCapture.capture(loader,out);
            return null;
        }});
        queue.add(task);
        try{task.get(30,TimeUnit.SECONDS);}catch(Exception e){task.cancel(false);queue.remove(task);throw e;}
    }
}
