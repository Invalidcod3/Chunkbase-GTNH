package amidst.web.profile;
import java.lang.instrument.*;
import java.security.ProtectionDomain;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** One-shot retransformation observer returns null; profile reads use the Worker tick queue. */
public final class LiveCaptureObserved {
    private static Object get(Object owner,String name) throws Exception {
        Class<?> type=owner instanceof Class ? (Class<?>)owner : owner.getClass();
        for(Class<?> c=type;c!=null;c=c.getSuperclass())try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(owner instanceof Class ? null : owner);}catch(NoSuchFieldException ignored){}
        throw new NoSuchFieldException(name);
    }
    private static String digest(byte[] bytes) throws Exception {
        StringBuilder s=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))s.append(String.format("%02x",b&255));return s.toString();
    }
    public static void agentmain(String directory,Instrumentation instrumentation) throws Exception {
        final Path out=Paths.get(directory).toAbsolutePath().normalize();Files.createDirectories(out);
        final Map<String,byte[]> observed=new ConcurrentHashMap<>();
        ClassFileTransformer observer=new ClassFileTransformer(){
            public byte[] transform(ClassLoader loader,String name,Class<?> type,ProtectionDomain domain,byte[] bytes){
                if(type!=null && name!=null && name.startsWith("rwg/"))observed.put(name.replace('/','.'),bytes.clone());
                return null;
            }
        };
        instrumentation.addTransformer(observer,true);
        try{
            List<Class<?>> selected=new ArrayList<>();
            for(Class<?> type:instrumentation.getAllLoadedClasses())if(type.getName().startsWith("rwg.") && instrumentation.isModifiableClass(type))selected.add(type);
            instrumentation.retransformClasses(selected.toArray(new Class<?>[0]));
        }finally{instrumentation.removeTransformer(observer);}
        Class<?> hooks=null;
        for(Class<?> type:instrumentation.getAllLoadedClasses()) {
            if(type.getName().equals("amidst.gtnh.worker.WorkerTickHooks"))hooks=type;
        }
        if(hooks==null)throw new IllegalStateException("Compatible loaded Worker required");
        final Object server=get(hooks,"worker");
        final BlockingQueue<Runnable> queue=(BlockingQueue<Runnable>)get(server,"serverThreadQueries");
        FutureTask<Void> task=new FutureTask<Void>(new Callable<Void>() {public Void call() throws Exception {
            // All reads happen on the same tick thread that owns these samplers.
            Map<?,?> samplers=(Map<?,?>)get(server,"arbitrarySeedSamplers");
            Object sampler=samplers.get(Long.valueOf(0));
            if(sampler==null)throw new IllegalStateException("Request hello/seed 0 from Worker before capture");
            Object manager=get(sampler,"manager");
            Map<String,byte[]> definitions=observed;
            byte[] managerBytes=definitions.get(manager.getClass().getName());
            if(managerBytes==null)throw new IllegalStateException("JVM did not return manager definition");
            RuntimeProfileAgent.captureExisting(manager,out.resolve("profiles"),managerBytes);
            int count=0;
            for(Map.Entry<String,byte[]> entry:definitions.entrySet()) {
                if(!entry.getKey().matches("rwg\\.[A-Za-z0-9_.$]+"))continue;
                Path target=out.resolve("classes").resolve(entry.getKey().replace('.','/')).resolve(digest(entry.getValue())+".class");
                Files.createDirectories(target.getParent());
                if(!Files.exists(target))Files.write(target,entry.getValue(),StandardOpenOption.CREATE_NEW);
                count++;
            }
            Map<String,Object> result=new LinkedHashMap<>();result.put("ok",true);result.put("classes",count);
            result.put("managerSha256",digest(managerBytes));result.put("source","JVM retransformation input; observer returns null; existing Worker tick-thread sampler");
            Files.write(out.resolve("capture-result.json"),RuntimeProfileAgent.json(result).getBytes(StandardCharsets.UTF_8));
            return null;
        }});
        queue.add(task);
        try{task.get(30,TimeUnit.SECONDS);}catch(Exception error){task.cancel(false);queue.remove(task);throw error;}
    }
}
