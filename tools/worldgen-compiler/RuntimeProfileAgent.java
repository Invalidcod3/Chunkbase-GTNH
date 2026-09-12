package amidst.web.profile;

import java.lang.instrument.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.objectweb.asm.*;

/** Optional maintenance agent: observe completed RWG manager construction.
 * Unlike the bytecode-only capture agent, this inserts a constructor-return hook.
 * It reads selected initialized fields and writes a local profile, never generates chunks.
 */
public final class RuntimeProfileAgent {
    private static Path output;
    private static final Set<String> seen = Collections.newSetFromMap(new ConcurrentHashMap<String,Boolean>());
    private static final Map<ClassLoader,String> hashes = new ConcurrentHashMap<>();
    public static void premain(String directory, Instrumentation instrumentation) throws Exception {
        if (directory == null || directory.trim().isEmpty()) throw new IllegalArgumentException("Profile output directory required");
        output = Paths.get(directory).toAbsolutePath().normalize(); Files.createDirectories(output);
        instrumentation.addTransformer(new ClassFileTransformer() {
            public byte[] transform(ClassLoader loader, String name, Class<?> type, ProtectionDomain domain, byte[] bytes) {
                if (!"rwg/world/ChunkManagerRealistic".equals(name)) return null;
                try {
                    hashes.put(loader, hash(bytes));
                    ClassReader reader = new ClassReader(bytes);
                    ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS);
                    reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
                        public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
                            MethodVisitor base = super.visitMethod(access,name,desc,signature,exceptions);
                            if (!name.equals("<init>")) return base;
                            return new MethodVisitor(Opcodes.ASM9,base) {
                                public void visitInsn(int opcode) {
                                    if (opcode == Opcodes.RETURN) {
                                        super.visitVarInsn(Opcodes.ALOAD,0);
                                        super.visitMethodInsn(Opcodes.INVOKESTATIC,"amidst/web/profile/RuntimeProfileAgent","capture","(Ljava/lang/Object;)V",false);
                                    }
                                    super.visitInsn(opcode);
                                }
                            };
                        }
                    },0);
                    return writer.toByteArray();
                } catch (Throwable failure) {
                    System.err.println("[Amidst profile] Hook unavailable: " + failure.getClass().getSimpleName());
                    return null;
                }
            }
        },false);
    }
    private static Object field(Object instance, String... names) throws Exception {
        Class<?> type = instance instanceof Class ? (Class<?>)instance : instance.getClass();
        for(Class<?> current=type; current!=null; current=current.getSuperclass()) for(String name:names) {
            try { Field f=current.getDeclaredField(name); f.setAccessible(true); return f.get(instance instanceof Class ? null : instance); }
            catch(NoSuchFieldException missing) { }
        }
        throw new NoSuchFieldException(type.getName()+"."+Arrays.toString(names));
    }
    private static Map<String,Object> biome(Object instance) throws Exception {
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("legacyId",field(instance,"biomeID","field_76756_M"));
        result.put("name",field(instance,"biomeName","field_76791_y"));
        result.put("class",instance.getClass().getName());
        return result;
    }
    public static void capture(Object manager) {
        try {
            Object noise=field(manager,"perlin");
            if(noise==null) return; // Base constructor has not initialized the manager yet.
            String implementation=noise.getClass().getName(), mode;
            if(implementation.equals("rwg.util.PerlinNoise")) mode="perlin";
            else if(implementation.equals("rwg.util.OpenSimplexNoise")) mode="open-simplex";
            else if(implementation.equals("rwg.util.NoiseGeneratorWrapper")) mode=Boolean.TRUE.equals(field(noise,"useOpenSimplex")) ? "wrapped-open-simplex" : "wrapped-perlin";
            else throw new IllegalArgumentException("Unknown noise implementation");
            Map<String,Object> groups=new LinkedHashMap<>(), biomes=new TreeMap<>();
            for(String group:Arrays.asList("snow","cold","hot","wet","small")) {
                List<?> values=(List<?>)field(manager,"biomes_"+group);
                if(values==null) return;
                List<Integer> ids=new ArrayList<>();
                for(Object value:values) {
                    int id=((Number)field(value,"biomeID")).intValue(); ids.add(id);
                    Map<String,Object> item=new LinkedHashMap<>();
                    item.put("id",id);item.put("class",value.getClass().getName());
                    item.put("base",biome(field(value,"baseBiome"))); item.put("river",biome(field(value,"riverBiome")));
                    String key=String.valueOf(id);
                    Object previous=biomes.put(key,item);
                    if(previous!=null && !json(previous).equals(json(item))) throw new IllegalStateException("Conflicting realistic ID");
                }
                if(((Number)field(manager,"biomes_"+group+"Length")).intValue()!=ids.size()) throw new IllegalStateException("Climate group length mismatch");
                groups.put(group,ids);
            }
            Map<String,Object> profile=new LinkedHashMap<>();
            profile.put("schemaVersion",1);profile.put("kind","rwg-runtime-selection-profile");
            profile.put("managerClass",manager.getClass().getName());
            profile.put("observedManagerSha256",hashes.get(manager.getClass().getClassLoader()));
            profile.put("noise",mode);profile.put("groups",groups);profile.put("biomes",new ArrayList<>(biomes.values()));
            profile.put("wetEnabled",field(manager,"wetEnabled"));profile.put("smallEnabled",field(manager,"smallEnabled"));
            profile.put("captureBoundary","constructor return; later mutations/transformers are not certified");
            profile.put("finalSurfaceReady",false);
            byte[] bytes=json(profile).getBytes(StandardCharsets.UTF_8);
            String digest=hash(bytes);
            if(!seen.add(digest)) return;
            Path target=output.resolve(digest+".json");
            try { Files.write(target,bytes,StandardOpenOption.CREATE_NEW); }
            catch(FileAlreadyExistsException existing) { }
            System.out.println("[Amidst profile] Captured RWG selection registry " + digest);
        } catch(Throwable error) {
            System.err.println("[Amidst profile] Unable to capture initialized profile: " + error.getClass().getSimpleName());
        }
    }
    private static String hash(byte[] bytes) throws Exception {
        StringBuilder s=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))s.append(String.format("%02x",b&255));return s.toString();
    }
    private static String json(Object value) {
        if(value==null)return "null";
        if(value instanceof Number || value instanceof Boolean)return value.toString();
        if(value instanceof Map) {
            List<String> pairs=new ArrayList<>();for(Object entry:((Map<?,?>)value).entrySet()) {
                Map.Entry<?,?> e=(Map.Entry<?,?>)entry;pairs.add(json(e.getKey().toString())+":"+json(e.getValue()));
            }return "{"+String.join(",",pairs)+"}";
        }
        if(value instanceof Iterable) {List<String> items=new ArrayList<>();for(Object item:(Iterable<?>)value)items.add(json(item));return "["+String.join(",",items)+"]";}
        StringBuilder s=new StringBuilder("\"");for(char c:value.toString().toCharArray()) {
            if(c=='\\'||c=='\"')s.append('\\').append(c);else if(c<32)s.append(String.format("\\u%04x",(int)c));else s.append(c);
        }return s.append('"').toString();
    }
}
