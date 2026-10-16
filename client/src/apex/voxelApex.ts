// Apex: świat z bloków (Minecraft). Te same zasady co w silniku Babylon (voxelPlay.ts): celowanie, kopanie, stawianie, moby,
// TNT, dzień i noc - ale rysowane przez Renderer (siatki kawałków świata z atlasem tekstur, moby z brył).
// Interfejs (pasek, ekwipunek, crafting) i dźwięki są wspólne z Babylonem (voxelUi.ts, voxelSfx.ts).
import { AIR, BARRIER, block, breakTime, VoxelWorld, WATER } from "../../../shared/voxel.ts";
import { rayBox, type Body } from "../../../shared/physics.ts";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import type { BlockWorldDef } from "../../../shared/types.ts";
import type { GameConnection } from "../game/connection.ts";
import type { PadState } from "../engine/gamepad.ts";
import { atlasData, chunkGeometry, columnHeight, tileRgb, VOX_CH } from "../engine/voxelAtlas.ts";
import { Sfx } from "../game/voxelSfx.ts";
import { createVoxelUi } from "../game/voxelUi.ts";
import { h, isTouch, toast } from "../ui/dom.ts";
import { ApexAvatar } from "./avatar.ts";
import { mul3, rotX, rotY, apply3, type V3 } from "./math.ts";
import { MAT, rgb, type Renderer } from "./renderer.ts";

const REACH = 5;
const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
type Rgb = [number, number, number];

export interface ApexVoxelCtx {
  rend: Renderer;
  canvas: HTMLCanvasElement;
  wrap: HTMLElement;
  conn: GameConnection;
  body: Body;
  /** oko kamery i kierunek patrzenia */
  eye: () => V3;
  forward: () => V3;
  firstPerson: () => boolean;
  dead: () => boolean;
  toggleView: () => void;
  setSky: (hex: string) => void;
  setLight: (brightness: number, fog: number) => void;
  /** drżenie kamery po wybuchu */
  shake: (k: number) => void;
}

/** siatki kawałków świata budowane po kolei (najpierw najbliższe graczowi), zmienione - od razu */
class ChunkView {
  private dirty = new Set<string>();
  private queue: string[] = [];
  private heights: Int16Array;
  private built = new Set<string>();
  private readonly ncx: number;
  private readonly ncz: number;

  constructor(private rend: Renderer, private w: VoxelWorld) {
    const a = atlasData();
    rend.setVoxelAtlas(a.pixels, a.width, a.height);
    this.ncx = Math.ceil(w.sx / VOX_CH);
    this.ncz = Math.ceil(w.sz / VOX_CH);
    this.heights = new Int16Array(w.sx * w.sz);
    for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) this.heights[z * w.sx + x] = columnHeight(w, x, z);
    for (let cz = 0; cz < this.ncz; cz++) for (let cx = 0; cx < this.ncx; cx++) this.queue.push(cx + "," + cz);
  }

  changed(x: number, _y: number, z: number) {
    const w = this.w, CH = VOX_CH;
    if (x >= 0 && z >= 0 && x < w.sx && z < w.sz) this.heights[z * w.sx + x] = columnHeight(w, x, z);
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    this.dirty.add(cx + "," + cz);
    if (x % CH === 0) this.dirty.add(cx - 1 + "," + cz);
    if (x % CH === CH - 1) this.dirty.add(cx + 1 + "," + cz);
    if (z % CH === 0) this.dirty.add(cx + "," + (cz - 1));
    if (z % CH === CH - 1) this.dirty.add(cx + "," + (cz + 1));
  }

  update(px: number, pz: number, budgetMs = 8) {
    for (const k of this.dirty) this.build(k);
    this.dirty.clear();
    if (!this.queue.length) return;
    const cx = Math.floor(this.w.bx(px) / VOX_CH), cz = Math.floor(this.w.bz(pz) / VOX_CH);
    this.queue.sort((a, b) => {
      const [ax, az] = a.split(",").map(Number), [bx, bz] = b.split(",").map(Number);
      return Math.hypot(bx - cx, bz - cz) - Math.hypot(ax - cx, az - cz);
    });
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) this.build(this.queue.pop()!);
  }

  private build(key: string) {
    const [cx, cz] = key.split(",").map(Number);
    if (cx < 0 || cz < 0 || cx >= this.ncx || cz >= this.ncz) return;
    this.rend.setVoxelChunk(key, chunkGeometry(this.w, cx, cz, this.heights));
    this.built.add(key);
  }

  dispose() {
    for (const k of this.built) this.rend.removeVoxelChunk(k);
    this.rend.clearVoxels();
  }
}

interface MobPart { pos: V3; size: V3; color: string; leg?: number }
interface Mob {
  type: string;
  x: number; y: number; z: number; ry: number;
  tx: number; ty: number; tz: number; tr: number;
  phase: number;
  flags: number;
  parts: MobPart[];
  legs: number;
  avatar?: ApexAvatar;
  walking: boolean;
}

function mobParts(type: string, S: number): { parts: MobPart[]; legs: number } {
  const k = S / 3;
  const parts: MobPart[] = [];
  let legs = 0;
  const box = (wd: number, ht: number, dp: number, x: number, y: number, z: number, color: string, leg = false) => parts.push({ pos: [x * k, y * k, z * k], size: [wd * k, ht * k, dp * k], color, leg: leg ? legs++ : undefined });
  if (type === "creeper") {
    const g = "#4cae3c";
    box(1.6, 2.6, 1.0, 0, 2.4, 0, g);
    box(1.6, 1.6, 1.6, 0, 4.5, 0, g);
    box(0.35, 0.35, 0.05, -0.35, 4.75, -0.81, "#111111");
    box(0.35, 0.35, 0.05, 0.35, 4.75, -0.81, "#111111");
    box(0.45, 0.6, 0.05, 0, 4.25, -0.81, "#111111");
    for (const [lx, lz] of [[-0.45, -0.6], [0.45, -0.6], [-0.45, 0.6], [0.45, 0.6]]) box(0.7, 1.1, 0.7, lx, 0.55, lz, "#3c8f30", true);
    return { parts, legs };
  }
  const col = type === "pig" ? "#f0a5a2" : type === "sheep" ? "#ececec" : "#5b3b24";
  const legCol = type === "pig" ? "#e0908d" : type === "sheep" ? "#d8c8b0" : "#3f2918";
  const headCol = type === "sheep" ? "#d8c8b0" : col;
  box(1.8, 1.5, 2.8, 0, 2.1, 0, col);
  box(1.4, 1.4, 1.3, 0, 2.6, -1.8, headCol);
  if (type === "pig") box(0.8, 0.5, 0.2, 0, 2.4, -2.5, "#e88f8c");
  if (type === "cow") {
    box(1.9, 0.8, 1.2, 0, 2.3, 0.4, "#f2f2f2");
    box(0.8, 0.5, 0.2, 0, 2.3, -2.5, "#d9a0a0");
  }
  for (const [lx, lz] of [[-0.55, -0.95], [0.55, -0.95], [-0.55, 0.95], [0.55, 0.95]]) box(0.55, 1.4, 0.55, lx, 0.7, lz, legCol, true);
  return { parts, legs };
}

export function setupVoxelsApex(cfg: BlockWorldDef, ctx: ApexVoxelCtx) {
  const { rend, canvas, wrap, conn: r, body } = ctx;
  const w = new VoxelWorld(cfg);
  const view = new ChunkView(rend, w);
  w.onChange = (x, y, z) => view.changed(x, y, z);
  const S = w.S;
  const sfx = new Sfx();
  const creative = cfg.mode === "creative";
  const cleanups: (() => void)[] = [];
  let progress = 0;
  let progressKey = "";
  const ui = createVoxelUi({ wrap, conn: r, creative, onSelect: () => (progress = 0) });
  wrap.classList.add("voxel-mode");
  const cross = h("div", { class: "vox-cross" });
  wrap.append(cross);

  // ---------- przyciski na telefon ----------
  let touchMine = false;
  if (isTouch()) {
    const mineBtn = h("div", { class: "vox-btn vox-mine" }, "⛏");
    const placeBtn = h("div", { class: "vox-btn vox-place" }, "🧱");
    mineBtn.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      touchMine = true;
      mineBtn.classList.add("active");
      attackMob();
    });
    const endMine = () => {
      touchMine = false;
      mineBtn.classList.remove("active");
    };
    mineBtn.addEventListener("pointerup", endMine);
    mineBtn.addEventListener("pointercancel", endMine);
    mineBtn.addEventListener("pointerleave", endMine);
    placeBtn.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      use();
    });
    wrap.append(mineBtn, placeBtn, h("div", { class: "vox-btn vox-view", onClick: () => ctx.toggleView() }, "👁"));
  }

  // ---------- myszka i klawiatura ----------
  let mouseMine = false;
  let rDown: { x: number; y: number; t: number } | null = null;
  const onDown = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse") return;
    if (ev.button === 0) {
      mouseMine = true;
      attackMob();
    } else if (ev.button === 2) rDown = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  };
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse") return;
    if (ev.button === 0) mouseMine = false;
    // prawy przycisk: krótkie kliknięcie = postaw / zjedz (przeciąganie obraca kamerę)
    if (ev.button === 2 && rDown && Math.hypot(ev.clientX - rDown.x, ev.clientY - rDown.y) < 6 && performance.now() - rDown.t < 400) use();
    if (ev.button === 2) rDown = null;
  };
  // w pierwszej osobie myszka jest złapana - przyciski przychodzą do dokumentu
  const onDocDown = (ev: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    if (ev.button === 0) {
      mouseMine = true;
      attackMob();
    } else if (ev.button === 2) use();
  };
  const onDocUp = (ev: MouseEvent) => {
    if (ev.button === 0) mouseMine = false;
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  document.addEventListener("mousedown", onDocDown);
  document.addEventListener("mouseup", onDocUp);
  const onWheel = (ev: WheelEvent) => {
    if (ev.target !== canvas) return;
    ev.preventDefault();
    ev.stopPropagation();
    ui.select(ui.sel + (ev.deltaY > 0 ? 1 : -1));
  };
  wrap.addEventListener("wheel", onWheel, { capture: true, passive: false });
  const onKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (/^Digit[1-9]$/.test(ev.code)) ui.select(Number(ev.code.slice(5)) - 1);
    else if (ev.code === "KeyE") ui.toggleInventory();
    else if (ev.code === "KeyV" || ev.code === "F5") {
      ev.preventDefault();
      ctx.toggleView();
    } else if (ev.code === "KeyQ" && ui.slots[ui.sel]) r.send("vd", ui.sel);
  };
  window.addEventListener("keydown", onKey);
  cleanups.push(() => {
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    document.removeEventListener("mousedown", onDocDown);
    document.removeEventListener("mouseup", onDocUp);
    wrap.removeEventListener("wheel", onWheel, { capture: true });
    window.removeEventListener("keydown", onKey);
  });

  // ---------- celowanie ----------
  type Target = NonNullable<ReturnType<VoxelWorld["raycast"]>>;
  let target: Target | null = null;
  const eyeP = (): V3 => [body.x, body.y + 4.4, body.z];
  /** promień od kamery przez środek ekranu */
  const aim = () => {
    const dir = ctx.forward();
    const o: V3 = [...ctx.eye()];
    // w trzeciej osobie zaczynamy od wysokości gracza (żeby nie celować w bloki za plecami)
    if (!ctx.firstPerson()) {
      const e = eyeP();
      const t = (e[0] - o[0]) * dir[0] + (e[1] - o[1]) * dir[1] + (e[2] - o[2]) * dir[2];
      if (t > 0) { o[0] += dir[0] * t; o[1] += dir[1] * t; o[2] += dir[2] * t; }
    }
    return { o, dir };
  };
  const findTarget = () => {
    const { o, dir } = aim();
    const hit = w.raycast(o[0], o[1], o[2], dir[0], dir[1], dir[2], (REACH + 2) * S);
    if (!hit) return null;
    const [cx, cy, cz] = w.center(hit.x, hit.y, hit.z);
    const e = eyeP();
    return Math.hypot(e[0] - cx, e[1] - cy, e[2] - cz) <= (REACH + 1) * S ? hit : null;
  };
  const pickTier = () => {
    const it = ui.held();
    return it?.kind === "pickaxe" ? (it.tier ?? 0) : 0;
  };

  /** prawy przycisk: postaw blok albo zjedz */
  function use() {
    if (ctx.dead()) return;
    const it = ui.held();
    if (it?.kind === "food") return r.send("ve");
    if (it?.kind !== "block" || it.block === undefined || !target) return;
    const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
    const cur = w.get(x, y, z);
    if (cur !== AIR && cur !== WATER && block(cur)?.render !== "water") return;
    // nie w sobie
    const minX = w.x0 + x * S, minY = y * S, minZ = w.z0 + z * S;
    if (block(it.block)?.solid && body.x + 0.85 > minX && body.x - 0.85 < minX + S && body.z + 0.85 > minZ && body.z - 0.85 < minZ + S && body.y + 5.1 > minY && body.y + 0.05 < minY + S) return;
    w.set(x, y, z, it.block);
    r.send("vp", { x, y, z });
    sfx.play("place");
    ui.consumeHeld();
  }

  // ---------- moby ----------
  const mobs = new Map<number, Mob>();
  const zombieLook = { ...DEFAULT_AVATAR, head: "#5d9b48", torso: "#2b8a96", arms: "#5d9b48", legs: "#3a3f8f", hat: "none", shirt: "none", pants: "none", back: "none", neck: "none" };
  const makeMob = (type: string): Mob => {
    const m: Mob = { type, x: 0, y: 0, z: 0, ry: 0, tx: 0, ty: 0, tz: 0, tr: 0, phase: 0, flags: 0, parts: [], legs: 0, walking: false };
    if (type === "zombie") m.avatar = new ApexAvatar(rend, zombieLook);
    else Object.assign(m, mobParts(type, S));
    return m;
  };
  r.onMessage("vm", (list: [number, string, number, number, number, number, number][]) => {
    const seen = new Set<number>();
    for (const [id, type, x, y, z, ry, flags] of list) {
      seen.add(id);
      let m = mobs.get(id);
      if (!m) {
        m = makeMob(type);
        m.x = x; m.y = y; m.z = z;
        mobs.set(id, m);
      }
      if (flags & 1 && !(m.flags & 1)) sfx.play("hit");
      if (flags & 2 && !(m.flags & 2)) sfx.play("hiss");
      Object.assign(m, { tx: x, ty: y, tz: z, tr: ry, flags });
    }
    for (const id of [...mobs.keys()]) if (!seen.has(id)) (mobs.get(id)?.avatar?.dispose(), mobs.delete(id));
  });
  /** cios w moba na środku ekranu (zamiast kopania) */
  function attackMob(): boolean {
    if (ctx.dead()) return false;
    const { o, dir } = aim();
    let best: [number, number] | null = null;
    for (const [id, m] of mobs) {
      const t = rayBox(o[0], o[1], o[2], dir[0], dir[1], dir[2], m.x - 1, m.y, m.z - 1, m.x + 1, m.y + (m.type === "zombie" || m.type === "creeper" ? 5.2 : 3.2) * (S / 3), m.z + 1);
      if (t !== null && (!best || t < best[1])) best = [id, t];
    }
    if (!best) return false;
    const hp: V3 = [o[0] + dir[0] * best[1], o[1] + dir[1] * best[1], o[2] + dir[2] * best[1]];
    const e = eyeP();
    if (Math.hypot(hp[0] - e[0], hp[1] - e[1], hp[2] - e[2]) > (REACH + 1) * S) return false;
    if (w.raycast(o[0], o[1], o[2], dir[0], dir[1], dir[2], best[1])) return false;
    r.send("vh", best[0]);
    sfx.play("hit");
    return true;
  }

  // ---------- cząsteczki, TNT, wybuchy ----------
  const bits: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; c: Rgb }[] = [];
  const burst = (x: number, y: number, z: number, id: number) => {
    const def = block(id);
    if (!def) return;
    const c = tileRgb(def.tex[1]);
    const [cx, cy, cz] = w.center(x, y, z);
    for (let i = 0; i < 8; i++)
      bits.push({ x: cx + (Math.random() - 0.5) * S * 0.6, y: cy + (Math.random() - 0.5) * S * 0.6, z: cz + (Math.random() - 0.5) * S * 0.6, vx: (Math.random() - 0.5) * 12, vy: Math.random() * 14 + 4, vz: (Math.random() - 0.5) * 12, life: 0.7, c });
  };
  const tnts: { p: V3; until: number }[] = [];
  r.onMessage("vtnt", ([x, y, z]: number[]) => {
    tnts.push({ p: w.center(x, y, z) as V3, until: performance.now() + 2600 });
    sfx.play("hiss");
  });
  const balls: { p: V3; t: number; s: number }[] = [];
  r.onMessage("vboom", ([x, y, z]: number[]) => {
    sfx.play("boom");
    const d = Math.hypot(x - body.x, y - body.y, z - body.z);
    ctx.shake(Math.max(0, 1 - d / 60) * 0.6);
    balls.push({ p: [x, y, z], t: -0.35, s: S * 2 });
  });

  // ---------- wiadomości ----------
  r.onMessage("vx", (list: [number, number, number, number][]) => {
    for (const [x, y, z, id] of list) {
      const before = w.get(x, y, z);
      if (before === id) continue;
      if (id === AIR && before !== AIR && before !== BARRIER) {
        const [cx, cy, cz] = w.center(x, y, z);
        if (Math.hypot(cx - body.x, cy - body.y, cz - body.z) < 40 * S / 3) burst(x, y, z, before);
      }
      w.set(x, y, z, id);
    }
  });
  r.onMessage("vmsg", (text: string) => toast(text, "info"));
  r.onMessage("vsnd", (name: string) => sfx.play(name));
  // dzień i noc
  let time = 0.25;
  let dayLen = cfg.day;
  r.onMessage("vt", (m: { t: number; day: number }) => {
    time = m.t;
    dayLen = m.day;
  });
  const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const hex = (c: Rgb) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
  const sky = (t: number) => {
    // wysokość słońca: 1 w południe, -1 o północy
    const sun = Math.sin(t * Math.PI * 2);
    const day: Rgb = [0.56, 0.78, 1], dusk: Rgb = [0.95, 0.6, 0.38], night: Rgb = [0.03, 0.04, 0.1];
    const k = Math.min(1, Math.max(0, (sun + 0.25) / 0.6));
    const base = lerp3(night, day, k);
    const glow = Math.max(0, 1 - Math.abs(sun) * 4) * (sun > -0.3 ? 1 : 0);
    return { color: lerp3(base, dusk, glow * 0.6), light: 0.22 + 0.78 * k };
  };
  let skyTimer = 0;
  const applySky = () => {
    const s = sky(time);
    ctx.setSky(hex(s.color));
    ctx.setLight(s.light, w.sx * S * 0.8);
    rend.setVoxelBrightness(s.light);
  };
  applySky();

  // ---------- pad ----------
  let padMine = false;
  const pad = (p: PadState) => {
    padMine = p.down.rt;
    if (p.pressed.rt) attackMob();
    if (p.pressed.lt) use();
    if (p.pressed.rb) ui.select(ui.sel + 1);
    if (p.pressed.lb) ui.select(ui.sel - 1);
    if (p.pressed.y) ui.toggleInventory();
  };

  // ---------- co klatkę ----------
  let peakY = body.y;
  let wasGround = true;
  const update = (dt: number, swimming: boolean) => {
    view.update(body.x, body.z);
    // pora dnia płynie u nas między wiadomościami serwera
    if (dayLen > 0) time = (time + dt / dayLen) % 1;
    if ((skyTimer += dt) > 0.5) {
      skyTimer = 0;
      applySky();
    }
    cross.classList.toggle("hidden", ctx.dead());
    // upadek z wysokości
    if (!body.onGround && !swimming) peakY = Math.max(peakY, body.y);
    if (swimming) peakY = body.y;
    if (body.onGround && !wasGround) {
      const fall = (peakY - body.y) / S;
      if (fall > 3.5 && !creative) r.send("vf", fall);
      peakY = body.y;
    }
    if (body.onGround) peakY = body.y;
    wasGround = body.onGround;

    target = ctx.dead() ? null : findTarget();
    // kopanie (przytrzymanie)
    const mining = (mouseMine || touchMine || padMine) && !!target && !ctx.dead() && !document.querySelector(".modal-bg");
    if (mining && target) {
      const key = `${target.x},${target.y},${target.z}`;
      if (key !== progressKey) {
        progressKey = key;
        progress = 0;
      }
      const need = breakTime(target.id, pickTier(), creative);
      if (Number.isFinite(need)) {
        const before = progress;
        progress += dt / Math.max(0.05, need);
        if (Math.floor(before * 4) !== Math.floor(progress * 4)) sfx.dig(target.id);
        if (progress >= 1) {
          const { x, y, z, id } = target;
          burst(x, y, z, id);
          w.set(x, y, z, AIR);
          r.send("vb", { x, y, z });
          progress = 0;
          progressKey = "";
        }
      }
    } else {
      progress = 0;
      progressKey = "";
    }
    // moby: płynny ruch i nogi
    const k = Math.min(1, dt * 10);
    for (const m of mobs.values()) {
      const moved = Math.hypot(m.tx - m.x, m.tz - m.z);
      if (moved > 30) { m.x = m.tx; m.y = m.ty; m.z = m.tz; }
      else { m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; m.z += (m.tz - m.z) * k; }
      let d = m.tr - m.ry;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.ry += d * k;
      m.walking = moved > 0.05;
      m.phase += dt * (m.walking ? 9 : 0);
      if (m.avatar) {
        const a = m.avatar;
        a.x = m.x; a.y = m.y; a.z = m.z; a.ry = m.ry;
        a.anim = m.walking ? "walk" : "idle";
        a.update(dt);
        if (m.flags & 1) a.flash();
      }
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const p = bits[i];
      p.life -= dt;
      p.vy -= 60 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.life <= 0) bits.splice(i, 1);
    }
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.t += dt;
      b.s *= 1 + dt * 6;
      if (b.t >= 0) balls.splice(i, 1);
    }
    const now = performance.now();
    for (let i = tnts.length - 1; i >= 0; i--) if (now > tnts[i].until) tnts.splice(i, 1);
  };

  /** rysowanie tego, co nie jest siatką świata: ramka celu, pęknięcia, moby, cząsteczki, TNT i wybuchy */
  const draw = () => {
    if (target) {
      const x0 = w.x0 + target.x * S, y0 = target.y * S, z0 = w.z0 + target.z * S;
      const e = 0.005 * S, t = 0.012 * S, L = S + 2 * e + t;
      const col: Rgb = [0.05, 0.05, 0.05];
      // 12 krawędzi sześcianu jako cienkie pręty
      for (const yy of [-e, S + e])
        for (const zz of [-e, S + e]) rend.drawBox("box", ID3, [x0 + S / 2, y0 + yy, z0 + zz], [L, t, t], col);
      for (const xx of [-e, S + e])
        for (const zz of [-e, S + e]) rend.drawBox("box", ID3, [x0 + xx, y0 + S / 2, z0 + zz], [t, L, t], col);
      for (const xx of [-e, S + e])
        for (const yy of [-e, S + e]) rend.drawBox("box", ID3, [x0 + xx, y0 + yy, z0 + S / 2], [t, t, L], col);
      if (progress > 0) rend.drawBox("box", ID3, [x0 + S / 2, y0 + S / 2, z0 + S / 2], [S * 1.012, S * 1.012, S * 1.012], [0, 0, 0], Math.min(0.75, progress * 0.8));
    }
    const now = performance.now();
    for (const m of mobs.values()) {
      if (m.avatar) {
        m.avatar.draw();
        continue;
      }
      const flash: Rgb | null = m.flags & 1 ? rgb("#ff5555") : m.flags & 2 && Math.floor(now / 120) % 2 ? [1, 1, 1] : null;
      const root = rotY(m.ry);
      for (const p of m.parts) {
        const off = apply3(root, p.pos);
        const rot = p.leg !== undefined && m.walking ? mul3(root, rotX(Math.sin(m.phase + (p.leg % 2 ? Math.PI : 0) + (p.leg > 1 ? Math.PI : 0)) * 0.6)) : root;
        rend.drawBox("box", rot, [m.x + off[0], m.y + off[1], m.z + off[2]], p.size, flash ?? rgb(p.color));
      }
    }
    for (const p of bits) rend.drawBox("box", ID3, [p.x, p.y, p.z], [S * 0.14, S * 0.14, S * 0.14], p.c);
    for (const t of tnts) if (Math.floor(now / 200) % 2 === 0) rend.drawBox("box", ID3, t.p, [S * 1.02, S * 1.02, S * 1.02], [1, 1, 1], 0.6, MAT.neon);
    for (const b of balls) rend.drawBox("sphere", ID3, b.p, [b.s, b.s, b.s], [1, 0.9, 0.7], 0.7, MAT.neon);
  };

  return {
    world: w,
    update,
    draw,
    pad,
    get inventoryOpen() {
      return ui.inventoryOpen;
    },
    spawn: () => w.spawn(),
    hurt: () => sfx.play("hurt"),
    dispose() {
      cleanups.forEach((f) => f());
      ui.dispose();
      view.dispose();
      for (const m of mobs.values()) m.avatar?.dispose();
      mobs.clear();
      wrap.classList.remove("voxel-mode");
    },
  };
}

export type ApexVoxels = ReturnType<typeof setupVoxelsApex>;
