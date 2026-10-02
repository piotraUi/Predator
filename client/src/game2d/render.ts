// Rysowanie poziomu 2D na płótnie: tło, obiekty (sprite'y, kafelki, teksty), postacie,
// światła w ciemności i napisy na ekranie (HUD). Używa go gra i edytor Studio 2D.
import type { Inst2D, InstState2D, Level2D, LevelBg2D, Obj2D, World2D } from "../../../shared/types2d.ts";
import { drawBitmapText, type AssetStore } from "./assets.ts";

/** Rozdzielczość bazowa - jak w GDevelop (1280x720), do niej dopasowujemy ekran */
export const BASE_W = 1280;
export const BASE_H = 720;

export interface Camera2D {
  /** środek widoku w świecie */
  x: number;
  y: number;
  /** pikseli ekranu na jednostkę świata */
  scale: number;
}

/** Coś ruchomego do narysowania: gracz, potwór, towarzysz */
export interface Entity2D {
  obj: Obj2D;
  x: number;
  y: number;
  w: number;
  h: number;
  flip: boolean;
  anim: string;
  animStart: number;
  /** zatrzymaj animację (np. drabina bez ruchu) */
  paused?: boolean;
  alpha?: number;
  label?: string;
}

export interface TextVars {
  coins: number;
  left: number;
  time: number;
  player: string;
}

/** skala ekranu: jak w GDevelop (dopasowanie do 1280x720), a na telefonie trzymanym pionowo - do krótszego boku */
export function hudScale(w: number, h: number) {
  return Math.max(Math.min(w / BASE_W, h / BASE_H), Math.min(w, h) / BASE_H);
}
export function fitScale(w: number, h: number, zoom: number) {
  return hudScale(w, h) * zoom;
}

export class LevelView {
  level!: Level2D;
  objs = new Map<string, Obj2D>();
  state = new Map<string, InstState2D>();
  /** zebrane przez tego gracza */
  hiddenLocal = new Set<string>();
  created: Inst2D[] = [];
  removed = new Set<string>();
  background = "#87ceeb";
  vars: TextVars = { coins: 0, left: 0, time: 0, player: "" };
  private sorted: Inst2D[] | null = null;
  private lightCanvas: HTMLCanvasElement | null = null;

  constructor(
    public world: World2D,
    public assets: AssetStore,
  ) {
    for (const o of world.objects) this.objs.set(o.id, o);
  }

  /** po dodaniu / usunięciu obiektów w edytorze */
  refreshObjects() {
    this.objs = new Map(this.world.objects.map((o) => [o.id, o]));
    this.invalidate();
  }

  /** kamera, w której rysowana jest dana instancja (tło i ekran mają własne) */
  camFor(i: Inst2D, cam: Camera2D, W: number, H: number): Camera2D {
    if (i.layer === "bg") {
      const p = i.parallax ?? 0;
      return { x: cam.x * p + (1 - p) * (BASE_W / 2), y: cam.y * p + (1 - p) * (BASE_H / 2), scale: cam.scale };
    }
    if (i.layer === "hud") {
      const s = hudScale(W, H);
      return { x: W / s / 2, y: H / s / 2, scale: s };
    }
    return cam;
  }

  setLevel(level: Level2D) {
    this.level = level;
    this.state.clear();
    this.hiddenLocal.clear();
    this.created = [];
    this.removed.clear();
    this.background = level.background;
    this.invalidate();
  }

  invalidate() {
    this.sorted = null;
  }

  /** instancje w kolejności rysowania */
  instances(): Inst2D[] {
    if (this.sorted) return this.sorted;
    const order = { bg: 0, main: 1, hud: 2 };
    this.sorted = [...this.level.instances.filter((i) => !this.removed.has(i.id)), ...this.created].sort(
      (a, b) => order[a.layer] - order[b.layer] || a.z - b.z,
    );
    return this.sorted;
  }

  isHidden(i: Inst2D, o: Obj2D, editor = false) {
    if (this.state.get(i.id)?.hidden || this.hiddenLocal.has(i.id)) return true;
    return !editor && !!o.hidden;
  }

  /** pozycja instancji po zmianach ze skryptów */
  pos(i: Inst2D) {
    const st = this.state.get(i.id);
    const x = st?.x ?? i.x, y = st?.y ?? i.y;
    // przesuwanie ze skryptu (moveObject) - płynnie od "from" do x, y
    const t0 = this.moves.get(i.id);
    if (st?.from && st.dur && t0 !== undefined) {
      const k = (performance.now() - t0) / 1000 / st.dur;
      if (k < 1) return { x: st.from.x + (x - st.from.x) * k, y: st.from.y + (y - st.from.y) * k };
      this.moves.delete(i.id);
    }
    return { x, y };
  }
  /** kiedy (performance.now) zaczęło się przesuwanie instancji */
  readonly moves = new Map<string, number>();

  animOf(i: Inst2D, o: Obj2D) {
    const name = this.state.get(i.id)?.anim ?? i.anim;
    return (name !== undefined && o.anims.find((a) => a.name === name)) || o.anims[0];
  }

  private frame(o: Obj2D, animName: string | undefined, t: number, anim = animName !== undefined ? o.anims.find((a) => a.name === animName) : undefined) {
    const a = anim ?? o.anims[0];
    if (!a || !a.frames.length) return null;
    let n = Math.floor(Math.max(0, t) / a.frameTime);
    n = a.loop ? n % a.frames.length : Math.min(n, a.frames.length - 1);
    return this.assets.image(a.frames[n]);
  }

  /** Rysuje cały widok. `t` - czas w sekundach (animacje). */
  draw(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    cam: Camera2D,
    t: number,
    entities: Entity2D[],
    opts: { editor?: boolean; hud?: boolean } = {},
  ) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, W, H);
    if (this.level.bg) this.drawLevelBg(ctx, W, H, cam, this.level.bg);
    const list = this.instances();
    const hs = hudScale(W, H);
    // tło: warstwa z własną kamerą (parallax 0 = stoi w miejscu jak w GDevelop)
    for (const i of list) {
      if (i.layer !== "bg") continue;
      const p = i.parallax ?? 0;
      const c: Camera2D = { x: cam.x * p + (1 - p) * (BASE_W / 2), y: cam.y * p + (1 - p) * (BASE_H / 2), scale: cam.scale };
      this.drawInst(ctx, W, H, c, i, t, opts.editor, false);
    }
    // świat
    const vw = W / cam.scale, vh = H / cam.scale;
    const vx = cam.x - vw / 2, vy = cam.y - vh / 2;
    for (const i of list) {
      if (i.layer !== "main") continue;
      const p = this.pos(i);
      // obrócony obiekt może sięgać dalej niż przed obrotem (np. deska obrócona o 90° to wysoka ściana)
      const m = i.angle ? Math.max(i.w, i.h) / 2 : 0;
      if (p.x - m > vx + vw || p.y - m > vy + vh || p.x + i.w + m < vx || p.y + i.h + m < vy) continue;
      this.drawInst(ctx, W, H, cam, i, t, opts.editor, true);
    }
    for (const e of entities) this.drawEntity(ctx, W, H, cam, e, t);
    if (this.level.ambient && !opts.editor) this.drawLights(ctx, W, H, cam, list, hs);
    // napisy nad graczami
    ctx.font = `bold ${Math.max(11, Math.round(12 * Math.min(2, cam.scale)))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    for (const e of entities) {
      if (!e.label) continue;
      const sx = (e.x + e.w / 2 - cam.x) * cam.scale + W / 2;
      const sy = (e.y - cam.y) * cam.scale + H / 2 - 6;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.6)";
      ctx.strokeText(e.label, sx, sy);
      ctx.fillStyle = "#fff";
      ctx.fillText(e.label, sx, sy);
    }
    ctx.textAlign = "left";
    // ekran (HUD)
    if (opts.hud !== false) {
      const hudCam: Camera2D = { x: W / hs / 2, y: H / hs / 2, scale: hs };
      for (const i of list) if (i.layer === "hud") this.drawInst(ctx, W, H, hudCam, i, t, opts.editor, false);
    }
    ctx.restore();
  }

  /** obrazek tła z ustawień poziomu - pod wszystkimi obiektami */
  private drawLevelBg(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera2D, bg: LevelBg2D) {
    const img = this.assets.image(bg.image);
    if (!img) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    ctx.save();
    ctx.globalAlpha *= bg.opacity;
    ctx.imageSmoothingEnabled = !this.assets.isPixel(bg.image);
    if (bg.mode === "tile" || bg.mode === "tileX") {
      const pat = this.assets.pattern(ctx, bg.image);
      if (pat) {
        // parallax 0: od lewego górnego rogu ekranu; 1: jak obiekty w świecie
        const s = cam.scale;
        const p = bg.parallax;
        const ox = (bg.x - cam.x * p) * s + (W / 2) * p;
        const oy = (bg.y - cam.y * p) * s + (H / 2) * p;
        const k = bg.scale * s;
        pat.setTransform(new DOMMatrix([k, 0, 0, k, ox, oy]));
        ctx.fillStyle = pat;
        if (bg.mode === "tile") ctx.fillRect(0, 0, W, H);
        else ctx.fillRect(0, Math.round(oy), W, Math.round(ih * k));
      }
    } else if (bg.mode === "stretch") {
      ctx.drawImage(img, 0, 0, W, H);
    } else {
      const k = bg.mode === "cover" ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
      const dw = iw * k, dh = ih * k;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    ctx.restore();
  }

  private rect(W: number, H: number, cam: Camera2D, x: number, y: number, w: number, h: number) {
    // zaokrąglone krawędzie - bez szpar między kafelkami
    const x0 = Math.round((x - cam.x) * cam.scale + W / 2);
    const y0 = Math.round((y - cam.y) * cam.scale + H / 2);
    const x1 = Math.round((x + w - cam.x) * cam.scale + W / 2);
    const y1 = Math.round((y + h - cam.y) * cam.scale + H / 2);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private drawInst(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera2D, i: Inst2D, t: number, editor = false, world = true) {
    if (i.opacity !== undefined && i.opacity < 1) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * i.opacity;
      this.drawInstTurned(ctx, W, H, cam, i, t, editor, world);
      ctx.globalAlpha = a;
      return;
    }
    this.drawInstTurned(ctx, W, H, cam, i, t, editor, world);
  }

  private drawInstTurned(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera2D, i: Inst2D, t: number, editor = false, world = true) {
    if (!i.angle) return this.drawInstFlat(ctx, W, H, cam, i, t, editor, world);
    // obrót wokół środka obiektu (np. latarnie w GDevelopie obrócone o 90°)
    const p = this.pos(i);
    const r = this.rect(W, H, cam, p.x, p.y, i.w, i.h);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i.angle * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    this.drawInstFlat(ctx, W, H, cam, i, t, editor, world);
    ctx.restore();
  }

  private drawInstFlat(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera2D, i: Inst2D, t: number, editor = false, world = true) {
    const o = this.objs.get(i.obj);
    if (!o || o.kind === "light") return;
    if (this.isHidden(i, o, editor)) return;
    const p = this.pos(i);
    const r = this.rect(W, H, cam, p.x, p.y, i.w, i.h);
    if (r.w <= 0 || r.h <= 0) return;
    const ghost = editor && o.hidden;
    if (ghost) ctx.globalAlpha = 0.45;
    if (o.kind === "sprite") {
      const img = this.frame(o, this.state.get(i.id)?.anim ?? i.anim, t);
      if (img) {
        if (this.state.get(i.id)?.flip ?? i.flip) {
          ctx.save();
          ctx.translate(r.x + r.w, r.y);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, r.w, r.h);
          ctx.restore();
        } else ctx.drawImage(img, r.x, r.y, r.w, r.h);
      } else if (editor) {
        ctx.fillStyle = "rgba(80,140,255,.35)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    } else if (o.kind === "tiled") {
      const id = o.anims[0]?.frames[0];
      const img = this.assets.image(id);
      const pat = id ? this.assets.pattern(ctx, id) : null;
      if (img && pat) {
        // kafelki wyrównane do rogu instancji
        const s = r.w / i.w;
        pat.setTransform(new DOMMatrix([s, 0, 0, s, r.x, r.y]));
        ctx.fillStyle = pat;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      } else if (editor) {
        ctx.fillStyle = "rgba(120,120,120,.4)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    } else if (o.kind === "text") {
      const text = this.fillVars(this.state.get(i.id)?.text ?? o.text ?? "");
      const size = (o.fontSize ?? 20) * cam.scale;
      const font = o.font ? this.assets.fonts.get(o.font) : undefined;
      if (font) drawBitmapText(ctx, this.assets, font, text, r.x, r.y, size, o.color ?? "#ffffff");
      else {
        ctx.font = `${Math.round(size)}px system-ui, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillStyle = o.color ?? "#000000";
        let y = r.y;
        for (const line of text.split("\n")) {
          ctx.fillText(line, r.x, y);
          y += size * 1.2;
        }
        ctx.textBaseline = "alphabetic";
      }
    }
    if (ghost) ctx.globalAlpha = 1;
    void world;
  }

  fillVars(text: string) {
    const v = this.vars;
    const m = Math.floor(v.time / 60), s = Math.floor(v.time % 60);
    return text
      .replace(/\{coins\}/g, String(v.coins))
      .replace(/\{left\}/g, String(v.left))
      .replace(/\{time\}/g, `${m}:${String(s).padStart(2, "0")}`)
      .replace(/\{player\}/g, v.player);
  }

  /** zostało monet (wspólnych i moich) */
  coinsLeft() {
    let n = 0;
    for (const i of this.instances()) {
      const o = this.objs.get(i.obj);
      if (o?.role === "pickup" && o.coin && !this.isHidden(i, o)) n++;
    }
    return n;
  }

  drawEntity(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera2D, e: Entity2D, t: number) {
    const img = this.frame(e.obj, e.anim, e.paused ? 0 : t - e.animStart);
    if (!img) return;
    const r = this.rect(W, H, cam, e.x, e.y, e.w, e.h);
    if (e.alpha !== undefined) ctx.globalAlpha = e.alpha;
    if (e.flip) {
      ctx.save();
      ctx.translate(r.x + r.w, r.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, r.w, r.h);
      ctx.restore();
    } else ctx.drawImage(img, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }

  private drawLights(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Camera2D, list: Inst2D[], hudScale: number) {
    const c = (this.lightCanvas ??= document.createElement("canvas"));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const l = c.getContext("2d")!;
    l.globalCompositeOperation = "source-over";
    l.fillStyle = this.level.ambient!;
    l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = "lighter";
    for (const i of list) {
      const o = this.objs.get(i.obj);
      if (o?.kind !== "light" || this.isHidden(i, o)) continue;
      const p = this.pos(i);
      const hud = i.layer === "hud";
      const scale = hud ? hudScale : cam.scale;
      const cx = hud ? p.x * hudScale : (p.x - cam.x) * cam.scale + W / 2;
      const cy = hud ? p.y * hudScale : (p.y - cam.y) * cam.scale + H / 2;
      const r = (o.radius ?? 100) * scale;
      const g = l.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, o.color ?? "#ffffff");
      g.addColorStop(1, "rgba(0,0,0,0)");
      l.fillStyle = g;
      l.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(c, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
}
