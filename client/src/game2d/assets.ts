// Obrazki, dźwięki i czcionki bitmapowe gry 2D (z data URL zapisanych w grze).
import type { Asset2D, World2D } from "../../../shared/types2d.ts";

interface Glyph {
  x: number; y: number; w: number; h: number; ox: number; oy: number; adv: number;
}
export interface BitmapFont {
  image: HTMLImageElement;
  size: number;
  lineHeight: number;
  glyphs: Map<number, Glyph>;
}

let audioCtx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

/** Przeglądarki wymagają dotknięcia / kliknięcia, zanim zagra dźwięk */
export function unlockAudio() {
  const a = audio();
  if (a && a.state === "suspended") a.resume().catch(() => {});
}

function parseFnt(text: string, image: HTMLImageElement): BitmapFont {
  const glyphs = new Map<number, Glyph>();
  let size = 16;
  let lineHeight = 16;
  const attrs = (line: string) => {
    const o: Record<string, number> = {};
    for (const m of line.matchAll(/(\w+)=(-?\d+)/g)) o[m[1]] = Number(m[2]);
    return o;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("info ")) size = Math.abs(attrs(line).size ?? size);
    else if (line.startsWith("common ")) lineHeight = attrs(line).lineHeight ?? lineHeight;
    else if (line.startsWith("char ")) {
      const a = attrs(line);
      glyphs.set(a.id, { x: a.x, y: a.y, w: a.width, h: a.height, ox: a.xoffset, oy: a.yoffset, adv: a.xadvance });
    }
  }
  return { image, size, lineHeight, glyphs };
}

export class AssetStore {
  readonly images = new Map<string, HTMLImageElement>();
  readonly fonts = new Map<string, BitmapFont>();
  private sounds = new Map<string, AudioBuffer>();
  private soundData = new Map<string, string>();
  private patterns = new Map<string, CanvasPattern>();
  private tinted = new Map<string, HTMLCanvasElement>();
  /** obrazki pixel-art (rysowane ostro, bez wygładzania) */
  private pixel = new Set<string>();
  readonly ready: Promise<void>;

  constructor(assets: Asset2D[]) {
    const waits: Promise<unknown>[] = [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    for (const a of assets) {
      if (a.type === "image") {
        const img = new Image();
        img.decoding = "async";
        img.src = a.data;
        this.images.set(a.id, img);
        if (a.pixel) this.pixel.add(a.id);
        waits.push(img.decode().catch(() => {}));
      } else if (a.type === "sound") this.soundData.set(a.id, a.data);
    }
    this.ready = Promise.all(waits).then(() => {
      for (const a of assets) {
        if (a.type !== "font" || !a.image) continue;
        const img = this.images.get(a.image);
        if (img && byId.has(a.image)) this.fonts.set(a.id, parseFnt(a.data, img));
      }
    });
  }

  /** nowy obrazek / dźwięk dodany w edytorze */
  add(a: Asset2D): Promise<void> {
    if (a.type === "image") {
      const img = new Image();
      img.src = a.data;
      this.images.set(a.id, img);
      this.patterns.delete(a.id);
      if (a.pixel) this.pixel.add(a.id);
      else this.pixel.delete(a.id);
      return img.decode().catch(() => {});
    }
    if (a.type === "sound") this.soundData.set(a.id, a.data);
    return Promise.resolve();
  }

  static forWorld(w: World2D) {
    return new AssetStore(w.assets);
  }

  isPixel(id: string) {
    return this.pixel.has(id);
  }

  image(id: string | undefined): HTMLImageElement | null {
    if (!id) return null;
    const img = this.images.get(id);
    return img && img.complete && img.naturalWidth ? img : null;
  }

  pattern(ctx: CanvasRenderingContext2D, id: string): CanvasPattern | null {
    const cached = this.patterns.get(id);
    if (cached) return cached;
    const img = this.image(id);
    if (!img) return null;
    const p = ctx.createPattern(img, "repeat");
    if (p) this.patterns.set(id, p);
    return p;
  }

  /** Obrazek czcionki w innym kolorze (np. biały napis z czarnej czcionki) */
  tintedFont(font: BitmapFont, color: string): HTMLCanvasElement | HTMLImageElement {
    if (!color || color.toLowerCase() === "#ffffff") return font.image;
    const key = font.image.src.length + ":" + font.image.src.slice(-32) + color;
    let c = this.tinted.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = font.image.naturalWidth;
      c.height = font.image.naturalHeight;
      const x = c.getContext("2d")!;
      x.drawImage(font.image, 0, 0);
      x.globalCompositeOperation = "source-in";
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      this.tinted.set(key, c);
    }
    return c;
  }

  async play(id: string | undefined, opts: { volume?: number; pitch?: number } = {}) {
    if (!id) return;
    const a = audio();
    if (!a) return;
    let buf = this.sounds.get(id);
    if (!buf) {
      const data = this.soundData.get(id);
      if (!data) return;
      try {
        const bytes = Uint8Array.from(atob(data.slice(data.indexOf(",") + 1)), (c) => c.charCodeAt(0));
        buf = await a.decodeAudioData(bytes.buffer);
        this.sounds.set(id, buf);
      } catch {
        this.soundData.delete(id);
        return;
      }
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.min(4, Math.max(0.25, opts.pitch ?? 1));
    const gain = a.createGain();
    gain.gain.value = Math.min(1, Math.max(0, opts.volume ?? 0.8));
    src.connect(gain).connect(a.destination);
    src.start();
  }
}

/** Rysuje tekst czcionką bitmapową. Zwraca szerokość. */
export function drawBitmapText(
  ctx: CanvasRenderingContext2D,
  store: AssetStore,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
): number {
  const scale = size / font.size;
  const img = store.tintedFont(font, color);
  let cx = x;
  let cy = y;
  for (const ch of text) {
    if (ch === "\n") {
      cx = x;
      cy += font.lineHeight * scale;
      continue;
    }
    const g = font.glyphs.get(ch.codePointAt(0)!) ?? font.glyphs.get(63);
    if (!g) continue;
    if (g.w && g.h) ctx.drawImage(img, g.x, g.y, g.w, g.h, Math.round(cx + g.ox * scale), Math.round(cy + g.oy * scale), g.w * scale, g.h * scale);
    cx += g.adv * scale;
  }
  return cx - x;
}
