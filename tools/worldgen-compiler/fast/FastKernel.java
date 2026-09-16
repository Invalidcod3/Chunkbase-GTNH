package amidst.web;
import java.util.*;
import rwg.world.ChunkManagerRealistic;
import rwg.biomes.realistic.RealisticBiomeBase;
/** Compact blending adapted from the reference Amidst-GTNH Worker (GPL-3.0).
 * Retains ascending IDs, exact float accumulation, and the >95% selection rule.
 * Terrain always uses full neighbouring weights, even after homogeneous selection.
 */
public final class FastKernel {
 private static final int SAMPLE_SIZE=8,SAMPLE_ARRAY_SIZE=21,HUGE_SIZE=9,SMALL_SIZE=25;
 private static final float[] PARABOLIC_FIELD=createParabolicField();
 private final ChunkManagerRealistic manager;
 private final RwgBiomeGrid rawGrid=new RwgBiomeGrid(256);
 private final RwgBiomeGrid.Source rawGridSource=this::sampleGridPoint;
 private final Map<Long,BlendChunk> blendChunkCache=cache(128);
 private final Map<Long,BlendWeights> blendWeightCache=cache(8192);
 private static <T> Map<Long,T> cache(final int limit){return new LinkedHashMap<Long,T>(limit,0.75F,true){protected boolean removeEldestEntry(Map.Entry<Long,T> e){return size()>limit;}};}
 public FastKernel(ChunkManagerRealistic manager){this.manager=manager;}
 private RwgBiomeGrid.Entry sampleGridPoint(int x,int z){RealisticBiomeBase b=manager.getBiomeDataAt(x,z);return new RwgBiomeGrid.Entry(b,b.biomeID);}
 private float getSelectionNoise(int x,int z){return manager.perlin.noise2(x/15.0F,z/15.0F);}
 public int[] selected(int cx,int cz){BlendChunk b=getBlendChunk(cx,cz);int[] result=new int[256];for(int i=0;i<256;i++)result[i]=b.getRealisticBiome(i%16,i/16).biomeID;return result;}
 // Like SurfaceBiomeSampler's lazy selectedBiomes path: preserve the exact
 // interpolation and selection noise, but evaluate only requested columns.
 public int selectedAt(int x,int z){return getBlendChunk(x>>4,z>>4).getRealisticBiome(x&15,z&15).biomeID;}
 public float height(int x,int z){return getBlendedTerrainHeight(x,z,manager.getRiverStrength(x,z));}
        private BlendChunk getBlendChunk(int chunkX, int chunkZ)
                 {
            long key = coordinateKey(chunkX, chunkZ);
            BlendChunk cached = blendChunkCache.get(Long.valueOf(key));
            if (cached != null) {
                return cached;
            }
            BlendChunk created = createBlendChunk(chunkX, chunkZ);
            blendChunkCache.put(Long.valueOf(key), created);
            return created;
        }

        /**
         * Reproduces RWG's biome-only portion of ChunkGeneratorRealistic#getNewNoise.
         * Terrain height and block generation are deliberately omitted. Candidate
         * biomes are cached on RWG's eight-block sampling grid, while interpolation
         * arrays contain only the biome ids present around this chunk.
         */
        private BlendChunk createBlendChunk(int chunkX, int chunkZ)
                 {
            return createBlendChunk(chunkX, chunkZ, false);
        }

        private BlendChunk createBlendChunk(int chunkX, int chunkZ, boolean requireTerrainWeights)
                 {
            int originX = chunkX << 4;
            int originZ = chunkZ << 4;
            int[] sampledIds = new int[SAMPLE_ARRAY_SIZE * SAMPLE_ARRAY_SIZE];
            RealisticBiomeBase[] biomesById = new RealisticBiomeBase[256];
            int biomeCount = 0;

            for (int sampleX = -SAMPLE_SIZE; sampleX < SAMPLE_SIZE + 5; sampleX++) {
                for (int sampleZ = -SAMPLE_SIZE; sampleZ < SAMPLE_SIZE + 5; sampleZ++) {
                    int index = (sampleX + SAMPLE_SIZE) * SAMPLE_ARRAY_SIZE
                            + sampleZ + SAMPLE_SIZE;
                    RwgBiomeGrid.Entry entry = rawGrid.get(
                            originX + sampleX * 8 - 8, originZ + sampleZ * 8 - 8, rawGridSource);
                    int biomeId = entry.id;
                    sampledIds[index] = biomeId;
                    if (biomesById[biomeId] == null) biomeCount++;
                    // Preserve TreeMap.put's last-value semantics and ascending ID order.
                    biomesById[biomeId] = entry.biome;
                }
            }


            int[] biomeIds = new int[biomeCount];
            RealisticBiomeBase[] realisticBiomes = new RealisticBiomeBase[biomeCount];
            int[] idToIndex = new int[256];
            Arrays.fill(idToIndex, -1);
            int biomeIndex = 0;
            for (int biomeId = 0; biomeId < biomesById.length; biomeId++) {
                if (biomesById[biomeId] == null) continue;
                biomeIds[biomeIndex] = biomeId;
                realisticBiomes[biomeIndex] = biomesById[biomeId];
                idToIndex[biomeId] = biomeIndex;
                biomeIndex++;
            }

            float[] huge = new float[HUGE_SIZE * HUGE_SIZE * biomeCount];
            // RWG's >95% rule depends only on the centre. Evaluate it before
            // the other 24 convolution points or any interpolation arrays.
            fillBlendWeights(huge, 1, 1, originX, originZ, sampledIds, biomeIds, idToIndex);

            for (int index = 0; index < biomeCount; index++) {
                if (!requireTerrainWeights && huge[(4 * HUGE_SIZE + 4) * biomeCount + index] > 0.95F) {
                    return new BlendChunk(
                            originX,
                            originZ,
                            new int[0],
                            new RealisticBiomeBase[] { realisticBiomes[index] },
                            null);
                }
            }

            for (int gridX = -1; gridX < 4; gridX++) {
                for (int gridZ = -1; gridZ < 4; gridZ++) {
                    if (gridX != 1 || gridZ != 1) {
                        fillBlendWeights(huge, gridX, gridZ, originX, originZ, sampledIds, biomeIds, idToIndex);
                    }
                }
            }

            for (int gridX = 0; gridX < 4; gridX++) {
                for (int gridZ = 0; gridZ < 4; gridZ++) {
                    mix4(
                            huge,
                            (gridX * 2) * HUGE_SIZE + gridZ * 2,
                            (gridX * 2 + 2) * HUGE_SIZE + gridZ * 2,
                            (gridX * 2) * HUGE_SIZE + gridZ * 2 + 2,
                            (gridX * 2 + 2) * HUGE_SIZE + gridZ * 2 + 2,
                            huge,
                            (gridX * 2 + 1) * HUGE_SIZE + gridZ * 2 + 1,
                            biomeCount);
                }
            }
            float[] small = new float[SMALL_SIZE * SMALL_SIZE * biomeCount];
            for (int gridX = 0; gridX < 7; gridX++) {
                for (int gridZ = 0; gridZ < 7; gridZ++) {
                    int targetCell = (gridX * 4) * SMALL_SIZE + gridZ * 4;
                    if (!bothEvenOrBothOdd(gridX, gridZ)) {
                        mix4(
                                huge,
                                gridX * HUGE_SIZE + gridZ + 1,
                                (gridX + 1) * HUGE_SIZE + gridZ,
                                (gridX + 1) * HUGE_SIZE + gridZ + 2,
                                (gridX + 2) * HUGE_SIZE + gridZ + 1,
                                small,
                                targetCell,
                                biomeCount);
                    } else {
                        System.arraycopy(
                                huge,
                                ((gridX + 1) * HUGE_SIZE + gridZ + 1) * biomeCount,
                                small,
                                targetCell * biomeCount,
                                biomeCount);
                    }
                }
            }
            for (int gridX = 0; gridX < 6; gridX++) {
                for (int gridZ = 0; gridZ < 6; gridZ++) {
                    mix4(
                            small,
                            (gridX * 4) * SMALL_SIZE + gridZ * 4,
                            (gridX * 4 + 4) * SMALL_SIZE + gridZ * 4,
                            (gridX * 4) * SMALL_SIZE + gridZ * 4 + 4,
                            (gridX * 4 + 4) * SMALL_SIZE + gridZ * 4 + 4,
                            small,
                            (gridX * 4 + 2) * SMALL_SIZE + gridZ * 4 + 2,
                            biomeCount);
                }
            }
            for (int gridX = 0; gridX < 11; gridX++) {
                for (int gridZ = 0; gridZ < 11; gridZ++) {
                    if (!bothEvenOrBothOdd(gridX, gridZ)) {
                        mix4(
                                small,
                                (gridX * 2) * SMALL_SIZE + gridZ * 2 + 2,
                                (gridX * 2 + 2) * SMALL_SIZE + gridZ * 2,
                                (gridX * 2 + 2) * SMALL_SIZE + gridZ * 2 + 4,
                                (gridX * 2 + 4) * SMALL_SIZE + gridZ * 2 + 2,
                                small,
                                (gridX * 2 + 2) * SMALL_SIZE + gridZ * 2 + 2,
                                biomeCount);
                    }
                }
            }
            for (int gridX = 0; gridX < 9; gridX++) {
                for (int gridZ = 0; gridZ < 9; gridZ++) {
                    mix4(
                            small,
                            (gridX * 2 + 2) * SMALL_SIZE + gridZ * 2 + 2,
                            (gridX * 2 + 4) * SMALL_SIZE + gridZ * 2 + 2,
                            (gridX * 2 + 2) * SMALL_SIZE + gridZ * 2 + 4,
                            (gridX * 2 + 4) * SMALL_SIZE + gridZ * 2 + 4,
                            small,
                            (gridX * 2 + 3) * SMALL_SIZE + gridZ * 2 + 3,
                            biomeCount);
                }
            }
            for (int localX = 0; localX < 16; localX++) {
                for (int localZ = 0; localZ < 16; localZ++) {
                    if (!bothEvenOrBothOdd(localX, localZ)) {
                        mix4(
                                small,
                                (localX + 3) * SMALL_SIZE + localZ + 4,
                                (localX + 4) * SMALL_SIZE + localZ + 3,
                                (localX + 4) * SMALL_SIZE + localZ + 5,
                                (localX + 5) * SMALL_SIZE + localZ + 4,
                                small,
                                (localX + 4) * SMALL_SIZE + localZ + 4,
                                biomeCount);
                    }
                }
            }
            return new BlendChunk(originX, originZ, biomeIds, realisticBiomes, small);
        }


        private float getBlendedTerrainHeight(int x, int z, float rawRiver)  {

            BlendChunk blend = getBlendChunk(Math.floorDiv(x, 16), Math.floorDiv(z, 16));
            if (blend.weights == null) {
                // >95% selects one biome, but RWG STILL blends all neighbours
                // for height. Expand when replay needs complete terrain inputs.
                if (blend.terrainBlend == null) {
                    blend.terrainBlend = createBlendChunk(Math.floorDiv(x, 16), Math.floorDiv(z, 16), true);
                }
                blend = blend.terrainBlend;
            }
            int localX = Math.floorMod(x, 16);
            int localZ = Math.floorMod(z, 16);
            int offset = ((localX + 4) * SMALL_SIZE + localZ + 4) * blend.biomeIds.length;
            float ocean = manager.getOceanValue(x, z);
            float height = 0.0F;
            for (int index = 0; index < blend.biomeIds.length; index++) {
                float weight = blend.weights[offset + index];
                if (weight > 0.0F) {
                    float rawHeight = blend.realisticBiomes[index].rNoise(manager.perlin, manager.cell, x, z, ocean, weight, rawRiver + 1.0F);
                    height += manager.calculateRiver(x, z, rawRiver, rawHeight) * weight;
                }
            }
            return height;
        }

        /** Reuses a global convolution point while translating its sparse ids into this chunk's compact array. */
        private void fillBlendWeights(
                float[] target,
                int gridX,
                int gridZ,
                int originX,
                int originZ,
                int[] sampledIds,
                int[] biomeIds,
                int[] idToIndex) {
            Long key = Long.valueOf(coordinateKey(originX + gridX * 8, originZ + gridZ * 8));
            BlendWeights cached = blendWeightCache.get(key);
            if (cached == null) {
                float[] weights = new float[biomeIds.length];
                // Retain the original X-then-Z accumulation order bit for bit.
                for (int offsetX = -SAMPLE_SIZE; offsetX <= SAMPLE_SIZE; offsetX++) {
                    for (int offsetZ = -SAMPLE_SIZE; offsetZ <= SAMPLE_SIZE; offsetZ++) {
                        int sampleIndex = (gridX + offsetX + SAMPLE_SIZE + 1) * SAMPLE_ARRAY_SIZE
                                + gridZ + offsetZ + SAMPLE_SIZE + 1;
                        weights[idToIndex[sampledIds[sampleIndex]]] += PARABOLIC_FIELD[
                                offsetX + SAMPLE_SIZE + (offsetZ + SAMPLE_SIZE) * (SAMPLE_SIZE * 2 + 1)];
                    }
                }
                cached = new BlendWeights(biomeIds, weights);
                blendWeightCache.put(key, cached);
            }
            int resultOffset = ((gridX * 2 + 2) * HUGE_SIZE + gridZ * 2 + 2) * biomeIds.length;
            for (int index = 0; index < cached.biomeIds.length; index++) {
                float weight = cached.weights[index];
                if (weight > 0.0F) {
                    // Zero-weight ids may come from a previous chunk's wider
                    // neighbourhood and need not occur in the current chunk.
                    target[resultOffset + idToIndex[cached.biomeIds[index]]] = weight;
                }
            }
        }

        private static final class BlendWeights {
            private final int[] biomeIds;
            private final float[] weights;

            private BlendWeights(int[] biomeIds, float[] weights) {
                this.biomeIds = biomeIds;
                this.weights = weights;
            }
        }



        private final class BlendChunk {

            private final int originX;
            private final int originZ;
            private final int[] biomeIds;
            private final RealisticBiomeBase[] realisticBiomes;
            private final float[] weights;
            private BlendChunk terrainBlend;


            private final RealisticBiomeBase[] selectedBiomes = new RealisticBiomeBase[16 * 16];

            private BlendChunk(
                    int originX,
                    int originZ,
                    int[] biomeIds,
                    RealisticBiomeBase[] realisticBiomes,
                    float[] weights) {
                this.originX = originX;
                this.originZ = originZ;
                this.biomeIds = biomeIds;
                this.realisticBiomes = realisticBiomes;
                this.weights = weights;
            }

            private RealisticBiomeBase getRealisticBiome(int localX, int localZ)
                     {
                int selectedIndex = localZ * 16 + localX;
                RealisticBiomeBase cached = selectedBiomes[selectedIndex];
                if (cached != null) {
                    return cached;
                }

                RealisticBiomeBase selected;
                if (weights == null) {
                    selected = realisticBiomes[0];
                } else {
                    float threshold = 0.5F + getSelectionNoise(originX + localX, originZ + localZ);
                    threshold = threshold < 0.0F
                            ? 0.0F
                            : threshold > 0.99999F ? 0.99999F : threshold;
                    float cumulative = 0.0F;
                    selected = realisticBiomes[realisticBiomes.length - 1];
                    int cellOffset =
                            ((localX + 4) * SMALL_SIZE + localZ + 4) * biomeIds.length;
                    for (int index = 0; index < biomeIds.length; index++) {
                        float weight = weights[cellOffset + index];
                        if (weight > 0.0F) {
                            cumulative += weight;
                            if (cumulative > threshold) {
                                selected = realisticBiomes[index];
                                break;
                            }
                        }
                    }
                }
                selectedBiomes[selectedIndex] = selected;
                return selected;
            }

        }

        private static boolean bothEvenOrBothOdd(int first, int second) {
            return ((first ^ second) & 1) == 0;
        }

        private static void mix4(
                float[] source,
                int firstCell,
                int secondCell,
                int thirdCell,
                int fourthCell,
                float[] target,
                int resultCell,
                int biomeCount) {
            int firstOffset = firstCell * biomeCount;
            int secondOffset = secondCell * biomeCount;
            int thirdOffset = thirdCell * biomeCount;
            int fourthOffset = fourthCell * biomeCount;
            int resultOffset = resultCell * biomeCount;
            for (int index = 0; index < biomeCount; index++) {
                target[resultOffset + index] =
                        (source[firstOffset + index]
                                + source[secondOffset + index]
                                + source[thirdOffset + index]
                                + source[fourthOffset + index])
                                * 0.25F;
            }
        }

        private static float[] createParabolicField() {
            int size = SAMPLE_SIZE * 2 + 1;
            float[] result = new float[size * size];
            float total = 0.0F;
            for (int x = -SAMPLE_SIZE; x <= SAMPLE_SIZE; x++) {
                for (int z = -SAMPLE_SIZE; z <= SAMPLE_SIZE; z++) {
                    float weight =
                            0.445F / (float) Math.sqrt(x * x + z * z + 0.3F);
                    result[x + SAMPLE_SIZE + (z + SAMPLE_SIZE) * size] = weight;
                    total += weight;
                }
            }
            for (int index = 0; index < result.length; index++) {
                result[index] /= total;
            }
            return result;
        }

        private static long coordinateKey(int x, int z) {
            // Long.hashCode on a plain packed pair is x ^ z. On RWG's grid
            // thousands of coordinates otherwise land in a few hash buckets.
            // This reversible 64-bit mix preserves key uniqueness and spreads
            // the low/high bits before LinkedHashMap applies Long.hashCode.
            long key = ((long) x << 32) ^ (z & 0xFFFFFFFFL);
            key = (key ^ (key >>> 33)) * 0xff51afd7ed558ccdL;
            key = (key ^ (key >>> 33)) * 0xc4ceb9fe1a85ec53L;
            return key ^ (key >>> 33);
        }

}
