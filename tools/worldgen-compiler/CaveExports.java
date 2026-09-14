package amidst.web;
import java.util.Arrays;
import net.minecraft.block.Block;
import net.minecraft.init.Blocks;
import net.minecraft.world.World;
import net.minecraft.world.gen.MapGenCaves;
import org.teavm.jso.JSExport;
public final class CaveExports {
    private static World world;
    private static MapGenCaves generator;
    @JSExport public static void configure(String seed){world=new World(Long.parseLong(seed));generator=new MapGenCaves();}
    @JSExport public static byte[] mask(int x,int z){
        if(world==null)throw new IllegalStateException("Cave seed not configured");
        Block[] blocks=new Block[65536];Arrays.fill(blocks,Blocks.field_150348_b);
        generator.func_151539_a(null,world,x,z,blocks);
        byte[] result=new byte[65536];
        for(int i=0;i<result.length;i++)result[i]=(byte)(blocks[i]==null?1:blocks[i]==Blocks.field_150353_l?2:0);
        return result;
    }
    public static void main(String[] args){}
}
