import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.commons.*;
/** Keep the agent's ASM private so it cannot replace Forge's own ASM classes. */
public final class ShadeAgent {
    public static void main(String[] args) throws Exception {
        Remapper remapper = new Remapper() {
            @Override public String map(String name) {
                return name.startsWith("org/objectweb/asm/") ? "amidst/web/profile/internal/asm/" + name.substring(18) : name;
            }
        };
        try(JarFile input=new JarFile(args[0]);JarOutputStream out=new JarOutputStream(Files.newOutputStream(Paths.get(args[1])))) {
            Enumeration<JarEntry> entries=input.entries();
            while(entries.hasMoreElements()) {
                JarEntry entry=entries.nextElement();String name=entry.getName();
                byte[] data=input.getInputStream(entry).readAllBytes();
                if(name.endsWith(".class")) {
                    ClassReader reader=new ClassReader(data);ClassWriter writer=new ClassWriter(0);
                    reader.accept(new ClassRemapper(writer,remapper),0);data=writer.toByteArray();
                    name=remapper.map(name.substring(0,name.length()-6))+".class";
                }
                out.putNextEntry(new JarEntry(name));out.write(data);out.closeEntry();
            }
        }
    }
}
