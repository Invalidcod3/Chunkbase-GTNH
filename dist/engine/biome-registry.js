const RESOURCE_KEY = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
export function assertResourceKey(key) {
  if (
    typeof key !== "string" ||
    !RESOURCE_KEY.test(key) ||
    key
      .split(":")[1]
      .split("/")
      .some((part) => !part || part === "." || part === "..")
  )
    throw new Error("无效生物群系命名空间标识：" + key);
  return key;
}
export class BiomeRegistry {
  constructor() {
    this.entries = new Map();
    this.indices = [];
    this.legacy = new Map();
  }
  register(entry) {
    const key = assertResourceKey(entry.key);
    if (
      !/^#[\da-f]{6}$/i.test(entry.color) ||
      typeof entry.zh !== "string" ||
      typeof entry.en !== "string"
    )
      throw new Error("无效生物群系描述：" + key);
    if (this.entries.has(key)) throw new Error("重复生物群系标识：" + key);
    if (this.indices.length >= 65535)
      throw new Error("生物群系目录超出渲染索引上限");
    const aliases = (entry.legacy || []).map((alias) => {
      if (
        typeof alias.environment !== "string" ||
        typeof alias.dimension !== "string" ||
        !Number.isInteger(alias.id)
      )
        throw new Error("无效旧版生物群系映射");
      const id = JSON.stringify([alias.environment, alias.dimension, alias.id]);
      if (this.legacy.has(id)) throw new Error("旧版生物群系映射冲突：" + id);
      return id;
    });
    if (new Set(aliases).size !== aliases.length)
      throw new Error("重复旧版生物群系映射");
    const record = { ...entry, index: this.indices.length };
    this.entries.set(key, record);
    this.indices.push(record);
    for (const alias of aliases) this.legacy.set(alias, key);
    return record;
  }
  get(key) {
    return this.entries.get(key);
  }
  at(index) {
    return this.indices[index];
  }
  resolveLegacy(environment, dimension, id) {
    return this.legacy.get(JSON.stringify([environment, dimension, id]));
  }
  encode(keys) {
    return Uint16Array.from(keys, (key) => {
      const entry = this.get(key);
      if (!entry) throw new Error("未注册的生物群系：" + key);
      return entry.index;
    });
  }
}
export const biomeRegistry = new BiomeRegistry();
