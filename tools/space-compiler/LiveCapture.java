package amidst.web.profile;
import java.lang.instrument.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.jar.*;

/** Isolated, read-only capture of seed-only layer graphs and original generator bytecode. */
public final class LiveCapture {
    static Object field(Object o,String name)throws Exception{
        Class<?> type=o instanceof Class?(Class<?>)o:o.getClass();
        for(Class<?> c=type;c!=null;c=c.getSuperclass())try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(o instanceof Class?null:o);}catch(NoSuchFieldException ignored){}
        throw new NoSuchFieldException(type.getName()+"."+name);
    }
    static Map<String,Object> map(Object...v){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<v.length;i+=2)m.put((String)v[i],v[i+1]);return m;}
    static String json(Object v){
        if(v==null)return "null";if(v instanceof String)return "\""+((String)v).replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r")+"\"";
        if(v instanceof Map){List<String> a=new ArrayList<>();for(Object k:((Map)v).keySet())a.add(json(k)+":"+json(((Map)v).get(k)));return "{"+String.join(",",a)+"}";}
        if(v instanceof Iterable){List<String> a=new ArrayList<>();for(Object x:(Iterable)v)a.add(json(x));return "["+String.join(",",a)+"]";}
        return String.valueOf(v);
    }
    static ClassLoader loader;static Class<?> layer,biome;static Set<Class<?>> classes=new HashSet<>();
    static IdentityHashMap<Object,Integer> seen;static List<Object> nodes;
    static Object value(Object v)throws Exception{
        if(v==null||v instanceof String||v instanceof Boolean||v instanceof Integer||v instanceof Float||v instanceof Double)return v;
        if(v instanceof Long)return map("long",v.toString());
        if(v instanceof Enum){classes.add(v.getClass());return map("enum",v.getClass().getName(),"name",((Enum)v).name());}
        if(layer.isInstance(v))return map("node",node(v));
        if(biome.isInstance(v))return map("biome",field(v,"field_76756_M"));
        if(v.getClass().isArray()){List<Object> a=new ArrayList<>();for(int i=0;i<Array.getLength(v);i++)a.add(value(Array.get(v,i)));return a;}
        if(v instanceof Iterable){List<Object>a=new ArrayList<>();for(Object x:(Iterable)v)a.add(value(x));return a;}
        if(v.getClass().getName().equals("net.minecraftforge.common.BiomeManager$BiomeEntry"))return map("biome",value(field(v,"biome")),"weight",field(v,"field_76292_a"));
        if(v.getClass().getName().equals("net.minecraft.world.WorldType"))return map("worldType",field(v,"field_77133_f"));
        throw new IllegalStateException("Review captured layer field type "+v.getClass().getName());
    }
    static int node(Object o)throws Exception{
        if(seen.containsKey(o))return seen.get(o);int id=nodes.size();seen.put(o,id);Map<String,Object> f=new TreeMap<>();nodes.add(map("class",o.getClass().getName(),"fields",f));
        for(Class<?> c=o.getClass();c!=Object.class;c=c.getSuperclass()){
            classes.add(c);
            for(Field p:c.getDeclaredFields())if(!Modifier.isStatic(p.getModifiers())){p.setAccessible(true);f.put(c.getName()+"#"+p.getName(),value(p.get(o)));}
        }return id;
    }
    static Object graph(Object manager)throws Exception{
        seen=new IdentityHashMap<>();nodes=new ArrayList<>();Map<String,Object> roots=new TreeMap<>();
        for(Class<?> c=manager.getClass();c!=Object.class;c=c.getSuperclass())for(Field f:c.getDeclaredFields())if(layer.isAssignableFrom(f.getType())){f.setAccessible(true);Object v=f.get(manager);if(v!=null)roots.put(c.getName()+"#"+f.getName(),node(v));}
        List<Object> oracle=new ArrayList<>();Object[] objects=new Object[nodes.size()];for(Map.Entry<Object,Integer> e:seen.entrySet())objects[e.getValue()]=e.getKey();
        for(Object o:objects){int[] a=(int[])layer.getMethod("func_75904_a",int.class,int.class,int.class,int.class).invoke(o,4097,-8193,8,8);List<Object> pixels=new ArrayList<>();for(int i=0;i<64;i++)pixels.add(a[i]);oracle.add(pixels);}
        return map("manager",manager.getClass().getName(),"roots",roots,"nodes",nodes,"oracle",oracle);
    }
    static Object manager(String name,Object worldType)throws Exception{
        Class<?> c=loader.loadClass(name);try{return c.getConstructor(long.class).newInstance(0L);}catch(NoSuchMethodException e){return c.getConstructor(long.class,loader.loadClass("net.minecraft.world.WorldType")).newInstance(0L,worldType);}
    }
    public static void agentmain(String directory,final Instrumentation inst)throws Exception{
        final Path out=Paths.get(directory);Files.createDirectories(out);
        Class<?> hooks=null;for(Class<?> c:inst.getAllLoadedClasses())if(c.getName().equals("amidst.gtnh.worker.WorkerTickHooks"))hooks=c;
        if(hooks==null)throw new IllegalStateException("Loaded Worker required");loader=hooks.getClassLoader();
        final BlockingQueue<Runnable> queue=(BlockingQueue<Runnable>)field(field(hooks,"worker"),"serverThreadQueries");
        FutureTask<Void> task=new FutureTask<>(()->{
            layer=loader.loadClass("net.minecraft.world.gen.layer.GenLayer");biome=loader.loadClass("net.minecraft.world.biome.BiomeGenBase");
            Class<?> wt=loader.loadClass("net.minecraft.world.WorldType");Object normal=field(wt,"field_77137_b");
            Map<String,Object> graphs=new LinkedHashMap<>();
            for(String[] def:new String[][]{{"io","galaxyspace.SolarSystem.moons.io.dimension.WorldChunkManagerIo"},{"pluto","galaxyspace.SolarSystem.planets.pluto.dimension.WorldChunkManagerPluto"},{"nether","biomesoplenty.common.world.WorldChunkManagerBOPHell"},{"vanilla","net.minecraft.world.biome.WorldChunkManager"},{"barnarda_c","galaxyspace.BarnardsSystem.planets.barnardaC.dimension.WorldChunkManagerBarnardaC"}})graphs.put(def[0],graph(manager(def[1],normal)));
            Object types=field(wt,"field_77139_a");for(int i=0;i<Array.getLength(types);i++){Object t=Array.get(types,i);if(t!=null&&"RWG".equals(field(t,"field_77133_f")))graphs.put("rwg_vanilla",graph(manager("net.minecraft.world.biome.WorldChunkManager",t)));}
            Class<?> predictor=loader.loadClass("amidst.gtnh.worker.SpaceStructurePredictor");Constructor<?> ctor=predictor.getDeclaredConstructor();ctor.setAccessible(true);Object p=ctor.newInstance();
            Method prepare=predictor.getDeclaredMethod("prepareAsteroidDensity",long.class);prepare.setAccessible(true);prepare.invoke(p,0L);
            for(Class<?> c:inst.getAllLoadedClasses())if(c.getName().startsWith("micdoodle8.mods.galacticraft.core.perlin.")||c.getName().endsWith(".RandomAid"))classes.add(c);
            classes.add(loader.loadClass("buildcraft.core.lib.utils.SimplexNoise"));classes.add(loader.loadClass("com.mitchej123.hodgepodge.core.fml.hooks.mc.RandomAid"));
            for(String name:new String[]{"buildcraft.core.lib.utils.SimplexNoise$Grad","net.minecraft.world.gen.layer.GenLayerEdge$SwitchMode","net.minecraft.world.gen.layer.GenLayer$1","net.minecraft.world.gen.layer.GenLayer$2"})classes.add(loader.loadClass(name));
            Class<?> config=loader.loadClass("bartworks.common.configs.Configuration");Object cross=field(config,"crossModInteractions");
            Map<String,Object> biomeFields=new TreeMap<>();List<Object> biomeData=new ArrayList<>();
            for(Field f:biome.getDeclaredFields())if(Modifier.isStatic(f.getModifiers())&&biome.isAssignableFrom(f.getType())){f.setAccessible(true);Object b=f.get(null);if(b!=null)biomeFields.put(f.getName(),field(b,"field_76756_M"));}
            Object all=field(biome,"field_76773_a");for(int i=0;i<Array.getLength(all);i++){Object b=Array.get(all,i);if(b!=null)biomeData.add(map("id",i,"class",((Class)biome.getMethod("func_150562_l").invoke(b)).getName(),"temperature",field(b,"field_76750_F"),"snow",biome.getMethod("func_150559_j").invoke(b),"category",biome.getMethod("func_150561_m").invoke(b).toString(),"name",field(b,"field_76791_y")));}
            Class<?> bm=loader.loadClass("net.minecraftforge.common.BiomeManager"),bt=loader.loadClass("net.minecraftforge.common.BiomeManager$BiomeType");List<Object> modded=new ArrayList<>();for(Object type:bt.getEnumConstants())modded.add(bm.getMethod("isTypeListModded",bt).invoke(null,type));Object ocean=value(field(bm,"oceanBiomes"));
            Map<String,Object> equal=new TreeMap<>();for(Object record:biomeData){int a=(Integer)((Map)record).get("id");List<Object> matches=new ArrayList<>();for(Object other:biomeData){int b=(Integer)((Map)other).get("id");if(Boolean.TRUE.equals(biome.getMethod("func_150569_a",biome).invoke(Array.get(all,a),Array.get(all,b))))matches.add(b);}equal.put(Integer.toString(a),matches);}
            List<Object> effectiveOcean=new ArrayList<>();for(int i=0;i<Array.getLength(all);i++)if(Array.get(all,i)!=null&&((List)field(bm,"oceanBiomes")).contains(Array.get(all,i)))effectiveOcean.add(map("biome",i));ocean=effectiveOcean;
            final Map<String,byte[]> bytes=new ConcurrentHashMap<>();final Set<String> allowed=new HashSet<>();for(Class<?> c:classes)allowed.add(c.getName().replace('.','/'));
            ClassFileTransformer observer=new ClassFileTransformer(){public byte[] transform(ClassLoader l,String n,Class<?> c,ProtectionDomain d,byte[] b){if(c!=null&&allowed.contains(n))bytes.put(n,b.clone());return null;}};
            inst.addTransformer(observer,true);try{inst.retransformClasses(classes.toArray(new Class<?>[0]));}finally{inst.removeTransformer(observer);}
            Map<String,Object> hashes=new TreeMap<>();try(JarOutputStream jar=new JarOutputStream(Files.newOutputStream(out.resolve("input.jar")))){for(String n:new TreeSet<>(allowed)){byte[] b=bytes.get(n);if(b==null)throw new IllegalStateException("Missing "+n);jar.putNextEntry(new JarEntry(n+".class"));jar.write(b);jar.closeEntry();StringBuilder h=new StringBuilder();for(byte x:MessageDigest.getInstance("SHA-256").digest(b))h.append(String.format("%02x",x&255));hashes.put(n,h.toString());}}
            Files.write(out.resolve("profile.json"),json(map("schemaVersion",1,"graphs",graphs,"inputClasses",hashes,"biomeFields",biomeFields,"biomes",biomeData,"biomeEquals",equal,"moddedBiomeTypes",modded,"oceanBiomes",ocean,"rossRuinChance",field(cross,"ross128bRuinChance"),"disableMagicalForest",field(cross,"disableMagicalForest"))).getBytes(StandardCharsets.UTF_8));
            return null;
        });queue.add(task);try{task.get(45,TimeUnit.SECONDS);}catch(Exception e){task.cancel(false);queue.remove(task);throw e;}
    }
}
