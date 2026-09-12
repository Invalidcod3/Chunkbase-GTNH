package amidst.web;
import java.util.*;
import org.teavm.jso.JSExport;
import rwg.util.*;
import rwg.world.*;
import rwg.biomes.realistic.RealisticBiomeBase;
import gnu.trove.map.hash.TLongObjectHashMap;

/** Raw climate and blended realistic IDs; never claims final surface biomes. */
public final class BiomeExports {
    private static ChunkManagerRealistic manager;
    private static ChunkGeneratorRealistic generator;

    private static ArrayList<RealisticBiomeBase> group(int[] ids, boolean required) {
        if (ids == null || ids.length > 4096 || (required && ids.length == 0)) throw new IllegalArgumentException("Invalid climate group");
        ArrayList<RealisticBiomeBase> result = new ArrayList<>();
        for (int id : ids) {
            if (id < 0 || id >= 256) throw new IllegalArgumentException("Invalid realistic biome ID");
            RealisticBiomeBase biome = RealisticBiomeBase.getBiome(id);
            result.add(biome == null ? new RealisticBiomeBase(id) : biome);
        }
        return result;
    }
    @JSExport public static void configure(String seed, String noise, int[] snow, int[] cold, int[] hot, int[] wet, int[] small) {
        manager = null; generator = null;
        long value = Long.parseLong(seed);
        NoiseGenerator selected;
        if (noise.equals("perlin")) selected = new PerlinNoise(value);
        else if (noise.equals("open-simplex")) selected = new OpenSimplexNoise(value);
        else if (noise.equals("wrapped-perlin") || noise.equals("wrapped-open-simplex")) {
            NoiseGeneratorWrapper.useOpenSimplex = noise.equals("wrapped-open-simplex");
            selected = new NoiseGeneratorWrapper(value);
        } else throw new IllegalArgumentException("Unknown noise implementation");
        Arrays.fill(RealisticBiomeBase.REGISTRY, null);
        ChunkManagerRealistic m = new ChunkManagerRealistic();
        m.perlin = selected; m.cell = new CellNoise(value, (short)0); m.cell.setUseDistance(true);
        m.biomecell = new CellNoise(value, (short)0); m.biomeDataMap = new TLongObjectHashMap<>();
        m.biomes_snow = group(snow, true); m.biomes_cold = group(cold, true); m.biomes_hot = group(hot, true);
        m.biomes_wet = group(wet, false); m.biomes_small = group(small, false);
        m.biomes_snowLength = snow.length; m.biomes_coldLength = cold.length; m.biomes_hotLength = hot.length;
        m.biomes_wetLength = wet.length; m.biomes_smallLength = small.length;
        m.wetEnabled = wet.length > 0; m.smallEnabled = small.length > 0;
        ChunkGeneratorRealistic g = new ChunkGeneratorRealistic();
        g.perlin = selected; g.cell = m.cell; g.sampleArraySize = 21; g.parabolicSize = 8; g.parabolicArraySize = 17;
        g.parabolicField = new float[289]; float total = 0;
        for (int x = -8; x <= 8; x++) for (int z = -8; z <= 8; z++) {
            float weight = 0.445F / (float)Math.sqrt((float)(x*x+z*z)+0.3F);
            g.parabolicField[x+8+(z+8)*17] = weight; total += weight;
        }
        for (int i=0;i<289;i++) g.parabolicField[i] /= total;
        g.biomeData = new int[441]; g.hugeRender = new float[81][256]; g.smallRender = new float[625][256];
        g.testHeight = new float[256]; g.riverStrength = new float[256]; g.mapGenBiomes = new float[258]; g.mix4Src = new float[4][];
        manager = m; generator = g;
    }
    private static void ready() { if (manager == null) throw new IllegalStateException("Profile not configured"); }
    @JSExport public static int rawBiome(int x, int z) { ready(); return manager.getBiomeDataAt(x,z).biomeID; }
    @JSExport public static float riverStrength(int x, int z) { ready(); return manager.getRiverStrength(x,z); }
    @JSExport public static float oceanValue(int x, int z) { ready(); return manager.getOceanValue(x,z); }
    @JSExport public static int[] blendedChunk(int cx, int cz) {
        ready();
        if (cx < -1874999 || cx > 1874999 || cz < -1874999 || cz > 1874999) throw new IllegalArgumentException("Chunk outside world bounds");
        RealisticBiomeBase[] biomes = new RealisticBiomeBase[256];
        generator.getNewNoise(manager, cx * 16, cz * 16, biomes);
        int[] result = new int[256];
        for(int i=0;i<256;i++) result[i] = biomes[i].biomeID;
        return result;
    }
    public static void main(String[] arguments) {
        String[] seeds = {"0", "-1", "47", "9223372036854775807", "-9223372036854775808", "9007199254740993"};
        int[][] coordinates = {{0,0},{-1,-1},{2,-3},{-113,97},{1001,-2049},{1870000,-1870000}};
        boolean first=true; System.out.print("[");
        for (String seed: seeds) for (String mode: new String[]{"perlin","open-simplex","wrapped-perlin","wrapped-open-simplex"}) for(int profile=0;profile<3;profile++) {
            int[][] groups = fixtureGroups(profile);
            configure(seed,mode,groups[0],groups[1],groups[2],groups[3],groups[4]);
            for (int[] p: coordinates) {
                if(!first) System.out.print(","); first=false;
                int x=p[0]*16,z=p[1]*16;
                System.out.print("{\"seed\":\""+seed+"\",\"noise\":\""+mode+"\",\"profile\":"+profile+",\"chunk\":"+Arrays.toString(p)+",\"raw\":"+rawBiome(x,z)+",\"river\":"+riverStrength(x,z)+",\"ocean\":"+oceanValue(x,z)+",\"blended\":"+Arrays.toString(blendedChunk(p[0],p[1]))+"}");
            }
        }
        System.out.println("]");
    }
    // Controlled identity tables test optional groups, duplicates/weights, sparse IDs and homogeneous chunks.
    public static int[][] fixtureGroups(int variant) {
        if (variant==0) return new int[][]{{3,3,7},{17,31,17},{64,92,127},{151,151,190},{221,255}};
        if (variant==1) return new int[][]{{3,7},{17,31},{64,92,127},{},{}};
        return new int[][]{{255},{255},{255},{255},{255}};
    }
}
