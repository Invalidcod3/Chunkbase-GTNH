package amidst.gtnh.worker;
import java.util.Random;
/** Adapter around the unchanged desktop reference; GPL-3.0. */
public final class AsteroidReferenceBridge {
    public interface Registry {
        Object stone(Random random) throws ReflectiveOperationException;
        Object ore(Object stone, boolean small, Random random) throws ReflectiveOperationException;
    }
    public static Object[] select(long seed,int dim,int cx,int cz,boolean enabled,int probability,int minY,int maxY,int minRadius,int maxRadius,final Registry registry)throws ReflectiveOperationException {
        AsteroidOrePredictor.Candidate c=AsteroidOrePredictor.select(seed,dim,cx,cz,new AsteroidOrePredictor.Config(enabled,probability,minY,maxY,minRadius,maxRadius),new AsteroidOrePredictor.Registry(){
            public Object stone(Random r)throws ReflectiveOperationException{return registry.stone(r);}
            public Object ore(Object s,boolean small,Random r)throws ReflectiveOperationException{return registry.ore(s,small,r);}
        });
        return c==null?null:new Object[]{c.layer,c.small,c.x,c.y,c.z,c.radius};
    }
}
