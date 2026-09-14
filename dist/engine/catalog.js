import { biomeRegistry } from "./biome-registry.js";
export { biomeRegistry };
export const dimensions = [
  {
    key: "overworld",
    id: 0,
    zh: "主世界",
    en: "Overworld",
    map: false,
    structures: true,
    note: "RWG + BOP 底图需要本地函数包；支持要塞、矿井及按环境配置启用的模组结构预测。",
  },
  {
    key: "nether",
    id: -1,
    zh: "下界",
    en: "Nether",
    map: false,
    structures: true,
    note: "BOP 下界底图尚未接入；可显示下界要塞和按环境配置启用的模组结构。",
  },
  {
    key: "end",
    id: 1,
    zh: "末地",
    en: "The End",
    map: true,
    structures: true,
    note: "按全新末地预测；岛屿圆形范围与 Amidst 一致，不代表实际地形轮廓。",
  },
  {
    key: "twilight",
    id: 7,
    zh: "暮色森林",
    en: "Twilight Forest",
    map: false,
    structures: false,
    note: "暮色森林生成器尚未接入。",
  },
  {
    key: "moon",
    id: -28,
    zh: "月球",
    en: "Moon",
    map: true,
    biome: 3200,
    structures: true,
    note: "使用默认维度配置；单一生物群系底色与 Amidst 一致。",
  },
  {
    key: "mars",
    id: -29,
    zh: "火星",
    en: "Mars",
    map: true,
    biome: 3300,
    structures: true,
    note: "单一生物群系；结构使用默认维度配置。",
  },
  {
    key: "ceres",
    id: -1007,
    zh: "谷神星",
    en: "Ceres",
    map: true,
    biome: 3100,
    structures: true,
    note: "单一生物群系；结构使用默认维度配置。",
  },
  {
    key: "io",
    id: -1013,
    zh: "木卫一",
    en: "Io",
    map: false,
    structures: true,
    note: "Io / IoAsh 底图尚未接入；可以预测地牢。",
  },
  {
    key: "enceladus",
    id: -1016,
    zh: "土卫二",
    en: "Enceladus",
    map: true,
    biome: 3101,
    structures: true,
    note: "单一生物群系；结构使用默认维度配置。",
  },
  {
    key: "proteus",
    id: -1019,
    zh: "海卫八",
    en: "Proteus",
    map: true,
    biome: 3102,
    structures: true,
    note: "单一生物群系；结构使用默认维度配置。",
  },
  {
    key: "pluto",
    id: -1008,
    zh: "冥王星",
    en: "Pluto",
    map: false,
    structures: true,
    note: "四种冥王星生物群系尚未接入；可以预测地牢。",
  },
];
const legacyBiomes = {
  3000: { zh: "末地虚空", en: "End void", color: "#17131f" },
  3001: { zh: "中央末地", en: "Central End", color: "#c9c29b" },
  3002: { zh: "感染森林", en: "Infested Forest", color: "#526b48" },
  3003: { zh: "燃烧山脉", en: "Burning Mountains", color: "#9b4b32" },
  3004: { zh: "魔法岛屿", en: "Enchanted Island", color: "#6575a8" },
  3200: { zh: "月球", en: "Moon", color: "#8c8c84" },
  3300: { zh: "火星", en: "Mars", color: "#9c563b" },
  3100: { zh: "谷神星", en: "Ceres", color: "#737b83" },
  3101: { zh: "土卫二", en: "Enceladus", color: "#737b83" },
  3102: { zh: "海卫八", en: "Proteus", color: "#737b83" },
};
const keys = {
  3000: "amidst:end_void",
  3001: "amidst:central_end",
  3002: "amidst:hee_infested_forest",
  3003: "amidst:hee_burning_mountains",
  3004: "amidst:hee_enchanted_island",
  3200: "galacticraftcore:moon",
  3300: "galacticraftmars:mars",
  3100: "amidst:ceres_preview",
  3101: "amidst:enceladus_preview",
  3102: "amidst:proteus_preview",
};
export const biomes = Object.create(null);
export const legacyDisplayKeys = Object.freeze({ ...keys });
for (const [id, entry] of Object.entries(legacyBiomes)) {
  const key = keys[id];
  biomes[key] = biomeRegistry.register({
    ...entry,
    key,
    synthetic: key.startsWith("amidst:"),
    legacy: [
      {
        environment: "amidst-worker-v0.3",
        dimension:
          Number(id) >= 3000 && Number(id) <= 3004
            ? "end"
            : Object.keys(keys).includes(id) && Number(id) === 3200
              ? "moon"
              : Number(id) === 3300
                ? "mars"
                : Number(id) === 3100
                  ? "ceres"
                  : Number(id) === 3101
                    ? "enceladus"
                    : "proteus",
        id: Number(id),
        kind:
          Number(id) === 3200 || Number(id) === 3300
            ? "web-adapter-slot"
            : "worker-display-id",
      },
    ],
  });
}
for (const d of dimensions) if (d.biome !== undefined) d.biome = keys[d.biome];
export const biomeByIndex = (index) => biomeRegistry.at(index);
export const kinds = {
  HEE_BIOME_ISLAND: {
    zh: "HEE 生物群系岛",
    en: "HEE biome island",
    color: "#b3c595",
  },
  HEE_DUNGEON_TOWER: {
    zh: "HEE 地牢塔",
    en: "HEE dungeon tower",
    color: "#cab4e9",
  },
  DRACONIC_CHAOS_ISLAND: { zh: "混沌岛", en: "Chaos island", color: "#dc7b98" },
  STRONGHOLD: { zh: "要塞", en: "Stronghold", color: "#d8d3ad" },
  MINESHAFT: { zh: "废弃矿井", en: "Mineshaft", color: "#c8996c" },
  MOON_DUNGEON: { zh: "月球地牢", en: "Moon dungeon", color: "#e5c88d" },
  MOON_VILLAGE: { zh: "月球村庄", en: "Moon village", color: "#a3d89e" },
  VILLAGE: { zh: "村庄候选", en: "Village candidate", color: "#d9b773" },
  NETHER_FORTRESS: {zh:"下界要塞",en:"Nether fortress",color:"#a76d65"},
  LOOTGAMES_DUNGEON: {zh:"LootGames 地牢",en:"LootGames dungeon",color:"#c69bdb"},
  TINKERS_SLIME_ISLAND: {zh:"史莱姆空岛",en:"Slime island",color:"#74cad3"},
  TINKERS_NETHER_SLIME_ISLAND: {zh:"下界史莱姆空岛",en:"Nether slime island",color:"#cc824e"},
  AUTOMAGY_NETHER_SPIRE: {zh:"Automagy 下界尖塔",en:"Automagy Nether spire",color:"#d7917e"},
  AE2_METEORITE: {zh:"AE2 陨石候选",en:"AE2 meteorite candidate",color:"#ada49e"},
  MARS_CAVERN: { zh: "火星洞穴", en: "Mars cavern", color: "#dfa58a" },
};
for (const key of ["mars", "ceres", "io", "enceladus", "proteus", "pluto"]) {
  const d = dimensions.find((d) => d.key === key);
  kinds[`${key.toUpperCase()}_DUNGEON`] = {
    zh: `${d.zh}地牢`,
    en: `${d.en} dungeon`,
    color: "#e6cb93",
  };
}
export const certainty = {
  POSSIBLE: "候选位置",
  EXPECTED: "预期位置",
  EXACT_FRESH_END: "全新末地位置",
  EXACT_CONFIG: "按配置计算",
  RECORDED: "存档记录",
};
