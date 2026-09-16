import java.nio.file.*;import java.util.*;import java.util.jar.*;
import org.objectweb.asm.*;import org.objectweb.asm.tree.*;
import org.objectweb.asm.commons.*;
/** Preserve original surface instructions, excluding decoration/world population. */
public class SpawnSlice {
 public static void main(String[] args)throws Exception {
  TreeSet<String> deps=new TreeSet<>();
  try(JarFile in=new JarFile(args[0]);JarOutputStream out=new JarOutputStream(Files.newOutputStream(Paths.get(args[1])))){
   for(Enumeration<JarEntry> e=in.entries();e.hasMoreElements();){JarEntry entry=e.nextElement();String name=entry.getName();if(!name.endsWith(".class"))continue;
    if(args.length>2&&args[2].equals("round")){out.putNextEntry(new JarEntry(name));out.write(Slice.floats(in.getInputStream(entry).readAllBytes()));out.closeEntry();continue;}
    if(args.length>2&&args[2].equals("random")){ClassWriter w=new ClassWriter(0);new ClassReader(in.getInputStream(entry)).accept(new ClassRemapper(w,new Remapper(){public String map(String n){return n.equals("java/util/Random")?"amidst/web/JavaRandom":n;}}),0);out.putNextEntry(new JarEntry(name));out.write(w.toByteArray());out.closeEntry();continue;}
    boolean surface=name.startsWith("rwg/surface/"),biome=name.startsWith("rwg/biomes/realistic/")||name.equals("rwg/support/RealisticBiomeSupport.class"),util=name.startsWith("rwg/util/"),map=name.startsWith("rwg/map/"),manager=name.equals("rwg/world/ChunkManagerRealistic.class");
    if(!surface&&!biome&&!util&&!map&&!manager)continue;
    byte[] bytes=in.getInputStream(entry).readAllBytes();ClassNode n=new ClassNode();new ClassReader(bytes).accept(n,0);
    Set<String> keep=new HashSet<>();for(MethodNode m:n.methods)if(surface?!m.name.startsWith("<"):biome?Arrays.asList("rNoise","rReplace","generateMapGen","rMapGen","getBiome").contains(m.name):!m.name.startsWith("<"))keep.add(m.name);
    if(manager){keep=new HashSet<>(Slice.METHODS.get(n.name));keep.addAll(Arrays.asList("getNoiseAt","func_76940_a","getNoiseWithRiverOceanAt","isBorderlessAt","func_76935_a"));bytes=Slice.slice(bytes,keep);}
    else if(surface||biome||map)bytes=Slice.slice(bytes,keep,true);
    else if(!Arrays.asList("CliffCalculator","SnowheightCalculator").contains(n.name.substring(9)))continue;
    ClassNode parsed=new ClassNode();new ClassReader(bytes).accept(parsed,0);
    if(surface)for(FieldNode f:n.fields)if((f.access&Opcodes.ACC_STATIC)==0&&parsed.fields.stream().noneMatch(p->p.name.equals(f.name))){f.access=Opcodes.ACC_PUBLIC;parsed.fields.add(f);}
    if(name.endsWith("/RealisticBiomeBase.class")){
     for(FieldNode f:n.fields)if(Arrays.asList("biomeID","baseBiome","riverBiome").contains(f.name)&&parsed.fields.stream().noneMatch(p->p.name.equals(f.name))){f.access=Opcodes.ACC_PUBLIC;parsed.fields.add(f);}
     // Explicit registry installation replaces the game's constructor/class-initializer graph.
     MethodNode init=new MethodNode(Opcodes.ACC_STATIC,"<clinit>","()V",null,null);
     init.instructions.add(new IntInsnNode(Opcodes.SIPUSH,256));init.instructions.add(new TypeInsnNode(Opcodes.ANEWARRAY,parsed.name));init.instructions.add(new FieldInsnNode(Opcodes.PUTSTATIC,parsed.name,"biomeList","[L"+parsed.name+";"));init.instructions.add(new InsnNode(Opcodes.RETURN));parsed.methods.add(init);
    }
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);parsed.accept(writer);bytes=writer.toByteArray();
    for(MethodNode m:parsed.methods)for(AbstractInsnNode ins:m.instructions){if(ins instanceof MethodInsnNode){MethodInsnNode v=(MethodInsnNode)ins;deps.add(v.owner+"."+v.name+v.desc);}if(ins instanceof FieldInsnNode){FieldInsnNode v=(FieldInsnNode)ins;deps.add(v.owner+"."+v.name+":"+v.desc);}}
    out.putNextEntry(new JarEntry(name));out.write(bytes);out.closeEntry();
   }
  }
  for(String d:deps)System.out.println(d);
 }
}
