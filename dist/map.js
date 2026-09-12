import { biomeByIndex } from "./engine/catalog.js";
export class MapView {
  constructor(canvas, { request, onMove, onSelect, onViewport, onError }) {
    Object.assign(this, {
      canvas,
      request,
      onMove,
      onSelect,
      onViewport,
      onError,
    });
    this.ctx = canvas.getContext("2d");
    this.x = 1900;
    this.z = 0;
    this.level = 0;
    this.scale = 0.25;
    this.targetScale = 0.25;
    this.tiles = new Map();
    this.pending = new Set();
    this.failedTiles = new Map();
    this.markers = [];
    this.images = new Map();
    this.generation = 0;
    this.active = true;
    this.seed = "0";
    this.dimension = "end";
    this.showBiomes = true;
    this.showStructures = true;
    this.grid = false;
    this.inertia = true;
    this.smooth = false;
    this.velocity = { x: 0, z: 0 };
    this.pointers = new Map();
    this.filtered = new Set();
    this.width = 0;
    this.height = 0;
    this.lastFrame = 0;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 1 : -1, e.offsetX, e.offsetY);
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      canvas.focus();
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      this.velocity = { x: 0, z: 0 };
      if (this.pointers.size === 2) this.pinch = this.pinchState();
    });
    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect(),
        sx = e.clientX - rect.left,
        sy = e.clientY - rect.top;
      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 2) {
          const p = this.pinchState();
          if (this.pinch) {
            const anchor = this.world(
              this.pinch.x - rect.left,
              this.pinch.y - rect.top,
            );
            this.scale = Math.min(
              8,
              Math.max(
                0.03125,
                (this.scale * p.distance) / this.pinch.distance,
              ),
            );
            this.targetScale = this.scale;
            this.level = -8 * Math.log2(this.scale / 0.25);
            this.x = anchor.x - (p.x - rect.left - this.width / 2) / this.scale;
            this.z = anchor.z - (p.y - rect.top - this.height / 2) / this.scale;
          }
          this.pinch = p;
          this.drag.moved = true;
        } else if (this.drag) {
          const dx = e.clientX - this.drag.x,
            dz = e.clientY - this.drag.y;
          this.x -= dx / this.scale;
          this.z -= dz / this.scale;
          this.velocity = { x: -dx / this.scale, z: -dz / this.scale };
          this.drag.x = e.clientX;
          this.drag.y = e.clientY;
          if (
            Math.hypot(
              e.clientX - this.drag.startX,
              e.clientY - this.drag.startY,
            ) > 4
          )
            this.drag.moved = true;
        }
        this.changed();
      }
      const point = this.world(sx, sy);
      this.onMove(point, this.biomeAt(point.x, point.z));
    });
    const release = (e) => {
      const click = this.drag && !this.drag.moved && this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      if (!this.pointers.size) {
        this.drag = null;
        if (!this.inertia) this.velocity = { x: 0, z: 0 };
        if (click) {
          const rect = canvas.getBoundingClientRect(),
            p = this.world(e.clientX - rect.left, e.clientY - rect.top);
          this.select(p);
        }
      }
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", (e) => {
      this.pointers.delete(e.pointerId);
      this.drag = null;
      this.pinch = null;
      this.velocity = { x: 0, z: 0 };
    });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.onSelect(
        null,
        this.world(e.clientX - rect.left, e.clientY - rect.top),
      );
    });
    canvas.addEventListener("keydown", (e) => {
      if (
        [
          "+",
          "=",
          "-",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
        ].includes(e.key)
      ) {
        e.preventDefault();
        if (e.key === "+" || e.key === "=") this.zoom(-1);
        else if (e.key === "-") this.zoom(1);
        else if (e.key === "Home") this.goto(0, 0);
        else {
          const step = 100 / this.scale;
          this.x +=
            e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          this.z +=
            e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          this.changed();
        }
      }
    });
    requestAnimationFrame((t) => this.frame(t));
  }
  pinchState() {
    const [a, b] = this.pointers.values();
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.changed();
  }
  world(x, y) {
    return {
      x: this.x + (x - this.width / 2) / this.scale,
      z: this.z + (y - this.height / 2) / this.scale,
    };
  }
  screen(x, z) {
    return {
      x: (x - this.x) * this.scale + this.width / 2,
      y: (z - this.z) * this.scale + this.height / 2,
    };
  }
  bounds() {
    const a = this.world(0, 0),
      b = this.world(this.width, this.height);
    return {
      minX: Math.max(-30000000, Math.floor(a.x)),
      minZ: Math.max(-30000000, Math.floor(a.z)),
      maxX: Math.min(30000000, Math.ceil(b.x)),
      maxZ: Math.min(30000000, Math.ceil(b.z)),
    };
  }
  zoom(delta, x = this.width / 2, y = this.height / 2) {
    this.level = Math.min(24, Math.max(-40, this.level + delta));
    this.targetScale = 0.25 * 2 ** (-this.level / 8);
    this.zoomAnchor = { x, y, world: this.world(x, y) };
    this.velocity = { x: 0, z: 0 };
    this.changed();
  }
  goto(x, z) {
    this.x = x;
    this.z = z;
    this.zoomAnchor = null;
    this.velocity = { x: 0, z: 0 };
    this.changed();
  }
  setWorld(seed, dimension) {
    this.seed = seed;
    this.dimension = dimension;
    this.generation++;
    this.tiles.clear();
    this.pending.clear();
    this.failedTiles.clear();
    this.markers = [];
    this.selected = null;
    this.changed();
  }
  changed() {
    this.x = Math.max(-29999000, Math.min(29999000, this.x));
    this.z = Math.max(-29999000, Math.min(29999000, this.z));
    this.dirty = true;
    clearTimeout(this.viewTimer);
    this.viewTimer = setTimeout(() => this.onViewport(this.bounds()), 140);
  }
  step() {
    return 2 ** Math.max(0, Math.min(8, Math.floor(Math.log2(1 / this.scale))));
  }
  biomeAt(x, z) {
    const step = this.step(),
      size = 128 * step,
      tx = Math.floor(x / size),
      tz = Math.floor(z / size),
      t = this.tiles.get(`${step}:${tx}:${tz}`);
    return t?.data?.[
      Math.floor((z - tz * size) / step) * 128 +
        Math.floor((x - tx * size) / step)
    ];
  }
  isFullyLoaded() {
    if (!this.showBiomes) return true;
    const step = this.step(),
      size = 128 * step,
      bounds = this.bounds();
    for (
      let z = Math.floor(bounds.minZ / size);
      z <= Math.floor((bounds.maxZ - 1) / size);
      z++
    ) {
      for (
        let x = Math.floor(bounds.minX / size);
        x <= Math.floor((bounds.maxX - 1) / size);
        x++
      ) {
        if (!this.tiles.has(`${step}:${x}:${z}`)) return false;
      }
    }
    return true;
  }
  ensureTiles() {
    if (!this.showBiomes || !this.width) return;
    const step = this.step(),
      size = 128 * step,
      b = this.bounds(),
      generation = this.generation;
    const todo = [];
    for (
      let tz = Math.floor(b.minZ / size);
      tz <= Math.floor((b.maxZ - 1) / size);
      tz++
    )
      for (
        let tx = Math.floor(b.minX / size);
        tx <= Math.floor((b.maxX - 1) / size);
        tx++
      ) {
        const key = `${step}:${tx}:${tz}`;
        const failure = this.failedTiles.get(key);
        if (
          !this.tiles.has(key) &&
          !this.pending.has(key) &&
          (!failure ||
            (failure.attempts < 3 && Date.now() >= failure.retryAfter))
        )
          todo.push({ tx, tz, key });
      }
    todo.sort(
      (a, b) =>
        Math.hypot(a.tx * size - this.x, a.tz * size - this.z) -
        Math.hypot(b.tx * size - this.x, b.tz * size - this.z),
    );
    for (const { tx, tz, key } of todo.slice(
      0,
      Math.max(0, 4 - this.pending.size),
    )) {
      this.pending.add(key);
      this.request("sampleBiomes", {
        seed: this.seed,
        dimension: this.dimension,
        x: tx * size,
        z: tz * size,
        width: 128,
        height: 128,
        step,
      })
        .then((data) => {
          if (generation !== this.generation) return;
          let image = null;
          if (data) {
            image = document.createElement("canvas");
            image.width = image.height = 128;
            const c = image.getContext("2d"),
              pixels = c.createImageData(128, 128);
            for (let i = 0; i < data.length; i++) {
              const hex = biomeByIndex(data[i])?.color || "#454545",
                rgb = parseInt(hex.slice(1), 16);
              pixels.data[i * 4] = rgb >> 16;
              pixels.data[i * 4 + 1] = (rgb >> 8) & 255;
              pixels.data[i * 4 + 2] = rgb & 255;
              pixels.data[i * 4 + 3] = 255;
            }
            c.putImageData(pixels, 0, 0);
          }
          this.tiles.set(key, { image, data, tx, tz, step });
          this.failedTiles.delete(key);
          const screenTile = 128 * step * this.scale,
            capacity = Math.max(
              256,
              Math.min(
                4096,
                2 *
                  Math.ceil(this.width / screenTile + 2) *
                  Math.ceil(this.height / screenTile + 2),
              ),
            );
          if (this.tiles.size > capacity)
            this.tiles.delete(this.tiles.keys().next().value);
          this.dirty = true;
        })
        .catch((error) => {
          if (generation === this.generation) {
            if (error.message === "CANCELLED") return;
            const attempts = (this.failedTiles.get(key)?.attempts || 0) + 1;
            const delay = 250 * 2 ** attempts;
            this.failedTiles.set(key, {
              attempts,
              retryAfter: Date.now() + delay,
            });
            if (attempts < 3)
              setTimeout(() => {
                if (generation === this.generation) this.dirty = true;
              }, delay);
            this.onError?.(error);
          }
        })
        .finally(() => {
          if (generation === this.generation) {
            this.pending.delete(key);
            this.dirty = true;
          }
        });
    }
  }
  visibleMarkers() {
    return this.markers.filter((m) => !this.filtered.has(m.kind));
  }
  select(point) {
    let nearest = null,
      distance = 50 / this.scale;
    if (this.showStructures)
      for (const m of this.visibleMarkers()) {
        const d = Math.hypot(m.x - point.x, m.z - point.z);
        if (d < distance) {
          distance = d;
          nearest = m;
        }
      }
    this.selected = nearest;
    this.dirty = true;
    this.onSelect(nearest, point);
  }
  frame(time) {
    const dt = Math.min(3, (time - this.lastFrame) / 16.667 || 1);
    this.lastFrame = time;
    if (Math.abs(this.scale - this.targetScale) > 1e-7) {
      this.scale += (this.targetScale - this.scale) * (1 - 2 ** -dt);
      if (this.zoomAnchor) {
        const a = this.zoomAnchor;
        this.x = a.world.x - (a.x - this.width / 2) / this.scale;
        this.z = a.world.z - (a.y - this.height / 2) / this.scale;
      }
      this.changed();
    }
    if (
      !this.drag &&
      Math.hypot(this.velocity.x, this.velocity.z) * this.scale > 0.1
    ) {
      this.x += this.velocity.x * dt;
      this.z += this.velocity.z * dt;
      this.velocity.x *= 0.95 ** dt;
      this.velocity.z *= 0.95 ** dt;
      this.changed();
    }
    if (this.dirty) {
      this.dirty = false;
      this.ensureTiles();
      this.draw();
    }
    requestAnimationFrame((t) => this.frame(t));
  }
  draw() {
    const c = this.ctx;
    c.fillStyle = "#17131f";
    c.fillRect(0, 0, this.width, this.height);
    c.imageSmoothingEnabled = this.smooth;
    if (this.showBiomes) {
      const current = this.step();
      const tiles = [...this.tiles.values()].sort(
        (a, b) => (a.step === current ? 1 : 0) - (b.step === current ? 1 : 0),
      );
      for (const t of tiles) {
        if (!t.image) continue;
        const p = this.screen(t.tx * 128 * t.step, t.tz * 128 * t.step),
          s = 128 * t.step * this.scale;
        c.drawImage(t.image, p.x, p.y, s, s);
      }
    }
    if (this.grid && this.scale >= 0.125) {
      const b = this.bounds();
      c.strokeStyle = "#ffffff24";
      c.lineWidth = 1;
      c.beginPath();
      for (let x = Math.ceil(b.minX / 16) * 16; x < b.maxX; x += 16) {
        const p = this.screen(x, 0);
        c.moveTo(Math.round(p.x) + 0.5, 0);
        c.lineTo(Math.round(p.x) + 0.5, this.height);
      }
      for (let z = Math.ceil(b.minZ / 16) * 16; z < b.maxZ; z += 16) {
        const p = this.screen(0, z);
        c.moveTo(0, Math.round(p.y) + 0.5);
        c.lineTo(this.width, Math.round(p.y) + 0.5);
      }
      c.stroke();
    }
    const origin = this.screen(0, 0);
    c.strokeStyle = "#ffffff60";
    c.beginPath();
    c.moveTo(origin.x - 5, origin.y);
    c.lineTo(origin.x + 5, origin.y);
    c.moveTo(origin.x, origin.y - 5);
    c.lineTo(origin.x, origin.y + 5);
    c.stroke();
    if (this.showStructures)
      for (const m of this.visibleMarkers()) {
        const p = this.screen(m.x, m.z);
        if (
          p.x < -20 ||
          p.y < -20 ||
          p.x > this.width + 20 ||
          p.y > this.height + 20
        )
          continue;
        const image = this.images.get(m.subtype) || this.images.get(m.kind);
        c.imageSmoothingEnabled = false;
        if (image?.complete && image.naturalWidth)
          c.drawImage(image, Math.round(p.x) - 8, Math.round(p.y) - 8, 16, 16);
        else {
          c.fillStyle = m.color || "#d6cfb1";
          c.strokeStyle = "#171717";
          c.lineWidth = 2;
          c.fillRect(p.x - 5, p.y - 5, 10, 10);
          c.strokeRect(p.x - 5, p.y - 5, 10, 10);
        }
        if (m.certainty === "POSSIBLE") {
          c.strokeStyle = "#ddd";
          c.lineWidth = 1;
          c.setLineDash([2, 2]);
          c.strokeRect(p.x - 10, p.y - 10, 20, 20);
          c.setLineDash([]);
        }
        if (this.selected === m) {
          c.strokeStyle = "#f4d968";
          c.lineWidth = 2;
          c.strokeRect(p.x - 12, p.y - 12, 24, 24);
        }
      }
    const ideal = 200 / this.scale,
      power = 10 ** Math.floor(Math.log10(ideal));
    let unit = power;
    for (const n of [1, 2, 5]) if (n * power <= ideal) unit = n * power;
    document.querySelector("#scale").style.width = `${unit * this.scale}px`;
    document.querySelector("#scale-label").textContent =
      `${unit.toLocaleString()} blocks`;
  }
}
