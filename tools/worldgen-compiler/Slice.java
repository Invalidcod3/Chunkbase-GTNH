import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Extract selected original methods; never substitute biome selection instructions. */
public final class Slice implements Opcodes {
    static final Map<String, Set<String>> METHODS = new LinkedHashMap<>();
    static {
        METHODS.put("rwg/world/ChunkManagerRealistic", new HashSet<>(Arrays.asList("getBiomeDataAt", "getOceanValue", "diff", "getRiverStrength", "calculateRiver")));
        METHODS.put("rwg/world/ChunkGeneratorRealistic", new HashSet<>(Arrays.asList("getNewNoise", "mix4")));
    }
    static byte[] slice(byte[] bytes, Set<String> keep) {
        return slice(bytes,keep,false);
    }
    static byte[] slice(byte[] bytes, Set<String> keep, boolean inherit) {
        ClassNode node = new ClassNode();
        new ClassReader(bytes).accept(node, 0);
        node.methods.removeIf(m -> !keep.contains(m.name));
        if (!node.methods.stream().map(m -> m.name).collect(java.util.stream.Collectors.toSet()).equals(keep)) throw new IllegalArgumentException("Missing entry methods: " + node.name);
        Set<String> fields = new HashSet<>();
        for (MethodNode m : node.methods) for (AbstractInsnNode ins : m.instructions) if (ins instanceof FieldInsnNode) {
            FieldInsnNode f = (FieldInsnNode)ins;
            if (f.owner.equals(node.name)) fields.add(f.name);
        }
        node.fields.removeIf(f -> !fields.contains(f.name));
        for (FieldNode f : node.fields) f.access = (f.access & ~(ACC_PRIVATE | ACC_PROTECTED | ACC_FINAL)) | ACC_PUBLIC;
        for (MethodNode m : node.methods) m.access = (m.access & ~(ACC_PRIVATE | ACC_PROTECTED)) | ACC_PUBLIC;
        if(!inherit)node.superName = "java/lang/Object";
        node.interfaces.clear();
        MethodNode ctor = new MethodNode(ACC_PUBLIC, "<init>", "()V", null, null);
        ctor.instructions.add(new VarInsnNode(ALOAD, 0));
        ctor.instructions.add(new MethodInsnNode(INVOKESPECIAL, node.superName, "<init>", "()V", false));
        ctor.instructions.add(new InsnNode(RETURN));
        node.methods.add(ctor);
        ClassWriter out = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        node.accept(out);
        return out.toByteArray();
    }
    static byte[] floats(byte[] bytes) {
        ClassNode node = new ClassNode(); new ClassReader(bytes).accept(node, 0);
        if (node.name.equals("amidst/web/FloatPrecision")) return bytes;
        for (MethodNode method : node.methods) for (AbstractInsnNode ins : method.instructions.toArray()) {
            int op = ins.getOpcode();
            boolean round = op == FADD || op == FSUB || op == FMUL || op == FDIV || op == FREM || op == FNEG || op == I2F || op == L2F || op == D2F;
            if (round) method.instructions.insert(ins, new MethodInsnNode(INVOKESTATIC, "amidst/web/FloatPrecision", "round", "(F)F", false));
        }
        ClassWriter out = new ClassWriter(ClassWriter.COMPUTE_MAXS); node.accept(out); return out.toByteArray();
    }
    public static void main(String[] args) throws Exception {
        if (args[0].equals("round-directory")) {
            try (java.util.stream.Stream<Path> paths = Files.walk(Paths.get(args[1]))) {
                for (Path p : (Iterable<Path>)paths.filter(p -> p.toString().endsWith(".class"))::iterator) Files.write(p, floats(Files.readAllBytes(p)));
            }
            return;
        }
        try (JarFile input = new JarFile(args[1]); JarOutputStream out = new JarOutputStream(Files.newOutputStream(Paths.get(args[2])))) {
            Enumeration<JarEntry> entries = input.entries();
            while(entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement(); String name = entry.getName();
                if (!name.endsWith(".class")) continue;
                String type = name.substring(0, name.length()-6);
                boolean terrain=args[0].equals("terrain") && (type.startsWith("rwg/terrain/") || (type.startsWith("rwg/biomes/realistic/") && !type.equals("rwg/biomes/realistic/RealisticBiomeBase")) || type.equals("rwg/support/RealisticBiomeSupport"));
                if (!args[0].equals("round") && !terrain && !METHODS.containsKey(type) && !type.startsWith("rwg/util/")) continue;
                // Only dependency-free noise implementations are accepted.
                if (type.startsWith("rwg/util/") && !Arrays.asList("NoiseGenerator", "PerlinNoise", "OpenSimplexNoise", "OpenSimplexNoise$Contribution3", "CellNoise", "NoiseGeneratorWrapper").contains(type.substring(9))) continue;
                byte[] bytes = input.getInputStream(entry).readAllBytes();
                if ((args[0].equals("slice")||args[0].equals("terrain")) && METHODS.containsKey(type)) bytes = slice(bytes, METHODS.get(type));
                if(terrain){
                    ClassNode n=new ClassNode();new ClassReader(bytes).accept(n,ClassReader.SKIP_CODE);
                    Set<String> keep=new HashSet<>();
                    for(MethodNode m:n.methods)if(type.startsWith("rwg/terrain/")?!m.name.startsWith("<"):m.name.equals("rNoise"))keep.add(m.name);
                    bytes=slice(bytes,keep,true);
                }
                if (args[0].equals("round")) bytes = floats(bytes);
                out.putNextEntry(new JarEntry(name)); out.write(bytes); out.closeEntry();
            }
        }
    }
}
