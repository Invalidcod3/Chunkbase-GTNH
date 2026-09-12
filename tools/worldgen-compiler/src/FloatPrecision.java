package amidst.web;
import org.teavm.jso.JSBody;
/** Browser-only bytecode lowering for JVM binary32 arithmetic. Oracle never calls it. */
public final class FloatPrecision {
    @JSBody(params = {"value"}, script = "return Math.fround(value);")
    public static native float round(float value);
}
