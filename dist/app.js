import { MapView } from "./map.js";
import {createThemeUI} from './theme-ui.js';
import {createNoticeDiagram} from './notice-diagram.js';
import {BiomeSelection} from './biome-selection.js';
import {depositIcon} from './resource-icons.js';
import {resourceName,localizeResourceText} from './resource-names.js';
import {restoreStructureFilters,structureFilterCounts} from './structure-filters.js';
import {observePageLifecycle} from './page-lifecycle.js';
import {
  dimensions,
  registerDimension,
  biomes,
  biomeByIndex,
  biomeRegistry,
  kinds,
  certainty,
  twilightFeatures,
  roguelikeTypes,
  markerTypeKey,
} from "./engine/catalog.js";
import { parseSeed } from "./engine/random.js";
import { csv, resourceCsv, journeyMap, download } from "./export.js";
import { resourcePoints, resourceMatches } from "./engine/resources.js";
import { collectResourceView } from "./engine/resource-query.js";
import { collectStructureView } from "./engine/structure-query.js";
import { collectDungeonView, DUNGEON_KIND } from "./engine/dungeon-query.js";
import { biomeExportQuery } from "./engine/biome-query.js";
import { defaults, validateConfig } from "./engine/config.js";
import { readRegistry, registerPackBiomes } from "./engine/packs.js";
import { ComputePool } from "./engine/compute-pool.js";
import {gpuModeAtLevel,gpuLevelForMode,gpuComputeLevel,readParallelismSelection,writeParallelismSelection,MAX_PARALLELISM} from './gpu-settings.js';
import {normalizeAllocation,refinementWorkers,readAllocation,writeAllocation} from './compute-allocation.js';
import {readSavedSpawn,matchingSavedSpawn,includeSavedSpawn} from './saved-spawn.js';
import { ExportJob, exportBounds } from './export-job.js';
import {readPreferences,writePreferences} from './preferences.js';
import {readGpuPreference,writeGpuPreference} from './gpu-biome-renderer.js';
const $ = (id) => document.getElementById(id);
let themeUI;
let config = structuredClone(defaults),
  language = "zh",
  seed = $("seed").value,
  dimension = "end",
  selectedPoint = null,
  worldRevision = 0,
  structureRevision = 0,
  loadedBounds = null,
  resourcesTruncated = false,
  structuresTruncated = false,
  markerController = null;
let preferencesReady=false,preferencesKey='';
function savePreferences(){
  if(!preferencesReady)return;
  clearTimeout(savePreferences.timer);savePreferences.timer=setTimeout(persistPreferences,300);
}
function persistPreferences(){
  if(!preferencesReady)return;
  try{writePreferences(localStorage,preferencesKey,{seed,dimension,markerMode:view.markerMode,x:view.x,z:view.z,level:view.level,filtered:[...view.filtered],biomeSelection:view.biomeSelection,resourceFilter:{id:'',minY:0,maxY:255,...view.resourceFilter},flags:Object.fromEntries(['showBiomes','showStructures','grid','inertia','smooth'].map(k=>[k,view[k]])),config});}catch{}
}
try {
  language = localStorage.getItem("amidst-language") || "zh";
  if (!["zh", "en"].includes(language)) language = "zh";
} catch {}
const english = {
  poi:'Points of interest',filterPanel:'Filters',showPoints:'Show points of interest',showBiomeMap:'Show biome map',selectAll:'Select all',selectNone:'Select none',
  computeAllocation:'Compute allocation',allocationSpeed:'Speed first',allocationQuality:'Clarity first',
  gpuRendering:'GPU acceleration',gpuOff:'Off (compatibility)',gpuAuto:'Automatic (rendering)',gpuOn:'On (rendering)',gpuAggressive:'Aggressive (rendering + compute)',gpuRetry:'Retry GPU acceleration',
  gpuNote:'Experimental compute acceleration runs after device checks and falls back on failure. Levels select computation scope, not GPU utilization. All levels retain the same precision.',computeParallelism:'Compute parallelism',customThreads:'Custom workers',retryParallelism:'Retry worker capacity',customParallelism:'Custom',
  biomeColor:'Biome color',resetColor:'Reset color',packageInfo:'Environment package',
  spawn:'World spawn',strongholdList:'Strongholds',loadSavedSpawn:'Read level.dat spawn',clearSavedSpawn:'Clear imported spawn',savedSpawnNote:'Reads the selected local file only, then switches to its seed. Does not read chunks, upload files or modify the save.',
  resourceType:'Resource type',oreHeight:'Ore Y range overlap',exportRange:'Export area',currentView:'Current view',customRange:'Custom bounds',exclusiveMax:'Maximum coordinates are excluded.',fluidChunks:'Fluid chunks per field',bestChunk:'Best chunk in area',allChunks:'All matching chunks',cancelExport:'Cancel export',
  retryMap: 'Retry failed layers',
  markerMode:"Marker mode",ores:"Ore veins",fluids:"Underground fluids",resourceSearch:"Name / material",minimumFluid:"Minimum initial L/Op",
  seed: "Seed",
  load: "Load",
  dimension: "Dimension",
  export: "Export",
  settings: "Settings",
  about: "Sources",
  layers: "Layers",
  biomes: "Biomes",
  structures: "Structures",
  grid: "Grid",
  copy: "Copy coordinates",
  goto: "Go to",
  go: "Go",
  screenshot: "Save map PNG",
  local: "Computed locally · No sign-in",
  inertia: "Smooth dragging",
  smooth: "Smooth map image",
  chaos: "Generate chaos islands",
  separation: "Chaos island spacing (blocks)",
  configNote:
    "Defaults may differ from your modpack. Import an environment configuration to match dimension IDs and generation options.",
  importConfig: "Import environment JSON",
  downloadConfig: "Download configuration",
  exportTitle: "Export current view",
  exportNote:
    "Exports the current dimension, view, marker mode and filters. Fluid exports use chunk centres and initial L/Op.",
  limit: "Maximum waypoints",
  waypointY: "JourneyMap waypoint height",
  exportFoot:
    "Markers are scanned in batches and stop at the limit; the view may not be fully scanned. Results are sorted by coordinates. Asteroids use their predicted centre Y; recorded spawn uses its saved Y. Other markers use the supplied height.",
  aboutTitle: "Sources and support",
  disclaimer:
    "Unofficial seed preview. Predictions may differ from generated worlds. Mod names and assets belong to their respective owners.",
  noticeTitle: "Usage notes",
  noticeIntro: "This tool predicts locations by replaying part of the seed's generation algorithms. Replaying every world-generation step would require more computation and substantially longer waits. To balance speed and usability, some checks that depend on actual blocks are omitted, so predictions may differ from the game.",
  noticeGenerationBefore: "In Minecraft 1.7.10 modded generation, some structures check the blocks present after features such as trees and gravel have been placed. Because ",
  noticeDecoration: "terrain decoration",
  noticeGenerationAfter: " crosses chunk boundaries, changing the chunk generation order can change the distribution of features. Ore veins may also select different candidates depending on which chunk is checked first. The same seed can therefore produce different results, as illustrated below.",
  noticeKnownTitle: "Locations with reported differences",
  noticeKnownIntro: "Users have reported differences for these types. Select at least 2–3 locations of the same type as alternatives.",
  noticeVillage: "Villages: Village Names spacing, biome filtering and the village-free origin radius have been corrected. Icons mark candidate starting chunks; building assembly can still fail, and different mod versions or generation settings may require a different prediction profile.",
  noticeRoguelike: "Roguelike dungeons: The map replays site, biome and entrance selection, but does not generate the blocks around an entrance. Steep ground, caves or water can make the game try another site or skip it.",
  noticeOres: "Ore veins: Ordinary veins replay only the first choice. Actual placement also depends on height, terrain, stone type and retries after failure; an icon does not guarantee that vein exists there. Near the surface, pay particular attention to terrain and vein height.",
  noticeDungeon: "Vanilla spawner dungeons: A dungeon may not generate if its surrounding blocks do not meet the placement conditions.",
  noticeOtherTitle: "Locations without reported differences so far",
  noticeOtherIntro: "No differences have been reported for the following types so far, but their actual generation still needs checking.",
  noticeOtherStructures: "Mineshafts, LootGames dungeons, AE2 meteorites, Nether spires, aura nodes, altars and some space structures are generally useful predictions, but still need verification in game. Other generation steps or environmental conditions may prevent a target from appearing.",
  noticeApproximate: "Strongholds use expected coordinates without the final biome adjustment; slime island icons mark approximate centres; seed-predicted world spawn is estimated. None is an exact block location.",
  noticeConclusion: "The web predictions are generally useful, but still need verification in game. A seed alone cannot fully reconstruct the generation history and block state of an existing world.",
  noticeDesktopBefore: "For more detailed checks, use ",
  noticeDesktopAfter: ". It supports bulk coordinate export to JourneyMap. When connected to a game world with the same seed, it can also read Visual Prospecting's recorded veins and biome data from loaded chunks to help verify predictions. Other structures may still be candidates.",
  noticeContinue: "Got it, open map",
  noticeReopen: "Read usage and coordinate notes",
  contact: "Source repository",
  creditsTitle: "Credits",
  creditsRole: "Contribution",
  creditsAuthor: "Author / Team",
  webAuthor: "Website author",
  amidstAuthor: "Amidst author",
  amidstContributors: "Skidoodle (skiphs) and Amidst contributors",
  gtnhAdaptation: "Amidst-GTNH adaptation",
  modpackTeam: "GTNH modpack",
  gtnhContributors: "GT New Horizons team and contributors",
  modAuthors: "Mod authors",
  modContributors: "Original mod authors and GTNH maintainers",
  translationAuthors: "Chinese translation",
  translationContributors: "Kiwi and Translation-of-GTNH contributors",
  capabilitiesTitle: "Dimension support",
};
const chinese = new Map(
  [...document.querySelectorAll("[data-i18n]")].map((e) => [
    e.dataset.i18n,
    e.textContent,
  ]),
);
english.exportBiomes = "Biome JSON";
const noticeDiagram = createNoticeDiagram($("notice-diagram"), () => language);
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 5000);
}
const workerClient = new ComputePool();
let savedSpawn=null,spawnImportRevision=0;
let gpuComputeState='off';
workerClient.onGpuComputeStatus=state=>{gpuComputeState=state;renderGpuStatus(view.gpuState);};
async function request(action, query, options) {
  if(options?.signal?.aborted)throw Error('CANCELLED');
  const q={config,excludedKinds:[...view.filtered],...query},record=savedSpawn;
  if(action==='predictSpawn'){const point=matchingSavedSpawn(record,q);if(point)return point;}
  const result=await workerClient.request(action,q,options);
  return action==='predictStructures'&&Array.isArray(result)?includeSavedSpawn(result,record,q):result;
}
const view = new MapView($("map-canvas"), {
  request,
  previewPolicy:key=>dimensions.find(d=>d.key===key)?.biomePreview!=='direct',
  onGpuStatus:status=>renderGpuStatus(status),
  onMove: (point, biome) => {
    $("coordinates").textContent =
      `X: ${Math.floor(point.x).toLocaleString()} · Z: ${Math.floor(point.z).toLocaleString()}`;
    const d=dimensions.find(d=>d.key===dimension);
    const b=biomeByIndex(biome) || biomeRegistry.get(d.uniformBiome || d.biome);
    $("biome-name").textContent = b ? `${d[language]} · ${b[language]}` : "";
  },
  onSelect: showDetail,
  onViewport: refreshStructures,
  onViewportChange:()=>{invalidateMarkers();savePreferences();themeUI?.updateCoordinates();},
  onMapProgress:({remaining,previews,failed=0})=>{
    $("map-quality").hidden=remaining===0;
    $("map-quality").textContent=language==='zh'
      ? (failed?`${failed} 块底图加载失败`:(previews?'地图预览 · 正在精化':'底图加载中…'))
      : (failed?`${failed} map tiles failed`:(previews?'Map preview · Refining':'Loading biome map…'));
    $("retry-map").hidden=failed===0&&!view.markerError;
    $('marker-error').hidden=!view.markerError;$('marker-error').textContent=view.markerError||'';
  },
  onError: (error) => {
    if (error.message !== "CANCELLED") toast(error.message);
  },
});
let parallelismState;
workerClient.onParallelismStatus=status=>{
  parallelismState=status;
  // Keep the original four-request pipeline at low levels. Grow its window
  // with ready workers, rather than queuing dozens during runtime startup.
  view.tileConcurrency=Math.max(4,Math.min(status.effective,status.ready+1));
  view.allocation=status.allocation||0;
  view.allocationWorkers=Math.max(1,Math.min(status.effective,status.ready));
  view.dirty=true;renderParallelismStatus();renderAllocation();
};
const assetNames = {
  WORLD_SPAWN:'spawn',
  HOLLOW_ASTEROID:'minecraft_grass_side',ASTEROID_BASE_HUMAN:'galacticraft_decorative_tin',ASTEROID_BASE_MECHANICAL:'minecraft_iron_block',ASTEROID_BASE_BIRD:'galacticraft_moon_rock',
  MEHEN_DARK_MATTER_ASTEROID:"avaritia_stellar_fuel",
  ROSS_128B_RUIN:"minecraft_bricks",
  DEEP_DARK_DUNGEON:"minecraft_stonebrick_mossy",
  ANUBIS_ROBOT_VILLAGE:"galacticraft_solar_module_full",
  HORUS_OBSIDIAN_PYRAMID:"amunra_obsidian_brick",
  DRACONIC_CHAOS_ISLAND: "draconic_chaotic_core",
  END_NAQUADAH_ASTEROID: "gregtech_naquadah_dust_highlighted",
  END_SCHEELITE_ASTEROID: "gregtech_scheelite_dust",
  END_PLATINUM_ASTEROID: "gregtech_platinum_dust",
  MARS_CAVERN: "galacticraft_mars_cavern_vine",
  HEE_DUNGEON_TOWER: "ender_eye",
  INFESTED_FOREST: "hee_infested_endstone_side",
  BURNING_MOUNTAINS: "hee_burned_endstone_side",
  ENCHANTED_ISLAND: "hee_enchanted_endstone_side",
  STRONGHOLD: "ender_eye",
  MINESHAFT: "mineshaft",
  MOON_DUNGEON: "galacticraft_moon_dungeon_brick",
  MOON_VILLAGE: "galacticraft_alien_villager",
  VILLAGE: "village",
  VANILLA_SPAWNER_DUNGEON: "vanilla_spawner_dungeon",
  NETHER_FORTRESS: "nether_fortress",
  LOOTGAMES_DUNGEON: "lootgames_dungeon",
  TINKERS_SLIME_ISLAND: "tinkers_blue_slime_ball",
  TINKERS_NETHER_SLIME_ISLAND: "tinkers_blue_slime_ball",
  AUTOMAGY_NETHER_SPIRE: "thaumcraft_eldritch_altar",
  AE2_METEORITE: "ae2_certus_quartz",
  ROGUELIKE_DUNGEON: "village",
  THAUMCRAFT_AURA_NODE: "thaumcraft_aura_node",
  THAUMCRAFT_ELDRITCH_ALTAR: "thaumcraft_eldritch_altar",
  MARS_DUNGEON: "galacticraft_mars_dungeon_brick",
  CERES_DUNGEON: "galaxyspace_ceres_dungeon_brick",
  IO_DUNGEON: "galaxyspace_io_dungeon_brick",
  ENCELADUS_DUNGEON: "galaxyspace_enceladus_dungeon_brick",
  PROTEUS_DUNGEON: "galaxyspace_proteus_dungeon_brick",
  PLUTO_DUNGEON: "galaxyspace_pluto_dungeon_brick",
};
for(const [key,,,id] of twilightFeatures){
  const asset=`twilight_feature_${String(id).padStart(2,'0')}`;
  assetNames[`TWILIGHT_FEATURE:${key}`]=asset;
  assetNames[`TWILIGHT_${key}`]=asset;
}
for(const type of roguelikeTypes){
  assetNames[`ROGUELIKE_DUNGEON:${type.subtype}`]=type.icon;
  assetNames[type.key]=type.icon;
}
for (const [kind, name] of Object.entries(assetNames)) {
  const image = new Image();
  image.onload = () => (view.dirty = true);
  image.src = `./assets/${name}.png`;
  view.images.set(kind, image);
}
function applyLanguage() {
  view.language=language;view.dirty=true;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.textContent =
      language === "en"
        ? english[el.dataset.i18n]
        : chinese.get(el.dataset.i18n);
  noticeDiagram.refresh();
  $("dimension").replaceChildren(
    ...dimensions.map((d) => {
      const o = new Option(d[language], d.key);
      o.selected = d.key === dimension;
      return o;
    }),
  );
  worldText();
  renderFilters();
  renderCapabilities();
  if(preferencesReady)renderColorEditor();
  renderGpuStatus(view.gpuState);
  renderGpuLevel();renderParallelism();renderAllocation();
  themeUI?.sync();
  if(!$('detail').hidden && view.selected)showDetail(view.selected,selectedPoint);
}
function renderGpuLevel() {
  const level=gpuLevelForMode(gpuModeAtLevel($('gpu-rendering').value));
  const names=language==='zh'?['关闭','轻量绘图','增强绘图','计算加速','扩展计算']:['Off','Light rendering','Enhanced rendering','Compute','Extended compute'];
  const notes=language==='zh'?[
    '使用兼容绘图和 CPU 计算。',
    '可用时由 GPU 处理配色、缩放与合成。',
    '在绘图加速基础上，优先请求高性能设备。',
    '额外计算矿井候选和末地群系范围，至少 1,024 个采样点或区块时尝试 GPU。',
    '额外计算主世界／下界史莱姆空岛和下界尖塔；从 256 个采样点或区块起尝试 GPU。',
  ]:[
    'Compatibility rendering and CPU computation.',
    'GPU colors, zoom and composition when available.',
    'GPU rendering with a high-performance device preference.',
    'Also computes mineshaft candidates and End biome areas; attempts GPU for batches of at least 1,024 samples or chunks.',
    'Also computes overworld/Nether slime islands and Nether spires; attempts GPU from 256 samples or chunks.',
  ];
  $('gpu-level-label').textContent=`${level} / 4 · ${names[level]}`;
  $('gpu-rendering').setAttribute('aria-valuetext',names[level]);
  $('gpu-level-detail').textContent=notes[level];
}
function renderParallelism() {
  const custom=Number($('compute-parallelism').value)===5;
  const count=custom?Number($('custom-threads').value):Number($('compute-parallelism').value);
  const valid=Number.isInteger(count)&&count>=1&&count<=MAX_PARALLELISM;
  const label=custom?(language==='zh'?`自定义：${valid?count:'—'} 个线程`:`Custom: ${valid?count:'—'} workers`)
    :language==='zh'?`${count} 个计算线程`:`${count} compute worker${count===1?'':'s'}`;
  $('parallelism-label').textContent=label;$('compute-parallelism').setAttribute('aria-valuetext',label);
  $('custom-threads-row').hidden=!custom;
  $('parallelism-note').textContent=language==='zh'
    ?'第 5 档可自定义 1～64 个线程，按设备能力逐步启动，异常时自动退让。更多线程会增加内存开销；额外线程空闲一分钟后释放，主线程缓存保留。降低并行度时等待已有查询完成。'
    :'Level 5 allows 1–64 workers, started gradually within device limits with fallback on errors. More workers use more memory. Extra workers are released after one idle minute; the primary cache stays warm. Reducing parallelism lets current queries finish.';
  renderParallelismStatus();
}
function renderAllocation() {
  const balance=normalizeAllocation($('compute-allocation').value),zh=language==='zh';
  const ready=Math.min(parallelismState?.ready||0,parallelismState?.effective||1),quality=refinementWorkers(Math.max(1,ready),balance);
  const label=balance===0?(zh?'速度优先':'Speed first'):balance===100?(zh?'观感优先':'Clarity first'):(zh?`观感倾向 ${balance}%`:`Clarity preference ${balance}%`);
  $('allocation-label').textContent=label;$('compute-allocation').setAttribute('aria-valuetext',label);
  $('allocation-status').textContent=ready<1?(zh?'等待计算线程就绪…':'Waiting for workers…'):ready===1?(zh?'单线程：先出图，再精化。':'One worker: coverage first, then refinement.'):
    (zh?`就绪线程分配：出图 ${ready-quality} · 精化 ${quality}`:`Ready worker allocation: coverage ${ready-quality} · refinement ${quality}`);
  $('allocation-note').textContent=zh?'向右增加把粗预览变清晰的线程比例，至少保留一个出图线程；比例按就绪线程数取整。无精化任务时全部线程可用于出图，最终精度相同。直接生成完整瓦片的维度不增加额外精化。':
    'Move right to reserve more workers for refining previews, keeping at least one for coverage. Shares are rounded to ready workers. Unused capacity returns to coverage; final precision is unchanged. Dimensions that generate complete tiles directly need no extra refinement.';
}
function renderParallelismStatus() {
  if(!parallelismState)return;
  const s=parallelismState,zh=language==='zh';
  const reasons={device:zh?'根据设备提示控制并行度':'Limited by device hints',startup:zh?'新线程未能启动，已停止扩张':'Worker creation failed; expansion stopped',
    timeout:zh?'线程启动超时，已停止扩张':'Worker startup timed out; expansion stopped',worker:zh?'线程运行异常，已停止扩张':'Worker failed; expansion stopped'};
  $('parallelism-status').textContent=(zh?`目标 ${s.requested} · 当前上限 ${s.effective} · 已就绪 ${s.ready} · 启动中 ${s.started-s.ready}`
    :`Requested ${s.requested} · Current limit ${s.effective} · Ready ${s.ready} · Starting ${s.started-s.ready}`)
    +(s.draining?(zh?` · 等待回收 ${s.draining}`:` · Draining ${s.draining}`):'')+(s.reason?'。'+reasons[s.reason]:'');
  $('parallelism-retry').hidden=!['startup','timeout','worker'].includes(s.reason);
}
function renderGpuStatus(status={state:'off',mode:'off'}){
  const messages={
    off:['当前：兼容绘制','Current: compatibility rendering'],
    starting:['正在检查 GPU 绘制…','Checking GPU rendering…'],
    active:['当前：GPU 底图绘制已启用','Current: GPU biome rendering enabled'],
    unavailable:['当前环境不支持 GPU 绘制，已使用兼容绘制','GPU rendering unavailable; using compatibility rendering'],
    lost:['GPU 连接中断，已使用兼容绘制；恢复后会重新检查','GPU connection lost; using compatibility rendering until recovery'],
    failed:['GPU 绘制检查未通过或运行异常，已使用兼容绘制','GPU check or rendering failed; using compatibility rendering'],
  };
  $('gpu-status').textContent=(messages[status.state]||messages.failed)[language==='zh'?0:1];
  const computing=gpuComputeLevel(status.mode)>=3;
  const computeMessages={
    off:['计算：CPU','Compute: CPU'],
    idle:['计算：等待所选档位支持的新查询；已有缓存继续复用','Compute: waiting for a new supported query; cached data is reused'],
    starting:['计算：GPU 后台自检中，当前查询使用 CPU…','Compute: GPU checks running in background; queries use CPU…'],
    ready:['计算：所选档位的本机检查通过','Compute: device checks passed for the selected level'],
    active:['计算：已完成 GPU 查询','Compute: GPU query completed'],
    partial:['计算：部分线程使用 GPU，异常线程已回退 CPU','Compute: some workers use GPU; affected workers use CPU'],
    unavailable:['计算：WebGPU 不可用，继续使用 CPU','Compute: WebGPU unavailable; using CPU'],
    lost:['计算：GPU 连接中断，已回退 CPU，可手动重试','Compute: GPU device lost; using CPU, retry available'],
    failed:['计算：检查未通过或运行异常，已回退 CPU，可手动重试','Compute: check or execution failed; using CPU, retry available'],
  };
  $('gpu-compute-status').hidden=!computing;
  $('gpu-compute-status').textContent=(computeMessages[gpuComputeState]||computeMessages.failed)[language==='zh'?0:1];
  $('gpu-retry').hidden=!['unavailable','lost','failed'].includes(status.state)&&!(computing&&['unavailable','lost','failed','partial'].includes(gpuComputeState));
}
function worldText() {
  const d = dimensions.find((d) => d.key === dimension);
  $("map-title").textContent = d[language];
  $("mode-note").textContent =
    language === "zh"
      ? d.note
      : d.noteEn || (d.key === "end"
        ? "Fresh End; schematic island areas match the desktop preview."
        : d.map
          ? d.key === "overworld" ? "RWG biome preview. Using the installed environment pack." : "Single-biome preview. Using environment configuration."
          : "Biome runtime pending. Only implemented predictions are shown.");
  // Presentation only: do not register a synthetic biome or change provider capabilities.
  view.backgroundColor = d.map ? null : "#737b83";
  if (!d.map) $("mode-note").textContent = language === "zh"
    ? "单色底图 · 群系分布暂未提供"
    : "Solid background · Biome distribution unavailable";
  $("mode-note").title = language === "zh" ? d.note : d.noteEn || $("mode-note").textContent;
  const fixedBiome=biomeRegistry.get(d.uniformBiome || d.biome);
  $("mode-note").toggleAttribute('data-biome',!!fixedBiome);
  if(fixedBiome) {
    $("mode-note").textContent=(language==='zh'?'生物群系：':'Biome: ')+fixedBiome[language];
    $("mode-note").style.setProperty('--biome-color',fixedBiome.color);
    $("biome-name").textContent=`${d[language]} · ${fixedBiome[language]}`;
  }else $("biome-name").textContent="";
  view.dirty = true;
  $("resource-controls").hidden=view.markerMode === "STRUCTURE";
  $("fluid-threshold").hidden=view.markerMode !== "FLUID";
  $("ore-height").hidden=view.markerMode !== "ORES";
  const options=d.resourceOptions?.[view.markerMode] || [];
  $("resource-type").replaceChildren(new Option(language==='zh'?'全部资源':'All resources',''),...options.map(o=>new Option(resourceName(o,language)+' · '+o.id,o.id)));
  if(!options.some(o=>o.id===view.resourceFilter.id))view.resourceFilter.id='';
  $("resource-type").value=view.resourceFilter.id||'';
  $("kind-filters").hidden=view.markerMode !== "STRUCTURE";
  $("show-structures").disabled=view.markerMode !== "STRUCTURE";
  resourceStatus();
  $('spawn').disabled=dimension!=='overworld'||!d.spawn&&!matchingSavedSpawn(savedSpawn,{seed,dimension});
  themeUI?.sync();
}
function resourceStatus(available) {
  const active=view.markerMode !== "STRUCTURE",d=dimensions.find(d=>d.key===dimension);
  if(active && d.resources && d.resourceModes && !d.resourceModes.includes(view.markerMode)) {
    $("resource-status").textContent=language==='zh'
      ? `当前环境未在此维度配置${view.markerMode==='FLUID'?'地下流体':'矿脉'}。`
      : 'This environment has no configuration for this resource layer in this dimension.';
    return;
  }
  $("resource-status").textContent=language==='zh'
    ? !d.resources || available===false ? '矿脉／流体函数包待接入；当前没有资源预测数据。' : ''
    : !d.resources || available===false ? 'Resource function pack pending; no prediction data.' : '';
}
function loadWorld(next = {}) {
  let nextSeed;
  try {
    nextSeed = parseSeed($("seed").value);
  } catch (error) {
    // Inputs can contain a draft seed; rejected changes never mutate the active world.
    $("dimension").value = dimension;
    $("marker-mode").value = view.markerMode;
    $("chaos").checked = config.chaosEnabled;
    $("chaos-separation").value = config.chaosSeparation;
    toast(error.message);
    return false;
  }
  const preserveBiomes = nextSeed === seed && (next.dimension ?? dimension) === dimension && !next.config;
  seed = nextSeed;
  dimension = next.dimension ?? dimension;
  config = next.config ?? config;
  view.markerMode = next.markerMode ?? view.markerMode;
  view.markerError=null;
  $("seed").value = seed;
  $("dimension").value = dimension;
  $("marker-mode").value = view.markerMode;
  $("chaos").checked = config.chaosEnabled;
  $("chaos-separation").value = config.chaosSeparation;
  worldRevision++;
  structureRevision++;
  loadedBounds = null;
  resourcesTruncated = false;
  structuresTruncated = false;
  applyColors();
  workerClient.reset();
  view.setWorld(seed, dimension, {preserveBiomes});
  $("detail").hidden = true;
  $("biome-name").textContent = "";
  worldText();
  renderFilters();
  return true;
}
function invalidateMarkers() {
  structureRevision++;
  markerController?.abort();
  markerController=null;
  loadedBounds=null;
  $("progress").hidden=true;
}
async function refreshStructures(bounds) {
  invalidateMarkers();
  if(view.suspended)return;
  const revision = ++structureRevision,
    world = worldRevision;
  if(view.markerMode==='STRUCTURE' && !view.showStructures)return;
  const controller=new AbortController();markerController=controller;
  const currentRequest=(action,query)=>request(action,query,{signal:controller.signal,priority:1});
  const isCancelled=()=>controller.signal.aborted || revision!==structureRevision || world!==worldRevision;
  $("progress").hidden = false;
  $("progress").textContent = language === "zh" ? "计算中…" : "Computing…";
  try {
    const resourceMode=view.markerMode !== "STRUCTURE";
    const query = {
      seed,
      dimension,
      bounds,
      mode:view.markerMode,
    };
    let result;
    if (resourceMode) {
      const filter={...view.resourceFilter};
      const collected = await collectResourceView(currentRequest, query, {
        centreFirst:true,
        select:values=>values.filter(d=>resourceMatches(d,filter)),
        isCancelled,
        onBatch:(items, progress)=>{
          view.resources=items; view.markers=[]; view.dirty=true;
          resourcesTruncated=progress.truncated;
          updateCount();
          $("progress").textContent=`${language==='zh'?'计算中':'Computing'} ${progress.scanned}/${progress.total}`;
        },
      });
      if(isCancelled())return;
      result=collected.available ? collected.items : null;
      resourcesTruncated=collected.truncated;
    } else {
      const scanDungeons=dimension==='overworld'&&!view.filtered.has(DUNGEON_KIND);
      const standardQuery=scanDungeons?{...query,excludedKinds:[...view.filtered,DUNGEON_KIND]}:query;
      const collected=await collectStructureView(currentRequest,standardQuery,{
        centreFirst:true,isCancelled,
        onBatch:(items,progress)=>{
          view.markers=items.map(m=>({...m,color:kinds[markerTypeKey(m)]?.color}));view.resources=[];view.dirty=true;
          structuresTruncated=progress.truncated;updateCount();
          $("progress").textContent=`${language==='zh'?'计算中':'Computing'} ${progress.scanned}/${progress.total}`;
        },
      });
      if(isCancelled())return;
      result=collected.items;structuresTruncated=collected.truncated;
      if(scanDungeons&&result.length===20000)structuresTruncated=true;
      if(scanDungeons&&!structuresTruncated){
        renderFilters();
        try {
          const dungeons=await collectDungeonView(currentRequest,query,{
            limit:20000-result.length,isCancelled,
            onBatch:(items,progress)=>{
              view.markers=[...result,...items].map(m=>({...m,color:kinds[markerTypeKey(m)]?.color}));view.dirty=true;
              structuresTruncated=progress.truncated;updateCount();
              $("progress").textContent=`${language==='zh'?'刷怪笼扫描':'Scanning spawner candidates'} ${progress.scanned}/${progress.total}`;
            },
          });
          if(isCancelled())return;
          result=[...result,...dungeons.items];structuresTruncated=dungeons.truncated;
        } catch(error) {
          if(isCancelled())return;
          // A dungeon failure must not erase the independently completed landmarks.
          loadedBounds=null;view.markerError=error.message;view.dirty=true;renderFilters();toast(error.message);return;
        }
      }
    }
    if (revision !== structureRevision || world !== worldRevision) return;
    if(resourceMode){view.resources=result||[];view.markers=[];resourceStatus(result!==null);
      if(resourcesTruncated)toast(language==='zh'?'当前视野已显示 20,000 个资源位置；放大地图可查看局部完整结果。':'Showing 20,000 resource locations; zoom in for complete local results.');
    }
    else {view.markers = result.map((m) => ({ ...m, color: kinds[markerTypeKey(m)]?.color }));view.resources=[];}
    loadedBounds = bounds;
    view.markerError=null;
    view.dirty = true;
    renderFilters();
  } catch (error) {
    if (revision === structureRevision && error.message !== "CANCELLED") {
      loadedBounds = null;
      resourcesTruncated = false;
      structuresTruncated = false;
      view.markers = [];
      view.resources = [];
      view.markerError=error.message;
      view.dirty = true;
      renderFilters();
      toast(error.message);
    }
  } finally {
    if (revision === structureRevision) $("progress").hidden = true;
  }
}
function renderFilters() {
  const optionalKinds=dimensions.find(d=>d.key===dimension)?.structureKinds||[];
  const counts=structureFilterCounts(view.markers,optionalKinds);
  const previous = new Map([...$("kind-filters").children].map(row=>[row.dataset.kind,row]));
  $("kind-filters").replaceChildren(
    ...[...counts].map(([kind, count]) => {
      const existing=previous.get(kind);
      if(existing){
        existing.querySelector('.filter-name').textContent=kinds[kind]?.[language] || kind;
        existing.querySelector('.filter-count').textContent=count.toLocaleString();
        existing.querySelector('input').checked=!view.filtered.has(kind);
        return existing;
      }
      const label = document.createElement("label");
      label.className = "kind-filter filter-row";
      label.dataset.kind = kind;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !view.filtered.has(kind);
      input.onchange = () => {
        input.checked ? view.filtered.delete(kind) : view.filtered.add(kind);
        view.dirty = true;
        updateCount();
        if(optionalKinds.includes(kind)) {
          // Only the landmark query changed. Keep completed biome tiles visible.
          void refreshStructures(view.bounds());
        }
      };
      const swatch = document.createElement("span");
      swatch.className = "filter-symbol";
      const asset=assetNames[kind] || (kind==='HEE_BIOME_ISLAND'?'hee_infested_endstone_side':null);
      if(asset){const image=document.createElement('img');image.src=`./assets/${asset}.png`;image.alt='';swatch.append(image);}
      else {const color=document.createElement('span');color.className='swatch';color.style.background=kinds[kind]?.color || '#ddd';swatch.append(color);}
      const text = document.createElement("span");
      text.className='filter-name';
      text.textContent = kinds[kind]?.[language] || kind;
      const number=document.createElement('span');number.className='filter-count';number.textContent=count.toLocaleString();
      label.append(input, swatch, text,number);
      return label;
    }),
  );
  updateCount();
}
function updateCount() {
  $("count").textContent =
    view.markerMode === "STRUCTURE" ? `${view.visibleMarkers().length.toLocaleString()} ${language === "zh" ? "个结构" : "structures"}` : `${view.visibleResources().length.toLocaleString()} ${language==='zh' ? (view.markerMode==='ORES'?'个矿脉候选':'个流体区') : (view.markerMode==='ORES'?'ore candidates':'fluid fields')}`;
  if(view.markerMode === 'STRUCTURE' ? structuresTruncated : resourcesTruncated)
    $("count").textContent += language==='zh'?'（部分结果，请放大）':' (partial; zoom in)';
}
function showDetail(marker, point) {
  selectedPoint = marker || { x: Math.floor(point.x), z: Math.floor(point.z) };
  if(marker?.amounts)selectedPoint={x:Math.floor(point.x/16)*16+8,z:Math.floor(point.z/16)*16+8};
  $("detail").hidden = false;
  const detailAsset=marker && (assetNames[markerTypeKey(marker)] || assetNames[marker.subtype] || assetNames[marker.kind]);
  const detailImage=(marker && depositIcon(dimension,marker)) || (detailAsset ? `./assets/${detailAsset}.png` : null);
  $('detail-icon').hidden=!detailImage;
  if(detailImage)$('detail-icon').src=detailImage;
  $("detail-title").textContent = marker
    ? (marker.name ? resourceName(marker,language) : kinds[markerTypeKey(marker)]?.[language] || marker.kind)
    : language === "zh"
      ? "地图坐标"
      : "Map coordinates";
  $("detail-title").textContent += ` [${selectedPoint.x}, ${selectedPoint.z}]`;
  $('detail-extra').open=false;
  const lines = [];
  if(dimension==='nether')lines.push(language==='zh'
    ? `对应主世界 [${selectedPoint.x*8}, ${selectedPoint.z*8}]`
    : `In the Overworld [${selectedPoint.x*8}, ${selectedPoint.z*8}]`);
  if (marker) {
    if(marker.kind==='WORLD_SPAWN'&&Number.isInteger(marker.y))lines.push(`Y: ${marker.y}`);
    if(marker.kind?.startsWith('END_')&&marker.kind.endsWith('_ASTEROID')&&Number.isInteger(marker.y))lines.push(`Y: ${marker.y} · ${language==='zh'?'直径':'Diameter'}: ${marker.size}`);
    if(marker.kind==='ORE_VEIN')lines.push(`Y: ${marker.minY}–${marker.maxY}`,localizeResourceText(marker.materials,language),language==='zh'?'种子预测候选':'Seed candidate');
    if(['ASTEROID_SMALL','ASTEROID_VEIN'].includes(marker.kind))lines.push(
      language==='zh'?(marker.kind==='ASTEROID_SMALL'?'小行星小型矿':'小行星混合矿'):(marker.kind==='ASTEROID_SMALL'?'Small asteroid ore':'Asteroid vein'),
      `${language==='zh'?'中心高度':'Centre Y'}: ${marker.y} · ${language==='zh'?'直径':'Diameter'}: ${marker.size}`,
      `${language==='zh'?'生成范围（保守估计）':'Generator envelope'}: Y ${marker.minY}–${marker.maxY}`,localizeResourceText(marker.materials,language));
    if(marker.amounts){const i=Math.floor((point.x-marker.x)/16)*8+Math.floor((point.z-marker.z)/16);lines.push(`${marker.amounts[i]} L/Op · ${language==='zh'?'初始产量':'initial production'}`);}
    if (marker.subtype) lines.push(marker.subtype==='LOGICAL_START'?(language==='zh'?'原项目兼容逻辑起点；当前整合包未生成这类基地。':'Desktop compatibility start; this modpack does not generate these bases.'):marker.kind==='VANILLA_SPAWNER_DUNGEON'?`Y: ${marker.subtype}`:marker.subtype);
    lines.push(
      language === "zh"
        ? certainty[marker.certainty] || marker.certainty
        : marker.certainty,
      marker.source,
    );
  } else {
    const b = biomeByIndex(view.biomeAt(point.x, point.z));
    if (b) lines.push(b[language], b.key);
  }
  $("detail-content").replaceChildren(
    ...lines.map((text) => {
      const p = document.createElement("p");
      p.textContent = text || "";
      return p;
    }),
  );
}
function renderCapabilities() {
  const table = document.createElement("table");
  const header = table.insertRow();
  for (const value of language === "zh"
    ? ["维度", "底图", "结构", "资源"]
    : ["Dimension", "Biomes", "Structures", "Resources"]) {
    const th = document.createElement("th");
    th.textContent = value;
    header.append(th);
  }
  for (const d of dimensions) {
    const row = table.insertRow();
    for (const text of [
      d[language],
      d.map ? (language === "zh" ? "已接入" : "Available") : "—",
      d.structures ? (language === "zh" ? "部分已接入" : "Partial") : "—",
      d.resources ? (language==='zh'?'已安装函数包':'Pack installed') : '—',
    ])
      row.insertCell().textContent = text;
  }
  $("capability-table").replaceChildren(table);
}
$("seed-form").onsubmit = (e) => {
  e.preventDefault();
  loadWorld();
};
$("random").onclick = () => {
  const values = new BigUint64Array(1);
  crypto.getRandomValues(values);
  $("seed").value = BigInt.asIntN(64, values[0]).toString();
  loadWorld();
};
$("dimension").onchange = () => {
  loadWorld({dimension:$("dimension").value});
};
$("marker-mode").onchange=()=>loadWorld({markerMode:$("marker-mode").value});
function resourceFilterChanged(){
  const minimum=Number($("minimum-fluid").value);
  if(!Number.isInteger(minimum)||minimum<0||minimum>429496)return toast('最低产量须为有效的非负整数');
  const minY=Number($("ore-min-y").value),maxY=Number($("ore-max-y").value);
  if(!Number.isInteger(minY)||!Number.isInteger(maxY)||minY<0||maxY>255||minY>maxY)return toast('矿脉高度范围须在 0–255 之间，最小值不能大于最大值');
  view.resourceFilter={...view.resourceFilter,text:$("resource-search").value,minimum,id:$("resource-type").value,minY,maxY};view.selected=null;$("detail").hidden=true;view.dirty=true;updateCount();
  invalidateMarkers();clearTimeout(resourceFilterChanged.timer);
  resourceFilterChanged.timer=setTimeout(()=>refreshStructures(view.bounds()),200);
}
for(const id of ['resource-search','minimum-fluid','resource-type','ore-min-y','ore-max-y'])$(id).oninput=resourceFilterChanged;
$("goto-form").onsubmit = (e) => {
  e.preventDefault();
  const x = Number($("goto-x").value),
    z = Number($("goto-z").value);
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(z) ||
    Math.abs(x) > 29999000 ||
    Math.abs(z) > 29999000
  )
    return toast("坐标须为 ±29,999,000 范围内的整数");
  view.goto(x, z);
};
for (const [id, key] of [
  ["show-biomes", "showBiomes"],
  ["show-structures", "showStructures"],
  ["show-grid", "grid"],
  ["inertia", "inertia"],
  ["smooth", "smooth"],
])
  $(id).onchange = () => {
    view[key] = $(id).checked;
    if(key==='showStructures')view.changed();
    else view.dirty=true;
  };
$("zoom-in").onclick = () => view.zoom(-1);
$('gpu-rendering').onchange=()=>{
  const mode=gpuModeAtLevel($('gpu-rendering').value);setGpuMode(mode);renderGpuLevel();
  try{writeGpuPreference(localStorage,mode);}catch{}
};
function setGpuMode(mode) {
  gpuComputeState=gpuComputeLevel(mode)?'idle':'off';
  workerClient.setGpuCompute(gpuComputeLevel(mode));view.setGpuMode(mode);
}
$('gpu-rendering').oninput=renderGpuLevel;
$('gpu-retry').onclick=()=>setGpuMode(gpuModeAtLevel($('gpu-rendering').value));
$('compute-parallelism').oninput=renderParallelism;
function applyParallelism() {
  const level=Number($('compute-parallelism').value),custom=Number($('custom-threads').value);
  if(level===5&&!$('custom-threads').checkValidity()){$('custom-threads').reportValidity();return;}
  workerClient.setParallelism(level===5?custom:level);renderParallelism();
  try{writeParallelismSelection(localStorage,level,custom);}catch{}
}
$('compute-parallelism').onchange=applyParallelism;
$('custom-threads').oninput=renderParallelism;
$('custom-threads').onchange=applyParallelism;
$('parallelism-retry').onclick=()=>{workerClient.retryCapacity();view.retryFailedTiles();};
$('compute-allocation').oninput=()=>{workerClient.setAllocation($('compute-allocation').value);renderAllocation();};
$('compute-allocation').onchange=()=>{try{writeAllocation(localStorage,$('compute-allocation').value);}catch{}};
$("zoom-out").onclick = () => view.zoom(1);
$("home").onclick = () => view.goto(0, 0);
$('spawn').onclick=async()=>{
  const revision=worldRevision;$('spawn').disabled=true;
  try{const point=await request('predictSpawn',{seed,dimension},{priority:1});if(revision===worldRevision){
    if(!Number.isInteger(point?.x)||!Number.isInteger(point?.z))return toast(language==='zh'?'当前函数包缺少出生点地表重放；请在设置中读取 level.dat。':'Spawn surface replay is unavailable. Read level.dat in Settings.');
    view.goto(point.x,point.z);view.selected=point;showDetail(point);
  }}
  catch(error){if(error.message!=='CANCELLED')toast(error.message);}finally{$('spawn').disabled=dimension!=='overworld'||!dimensions.find(d=>d.key===dimension)?.spawn&&!matchingSavedSpawn(savedSpawn,{seed,dimension});}
};
$('load-saved-spawn').onclick=()=>$('saved-spawn-file').click();
$('saved-spawn-file').onchange=async()=>{
  const file=$('saved-spawn-file').files[0];if(!file)return;
  const token=++spawnImportRevision,revision=worldRevision;
  try{
    const record=await readSavedSpawn(file);if(token!==spawnImportRevision||revision!==worldRevision)return;
    savedSpawn=record;$('seed').value=record.seed;loadWorld({dimension:'overworld'});renderCapabilities();
    $('clear-saved-spawn').hidden=false;view.goto(record.x,record.z);view.selected={...record};showDetail(view.selected);
    toast(language==='zh'?'已读取存档世界出生点（当前文件快照）':'Loaded recorded world spawn (file snapshot)');
  }catch(error){toast(error.message);}finally{$('saved-spawn-file').value='';}
};
$('clear-saved-spawn').onclick=()=>{
  spawnImportRevision++;savedSpawn=null;$('clear-saved-spawn').hidden=true;
  // Invalidate in-flight markers and exports so no snapshot survives replacement.
  $('seed').value=seed.toString();loadWorld();renderCapabilities();
};
$("retry-map").onclick = async () => {
  $("retry-map").disabled=true;
  try {
    const errors=await request('retryPacks',{}, {priority:0});
    if(errors.length)toast(errors.map(e=>e.id+': '+e.error).join('\n'));
    view.retryFailedTiles();
    refreshStructures(view.bounds());
  }catch(error){toast(error.message);}finally{$("retry-map").disabled=false;}
};
$("detail-close").onclick = () => {
  $("detail").hidden = true;
  view.selected = null;
  view.dirty = true;
};
$("copy-coordinates").onclick = async () => {
  if (selectedPoint) {
    try {
      await navigator.clipboard.writeText(
        Number.isInteger(selectedPoint.y)&&(['ASTEROID_SMALL','ASTEROID_VEIN'].includes(selectedPoint.kind)||selectedPoint.kind?.startsWith('END_')&&selectedPoint.kind.endsWith('_ASTEROID'))
          ? `${selectedPoint.x}, ${selectedPoint.y}, ${selectedPoint.z}` : `${selectedPoint.x}, ${selectedPoint.z}`,
      );
      toast(language === "zh" ? "已复制" : "Copied");
    } catch {
      toast(
        language === "zh"
          ? "无法访问剪贴板，请从详情中复制"
          : "Clipboard unavailable; copy from details",
      );
    }
  }
};
for (const name of ["settings", "export", "about"])
  $(name + "-open").onclick = () => $(name + "-dialog").showModal();
const noticeSeenKey = "amidst-notice-seen";
$("notice-dialog").addEventListener("close", () => {
  try { localStorage.setItem(noticeSeenKey, "true"); } catch {}
});
$("notice-open").onclick = (event) => {
  event.preventDefault();
  $("about-dialog").close();
  $("notice-dialog").showModal();
};
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
$("language").onclick = () => {
  language = language === "zh" ? "en" : "zh";
  try {
    localStorage.setItem("amidst-language", language);
  } catch {}
  applyLanguage();
};
function updateConfig() {
  const separation = Number($("chaos-separation").value);
  if (
    !Number.isInteger(separation) ||
    separation < 256 ||
    separation > 1000000
  ) {
    toast("混沌岛间距须在 256–1,000,000 之间");
    return;
  }
  loadWorld({config:{...config,chaosEnabled:$("chaos").checked,chaosSeparation:separation}});
}
$("chaos").onchange = updateConfig;
$("chaos-separation").onchange = updateConfig;
$("config-file").onchange = async () => {
  const file = $("config-file").files[0];
  if (!file) return;
  try {
    if (file.size > 1048576) throw new Error("配置文件超过 1 MB");
    const nextConfig = validateConfig(JSON.parse(await file.text()));
    if(loadWorld({config:nextConfig})) toast("已导入环境配置");
  } catch (error) {
    toast(error.message);
  } finally {
    $("config-file").value = "";
  }
};
$("config-download").onclick = () =>
  download("gtnh-environment.json", JSON.stringify(config, null, 2));
const exportJob=new ExportJob((active,p)=>{
  for(const format of ['csv','json','journeymap','biomes'])$('export-'+format).disabled=active;
  $('export-cancel').hidden=!active;$('export-progress').hidden=!active;
  if(active)$('export-progress').textContent=p.total?`${language==='zh'?'已扫描批次':'Batches scanned'} ${p.scanned}/${p.total}`:(language==='zh'?'准备导出…':'Preparing export…');
});
function chosenExportBounds(){return exportBounds($('export-range-mode').value,['minX','minZ','maxX','maxZ'].map(k=>$('export-'+k).value),view.bounds());}
$('export-range-mode').onchange=()=>{
  const custom=$('export-range-mode').value==='custom';$('export-coordinates').hidden=!custom;
  if(custom)for(const [k,v] of Object.entries(view.bounds()))$('export-'+k).value=v;
};
$('export-cancel').onclick=()=>exportJob.cancel();
$('export-dialog').addEventListener('close',()=>exportJob.cancel());
async function exportView(format) {
  const limit = Number($("export-limit").value),
    y = Number($("waypoint-y").value);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10000 ||
    !Number.isInteger(y) ||
    y < 0 ||
    y > 255
  )
    return toast("导出数量或高度无效");
  let bounds,controller;
  try{bounds=chosenExportBounds();controller=exportJob.begin();}catch(error){return toast(error.message);}
  const revision = worldRevision;
  const button = $("export-" + format);
  button.disabled = true;
  try {
    const mode=view.markerMode,resourceMode=mode!=="STRUCTURE";
    const filter={...view.resourceFilter,fluidChunks:$("export-fluid-chunks").value};
    const excludedKinds=[...view.filtered],isCancelled=()=>controller.signal.aborted||revision!==worldRevision;
    const exportRequest=(action,q)=>request(action,{...q,excludedKinds},{priority:2,signal:controller.signal});
    const onBatch=(_,p)=>exportJob.progress(p);
    const collected = resourceMode ? await collectResourceView(exportRequest, {seed,dimension,bounds,mode}, {
      limit, select:values=>resourcePoints(values,filter,bounds),
      isCancelled,onBatch,
    }) : await collectStructureView(exportRequest,{seed,dimension,bounds},{
      limit,isCancelled,onBatch,select:values=>values.filter(m=>!excludedKinds.includes(m.kind)&&!excludedKinds.includes(markerTypeKey(m))),
    });
    const all = resourceMode ? (collected.available ? collected.items : null)
      : collected.items;
    if (revision !== worldRevision) throw new Error("地图已切换，请重新导出");
    if(controller.signal.aborted)throw new Error('CANCELLED');
    if(all===null)throw new Error('此资源图层尚未接入函数包');
    const filtered = all
        .filter((m) => !excludedKinds.includes(m.kind) && !excludedKinds.includes(markerTypeKey(m)))
        .sort((a, b) => a.z - b.z || a.x - b.x || a.kind.localeCompare(b.kind)),
      markers = filtered.slice(0, limit);
    if (!markers.length)
      return toast(
        language === "zh"
          ? "当前视野及筛选内没有可导出的标记"
          : "No markers in the current view and filters",
      );
    const context = {
      seed,
      dimension,
      dimensionId: config.dimensionIds[dimension],
      bounds,
      config,
      recordSource: markers.some(m=>m.recordSource==='saved-world')?'mixed':"prediction",
      markerMode:mode,
      selectionOrder:'region-scan',
      ...(resourceMode?{resourceFilter:filter}:{}),
      truncated: collected?.truncated || filtered.length > limit,
    };
    const name = `amidst-${dimension}-${seed}${resourceMode?'-'+mode.toLowerCase():''}`;
    if (format === "csv")
      download(name + ".csv", (resourceMode?resourceCsv:csv)(markers, context), "text/csv;charset=utf-8");
    else if (format === "json")
      download(
        name + ".json",
        JSON.stringify(
          { schemaVersion: 1, ...context, [resourceMode?'resources':'structures']: markers },
          null,
          2,
        ),
      );
    else download(name + ".zip", journeyMap(markers, context, y));
    toast(
      `${language === "zh" ? "已导出" : "Exported"} ${markers.length}${context.truncated ? (language === "zh" ? "（达到数量上限）" : " (limit reached)") : ""}`,
    );
  } catch (error) {
    if (error.message !== "CANCELLED") toast(error.message);
  } finally {
    button.disabled = false;
    exportJob.finish(controller);
  }
}
for (const format of ["csv", "json", "journeymap"])
  $("export-" + format).onclick = () => exportView(format);
$("export-biomes").onclick = async () => {
  let requestedBounds,controller;
  try{requestedBounds=chosenExportBounds();controller=exportJob.begin();}catch(error){return toast(error.message);}
  const revision = worldRevision;
  $("export-biomes").disabled = true;
  try {
    const query = biomeExportQuery(requestedBounds, dimension);
    const {x,z,width,height,step} = query;
    const bounds = {minX:x,minZ:z,maxX:x+(width-1)*step+1,maxZ:z+(height-1)*step+1};
    exportJob.progress({scanned:0,total:1});
    const data = await request("sampleBiomes", {
      seed,
      ...query,
    },{priority:2,signal:controller.signal});
    if (revision !== worldRevision) throw new Error("地图已切换，请重新导出");
    if(controller.signal.aborted)throw new Error('CANCELLED');
    if (!data)
      throw new Error(
        language === "zh"
          ? "此维度底图尚未接入"
          : "Biome map is not available for this dimension",
      );
    const palette = [],
      local = new Map(),
      indices = [];
    for (const index of data) {
      const biome = biomeByIndex(index);
      if (!biome) throw new Error("未注册的生物群系");
      if (!local.has(biome.key)) {
        local.set(biome.key, palette.length);
        palette.push(biome.key);
      }
      indices.push(local.get(biome.key));
    }
    download(
      `amidst-${dimension}-${seed}-biomes.json`,
      JSON.stringify({
        schemaVersion: 2,
        seed,
        dimension,
        source: "prediction",
        bounds,
        requestedBounds,
        x,
        z,
        width,
        height,
        step,
        palette,
        indices,
      }),
    );
    toast(language === "zh" ? "已导出生物群系" : "Biomes exported");
  } catch (error) {
    if (error.message !== "CANCELLED") toast(error.message);
  } finally {
    $("export-biomes").disabled = false;
    exportJob.finish(controller);
  }
};
$("screenshot").onclick = () => {
  const bounds=view.bounds();
  const needsMarkers=view.markerMode!=='STRUCTURE'||view.showStructures;
  const markersReady=loadedBounds && ['minX','minZ','maxX','maxZ'].every(k=>loadedBounds[k]===bounds[k]);
  if (!view.isFullyLoaded() || (needsMarkers && (!markersReady || !$("progress").hidden)))
    return toast(
      language === "zh"
        ? "地图或标记仍在计算，请稍后保存"
        : "Map tiles or markers are still loading",
    );
  view.draw();
  const filename=`amidst-${dimension}-${seed}.png`;
  view.canvas.toBlob((blob) => {
    if (blob) download(filename, blob);
  }, "image/png");
};
const originalColors = Object.fromEntries(
  Object.entries(biomes).map(([id, b]) => [id, b.color]),
);
function applyColors() {
  for (const [id, b] of Object.entries(biomes))
    b.color = config.biomeColors?.[id] || originalColors[id];
  themeUI?.sync();
}
let packageIdentity='native';
try {
  const packs = await readRegistry();
  packageIdentity=JSON.stringify(packs.map(p=>[p.id,p.environmentId||p.url]));
  for (const pack of packs) {
    try {
    const registered=registerPackBiomes(pack);
    for (const entry of pack.dimensions) {
      const d = registerDimension(entry);
      if (d) {
        d.map = entry.capabilities.includes("biomes") || d.map;
        if(entry.capabilities.includes('biomes'))d.biomePreview=entry.biomePreview||'progressive';
        if(entry.capabilities.includes('biomes') && registered.length){
          const scoped=registered.filter(b=>b.legacy?.some(a=>a.dimension===d.key));
          d.biomeKeys=(scoped.length?scoped:registered).map(b=>b.key);
        }
        d.structures =
          entry.capabilities.includes("structures") || d.structures;
        d.resources=entry.capabilities.includes("resources") || d.resources;
        if(entry.capabilities.includes("resources") && entry.resourceModes) d.resourceModes=entry.resourceModes;
        if(entry.resourceOptions)d.resourceOptions=entry.resourceOptions;
        if(entry.capabilities.includes('spawn'))d.spawn=true;
        if(entry.structureKinds)d.structureKinds=[...new Set([...(d.structureKinds||[]),...entry.structureKinds])];
        if (entry.note) d.note = String(entry.note);
        if (entry.noteEn) d.noteEn = entry.noteEn;
        if (entry.uniformBiome) d.uniformBiome = entry.uniformBiome;
      }
    }
    for (const b of registered) {
      biomes[b.key] = b;
      originalColors[b.key] = b.color;
    }
    }catch(error){toast(pack.id+': '+error.message);}
  }
} catch (error) {
  toast(error.message);
}
try {
  const response = await fetch(new URL("./environment.json", import.meta.url));
  if (response.ok) {
    config = validateConfig(await response.json());
    $("chaos").checked = config.chaosEnabled;
    $("chaos-separation").value = config.chaosSeparation;
    applyColors();
  }
} catch (error) {
  toast(error.message);
}
preferencesKey='amidst-view-v1:'+packageIdentity+':'+JSON.stringify(config);
try{
  const p=readPreferences(localStorage,preferencesKey,dimensions.map(d=>d.key));
  if(p){
    seed=p.seed;dimension=p.dimension;config=p.config;view.markerMode=p.markerMode;view.x=p.x;view.z=p.z;view.level=p.level;view.scale=view.targetScale=.25*2**(-p.level/8);
    view.filtered=restoreStructureFilters(p.filtered);view.resourceFilter=p.resourceFilter;Object.assign(view,p.flags);
    view.biomeSelection=new BiomeSelection(p.biomeSelection);
    for(const [id,key] of [['show-biomes','showBiomes'],['show-structures','showStructures'],['show-grid','grid'],['inertia','inertia'],['smooth','smooth']])$(id).checked=view[key];
    for(const [id,key] of [['resource-search','text'],['minimum-fluid','minimum'],['ore-min-y','minY'],['ore-max-y','maxY']])$(id).value=p.resourceFilter[key];
  }
}catch{}
$('seed').value=seed;$('marker-mode').value=view.markerMode;$('chaos').checked=config.chaosEnabled;$('chaos-separation').value=config.chaosSeparation;
themeUI=createThemeUI({view,getState:()=>({dimensions,dimension,language}),onResourceChange:resourceFilterChanged,onBiomeChange:savePreferences,toast});
applyColors();applyLanguage();
view.setWorld(seed, dimension);
let gpuMode='off';try{gpuMode=readGpuPreference(localStorage);}catch{}
let parallelism={level:1,custom:8,threads:1};try{parallelism=readParallelismSelection(localStorage);}catch{}
$('compute-parallelism').value=parallelism.level;$('custom-threads').value=parallelism.custom;
let allocation=0;try{allocation=readAllocation(localStorage);}catch{}
$('compute-allocation').value=allocation;workerClient.setAllocation(allocation);renderAllocation();
workerClient.setParallelism(parallelism.threads);renderParallelism();
$('gpu-rendering').value=gpuLevelForMode(gpuMode);setGpuMode(gpuMode);renderGpuLevel();
preferencesReady=true;
observePageLifecycle({
  suspend:()=>{workerClient.setPaused(true);invalidateMarkers();view.setSuspended(true);persistPreferences();},
  resume:()=>{view.setSuspended(false);workerClient.setPaused(false);},
});
document.addEventListener('change',savePreferences);document.addEventListener('input',savePreferences);document.addEventListener('submit',savePreferences);window.addEventListener('pagehide',persistPreferences);
function renderColorEditor(){
  const current=$('color-biome').value;
  $('color-biome').replaceChildren(...Object.values(biomes).map(b=>new Option(b[language]+' · '+b.key,b.key)));
  if(biomes[current])$('color-biome').value=current;
  $('biome-color').value=biomes[$('color-biome').value]?.color||'#000000';
}
$('color-biome').onchange=()=>{$('biome-color').value=biomes[$('color-biome').value].color;};
$('biome-color').onchange=()=>{
  const key=$('color-biome').value;config={...config,biomeColors:{...config.biomeColors,[key]:$('biome-color').value}};applyColors();view.recolorTiles();savePreferences();
};
$('reset-color').onclick=()=>{
  const key=$('color-biome').value;if(config.biomeColors)delete config.biomeColors[key];applyColors();view.recolorTiles();renderColorEditor();savePreferences();
};
renderColorEditor();
try{
  const response=await fetch(new URL('./build-info.json',import.meta.url));
  if(response.ok){const info=await response.json();const label=info.type==='calibrated-static'?'完整校准包':info.type==='private-calibrated'?'本地校准包':'基础静态包';$('package-info').textContent=`${info.environment} · ${label}${info.environmentId?' · '+info.environmentId.slice(0,12):''}`;}
}catch{}
let noticeSeen = false;
try { noticeSeen = localStorage.getItem(noticeSeenKey) === "true"; } catch {}
if (!noticeSeen) $("notice-dialog").showModal();
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  const tools = [
    {
      name: "read_map_view",
      description: "Read the active seed, dimension and map bounds.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        seed,
        dimension,
        bounds: view.bounds(),
        structures: view.visibleMarkers().length,
      }),
    },
    {
      name: "navigate_map",
      description:
        "Move the current map to block coordinates without changing the seed.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "integer", minimum: -29999000, maximum: 29999000 },
          z: { type: "integer", minimum: -29999000, maximum: 29999000 },
        },
        required: ["x", "z"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        if (
          !input ||
          !Number.isSafeInteger(input.x) ||
          !Number.isSafeInteger(input.z) ||
          Math.abs(input.x) > 29999000 ||
          Math.abs(input.z) > 29999000
        )
          throw new Error("Invalid coordinates");
        view.goto(input.x, input.z);
        $("goto-x").value = input.x;
        $("goto-z").value = input.z;
        await refreshStructures(view.bounds());
        await new Promise(requestAnimationFrame);
        return { seed, dimension, x: view.x, z: view.z };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        document.modelContext.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
}
