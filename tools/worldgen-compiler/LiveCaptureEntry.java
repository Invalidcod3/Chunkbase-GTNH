package amidst.web.profile;
import java.lang.instrument.Instrumentation;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
public final class LiveCaptureEntry {
    public static void agentmain(String directory,Instrumentation instrumentation) throws Exception {
        try { LiveCapture.agentmain(directory,instrumentation); }
        catch(Throwable error) {
            List<String> causes=new ArrayList<>();
            for(Throwable cause=error;cause!=null;cause=cause.getCause())causes.add(cause.getClass().getName()+": "+cause.getMessage());
            Path out=Paths.get(directory);Files.createDirectories(out);
            Files.write(out.resolve("capture-error.json"),RuntimeProfileAgent.json(causes).getBytes(StandardCharsets.UTF_8));
            throw new IllegalStateException("Capture failed; see private capture-error.json",error);
        }
    }
}
