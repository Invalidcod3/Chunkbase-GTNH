import com.sun.tools.attach.VirtualMachine;
/** Only loads the explicitly named local maintenance agent into the selected JVM. */
public final class AttachCapture {
    public static void main(String[] args) throws Exception {
        VirtualMachine vm=VirtualMachine.attach(args[0]);
        try{vm.loadAgent(args[1],args[2]);}finally{vm.detach();}
        System.out.println("One-shot Worker capture finished.");
    }
}
