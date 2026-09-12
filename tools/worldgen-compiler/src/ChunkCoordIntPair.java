package net.minecraft.world;
public final class ChunkCoordIntPair {
    public static long func_77272_a(int x, int z) { return (x & 0xffffffffL) | ((z & 0xffffffffL) << 32); }
    public static long chunkXZ2Int(int x, int z) { return func_77272_a(x,z); }
}
