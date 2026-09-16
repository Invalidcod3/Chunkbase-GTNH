package amidst.web.profile;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
/** Tick-thread registry/configuration snapshot. Never reads or generates a chunk. */
public final class LiveCapture {
 static Object field(Object o,String... names)throws Exception {
  for(Class<?> c=o instanceof Class?(Class<?>)o:o.getClass();c!=null;c=c.getSuperclass())for(String name:names)try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(o instanceof Class?null:o);}catch(NoSuchFieldException ignored){}
  throw new NoSuchFieldException(Arrays.toString(names));
 }
 static Object call(Object o,String name,Class<?>[] types,Object... args)throws Exception{return o.getClass().getMethod(name,types).invoke(o,args);}
 static Class<?> blockType,biomeType;static Object registry;
 static String block(Object b)throws Exception {if(b==null)return null;return String.valueOf(call(registry,"func_148750_c",new Class<?>[]{Object.class},b));}
 static Map<String,Object> map(Object... pairs){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m;}
 static final IdentityHashMap<Object,Integer> seen=new IdentityHashMap<>();static final List<Object> nodes=new ArrayList<>();
 static Object value(Object v)throws Exception {
  if(v==null||v instanceof Number||v instanceof String||v instanceof Boolean)return v;
  if(blockType.isInstance(v))return map("block",block(v));
  if(biomeType.isInstance(v))return map("biomeId",field(v,"field_76756_M"));
  if(v.getClass().isArray()){int n=Array.getLength(v);if(n>4096)throw new IllegalStateException("Oversized array");List<Object>a=new ArrayList<>();for(int i=0;i<n;i++)a.add(value(Array.get(v,i)));return a;}
  if(!v.getClass().getName().startsWith("rwg."))return map("externalClass",v.getClass().getName());
  if(seen.containsKey(v))return map("ref",seen.get(v));if(nodes.size()>=4096)throw new IllegalStateException("Oversized graph");
  int id=nodes.size();seen.put(v,id);Map<String,Object> fields=new LinkedHashMap<>();nodes.add(map("class",v.getClass().getName(),"fields",fields));
  for(Class<?> c=v.getClass();c!=null&&c.getName().startsWith("rwg.");c=c.getSuperclass()){
   Field[] fs=c.getDeclaredFields();Arrays.sort(fs,Comparator.comparing(Field::getName));
   for(Field f:fs)if(!Modifier.isStatic(f.getModifiers())){f.setAccessible(true);fields.put(c.getName()+"#"+f.getName(),value(f.get(v)));}
  }return map("ref",id);
 }
 static String json(Object v){if(v==null)return "null";if(v instanceof Number||v instanceof Boolean)return v.toString();if(v instanceof Map){List<String>a=new ArrayList<>();for(Map.Entry<?,?>e:((Map<?,?>)v).entrySet())a.add(json(e.getKey())+":"+json(e.getValue()));return "{"+String.join(",",a)+"}";}if(v instanceof Iterable){List<String>a=new ArrayList<>();for(Object e:(Iterable<?>)v)a.add(json(e));return "["+String.join(",",a)+"]";}StringBuilder s=new StringBuilder("\"");for(char c:v.toString().toCharArray()){if(c=='\\'||c=='\"')s.append('\\').append(c);else if(c<32)s.append(String.format("\\u%04x",(int)c));else s.append(c);}return s.append('"').toString();}
 public static void agentmain(String directory,Instrumentation inst)throws Exception {
  Class<?> hooks=null;for(Class<?> c:inst.getAllLoadedClasses())if(c.getName().equals("amidst.gtnh.worker.WorkerTickHooks"))hooks=c;
  if(hooks==null)throw new IllegalStateException("Loaded Worker required");final ClassLoader loader=hooks.getClassLoader();
  BlockingQueue<Runnable> queue=(BlockingQueue<Runnable>)field(field(hooks,"worker"),"serverThreadQueries");
  FutureTask<Void> task=new FutureTask<>(()->{
   Object world=loader.loadClass("net.minecraftforge.common.DimensionManager").getMethod("getWorld",int.class).invoke(null,0);
   if(world==null)throw new IllegalStateException("Open an overworld first");
   Object provider=field(world,"field_73011_w"),manager=field(provider,"field_76578_c");
   if(!manager.getClass().getName().equals("rwg.world.ChunkManagerRealistic"))throw new IllegalStateException("RWG world required");
   blockType=loader.loadClass("net.minecraft.block.Block");biomeType=loader.loadClass("net.minecraft.world.biome.BiomeGenBase");registry=field(blockType,"field_149771_c");
   Map<String,Object> blocks=new TreeMap<>(),biomeStatics=new TreeMap<>();
   for(Field f:loader.loadClass("net.minecraft.init.Blocks").getDeclaredFields())if(Modifier.isStatic(f.getModifiers())&&blockType.isAssignableFrom(f.getType())){f.setAccessible(true);blocks.put(f.getName(),map("name",block(f.get(null)),"type",f.getType().getName()));}
   for(Field f:biomeType.getDeclaredFields())if(Modifier.isStatic(f.getModifiers())&&biomeType.isAssignableFrom(f.getType())){f.setAccessible(true);Object b=f.get(null);if(b!=null)biomeStatics.put(f.getName(),field(b,"field_76756_M"));}
   List<Object> biomes=new ArrayList<>();for(Object b:(Object[])field(biomeType,"field_76773_a"))if(b!=null)biomes.add(map("id",field(b,"field_76756_M"),"name",field(b,"field_76791_y"),"class",b.getClass().getName(),"top",block(field(b,"field_76752_A")),"filler",block(field(b,"field_76753_B"))));
   List<Object> allowed=new ArrayList<>();for(Object b:(List<?>)call(manager,"func_76932_a",new Class<?>[]{}))allowed.add(field(b,"field_76756_M"));
   Map<String,Object> groups=new LinkedHashMap<>(),realistic=new TreeMap<>();
   for(String group:Arrays.asList("snow","cold","hot","wet","small")){List<Object> ids=new ArrayList<>();for(Object b:(List<?>)field(manager,"biomes_"+group)){Object id=field(b,"biomeID");ids.add(id);realistic.put(id.toString(),map("id",id,"object",value(b)));}groups.put(group,ids);}
   Object chunks=field(world,"field_73020_y"),generator=field(chunks,"field_73246_d");
   Object cave=field(generator,"caves");
   Object noise=field(manager,"perlin");String noiseClass=noise.getClass().getName(),noiseMode;
   if(noiseClass.equals("rwg.util.NoiseGeneratorWrapper"))noiseMode=Boolean.TRUE.equals(field(noise,"useOpenSimplex"))?"wrapped-open-simplex":"wrapped-perlin";
   else if(noiseClass.equals("rwg.util.PerlinNoise"))noiseMode="perlin";
   else if(noiseClass.equals("rwg.util.OpenSimplexNoise"))noiseMode="open-simplex";
   else throw new IllegalStateException("Unsupported noise "+noiseClass);
   Map<String,Object> result=map("schemaVersion",2,"provider",provider.getClass().getName(),"manager",manager.getClass().getName(),"caveClass",cave.getClass().getName(),"generateCaves",field(loader.loadClass("rwg.config.ConfigRWG"),"generateCaves"),"spawnBiomes",allowed,"blocks",blocks,"biomeStatics",biomeStatics,"biomes",biomes,"groups",groups,"realistic",realistic.values(),"objects",nodes,"captureBoundary","Read-only tick-thread registry/configuration; no chunks or saved coordinates read");
   result.put("noise",noiseMode);
   Files.write(Paths.get(directory).resolve("spawn-runtime-profile.json"),json(result).getBytes(StandardCharsets.UTF_8));return null;
  });queue.add(task);try{task.get(45,TimeUnit.SECONDS);}catch(Exception e){task.cancel(false);queue.remove(task);throw e;}
 }
}
