import org.objectweb.asm.*;
import org.objectweb.asm.commons.ClassRemapper;
import org.objectweb.asm.commons.SimpleRemapper;
import org.objectweb.asm.tree.*;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.jar.JarFile;

/** Executes original selector instructions with save-free, controlled input APIs. */
public class VillageNamesOracle {
    public static class Biome {
        public String field_76791_y = "Plains";
        public String biomeName = "Plains";
    }

    public static class World {
        public long seed;
        public final Random rand = new Random();
        public final Biome biome = new Biome();

        public Random func_72843_D(int x, int z, int salt) {
            rand.setSeed((long) x * 341873128712L + (long) z * 132897987541L + seed + salt);
            return rand;
        }

        public Biome func_72807_a(int x, int z) {
            return biome;
        }
    }

    public static class Config {
        public static int newVillageSpacingMedian = 40;
        public static int newVillageSpacingSpread = 10;
        public static int noVillagesRadius = 0;
        public static String[] spawnBiomesNames = {"Plains"};
    }

    public static class BiomeManager {
        public static void addVillageBiome(Biome biome, boolean allowed) {}
    }

    static class Loader extends ClassLoader {
        Loader() {
            super(VillageNamesOracle.class.getClassLoader());
        }

        Class<?> define(byte[] code) {
            return defineClass(null, code, 0, code.length);
        }
    }

    static final Loader loader = new Loader();

    static byte[] entry(Path jar, String name) throws Exception {
        try (JarFile file = new JarFile(jar.toFile())) {
            try (var in = file.getInputStream(file.getJarEntry(name + ".class"))) {
                return in.readAllBytes();
            }
        }
    }

    static Class<?> extract(
            byte[] bytes,
            String newName,
            Set<String> methods,
            boolean fields,
            boolean world,
            Map<String, String> aliases) {
        ClassNode original = new ClassNode();
        new ClassReader(bytes).accept(original, 0);
        ClassNode isolated = new ClassNode();
        isolated.version = Opcodes.V1_8;
        isolated.access = Opcodes.ACC_PUBLIC;
        isolated.name = original.name;
        isolated.superName = "java/lang/Object";
        if (fields) {
            for (FieldNode field : original.fields) {
                // Full mod/config initialization is outside this audit. Retain only selection
                // inputs and populate them explicitly without that initializer.
                if (!original.name.endsWith("/VillageGeneratorConfigHandler")
                        || Set.of(
                                        "newVillageSpacingMedian",
                                        "newVillageSpacingSpread",
                                        "noVillagesRadius",
                                        "spawnBiomesNames")
                                .contains(field.name)) isolated.fields.add(field);
            }
        }
        if (world)
            isolated.fields.add(
                    new FieldNode(
                            Opcodes.ACC_PUBLIC,
                            "field_75039_c",
                            "Lnet/minecraft/world/World;",
                            null,
                            null));
        for (MethodNode method : original.methods) {
            if (methods.contains(method.name)) isolated.methods.add(method);
        }
        if (!methods.contains("<init>")) {
            MethodNode ctor = new MethodNode(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
            ctor.instructions.add(new VarInsnNode(Opcodes.ALOAD, 0));
            ctor.instructions.add(
                    new MethodInsnNode(
                            Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false));
            ctor.instructions.add(new InsnNode(Opcodes.RETURN));
            ctor.maxStack = 1;
            ctor.maxLocals = 1;
            isolated.methods.add(ctor);
        } else {
            isolated.methods.removeIf(m -> m.name.equals("<init>") && !m.desc.equals("()V"));
        }
        Map<String, String> mapping = new HashMap<>(aliases);
        mapping.put(original.name, newName);
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        isolated.accept(new ClassRemapper(writer, new SimpleRemapper(mapping)));
        return loader.define(writer.toByteArray());
    }


    // Adapted from Amidst-GTNH's 2026-10-10 selector audit (GPL-3.0).
    // Run with ASM 9 on the classpath; inputs: VN runtime JAR and output JSON.
    public static void main(String[] args) throws Throwable {
        Path jar=Path.of(args[0]);
        Map<String,String> aliases=new HashMap<>();
        aliases.put("net/minecraft/world/World","VillageNamesOracle$World");
        aliases.put("net/minecraft/world/biome/BiomeGenBase","VillageNamesOracle$Biome");
        aliases.put("net/minecraft/world/gen/structure/MapGenVillage","java/lang/Object");
        aliases.put("net/minecraftforge/common/BiomeManager","VillageNamesOracle$BiomeManager");
        Class<?> config=extract(entry(jar,"astrotibs/villagenames/config/village/VillageGeneratorConfigHandler"),"astrotibs/villagenames/config/village/VillageGeneratorConfigHandler",Set.of("unpackBiomes"),true,false,aliases);
        Class<?> vn=extract(entry(jar,"astrotibs/villagenames/village/MapGenVillageVN"),"astrotibs/villagenames/village/MapGenVillageVN",Set.of("<init>","func_75047_a"),true,true,aliases);
        Method method=vn.getDeclaredMethod("func_75047_a",int.class,int.class);method.setAccessible(true);
        StringJoiner cases=new StringJoiner(",");
        for(int[] params:new int[][]{{40,10,0,-256,255},{20,12,80,-128,127},{47,26,0,-128,127},{40,10,0,50000,50100},{40,10,50000,-128,127}}) {
            config.getField("newVillageSpacingMedian").setInt(null,params[0]);
            config.getField("newVillageSpacingSpread").setInt(null,params[1]);
            config.getField("noVillagesRadius").setInt(null,params[2]);
            config.getField("spawnBiomesNames").set(null,new String[]{" Plains |plains|oak","Forest",""});
            Object generator=vn.getConstructor().newInstance();
            World world=new World();vn.getField("field_75039_c").set(generator,world);
            MethodHandle select=MethodHandles.lookup().unreflect(method).bindTo(generator);
            for(long seed:new long[]{0,1,-1,5942749603128060499L,Long.MIN_VALUE,Long.MAX_VALUE}) {
                world.seed=seed;StringJoiner coords=new StringJoiner(",");
                for(int z=params[3];z<=params[4];z++)for(int x=params[3];x<=params[4];x++)
                    if((boolean)select.invokeExact(x,z))coords.add("["+(x*16+4)+","+(z*16+4)+"]");
                cases.add(String.format(java.util.Locale.ROOT,"{\"seed\":\"%d\",\"distance\":%d,\"separation\":%d,\"originRadius\":%d,\"minChunk\":%d,\"maxChunk\":%d,\"villages\":[%s]}",seed,params[0]+params[1],Math.max(1,params[0]-params[1]),params[2],params[3],params[4],coords));
            }
        }
        String hash=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(jar)));
        Files.writeString(Path.of(args[1]),"{\"referenceJarSha256\":\""+hash+"\",\"scope\":\"Native VN 4.5.18 selector with controlled Plains/configuration, no building assembly\",\"cases\":["+cases+"]}\n");
    }
}
