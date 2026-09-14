package amidst.gtnh.worker;
import java.util.*;
import org.teavm.jso.JSExport;
import net.minecraft.world.gen.layer.GenLayer;
import twilightforest.world.layer.GenLayerTF;

public final class TwilightExports {
    static boolean old;
    private static long seed;
    private static GenLayer[] layers;
    @JSExport public static void configure(String value,boolean oldMap){
        layers=null;seed=Long.parseLong(value);old=oldMap;
        layers=old?GenLayerTF.makeTheWorldOldMapGen(seed):GenLayerTF.makeTheWorld(seed);
    }
    @JSExport public static int[] biomes(int x,int z,int width,int height,boolean quarter){
        if(layers==null)throw new IllegalStateException("Twilight profile not configured");
        return Arrays.copyOf(layers[quarter?0:1].func_75904_a(x,z,width,height),width*height);
    }
    static int point(int x,int z){return biomes(x,z,1,1,false)[0];}
    @JSExport public static String[] features(int x,int z,int width,int height){
        List<RoguelikeDungeonPredictor.StructureDescriptor> values=new TwilightForestFeaturePredictor().predict(seed,x,z,width,height,new TwilightForestBiomeSampler());
        String[] result=new String[values.size()];int i=0;
        for(RoguelikeDungeonPredictor.StructureDescriptor v:values)result[i++]=v.subtype+"|"+v.x+"|"+v.z;
        return result;
    }
    public static void main(String[] args){}
}
