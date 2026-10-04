// Świat z bloków w grze: celowanie w bloki, kopanie (przytrzymaj), stawianie, pasek przedmiotów,
// ekwipunek z craftingiem, moby, dzień i noc, TNT, dźwięki i przyciski na telefon.
import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Mesh, type Scene, type ArcRotateCamera } from "@babylonjs/core";
import { AIR, block, breakTime, BARRIER, item, RECIPES, VoxelWorld, WATER, type Recipe } from "../../../shared/voxel.ts";
import { rayBox, type Body } from "../../../shared/physics.ts";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import type { BlockWorldDef } from "../../../shared/types.ts";
import type { GameConnection } from "./connection.ts";
import type { PadState } from "../engine/gamepad.ts";
import { AvatarModel } from "../engine/avatar.ts";
import { itemIcon, tileColor, VoxelView, PLACEABLE } from "../engine/voxelView.ts";
import { h, isTouch, modal, toast } from "../ui/dom.ts";
import type { WorldView } from "../engine/world.ts";

type Slot = [string, number] | null;
const HOTBAR = 9;
const REACH = 5;

interface MobView {
  type: string;
  root: TransformNode;
  legs: Mesh[];
  avatar?: AvatarModel;
  body: Mesh[];
  /** zwykłe materiały części (po błysku wracają) */
  mats: (StandardMaterial | null)[];
  tx: number;
  ty: number;
  tz: number;
  tr: number;
  phase: number;
  flags: number;
}

export interface VoxelCtx {
  scene: Scene;
  camera: ArcRotateCamera;
  world: WorldView;
  wrap: HTMLElement;
  conn: GameConnection;
  body: Body;
  /** czy kamera jest w pierwszej osobie */
  firstPerson: () => boolean;
  dead: () => boolean;
  /** przełączenie widoku (pierwsza / trzecia osoba) */
  toggleView: () => void;
  shadows: ConstructorParameters<typeof AvatarModel>[2];
}

/** dźwięki z szumu i tonów (bez plików) */
class Sfx {
  private ac: AudioContext | null = null;
  private ctx() {
    if (!this.ac) {
      try {
        this.ac = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ac.state === "suspended") void this.ac.resume();
    return this.ac;
  }
  noise(dur: number, freq: number, vol: number, q = 1) {
    const ac = this.ctx();
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }
  tone(freq: number, dur: number, vol: number, type: OscillatorType = "square") {
    const ac = this.ctx();
    if (!ac) return;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  }
  dig(id: number) {
    const def = block(id);
    const stone = def?.pick;
    this.noise(0.12, stone ? 1800 : id === 7 ? 3000 : 700, 0.35, stone ? 3 : 1);
  }
  play(name: string) {
    if (name === "place") this.noise(0.09, 500, 0.4);
    else if (name === "craft") (this.tone(660, 0.08, 0.06), setTimeout(() => this.tone(880, 0.1, 0.06), 70));
    else if (name === "fire") this.noise(0.4, 400, 0.25, 0.5);
    else if (name === "eat") for (let i = 0; i < 3; i++) setTimeout(() => this.noise(0.08, 1200, 0.3, 2), i * 120);
    else if (name === "boom") (this.noise(1.2, 120, 1.2, 0.4), this.noise(0.5, 600, 0.5, 0.5));
    else if (name === "hiss") this.noise(1.5, 4000, 0.15, 0.3);
    else if (name === "hit") this.noise(0.1, 900, 0.5, 2);
    else if (name === "hurt") this.tone(180, 0.15, 0.08, "sawtooth");
  }
}

export function setupVoxels(cfg: BlockWorldDef, ctx: VoxelCtx) {
  const { scene, camera, wrap, conn: r, body } = ctx;
  const w = new VoxelWorld(cfg);
  const view = new VoxelView(scene, w);
  w.onChange = (x, y, z) => view.changed(x, y, z);
  const S = w.S;
  const sfx = new Sfx();
  const creative = cfg.mode === "creative";
  let slots: Slot[] = new Array(36).fill(null);
  let sel = 0;
  const cleanups: (() => void)[] = [];
  /** okno ekwipunku (otwarte = funkcje zamknięcia i odświeżenia) - przed rejestracją wiadomości, bo połączenie oddaje je od razu */
  let invClose: (() => void) | null = null;
  let renderInv: (() => void) | null = null;
  wrap.classList.add("voxel-mode");

  // ---------- celownik, ramka bloku i pęknięcia ----------
  const cross = h("div", { class: "vox-cross" });
  wrap.append(cross);
  const lineMat = new StandardMaterial("vox-line", scene);
  lineMat.emissiveColor = Color3.Black();
  lineMat.disableLighting = true;
  const e = 0.005 * S;
  const c0 = -e, c1 = S + e;
  const corners = [[c0, c0, c0], [c1, c0, c0], [c1, c0, c1], [c0, c0, c1], [c0, c1, c0], [c1, c1, c0], [c1, c1, c1], [c0, c1, c1]].map((p) => new Vector3(p[0], p[1], p[2]));
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const outline = MeshBuilder.CreateLineSystem("vox-outline", { lines: edges.map(([a, b]) => [corners[a], corners[b]]) }, scene);
  outline.color = new Color3(0.05, 0.05, 0.05);
  outline.isPickable = false;
  outline.setEnabled(false);
  const crackMat = new StandardMaterial("vox-crack", scene);
  crackMat.diffuseColor = Color3.Black();
  crackMat.disableLighting = true;
  crackMat.alpha = 0;
  const crack = MeshBuilder.CreateBox("vox-crack", { size: S * 1.012 }, scene);
  crack.material = crackMat;
  crack.isPickable = false;
  crack.setEnabled(false);

  // ---------- pasek przedmiotów ----------
  const bar = h("div", { class: "vox-hotbar" });
  const nameTip = h("div", { class: "vox-name" });
  wrap.append(bar, nameTip);
  let tipTimer = 0;
  const showName = () => {
    const s = slots[sel];
    nameTip.textContent = s ? item(s[0])?.name ?? s[0] : "";
    nameTip.classList.toggle("on", !!s);
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => nameTip.classList.remove("on"), 1500);
  };
  const renderBar = () => {
    bar.replaceChildren(
      ...slots.slice(0, HOTBAR).map((s, i) =>
        h(
          "button",
          { class: "vox-slot" + (i === sel ? " on" : ""), onClick: () => select(i) },
          s ? h("img", { src: itemIcon(s[0]), alt: s[0], draggable: false }) : null,
          s && s[1] > 1 ? h("span", { class: "vox-count" }, String(s[1])) : null,
        ),
      ),
      h("button", { class: "vox-slot vox-bag", title: "Ekwipunek (E)", onClick: () => openInventory() }, "🎒"),
    );
  };
  const select = (i: number) => {
    sel = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    r.send("vs", sel);
    renderBar();
    showName();
    progress = 0;
  };
  renderBar();

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
    const viewBtn = h("div", { class: "vox-btn vox-view", onClick: () => ctx.toggleView() }, "👁");
    wrap.append(mineBtn, placeBtn, viewBtn);
  }

  // ---------- myszka i klawiatura ----------
  let mouseMine = false;
  let rDown: { x: number; y: number; t: number } | null = null;
  const canvas = scene.getEngine().getRenderingCanvas()!;
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
  // kółko myszy: następny / poprzedni przedmiot (zamiast przybliżania)
  const onWheel = (ev: WheelEvent) => {
    if (ev.target !== canvas) return;
    ev.preventDefault();
    ev.stopPropagation();
    select(sel + (ev.deltaY > 0 ? 1 : -1));
  };
  wrap.addEventListener("wheel", onWheel, { capture: true, passive: false });
  const onKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (/^Digit[1-9]$/.test(ev.code)) select(Number(ev.code.slice(5)) - 1);
    else if (ev.code === "KeyE") invClose ? invClose() : openInventory();
    else if (ev.code === "KeyV" || ev.code === "F5") {
      ev.preventDefault();
      ctx.toggleView();
    } else if (ev.code === "KeyQ" && slots[sel]) r.send("vd", sel);
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
  let progress = 0;
  let progressKey = "";
  const eye = () => new Vector3(body.x, body.y + 4.4, body.z);
  /** promień od kamery przez środek ekranu */
  const aim = () => {
    const dir = camera.getForwardRay(1).direction;
    const o = camera.globalPosition.clone();
    // w trzeciej osobie zaczynamy od wysokości gracza (żeby nie celować w bloki za plecami)
    if (!ctx.firstPerson()) {
      const t = Vector3.Dot(eye().subtract(o), dir);
      if (t > 0) o.addInPlace(dir.scale(t));
    }
    return { o, dir };
  };
  const findTarget = () => {
    const { o, dir } = aim();
    const hit = w.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, (REACH + 2) * S);
    if (!hit) return null;
    const [cx, cy, cz] = w.center(hit.x, hit.y, hit.z);
    return Vector3.Distance(eye(), new Vector3(cx, cy, cz)) <= (REACH + 1) * S ? hit : null;
  };

  const heldItem = () => {
    const s = slots[sel];
    return s ? item(s[0]) : undefined;
  };
  const pickTier = () => {
    const it = heldItem();
    return it?.kind === "pickaxe" ? (it.tier ?? 0) : 0;
  };

  /** prawy przycisk: postaw blok albo zjedz */
  function use() {
    if (ctx.dead()) return;
    const it = heldItem();
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
    if (!creative && slots[sel]) {
      slots[sel]![1]--;
      if (slots[sel]![1] <= 0) slots[sel] = null;
      renderBar();
    }
  }

  // ---------- moby ----------
  const mobs = new Map<number, MobView>();
  const mobMats = new Map<string, StandardMaterial>();
  const mobMat = (c: string) => {
    let m = mobMats.get(c);
    if (!m) {
      m = new StandardMaterial("mob" + c, scene);
      m.diffuseColor = Color3.FromHexString(c);
      m.specularColor = Color3.Black();
      mobMats.set(c, m);
    }
    return m;
  };
  const box = (parent: TransformNode, wd: number, ht: number, dp: number, x: number, y: number, z: number, color: string) => {
    const m = MeshBuilder.CreateBox("mobpart", { width: wd, height: ht, depth: dp }, scene);
    m.material = mobMat(color);
    m.position.set(x, y, z);
    m.parent = parent;
    m.isPickable = false;
    return m;
  };
  const makeMob = (type: string): MobView => {
    const root = new TransformNode("mob-" + type, scene);
    const v: MobView = { type, root, legs: [], body: [], mats: [], tx: 0, ty: 0, tz: 0, tr: 0, phase: 0, flags: 0 };
    if (type === "zombie") {
      v.avatar = new AvatarModel(scene, { ...DEFAULT_AVATAR, head: "#5d9b48", torso: "#2b8a96", arms: "#5d9b48", legs: "#3a3f8f", hat: "none", shirt: "none", pants: "none", back: "none", neck: "none" }, ctx.shadows, true);
      v.avatar.root.parent = root;
      return v;
    }
    const k = S / 3;
    if (type === "creeper") {
      const g = "#4cae3c";
      v.body.push(box(root, 1.6 * k, 2.6 * k, 1.0 * k, 0, 2.4 * k, 0, g));
      v.body.push(box(root, 1.6 * k, 1.6 * k, 1.6 * k, 0, 4.5 * k, 0, g));
      // twarz
      v.body.push(box(root, 0.35 * k, 0.35 * k, 0.05 * k, -0.35 * k, 4.75 * k, -0.81 * k, "#111111"), box(root, 0.35 * k, 0.35 * k, 0.05 * k, 0.35 * k, 4.75 * k, -0.81 * k, "#111111"));
      v.body.push(box(root, 0.45 * k, 0.6 * k, 0.05 * k, 0, 4.25 * k, -0.81 * k, "#111111"));
      for (const [lx, lz] of [[-0.45, -0.6], [0.45, -0.6], [-0.45, 0.6], [0.45, 0.6]]) v.legs.push(box(root, 0.7 * k, 1.1 * k, 0.7 * k, lx * k, 0.55 * k, lz * k, "#3c8f30"));
      return v;
    }
    const col = type === "pig" ? "#f0a5a2" : type === "sheep" ? "#ececec" : "#5b3b24";
    const legCol = type === "pig" ? "#e0908d" : type === "sheep" ? "#d8c8b0" : "#3f2918";
    const headCol = type === "sheep" ? "#d8c8b0" : col;
    v.body.push(box(root, 1.8 * k, 1.5 * k, 2.8 * k, 0, 2.1 * k, 0, col));
    v.body.push(box(root, 1.4 * k, 1.4 * k, 1.3 * k, 0, 2.6 * k, -1.8 * k, headCol));
    if (type === "pig") v.body.push(box(root, 0.8 * k, 0.5 * k, 0.2 * k, 0, 2.4 * k, -2.5 * k, "#e88f8c"));
    if (type === "cow") v.body.push(box(root, 1.9 * k, 0.8 * k, 1.2 * k, 0, 2.3 * k, 0.4 * k, "#f2f2f2"), box(root, 0.8 * k, 0.5 * k, 0.2 * k, 0, 2.3 * k, -2.5 * k, "#d9a0a0"));
    for (const [lx, lz] of [[-0.55, -0.95], [0.55, -0.95], [-0.55, 0.95], [0.55, 0.95]]) v.legs.push(box(root, 0.55 * k, 1.4 * k, 0.55 * k, lx * k, 0.7 * k, lz * k, legCol));
    return v;
  };
  const removeMob = (id: number) => {
    const m = mobs.get(id);
    if (!m) return;
    m.avatar?.dispose();
    m.root.dispose();
    mobs.delete(id);
  };
  r.onMessage("vm", (list: [number, string, number, number, number, number, number][]) => {
    const seen = new Set<number>();
    for (const [id, type, x, y, z, ry, flags] of list) {
      seen.add(id);
      let m = mobs.get(id);
      if (!m) {
        m = makeMob(type);
        m.mats = m.body.map((b) => b.material as StandardMaterial | null);
        m.root.position.set(x, y, z);
        mobs.set(id, m);
      }
      if (flags & 1 && !(m.flags & 1)) sfx.play("hit");
      if (flags & 2 && !(m.flags & 2)) sfx.play("hiss");
      Object.assign(m, { tx: x, ty: y, tz: z, tr: ry, flags });
    }
    for (const id of [...mobs.keys()]) if (!seen.has(id)) removeMob(id);
  });
  /** cios w moba na środku ekranu (zamiast kopania) */
  function attackMob(): boolean {
    if (ctx.dead()) return false;
    const { o, dir } = aim();
    let best: [number, number] | null = null;
    for (const [id, m] of mobs) {
      const p = m.root.position;
      const t = rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, p.x - 1, p.y, p.z - 1, p.x + 1, p.y + (m.type === "zombie" || m.type === "creeper" ? 5.2 : 3.2) * (S / 3), p.z + 1);
      if (t !== null && (!best || t < best[1])) best = [id, t];
    }
    if (!best) return false;
    const hitPoint = o.add(dir.scale(best[1]));
    if (Vector3.Distance(hitPoint, eye()) > (REACH + 1) * S) return false;
    const blockHit = w.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, best[1]);
    if (blockHit) return false;
    r.send("vh", best[0]);
    sfx.play("hit");
    return true;
  }

  // ---------- cząsteczki, TNT, wybuchy ----------
  const particles: { m: Mesh; vx: number; vy: number; vz: number; life: number }[] = [];
  const burst = (x: number, y: number, z: number, id: number) => {
    const def = block(id);
    if (!def) return;
    const mat = mobMat("#" + tileColor(def.tex[1]).toHexString().slice(1));
    const [cx, cy, cz] = w.center(x, y, z);
    for (let i = 0; i < 8; i++) {
      const m = MeshBuilder.CreateBox("pt", { size: S * 0.14 }, scene);
      m.material = mat;
      m.isPickable = false;
      m.position.set(cx + (Math.random() - 0.5) * S * 0.6, cy + (Math.random() - 0.5) * S * 0.6, cz + (Math.random() - 0.5) * S * 0.6);
      particles.push({ m, vx: (Math.random() - 0.5) * 12, vy: Math.random() * 14 + 4, vz: (Math.random() - 0.5) * 12, life: 0.7 });
    }
  };
  const tnts: { m: Mesh; until: number }[] = [];
  const flashMat = new StandardMaterial("tnt-flash", scene);
  flashMat.emissiveColor = Color3.White();
  flashMat.disableLighting = true;
  flashMat.alpha = 0.6;
  r.onMessage("vtnt", ([x, y, z]: number[]) => {
    const m = MeshBuilder.CreateBox("tnt", { size: S * 1.02 }, scene);
    const [cx, cy, cz] = w.center(x, y, z);
    m.position.set(cx, cy, cz);
    m.material = flashMat;
    tnts.push({ m, until: performance.now() + 2600 });
    sfx.play("hiss");
  });
  let shake = 0;
  r.onMessage("vboom", ([x, y, z]: number[]) => {
    sfx.play("boom");
    const d = Math.hypot(x - body.x, y - body.y, z - body.z);
    shake = Math.max(shake, Math.max(0, 1 - d / 60) * 0.6);
    const ball = MeshBuilder.CreateSphere("boom", { diameter: S * 2, segments: 8 }, scene);
    const bm = new StandardMaterial("boom", scene);
    bm.emissiveColor = new Color3(1, 0.9, 0.7);
    bm.disableLighting = true;
    bm.alpha = 0.7;
    ball.material = bm;
    ball.position.set(x, y, z);
    particles.push({ m: ball, vx: 0, vy: 0, vz: 0, life: -0.35 });
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
  r.onMessage("vi", (m: { s: Slot[]; sel: number }) => {
    slots = m.s;
    renderBar();
    renderInv?.();
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
  const sky = (t: number) => {
    // wysokość słońca: 1 w południe, -1 o północy
    const sun = Math.sin(t * Math.PI * 2);
    const day = new Color3(0.56, 0.78, 1), dusk = new Color3(0.95, 0.6, 0.38), night = new Color3(0.03, 0.04, 0.1);
    const k = Math.min(1, Math.max(0, (sun + 0.25) / 0.6));
    const base = Color3.Lerp(night, day, k);
    const glow = Math.max(0, 1 - Math.abs(sun) * 4) * (sun > -0.3 ? 1 : 0);
    return { color: Color3.Lerp(base, dusk, glow * 0.6), light: 0.22 + 0.78 * k };
  };
  let skyTimer = 0;
  const applySky = () => {
    const s = sky(time);
    ctx.world.setSky(s.color.toHexString());
    ctx.world.setLight(s.light, w.sx * S * 0.8);
    view.setBrightness(s.light);
  };
  applySky();

  // ---------- ekwipunek i crafting ----------
  function openInventory() {
    if (invClose) return;
    let picked: number | null = null;
    const body = h("div", { class: "vox-inv" });
    const slotEl = (i: number) => {
      const s = slots[i];
      return h(
        "button",
        {
          class: "vox-slot" + (picked === i ? " picked" : "") + (i === sel ? " on" : ""),
          "data-pad": "1",
          title: s ? `${item(s[0])?.name ?? s[0]} ×${s[1]}` : "",
          onClick: () => {
            if (picked === null) picked = s ? i : null;
            else {
              if (picked !== i) r.send("vsw", { a: picked, b: i });
              picked = null;
            }
            renderInv?.();
          },
        },
        s ? h("img", { src: itemIcon(s[0]), alt: s[0], draggable: false }) : null,
        s && s[1] > 1 ? h("span", { class: "vox-count" }, String(s[1])) : null,
      );
    };
    const have = (key: string) => slots.reduce((n, s) => n + (s?.[0] === key ? s[1] : 0), 0);
    const recipeRow = (rc: Recipe) => {
      const ok = rc.in.every(([k, n]) => have(k) >= n);
      const out = item(rc.out[0]);
      return h(
        "div",
        { class: "vox-recipe" + (ok ? "" : " missing") },
        h("img", { src: itemIcon(rc.out[0]), alt: "" }),
        h("div", { class: "vox-r-main" }, h("b", null, `${out?.name ?? rc.out[0]}${rc.out[1] > 1 ? " ×" + rc.out[1] : ""}`), h("span", { class: "muted small" }, rc.in.map(([k, n]) => `${n}× ${item(k)?.name ?? k}`).join(" + ") + (rc.station === "table" ? " · 🪵 stół" : rc.station === "furnace" ? " · 🔥 piec" : ""))),
        h("button", { class: "btn small" + (ok ? " primary" : ""), "data-pad": "1", disabled: !ok, onClick: () => r.send("vc", { id: rc.id, n: 1 }) }, "Zrób"),
      );
    };
    renderInv = () => {
      const grid = h("div", { class: "vox-grid" }, ...Array.from({ length: 27 }, (_, i) => slotEl(HOTBAR + i)));
      const hot = h("div", { class: "vox-grid hot" }, ...Array.from({ length: HOTBAR }, (_, i) => slotEl(i)));
      const tools = h(
        "div",
        { class: "row" },
        h("span", { class: "muted small" }, picked !== null ? "Kliknij inne miejsce, żeby przenieść" : "Kliknij przedmiot, potem miejsce"),
        picked !== null ? h("button", { class: "btn small danger", onClick: () => (r.send("vd", picked), (picked = null)) }, "🗑 Wyrzuć") : null,
      );
      let side: HTMLElement;
      if (creative) {
        side = h(
          "div",
          { class: "vox-palette" },
          h("div", { class: "prop-group" }, `Wszystkie przedmioty - kliknij, żeby dać do miejsca ${sel + 1} paska`),
          h(
            "div",
            { class: "vox-grid pal" },
            ...[...PLACEABLE, "wood_pickaxe", "diamond_pickaxe", "diamond_sword", "apple", "cooked_porkchop", "coal", "iron_ingot", "gold_ingot", "diamond", "stick", "gunpowder"].map((k) =>
              h("button", { class: "vox-slot", "data-pad": "1", title: item(k)?.name ?? k, onClick: () => r.send("vg", { slot: sel, key: k }) }, h("img", { src: itemIcon(k), alt: k })),
            ),
          ),
        );
      } else {
        const list = [...RECIPES].sort((a, b) => Number(b.in.every(([k, n]) => have(k) >= n)) - Number(a.in.every(([k, n]) => have(k) >= n)));
        side = h("div", { class: "vox-crafting" }, h("div", { class: "prop-group" }, "🔨 Crafting"), ...list.map(recipeRow));
      }
      body.replaceChildren(h("div", { class: "vox-inv-left" }, h("div", { class: "prop-group" }, "🎒 Plecak"), grid, h("div", { class: "prop-group" }, "Pasek"), hot, tools), side);
    };
    renderInv();
    const close = modal(creative ? "🎒 Ekwipunek (tryb kreatywny)" : "🎒 Ekwipunek i crafting", body);
    const bg = body.closest(".modal-bg");
    bg?.classList.add("vox-modal");
    invClose = () => {
      close();
      invClose = null;
      renderInv = null;
    };
    // zamknięcie krzyżykiem / kliknięciem obok
    const obs = new MutationObserver(() => {
      if (!bg?.isConnected) {
        invClose = null;
        renderInv = null;
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true });
  }

  // ---------- pad ----------
  let padMine = false;
  const pad = (p: PadState) => {
    padMine = p.down.rt;
    if (p.pressed.rt) attackMob();
    if (p.pressed.lt) use();
    if (p.pressed.rb) select(sel + 1);
    if (p.pressed.lb) select(sel - 1);
    if (p.pressed.y) invClose ? invClose() : openInventory();
  };

  // ---------- co klatkę ----------
  let peakY = body.y;
  let wasGround = true;
  let lastHp = 0;
  void lastHp;
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
    if (target) {
      outline.setEnabled(true);
      outline.position.set(w.x0 + target.x * S, target.y * S, w.z0 + target.z * S);
    } else outline.setEnabled(false);
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
      const [cx, cy, cz] = w.center(target.x, target.y, target.z);
      crack.position.set(cx, cy, cz);
      crack.setEnabled(progress > 0);
      crackMat.alpha = Math.min(0.75, progress * 0.8);
    } else {
      progress = 0;
      progressKey = "";
      crack.setEnabled(false);
    }
    // moby: płynny ruch i nogi
    const k = Math.min(1, dt * 10);
    for (const m of mobs.values()) {
      const p = m.root.position;
      const moved = Math.hypot(m.tx - p.x, m.tz - p.z);
      if (moved > 30) p.set(m.tx, m.ty, m.tz);
      else p.set(p.x + (m.tx - p.x) * k, p.y + (m.ty - p.y) * k, p.z + (m.tz - p.z) * k);
      let d = m.tr - m.root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.root.rotation.y += d * k;
      const walking = moved > 0.05;
      m.phase += dt * (walking ? 9 : 0);
      for (let i = 0; i < m.legs.length; i++) m.legs[i].rotation.x = walking ? Math.sin(m.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0;
      if (m.avatar) {
        m.avatar.anim = walking ? "walk" : "idle";
        m.avatar.update(dt);
      }
      // trafiony = czerwony błysk, creeper przed wybuchem miga na biało
      const flash = m.flags & 1 ? "#ff5555" : m.flags & 2 && Math.floor(performance.now() / 120) % 2 ? "#ffffff" : null;
      m.body.forEach((b, i) => (b.material = flash ? mobMat(flash) : m.mats[i]));
      if (m.avatar && m.flags & 1) m.avatar.flash();
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.life < 0) {
        // kula wybuchu: rośnie i znika
        p.life += dt;
        p.m.scaling.scaleInPlace(1 + dt * 6);
        if (p.life >= 0) (p.m.dispose(), particles.splice(i, 1));
        continue;
      }
      p.life -= dt;
      p.vy -= 60 * dt;
      p.m.position.addInPlaceFromFloats(p.vx * dt, p.vy * dt, p.vz * dt);
      if (p.life <= 0) (p.m.dispose(), particles.splice(i, 1));
    }
    const now = performance.now();
    for (let i = tnts.length - 1; i >= 0; i--) {
      tnts[i].m.setEnabled(Math.floor(now / 200) % 2 === 0);
      if (now > tnts[i].until) (tnts[i].m.dispose(), tnts.splice(i, 1));
    }
    if (shake > 0.001) {
      camera.alpha += (Math.random() - 0.5) * shake * 0.05;
      camera.beta += (Math.random() - 0.5) * shake * 0.05;
      shake *= Math.max(0, 1 - dt * 5);
    }
  };

  return {
    world: w,
    update,
    pad,
    get inventoryOpen() {
      return !!invClose;
    },
    spawn: () => w.spawn(),
    /** stan do testów */
    get debug() {
      return { mouseMine, touchMine, target, progress, modal: !!document.querySelector(".modal-bg") };
    },
    hurt: () => sfx.play("hurt"),
    dispose() {
      cleanups.forEach((f) => f());
      invClose?.();
      view.dispose();
      for (const id of [...mobs.keys()]) removeMob(id);
      wrap.classList.remove("voxel-mode");
    },
  };
}

export type VoxelPlay = ReturnType<typeof setupVoxels>;
