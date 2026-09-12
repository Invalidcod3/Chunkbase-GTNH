// Port of java.util.Random semantics; all long arithmetic stays in BigInt.
const MASK = (1n << 48n) - 1n;
export const long = (value) => BigInt.asIntN(64, BigInt(value));
export function parseSeed(input) {
  const value = String(input).trim();
  if (!/^[+-]?\d+$/.test(value)) throw new Error("种子必须是 64 位整数");
  const seed = BigInt(value);
  if (seed < -(1n << 63n) || seed >= 1n << 63n)
    throw new Error("种子超出 64 位整数范围");
  return seed.toString();
}
export class JavaRandom {
  constructor(seed) {
    this.setSeed(seed);
  }
  setSeed(seed) {
    this.state = (BigInt(seed) ^ 0x5deece66dn) & MASK;
  }
  next(bits) {
    this.state = (this.state * 0x5deece66dn + 11n) & MASK;
    return Number(this.state >> BigInt(48 - bits));
  }
  nextInt(bound) {
    if (bound === undefined) return this.next(32) | 0;
    if (!Number.isInteger(bound) || bound < 1 || bound > 2147483647)
      throw new Error("Invalid random bound");
    if ((bound & (bound - 1)) === 0)
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits, value;
    do {
      bits = this.next(31);
      value = bits % bound;
    } while (((bits - value + bound - 1) | 0) < 0);
    return value;
  }
  nextLong() {
    return long((BigInt(this.nextInt()) << 32n) + BigInt(this.nextInt()));
  }
  nextDouble() {
    return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
  }
  nextFloat() {
    return this.next(24) / 16777216;
  }
}
export function regionRandom(seed, x, z, salt = 0) {
  return new JavaRandom(
    long(
      BigInt(x) * 341873128712n +
        BigInt(z) * 132897987541n +
        BigInt(seed) +
        BigInt(salt),
    ),
  );
}
export function forgeRandom(seed, x, z) {
  const random = new JavaRandom(seed);
  const a = random.nextLong() >> 3n,
    b = random.nextLong() >> 3n;
  random.setSeed(long(a * BigInt(x) + b * BigInt(z)) ^ BigInt(seed));
  return random;
}
