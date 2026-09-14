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
  END_NAQUADAH_ASTEROID: {zh:"硅岩小行星",en:"Naquadah asteroid",color:"#456442"},
  END_SCHEELITE_ASTEROID: {zh:"白钨矿小行星",en:"Scheelite asteroid",color:"#d7a32d"},
  END_PLATINUM_ASTEROID: {zh:"铂小行星",en:"Platinum asteroid",color:"#dedb9e"},
  STRONGHOLD: { zh: "要塞", en: "Stronghold", color: "#d8d3ad" },
  MINESHAFT: { zh: "废弃矿井", en: "Mineshaft", color: "#c8996c" },
  MOON_DUNGEON: { zh: "月球地牢", en: "Moon dungeon", color: "#e5c88d" },
  MOON_VILLAGE: { zh: "月球村庄", en: "Moon village", color: "#a3d89e" },
  VILLAGE: { zh: "村庄候选", en: "Village candidate", color: "#d9b773" },
  VANILLA_SPAWNER_DUNGEON: {zh:"刷怪笼候选",en:"Spawner dungeon candidate",color:"#a5a5a5"},
  NETHER_FORTRESS: {zh:"下界要塞",en:"Nether fortress",color:"#a76d65"},
  LOOTGAMES_DUNGEON: {zh:"LootGames 地牢",en:"LootGames dungeon",color:"#c69bdb"},
  TINKERS_SLIME_ISLAND: {zh:"史莱姆空岛",en:"Slime island",color:"#74cad3"},
  TINKERS_NETHER_SLIME_ISLAND: {zh:"下界史莱姆空岛",en:"Nether slime island",color:"#cc824e"},
  AUTOMAGY_NETHER_SPIRE: {zh:"Automagy 下界尖塔",en:"Automagy Nether spire",color:"#d7917e"},
  AE2_METEORITE: {zh:"AE2 陨石候选",en:"AE2 meteorite candidate",color:"#ada49e"},
  ROGUELIKE_DUNGEON: {zh:"Roguelike 地牢",en:"Roguelike dungeon",color:"#caa779"},
  THAUMCRAFT_AURA_NODE: {zh:"灵气节点",en:"Aura node",color:"#96d3e6"},
  THAUMCRAFT_ELDRITCH_ALTAR: {zh:"邪术祭坛",en:"Eldritch altar",color:"#b290d8"},
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
  EXACT: "种子定位",
  POSSIBLE: "候选位置",
  EXPECTED: "预期位置",
  EXACT_FRESH_END: "全新末地位置",
  EXACT_CONFIG: "按配置计算",
  RECORDED: "存档记录",
};
export const twilightFeatures=[
  ['SMALL_HOLLOW_HILL','小型矿山','Small Hollow Hill',1],['MEDIUM_HOLLOW_HILL','中型矿山','Medium Hollow Hill',2],['LARGE_HOLLOW_HILL','大型矿山','Large Hollow Hill',3],
  ['HEDGE_MAZE','树篱迷宫','Hedge Maze',4],['NAGA_COURTYARD','娜迦庭院','Naga Courtyard',5],['LICH_TOWER','巫妖塔','Lich Tower',6],
  ['ICE_TOWER','极光宫殿','Ice Tower',7],['QUEST_ISLAND','任务岛','Quest Island',8],['QUEST_GROVE','任务树丛','Quest Grove',9],
  ['DRUID_GROVE','德鲁伊树丛','Druid Grove',10],['FLOATING_RUINS','浮空遗迹','Floating Ruins',11],['HYDRA_LAIR','九头蛇巢穴','Hydra Lair',12],
  ['LABYRINTH','地下迷宫','Labyrinth',13],['DARK_TOWER','黑暗高塔','Dark Tower',14],['KNIGHT_STRONGHOLD','骑士要塞','Knight Stronghold',15],
  ['WORLD_TREE','世界树','World Tree',16],['YETI_LAIR','雪怪巢穴','Yeti Lair',17],['TROLL_LAIR','巨魔洞窟','Troll Lair',18],
  ['FINAL_CASTLE','最终城堡','Final Castle',19],['MUSHROOM_TOWER','蘑菇塔','Mushroom Tower',20],
];
for(const [key,zh,en] of twilightFeatures)kinds['TWILIGHT_'+key]={zh,en,color:'#b8c785'};
export const markerTypeKey=m=>m.kind==='TWILIGHT_FEATURE'?'TWILIGHT_'+m.subtype:m.kind;
