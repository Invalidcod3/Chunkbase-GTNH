package amidst.web.capture;

import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.nio.file.*;
import java.security.ProtectionDomain;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Observe bytes presented to the JVM after LaunchWrapper transformation.
 * Does not instrument methods, retransform classes, or modify game behavior.
 * Agents registered later may still transform these bytes; report that boundary.
 */
public final class RuntimeCapture {
    public static void premain(String configFile, Instrumentation instrumentation) throws Exception {
        final Properties options = new Properties();
        try (java.io.InputStream input = Files.newInputStream(Paths.get(configFile))) { options.load(input); }
        final Path root = Paths.get(options.getProperty("output")).toAbsolutePath().normalize();
        Files.createDirectories(root);
        final String[] prefixes = options.getProperty("prefixes", "amidst/gtnh/,rwg/").split(",");
        final Set<String> seen = Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());
        instrumentation.addTransformer(new ClassFileTransformer() {
            public byte[] transform(ClassLoader loader, String name, Class<?> redefined,
                                    ProtectionDomain domain, byte[] bytes) {
                if (name == null || !name.matches("[A-Za-z0-9_$/]+")) return null;
                boolean match = false;
                for (String prefix : prefixes) if (name.startsWith(prefix.trim())) match = true;
                if (!match) return null;
                try {
                    StringBuilder hash = new StringBuilder();
                    for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hash.append(String.format("%02x", value & 255));
                    if (!seen.add(name + ":" + hash)) return null;
                    Path target = root.resolve(name).resolve(hash.toString() + ".class").normalize();
                    if (!target.startsWith(root)) throw new IllegalArgumentException("Invalid capture path");
                    Files.createDirectories(target.getParent());
                    if (!Files.exists(target)) Files.write(target, bytes, StandardOpenOption.CREATE_NEW);
                } catch (Exception error) {
                    System.err.println("[Amidst Web Capture] Unable to capture " + name + ": " + error.getClass().getSimpleName());
                }
                return null;
            }
        }, false);
        Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
            public void run() { System.out.println("[Amidst Web Capture] Captured " + seen.size() + " class definitions."); }
        }));
    }
}
