// Same face transforms and nearest-neighbour sampling as Amidst's
// gtnh-worker/.../ProspectingTextures.dimensionIcon (GPL-3.0).
// Usage: java tools/ImportDimensionIcons.java <GT5 texture blocks directory> <output>
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import javax.imageio.ImageIO;

class ImportDimensionIcons {
    static void face(Graphics2D g, BufferedImage image, AffineTransform transform) {
        transform.scale(16.0 / image.getWidth(), 16.0 / image.getHeight());
        g.drawImage(image, transform, null);
    }
    public static void main(String[] args) throws Exception {
        Path source=Path.of(args[0]), output=Path.of(args[1]);
        Files.createDirectories(output);
        int count=0;
        try (var files=Files.newDirectoryStream(source,"*_front.png")) {
            for (Path file:files) {
                String abbr=file.getFileName().toString().replace("_front.png", "");
                BufferedImage front=ImageIO.read(file.toFile());
                BufferedImage top=ImageIO.read(source.resolve(abbr+"_top.png").toFile());
                BufferedImage right=ImageIO.read(source.resolve(abbr+"_right.png").toFile());
                BufferedImage result=new BufferedImage(32,32,BufferedImage.TYPE_INT_ARGB);
                Graphics2D g=result.createGraphics();
                try {
                    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
                    face(g,top,new AffineTransform(1,.5,-1,.5,16,0));
                    face(g,front,new AffineTransform(1,.5,0,1,0,8));
                    face(g,right,new AffineTransform(1,-.5,0,1,16,16));
                } finally { g.dispose(); }
                ImageIO.write(result,"png",output.resolve("dimension-"+abbr+".png").toFile());
                count++;
            }
        }
        System.out.println("Imported "+count+" dimension cube icons.");
    }
}
