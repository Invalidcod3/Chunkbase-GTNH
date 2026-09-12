package amidst.web;

import org.teavm.jso.JSExport;
import rwg.util.PerlinNoise;
import rwg.util.OpenSimplexNoise;
import rwg.util.CellNoise;

/** Small explicit entry surface over unchanged RWG class files. */
public final class NoiseExports {
    private static PerlinNoise perlin;
    private static OpenSimplexNoise simplex;
    private static CellNoise cells;

    @JSExport
    public static void setSeed(String value) {
        long seed = Long.parseLong(value);
        perlin = new PerlinNoise(seed);
        simplex = new OpenSimplexNoise(seed);
        cells = new CellNoise(seed, (short) 0);
    }

    @JSExport
    public static double perlin3(double x, double y, double z) {
        return perlin.improvedNoise(x, y, z);
    }

    @JSExport
    public static double simplex3(double x, double y, double z) {
        return simplex.noise(x, y, z);
    }

    @JSExport
    public static double cell3(double x, double y, double z) {
        return cells.noise(x, y, z);
    }

    // This oracle runs in the JVM with the original extracted bytecode.
    public static void main(String[] arguments) {
        String[] seeds = {"0", "-1", "9223372036854775807", "-9223372036854775808", "9007199254740993", "-4172144997902289642"};
        double[][] points = {{0,0,0},{.1,.2,.3},{-1.25,7.1,-3.2},{123.45,67.8,-901.2},{-30000.125,0,29999.875}};
        System.out.println("[");
        boolean first = true;
        for (String seed : seeds) {
            setSeed(seed);
            for (double[] p : points) {
                if (!first) System.out.println(",");
                first = false;
                System.out.print("{\"seed\":\"" + seed + "\",\"point\":[" + p[0] + "," + p[1] + "," + p[2] + "],\"values\":[" + perlin3(p[0],p[1],p[2]) + "," + simplex3(p[0],p[1],p[2]) + "," + cell3(p[0],p[1],p[2]) + "]}");
            }
        }
        System.out.println("\n]");
    }
}
