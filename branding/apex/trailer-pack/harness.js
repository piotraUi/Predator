(() => {
  // shared/voxel.ts
  var AIR = 0;
  var BEDROCK = 16;
  var B = (id, key, name, tex, o = {}) => ({
    id,
    key,
    name,
    tex: typeof tex === "string" ? [tex, tex, tex] : tex,
    solid: true,
    render: "opaque",
    hardness: 1,
    ...o
  });
  var BLOCKS = [
    B(0, "air", "Powietrze", "dirt", { solid: false, render: "none", hardness: -1 }),
    B(1, "grass", "Trawa", ["grass_top", "grass_side", "dirt"], { hardness: 0.9, drop: "dirt" }),
    B(2, "dirt", "Ziemia", "dirt", { hardness: 0.75 }),
    B(3, "stone", "Kamie\u0144", "stone", { hardness: 1.5, pick: true, need: 1, drop: "cobblestone" }),
    B(4, "cobblestone", "Bruk", "cobble", { hardness: 2, pick: true, need: 1 }),
    B(5, "log", "Pie\u0144 d\u0119bu", ["log_top", "log_side", "log_top"], { hardness: 2.5 }),
    B(6, "planks", "Deski", "planks", { hardness: 2 }),
    B(7, "leaves", "Li\u015Bcie", "leaves", { render: "cutout", hardness: 0.3, drop: null }),
    B(8, "sand", "Piasek", "sand", { hardness: 0.75 }),
    B(9, "water", "Woda", "water", { solid: false, render: "water", hardness: -1 }),
    B(10, "glass", "Szk\u0142o", "glass", { render: "cutout", hardness: 0.45, drop: null }),
    B(11, "bricks", "Ceg\u0142y", "bricks", { hardness: 2, pick: true, need: 1 }),
    B(12, "coal_ore", "Ruda w\u0119gla", "coal_ore", { hardness: 3, pick: true, need: 1, drop: "coal" }),
    B(13, "iron_ore", "Ruda \u017Celaza", "iron_ore", { hardness: 3, pick: true, need: 2 }),
    B(14, "gold_ore", "Ruda z\u0142ota", "gold_ore", { hardness: 3, pick: true, need: 3 }),
    B(15, "diamond_ore", "Ruda diamentu", "diamond_ore", { hardness: 3, pick: true, need: 3, drop: "diamond" }),
    B(16, "bedrock", "Ska\u0142a macierzysta", "bedrock", { hardness: -1 }),
    B(17, "snowy_grass", "O\u015Bnie\u017Cona trawa", ["snow", "snow_side", "dirt"], { hardness: 0.9, drop: "dirt" }),
    B(18, "gravel", "\u017Bwir", "gravel", { hardness: 0.9 }),
    B(19, "crafting_table", "St\xF3\u0142 rzemie\u015Blniczy", ["table_top", "table_side", "planks"], { hardness: 2.5 }),
    B(20, "furnace", "Piec", ["furnace_top", "furnace_front", "furnace_top"], { hardness: 3.5, pick: true, need: 1 }),
    B(21, "wool", "Bia\u0142a we\u0142na", "wool_white", { hardness: 0.8 }),
    B(22, "wool_red", "Czerwona we\u0142na", "wool_red", { hardness: 0.8 }),
    B(23, "wool_blue", "Niebieska we\u0142na", "wool_blue", { hardness: 0.8 }),
    B(24, "wool_green", "Zielona we\u0142na", "wool_green", { hardness: 0.8 }),
    B(25, "wool_yellow", "\u017B\xF3\u0142ta we\u0142na", "wool_yellow", { hardness: 0.8 }),
    B(26, "wool_black", "Czarna we\u0142na", "wool_black", { hardness: 0.8 }),
    B(27, "glowstone", "Jasnog\u0142az", "glowstone", { hardness: 0.3, glow: true }),
    B(28, "tnt", "TNT", ["tnt_top", "tnt_side", "tnt_bottom"], { hardness: 0, drop: null }),
    B(29, "iron_block", "Blok \u017Celaza", "iron_block", { hardness: 5, pick: true, need: 2 }),
    B(30, "gold_block", "Blok z\u0142ota", "gold_block", { hardness: 3, pick: true, need: 3 }),
    B(31, "diamond_block", "Blok diament\xF3w", "diamond_block", { hardness: 5, pick: true, need: 3 }),
    B(32, "cactus", "Kaktus", ["cactus_top", "cactus_side", "cactus_top"], { hardness: 0.4 }),
    B(33, "obsidian", "Obsydian", "obsidian", { hardness: 15, pick: true, need: 4 }),
    B(34, "bookshelf", "Biblioteczka", ["planks", "bookshelf", "planks"], { hardness: 1.5 }),
    B(35, "lava", "Lawa", "lava", { solid: false, render: "water", hardness: -1, glow: true }),
    B(36, "stone_bricks", "Kamienne ceg\u0142y", "stone_bricks", { hardness: 1.5, pick: true, need: 1 }),
    B(37, "snow_block", "\u015Anieg", "snow", { hardness: 0.2 }),
    B(38, "birch_log", "Pie\u0144 brzozy", ["log_top", "birch_side", "log_top"], { hardness: 2.5 }),
    B(39, "sandstone", "Piaskowiec", ["sandstone_top", "sandstone_side", "sandstone_top"], { hardness: 0.8, pick: true, need: 1 }),
    B(40, "pumpkin", "Dynia", ["pumpkin_top", "pumpkin_side", "pumpkin_top"], { hardness: 1 })
  ];
  var BY_ID = [];
  for (const b of BLOCKS) BY_ID[b.id] = b;
  var BY_KEY = new Map(BLOCKS.map((b) => [b.key, b]));
  var TIERS = [
    { t: 1, key: "wood", name: "Drewniany", head: "#a0793d", mat: "planks" },
    { t: 2, key: "stone", name: "Kamienny", head: "#8a8a8a", mat: "cobblestone" },
    { t: 3, key: "iron", name: "\u017Belazny", head: "#e6e6e6", mat: "iron_ingot" },
    { t: 4, key: "diamond", name: "Diamentowy", head: "#5ce1e6", mat: "diamond" }
  ];
  var ITEMS = [
    ...BLOCKS.filter((b) => b.id !== AIR && b.render !== "water" && b.id !== BEDROCK).map((b) => ({ key: b.key, name: b.name, kind: "block", block: b.id, stack: 64 })),
    { key: "stick", name: "Patyk", kind: "material", color: "#8b5a2b", stack: 64 },
    { key: "coal", name: "W\u0119giel", kind: "material", color: "#222222", stack: 64 },
    { key: "iron_ingot", name: "Sztabka \u017Celaza", kind: "material", color: "#d8d8d8", stack: 64 },
    { key: "gold_ingot", name: "Sztabka z\u0142ota", kind: "material", color: "#f5d13b", stack: 64 },
    { key: "diamond", name: "Diament", kind: "material", color: "#5ce1e6", stack: 64 },
    { key: "gunpowder", name: "Proch", kind: "material", color: "#6b6b6b", stack: 64 },
    { key: "apple", name: "Jab\u0142ko", kind: "food", heal: 15, color: "#e0302a", stack: 64 },
    { key: "porkchop", name: "Surowy schab", kind: "food", heal: 10, color: "#f08a8a", stack: 64 },
    { key: "cooked_porkchop", name: "Pieczony schab", kind: "food", heal: 35, color: "#b5651d", stack: 64 },
    ...TIERS.map((t) => ({ key: `${t.key}_pickaxe`, name: `${t.name} kilof`, kind: "pickaxe", tier: t.t, color: t.head, stack: 1 })),
    ...TIERS.map((t) => ({ key: `${t.key}_sword`, name: `${t.name} miecz`, kind: "sword", tier: t.t, damage: 6 + t.t * 2, color: t.head, stack: 1 }))
  ];
  var ITEM_BY_KEY = new Map(ITEMS.map((i) => [i.key, i]));
  var r = (id, out, inp, station) => ({ id, out, in: inp, ...station ? { station } : {} });
  var RECIPES = [
    r("planks", ["planks", 4], [["log", 1]]),
    r("planks_birch", ["planks", 4], [["birch_log", 1]]),
    r("stick", ["stick", 4], [["planks", 2]]),
    r("crafting_table", ["crafting_table", 1], [["planks", 4]]),
    ...TIERS.map((t) => r(`${t.key}_pickaxe`, [`${t.key}_pickaxe`, 1], [[t.mat, 3], ["stick", 2]], "table")),
    ...TIERS.map((t) => r(`${t.key}_sword`, [`${t.key}_sword`, 1], [[t.mat, 2], ["stick", 1]], "table")),
    r("furnace", ["furnace", 1], [["cobblestone", 8]], "table"),
    r("stone_bricks", ["stone_bricks", 4], [["stone", 4]], "table"),
    r("sandstone", ["sandstone", 1], [["sand", 4]], "table"),
    r("tnt", ["tnt", 1], [["gunpowder", 5], ["sand", 4]], "table"),
    r("bookshelf", ["bookshelf", 1], [["planks", 6], ["log", 1]], "table"),
    r("iron_block", ["iron_block", 1], [["iron_ingot", 9]], "table"),
    r("gold_block", ["gold_block", 1], [["gold_ingot", 9]], "table"),
    r("diamond_block", ["diamond_block", 1], [["diamond", 9]], "table"),
    r("glowstone", ["glowstone", 1], [["gold_ingot", 1], ["glass", 1]], "table"),
    // piec: wytapianie (paliwo: węgiel, pień albo deski)
    r("iron_ingot", ["iron_ingot", 1], [["iron_ore", 1]], "furnace"),
    r("gold_ingot", ["gold_ingot", 1], [["gold_ore", 1]], "furnace"),
    r("glass", ["glass", 1], [["sand", 1]], "furnace"),
    r("stone", ["stone", 1], [["cobblestone", 1]], "furnace"),
    r("cooked_porkchop", ["cooked_porkchop", 1], [["porkchop", 1]], "furnace"),
    r("charcoal", ["coal", 1], [["log", 1]], "furnace"),
    r("bricks", ["bricks", 1], [["gravel", 1]], "furnace")
  ];

  // shared/physics.ts
  var PLAYER_RADIUS = 0.9;
  var PLAYER_HEIGHT = 5.2;
  var SPHERES = [PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_HEIGHT - PLAYER_RADIUS];
  var CELL = 16;
  function rotationMatrix(rxDeg, ryDeg, rzDeg) {
    const a = rxDeg * Math.PI / 180, b = ryDeg * Math.PI / 180, c = rzDeg * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    return [
      cb * cc + sb * sa * sc,
      -cb * sc + sb * sa * cc,
      sb * ca,
      ca * sc,
      ca * cc,
      -sa,
      -sb * cc + cb * sa * sc,
      sb * sc + cb * sa * cc,
      cb * ca
    ];
  }
  function partBox(p) {
    const m = rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0);
    const hx = p.sx / 2;
    const hy = p.sy / 2;
    const hz = p.sz / 2;
    const ex = Math.abs(m[0]) * hx + Math.abs(m[1]) * hy + Math.abs(m[2]) * hz;
    const ey = Math.abs(m[3]) * hx + Math.abs(m[4]) * hy + Math.abs(m[5]) * hz;
    const ez = Math.abs(m[6]) * hx + Math.abs(m[7]) * hy + Math.abs(m[8]) * hz;
    const rotated = !!(p.rx || p.rz) || Math.abs(Math.sin(p.ry % 90 * Math.PI / 180)) > 1e-6;
    return {
      part: p,
      minX: p.x - ex,
      maxX: p.x + ex,
      minY: p.y - ey,
      maxY: p.y + ey,
      minZ: p.z - ez,
      maxZ: p.z + ez,
      hx,
      hy,
      hz,
      m,
      rotated
    };
  }
  var len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
  function sdfLocal(b, x, y, z) {
    const { hx, hy, hz } = b;
    switch (b.part.shape) {
      case "sphere": {
        if (hx === hy && hy === hz) return len3(x, y, z) - hx;
        const k0 = len3(x / hx, y / hy, z / hz);
        const k1 = len3(x / (hx * hx), y / (hy * hy), z / (hz * hz));
        return k1 < 1e-9 ? -Math.min(hx, hy, hz) : k0 * (k0 - 1) / k1;
      }
      case "cylinder": {
        const k = Math.hypot(x / hx, z / hz);
        const dxz = (k - 1) * Math.min(hx, hz);
        const dy = Math.abs(y) - hy;
        return Math.min(Math.max(dxz, dy), 0) + Math.hypot(Math.max(dxz, 0), Math.max(dy, 0));
      }
      case "wedge": {
        const box = boxSdf(x, y, z, hx, hy, hz);
        const slope = (y * hz - z * hy) / Math.hypot(hz, hy);
        return Math.max(box, slope);
      }
      default:
        return boxSdf(x, y, z, hx, hy, hz);
    }
  }
  function boxSdf(x, y, z, hx, hy, hz) {
    const qx = Math.abs(x) - hx;
    const qy = Math.abs(y) - hy;
    const qz = Math.abs(z) - hz;
    const outside = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return outside + Math.min(Math.max(qx, qy, qz), 0);
  }
  function sdf(b, x, y, z) {
    const dx = x - b.part.x;
    const dy = y - b.part.y;
    const dz = z - b.part.z;
    const m = b.m;
    const lx = m[0] * dx + m[3] * dy + m[6] * dz;
    const ly = m[1] * dx + m[4] * dy + m[7] * dz;
    const lz = m[2] * dx + m[5] * dy + m[8] * dz;
    return sdfLocal(b, lx, ly, lz);
  }
  function normal(b, x, y, z) {
    const e = 0.02;
    const nx = sdf(b, x + e, y, z) - sdf(b, x - e, y, z);
    const ny = sdf(b, x, y + e, z) - sdf(b, x, y - e, z);
    const nz = sdf(b, x, y, z + e) - sdf(b, x, y, z - e);
    const l = len3(nx, ny, nz);
    return l < 1e-9 ? [0, 1, 0] : [nx / l, ny / l, nz / l];
  }
  var CollisionWorld = class {
    /** teren (siatka wysokości) - osobno od klocków */
    terrain = null;
    /** świat z bloków (Minecraft) - też osobno */
    voxels = null;
    boxes = /* @__PURE__ */ new Map();
    grid = /* @__PURE__ */ new Map();
    big = /* @__PURE__ */ new Set();
    // bardzo duże klocki (np. podłoże) poza siatką
    constructor(parts2 = []) {
      for (const p of parts2) this.set(p);
    }
    cells(b, fn) {
      for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++)
        for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) fn(cx + "," + cz);
    }
    set(p) {
      this.remove(p.id);
      const b = partBox(p);
      this.boxes.set(p.id, b);
      if ((b.maxX - b.minX) * (b.maxZ - b.minZ) > CELL * CELL * 64) {
        this.big.add(b);
        return;
      }
      this.cells(b, (k) => {
        let s = this.grid.get(k);
        if (!s) this.grid.set(k, s = /* @__PURE__ */ new Set());
        s.add(b);
      });
    }
    remove(id) {
      const b = this.boxes.get(id);
      if (!b) return;
      this.boxes.delete(id);
      if (this.big.delete(b)) return;
      this.cells(b, (k) => this.grid.get(k)?.delete(b));
    }
    get(id) {
      return this.boxes.get(id);
    }
    query(minX, maxX, minZ, maxZ) {
      const out = new Set(this.big);
      for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
        for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
          const s = this.grid.get(cx + "," + cz);
          if (s) for (const b of s) out.add(b);
        }
      return out;
    }
  };
  function terrainDist(t, x, y, z) {
    const h = t.heightAt(x, z);
    if (!Number.isFinite(h)) return null;
    const [gx, gz] = t.slopeAt(x, z);
    const l = Math.sqrt(1 + gx * gx + gz * gz);
    const n = [-gx / l, 1 / l, -gz / l];
    return { d: (y - h) / l, n };
  }
  var surfaceNormal = normal;
  var terrainContact = terrainDist;

  // shared/rigid.ts
  var MAX_RIGID = 100;
  var SUBSTEP = 1 / 60;
  var SLEEP_SPEED = 0.15;
  var SLEEP_TIME = 0.6;
  var PLAYER_R = 0.9;
  var PLAYER_H = 5.2;
  function samplesFor(p) {
    if (p.shape === "sphere") {
      const r3 = Math.min(p.sx, p.sy, p.sz) / 2;
      return { samples: [[0, 0, 0]], r: r3, reach: Math.max(p.sx, p.sz) / 2, roll: true };
    }
    const r2 = Math.max(0.2, Math.min(p.sx, p.sy, p.sz) / 2);
    const axis = (size) => {
      const span = Math.max(0, size / 2 - r2);
      const n = Math.min(4, Math.max(1, Math.ceil(size / (r2 * 1.6))));
      return n === 1 ? [0] : Array.from({ length: n }, (_, i) => -span + 2 * span * i / (n - 1));
    };
    const out = [];
    for (const x of axis(p.sx)) for (const y of axis(p.sy)) for (const z of axis(p.sz)) out.push([x, y, z]);
    return { samples: out, r: r2, reach: Math.hypot(p.sx, p.sz) / 2, roll: false };
  }
  var RigidWorld = class {
    constructor(world, gravity) {
      this.world = world;
      this.gravity = gravity;
    }
    world;
    gravity;
    bodies = /* @__PURE__ */ new Map();
    add(part) {
      if (this.bodies.size >= MAX_RIGID) return null;
      const s = samplesFor(part);
      const b = {
        id: part.id,
        part,
        x: part.x,
        y: part.y,
        z: part.z,
        vx: 0,
        vy: 0,
        vz: 0,
        ...s,
        bounce: part.bounce ?? 0.3,
        sleeping: false,
        still: 0,
        sx: part.x,
        sy: part.y,
        sz: part.z
      };
      this.bodies.set(part.id, b);
      return b;
    }
    remove(id) {
      this.bodies.delete(id);
    }
    wake(id) {
      const b = this.bodies.get(id);
      if (b) {
        b.sleeping = false;
        b.still = 0;
      }
    }
    /** nagła zmiana (skrypt przesunął klocek albo go popchnął) */
    push(id, vx2, vy, vz2) {
      const b = this.bodies.get(id);
      if (!b) return;
      b.vx += vx2;
      b.vy += vy;
      b.vz += vz2;
      this.wake(id);
    }
    teleport(id, x, y, z) {
      const b = this.bodies.get(id);
      if (!b) return;
      b.x = x;
      b.y = y;
      b.z = z;
      b.vx = b.vy = b.vz = 0;
      this.wake(id);
    }
    /** jeden krok symulacji; zwraca bryły, które się ruszyły (do wysłania klientom) */
    step(dt, pushers = []) {
      const n = Math.max(1, Math.ceil(dt / SUBSTEP));
      const h = dt / n;
      for (let i = 0; i < n; i++) this.sub(h, pushers);
      const moved = [];
      for (const b of this.bodies.values()) {
        if (Math.abs(b.x - b.sx) + Math.abs(b.y - b.sy) + Math.abs(b.z - b.sz) < 0.02) continue;
        b.sx = b.x;
        b.sy = b.y;
        b.sz = b.z;
        b.part.x = b.x;
        b.part.y = b.y;
        b.part.z = b.z;
        this.world.set(b.part);
        moved.push(b);
      }
      return moved;
    }
    sub(dt, pushers) {
      const list = [...this.bodies.values()];
      for (const p of pushers) {
        for (const b of list) {
          if (p.y > b.y + b.part.sy / 2 + 0.1 || p.y + PLAYER_H < b.y - b.part.sy / 2) continue;
          const dx = b.x - p.x, dz = b.z - p.z;
          const d = Math.hypot(dx, dz);
          const min = PLAYER_R + b.reach;
          if (d >= min) continue;
          if (p.y >= b.y + b.part.sy / 2 - 0.3) continue;
          const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
          const push = min - d;
          b.x += nx * push;
          b.z += nz * push;
          const approach = p.vx * nx + p.vz * nz;
          if (approach > 0) {
            const along = b.vx * nx + b.vz * nz;
            const want = approach * 1.1;
            if (along < want) {
              b.vx += nx * (want - along);
              b.vz += nz * (want - along);
            }
          }
          b.sleeping = false;
          b.still = 0;
        }
      }
      for (const b of list) {
        if (b.sleeping) continue;
        b.vy -= this.gravity * dt;
        b.vy = Math.max(b.vy, -150);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        this.collide(b, dt);
        if (b.y < -300) {
          b.x = b.part.x;
          b.y = b.part.y + 5;
          b.z = b.part.z;
          b.vx = b.vy = b.vz = 0;
        }
        const speed = Math.hypot(b.vx, b.vy, b.vz);
        if (speed < SLEEP_SPEED) {
          b.still += dt;
          if (b.still > SLEEP_TIME) {
            b.sleeping = true;
            b.vx = b.vy = b.vz = 0;
          }
        } else b.still = 0;
      }
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], c = list[j];
          if (a.sleeping && c.sleeping) continue;
          const dx = c.x - a.x, dz = c.z - a.z;
          const dyMax = (a.part.sy + c.part.sy) / 2;
          if (Math.abs(c.y - a.y) > dyMax) continue;
          const d = Math.hypot(dx, dz);
          const min = a.reach + c.reach;
          if (d >= min || d < 1e-5) continue;
          const nx = dx / d, nz = dz / d;
          const push = (min - d) / 2;
          a.x -= nx * push;
          a.z -= nz * push;
          c.x += nx * push;
          c.z += nz * push;
          const rv = (c.vx - a.vx) * nx + (c.vz - a.vz) * nz;
          if (rv < 0) {
            const e = Math.min(a.bounce, c.bounce);
            const j2 = -(1 + e) * rv / 2;
            a.vx -= nx * j2;
            a.vz -= nz * j2;
            c.vx += nx * j2;
            c.vz += nz * j2;
          }
          a.sleeping = c.sleeping = false;
          a.still = c.still = 0;
        }
    }
    /** kolizje próbek bryły ze światem: wypchnięcie + odbicie i tarcie */
    collide(b, dt) {
      const yaw = b.part.ry * Math.PI / 180;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const terr = this.world.terrain;
      let grounded = false;
      for (let iter = 0; iter < 3; iter++) {
        let hit = false;
        for (const [ox, oy, oz] of b.samples) {
          const px = b.x + ox * cy + oz * sy;
          const py = b.y + oy;
          const pz = b.z - ox * sy + oz * cy;
          const r2 = b.r;
          const near = this.world.query(px - r2, px + r2, pz - r2, pz + r2);
          for (const bx of near) {
            if (!bx.part.collide || bx.part.id === b.id || this.bodies.has(bx.part.id)) continue;
            if (px < bx.minX - r2 || px > bx.maxX + r2 || py < bx.minY - r2 || py > bx.maxY + r2 || pz < bx.minZ - r2 || pz > bx.maxZ + r2) continue;
            const d = sdf(bx, px, py, pz);
            if (d >= r2) continue;
            const [nx, ny, nz] = surfaceNormal(bx, px, py, pz);
            this.resolve(b, nx, ny, nz, r2 - d);
            if (ny > 0.6) grounded = true;
            hit = true;
          }
          if (terr) {
            const td = terrainContact(terr, px, py, pz);
            if (td && td.d < r2) {
              this.resolve(b, td.n[0], td.n[1], td.n[2], r2 - td.d);
              if (td.n[1] > 0.6) grounded = true;
              hit = true;
            }
          }
        }
        if (!hit) break;
      }
      if (grounded) {
        const damp = Math.exp(-(b.roll ? 0.35 : 3.2) * dt);
        b.vx *= damp;
        b.vz *= damp;
      } else {
        const air = Math.exp(-0.05 * dt);
        b.vx *= air;
        b.vz *= air;
      }
    }
    resolve(b, nx, ny, nz, pen) {
      const p = Math.min(pen, 2);
      b.x += nx * p;
      b.y += ny * p;
      b.z += nz * p;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        const e = -vn > 4 ? b.bounce : 0;
        b.vx -= (1 + e) * vn * nx;
        b.vy -= (1 + e) * vn * ny;
        b.vz -= (1 + e) * vn * nz;
      }
    }
  };

  // shared/skybox.ts
  var SKYBOXES = [
    {
      id: "day",
      name: "S\u0142oneczny dzie\u0144",
      icon: "\u2600\uFE0F",
      top: "#3d8fe0",
      horizon: "#b9e0ff",
      bottom: "#d8ecff",
      fog: "#b9e0ff",
      light: 1,
      tint: "#ffffff",
      ground: "#8c8c99",
      sun: { color: "#fff8d0", height: 0.62, size: 26 },
      clouds: { count: 16, color: "#ffffff", alpha: 0.9 }
    },
    {
      id: "cloudy",
      name: "Pochmurno",
      icon: "\u2601\uFE0F",
      top: "#8a9aac",
      horizon: "#c8d2dc",
      bottom: "#d0d7de",
      fog: "#c3ccd6",
      light: 0.8,
      tint: "#e8eef5",
      ground: "#80858c",
      clouds: { count: 40, color: "#eef1f4", alpha: 0.85 }
    },
    {
      id: "sunset",
      name: "Zach\xF3d s\u0142o\u0144ca",
      icon: "\u{1F305}",
      top: "#3b2f6e",
      horizon: "#ff9a5a",
      bottom: "#ffcf8a",
      fog: "#f5a070",
      light: 0.85,
      tint: "#ffd2a8",
      ground: "#8a6a70",
      sun: { color: "#ffdd88", height: 0.08, size: 44 },
      clouds: { count: 10, color: "#ff7f7f", alpha: 0.55 }
    },
    {
      id: "dawn",
      name: "\u015Awit",
      icon: "\u{1F304}",
      top: "#6aa8e8",
      horizon: "#ffd1dc",
      bottom: "#fff0e0",
      fog: "#f4d6de",
      light: 0.9,
      tint: "#fff0f0",
      ground: "#8c8394",
      sun: { color: "#fff4cc", height: 0.12, size: 30 },
      clouds: { count: 8, color: "#ffe4ec", alpha: 0.7 }
    },
    {
      id: "night",
      name: "Noc",
      icon: "\u{1F319}",
      top: "#040818",
      horizon: "#1c2c5a",
      bottom: "#0b1330",
      fog: "#16234a",
      light: 0.45,
      tint: "#9fb4ff",
      ground: "#2a3050",
      stars: 420,
      moon: true
    },
    {
      id: "aurora",
      name: "Zorza polarna",
      icon: "\u{1F30C}",
      top: "#020612",
      horizon: "#123a4a",
      bottom: "#081820",
      fog: "#0e2c38",
      light: 0.5,
      tint: "#a8ffe0",
      ground: "#1e3a40",
      stars: 300,
      aurora: true
    },
    {
      id: "space",
      name: "Kosmos",
      icon: "\u{1FA90}",
      top: "#000000",
      horizon: "#0a0618",
      bottom: "#000000",
      fog: "#07040f",
      light: 0.75,
      tint: "#e0d8ff",
      ground: "#3a3450",
      stars: 900,
      nebula: true,
      planet: true
    },
    {
      id: "storm",
      name: "Burza",
      icon: "\u26C8\uFE0F",
      top: "#23272e",
      horizon: "#4a525c",
      bottom: "#3a4048",
      fog: "#454c55",
      light: 0.55,
      tint: "#c8d0dc",
      ground: "#3c4048",
      clouds: { count: 55, color: "#2e333a", alpha: 0.9 }
    },
    {
      id: "candy",
      name: "Cukierkowe",
      icon: "\u{1F36D}",
      top: "#ff9ad5",
      horizon: "#ffe0f4",
      bottom: "#fff4fb",
      fog: "#ffd8ef",
      light: 1,
      tint: "#fff0fa",
      ground: "#b891b0",
      sun: { color: "#fffbe0", height: 0.55, size: 22 },
      clouds: { count: 18, color: "#c8f0ff", alpha: 0.9 }
    },
    {
      id: "hell",
      name: "Piek\u0142o",
      icon: "\u{1F525}",
      top: "#1a0000",
      horizon: "#c2300a",
      bottom: "#ff7a1a",
      fog: "#8a1d08",
      light: 0.7,
      tint: "#ffb080",
      ground: "#6a2010",
      stars: 60,
      clouds: { count: 20, color: "#2a0a05", alpha: 0.7 }
    }
  ];

  // shared/terrain.ts
  var TERRAIN_MATERIALS = [
    { id: 0, name: "Trawa", icon: "\u{1F33F}", color: [0.36, 0.62, 0.24] },
    { id: 1, name: "Piasek", icon: "\u{1F3D6}\uFE0F", color: [0.87, 0.8, 0.55] },
    { id: 2, name: "Ska\u0142a", icon: "\u{1FAA8}", color: [0.5, 0.5, 0.52] },
    { id: 3, name: "\u015Anieg", icon: "\u2744\uFE0F", color: [0.95, 0.96, 0.98] },
    { id: 4, name: "Ziemia", icon: "\u{1F7EB}", color: [0.45, 0.32, 0.2] },
    { id: 5, name: "Lawa", icon: "\u{1F30B}", color: [0.9, 0.3, 0.05] }
  ];
  var NO_WATER = -32768;
  function toB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(s);
  }
  function fromB64(b64) {
    try {
      const s = atob(b64);
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  var TerrainGrid = class _TerrainGrid {
    constructor(n, cell, cx, cz) {
      this.n = n;
      this.cell = cell;
      this.cx = cx;
      this.cz = cz;
      this.h = new Float32Array((n + 1) * (n + 1));
      this.m = new Uint8Array(n * n);
      this.w = new Float32Array(n * n).fill(NaN);
      this.x0 = cx - n * cell / 2;
      this.z0 = cz - n * cell / 2;
    }
    n;
    cell;
    cx;
    cz;
    /** wysokości w wierzchołkach, (n+1) x (n+1) */
    h;
    /** materiał kratki, n x n */
    m;
    /** poziom wody w kratce (NaN = brak), n x n */
    w;
    /** róg terenu (najmniejsze x, z) */
    x0;
    z0;
    get size() {
      return this.n * this.cell;
    }
    static decode(t) {
      if (!t) return null;
      const g = new _TerrainGrid(t.n, t.cell, t.x, t.z);
      const hb = fromB64(t.h);
      const mb = fromB64(t.m);
      if (!hb || hb.length !== g.h.length * 2 || !mb || mb.length !== g.m.length) return null;
      const hv = new DataView(hb.buffer);
      for (let i = 0; i < g.h.length; i++) g.h[i] = hv.getInt16(i * 2, true) / 10;
      g.m.set(mb);
      if (t.w) {
        const wb = fromB64(t.w);
        if (wb && wb.length === g.w.length * 2) {
          const wv = new DataView(wb.buffer);
          for (let i = 0; i < g.w.length; i++) {
            const v = wv.getInt16(i * 2, true);
            g.w[i] = v === NO_WATER ? NaN : v / 10;
          }
        }
      }
      return g;
    }
    encode() {
      const hb = new Uint8Array(this.h.length * 2);
      const hv = new DataView(hb.buffer);
      const q = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 10)));
      for (let i = 0; i < this.h.length; i++) hv.setInt16(i * 2, q(this.h[i]), true);
      let anyWater = false;
      const wb = new Uint8Array(this.w.length * 2);
      const wv = new DataView(wb.buffer);
      for (let i = 0; i < this.w.length; i++) {
        const v = this.w[i];
        if (!Number.isNaN(v)) anyWater = true;
        wv.setInt16(i * 2, Number.isNaN(v) ? NO_WATER : q(v), true);
      }
      return { n: this.n, cell: this.cell, x: this.cx, z: this.cz, h: toB64(hb), m: toB64(this.m), ...anyWater ? { w: toB64(wb) } : {} };
    }
    // ---------- zapytania ----------
    /** czy punkt jest nad terenem (w poziomie) */
    inside(x, z) {
      const s = this.size;
      return x >= this.x0 && z >= this.z0 && x <= this.x0 + s && z <= this.z0 + s;
    }
    hAt(i, j) {
      return this.h[j * (this.n + 1) + i];
    }
    /** wysokość terenu w punkcie (interpolacja w trójkątach, jak rysowana siatka); poza terenem -Infinity */
    heightAt(x, z) {
      if (!this.inside(x, z)) return -Infinity;
      const fx = (x - this.x0) / this.cell;
      const fz = (z - this.z0) / this.cell;
      const i = Math.min(this.n - 1, Math.floor(fx));
      const j = Math.min(this.n - 1, Math.floor(fz));
      const u = fx - i;
      const v = fz - j;
      const h00 = this.hAt(i, j), h10 = this.hAt(i + 1, j), h01 = this.hAt(i, j + 1), h11 = this.hAt(i + 1, j + 1);
      return u >= v ? h00 + (h10 - h00) * u + (h11 - h10) * v : h00 + (h11 - h01) * u + (h01 - h00) * v;
    }
    /** nachylenie terenu: [dh/dx, dh/dz] */
    slopeAt(x, z) {
      const e = this.cell * 0.25;
      const c = this.heightAt(x, z);
      const hx = this.heightAt(x + e, z);
      const hz = this.heightAt(x, z + e);
      const bx = this.heightAt(x - e, z);
      const bz = this.heightAt(x, z - e);
      const gx = Number.isFinite(hx) && Number.isFinite(bx) ? (hx - bx) / (2 * e) : Number.isFinite(hx) ? (hx - c) / e : Number.isFinite(bx) ? (c - bx) / e : 0;
      const gz = Number.isFinite(hz) && Number.isFinite(bz) ? (hz - bz) / (2 * e) : Number.isFinite(hz) ? (hz - c) / e : Number.isFinite(bz) ? (c - bz) / e : 0;
      return [gx, gz];
    }
    /** kratka pod punktem (albo -1) */
    cellIndex(x, z) {
      if (!this.inside(x, z)) return -1;
      const i = Math.min(this.n - 1, Math.floor((x - this.x0) / this.cell));
      const j = Math.min(this.n - 1, Math.floor((z - this.z0) / this.cell));
      return j * this.n + i;
    }
    /** powierzchnia wody nad punktem (gdy punkt jest w wodzie) albo null */
    waterAt(x, y, z) {
      const k = this.cellIndex(x, z);
      if (k < 0) return null;
      const lvl = this.w[k];
      if (Number.isNaN(lvl) || y > lvl) return null;
      return y >= this.heightAt(x, z) - 2 ? lvl : null;
    }
    /** promień w teren: odległość albo null (kroki co pół kratki + dokładniej na końcu) */
    raycast(ox, oy, oz, dx, dy, dz, maxDist) {
      const step = this.cell * 0.5;
      let prev = 0;
      for (let t = 0; t <= maxDist; t += step) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        const h = this.heightAt(x, z);
        if (y < h) {
          let lo = prev, hi = t;
          for (let k = 0; k < 10; k++) {
            const mid = (lo + hi) / 2;
            if (oy + dy * mid < this.heightAt(ox + dx * mid, oz + dz * mid)) hi = mid;
            else lo = mid;
          }
          return hi;
        }
        prev = t;
      }
      return null;
    }
  };

  // shared/catalog.ts
  var hat = (id, name, price, icon, color, extra = {}) => ({ id, name, type: "hat", price, icon, color, ...extra });
  var face = (id, name, price, icon, extra = {}) => ({ id, name, type: "face", price, icon, ...extra });
  var shirt = (id, name, price, icon, cloth, extra = {}) => ({ id, name, type: "shirt", price, icon, cloth, color: cloth.color, ...extra });
  var pants = (id, name, price, icon, cloth, extra = {}) => ({ id, name, type: "pants", price, icon, cloth, color: cloth.color, ...extra });
  var back = (id, name, price, icon, color, extra = {}) => ({ id, name, type: "back", price, icon, color, ...extra });
  var neck = (id, name, price, icon, color, extra = {}) => ({ id, name, type: "neck", price, icon, color, ...extra });
  var emote = (id, name, price, icon, extra = {}) => ({ id, name, type: "emote", price, icon, isNew: true, ...extra });
  var N = { isNew: true };
  var CATALOG = [
    // ---------- czapki ----------
    hat("none", "Brak", 0, "\u{1F6AB}", "#999999"),
    hat("cap", "Czapka z daszkiem", 0, "\u{1F9E2}", "#d62828"),
    hat("beanie", "Czapka z pomponem", 0, "\u{1F9F6}", "#2a9d8f", N),
    hat("catears", "Kocie uszy", 40, "\u{1F431}", "#2b2b2b", { ...N, rarity: "rare" }),
    hat("bunny", "Uszy kr\xF3liczka", 40, "\u{1F430}", "#ffffff", N),
    hat("bear", "Uszy misia", 35, "\u{1F43B}", "#8b5a2b", N),
    hat("frog", "Czapka \u017Cabka", 45, "\u{1F438}", "#5cb85c", N),
    hat("party", "Czapka imprezowa", 25, "\u{1F973}", "#ff4fa3"),
    hat("headphones", "S\u0142uchawki", 60, "\u{1F3A7}", "#1f1f1f", N),
    hat("propeller", "Czapka ze \u015Bmig\u0142em", 70, "\u{1F681}", "#3a86ff", { ...N, rarity: "rare" }),
    hat("chef", "Czapka kucharza", 40, "\u{1F468}\u200D\u{1F373}", "#ffffff", N),
    hat("cowboy", "Kapelusz kowbojski", 55, "\u{1F920}", "#8b5a2b", N),
    hat("sombrero", "Sombrero", 65, "\u{1FA85}", "#e9c46a", N),
    hat("pirate", "Kapelusz pirata", 80, "\u{1F3F4}\u200D\u2620\uFE0F", "#1b1b1b", { ...N, rarity: "rare" }),
    hat("wizard", "Czapka czarodzieja", 120, "\u{1F9D9}", "#4b2991", { ...N, rarity: "epic" }),
    hat("tophat", "Cylinder", 60, "\u{1F3A9}", "#1b1b1b"),
    hat("santa", "Czapka Miko\u0142aja", 50, "\u{1F385}", "#d62828", N),
    hat("graduation", "Biret", 60, "\u{1F393}", "#1b1b1b", N),
    hat("flower", "Wianek z kwiat\xF3w", 45, "\u{1F338}", "#ff9ecf", N),
    hat("tiara", "Diadem", 110, "\u{1F478}", "#c0c0ff", { ...N, rarity: "rare" }),
    hat("ninja", "Opaska ninja", 50, "\u{1F977}", "#c1121f", N),
    hat("antlers", "Poro\u017Ce renifera", 70, "\u{1F98C}", "#8b5a2b", N),
    hat("horns", "Rogi", 90, "\u{1F608}", "#8b0000"),
    hat("viking", "He\u0142m wikinga", 130, "\u{1FA93}", "#9aa3ad", { ...N, rarity: "epic" }),
    hat("knight", "He\u0142m rycerza", 150, "\u{1F6E1}\uFE0F", "#b8c0c8", { ...N, rarity: "epic" }),
    hat("astronaut", "He\u0142m astronauty", 200, "\u{1F9D1}\u200D\u{1F680}", "#e8eef5", { ...N, rarity: "epic" }),
    hat("pumpkin", "Dynia", 90, "\u{1F383}", "#f28c28", { ...N, rarity: "rare" }),
    hat("unicorn", "R\xF3g jednoro\u017Cca", 180, "\u{1F984}", "#ff9ecf", { ...N, rarity: "epic" }),
    hat("dino", "Kolce dinozaura", 160, "\u{1F996}", "#43aa8b", { ...N, rarity: "epic" }),
    hat("halo", "Aureola", 150, "\u{1F607}", "#fff5a0", { rarity: "rare" }),
    hat("crown", "Korona", 300, "\u{1F451}", "#ffc300", { rarity: "legendary" }),
    hat("rainbowcap", "T\u0119czowa czapka", 250, "\u{1F308}", "#ff4d6d", { ...N, rarity: "legendary" }),
    hat("predatorcrown", "Korona Predatora", 0, "\u{1F525}", "#e63946", { offsale: true, rarity: "legendary" }),
    // ---------- twarze ----------
    face("smile", "U\u015Bmiech", 0, "\u{1F642}"),
    face("wink", "Oczko", 0, "\u{1F609}", N),
    face("grin", "Szeroki u\u015Bmiech", 20, "\u{1F601}"),
    face("tongue", "J\u0119zyk", 20, "\u{1F61B}", N),
    face("blush", "Rumie\u0144ce", 25, "\u{1F60A}", N),
    face("wow", "Zdziwiony", 30, "\u{1F62E}"),
    face("angry", "Z\u0142y", 30, "\u{1F620}"),
    face("sad", "Smutny", 20, "\u{1F622}", N),
    face("sleepy", "\u015Apioch", 30, "\u{1F634}", N),
    face("laugh", "XD", 35, "\u{1F606}", N),
    face("cat", "Kotek", 40, "\u{1F63A}", { ...N, rarity: "rare" }),
    face("hearts", "Zakochany", 50, "\u{1F60D}", { ...N, rarity: "rare" }),
    face("stars", "Gwiazdy w oczach", 60, "\u{1F929}", { ...N, rarity: "rare" }),
    face("dizzy", "Zakr\u0119cony", 40, "\u{1F635}\u200D\u{1F4AB}", N),
    face("cool", "Okulary", 50, "\u{1F60E}"),
    face("nerd", "Kujon", 45, "\u{1F913}", N),
    face("mustache", "W\u0105sacz", 55, "\u{1F978}", N),
    face("vampire", "Wampir", 70, "\u{1F9DB}", { ...N, rarity: "rare" }),
    face("pirateface", "Opaska pirata", 60, "\u{1F3F4}\u200D\u2620\uFE0F", N),
    face("robot", "Robot", 90, "\u{1F916}", { ...N, rarity: "epic" }),
    face("clown", "Klaun", 80, "\u{1F921}", { ...N, rarity: "rare" }),
    // ---------- koszulki ----------
    shirt("tshirt-red", "Czerwona koszulka", 0, "\u{1F455}", { color: "#d62828", accent: "#ffffff", pattern: "plain", short: true }),
    shirt("tshirt-blue", "Niebieska koszulka", 0, "\u{1F455}", { color: "#1d4ed8", accent: "#ffffff", pattern: "plain", short: true }),
    shirt("stripes", "Marynarska w paski", 30, "\u2693", { color: "#ffffff", accent: "#1d3557", pattern: "stripes", short: true }, N),
    shirt("dots", "W kropki", 30, "\u{1F534}", { color: "#ffd6e7", accent: "#ff4d8d", pattern: "dots", short: true }, N),
    shirt("heart", "Z serduszkiem", 35, "\u{1F496}", { color: "#ffffff", accent: "#ff3366", pattern: "heart", short: true }, N),
    shirt("star", "Z gwiazd\u0105", 35, "\u2B50", { color: "#1b263b", accent: "#ffd60a", pattern: "star", short: true }, N),
    shirt("cat-shirt", "Z kotkiem", 45, "\u{1F408}", { color: "#b8e0ff", accent: "#2b2b2b", pattern: "cat", short: true }, N),
    shirt("dino-shirt", "Z dinozaurem", 50, "\u{1F995}", { color: "#90be6d", accent: "#2d6a4f", pattern: "dino", short: true }, N),
    shirt("pizza", "Pizza", 45, "\u{1F355}", { color: "#ffe8a3", accent: "#e63946", accent2: "#f4a261", pattern: "pizza", short: true }, N),
    shirt("jersey", "Koszulka pi\u0142karska 10", 60, "\u26BD", { color: "#ffffff", accent: "#d62828", pattern: "jersey", short: true }, N),
    shirt("sport", "Bluza sportowa", 70, "\u{1F3C3}", { color: "#1d4ed8", accent: "#ffffff", pattern: "sport" }, N),
    shirt("hoodie-black", "Czarna bluza z kapturem", 60, "\u{1F9E5}", { color: "#222222", accent: "#555555", pattern: "hoodie" }, N),
    shirt("hoodie-pink", "R\xF3\u017Cowa bluza z kapturem", 60, "\u{1FA77}", { color: "#ff8fc7", accent: "#ffc2e2", pattern: "hoodie" }, N),
    shirt("flannel", "Koszula w krat\u0119", 55, "\u{1FA93}", { color: "#b5332e", accent: "#1b1b1b", pattern: "flannel" }, N),
    shirt("camo", "Moro", 65, "\u{1FA96}", { color: "#6b705c", accent: "#3a3f2e", accent2: "#a5a58d", pattern: "camo" }, N),
    shirt("robot-shirt", "Zbroja robota", 90, "\u{1F916}", { color: "#9aa3ad", accent: "#3a86ff", pattern: "robot" }, { ...N, rarity: "rare" }),
    shirt("tuxedo", "Smoking", 120, "\u{1F935}", { color: "#1b1b1b", accent: "#ffffff", accent2: "#d62828", pattern: "tuxedo" }, { ...N, rarity: "rare" }),
    shirt("rainbow-shirt", "T\u0119czowa", 110, "\u{1F308}", { color: "#ffffff", accent: "#ff4d6d", pattern: "rainbow", short: true }, { ...N, rarity: "rare" }),
    shirt("unicorn-shirt", "Jednoro\u017Cec", 130, "\u{1F984}", { color: "#fbe3ff", accent: "#b565d9", pattern: "unicorn", short: true }, { ...N, rarity: "epic" }),
    shirt("hero", "Superbohater", 160, "\u{1F9B8}", { color: "#1d4ed8", accent: "#d62828", accent2: "#ffd60a", pattern: "hero" }, { ...N, rarity: "epic" }),
    shirt("galaxy", "Galaktyka", 200, "\u{1F30C}", { color: "#1a1040", accent: "#b388ff", pattern: "galaxy" }, { ...N, rarity: "epic" }),
    shirt("gold-shirt", "Z\u0142ota zbroja", 500, "\u{1F3C6}", { color: "#e9b91c", accent: "#fff3b0", pattern: "gold" }, { ...N, rarity: "legendary" }),
    shirt("predator-shirt", "Koszulka Predator", 150, "\u{1F525}", { color: "#111111", accent: "#e63946", pattern: "predator" }, { ...N, rarity: "epic" }),
    // ---------- spodnie ----------
    pants("jeans", "D\u017Cinsy", 0, "\u{1F456}", { color: "#3d5a80", accent: "#98c1d9", pattern: "plain" }),
    pants("black-pants", "Czarne spodnie", 0, "\u{1F456}", { color: "#1f1f1f", accent: "#444444", pattern: "plain" }, N),
    pants("shorts-red", "Czerwone szorty", 20, "\u{1FA73}", { color: "#d62828", accent: "#ffffff", pattern: "plain", short: true }, N),
    pants("shorts-blue", "Niebieskie szorty", 20, "\u{1FA73}", { color: "#1d4ed8", accent: "#ffffff", pattern: "plain", short: true }, N),
    pants("tracksuit", "Dresy z lampasami", 40, "\u{1F3C3}", { color: "#1b1b1b", accent: "#ffffff", pattern: "sport" }, N),
    pants("pink-pants", "R\xF3\u017Cowe spodnie", 35, "\u{1FA77}", { color: "#ff8fc7", accent: "#ffffff", pattern: "plain" }, N),
    pants("overalls", "Ogrodniczki", 50, "\u{1F477}", { color: "#4361ee", accent: "#ffd60a", pattern: "overalls" }, N),
    pants("pajama", "Pi\u017Cama w gwiazdki", 45, "\u{1F319}", { color: "#3d348b", accent: "#ffd60a", pattern: "star" }, N),
    pants("camo-pants", "Moro", 55, "\u{1FA96}", { color: "#6b705c", accent: "#3a3f2e", accent2: "#a5a58d", pattern: "camo" }, N),
    pants("rainbow-pants", "T\u0119czowe", 100, "\u{1F308}", { color: "#ffffff", accent: "#ff4d6d", pattern: "rainbow" }, { ...N, rarity: "rare" }),
    pants("galaxy-pants", "Galaktyka", 180, "\u{1F30C}", { color: "#1a1040", accent: "#b388ff", pattern: "galaxy" }, { ...N, rarity: "epic" }),
    pants("gold-pants", "Z\u0142ote", 400, "\u{1F3C6}", { color: "#e9b91c", accent: "#fff3b0", pattern: "gold" }, { ...N, rarity: "legendary" }),
    // ---------- plecy ----------
    back("backpack", "Plecak", 30, "\u{1F392}", "#e76f51", N),
    back("teddy", "Misiek w plecaku", 60, "\u{1F9F8}", "#b5835a", { ...N, rarity: "rare" }),
    back("guitar", "Gitara", 80, "\u{1F3B8}", "#d62828", N),
    back("sword-back", "Miecz na plecach", 90, "\u{1F5E1}\uFE0F", "#c9d1d9", N),
    back("turtle", "Skorupa \u017C\xF3\u0142wia", 70, "\u{1F422}", "#2d6a4f", N),
    back("cape-red", "Czerwona peleryna", 80, "\u{1F9B8}", "#d62828", N),
    back("cape-purple", "Fioletowa peleryna", 80, "\u{1F7E3}", "#7b2cbf", N),
    back("wings-angel", "Skrzyd\u0142a anio\u0142a", 150, "\u{1FABD}", "#ffffff", { ...N, rarity: "epic" }),
    back("wings-bat", "Skrzyd\u0142a nietoperza", 150, "\u{1F987}", "#2b2b2b", { ...N, rarity: "epic" }),
    back("wings-butterfly", "Skrzyd\u0142a motyla", 170, "\u{1F98B}", "#ff70a6", { ...N, rarity: "epic" }),
    back("wings-dragon", "Skrzyd\u0142a smoka", 300, "\u{1F409}", "#2a9d8f", { ...N, rarity: "legendary" }),
    back("jetpack", "Plecak odrzutowy", 250, "\u{1F680}", "#9aa3ad", { ...N, rarity: "legendary" }),
    back("rainbow-wings", "T\u0119czowe skrzyd\u0142a", 400, "\u{1F308}", "#ff4d6d", { ...N, rarity: "legendary" }),
    back("predator-wings", "Skrzyd\u0142a Predatora", 0, "\u{1F525}", "#e63946", { offsale: true, rarity: "legendary" }),
    // ---------- szyja ----------
    neck("bowtie", "Muszka", 20, "\u{1F380}", "#d62828", N),
    neck("tie", "Krawat", 25, "\u{1F454}", "#1d3557", N),
    neck("scarf", "Szalik", 30, "\u{1F9E3}", "#e76f51", N),
    neck("necklace", "Z\u0142oty \u0142a\u0144cuch", 90, "\u{1F4FF}", "#ffc300", { ...N, rarity: "rare" }),
    neck("medal", "Medal mistrza", 120, "\u{1F947}", "#ffc300", { ...N, rarity: "epic" }),
    neck("bandana", "Chusta", 25, "\u{1F920}", "#c1121f", N),
    // ---------- limitowane (po wyprzedaniu tylko wymiana) ----------
    hat("ltd-icecrown", "Lodowa korona", 400, "\u2744\uFE0F", "#8fe3ff", { ...N, rarity: "legendary", limited: 100 }),
    hat("ltd-goldhorns", "Z\u0142ote rogi", 600, "\u{1F402}", "#ffc300", { ...N, rarity: "legendary", limited: 50 }),
    hat("ltd-galaxyhalo", "Galaktyczna aureola", 350, "\u{1FA90}", "#9d4edd", { ...N, rarity: "epic", limited: 150 }),
    back("ltd-firewings", "Ogniste skrzyd\u0142a", 900, "\u{1F525}", "#ff6b00", { ...N, rarity: "legendary", limited: 75 }),
    back("ltd-diamondwings", "Diamentowe skrzyd\u0142a", 1500, "\u{1F48E}", "#b9f2ff", { ...N, rarity: "legendary", limited: 25 }),
    // ---------- emotki (do menu 😀 w grze) ----------
    emote("flip", "Salto", 60, "\u{1F938}"),
    emote("spin", "B\u0105czek", 30, "\u{1F300}"),
    emote("clap", "Oklaski", 20, "\u{1F44F}"),
    emote("robotdance", "Taniec robota", 50, "\u{1F916}", { rarity: "rare" }),
    emote("floss", "Floss", 80, "\u{1F57A}", { rarity: "rare" }),
    emote("bow", "Uk\u0142on", 20, "\u{1F647}"),
    emote("jumpjacks", "Pajacyki", 35, "\u{1F93E}"),
    emote("zombie", "Zombie", 45, "\u{1F9DF}")
  ];
  var PAID_EMOTES = CATALOG.filter((i) => i.type === "emote").map((i) => i.id);
  var FREE_ITEMS = CATALOG.filter((i) => i.price === 0 && !i.offsale).map((i) => i.id);
  var DEFAULT_AVATAR = {
    head: "#f5cd30",
    torso: "#0d69ac",
    arms: "#f5cd30",
    legs: "#a4bd47",
    hat: "none",
    face: "smile",
    shirt: "none",
    pants: "none",
    back: "none",
    neck: "none"
  };

  // client/src/engine/face.ts
  function drawFace(ctx, face2) {
    const W2 = 128;
    ctx.clearRect(0, 0, W2, W2);
    ctx.fillStyle = "#111";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const eyes = (y = 50, r2 = 8) => {
      ctx.beginPath();
      ctx.ellipse(44, y, r2 * 0.75, r2, 0, 0, Math.PI * 2);
      ctx.ellipse(84, y, r2 * 0.75, r2, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const smile = (y = 70, r2 = 22) => {
      ctx.beginPath();
      ctx.arc(64, y, r2, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    };
    const line = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const heart = (x, y, s, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.9);
      ctx.bezierCurveTo(x - s * 1.3, y, x - s * 0.6, y - s * 0.9, x, y - s * 0.2);
      ctx.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s * 1.3, y, x, y + s * 0.9);
      ctx.fill();
      ctx.fillStyle = "#111";
    };
    const star = (x, y, r2, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 ? r2 * 0.45 : r2;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
      ctx.fillStyle = "#111";
    };
    const cheeks = () => {
      ctx.fillStyle = "rgba(255,100,120,.55)";
      ctx.beginPath();
      ctx.ellipse(30, 70, 10, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(98, 70, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
    };
    switch (face2) {
      case "grin":
        eyes();
        ctx.beginPath();
        ctx.moveTo(36, 74);
        ctx.quadraticCurveTo(64, 112, 92, 74);
        ctx.closePath();
        ctx.fill();
        break;
      case "cool":
        ctx.fillRect(28, 40, 72, 8);
        ctx.fillRect(30, 44, 30, 18);
        ctx.fillRect(68, 44, 30, 18);
        smile(72, 18);
        break;
      case "wow":
        eyes(48, 10);
        ctx.beginPath();
        ctx.ellipse(64, 88, 9, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "angry":
        eyes(56);
        line(32, 36, 54, 46);
        line(96, 36, 74, 46);
        ctx.beginPath();
        ctx.arc(64, 98, 18, 1.2 * Math.PI, 1.8 * Math.PI);
        ctx.stroke();
        break;
      case "wink":
        ctx.beginPath();
        ctx.ellipse(44, 50, 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        line(74, 52, 94, 52);
        smile();
        break;
      case "tongue":
        eyes();
        smile(66, 22);
        ctx.fillStyle = "#ff5c8a";
        ctx.beginPath();
        ctx.ellipse(70, 92, 9, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "blush":
        eyes();
        smile();
        cheeks();
        break;
      case "sad":
        eyes(52);
        ctx.beginPath();
        ctx.arc(64, 100, 18, 1.2 * Math.PI, 1.8 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = "#4cc9f0";
        ctx.beginPath();
        ctx.ellipse(36, 70, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "sleepy":
        line(34, 52, 54, 52);
        line(74, 52, 94, 52);
        ctx.beginPath();
        ctx.ellipse(64, 84, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "bold 22px sans-serif";
        ctx.fillText("z", 98, 30);
        ctx.font = "bold 16px sans-serif";
        ctx.fillText("z", 110, 16);
        break;
      case "laugh":
        line(32, 42, 52, 52);
        line(32, 62, 52, 52);
        line(96, 42, 76, 52);
        line(96, 62, 76, 52);
        ctx.beginPath();
        ctx.moveTo(36, 74);
        ctx.quadraticCurveTo(64, 112, 92, 74);
        ctx.closePath();
        ctx.fill();
        break;
      case "cat":
        eyes();
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(48, 76);
        ctx.quadraticCurveTo(56, 86, 64, 76);
        ctx.quadraticCurveTo(72, 86, 80, 76);
        ctx.stroke();
        ctx.lineWidth = 3;
        line(10, 66, 34, 70);
        line(10, 78, 34, 76);
        line(118, 66, 94, 70);
        line(118, 78, 94, 76);
        ctx.fillStyle = "#ff8fab";
        ctx.beginPath();
        ctx.moveTo(58, 66);
        ctx.lineTo(70, 66);
        ctx.lineTo(64, 73);
        ctx.fill();
        break;
      case "hearts":
        heart(44, 48, 14, "#ff2e63");
        heart(84, 48, 14, "#ff2e63");
        smile();
        break;
      case "stars":
        star(44, 48, 15, "#ffc300");
        star(84, 48, 15, "#ffc300");
        ctx.beginPath();
        ctx.moveTo(40, 72);
        ctx.quadraticCurveTo(64, 104, 88, 72);
        ctx.closePath();
        ctx.fill();
        break;
      case "dizzy":
        ctx.lineWidth = 4;
        for (const cx of [44, 84]) {
          ctx.beginPath();
          for (let a = 0; a < Math.PI * 5; a += 0.2) ctx.lineTo(cx + Math.cos(a) * a * 1.1, 50 + Math.sin(a) * a * 1.1);
          ctx.stroke();
        }
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(44, 86);
        ctx.bezierCurveTo(54, 76, 64, 96, 74, 86);
        ctx.stroke();
        break;
      case "nerd":
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(44, 50, 14, 0, Math.PI * 2);
        ctx.moveTo(98, 50);
        ctx.arc(84, 50, 14, 0, Math.PI * 2);
        ctx.stroke();
        line(58, 50, 70, 50);
        eyes(50, 5);
        smile(70, 20);
        ctx.fillStyle = "#fff";
        ctx.fillRect(56, 86, 7, 8);
        ctx.fillRect(65, 86, 7, 8);
        break;
      case "mustache":
        eyes();
        ctx.beginPath();
        ctx.moveTo(64, 74);
        ctx.bezierCurveTo(50, 64, 30, 72, 28, 84);
        ctx.bezierCurveTo(40, 80, 52, 84, 64, 80);
        ctx.bezierCurveTo(76, 84, 88, 80, 100, 84);
        ctx.bezierCurveTo(98, 72, 78, 64, 64, 74);
        ctx.fill();
        line(52, 98, 76, 98);
        break;
      case "vampire":
        eyes();
        line(32, 36, 54, 42);
        line(96, 36, 74, 42);
        smile(68, 22);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(50, 86);
        ctx.lineTo(56, 86);
        ctx.lineTo(53, 98);
        ctx.moveTo(72, 86);
        ctx.lineTo(78, 86);
        ctx.lineTo(75, 98);
        ctx.fill();
        break;
      case "pirateface":
        ctx.beginPath();
        ctx.ellipse(44, 50, 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(84, 50, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        line(20, 30, 108, 60);
        ctx.lineWidth = 7;
        smile();
        break;
      case "robot":
        ctx.fillStyle = "#3a86ff";
        ctx.fillRect(30, 40, 24, 18);
        ctx.fillRect(74, 40, 24, 18);
        ctx.fillStyle = "#111";
        ctx.fillRect(36, 80, 56, 12);
        ctx.fillStyle = "#9aa3ad";
        for (let x = 42; x < 90; x += 12) ctx.fillRect(x, 82, 4, 8);
        break;
      case "clown":
        eyes();
        ctx.fillStyle = "#e63946";
        ctx.beginPath();
        ctx.arc(64, 66, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e63946";
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(64, 72, 28, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.strokeStyle = "#111";
        break;
      default:
        eyes();
        smile();
    }
  }

  // client/src/apex/math.ts
  var mat4 = () => new Float32Array(16);
  function identity(o = mat4()) {
    o.fill(0);
    o[0] = o[5] = o[10] = o[15] = 1;
    return o;
  }
  function multiply(a, b, o = mat4()) {
    for (let c = 0; c < 4; c++)
      for (let r2 = 0; r2 < 4; r2++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r2] * b[c * 4 + k];
        o[c * 4 + r2] = s;
      }
    return o;
  }
  function perspective(fov, aspect, near, far, o = mat4()) {
    const f = 1 / Math.tan(fov / 2);
    o.fill(0);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) / (far - near);
    o[11] = 1;
    o[14] = -2 * far * near / (far - near);
    return o;
  }
  function ortho(l, r2, b, t, n, f, o = mat4()) {
    o.fill(0);
    o[0] = 2 / (r2 - l);
    o[5] = 2 / (t - b);
    o[10] = 2 / (f - n);
    o[12] = -(r2 + l) / (r2 - l);
    o[13] = -(t + b) / (t - b);
    o[14] = -(f + n) / (f - n);
    o[15] = 1;
    return o;
  }
  var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function lookAt(eye, target, up = [0, 1, 0], o = mat4()) {
    const z = norm(sub(target, eye));
    let x = cross(up, z);
    if (Math.hypot(x[0], x[1], x[2]) < 1e-6) x = [1, 0, 0];
    x = norm(x);
    const y = cross(z, x);
    o[0] = x[0];
    o[1] = y[0];
    o[2] = z[0];
    o[3] = 0;
    o[4] = x[1];
    o[5] = y[1];
    o[6] = z[1];
    o[7] = 0;
    o[8] = x[2];
    o[9] = y[2];
    o[10] = z[2];
    o[11] = 0;
    o[12] = -dot(x, eye);
    o[13] = -dot(y, eye);
    o[14] = -dot(z, eye);
    o[15] = 1;
    return o;
  }
  function invert(m, o = mat4()) {
    const a = m;
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
    const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
    const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return identity(o);
    det = 1 / det;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det;
    o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det;
    o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det;
    o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det;
    o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det;
    o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det;
    o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det;
    o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det;
    o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return o;
  }
  function mul3(a, b) {
    const o = new Array(9);
    for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 3; c++) o[r2 * 3 + c] = a[r2 * 3] * b[c] + a[r2 * 3 + 1] * b[3 + c] + a[r2 * 3 + 2] * b[6 + c];
    return o;
  }
  var rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
  var rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
  var rotZ = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];

  // client/src/apex/geometry.ts
  var Builder = class {
    v = [];
    i = [];
    /** dodaje wierzchołek, zwraca indeks */
    vert(p, n, u, w) {
      this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], u, w);
      return this.v.length / 8 - 1;
    }
    /** trójkąt skierowany na zewnątrz (zgodnie z uśrednioną normalną) - kolejność wierzchołków poprawiana automatycznie */
    tri(a, b, c) {
      const V = this.v;
      const P2 = (k) => [V[k * 8], V[k * 8 + 1], V[k * 8 + 2]];
      const N3 = (k) => [V[k * 8 + 3], V[k * 8 + 4], V[k * 8 + 5]];
      const pa = P2(a), pb = P2(b), pc = P2(c);
      const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const cr2 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const na = N3(a), nb = N3(b), nc = N3(c);
      const n = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
      if (cr2[0] * n[0] + cr2[1] * n[1] + cr2[2] * n[2] >= 0) this.i.push(a, b, c);
      else this.i.push(a, c, b);
    }
    quad(a, b, c, d) {
      this.tri(a, b, c);
      this.tri(a, c, d);
    }
    done() {
      return { verts: new Float32Array(this.v), index: new Uint16Array(this.i) };
    }
  };
  function boxMesh() {
    const b = new Builder();
    const faces = [
      // normalna, oś u, oś v
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]
    ];
    for (const [n, u, v] of faces) {
      const c = (su, sv) => [n[0] * 0.5 + u[0] * su * 0.5 + v[0] * sv * 0.5, n[1] * 0.5 + u[1] * su * 0.5 + v[1] * sv * 0.5, n[2] * 0.5 + u[2] * su * 0.5 + v[2] * sv * 0.5];
      const q = [b.vert(c(-1, -1), n, 0, 0), b.vert(c(1, -1), n, 1, 0), b.vert(c(1, 1), n, 1, 1), b.vert(c(-1, 1), n, 0, 1)];
      b.quad(q[0], q[1], q[2], q[3]);
    }
    return b.done();
  }
  function sphereMesh(seg = 20) {
    const b = new Builder();
    const rings = Math.ceil(seg / 2);
    for (let y = 0; y <= rings; y++) {
      const t = y / rings * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const p = x / seg * Math.PI * 2;
        const n = [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
        b.vert([n[0] * 0.5, n[1] * 0.5, n[2] * 0.5], n, x / seg, 1 - y / rings);
      }
    }
    for (let y = 0; y < rings; y++)
      for (let x = 0; x < seg; x++) {
        const a = y * (seg + 1) + x;
        const c = a + seg + 1;
        b.quad(a, a + 1, c + 1, c);
      }
    return b.done();
  }
  function cylinderMesh(seg = 24) {
    const b = new Builder();
    for (let x = 0; x <= seg; x++) {
      const p = x / seg * Math.PI * 2;
      const n = [Math.cos(p), 0, Math.sin(p)];
      b.vert([n[0] * 0.5, 0.5, n[2] * 0.5], n, x / seg, 1);
      b.vert([n[0] * 0.5, -0.5, n[2] * 0.5], n, x / seg, 0);
    }
    for (let x = 0; x < seg; x++) {
      const a = x * 2;
      b.quad(a, a + 1, a + 3, a + 2);
    }
    for (const y of [1, -1]) {
      const n = [0, y, 0];
      const c = b.vert([0, y * 0.5, 0], n, 0.5, 0.5);
      const ring = [];
      for (let x = 0; x <= seg; x++) {
        const p = x / seg * Math.PI * 2;
        ring.push(b.vert([Math.cos(p) * 0.5, y * 0.5, Math.sin(p) * 0.5], n, 0.5 + Math.cos(p) * 0.5, 0.5 + Math.sin(p) * 0.5));
      }
      for (let x = 0; x < seg; x++) b.tri(c, ring[x], ring[x + 1]);
    }
    return b.done();
  }
  function wedgeMesh() {
    const b = new Builder();
    const A = [-0.5, -0.5, -0.5], B2 = [0.5, -0.5, -0.5], C = [-0.5, -0.5, 0.5], D = [0.5, -0.5, 0.5], E = [-0.5, 0.5, 0.5], F = [0.5, 0.5, 0.5];
    const face2 = (pts, n) => {
      const ids = pts.map((p, k) => b.vert(p, n, k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 1));
      if (ids.length === 4) b.quad(ids[0], ids[1], ids[2], ids[3]);
      else b.tri(ids[0], ids[1], ids[2]);
    };
    face2([A, B2, D, C], [0, -1, 0]);
    face2([C, D, F, E], [0, 0, 1]);
    const sl = Math.SQRT1_2;
    face2([A, B2, F, E], [0, sl, -sl]);
    face2([B2, D, F], [1, 0, 0]);
    face2([A, C, E], [-1, 0, 0]);
    return b.done();
  }

  // client/src/apex/renderer.ts
  var STRIDE = 24;
  var MAT = { plastic: 0, neon: 1, metal: 2, glass: 3, water: 4, terrain: 5 };
  var colorCache = /* @__PURE__ */ new Map();
  function rgb(hex2) {
    let c = colorCache.get(hex2);
    if (!c) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex2);
      const n = m ? parseInt(m[1], 16) : 13421772;
      c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
      colorCache.set(hex2, c);
    }
    return c;
  }
  var VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 iM0;
layout(location=4) in vec4 iM1;
layout(location=5) in vec4 iM2;
layout(location=6) in vec4 iM3;
layout(location=7) in vec4 iCol;
layout(location=8) in vec4 iMisc;
uniform mat4 uVP;
uniform mat4 uLightVP;
out vec3 vN; out vec3 vW; out vec2 vUv; out vec4 vCol; out float vMat; out vec4 vL;
void main(){
  mat4 M = mat4(iM0,iM1,iM2,iM3);
  vec4 w = M * vec4(aPos,1.0);
  vec3 s = max(iMisc.xyz, vec3(1e-3));
  vN = mat3(M) * (aNrm / (s*s));
  vW = w.xyz; vUv = aUv; vCol = iCol; vMat = iMisc.w;
  // przesuni\u0119cie wzd\u0142u\u017C normalnej przy liczeniu cienia - mniej plam na \u015Bcianach ustawionych bokiem do s\u0142o\u0144ca
  vL = uLightVP * vec4(w.xyz + normalize(vN) * 0.4, 1.0);
  gl_Position = uVP * w;
}`;
  var FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec2 vUv; in vec4 vCol; in float vMat; in vec4 vL;
uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround;
uniform vec3 uFogCol; uniform vec2 uFog; uniform float uTime; uniform float uBevel; uniform float uShadowOn;
uniform sampler2DShadow uShadow; uniform float uShadowTexel;
out vec4 o;
float shadowAt(vec3 n){
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float ndl = max(dot(n,uSun),0.0);
  float bias = 0.0006 + 0.0022 * (1.0 - ndl);
  float s = 0.0;
  for (int x=-1;x<=1;x++) for (int y=-1;y<=1;y++)
    s += texture(uShadow, vec3(p.xy + vec2(float(x),float(y))*uShadowTexel, p.z - bias));
  return s / 9.0;
}
void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 base = vCol.rgb;
  float mat = vMat;
  float alpha = vCol.a;
  vec3 V = normalize(uCam - vW);
  vec3 col;
  if (mat > 0.5 && mat < 1.5) {
    col = base * 1.15;
  } else {
    float ndl = max(dot(n,uSun),0.0);
    float sh = shadowAt(n);
    vec3 amb = mix(uGround, uSky, n.y*0.5+0.5);
    vec3 lit = amb * 0.62 + uSunCol * ndl * sh * 0.78;
    if (mat > 3.5 && mat < 4.5) {
      float w1 = sin(vW.x*0.9 + uTime*1.3) + sin(vW.z*1.1 - uTime*1.1) + sin((vW.x+vW.z)*0.5 + uTime*0.7);
      base *= 0.92 + 0.08*w1;
      float fres = pow(1.0 - max(dot(n,V),0.0), 3.0);
      base = mix(base, uSky, fres*0.5);
      alpha = clamp(alpha + fres*0.25, 0.0, 0.92);
    }
    col = base * lit;
    if (uBevel > 0.5 && mat < 3.5) {
      vec2 e = min(vUv, 1.0 - vUv);
      float edge = smoothstep(0.0, 0.035, min(e.x,e.y));
      col *= mix(0.86, 1.0, edge);
    }
    vec3 H = normalize(uSun + V);
    float sp = (mat > 1.5 && mat < 2.5) ? 0.8 : (mat > 2.5 && mat < 3.5) ? 1.0 : 0.12;
    float pw = (mat > 1.5 && mat < 3.5) ? 90.0 : 28.0;
    col += uSunCol * pow(max(dot(n,H),0.0), pw) * sp * ndl * sh;
  }
  float d = length(uCam - vW);
  float f = clamp((d - uFog.x) / max(uFog.y - uFog.x, 1.0), 0.0, 1.0);
  o = vec4(mix(col, uFogCol, f*f), alpha);
}`;
  var DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=3) in vec4 iM0;
layout(location=4) in vec4 iM1;
layout(location=5) in vec4 iM2;
layout(location=6) in vec4 iM3;
uniform mat4 uVP;
void main(){ gl_Position = uVP * (mat4(iM0,iM1,iM2,iM3) * vec4(aPos,1.0)); }`;
  var DEPTH_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(1.0); }`;
  var SKY_VS = `#version 300 es
out vec2 vP;
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vP = p*2.0-1.0; gl_Position = vec4(vP, 1.0, 1.0); }`;
  var SKY_FS = `#version 300 es
precision highp float;
in vec2 vP; uniform mat4 uInvVP; uniform vec3 uCam; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot;
uniform vec3 uSun; uniform vec4 uSunDisc; uniform float uStars; uniform vec4 uClouds; uniform float uTime;
out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec4 w = uInvVP * vec4(vP, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w - uCam);
  float t = d.y;
  vec3 c = t > 0.0 ? mix(uHor, uTop, pow(t, 0.55)) : mix(uHor, uBot, pow(-t, 0.45));
  if (uStars > 0.5 && t > -0.05) {
    // ma\u0142e, migocz\u0105ce gwiazdy: w ka\u017Cdej kratce nieba najwy\u017Cej jedna, w losowym miejscu
    vec2 sp = d.xz / (abs(d.y) + 0.35) * 70.0;
    vec2 id = floor(sp), f = fract(sp) - 0.5;
    float r = h21(id);
    vec2 o = (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.6;
    float star = step(0.9, r) * smoothstep(0.075, 0.012, length(f - o)) * (0.55 + 0.45 * sin(uTime * 2.5 + r * 60.0));
    c += vec3(star) * smoothstep(0.0, 0.2, t) * (0.6 + 0.4 * h21(id + 1.7));
  }
  float sd = dot(d, uSun);
  if (uSunDisc.w > 0.5) {
    c += uSunDisc.rgb * (smoothstep(0.9975, 0.9992, sd) * 1.4 + pow(max(sd,0.0), 24.0) * 0.28);
  }
  if (uClouds.w > 0.5 && t > 0.02) {
    vec2 cp = d.xz / (t + 0.25) * 1.2 + vec2(uTime*0.012, 0.0);
    float n = vn(cp*2.0)*0.55 + vn(cp*4.3)*0.3 + vn(cp*9.0)*0.15;
    float a = smoothstep(0.52, 0.78, n) * uClouds.w * smoothstep(0.02, 0.25, t);
    c = mix(c, uClouds.rgb, a);
  }
  o = vec4(c, 1.0);
}`;
  var DECAL_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=2) in vec2 aUv;
uniform mat4 uVP; uniform mat4 uM; out vec2 vUv;
void main(){ vUv = aUv; gl_Position = uVP * uM * vec4(aPos,1.0); }`;
  var DECAL_FS = `#version 300 es
precision mediump float;
in vec2 vUv; uniform sampler2D uTex; uniform vec4 uTint; out vec4 o;
void main(){ vec4 c = texture(uTex, vec2(vUv.x, 1.0 - vUv.y)); if (c.a < 0.05) discard; o = c * uTint; }`;
  var Program = class {
    constructor(gl, vs, fs) {
      this.gl = gl;
      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Apex shader: " + gl.getShaderInfoLog(s));
        return s;
      };
      this.p = gl.createProgram();
      gl.attachShader(this.p, mk(gl.VERTEX_SHADER, vs));
      gl.attachShader(this.p, mk(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(this.p);
      if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error("Apex program: " + gl.getProgramInfoLog(this.p));
    }
    gl;
    p;
    u = /* @__PURE__ */ new Map();
    loc(n) {
      let l = this.u.get(n);
      if (l === void 0) this.u.set(n, l = this.gl.getUniformLocation(this.p, n));
      return l;
    }
  };
  var Batch = class {
    constructor(gl, mesh) {
      this.mesh = mesh;
      this.buf = gl.createBuffer();
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      mesh.bind(gl);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      const bytes = STRIDE * 4;
      for (let k = 0; k < 4; k++) {
        gl.enableVertexAttribArray(3 + k);
        gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, bytes, k * 16);
        gl.vertexAttribDivisor(3 + k, 1);
      }
      for (let k = 0; k < 2; k++) {
        gl.enableVertexAttribArray(7 + k);
        gl.vertexAttribPointer(7 + k, 4, gl.FLOAT, false, bytes, 64 + k * 16);
        gl.vertexAttribDivisor(7 + k, 1);
      }
      gl.bindVertexArray(null);
    }
    mesh;
    data = new Float32Array(STRIDE * 64);
    count = 0;
    dirty = true;
    buf;
    vao;
    cap = 0;
    grow() {
      if ((this.count + 1) * STRIDE <= this.data.length) return;
      const n = new Float32Array(this.data.length * 2);
      n.set(this.data);
      this.data = n;
    }
    add() {
      this.grow();
      this.dirty = true;
      return this.count++;
    }
    upload(gl) {
      if (!this.dirty) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      if (this.data.length > this.cap) {
        gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
        this.cap = this.data.length;
      } else gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * STRIDE);
      this.dirty = false;
    }
  };
  var GpuMesh = class {
    vb;
    ib;
    n;
    constructor(gl, m) {
      this.vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
      gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
      this.ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.index, gl.STATIC_DRAW);
      this.n = m.index.length;
    }
    bind(gl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    }
  };
  var ApexRenderer = class {
    constructor(canvas2) {
      this.canvas = canvas2;
      const gl = canvas2.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
      if (!gl) throw new Error("WebGL2 niedost\u0119pne");
      this.gl = gl;
      this.prog = new Program(gl, VS, FS);
      this.depthProg = new Program(gl, DEPTH_VS, DEPTH_FS);
      this.skyProg = new Program(gl, SKY_VS, SKY_FS);
      this.decalProg = new Program(gl, DECAL_VS, DECAL_FS);
      this.meshes.set("box", new GpuMesh(gl, boxMesh()));
      this.meshes.set("sphere", new GpuMesh(gl, sphereMesh()));
      this.meshes.set("cylinder", new GpuMesh(gl, cylinderMesh()));
      this.meshes.set("wedge", new GpuMesh(gl, wedgeMesh()));
      this.quad = this.meshes.get("box");
      this.shadowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      this.shadowFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.vertexAttrib4f(3, 1, 0, 0, 0);
      gl.vertexAttrib4f(4, 0, 1, 0, 0);
      gl.vertexAttrib4f(5, 0, 0, 1, 0);
      gl.vertexAttrib4f(6, 0, 0, 0, 1);
      gl.frontFace(gl.CW);
      gl.enable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
    }
    canvas;
    gl;
    prog;
    depthProg;
    skyProg;
    decalProg;
    meshes = /* @__PURE__ */ new Map();
    quad;
    /** stałe klocki świata (id -> miejsce w paczce) */
    statics = /* @__PURE__ */ new Map();
    staticBatches = /* @__PURE__ */ new Map();
    /** tymczasowe klocki rysowane co klatkę (awatary, narzędzia, cząstki) */
    frameBatches = /* @__PURE__ */ new Map();
    shadowTex;
    shadowFbo;
    shadowSize = 2048;
    shadows = true;
    terrain = null;
    water = null;
    vp = new Float32Array(16);
    invVp = new Float32Array(16);
    lightVp = new Float32Array(16);
    view = new Float32Array(16);
    proj = new Float32Array(16);
    width = 1;
    height = 1;
    time = 0;
    stats = { draws: 0, instances: 0, tris: 0, ms: 0 };
    // otoczenie
    sky = { top: [0.24, 0.56, 0.88], hor: [0.73, 0.88, 1], bot: [0.85, 0.92, 1], fog: [0.73, 0.88, 1], tint: [1, 1, 1], ground: [0.55, 0.55, 0.6], stars: 0, clouds: [1, 1, 1, 0], sunDisc: [1, 0.97, 0.8, 0], sunDir: norm3([0.4, 0.8, 0.35]) };
    brightness = 1;
    fogEnd = 700;
    fogStart = 250;
    shadowCenter = [0, 0, 0];
    /** połowa boku obszaru z cieniami (jednostki świata) */
    extent = 90;
    pending = [];
    // ---------- rozmiar ----------
    resize(cssW, cssH, scale) {
      const w = Math.max(1, Math.floor(cssW * scale));
      const h = Math.max(1, Math.floor(cssH * scale));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.width = w;
      this.height = h;
    }
    // ---------- klocki ----------
    batchFor(map, shape, transparent) {
      const key = shape + (transparent ? "|t" : "");
      let b = map.get(key);
      if (!b) map.set(key, b = new Batch(this.gl, this.meshes.get(shape)));
      return b;
    }
    /** zapisuje klocek w tablicy instancji */
    writePart(out, at, p, rot) {
      const a = at;
      out[a] = rot[0] * p.sx;
      out[a + 1] = rot[3] * p.sx;
      out[a + 2] = rot[6] * p.sx;
      out[a + 3] = 0;
      out[a + 4] = rot[1] * p.sy;
      out[a + 5] = rot[4] * p.sy;
      out[a + 6] = rot[7] * p.sy;
      out[a + 7] = 0;
      out[a + 8] = rot[2] * p.sz;
      out[a + 9] = rot[5] * p.sz;
      out[a + 10] = rot[8] * p.sz;
      out[a + 11] = 0;
      out[a + 12] = p.x;
      out[a + 13] = p.y;
      out[a + 14] = p.z;
      out[a + 15] = 1;
      const c = rgb(p.color);
      const glass = p.material === "glass";
      out[a + 16] = c[0];
      out[a + 17] = c[1];
      out[a + 18] = c[2];
      out[a + 19] = (1 - p.transparency) * (glass ? 0.45 : 1) * (p.kind === "water" ? 0.62 : 1);
      out[a + 20] = p.sx;
      out[a + 21] = p.sy;
      out[a + 22] = p.sz;
      out[a + 23] = p.kind === "water" ? MAT.water : MAT[p.material ?? "plastic"];
    }
    isTransparent(p) {
      return p.transparency > 1e-3 || p.material === "glass" || p.kind === "water";
    }
    addPart(p, rot) {
      this.removePart(p.id);
      if (p.transparency >= 0.999) return;
      const t = this.isTransparent(p);
      const batch = this.batchFor(this.staticBatches, p.shape, t);
      const index = batch.add();
      this.writePart(batch.data, index * STRIDE, p, rot);
      this.statics.set(p.id, { batch, index, key: p.shape + (t ? "|t" : "") });
    }
    updatePart(p, rot) {
      const s = this.statics.get(p.id);
      const t = this.isTransparent(p);
      if (!s || s.key !== p.shape + (t ? "|t" : "") || p.transparency >= 0.999) return this.addPart(p, rot);
      this.writePart(s.batch.data, s.index * STRIDE, p, rot);
      s.batch.dirty = true;
    }
    removePart(id) {
      const s = this.statics.get(id);
      if (!s) return;
      const b = s.batch;
      const last = b.count - 1;
      if (s.index !== last) {
        b.data.copyWithin(s.index * STRIDE, last * STRIDE, (last + 1) * STRIDE);
        for (const [oid, o] of this.statics) if (o.batch === b && o.index === last) {
          o.index = s.index;
          void oid;
          break;
        }
      }
      b.count--;
      b.dirty = true;
      this.statics.delete(id);
    }
    clearParts() {
      for (const b of this.staticBatches.values()) {
        b.count = 0;
        b.dirty = true;
      }
      this.statics.clear();
    }
    // ---------- klatkowe (awatary itp.) ----------
    /** klocek rysowany tylko w tej klatce */
    drawBox(shape, rot, pos, size, color, alpha = 1, material = MAT.plastic) {
      const t = alpha < 0.999 || material === MAT.glass;
      const b = this.batchFor(this.frameBatches, shape, t);
      const i = b.add();
      const o = b.data, a = i * STRIDE;
      o[a] = rot[0] * size[0];
      o[a + 1] = rot[3] * size[0];
      o[a + 2] = rot[6] * size[0];
      o[a + 3] = 0;
      o[a + 4] = rot[1] * size[1];
      o[a + 5] = rot[4] * size[1];
      o[a + 6] = rot[7] * size[1];
      o[a + 7] = 0;
      o[a + 8] = rot[2] * size[2];
      o[a + 9] = rot[5] * size[2];
      o[a + 10] = rot[8] * size[2];
      o[a + 11] = 0;
      o[a + 12] = pos[0];
      o[a + 13] = pos[1];
      o[a + 14] = pos[2];
      o[a + 15] = 1;
      o[a + 16] = color[0];
      o[a + 17] = color[1];
      o[a + 18] = color[2];
      o[a + 19] = alpha;
      o[a + 20] = size[0];
      o[a + 21] = size[1];
      o[a + 22] = size[2];
      o[a + 23] = material;
    }
    /** płaska naklejka z teksturą (twarz) - model 4x4 */
    decals = [];
    drawDecal(tex, rot, pos, w, h) {
      const m = new Float32Array(16);
      m[0] = rot[0] * w;
      m[1] = rot[3] * w;
      m[2] = rot[6] * w;
      m[4] = rot[1] * h;
      m[5] = rot[4] * h;
      m[6] = rot[7] * h;
      m[8] = rot[2] * 1e-3;
      m[9] = rot[5] * 1e-3;
      m[10] = rot[8] * 1e-3;
      m[12] = pos[0];
      m[13] = pos[1];
      m[14] = pos[2];
      m[15] = 1;
      this.decals.push({ tex, m });
    }
    /** tekstura z płótna (np. twarz awatara) */
    makeTexture(canvas2) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    }
    deleteTexture(t) {
      this.gl.deleteTexture(t);
    }
    // ---------- teren i woda ----------
    setTerrain(g) {
      const gl = this.gl;
      if (this.terrain) gl.deleteVertexArray(this.terrain.vao);
      if (this.water) gl.deleteVertexArray(this.water.vao);
      this.terrain = this.water = null;
      if (!g) return;
      const n = g.n;
      const pos = [];
      const col = [];
      const idx = [];
      const normalAt = (i, j) => {
        const hl = g.hAt(Math.max(0, i - 1), j), hr = g.hAt(Math.min(n, i + 1), j);
        const hd = g.hAt(i, Math.max(0, j - 1)), hu = g.hAt(i, Math.min(n, j + 1));
        const nx = (hl - hr) / (2 * g.cell), nz = (hd - hu) / (2 * g.cell);
        const l = Math.hypot(nx, 1, nz);
        return [nx / l, 1 / l, nz / l];
      };
      let v = 0;
      const vertex = (i, j, c, flag) => {
        const nr = normalAt(i, j);
        pos.push(g.x0 + i * g.cell, g.hAt(i, j), g.z0 + j * g.cell, nr[0], nr[1], nr[2], 0, 0);
        col.push(c[0], c[1], c[2], 1, 1, 1, 1, flag);
        return v++;
      };
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const mid = g.m[j * n + i];
          const mat = TERRAIN_MATERIALS[mid] ?? TERRAIN_MATERIALS[0];
          const hsh = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
          const k = 0.94 + (hsh - Math.floor(hsh)) * 0.12;
          const c = [mat.color[0] * k, mat.color[1] * k, mat.color[2] * k];
          const flag = mid === 5 ? 1 : 5;
          const a = vertex(i, j, c, flag), b = vertex(i + 1, j, c, flag), d = vertex(i + 1, j + 1, c, flag), e = vertex(i, j + 1, c, flag);
          idx.push(a, d, b, a, e, d);
        }
      this.terrain = this.buildVao(pos, col, idx);
      const wp = [];
      const wc = [];
      const wi = [];
      let wv = 0;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const lv = g.w[j * n + i];
          if (Number.isNaN(lv)) continue;
          const x0 = g.x0 + i * g.cell, z0 = g.z0 + j * g.cell, x1 = x0 + g.cell, z1 = z0 + g.cell;
          for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
            wp.push(x, lv, z, 0, 1, 0, 0, 0);
            wc.push(0.16, 0.46, 0.78, 0.62, 1, 1, 1, MAT.water);
          }
          wi.push(wv, wv + 2, wv + 1, wv, wv + 3, wv + 2);
          wv += 4;
        }
      if (wi.length) this.water = this.buildVao(wp, wc, wi);
    }
    /** siatka z kolorem na wierzchołek (atrybuty 7 i 8 nie są instancjonowane) */
    buildVao(pos, col, idx) {
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
      for (const [l, size, off] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]]) {
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, 32, off);
      }
      const cb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STATIC_DRAW);
      for (const [l, off] of [[7, 0], [8, 16]]) {
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 32, off);
      }
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      const big = pos.length / 8 > 65535;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, n: idx.length, big };
    }
    // ---------- niebo i światło ----------
    setSky(color, def) {
      const s = this.sky;
      if (def) {
        s.top = rgb(def.top);
        s.hor = rgb(def.horizon);
        s.bot = rgb(def.bottom);
        s.fog = rgb(def.fog);
        s.tint = rgb(def.tint);
        s.ground = rgb(def.ground);
        s.stars = def.stars ? 1 : 0;
        const cl = def.clouds ? [...rgb(def.clouds.color), def.clouds.alpha] : [1, 1, 1, 0];
        s.clouds = cl;
        if (def.sun) {
          const el = Math.max(0.05, def.sun.height) * (Math.PI / 2) * 1.4;
          s.sunDir = norm3([Math.cos(el) * 0.6, Math.sin(el), Math.cos(el) * 0.8]);
          s.sunDisc = [...rgb(def.sun.color), 1];
        } else {
          s.sunDir = norm3([0.3, 0.75, 0.4]);
          s.sunDisc = [1, 1, 1, def.moon ? 1 : 0];
          if (def.moon) s.sunDir = norm3([-0.35, 0.6, 0.5]);
        }
        this.skyLight = def.light;
      } else {
        const c = rgb(color);
        s.top = s.hor = s.bot = s.fog = c;
        s.tint = [1, 1, 1];
        s.ground = [0.55, 0.55, 0.6];
        s.stars = 0;
        s.clouds = [1, 1, 1, 0];
        s.sunDisc = [1, 1, 1, 0];
        s.sunDir = norm3([0.4, 0.8, 0.35]);
        this.skyLight = 1;
      }
    }
    skyLight = 1;
    setLight(brightness, fog) {
      this.brightness = brightness;
      if (fog > 0) {
        this.fogStart = fog * 0.25;
        this.fogEnd = fog;
      } else {
        this.fogStart = 250;
        this.fogEnd = 700;
      }
    }
    /** środek obszaru z cieniami (zwykle gracz) */
    followShadows(p) {
      this.shadowCenter = p;
    }
    // ---------- rysowanie ----------
    /** punkt świata -> piksele CSS ekranu (null gdy za kamerą) */
    project(p, cssW, cssH) {
      const m = this.vp;
      const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
      const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      if (w <= 0.05) return null;
      return [(x / w * 0.5 + 0.5) * cssW, (1 - (y / w * 0.5 + 0.5)) * cssH];
    }
    /** promień ze współrzędnych ekranu (0..1) */
    ray(nx, ny, eye) {
      const m = this.invVp;
      const cx = nx * 2 - 1, cy = 1 - ny * 2;
      const x = m[0] * cx + m[4] * cy + m[8] + m[12];
      const y = m[1] * cx + m[5] * cy + m[9] + m[13];
      const z = m[2] * cx + m[6] * cy + m[10] + m[14];
      const w = m[3] * cx + m[7] * cy + m[11] + m[15];
      return norm3([x / w - eye[0], y / w - eye[1], z / w - eye[2]]);
    }
    render(look) {
      const t0 = performance.now();
      const gl = this.gl;
      this.stats = { draws: 0, instances: 0, tris: 0, ms: 0 };
      perspective(look.fov, this.width / this.height, look.near ?? 0.2, look.far ?? 2e3, this.proj);
      lookAt(look.eye, look.target, [0, 1, 0], this.view);
      multiply(this.proj, this.view, this.vp);
      invert(this.vp, this.invVp);
      const sky = this.sky;
      const light = this.brightness * this.skyLight;
      const sun = sky.sunDir;
      const c = this.shadowCenter;
      const ext = this.extent;
      const texel = ext * 2 / this.shadowSize;
      const eyeL = [c[0] + sun[0] * 160, c[1] + sun[1] * 160, c[2] + sun[2] * 160];
      lookAt(eyeL, c, Math.abs(sun[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0], this.view);
      const lv = new Float32Array(this.view);
      const sx = Math.round(lv[12] / texel) * texel - lv[12];
      const sy = Math.round(lv[13] / texel) * texel - lv[13];
      lv[12] += sx;
      lv[13] += sy;
      multiply(ortho(-ext, ext, -ext, ext, 1, 360), lv, this.lightVp);
      lookAt(look.eye, look.target, [0, 1, 0], this.view);
      for (const b of this.staticBatches.values()) b.upload(gl);
      for (const b of this.frameBatches.values()) b.upload(gl);
      if (this.shadows && light > 0.1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
        gl.viewport(0, 0, this.shadowSize, this.shadowSize);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.depthProg.p);
        gl.uniformMatrix4fv(this.depthProg.loc("uVP"), false, this.lightVp);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.5, 4);
        this.drawBatches(this.staticBatches, false);
        this.drawBatches(this.frameBatches, false);
        if (this.terrain) this.drawTerrain(this.terrain);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.viewport(0, 0, this.width, this.height);
      const fc = sky.fog;
      gl.clearColor(fc[0], fc[1], fc[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      const sp = this.skyProg;
      gl.useProgram(sp.p);
      gl.uniformMatrix4fv(sp.loc("uInvVP"), false, this.invVp);
      gl.uniform3fv(sp.loc("uCam"), look.eye);
      gl.uniform3fv(sp.loc("uTop"), sky.top);
      gl.uniform3fv(sp.loc("uHor"), sky.hor);
      gl.uniform3fv(sp.loc("uBot"), sky.bot);
      gl.uniform3fv(sp.loc("uSun"), sun);
      gl.uniform4fv(sp.loc("uSunDisc"), sky.sunDisc);
      gl.uniform1f(sp.loc("uStars"), sky.stars);
      gl.uniform4fv(sp.loc("uClouds"), sky.clouds);
      gl.uniform1f(sp.loc("uTime"), this.time);
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      const p = this.prog;
      gl.useProgram(p.p);
      gl.uniformMatrix4fv(p.loc("uVP"), false, this.vp);
      gl.uniformMatrix4fv(p.loc("uLightVP"), false, this.lightVp);
      gl.uniform3fv(p.loc("uCam"), look.eye);
      gl.uniform3fv(p.loc("uSun"), sun);
      const sc = sky.tint;
      gl.uniform3f(p.loc("uSunCol"), sc[0] * light, sc[1] * light, sc[2] * light);
      gl.uniform3f(p.loc("uSky"), sc[0] * light, sc[1] * light, sc[2] * light);
      gl.uniform3f(p.loc("uGround"), sky.ground[0] * light, sky.ground[1] * light, sky.ground[2] * light);
      gl.uniform3fv(p.loc("uFogCol"), sky.fog);
      gl.uniform2f(p.loc("uFog"), this.fogStart, this.fogEnd);
      gl.uniform1f(p.loc("uTime"), this.time);
      gl.uniform1f(p.loc("uShadowOn"), this.shadows && light > 0.1 ? 1 : 0);
      gl.uniform1f(p.loc("uShadowTexel"), 1 / this.shadowSize);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.uniform1i(p.loc("uShadow"), 0);
      gl.uniform1f(p.loc("uBevel"), 0);
      if (this.terrain) this.drawTerrain(this.terrain);
      this.drawBatches(this.staticBatches, false, p);
      this.drawBatches(this.frameBatches, false, p);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.uniform1f(p.loc("uBevel"), 0);
      if (this.water) this.drawTerrain(this.water);
      this.drawBatches(this.staticBatches, true, p);
      this.drawBatches(this.frameBatches, true, p);
      if (this.decals.length) {
        const dp = this.decalProg;
        gl.useProgram(dp.p);
        gl.uniformMatrix4fv(dp.loc("uVP"), false, this.vp);
        gl.uniform4f(dp.loc("uTint"), 1, 1, 1, 1);
        gl.uniform1i(dp.loc("uTex"), 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindVertexArray(this.quadVao());
        for (const d of this.decals) {
          gl.bindTexture(gl.TEXTURE_2D, d.tex);
          gl.uniformMatrix4fv(dp.loc("uM"), false, d.m);
          gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, this.quadIndexOffset);
          this.stats.draws++;
        }
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(null);
      for (const b of this.frameBatches.values()) b.count = 0;
      this.decals.length = 0;
      this.stats.ms = performance.now() - t0;
      void this.pending;
    }
    quadVaoCache = null;
    quadIndexOffset = 0;
    /** pojedynczy kwadrat (przednia ściana pudełka +z) dla naklejek */
    quadVao() {
      if (this.quadVaoCache) return this.quadVaoCache;
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0, 0, 0, -1, 0, 0, 0.5, -0.5, 0, 0, 0, -1, 1, 0, 0.5, 0.5, 0, 0, 0, -1, 1, 1, -0.5, 0.5, 0, 0, 0, -1, 0, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return this.quadVaoCache = vao;
    }
    drawTerrain(t) {
      const gl = this.gl;
      gl.bindVertexArray(t.vao);
      gl.drawElements(gl.TRIANGLES, t.n, t.big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      this.stats.draws++;
      this.stats.tris += t.n / 3;
    }
    drawBatches(map, transparent, p) {
      const gl = this.gl;
      for (const [key, b] of map) {
        if (!b.count || key.endsWith("|t") !== transparent) continue;
        if (transparent && !p) continue;
        if (p) gl.uniform1f(p.loc("uBevel"), key.startsWith("box") || key.startsWith("wedge") ? 1 : 0);
        gl.bindVertexArray(b.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, b.mesh.n, gl.UNSIGNED_SHORT, 0, b.count);
        this.stats.draws++;
        this.stats.instances += b.count;
        this.stats.tris += b.mesh.n / 3 * b.count;
      }
    }
    dispose() {
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
  function norm3(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  // client/src/apex/avatar.ts
  var ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  var ApexAvatar = class {
    constructor(r2, avatar) {
      this.r = r2;
      this.setLook(avatar);
    }
    r;
    x = 0;
    y = 0;
    z = 0;
    ry = 0;
    anim = "idle";
    /** skala całej postaci (postacie ze Studia) */
    scale = 1;
    visible = true;
    t = Math.random() * 10;
    look;
    colors = { head: [1, 1, 1], torso: [1, 1, 1], arms: [1, 1, 1], legs: [1, 1, 1] };
    face = null;
    flashUntil = 0;
    limbs = {
      la: { x: 1.5, y: 4, rx: 0, rz: 0 },
      ra: { x: -1.5, y: 4, rx: 0, rz: 0 },
      ll: { x: 0.5, y: 2, rx: 0, rz: 0 },
      rl: { x: -0.5, y: 2, rx: 0, rz: 0 }
    };
    bodyY = 0;
    bodyRot = 0;
    bodyRx = 0;
    actionT = 0;
    action = null;
    setLook(a) {
      this.look = a;
      this.colors = { head: rgb(a.head), torso: rgb(a.torso), arms: rgb(a.arms), legs: rgb(a.legs) };
      if (this.face) this.r.deleteTexture(this.face);
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      drawFace(c.getContext("2d"), a.face);
      this.face = this.r.makeTexture(c);
    }
    get avatar() {
      return this.look;
    }
    flash() {
      this.flashUntil = performance.now() + 140;
    }
    playAction(type) {
      this.action = type;
      this.actionT = 0;
    }
    /** punkt nad głową do nazwy gracza */
    headPoint() {
      return [this.x, this.y + 6.1 * this.scale, this.z];
    }
    dispose() {
      if (this.face) this.r.deleteTexture(this.face);
      this.face = null;
    }
    update(dt) {
      this.t += dt;
      const L = this.limbs;
      const ease = (l, rx, rz = 0, k = 14) => {
        const f = Math.min(1, dt * k);
        l.rx += (rx - l.rx) * f;
        l.rz += (rz - l.rz) * f;
      };
      let by = 0, brot = 0, brx = 0;
      const a = this.anim;
      const t = this.t;
      if (a === "walk") {
        const s = Math.sin(t * 10) * 0.9;
        ease(L.la, s, 0, 20);
        ease(L.ra, -s, 0, 20);
        ease(L.ll, -s, 0, 20);
        ease(L.rl, s, 0, 20);
      } else if (a === "jump" || a === "fall") {
        ease(L.la, Math.PI * 0.9, 0.15);
        ease(L.ra, Math.PI * 0.9, -0.15);
        ease(L.ll, a === "jump" ? -0.3 : 0.2);
        ease(L.rl, a === "jump" ? 0.3 : -0.2);
      } else if (a === "swim" || a === "tread") {
        const w = Math.sin(t * 7);
        ease(L.la, Math.PI + w * 1.2);
        ease(L.ra, Math.PI - w * 1.2);
        ease(L.ll, Math.sin(t * 14) * 0.35, 0, 30);
        ease(L.rl, -Math.sin(t * 14) * 0.35, 0, 30);
        if (a === "swim") brx = -1.2;
        by = a === "swim" ? 1.2 : 0;
      } else if (a === "dead") {
        ease(L.la, 0.4);
        ease(L.ra, -0.4);
        ease(L.ll, 0);
        ease(L.rl, 0);
        brx = -Math.PI / 2;
      } else if (a === "seated" || a === "sit") {
        ease(L.la, -0.5);
        ease(L.ra, -0.5);
        ease(L.ll, -Math.PI / 2);
        ease(L.rl, -Math.PI / 2);
        by = -1.2;
      } else if (a === "wave") {
        ease(L.la, Math.PI * 0.95, 0.35 + Math.sin(t * 9) * 0.35);
        ease(L.ra, 0);
        ease(L.ll, 0);
        ease(L.rl, 0);
      } else if (a === "dance" || a === "robotdance" || a === "floss" || a === "jumpjacks") {
        const s = Math.sin(t * 9);
        ease(L.la, Math.PI * 0.8 + s * 0.5);
        ease(L.ra, Math.PI * 0.8 - s * 0.5);
        ease(L.ll, s * 0.5);
        ease(L.rl, -s * 0.5);
        by = Math.abs(s) * 0.4;
        brot = Math.sin(t * 4.5) * 0.4;
      } else if (a === "cheer" || a === "clap") {
        const s = Math.sin(t * 12);
        ease(L.la, Math.PI * 0.95 + s * 0.2);
        ease(L.ra, Math.PI * 0.95 - s * 0.2);
        ease(L.ll, 0);
        ease(L.rl, 0);
        by = Math.abs(s) * 0.3;
      } else if (a === "point") {
        ease(L.la, 0);
        ease(L.ra, Math.PI / 2);
        ease(L.ll, 0);
        ease(L.rl, 0);
      } else {
        const b = Math.sin(t * 2) * 0.05;
        ease(L.la, b, 0, 8);
        ease(L.ra, -b, 0, 8);
        ease(L.ll, 0);
        ease(L.rl, 0);
        L.la.rz += (0 - L.la.rz) * Math.min(1, dt * 10);
        L.ra.rz += (0 - L.ra.rz) * Math.min(1, dt * 10);
      }
      if (this.action) {
        this.actionT += dt;
        const dur = this.action === "swing" ? 0.35 : this.action === "shoot" ? 0.18 : 0.6;
        const p = Math.min(1, this.actionT / dur);
        if (this.action === "swing") {
          L.ra.rx = Math.PI * 0.6 - Math.sin(p * Math.PI) * 1.8;
          brot -= Math.sin(p * Math.PI) * 0.35;
        } else L.ra.rx = Math.PI / 2;
        if (p >= 1) this.action = null;
      }
      this.bodyY += (by - this.bodyY) * Math.min(1, dt * 12);
      this.bodyRot += (brot - this.bodyRot) * Math.min(1, dt * 12);
      this.bodyRx += (brx - this.bodyRx) * Math.min(1, dt * 10);
    }
    draw() {
      if (!this.visible) return;
      const r2 = this.r;
      const s = this.scale;
      const flash = performance.now() < this.flashUntil;
      const tint = (c2) => flash ? [Math.min(1, c2[0] + 0.5), c2[1] * 0.5, c2[2] * 0.5] : c2;
      const root = mul3(rotY(this.ry + this.bodyRot), rotX(this.bodyRx));
      const place = (lx, ly, lz) => {
        const p = [lx * s, (ly + this.bodyY) * s, lz * s];
        return [this.x + root[0] * p[0] + root[1] * p[1] + root[2] * p[2], this.y + root[3] * p[0] + root[4] * p[1] + root[5] * p[2], this.z + root[6] * p[0] + root[7] * p[1] + root[8] * p[2]];
      };
      const c = this.colors;
      r2.drawBox("box", root, place(0, 3, 0), [2 * s, 2 * s, s], tint(c.torso));
      r2.drawBox("box", root, place(0, 4.6, 0), [1.2 * s, 1.2 * s, 1.2 * s], tint(c.head));
      if (this.face) r2.drawDecal(this.face, root, place(0, 4.6, -0.61), 1.1 * s, 1.1 * s);
      for (const [k, col] of [["la", c.arms], ["ra", c.arms], ["ll", c.legs], ["rl", c.legs]]) {
        const l = this.limbs[k];
        const lr = mul3(rotX(l.rx), rotZ(l.rz));
        const rot = mul3(root, lr);
        const off = [lr[1] * -1, lr[4] * -1, lr[7] * -1];
        r2.drawBox("box", rot, place(l.x + off[0], l.y + off[1], off[2]), [s, 2 * s, s], tint(col));
      }
      void ID3;
    }
  };

  // branding/apex/trailer/harness.ts
  var FPS = 30;
  var DURATION = 53;
  var W = 1920;
  var H = 1080;
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = seed + 1831565813 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var R = rng(7);
  Math.random = rng(1234);
  var clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  var ss = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  var lerp = (a, b, t) => a + (b - a) * t;
  var hex = (s) => {
    const n = parseInt(s.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  var toHex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  var mixHex = (a, b, t) => {
    const x = hex(a), y = hex(b);
    return toHex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
  };
  var N2 = 128;
  var CELL2 = 4;
  var grid = new TerrainGrid(N2, CELL2, 0, 0);
  var PEAK = { x: -150, z: -150 };
  var VILLAGE = { x: -20, z: 40 };
  var LAKE = { x: 115, z: 70 };
  var PLATEAU = 8;
  function baseHeight(x, z) {
    const hills = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.027) * 7 + Math.sin((x + z) * 0.045) * 3.2 + Math.sin(x * 0.07) * Math.sin(z * 0.06) * 1.8;
    const edge = Math.max(0, Math.hypot(x, z) - 190) * 0.55;
    const dPeak = Math.hypot(x - PEAK.x, z - PEAK.z);
    const mountain = 112 * Math.exp(-((dPeak / 62) ** 2)) + 20 * Math.exp(-((dPeak / 110) ** 2));
    const dLake = Math.hypot(x - LAKE.x, z - LAKE.z);
    const lake = -17 * Math.exp(-((dLake / 52) ** 2));
    return 9 + hills + edge + mountain + lake;
  }
  function terrainHeight(x, z) {
    const h = baseHeight(x, z);
    const d = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    const k = ss(46, 78, d);
    return lerp(PLATEAU, h, k);
  }
  for (let j = 0; j <= N2; j++) for (let i = 0; i <= N2; i++) grid.h[j * (N2 + 1) + i] = terrainHeight(grid.x0 + i * CELL2, grid.z0 + j * CELL2);
  for (let j = 0; j < N2; j++)
    for (let i = 0; i < N2; i++) {
      const h = (grid.hAt(i, j) + grid.hAt(i + 1, j) + grid.hAt(i, j + 1) + grid.hAt(i + 1, j + 1)) / 4;
      const x = grid.x0 + (i + 0.5) * CELL2, z = grid.z0 + (j + 0.5) * CELL2;
      const slope = Math.max(Math.abs(grid.hAt(i + 1, j) - grid.hAt(i, j)), Math.abs(grid.hAt(i, j + 1) - grid.hAt(i, j))) / CELL2;
      let m = 0;
      if (h < 4.4) m = 1;
      else if (h > 78) m = 3;
      else if (h > 52 || slope > 1.1) m = 2;
      if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 50 && h < 20) m = Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 26 ? 4 : 0;
      grid.m[j * N2 + i] = m;
      if (h < 3.1) grid.w[j * N2 + i] = 3;
    }
  var parts = [];
  var pid = 0;
  function P(o) {
    const p = { id: "p" + pid++, name: "p", shape: "box", kind: "normal", x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, ry: 0, color: "#cccccc", transparency: 0, collide: true, ...o };
    parts.push(p);
    return p;
  }
  var GY = PLATEAU;
  P({ x: VILLAGE.x, y: GY + 0.1, z: VILLAGE.z, sx: 44, sy: 0.2, sz: 44, color: "#d9d4c7" });
  P({ x: VILLAGE.x, y: GY + 0.22, z: VILLAGE.z, sx: 16, sy: 0.05, sz: 16, color: "#c9c2b0", shape: "cylinder", collide: false });
  var houseColors = ["#e8d5b7", "#c9a27e", "#b7c9d8", "#d8b7c6", "#e0e0d0", "#a9c9a4"];
  var roofColors = ["#a8412b", "#8c3a3a", "#3d5a80", "#6b4423", "#7d3c98", "#2f6b4f"];
  var house = (x, z, w, d, h, i, ry = 0) => {
    const c = Math.cos(ry * Math.PI / 180), s = Math.sin(ry * Math.PI / 180);
    const at = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    P({ x, y: GY + 0.2 + h / 2, z, sx: w, sy: h, sz: d, ry, color: houseColors[i % 6] });
    const rh = h * 0.55;
    const a = at(0, -d / 4), b = at(0, d / 4);
    P({ shape: "wedge", x: a.x, y: GY + 0.2 + h + rh / 2, z: a.z, sx: w + 1.2, sy: rh, sz: d / 2 + 0.6, ry, color: roofColors[i % 6] });
    P({ shape: "wedge", x: b.x, y: GY + 0.2 + h + rh / 2, z: b.z, sx: w + 1.2, sy: rh, sz: d / 2 + 0.6, ry: ry + 180, color: roofColors[i % 6] });
    const door = at(0, -d / 2 - 0.05);
    P({ x: door.x, y: GY + 0.2 + 2, z: door.z, sx: 2.2, sy: 4, sz: 0.3, ry, color: "#5a3a22", collide: false });
    for (const wx of [-w / 3, w / 3]) {
      const wp = at(wx, -d / 2 - 0.05);
      P({ x: wp.x, y: GY + 0.2 + h * 0.62, z: wp.z, sx: 2.4, sy: 2.4, sz: 0.3, ry, color: "#ffd98a", material: "neon", collide: false });
    }
  };
  house(VILLAGE.x - 30, VILLAGE.z + 14, 12, 10, 8, 0, 90);
  house(VILLAGE.x - 32, VILLAGE.z - 8, 11, 10, 7, 1, 90);
  house(VILLAGE.x + 30, VILLAGE.z + 16, 12, 10, 9, 2, -90);
  house(VILLAGE.x - 12, VILLAGE.z + 34, 14, 10, 8, 3, 180);
  house(VILLAGE.x + 14, VILLAGE.z + 34, 12, 10, 7, 4, 180);
  house(VILLAGE.x - 8, VILLAGE.z - 32, 12, 10, 8, 5, 0);
  P({ x: VILLAGE.x + 34, y: GY + 0.2 + 13, z: VILLAGE.z - 16, sx: 12, sy: 26, sz: 12, color: "#6fb8ff", material: "glass", transparency: 0.1 });
  P({ x: VILLAGE.x + 34, y: GY + 0.2 + 13, z: VILLAGE.z - 16, sx: 5, sy: 26.4, sz: 5, color: "#223344", collide: false });
  P({ x: VILLAGE.x + 34, y: GY + 29, z: VILLAGE.z - 16, sx: 12.4, sy: 1.4, sz: 12.4, color: "#ff8a1f", material: "neon", collide: false });
  P({ x: VILLAGE.x + 40.4, y: GY + 12, z: VILLAGE.z - 16, sx: 0.5, sy: 20, sz: 0.8, color: "#00e5ff", material: "neon", collide: false });
  var lamps = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const x = VILLAGE.x + Math.cos(a) * 18, z = VILLAGE.z + Math.sin(a) * 18;
    P({ shape: "cylinder", x, y: GY + 0.2 + 3, z, sx: 0.5, sy: 6, sz: 0.5, color: "#2b2f36" });
    lamps.push(P({ shape: "sphere", x, y: GY + 0.2 + 6.4, z, sx: 1.6, sy: 1.6, sz: 1.6, color: "#ffd27a", material: "neon", collide: false }));
  }
  var trees = [];
  for (let k = 0; k < 90; k++) {
    const a = R() * Math.PI * 2, r2 = 55 + R() * 120;
    const x = VILLAGE.x + Math.cos(a) * r2, z = VILLAGE.z + Math.sin(a) * r2;
    if (Math.abs(x) > 230 || Math.abs(z) > 230) continue;
    const g = terrainHeight(x, z);
    if (g < 4.8 || g > 50 || Math.hypot(x - PEAK.x, z - PEAK.z) < 70) continue;
    trees.push([x, z]);
    const s = 0.8 + R() * 0.8;
    P({ shape: "cylinder", x, y: g + 2 * s, z, sx: 1.1 * s, sy: 4 * s, sz: 1.1 * s, color: "#6b4a2b", collide: false });
    const gc = ["#3f8f3c", "#4aa044", "#2f7a35"][k % 3];
    P({ shape: "sphere", x, y: g + 5.6 * s, z, sx: 5.4 * s, sy: 5 * s, sz: 5.4 * s, color: gc, collide: false });
    P({ shape: "sphere", x: x + 0.4 * s, y: g + 8 * s, z, sx: 3.6 * s, sy: 3.4 * s, sz: 3.6 * s, color: gc, collide: false });
  }
  var PG = { x: VILLAGE.x + 6, z: VILLAGE.z + 4 };
  P({ shape: "wedge", x: PG.x, y: GY + 0.2 + 3.5, z: PG.z - 6, sx: 12, sy: 7, sz: 14, color: "#ff6b4a", ry: 0 });
  P({ x: PG.x - 10, y: GY + 0.2 + 3, z: PG.z + 6, sx: 2, sy: 6, sz: 12, color: "#7c4dff" });
  P({ x: PG.x + 10, y: GY + 0.2 + 2, z: PG.z + 10, sx: 2, sy: 4, sz: 14, color: "#00bfa5" });
  P({ shape: "wedge", x: PG.x + 2, y: GY + 0.2 + 1.5, z: PG.z + 12, sx: 10, sy: 3, sz: 8, color: "#ffc400" });
  var peakH = terrainHeight(PEAK.x, PEAK.z);
  var summit = P({ x: PEAK.x, y: peakH + 3, z: PEAK.z, sx: 6, sy: 6, sz: 6, color: "#ffd27a", material: "neon", collide: false });
  var pole = P({ x: PEAK.x, y: peakH + 14, z: PEAK.z, sx: 0.5, sy: 20, sz: 0.5, color: "#ffffff", material: "neon", collide: false });
  var cw = new CollisionWorld(parts);
  cw.terrain = grid;
  var rw = new RigidWorld(cw, 196.2);
  var props = [];
  var palette = ["#ff6b4a", "#ffd166", "#06d6a0", "#4cc9f0", "#b388ff", "#ff4d8d", "#ffffff"];
  function spawnProp(t, k) {
    const sphere = k % 3 !== 2;
    const s = sphere ? 3.6 + R() * 1.2 : 3.4;
    const p = {
      id: "dyn" + k,
      name: "dyn",
      shape: sphere ? "sphere" : "box",
      kind: "normal",
      x: PG.x + (R() - 0.5) * 8,
      y: GY + 38 + R() * 14,
      z: PG.z - 10 + (R() - 0.5) * 6,
      sx: s,
      sy: s,
      sz: s,
      ry: R() * 360,
      color: palette[k % palette.length],
      transparency: 0,
      collide: true,
      dynamic: true,
      bounce: sphere ? 0.55 + R() * 0.25 : 0.12,
      material: k % 7 === 0 ? "metal" : "plastic"
    };
    parts.push(p);
    cw.set(p);
    rw.add(p);
    rw.push(p.id, (R() - 0.3) * 14, 0, 6 + R() * 10);
    props.push({ part: p, born: t });
  }
  var byId = (id) => SKYBOXES.find((s) => s.id === id);
  function mixSky(a, b, t) {
    return {
      ...a,
      top: mixHex(a.top, b.top, t),
      horizon: mixHex(a.horizon, b.horizon, t),
      bottom: mixHex(a.bottom, b.bottom, t),
      fog: mixHex(a.fog, b.fog, t),
      tint: mixHex(a.tint, b.tint, t),
      ground: mixHex(a.ground, b.ground, t),
      light: lerp(a.light, b.light, t),
      stars: t > 0.55 ? b.stars ?? 0 : a.stars,
      moon: t > 0.55 ? b.moon : a.moon,
      sun: a.sun && b.sun ? { color: mixHex(a.sun.color, b.sun.color, t), height: lerp(a.sun.height, b.sun.height, t), size: lerp(a.sun.size, b.sun.size, t) } : t < 0.7 ? a.sun : b.sun,
      clouds: a.clouds ?? b.clouds
    };
  }
  var SKY = { dawn: byId("dawn"), day: byId("day"), sunset: byId("sunset"), night: byId("night") };
  function skyAt(t) {
    if (t < 9) return mixSky(SKY.dawn, SKY.day, ss(2, 9, t) * 0.8);
    if (t < 27) return mixSky(SKY.dawn, SKY.day, 0.8 + ss(9, 16, t) * 0.2);
    if (t < 31) return mixSky(SKY.day, SKY.sunset, ss(27, 31, t));
    if (t < 36) return { ...mixSky(SKY.sunset, SKY.night, ss(31, 36, t)), light: lerp(0.85, 0.85, 0) };
    if (t < 44) return { ...SKY.night, light: 0.85 };
    return { ...mixSky({ ...SKY.night, light: 0.85 }, SKY.sunset, ss(44, 49, t)) };
  }
  var canvas = document.getElementById("c");
  var rend = new ApexRenderer(canvas);
  rend.resize(W, H, 1);
  var looks = [
    { ...DEFAULT_AVATAR },
    { ...DEFAULT_AVATAR, head: "#f1c27d", torso: "#e63946", arms: "#f1c27d", legs: "#1d3557", face: "grin" },
    { ...DEFAULT_AVATAR, head: "#c68642", torso: "#2a9d8f", arms: "#c68642", legs: "#264653", face: "cool" },
    { ...DEFAULT_AVATAR, head: "#ffdbac", torso: "#9b5de5", arms: "#ffdbac", legs: "#3a0ca3", face: "wink" },
    { ...DEFAULT_AVATAR, head: "#8d5524", torso: "#ffbe0b", arms: "#8d5524", legs: "#fb5607", face: "laugh" },
    { ...DEFAULT_AVATAR, head: "#f5cd30", torso: "#111111", arms: "#f5cd30", legs: "#444444", face: "cool" },
    { ...DEFAULT_AVATAR, head: "#e0ac69", torso: "#06d6a0", arms: "#e0ac69", legs: "#118ab2", face: "stars" },
    { ...DEFAULT_AVATAR, head: "#ffe0bd", torso: "#ff4d8d", arms: "#ffe0bd", legs: "#7209b7", face: "hearts" },
    { ...DEFAULT_AVATAR, head: "#f5cd30", torso: "#0d69ac", arms: "#f5cd30", legs: "#a4bd47", face: "tongue" },
    { ...DEFAULT_AVATAR, head: "#c68642", torso: "#f77f00", arms: "#c68642", legs: "#003049", face: "smile" }
  ];
  var crowd = looks.map((l) => new ApexAvatar(rend, l));
  var dancers = crowd.slice(0, 6);
  var runners = crowd.slice(6);
  var dances = ["dance", "wave", "cheer", "dance", "robotdance", "jumpjacks"];
  var K = (t, e, g, f = 62) => ({ t, e, g, f });
  var vx = VILLAGE.x;
  var vz = VILLAGE.z;
  var keys = [
    K(0, [190, 14, 70], [60, 12, 56], 58),
    K(4, [150, 12, 60], [40, 11, 52], 58),
    K(8, [60, 16, 90], [-5, 14, 42], 56),
    K(10.5, [32, 13, 84], [-20, 11, 46], 62),
    K(14, [-14, 13, 104], [-24, 14, 46], 66),
    K(16, [-52, 24, 98], [-24, 12, 46], 64),
    K(17.5, [-64, 24, 62], [-24, 12, 44], 62),
    K(18.5, [-44, 21, 22], [-14, 22, 38], 60),
    K(22, [20, 30, 70], [-14, 7, 44], 58),
    K(26.5, [-46, 25, 60], [-14, 6, 42], 60),
    K(27.5, [-8, 24, 64], [-28, 10, 34], 54),
    K(30.5, [-8, 19, 58], [-28, 10, 32], 52),
    K(33.5, [-46, 11, 42], [-30, 12, 30], 50),
    K(36.3, [-23, 10, 39], [-30, 11.5, 30], 48),
    K(38.8, [-37, 10, 21], [-30, 11.5, 30], 48),
    K(41, [-2, 34, 76], [-20, 8, 38], 52),
    K(43.5, [-34, 32, 74], [-20, 8, 38], 50),
    K(46, [-60, 70, -40], [PEAK.x, peakH + 4, PEAK.z], 56),
    K(49.5, [PEAK.x + 36, peakH + 12, PEAK.z + 42], [PEAK.x, peakH + 4, PEAK.z], 52),
    K(53, [PEAK.x + 50, peakH + 20, PEAK.z + 70], [PEAK.x, peakH + 12, PEAK.z], 50)
  ];
  function cr(p0, p1, p2, p3, t) {
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  function camAt(t) {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(keys.length - 1, i + 2)];
    const u = ss(0, 1, clamp((t - b.t) / (c.t - b.t)) * 0.6 + clamp((t - b.t) / (c.t - b.t)) * 0.4);
    const mix = (get) => cr(get(a), get(b), get(c), get(d), u);
    const e = [mix((k) => k.e[0]), mix((k) => k.e[1]), mix((k) => k.e[2])];
    const g = [mix((k) => k.g[0]), mix((k) => k.g[1]), mix((k) => k.g[2])];
    return { e, g, f: mix((k) => k.f) };
  }
  var HITS = [5.2, 9.2, 17.2, 27.2, 35.2, 43.2, 49.2];
  var $ = (id) => document.getElementById(id);
  var show = (el, v) => {
    el.style.opacity = String(clamp(v));
  };
  var win = (t, a, b, fi = 0.5, fo = 0.5) => ss(a, a + fi, t) * (1 - ss(b - fo, b, t));
  function caption(id, t, a, b) {
    const el = $(id);
    const v = win(t, a, b, 0.6, 0.5);
    el.style.opacity = String(v);
    el.style.transform = `translateY(${(1 - ss(a, a + 0.7, t)) * 26}px)`;
  }
  var CODE = [
    `<span class="k">-- serwer</span>`,
    `<span class="k">onClientEvent</span>(<span class="s">"kup"</span>, <span class="k">function</span>(gracz, rzecz)`,
    `  <span class="k">giveTool</span>(gracz, rzecz)`,
    `  <span class="k">fireClient</span>(gracz, <span class="s">"brawo"</span>, <span class="n">1</span>)`,
    `<span class="k">end</span>)`,
    ``,
    `<span class="k">-- gracz (\u{1F3AE})</span>`,
    `<span class="k">onKey</span>(<span class="s">"E"</span>, <span class="k">function</span>()`,
    `  <span class="k">fireServer</span>(<span class="s">"kup"</span>, <span class="s">"Miecz"</span>)`,
    `<span class="k">end</span>)`,
    `<span class="k">onServerEvent</span>(<span class="s">"brawo"</span>, <span class="k">function</span>(n)`,
    `  <span class="k">showText</span>(<span class="s">"Kupiono!"</span>, <span class="n">2</span>)`,
    `<span class="k">end</span>)`
  ];
  function codeAt(t) {
    const a = 41.2;
    const total = CODE.length;
    const n = clamp((t - a) / 3.2) * total;
    const full = Math.floor(n);
    const lines = CODE.slice(0, full);
    if (full < total) lines.push(CODE[full].slice(0, 0) + CODE[full]);
    $("code").innerHTML = lines.slice(0, Math.min(total, Math.ceil(n))).join("\n");
  }
  var simT = 0;
  var spawned = 0;
  var lastFrame = -1;
  var cleared = false;
  function simulateTo(frame) {
    while (lastFrame < frame) {
      lastFrame++;
      const t = lastFrame / FPS;
      const slow = 1 - 0.65 * (ss(22.2, 22.8, t) * (1 - ss(24.6, 25.4, t)));
      simT += slow / FPS;
      if (t >= 17.3 && t < 26.5) {
        const want = Math.floor((t - 17.3) * 5.5);
        while (spawned < Math.min(want, 64)) spawnProp(t, spawned++);
      }
      if (t >= 27.2 && !cleared) {
        cleared = true;
        for (const pr of props) {
          rend.removePart(pr.part.id);
          cw.remove(pr.part.id);
          rw.remove(pr.part.id);
        }
        props.length = 0;
      }
      const moved = rw.step(slow / FPS, []);
      for (const b of moved) b.part.y = b.y;
    }
  }
  var setupDone = false;
  function setup() {
    rend.setTerrain(grid);
    for (const p of parts) rend.addPart(p, rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0));
    setupDone = true;
  }
  function setFrame(frame, dry = false) {
    if (!setupDone) setup();
    simulateTo(frame);
    const t = frame / FPS;
    rend.setSky("#8ec8ff", skyAt(t));
    rend.setLight(1, t < 12 ? 520 : 900);
    rend.time = t;
    for (const pr of props) rend.updatePart(pr.part, rotationMatrix(0, pr.part.ry, 0));
    const night = ss(31, 36, t) * (1 - ss(44, 49, t));
    for (const l of lamps) {
      l.color = mixHex("#ffe9b0", "#ffb347", night);
      rend.updatePart(l, rotationMatrix(0, 0, 0));
    }
    pole.transparency = t > 50.2 ? 1 : 0;
    rend.updatePart(pole, rotationMatrix(0, 0, 0));
    summit.ry = t * 60 % 360;
    summit.color = mixHex("#ffd27a", "#fff2c2", 0.5 + 0.5 * Math.sin(t * 3));
    rend.updatePart(summit, rotationMatrix(0, summit.ry, 0));
    const cx = -30, cz = 30;
    dancers.forEach((a, i) => {
      const ang = i / dancers.length * Math.PI * 2 + 0.4;
      a.x = cx + Math.cos(ang) * 4.8;
      a.z = cz + Math.sin(ang) * 4.8;
      a.y = GY + 0.22;
      a.ry = ang + Math.PI / 2 + Math.PI;
      a.anim = t > 28 || t < 4 ? dances[i] : "idle";
      a.update(1 / FPS);
      if (!dry) a.draw();
    });
    runners.forEach((a, i) => {
      const ang = t * 0.55 * (i % 2 ? -1 : 1) + i * 1.7;
      const r2 = 8.6 + i * 0.5;
      a.x = cx + Math.cos(ang) * r2;
      a.z = cz + Math.sin(ang) * r2;
      a.y = GY + 0.22;
      a.ry = Math.atan2(-(i % 2 ? -1 : 1) * Math.cos(ang) * -1, (i % 2 ? -1 : 1) * Math.sin(ang) * -1) * -1 + 0;
      const dir = i % 2 ? -1 : 1;
      const dx = -Math.sin(ang) * dir, dz = Math.cos(ang) * dir;
      a.ry = Math.atan2(-dx, -dz);
      a.anim = "walk";
      a.update(1 / FPS);
      if (!dry) a.draw();
    });
    if (dry) return { draws: 0, tris: 0 };
    const c = camAt(t);
    let shake = 0;
    for (const h of HITS) shake = Math.max(shake, Math.exp(-(t - h) * 9) * (t >= h ? 1 : 0));
    const sx = Math.sin(t * 91) * shake * 0.5, sy = Math.cos(t * 77) * shake * 0.35;
    const eye = [c.e[0] + sx, Math.max(c.e[1], terrainHeight(c.e[0], c.e[2]) + 2.5) + sy, c.e[2]];
    rend.followShadows([c.g[0], c.g[1], c.g[2]]);
    rend.extent = t < 17 || t > 44 ? 150 : 95;
    const dist = Math.hypot(c.g[0] - eye[0], c.g[2] - eye[2]);
    void dist;
    rend.render({ eye, target: c.g, fov: c.f * Math.PI / 180, near: 0.3, far: 2500 });
    const fadeIn = 1 - ss(0, 1.2, t);
    const fadeOut = ss(52, 53, t);
    show($("fade"), Math.max(fadeIn, fadeOut));
    let flash = 0;
    for (const h of HITS) flash = Math.max(flash, Math.exp(-(t - h) * 6) * (t >= h ? 0.38 : 0));
    show($("flash"), flash);
    show($("bars"), 1);
    const logoV = ss(5.2, 5.9, t) * (1 - ss(10.2, 11, t));
    const tl = $("title");
    tl.style.opacity = String(logoV);
    tl.style.transform = `scale(${1 + (1 - ss(5.2, 6.6, t)) * 0.35 + ss(5.9, 11, t) * 0.05})`;
    $("tagline").style.opacity = String(ss(6.4, 7.2, t) * (1 - ss(10.2, 11, t)));
    caption("presents", t, 1, 4.6);
    caption("c1", t, 11.2, 16.8);
    caption("c2", t, 18.3, 26.6);
    caption("c3", t, 28, 35.4);
    caption("c4", t, 36.6, 40.6);
    caption("c5", t, 41, 46.2);
    const st = rend.stats;
    $("stats").innerHTML = `<b>${parts.length}</b> klock\xF3w \xB7 <b>${st.draws}</b> wywo\u0142a\u0144 rysowania \xB7 <b>${(st.tris / 1e3).toFixed(0)}k</b> tr\xF3jk\u0105t\xF3w`;
    $("stats").style.opacity = String(win(t, 12.2, 16.6, 0.6, 0.5) + win(t, 19, 26, 0.6, 0.5) * 0);
    ["ch1", "ch2", "ch3", "ch4"].forEach((id, i) => {
      const el = $(id);
      const a = 11.8 + i * 0.7;
      el.style.opacity = String(ss(a, a + 0.4, t) * (1 - ss(16.2, 16.8, t)));
      el.style.transform = `translateX(${(1 - ss(a, a + 0.5, t)) * -30}px)`;
    });
    $("physcount").textContent = String(Math.min(spawned, 100));
    $("phys").style.opacity = String(win(t, 19.2, 26.4, 0.6, 0.5));
    codeAt(t);
    $("codepanel").style.opacity = String(win(t, 41, 46, 0.6, 0.6));
    const fin = ss(49.2, 50.2, t) * (1 - ss(52.2, 53, t));
    $("end").style.opacity = String(fin);
    $("endlogo").style.transform = `scale(${0.9 + 0.1 * ss(49.2, 52, t)})`;
    $("sub2").style.opacity = String(ss(50.8, 51.6, t));
    $("lines").style.transform = `translateY(${(1 - ss(5.2, 6.6, t)) * 0}px)`;
    return { draws: st.draws, tris: st.tris };
  }
  window.setFrame = setFrame;
  window.FPS = FPS;
  window.DURATION = DURATION;
  window.ready = true;
  window.checkCam = () => {
    const out = [];
    for (let f = 0; f < DURATION * FPS; f++) {
      const t = f / FPS;
      const c = camAt(t);
      const e = c.e;
      const gh = terrainHeight(e[0], e[2]);
      if (e[1] < gh + 1.5) out.push(`${t.toFixed(2)} pod terenem (y=${e[1].toFixed(1)}, teren=${gh.toFixed(1)})`);
      for (const p of parts) {
        if (p.collide === false && p.shape !== "box") continue;
        if (p.shape === "sphere" || p.shape === "cylinder" || p.sy < 1) continue;
        const m = 1.2;
        if (Math.abs(e[0] - p.x) < p.sx / 2 + m && Math.abs(e[1] - p.y) < p.sy / 2 + m && Math.abs(e[2] - p.z) < p.sz / 2 + m && p.sx > 3) out.push(`${t.toFixed(2)} w klocku ${p.name} (${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)})`);
      }
    }
    return out;
  };
})();
