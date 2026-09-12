package amidst.web;
import rwg.biomes.realistic.RealisticBiomeBase;

import java.util.LinkedHashMap;
import java.util.Map;

/** Eight-block RWG grid, grouped into 16x16-cell pages. Sampler-thread owned. */
final class RwgBiomeGrid {
    interface Source { Entry sample(int x, int z) ; }
    static final class Entry {
        final RealisticBiomeBase biome;
        final int id;
        Entry(RealisticBiomeBase biome, int id) { this.biome = biome; this.id = id; }
    }
    private final Map<Long, Entry[]> pages;
    private Entry[] current;
    private int currentX, currentZ;
    RwgBiomeGrid(int pageLimit) {
        pages = new LinkedHashMap<Long, Entry[]>(pageLimit, 0.75F, true) {
            @Override protected boolean removeEldestEntry(Map.Entry<Long, RwgBiomeGrid.Entry[]> eldest) { return size() > pageLimit; }
        };
    }
    Entry get(int x, int z, Source source)  {
        if ((x & 7) != 0 || (z & 7) != 0) throw new IllegalArgumentException("RWG grid requires eight-block alignment");
        int px = x >> 7, pz = z >> 7;
        if (current == null || px != currentX || pz != currentZ) {
            long key = ((long) px << 32) ^ (pz & 0xffffffffL);
            current = pages.get(key);
            if (current == null) { current = new Entry[256]; pages.put(key, current); }
            currentX = px; currentZ = pz;
        }
        int index = ((x >> 3) & 15) * 16 + ((z >> 3) & 15);
        Entry entry = current[index];
        if (entry == null) current[index] = entry = source.sample(x, z);
        return entry;
    }
}
