package amidst.web.profile;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Reads configured dimension providers and seed-only biome managers; never attaches a World. */
public final class LiveCapture {
 static Object field(Object o,String name)throws Exception{
  Class<?> type=o instanceof Class?(Class<?>)o:o.getClass();
  for(Class<?> c=type;c!=null;c=c.getSuperclass())try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(o instanceof Class?null:o);}catch(NoSuchFieldException ignored){}
  throw new NoSuchFieldException(name);
 }
 static Map<String,Object> map(Object...v){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<v.length;i+=2)m.put((String)v[i],v[i+1]);return m;}
 static String json(Object v){
  if(v==null)return "null";if(v instanceof String)return "\""+((String)v).replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r")+"\"";
  if(v instanceof Map){List<String>a=new ArrayList<>();for(Object k:((Map)v).keySet())a.add(json(k)+":"+json(((Map)v).get(k)));return "{"+String.join(",",a)+"}";}
  if(v instanceof Iterable){List<String>a=new ArrayList<>();for(Object x:(Iterable)v)a.add(json(x));return "["+String.join(",",a)+"]";}
  return String.valueOf(v);
 }
 static Object descriptor(Object b,ClassLoader loader)throws Exception{
  List<Object> tags=new ArrayList<>();for(Object t:(Object[])loader.loadClass("net.minecraftforge.common.BiomeDictionary").getMethod("getTypesForBiome",loader.loadClass("net.minecraft.world.biome.BiomeGenBase")).invoke(null,b))tags.add(t.toString());
  return map("id",field(b,"field_76756_M"),"name",field(b,"field_76791_y"),"class",b.getClass().getName(),"mapColor",field(b,"field_76790_z"),"temperature",field(b,"field_76750_F"),"rainfall",field(b,"field_76751_G"),"rootHeight",field(b,"field_76748_D"),"tags",tags);
 }
 public static void agentmain(String directory,Instrumentation inst)throws Exception{
  Path out=Paths.get(directory);Class<?> hooks=null;for(Class<?> c:inst.getAllLoadedClasses())if(c.getName().equals("amidst.gtnh.worker.WorkerTickHooks"))hooks=c;
  if(hooks==null)throw new IllegalStateException("Loaded Worker required");final ClassLoader loader=hooks.getClassLoader();
  BlockingQueue<Runnable> queue=(BlockingQueue<Runnable>)field(field(hooks,"worker"),"serverThreadQueries");
  FutureTask<Void> task=new FutureTask<>(()->{
   List<Object> result=new ArrayList<>();
   Class<?> dm=loader.loadClass("net.minecraftforge.common.DimensionManager");
   for(String line:Files.readAllLines(out.resolve("targets.txt"),StandardCharsets.UTF_8)){
    String[] parts=line.split(" ");int id=Integer.parseInt(parts[1]);Map<String,Object> record=map("key",parts[0],"id",id);result.add(record);
    Object provider=null;
    try{
     Object body=loader.loadClass("micdoodle8.mods.galacticraft.api.galaxies.GalaxyRegistry").getMethod("getCelestialBodyFromDimensionID",int.class).invoke(null,id);
     if(body!=null){record.put("body",body.getClass().getMethod("getName").invoke(body));provider=((Class<?>)body.getClass().getMethod("getWorldProvider").invoke(body)).getConstructor().newInstance();}
     else provider=dm.getMethod("createProviderFor",int.class).invoke(null,id);
     record.put("provider",provider.getClass().getName());
     Class<?> manager;Object m,b;
     if(provider.getClass().getName().equals("toxiceverglades.world.WorldProviderMod")){
      manager=loader.loadClass("toxiceverglades.world.WorldChunkManagerCustom");Class<?> wt=loader.loadClass("net.minecraft.world.WorldType");
      m=manager.getConstructor(long.class,wt).newInstance(0L,field(wt,"field_151360_e"));
      Object base=loader.loadClass("toxiceverglades.biome.GenLayerBiomes").getConstructor(long.class).newInstance(1L);Object allowed=field(base,"allowedBiomes");
      if(Array.getLength(allowed)!=1)throw new IllegalStateException("Everglades no longer has one biome");b=Array.get(allowed,0);record.put("constantSource",base.getClass().getName());
     }else{manager=(Class<?>)provider.getClass().getMethod("getWorldChunkManagerClass").invoke(provider);m=manager.getConstructor().newInstance();b=manager.getMethod("getBiome").invoke(m);}
     record.put("manager",manager.getName());record.put("biome",descriptor(b,loader));
     List<Object> samples=new ArrayList<>();
     for(int[] p:new int[][]{{0,0},{-513,-257},{4097,-8193},{29990000,-29999000}}){
      Class<?> array=Array.newInstance(loader.loadClass("net.minecraft.world.biome.BiomeGenBase"),0).getClass();
      Object pixels=manager.getMethod("func_76931_a",array,int.class,int.class,int.class,int.class,boolean.class).invoke(m,null,p[0],p[1],4,4,false);
      List<Object> ids=new ArrayList<>();for(int i=0;i<Array.getLength(pixels);i++)ids.add(field(Array.get(pixels,i),"field_76756_M"));samples.add(map("x",p[0],"z",p[1],"ids",ids));
     }
     record.put("samples",samples);
     List<Object> ancestry=new ArrayList<>();for(Class<?> c=manager;c!=null;c=c.getSuperclass())ancestry.add(c.getName());record.put("ancestry",ancestry);
    }catch(ReflectiveOperationException e){record.put("pending",e.toString());List<Object> methods=new ArrayList<>();if(provider!=null)for(Method m:provider.getClass().getDeclaredMethods())methods.add(m.toString());record.put("methods",methods);}
   }
   Files.write(out.resolve("profile.json"),json(map("schemaVersion",1,"source","initialized dimension registry; no World or save access","dimensions",result)).getBytes(StandardCharsets.UTF_8));return null;
  });queue.add(task);try{task.get(45,TimeUnit.SECONDS);}catch(Exception e){task.cancel(false);queue.remove(task);throw e;}
 }
}
