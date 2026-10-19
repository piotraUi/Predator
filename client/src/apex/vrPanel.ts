// Panele w świecie VR: płótno 2D jako tekstura w przestrzeni (menu, GUI gry, zegarek), trafiane promieniem z kontrolera.
import type { GuiDef, GuiEl } from "../../../shared/gui.ts";
import { VR_SCALE } from "./vr.ts";
import { cross, norm } from "./math.ts";
import type { V3 } from "./math.ts";
import type { Renderer } from "./renderer.ts";

export interface PanelButton {
  x: number; y: number; w: number; h: number;
  label?: string;
  danger?: boolean;
  on?: boolean;
  /** akcja po kliknięciu (przyciski menu) albo identyfikatory GUI gry (przyciski z gry) */
  click: () => void;
  gui?: string;
  el?: string;
}

export interface PanelHit { px: number; py: number; dist: number; point: V3 }

/** obrót, w którym oś Z płótna jest skierowana od widza (panel czytelny od strony -Z) */
function faceRot(from: V3, to: V3): number[] {
  const z = norm([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  let x = cross([0, 1, 0], z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-5) x = [1, 0, 0];
  x = norm(x);
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

export class VrPanel {
  readonly canvas = document.createElement("canvas");
  readonly ctx: CanvasRenderingContext2D;
  /** osobna tekstura pod GPU: odbita tak, by treść widziana z przodu była prosto */
  private stage = document.createElement("canvas");
  private tex: WebGLTexture | null = null;
  private dirty = true;
  center: V3 = [0, 0, 0];
  rot: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  visible = false;
  buttons: PanelButton[] = [];
  hover = -1;
  /** szerokość w metrach (w świecie razy VR_SCALE) */
  constructor(readonly pxW: number, readonly pxH: number, readonly widthM: number) {
    this.canvas.width = this.stage.width = pxW;
    this.canvas.height = this.stage.height = pxH;
    this.ctx = this.canvas.getContext("2d")!;
  }

  get worldW() {
    return this.widthM * VR_SCALE;
  }
  get worldH() {
    return this.worldW * (this.pxH / this.pxW);
  }

  invalidate() {
    this.dirty = true;
  }

  /** ustaw panel przed widzem (pozycja i kierunek), patrzący na niego */
  placeFacing(viewer: V3, target: V3) {
    this.center = target;
    this.rot = faceRot(viewer, target);
  }

  /** punkt trafienia promienia w panel (w pikselach płótna) albo null */
  hit(o: V3, d: V3): PanelHit | null {
    const r = this.rot, c = this.center;
    // osie panelu: X (lokalne), Y (lokalne), Z od widza
    const xl: V3 = [r[0], r[3], r[6]], yl: V3 = [r[1], r[4], r[7]], zl: V3 = [r[2], r[5], r[8]];
    const den = d[0] * zl[0] + d[1] * zl[1] + d[2] * zl[2];
    if (Math.abs(den) < 1e-5) return null;
    const t = ((c[0] - o[0]) * zl[0] + (c[1] - o[1]) * zl[1] + (c[2] - o[2]) * zl[2]) / den;
    if (t < 0 || t > 40) return null;
    const p: V3 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const lx = (p[0] - c[0]) * xl[0] + (p[1] - c[1]) * xl[1] + (p[2] - c[2]) * xl[2];
    const ly = (p[0] - c[0]) * yl[0] + (p[1] - c[1]) * yl[1] + (p[2] - c[2]) * yl[2];
    // widz patrzy w +Z panelu, więc jego prawa strona to -X
    const px = (0.5 - lx / this.worldW) * this.pxW;
    const py = (0.5 - ly / this.worldH) * this.pxH;
    if (px < 0 || py < 0 || px >= this.pxW || py >= this.pxH) return null;
    return { px, py, dist: t, point: p };
  }

  buttonAt(px: number, py: number): number {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return i;
    }
    return -1;
  }

  /** wypchnij płótno do tekstury (tylko, gdy się zmieniło) i narysuj w tej klatce */
  draw(rend: Renderer) {
    if (!this.visible) return;
    if (this.dirty || !this.tex) {
      const g = this.stage.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.pxW, this.pxH);
      // oś X panelu biegnie w lewo od widza: odbijamy obraz w poziomie, żeby napisy były czytelne
      g.scale(-1, 1);
      g.drawImage(this.canvas, -this.pxW, 0);
      const old = this.tex;
      this.tex = rend.makeTexture(this.stage);
      if (old) rend.deleteTexture(old);
      this.dirty = false;
    }
    rend.drawDecal(this.tex!, this.rot, this.center, this.worldW, this.worldH);
  }

  dispose(rend: Renderer) {
    if (this.tex) rend.deleteTexture(this.tex);
    this.tex = null;
  }
}

// ---------- rysowanie ----------

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

export function paintButtons(p: VrPanel, title: string, lines: string[] = []) {
  const g = p.ctx;
  g.clearRect(0, 0, p.pxW, p.pxH);
  g.fillStyle = "rgba(20,22,32,0.94)";
  roundRect(g, 0, 0, p.pxW, p.pxH, 34);
  g.fill();
  g.strokeStyle = "#5865f2";
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = "#fff";
  g.font = "bold 52px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title, p.pxW / 2, 56);
  p.buttons.forEach((b, i) => {
    g.fillStyle = b.danger ? (p.hover === i ? "#e5484d" : "#b3262b") : p.hover === i ? "#6b78ff" : b.on ? "#2e7d32" : "#3b4160";
    roundRect(g, b.x, b.y, b.w, b.h, 22);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "bold 36px system-ui, sans-serif";
    g.fillText(b.label ?? "", b.x + b.w / 2, b.y + b.h / 2 + 2, b.w - 20);
  });
  g.font = "28px system-ui, sans-serif";
  g.textAlign = "left";
  g.fillStyle = "#c8cbe0";
  lines.slice(-4).forEach((l, i) => g.fillText(l.slice(0, 64), 30, p.pxH - 140 + i * 34));
  p.invalidate();
}

const imgCache = new Map<string, HTMLImageElement>();
const imageFor = (src: string, onLoad: () => void) => {
  let im = imgCache.get(src);
  if (!im) {
    im = new Image();
    im.onload = onLoad;
    im.src = src;
    imgCache.set(src, im);
  }
  return im.complete && im.naturalWidth ? im : null;
};

/** GUI gry (układ w % ekranu, wzorzec 1280x720) na płótnie panelu; przyciski stają się celami promienia */
export function paintGuis(p: VrPanel, guis: GuiDef[], text: Record<string, string>) {
  const g = p.ctx;
  const W = p.pxW, H = p.pxH;
  g.clearRect(0, 0, W, H);
  const k = W / 1280;
  p.buttons = [];
  const modal = guis.some((x) => x.modal);
  if (modal) {
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, 0, W, H);
  }
  const hex = (c: string, a: number) => {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  for (const gu of guis) {
    for (const el of gu.elements as GuiEl[]) {
      const x = (el.x / 100) * W, y = (el.y / 100) * H, w = (el.w / 100) * W, h = (el.h / 100) * H;
      const isBtn = el.type === "button";
      const idx = p.buttons.length;
      const hov = isBtn && p.hover >= 0 && p.hover === idx;
      if (el.type === "image" || (isBtn && el.image)) {
        const im = el.image ? imageFor(el.image, () => p.invalidate()) : null;
        if (im) {
          g.imageSmoothingEnabled = !el.pixel;
          if (el.flip) {
            g.save();
            g.translate(x + w, y);
            g.scale(-1, 1);
            g.drawImage(im, 0, 0, w, h);
            g.restore();
          } else g.drawImage(im, x, y, w, h);
        }
      } else if (el.bg || isBtn) {
        g.fillStyle = el.bg ? hex(el.bg, el.bgOpacity ?? 1) : hex("#3a86ff", el.bgOpacity ?? 1);
        roundRect(g, x, y, w, h, (el.radius ?? 0) * k);
        g.fill();
        if (hov) {
          g.fillStyle = "rgba(255,255,255,0.22)";
          g.fill();
        }
      }
      if (el.border) {
        g.strokeStyle = el.border;
        g.lineWidth = 3 * k;
        roundRect(g, x, y, w, h, (el.radius ?? 0) * k);
        g.stroke();
      }
      const t = text[gu.id + "/" + el.id] ?? el.text;
      if (t && el.type !== "image") {
        g.fillStyle = el.color ?? "#fff";
        g.font = `${el.bold ? "800" : "600"} ${Math.max(14, (el.fontSize ?? 24) * k)}px system-ui, sans-serif`;
        g.textBaseline = "middle";
        g.textAlign = el.align === "left" ? "left" : el.align === "right" ? "right" : "center";
        const tx = el.align === "left" ? x + 8 * k : el.align === "right" ? x + w - 8 * k : x + w / 2;
        const lines = String(t).split("\n");
        const lh = Math.max(14, (el.fontSize ?? 24) * k) * 1.2;
        lines.forEach((ln, i) => g.fillText(ln, tx, y + h / 2 + (i - (lines.length - 1) / 2) * lh, w));
      }
      if (isBtn) p.buttons.push({ x, y, w, h, click: () => {}, gui: gu.id, el: el.id });
    }
  }
  p.invalidate();
}
