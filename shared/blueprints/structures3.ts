// Budowle, część 3: tory przeszkód (obby), areny, labirynty, tory wyścigowe, wieżowce i wyspy - to, o co kreatorzy proszą najczęściej.
import { GRASS, LEAF, WATER, WOOD, pickColor, r2, type ColorKey, type Rng } from "./core.ts";
import { tree } from "./structures1.ts";
import type { Builder } from "./structures1.ts";

// ---------- obby ----------

/** zakres skoku gracza: 6 w górę i ~8 w dal - zostawiamy zapas */
const MAX_GAP = 6, MAX_UP = 3;

export const obby: Builder = (r, s, o = {}) => {
  const n = (o.n as number | undefined) ?? r.int(8, 22);
  const theme = (o.theme as string | undefined) ?? r.pick(["rainbow", "stone", "neon", "candy"]);
  const palette: Record<string, string[]> = {
    rainbow: ["#ef5350", "#ffa726", "#ffee58", "#66bb6a", "#42a5f5", "#ab47bc"],
    stone: ["#9aa0a6", "#8d949b", "#a7adb3", "#7f8c8d"],
    neon: ["#00e5ff", "#76ff03", "#ff4081", "#ffea00"],
    candy: ["#ff80ab", "#b388ff", "#80d8ff", "#ccff90", "#ffe57f"],
  };
  const cols = palette[theme];
  const killFloor = (o.lava as boolean | undefined) ?? r.chance(0.7);
  let x = 0, y = 0, z = 0;
  s.add({ name: "Start", shape: "box", kind: "spawn", x, y: y + 0.4, z, sx: 10, sy: 0.8, sz: 10, color: "#4caf50", fl: true });
  let minX = -6, maxX = 6, minZ = -6, maxZ = 6;
  const rects: [number, number, number][] = [[0, 0, 10]]; // x, z, rozmiar
  let prev = 10;
  let dir: [number, number] = [0, 1];
  let straight = 0;
  for (let i = 0; i < n; i++) {
    const gap = r.snap(r.range(2.5, MAX_GAP - 0.8), 0.5);
    const kind = i > 0 && i % 6 === 0 ? "spawn" : "normal";
    const size = kind === "spawn" ? 7 : r.snap(r.range(3.2, 6), 0.5);
    const dy = r.pick([0, 0, 0, 1, 1, 2, -1]);
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      let d2 = dir;
      if (attempt > 0 || straight > r.int(2, 4)) d2 = r.pick([[1, 0], [-1, 0], [0, 1], [0, 1]] as [number, number][]);
      const step = prev / 2 + gap + size / 2;
      const nx = x + d2[0] * step, nz = z + d2[1] * step;
      const clash = rects.some(([rx, rz, rs], k) => k !== rects.length - 1 && Math.abs(rx - nx) < (rs + size) / 2 + 2 && Math.abs(rz - nz) < (rs + size) / 2 + 2);
      if (clash) continue;
      straight = d2[0] === dir[0] && d2[1] === dir[1] ? straight + 1 : 0;
      dir = d2;
      x = nx;
      z = nz;
      placed = true;
    }
    if (!placed) break;
    y = Math.max(0, y + Math.min(dy, MAX_UP));
    const c = cols[i % cols.length];
    s.add({ name: kind === "spawn" ? "Checkpoint" : "Platforma", shape: "box", kind, x, y: y + 0.4, z, sx: size, sy: 0.8, sz: size, color: kind === "spawn" ? "#4caf50" : c, material: theme === "neon" ? "neon" : "plastic", fl: true });
    rects.push([x, z, size]);
    prev = size;
    minX = Math.min(minX, x - size); maxX = Math.max(maxX, x + size); minZ = Math.min(minZ, z - size); maxZ = Math.max(maxZ, z + size);
  }
  s.add({ name: "Meta", shape: "box", kind: "spawn", x: x + dir[0] * (prev / 2 + 5 + 3), y: y + 0.4, z: z + dir[1] * (prev / 2 + 5 + 3), sx: 10, sy: 0.8, sz: 10, color: "#ffd700", fl: true, label: "META" });
  if (killFloor) {
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    s.add({ name: "Lawa", shape: "box", kind: "kill", x: cx, y: -0.4, z: cz, sx: maxX - minX + 60, sy: 0.8, sz: maxZ - minZ + 60, color: "#ff5a1f", material: "neon", ov: true, fl: true });
  }
  return { model: "Obby", foot: [maxX - minX + 20, maxZ - minZ + 20], tags: { n, theme, lava: killFloor }, allowFloat: true };
};

export const stairsOfDeath: Builder = (r, s) => {
  const steps = r.int(12, 24);
  let y = 0;
  for (let i = 0; i < steps; i++) {
    y += r.pick([1.5, 2, 2.5]);
    const x = r.snap(r.range(-6, 6), 1);
    s.add({ name: "Stopień", shape: "box", x, y, z: i * 5.5, sx: r.snap(r.range(4, 7), 0.5), sy: 0.8, sz: 4, color: r.pick(["#ef5350", "#ffa726", "#66bb6a", "#42a5f5"]), fl: true });
  }
  s.add({ name: "Lawa", shape: "box", kind: "kill", x: 0, y: -0.4, z: steps * 2.75, sx: 60, sy: 0.8, sz: steps * 5.5 + 40, color: "#ff5a1f", material: "neon", ov: true, fl: true });
  s.add({ name: "Meta", shape: "box", kind: "spawn", x: 0, y: y + 3, z: steps * 5.5 + 5, sx: 10, sy: 0.8, sz: 10, color: "#ffd700", fl: true });
  return { model: "Schody śmierci", foot: [30, steps * 5.5 + 30], tags: { steps }, allowFloat: true };
};

export const spiralTower: Builder = (r, s) => {
  const n = r.int(18, 30), rad = r.snap(r.range(14, 20), 2);
  for (let i = 0; i < n; i++) {
    const a = i * 0.55;
    s.add({ name: "Spirala", shape: "box", x: Math.cos(a) * rad, y: i * 1.6 + 0.4, z: Math.sin(a) * rad, sx: 5, sy: 0.8, sz: 5, color: r.pick(["#ab47bc", "#42a5f5", "#66bb6a", "#ffa726"]), ry: ((-a * 180) / Math.PI) % 360, fl: true });
  }
  s.cyl("Słup spirali", 0, 0, 0, 5, n * 1.6 + 2, "#cfd8dc", { ov: true });
  s.add({ name: "Meta", shape: "cylinder", kind: "spawn", x: 0, y: n * 1.6 + 2.4, z: 0, sx: 12, sy: 0.8, sz: 12, color: "#ffd700", fl: true });
  return { model: "Spiralna wieża", foot: [rad * 2 + 12, rad * 2 + 12], tags: { n }, allowFloat: true };
};

// ---------- arena ----------

export const arena: Builder = (r, s, o = {}) => {
  const size = (o.size as number | undefined) ?? r.snap(r.range(70, 110), 10);
  const hs = size / 2;
  const floor = r.pick(["#7f8c8d", "#8d6e63", "#5d6d7e", "#a1887f"]);
  s.stand("Podłoga areny", 0, 0, 0, size, 0.8, size, floor, { texture: r.pick(["concrete", "tiles", "stone"]) });
  const wallC = r.pick(["#546e7a", "#6d4c41", "#455a64"]);
  for (const sg of [-1, 1]) {
    s.stand("Mur areny", 0, 0.8, sg * hs, size, 10, 2, wallC, { texture: "stone" });
    s.stand("Mur areny", sg * hs, 0.8, 0, 2, 10, size - 2, wallC, { texture: "stone" });
  }
  // osłony
  const n = r.int(8, 14);
  const placed: [number, number][] = [];
  for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
    const x = r.snap(r.range(-hs + 12, hs - 12), 2), z = r.snap(r.range(-hs + 12, hs - 12), 2);
    if (Math.hypot(x, z) < 22 || Math.abs(x) > hs - 14 && Math.abs(z) > hs - 14) continue;
    if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 16)) continue;
    const w = r.snap(r.range(4, 8), 1), h = r.snap(r.range(3, 6), 1);
    s.stand("Osłona", x, 0.8, z, w, h, r.chance(0.5) ? 2 : w, r.pick(["#90a4ae", "#a1887f", "#78909c"]), { texture: "concrete", ry: r.pick([0, 0, 90]) });
    placed.push([x, z]);
    i++;
  }
  // wzniesienie w środku
  s.stand("Podwyższenie", 0, 0.8, 0, 16, 3, 16, "#6b7b86", { texture: "concrete" });
  s.wedge("Podjazd", 0, 0.8, -10.5, 8, 3, 5, "#6b7b86", { ov: true });
  // spawny w narożnikach
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.add({ name: "Spawn", shape: "box", kind: "spawn", x: sx * (hs - 8), y: 1.1, z: sz * (hs - 8), sx: 5, sy: 0.6, sz: 5, color: sx * sz > 0 ? "#ef5350" : "#42a5f5", ov: true });
  return { model: "Arena", foot: [size + 6, size + 6], tags: { size } };
};

// ---------- labirynt ----------

export const maze: Builder = (r, s, o = {}) => {
  const cells = (o.cells as number | undefined) ?? r.int(5, 9);
  const cs = 10, wallH = 8, th = 1.4;
  // DFS po siatce
  const vis = Array.from({ length: cells }, () => new Array(cells).fill(false));
  const open = new Set<string>();
  const key = (a: number, b: number, c: number, d: number) => (a < c || (a === c && b < d) ? `${a},${b}|${c},${d}` : `${c},${d}|${a},${b}`);
  const stack: [number, number][] = [[0, 0]];
  vis[0][0] = true;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const nb = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).map(([dx, dz]) => [cx + dx, cz + dz] as [number, number]).filter(([x, z]) => x >= 0 && z >= 0 && x < cells && z < cells && !vis[x][z]);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [nx, nz] = r.pick(nb);
    vis[nx][nz] = true;
    open.add(key(cx, cz, nx, nz));
    stack.push([nx, nz]);
  }
  const total = cells * cs, o0 = -total / 2;
  const col = r.pick(["#6d8f5e", "#7f8c8d", "#a1887f", "#5c6bc0"]);
  s.stand("Podłoga labiryntu", 0, 0, 0, total + 2, 0.6, total + 2, "#cfd8dc", { texture: "tiles" });
  // ściany: między sąsiednimi komórkami, jeśli nie ma przejścia
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j < cells; j++) {
      // pionowa linia x = i, odcinek komórki j (wzdłuż z)
      const wallV = i === 0 || i === cells || !open.has(key(i - 1, j, i, j));
      const entrance = i === 0 && j === 0;
      if (wallV && !entrance) s.stand("Ściana labiryntu", o0 + i * cs, 0.6, o0 + j * cs + cs / 2, th, wallH, cs + th, col, { texture: "brick", ov: true });
      const wallH2 = i === 0 || i === cells || !open.has(key(j, i - 1, j, i));
      if (wallH2) s.stand("Ściana labiryntu", o0 + j * cs + cs / 2, 0.6, o0 + i * cs, cs + th, wallH, th, col, { texture: "brick", ov: true });
    }
  }
  s.add({ name: "Start", shape: "box", kind: "spawn", x: o0 + cs / 2, y: 0.9, z: o0 + cs / 2, sx: 5, sy: 0.6, sz: 5, color: "#4caf50", ov: true });
  s.stand("Meta", o0 + total - cs / 2, 0.6, o0 + total - cs / 2, 5, 0.4, 5, "#ffd700", { ov: true, label: "META" });
  return { model: "Labirynt", foot: [total + 8, total + 8], tags: { cells } };
};

// ---------- tor wyścigowy ----------

export const raceTrack: Builder = (r, s) => {
  const rx = r.snap(r.range(60, 90), 5), rz = r.snap(r.range(36, 56), 4), wd = 18;
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    const x0 = Math.cos(a) * rx, z0 = Math.sin(a) * rz, x1 = Math.cos(b) * rx, z1 = Math.sin(b) * rz;
    const len = Math.hypot(x1 - x0, z1 - z0) + 1.2;
    const ang = (Math.atan2(-(z1 - z0), x1 - x0) * 180) / Math.PI;
    s.add({ name: "Tor", shape: "box", x: (x0 + x1) / 2, y: 0.3, z: (z0 + z1) / 2, sx: len, sy: 0.6, sz: wd, ry: r2(ang), color: "#3a3b40", texture: "concrete", ov: true });
    // krawężniki w kolorach
    for (const sg of [-1, 1]) {
      const nx = -(z1 - z0), nz = x1 - x0, nl = Math.hypot(nx, nz);
      s.add({ name: "Krawężnik", shape: "box", x: (x0 + x1) / 2 + (nx / nl) * sg * (wd / 2 + 0.5), y: 0.45, z: (z0 + z1) / 2 + (nz / nl) * sg * (wd / 2 + 0.5), sx: len, sy: 0.9, sz: 1, ry: r2(ang), color: i % 2 ? "#ffffff" : "#e53935", ov: true });
    }
  }
  s.add({ name: "Linia startu", shape: "box", x: rx, y: 0.65, z: 0, sx: 1.6, sy: 0.1, sz: wd, ry: 90, color: "#ffffff", texture: "checker", collide: false, ov: true });
  s.add({ name: "Spawn", shape: "box", kind: "spawn", x: rx, y: 0.8, z: 5, sx: 4, sy: 0.4, sz: 4, color: "#4caf50", ov: true });
  s.stand("Trawa toru", 0, 0, 0, rx * 2 - wd * 2.4, 0.4, rz * 2 - wd * 2.4, "#4caf50", { texture: "grass", ov: true });
  return { model: "Tor wyścigowy", foot: [rx * 2 + wd * 2, rz * 2 + wd * 2], tags: { rx, rz } };
};

// ---------- miasto ----------

export const skyscraper: Builder = (r, s, o = {}) => {
  const w = r.snap(r.range(16, 26), 2), d = r.snap(r.range(16, 26), 2);
  const floors = (o.floors as number | undefined) ?? r.int(8, 22), fh = 5;
  const glass = r.pick(["#6fb7d9", "#4f9bc7", "#8fcfe8"]);
  const frame = r.pick(["#455a64", "#37474f", "#cfd8dc"]);
  const h = floors * fh;
  s.stand("Lobby", 0, 0, 0, w, 8, d, frame, { texture: "concrete" });
  s.stand("Wieżowiec", 0, 8, 0, w - 2, h - 8, d - 2, glass, { material: "glass", ov: false });
  for (let i = 2; i < floors; i++) s.stand("Pas piętra", 0, i * fh - 0.3, 0, w, 0.6, d, frame, { ov: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.stand("Filar wieżowca", sx * (w / 2 - 0.5), 0, sz * (d / 2 - 0.5), 1, h, 1, frame, { ov: true });
  s.stand("Dach wieżowca", 0, h, 0, w + 1, 1, d + 1, frame);
  s.stand("Antena", 0, h + 1, 0, 0.6, 8, 0.6, "#b0bec5", { ov: true });
  s.stand("Wejście wieżowca", 0, 0, -d / 2 - 0.05, 6, 6.5, 0.5, "#263238", { ov: true });
  return { model: "Wieżowiec", foot: [w + 6, d + 6], tags: { floors, h } };
};

export const island: Builder = (r, s) => {
  const d = r.snap(r.range(60, 90), 4);
  s.add({ name: "Woda wyspy", shape: "cylinder", kind: "water", x: 0, y: -0.2, z: 0, sx: d * 1.7, sy: 1.2, sz: d * 1.7, color: WATER, transparency: 0.3, collide: false, ov: true, fl: true });
  s.cyl("Piasek wyspy", 0, -0.6, 0, d, 1.6, "#e6cf8f", { texture: "sand", ov: true });
  s.cyl("Trawa wyspy", 0, 0.5, 0, d - 10, 1, GRASS[0], { texture: "grass", ov: true });
  const n = r.int(6, 12);
  const pts: [number, number][] = [[0, 0]];
  s.stand("Skrzynia skarbów", 0, 1.5, 0, 3, 2, 2, "#8d5a2b", { texture: "planks" });
  for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
    const a = r.range(0, 6.28), rr = r.range(8, d / 2 - 12);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 12)) continue;
    pts.push([x, z]);
    tree(r, s.child(x, z, r.range(0, 360), 1.0), { kind: r.pick(["palm", "palm", "oak", "pine"]) });
    i++;
  }
  return { model: "Wyspa", foot: [d * 1.7, d * 1.7], tags: { d }, allowFloat: true };
};
void LEAF; void WOOD; void pickColor; void r2; void ({} as ColorKey); void ({} as Rng);
