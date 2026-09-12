import { MapView } from "./map.js";
import {
  dimensions,
  biomes,
  biomeByIndex,
  biomeRegistry,
  kinds,
  certainty,
} from "./engine/catalog.js";
import { parseSeed } from "./engine/random.js";
import { csv, journeyMap, download } from "./export.js";
import { defaults, validateConfig } from "./engine/config.js";
import { readRegistry } from "./engine/packs.js";
const $ = (id) => document.getElementById(id);
let config = structuredClone(defaults),
  language = "zh",
  seed = $("seed").value,
  dimension = "end",
  selectedPoint = null,
  worldRevision = 0,
  structureRevision = 0,
  loadedBounds = null;
try {
  language = localStorage.getItem("amidst-language") || "zh";
  if (!["zh", "en"].includes(language)) language = "zh";
} catch {}
const english = {
  seed: "Seed",
  load: "Load",
  dimension: "Dimension",
  export: "Export",
  settings: "Settings",
  about: "Sources",
  layers: "Layers",
  biomes: "Biomes",
  structures: "Structures",
  grid: "Chunk grid",
  copy: "Copy coordinates",
  unavailable: "Biome map not connected yet",
  viewEnd: "View the End",
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
    "Exports structures in the current dimension, view and filters. Predictions do not confirm generated structures.",
  limit: "Maximum waypoints",
  waypointY: "JourneyMap waypoint height",
  exportFoot:
    "Sorted by coordinates; truncated at the limit. Y is supplied manually, not sampled from terrain.",
  aboutTitle: "Sources and support",
  disclaimer:
    "Unofficial seed preview. Predictions may differ from generated worlds. Mod names and assets belong to their respective owners.",
  contact: "Feedback / Rights holder contact",
  saveFuture:
    "Save analysis is reserved for a future release. No saves are read or uploaded.",
};
const chinese = new Map(
  [...document.querySelectorAll("[data-i18n]")].map((e) => [
    e.dataset.i18n,
    e.textContent,
  ]),
);
english.exportBiomes = "Biome JSON";
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 5000);
}
let worker,
  nextId = 0;
const pending = new Map();
function startWorker() {
  worker?.terminate();
  for (const { reject } of pending.values()) reject(new Error("CANCELLED"));
  pending.clear();
  worker = new Worker(new URL("./engine/worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
  };
  worker.onerror = () => {
    for (const p of pending.values())
      p.reject(new Error("计算线程失败，请重新载入种子"));
    pending.clear();
    toast("计算线程失败，请重新载入种子");
  };
}
function request(action, query) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action, query: { ...query, config } });
  });
}
startWorker();
const view = new MapView($("map-canvas"), {
  request,
  onMove: (point, biome) => {
    $("coordinates").textContent =
      `X: ${Math.floor(point.x).toLocaleString()} · Z: ${Math.floor(point.z).toLocaleString()}`;
    $("biome-name").textContent = biomeByIndex(biome)?.[language] || "";
  },
  onSelect: showDetail,
  onViewport: refreshStructures,
  onError: (error) => {
    if (error.message !== "CANCELLED") toast(error.message);
  },
});
const assetNames = {
  DRACONIC_CHAOS_ISLAND: "draconic_chaotic_core",
  MARS_CAVERN: "galacticraft_mars_cavern_vine",
  HEE_DUNGEON_TOWER: "ender_eye",
  INFESTED_FOREST: "hee_infested_endstone_side",
  BURNING_MOUNTAINS: "hee_burned_endstone_side",
  ENCHANTED_ISLAND: "hee_enchanted_endstone_side",
  STRONGHOLD: "stronghold",
  MINESHAFT: "mineshaft",
  MOON_DUNGEON: "galacticraft_moon_dungeon_brick",
  MOON_VILLAGE: "galacticraft_alien_villager",
  MARS_DUNGEON: "galacticraft_mars_dungeon_brick",
  CERES_DUNGEON: "galaxyspace_ceres_dungeon_brick",
  IO_DUNGEON: "galaxyspace_io_dungeon_brick",
  ENCELADUS_DUNGEON: "galaxyspace_enceladus_dungeon_brick",
  PROTEUS_DUNGEON: "galaxyspace_proteus_dungeon_brick",
  PLUTO_DUNGEON: "galaxyspace_pluto_dungeon_brick",
};
for (const [kind, name] of Object.entries(assetNames)) {
  const image = new Image();
  image.onload = () => (view.dirty = true);
  image.src = `./assets/${name}.png`;
  view.images.set(kind, image);
}
function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.textContent =
      language === "en"
        ? english[el.dataset.i18n]
        : chinese.get(el.dataset.i18n);
  $("language").textContent = language === "zh" ? "EN" : "中文";
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
}
function worldText() {
  const d = dimensions.find((d) => d.key === dimension);
  $("map-title").textContent = d[language];
  $("mode-note").textContent =
    language === "zh"
      ? d.note
      : d.key === "end"
        ? "Fresh End; schematic island areas match the desktop preview."
        : d.map
          ? "Single-biome preview. Using environment configuration."
          : "Biome runtime pending. Only implemented predictions are shown.";
  $("no-map").hidden = d.map;
  $("no-map-note").textContent =
    language === "zh"
      ? d.note
      : "The required biome generator has not been ported yet.";
  $("resource-status").textContent =
    language === "zh"
      ? "矿脉与流体预测待接入"
      : "Ore and fluid prediction pending";
}
function loadWorld() {
  try {
    seed = parseSeed($("seed").value);
    $("seed").value = seed;
  } catch (error) {
    toast(error.message);
    return;
  }
  worldRevision++;
  structureRevision++;
  loadedBounds = null;
  applyColors();
  startWorker();
  view.setWorld(seed, dimension);
  $("detail").hidden = true;
  worldText();
  renderFilters();
}
async function refreshStructures(bounds) {
  const revision = ++structureRevision,
    world = worldRevision;
  $("progress").hidden = false;
  $("progress").textContent = language === "zh" ? "计算中…" : "Computing…";
  try {
    const result = await request("predictStructures", {
      seed,
      dimension,
      bounds,
    });
    if (revision !== structureRevision || world !== worldRevision) return;
    view.markers = result.map((m) => ({ ...m, color: kinds[m.kind]?.color }));
    loadedBounds = bounds;
    view.dirty = true;
    renderFilters();
  } catch (error) {
    if (revision === structureRevision && error.message !== "CANCELLED") {
      loadedBounds = null;
      view.markers = [];
      view.dirty = true;
      renderFilters();
      toast(error.message);
    }
  } finally {
    if (revision === structureRevision) $("progress").hidden = true;
  }
}
function renderFilters() {
  const counts = new Map();
  for (const m of view.markers)
    counts.set(m.kind, (counts.get(m.kind) || 0) + 1);
  $("kind-filters").replaceChildren(
    ...[...counts].map(([kind, count]) => {
      const label = document.createElement("label");
      label.className = "kind-filter";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !view.filtered.has(kind);
      input.onchange = () => {
        input.checked ? view.filtered.delete(kind) : view.filtered.add(kind);
        view.dirty = true;
        updateCount();
      };
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = kinds[kind]?.color || "#ddd";
      const text = document.createElement("span");
      text.textContent = `${kinds[kind]?.[language] || kind} (${count})`;
      label.append(input, swatch, text);
      return label;
    }),
  );
  updateCount();
}
function updateCount() {
  $("count").textContent =
    `${view.visibleMarkers().length.toLocaleString()} ${language === "zh" ? "个结构" : "structures"}`;
}
function showDetail(marker, point) {
  selectedPoint = marker || { x: Math.floor(point.x), z: Math.floor(point.z) };
  $("detail").hidden = false;
  $("detail-title").textContent = marker
    ? kinds[marker.kind]?.[language] || marker.kind
    : language === "zh"
      ? "地图坐标"
      : "Map coordinates";
  const lines = [`X: ${selectedPoint.x} · Z: ${selectedPoint.z}`];
  if (marker) {
    if (marker.subtype) lines.push(marker.subtype);
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
      p.textContent = text;
      return p;
    }),
  );
}
function renderCapabilities() {
  const table = document.createElement("table");
  const header = table.insertRow();
  for (const value of language === "zh"
    ? ["维度", "底图", "结构"]
    : ["Dimension", "Biomes", "Structures"]) {
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
  dimension = $("dimension").value;
  loadWorld();
};
$("view-end").onclick = () => {
  dimension = "end";
  $("dimension").value = "end";
  view.goto(1900, 0);
  loadWorld();
};
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
    view.changed();
  };
$("zoom-in").onclick = () => view.zoom(-1);
$("zoom-out").onclick = () => view.zoom(1);
$("home").onclick = () => view.goto(0, 0);
$("detail-close").onclick = () => {
  $("detail").hidden = true;
  view.selected = null;
  view.dirty = true;
};
$("copy-coordinates").onclick = async () => {
  if (selectedPoint) {
    try {
      await navigator.clipboard.writeText(
        `${selectedPoint.x}, ${selectedPoint.z}`,
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
  config.chaosEnabled = $("chaos").checked;
  config.chaosSeparation = separation;
  loadWorld();
}
$("chaos").onchange = updateConfig;
$("chaos-separation").onchange = updateConfig;
$("config-file").onchange = async () => {
  const file = $("config-file").files[0];
  if (!file) return;
  try {
    if (file.size > 1048576) throw new Error("配置文件超过 1 MB");
    config = validateConfig(JSON.parse(await file.text()));
    $("chaos").checked = config.chaosEnabled;
    $("chaos-separation").value = config.chaosSeparation;
    loadWorld();
    toast("已导入环境配置");
  } catch (error) {
    toast(error.message);
  } finally {
    $("config-file").value = "";
  }
};
$("config-download").onclick = () =>
  download("gtnh-environment.json", JSON.stringify(config, null, 2));
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
  const bounds = view.bounds(),
    revision = worldRevision;
  const button = $("export-" + format);
  button.disabled = true;
  try {
    const all = await request("predictStructures", { seed, dimension, bounds });
    if (revision !== worldRevision) throw new Error("地图已切换，请重新导出");
    const filtered = all
        .filter((m) => !view.filtered.has(m.kind))
        .sort((a, b) => a.z - b.z || a.x - b.x || a.kind.localeCompare(b.kind)),
      markers = filtered.slice(0, limit);
    if (!markers.length)
      return toast(
        language === "zh"
          ? "当前视野及筛选内没有结构"
          : "No structures in the current view and filters",
      );
    const context = {
      seed,
      dimension,
      dimensionId: config.dimensionIds[dimension],
      bounds,
      config,
      recordSource: "prediction",
      truncated: filtered.length > limit,
    };
    const name = `amidst-${dimension}-${seed}`;
    if (format === "csv")
      download(name + ".csv", csv(markers, context), "text/csv;charset=utf-8");
    else if (format === "json")
      download(
        name + ".json",
        JSON.stringify(
          { schemaVersion: 1, ...context, structures: markers },
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
  }
}
for (const format of ["csv", "json", "journeymap"])
  $("export-" + format).onclick = () => exportView(format);
$("export-biomes").onclick = async () => {
  const bounds = view.bounds(),
    spanX = bounds.maxX - bounds.minX,
    spanZ = bounds.maxZ - bounds.minZ;
  const step =
      2 ** Math.max(0, Math.ceil(Math.log2(Math.max(spanX, spanZ) / 512))),
    width = Math.ceil(spanX / step),
    height = Math.ceil(spanZ / step);
  const revision = worldRevision;
  $("export-biomes").disabled = true;
  try {
    const data = await request("sampleBiomes", {
      seed,
      dimension,
      x: bounds.minX,
      z: bounds.minZ,
      width,
      height,
      step,
    });
    if (revision !== worldRevision) throw new Error("地图已切换，请重新导出");
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
        x: bounds.minX,
        z: bounds.minZ,
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
  }
};
$("screenshot").onclick = () => {
  if (!view.isFullyLoaded())
    return toast(
      language === "zh"
        ? "底图仍在计算，请稍后保存"
        : "Map tiles are still loading",
    );
  view.draw();
  view.canvas.toBlob((blob) => {
    if (blob) download(`amidst-${dimension}-${seed}.png`, blob);
  }, "image/png");
};
const originalColors = Object.fromEntries(
  Object.entries(biomes).map(([id, b]) => [id, b.color]),
);
function applyColors() {
  for (const [id, b] of Object.entries(biomes))
    b.color = config.biomeColors?.[id] || originalColors[id];
}
try {
  const packs = await readRegistry();
  for (const pack of packs) {
    for (const entry of pack.dimensions) {
      const d = dimensions.find((d) => d.key === entry.key);
      if (d) {
        d.map = entry.capabilities.includes("biomes") || d.map;
        d.structures =
          entry.capabilities.includes("structures") || d.structures;
        if (entry.note) d.note = String(entry.note);
      }
    }
    for (const entry of pack.biomes || []) {
      const b = biomeRegistry.register(entry);
      biomes[b.key] = b;
      originalColors[b.key] = b.color;
    }
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
applyLanguage();
view.setWorld(seed, dimension);
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
