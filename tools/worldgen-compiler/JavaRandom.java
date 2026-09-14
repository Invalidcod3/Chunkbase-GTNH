package amidst.web;
/** Java's specified 48-bit stream, including its bounded-int rejection rule.
 * TeaVM's class-library nextInt(bound) uses a different reduction algorithm. */
public class JavaRandom {
    protected long state;
    public JavaRandom(){this(0);}
    public JavaRandom(long seed){setSeed(seed);}
    public void setSeed(long seed){state=(seed^0x5DEECE66DL)&((1L<<48)-1);}
    protected int next(int bits){state=(state*0x5DEECE66DL+11)&((1L<<48)-1);return (int)(state>>>(48-bits));}
    public int nextInt(){return next(32);}
    public int nextInt(int bound){
        if(bound<=0)throw new IllegalArgumentException("Positive bound required");
        if((bound&-bound)==bound)return (int)((bound*(long)next(31))>>31);
        int bits,value;do{bits=next(31);value=bits%bound;}while(bits-value+(bound-1)<0);return value;
    }
    public long nextLong(){return ((long)next(32)<<32)+next(32);}
    public float nextFloat(){return next(24)/(float)(1<<24);}
    public double nextDouble(){return (((long)next(26)<<27)+next(27))/(double)(1L<<53);}
    public boolean nextBoolean(){return next(1)!=0;}
}
