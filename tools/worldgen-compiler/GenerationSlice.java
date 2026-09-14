import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.commons.*;

/** Fixed entry points: keep original generation instructions, exclude game bootstrap. */
public final class GenerationSlice {
    public static void main(String[] args)throws Exception {
        Set<String> keep=new HashSet<>(Arrays.asList("<init>","nextLong","func_75905_a","func_75903_a","func_75902_a","func_151619_a","func_151617_b","func_75904_a"));
        Set<String> deps=new TreeSet<>();
        boolean caves=args.length>2&&args[2].equals("caves");
        try(JarFile input=new JarFile(args[0]);JarOutputStream output=new JarOutputStream(Files.newOutputStream(Paths.get(args[1])))) {
            Enumeration<JarEntry> entries=input.entries();
            while(entries.hasMoreElements()) {
                JarEntry entry=entries.nextElement();String name=entry.getName();
                boolean include=caves?(name.equals("net/minecraft/world/gen/MapGenCaves.class")||name.equals("net/minecraft/world/gen/MapGenBase.class")||name.equals("net/minecraft/util/MathHelper.class")||name.endsWith("/StdLCG.class")):(name.startsWith("twilightforest/world/layer/")||name.startsWith("net/minecraft/world/gen/layer/")||name.endsWith("/RandomAid.class"));
                if(!name.endsWith(".class")||!include)continue;
                if(name.matches(".*(Preset|CheckBad|FeatureZoom)\\.class"))continue;
                ClassNode node=new ClassNode();new ClassReader(input.getInputStream(entry)).accept(node,0);
                if(node.name.equals("net/minecraft/world/gen/layer/GenLayer"))node.methods.removeIf(m->!keep.contains(m.name));
                if(node.name.endsWith("/RandomAid"))node.methods.removeIf(m->!m.name.equals("random"));
                if(caves) {
                    node.methods.removeIf(m->m.name.startsWith("mixinextras$bridge$"));
                    if(node.name.equals("net/minecraft/util/MathHelper"))node.methods.removeIf(m->!Arrays.asList("<clinit>","func_76126_a","func_76134_b","func_76128_c").contains(m.name));
                    for(MethodNode m:node.methods)for(AbstractInsnNode ins:m.instructions.toArray())if(ins instanceof InvokeDynamicInsnNode) {
                        InvokeDynamicInsnNode v=(InvokeDynamicInsnNode)ins;
                        if(!v.desc.equals("()Lcom/llamalad7/mixinextras/injector/wrapoperation/Operation;"))throw new IllegalArgumentException("Unexpected runtime callback");
                        // Observed wrappers never read this callback; keep their original RNG instructions.
                        m.instructions.set(ins,new InsnNode(Opcodes.ACONST_NULL));
                    }
                }
                for(MethodNode m:node.methods)for(AbstractInsnNode ins:m.instructions) {
                    if(ins instanceof MethodInsnNode){MethodInsnNode v=(MethodInsnNode)ins;deps.add(v.owner+"."+v.name+v.desc);}
                    if(ins instanceof FieldInsnNode){FieldInsnNode v=(FieldInsnNode)ins;deps.add(v.owner+"."+v.name+":"+v.desc);}
                }
                ClassWriter writer=new ClassWriter(0);
                if(caves)node.accept(new ClassRemapper(writer,new Remapper(){public String map(String n){return n.equals("java/util/Random")?"amidst/web/JavaRandom":n;}}));else node.accept(writer);
                output.putNextEntry(new JarEntry(name));output.write(writer.toByteArray());output.closeEntry();
            }
        }
        for(String dep:deps)System.out.println(dep);
    }
}
