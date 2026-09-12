import java.lang.instrument.Instrumentation;
import java.net.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
/** Stable entry; every helper uses an immutable archive and an isolated loader. */
public final class IsolatedCaptureEntry {
    public static void agentmain(String config,Instrumentation instrumentation) throws Exception {
        Properties options=new Properties();try(java.io.InputStream in=Files.newInputStream(Paths.get(config))){options.load(in);}
        Path output=Paths.get(options.getProperty("output"));Files.createDirectories(output);
        URL helper=Paths.get(options.getProperty("helper")).toUri().toURL();
        String mode=options.getProperty("mode","observed");
        if(!mode.equals("observed")&&!mode.equals("worker"))throw new IllegalArgumentException("Unknown capture mode");
        try(URLClassLoader loader=new URLClassLoader(new URL[]{helper},ClassLoader.getSystemClassLoader().getParent())) {
            Class<?> entry=loader.loadClass("amidst.web.profile."+(mode.equals("observed")?"LiveCaptureObserved":"LiveCapture"));
            entry.getMethod("agentmain",String.class,Instrumentation.class).invoke(null,output.toString(),instrumentation);
        }catch(Throwable error){
            StringBuilder message=new StringBuilder();
            for(Throwable e=error;e!=null;e=e.getCause())message.append(e.getClass().getName()).append(": ").append(e.getMessage()).append('\n');
            Files.write(output.resolve("capture-error.txt"),message.toString().getBytes(StandardCharsets.UTF_8));
            throw new IllegalStateException("Capture failed; see local report",error);
        }
    }
}
