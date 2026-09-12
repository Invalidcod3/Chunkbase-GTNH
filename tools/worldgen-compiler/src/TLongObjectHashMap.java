package gnu.trove.map.hash;
/** Cache adapter preserving long key equality. No world-generation decisions. */
public final class TLongObjectHashMap<T> {
    private final java.util.HashMap<Long,T> values = new java.util.HashMap<>();
    public T get(long key) { return values.get(key); }
    public T put(long key, T value) { return values.put(key, value); }
    public int size() { return values.size(); }
    public void clear() { values.clear(); }
}
