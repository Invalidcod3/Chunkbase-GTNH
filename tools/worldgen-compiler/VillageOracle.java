package amidst.gtnh.worker;
import amidst.web.BiomeExports;
import java.util.*;
/** Execute the unchanged reference structure predictor against original RWG terrain bytecode. */
public final class VillageOracle {
    public static void main(String[] args) {
        boolean first=true;System.out.print("[");
        for(String seed:new String[]{"0","-1","47","9007199254740993","9223372036854775807","-9223372036854775808"}) {
            BiomeExports.configureCaptured(seed);
            for(int[] b:new int[][]{{-2048,-2048,4096,4096},{-385,-385,768,768},{-17,3,36,65},{29900,-30000,4096,4096}}){
                if(!first)System.out.print(",");first=false;
                List<RoguelikeDungeonPredictor.StructureDescriptor> values=new RwgStructurePredictor().predict(Long.parseLong(seed),b[0],b[1],b[2],b[3],(x,z)->BiomeExports.villageViable(x,z));
                StringJoiner coordinates=new StringJoiner(",","[","]");
                for(RoguelikeDungeonPredictor.StructureDescriptor s:values)if(s.kind.equals("VILLAGE"))coordinates.add("["+s.x+","+s.z+"]");
                System.out.print("{\"seed\":\""+seed+"\",\"area\":"+Arrays.toString(b)+",\"villages\":"+coordinates+"}");
            }
        }
        System.out.println("]");
    }
}
