import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.commons.*;
public class SpaceSlice{
 public static void main(String[]args)throws Exception{
  Set<String> deps=new TreeSet<>();
  try(JarFile in=new JarFile(args[0]);JarOutputStream out=new JarOutputStream(Files.newOutputStream(Paths.get(args[1])))){
   for(JarEntry e:Collections.list(in.entries())){
    ClassNode c=new ClassNode();new ClassReader(in.getInputStream(e)).accept(c,0);
    c.innerClasses.clear();
    for(FieldNode f:c.fields)System.out.println("FIELD "+c.name.replace('/','.')+"#"+f.name+" "+f.desc);
    boolean noise=c.name.startsWith("micdoodle8/")||c.name.startsWith("buildcraft/core/lib/utils/SimplexNoise")||c.name.endsWith("/RandomAid")||c.name.contains("$"),enumeration=(c.access&Opcodes.ACC_ENUM)!=0;
    if(c.name.endsWith("/RandomAid"))c.methods.removeIf(m->!m.name.equals("random"));
    if(c.name.equals("net/minecraft/world/gen/layer/GenLayer"))c.methods.removeIf(m->m.name.equals("func_75901_a")||m.name.equals("getModdedBiomeSize"));
    if(!noise&&!enumeration){
     c.access=(c.access&~(Opcodes.ACC_PRIVATE|Opcodes.ACC_PROTECTED))|Opcodes.ACC_PUBLIC;
     for(FieldNode f:c.fields)f.access=(f.access&~(Opcodes.ACC_FINAL|Opcodes.ACC_PRIVATE|Opcodes.ACC_PROTECTED))|Opcodes.ACC_PUBLIC;
     c.methods.removeIf(m->m.name.equals("<init>"));
     MethodNode ctor=new MethodNode(Opcodes.ACC_PUBLIC,"<init>","()V",null,null);
     ctor.instructions.add(new VarInsnNode(Opcodes.ALOAD,0));ctor.instructions.add(new MethodInsnNode(Opcodes.INVOKESPECIAL,c.superName,"<init>","()V",false));ctor.instructions.add(new InsnNode(Opcodes.RETURN));ctor.maxStack=1;ctor.maxLocals=1;c.methods.add(ctor);
    }
    for(MethodNode m:c.methods)for(AbstractInsnNode n:m.instructions){if(n instanceof MethodInsnNode){MethodInsnNode v=(MethodInsnNode)n;deps.add(v.owner+" "+v.name+v.desc);}if(n instanceof FieldInsnNode){FieldInsnNode v=(FieldInsnNode)n;deps.add(v.owner+" "+v.name+" "+v.desc);}}
    ClassWriter w=new ClassWriter(0);c.accept(new ClassRemapper(w,new Remapper(){public String map(String n){return n.equals("java/util/Random")?"amidst/web/JavaRandom":n;}}));
    out.putNextEntry(new JarEntry(e.getName()));out.write(w.toByteArray());out.closeEntry();
   }
  }
  for(String d:deps)System.out.println(d);
 }
}
