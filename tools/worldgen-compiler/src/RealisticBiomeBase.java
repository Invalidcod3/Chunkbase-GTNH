package rwg.biomes.realistic;
import rwg.util.*;
/** Selection-only identity adapter. This is NOT a terrain or surface implementation. */
public final class RealisticBiomeBase {
    public static final RealisticBiomeBase[] REGISTRY = new RealisticBiomeBase[256];
    public final int biomeID;
    public RealisticBiomeBase(int id) { biomeID = id; REGISTRY[id] = this; }
    public static RealisticBiomeBase getBiome(int id) { return REGISTRY[id]; }
    // getNewNoise computes terrain alongside selection. Its height output is discarded.
    public float rNoise(NoiseGenerator noise, CellNoise cell, int x, int z, float ocean, float border, float river) { return 0; }
}
