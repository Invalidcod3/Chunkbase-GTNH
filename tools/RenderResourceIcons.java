// Offline UI sprite renderer. Same cube geometry as Amidst dimension icons;
// a single mineral face receives directional lighting on the two side faces.
import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import javax.imageio.ImageIO;

class RenderResourceIcons {
    static BufferedImage frame(String path) throws Exception {
        BufferedImage image=ImageIO.read(Path.of(path).toFile());
        return image.getSubimage(0,0,image.getWidth(),Math.min(image.getWidth(),image.getHeight()));
    }
    static BufferedImage tint(BufferedImage image,int rgb,double shade) {
        BufferedImage out=new BufferedImage(image.getWidth(),image.getHeight(),BufferedImage.TYPE_INT_ARGB);
        for(int y=0;y<out.getHeight();y++)for(int x=0;x<out.getWidth();x++){
            int p=image.getRGB(x,y),r=(int)(((p>>16)&255)*((rgb>>16)&255)/255.0*shade);
            int g=(int)(((p>>8)&255)*((rgb>>8)&255)/255.0*shade),b=(int)((p&255)*(rgb&255)/255.0*shade);
            out.setRGB(x,y,(p&0xff000000)|(r<<16)|(g<<8)|b);
        }
        return out;
    }
    static void draw(Graphics2D g,BufferedImage image,AffineTransform transform){
        transform.scale(16.0/image.getWidth(),16.0/image.getHeight());g.drawImage(image,transform,null);
    }
    public static void main(String[] args)throws Exception{
        Path out=Path.of(args[1]);Files.createDirectories(out);int count=0;
        // stem, source, tint RGB, optional background, optional untinted overlay, flat|cube
        for(String line:Files.readAllLines(Path.of(args[0]))){
            String[] s=line.split("\t",-1);BufferedImage face=tint(frame(s[1]),Integer.parseInt(s[2],16),1);
            BufferedImage flat=new BufferedImage(32,32,BufferedImage.TYPE_INT_ARGB);
            Graphics2D g=flat.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
            if(!s[3].isEmpty())g.drawImage(frame(s[3]),0,0,32,32,null);
            g.drawImage(face,0,0,32,32,null);
            if(!s[4].isEmpty())g.drawImage(frame(s[4]),0,0,32,32,null);
            g.dispose();ImageIO.write(flat,"png",out.resolve(s[0]+"-flat.png").toFile());
            if(s[5].equals("cube")){
                BufferedImage cube=new BufferedImage(32,32,BufferedImage.TYPE_INT_ARGB);g=cube.createGraphics();
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
                draw(g,flat,new AffineTransform(1,.5,-1,.5,16,0));
                draw(g,tint(flat,0xffffff,.82),new AffineTransform(1,.5,0,1,0,8));
                draw(g,tint(flat,0xffffff,.62),new AffineTransform(1,-.5,0,1,16,16));
                g.dispose();ImageIO.write(cube,"png",out.resolve(s[0]+"-cube.png").toFile());
            }
            count++;
        }
        System.out.println("Rendered "+count+" distinct resource textures.");
    }
}
