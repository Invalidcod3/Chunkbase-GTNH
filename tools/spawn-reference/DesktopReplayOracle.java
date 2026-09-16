package amidst.gtnh.worker;
import amidst.web.SpawnExports;
import net.minecraft.block.Block;
import net.minecraft.world.World;
import net.minecraft.world.ChunkPosition;
import net.minecraft.world.biome.BiomeGenBase;
import rwg.biomes.realistic.RealisticBiomeBase;
import rwg.world.*;
import rwg.util.*;
import java.util.*;
/** JVM-only oracle executing the copied desktop replay and search against isolated adapters. */
public class DesktopReplayOracle {
 static Object field(String name)throws Exception {java.lang.reflect.Field f=SpawnExports.class.getDeclaredField(name);f.setAccessible(true);return f.get(null);}
 static class Terrain implements SpawnSearch.Terrain {
  final ChunkManagerRealistic manager;final ChunkGeneratorRealistic generator;final RwgChunkBiomeReplay replay;final RwgSpawnCaves caves;
  final List<BiomeGenBase> allowed=new ArrayList<>();final Map<Long,SpawnSearch.Surface[]> cache=new LinkedHashMap<>();
  Terrain(String seed)throws Exception {
   SpawnExports.configureSeed(seed);manager=(ChunkManagerRealistic)field("manager");generator=(ChunkGeneratorRealistic)field("generator");World world=(World)field("world");
   replay=new RwgChunkBiomeReplay(world,Long.parseLong(seed),manager,manager.perlin,manager.cell,RealisticBiomeBase.class,ChunkManagerRealistic.class,NoiseGenerator.class,CellNoise.class);
   caves=new RwgSpawnCaves(world);
   for(int id:(int[])field("allowed"))allowed.add(BiomeGenBase.REGISTRY[id]);
  }
  SpawnSearch.Surface[] chunk(int cx,int cz)throws Exception {
   RealisticBiomeBase[] r=new RealisticBiomeBase[256];generator.getNewNoise(manager,cx*16,cz*16,r);
   BiomeGenBase[] b=new BiomeGenBase[256],river=new BiomeGenBase[256];for(int i=0;i<256;i++){b[i]=r[i].baseBiome;river[i]=r[i].riverBiome;}
   List<RealisticBiomeBase> maps=new ArrayList<>();for(int i=0;i<256;i++)if(generator.mapGenBiomes[i]>0)maps.add(RealisticBiomeBase.getBiome(i));
   replay.replay(cx,cz,r,b,river,generator.testHeight,generator.riverStrength,maps.toArray());
   return replay.spawnSurfaces(cx,cz,b,allowed,caves);
  }
  public ChunkPosition initial(Random random){return null;}
  public SpawnSearch.Surface surface(int x,int z){try{int cx=x>>4,cz=z>>4;long key=((long)cx<<32)^(cz&0xffffffffL);SpawnSearch.Surface[] s=cache.get(key);if(s==null){s=chunk(cx,cz);cache.put(key,s);if(cache.size()>64)cache.remove(cache.keySet().iterator().next());}return s[(z&15)*16+(x&15)];}catch(Exception e){throw new RuntimeException(e);}}
 }
 public static void main(String[] args)throws Exception {
  String[] seeds={"0","-1","9007199254740993","9223372036854775807","-9223372036854775808","-8138049151491905853"};
  boolean first=true;System.out.print("{\"chunks\":[");
  for(String seed:seeds){Terrain t=new Terrain(seed);for(int[] c:new int[][]{{0,0},{-1,-1},{2,-3},{-113,97},{1001,-2049},{1038,-1250}}){
   SpawnSearch.Surface[] surfaces=t.chunk(c[0],c[1]);int[] values=new int[1024];for(int i=0;i<256;i++){SpawnSearch.Surface s=surfaces[i];values[i*4]=s.block==null?net.minecraft.init.Blocks.air.id:s.block.id;values[i*4+1]=s.biome.id;values[i*4+2]=s.y;values[i*4+3]=s.spawnBiome?1:0;}
   if(!Arrays.equals(values,SpawnExports.surfaces(c[0],c[1])))throw new AssertionError("Desktop replay differs: "+seed+Arrays.toString(c));
   if(!first)System.out.print(",");first=false;System.out.print("{\"seed\":\""+seed+"\",\"chunk\":"+Arrays.toString(c)+",\"surfaces\":"+Arrays.toString(values)+"}");
  }}
  System.out.print("],\"searches\":[");first=true;
  for(String seed:seeds)for(boolean bop:new boolean[]{false,true}){
   Terrain t=new Terrain(seed);SpawnSearch.Job job=new SpawnSearch.Job(Long.parseLong(seed),bop?SpawnSearch.BOP:SpawnSearch.VANILLA,t);while(!job.advance(Long.MAX_VALUE)){}
   if(!first)System.out.print(",");first=false;System.out.print("{\"seed\":\""+seed+"\",\"bop\":"+bop+",\"result\":"+Arrays.toString(new int[]{job.x,job.z,job.moves,job.moves<1000?1:0})+"}");
  }System.out.println("]}");
 }
}
