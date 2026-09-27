// Małe obrazki z gier (sprite'y 2D) sklejane w jeden arkusz - moderacja sprawdza 16 obrazków naraz
// zamiast każdego osobno (Groq liczy każdy obrazek jak ~1300 tokenów, nawet 32x32).
// Własny dekoder / koder PNG (bez bibliotek): obsługuje zwykłe PNG bez przeplotu.
import zlib from "node:zlib";

export interface Rgba {
  w: number;
  h: number;
  data: Uint8Array;
}

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** PNG -> piksele RGBA (null, gdy format jest nieobsługiwany, np. z przeplotem) */
export function decodePng(buf: Buffer): Rgba | null {
  if (buf.length < 33 || SIG.some((b, i) => buf[i] !== b)) return null;
  let pos = 8;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (kind === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
  }
  if (!w || !h || w * h > 4096 * 4096 || interlace) return null;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth)) return null;
  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((w * channels * depth) / 8);
  if (raw.length < h * (stride + 1)) return null;
  const cur = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    // jedna próbka (kanał) piksela x
    const sample = (x: number, ch: number) => {
      if (depth === 16) return cur[(x * channels + ch) * 2];
      if (depth === 8) return cur[x * channels + ch];
      const bit = (x * channels + ch) * depth;
      return (cur[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    };
    const scale = depth < 8 && type !== 3 ? 255 / ((1 << depth) - 1) : 1;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 3) {
        const idx = sample(x, 0);
        out[o] = palette?.[idx * 3] ?? 0;
        out[o + 1] = palette?.[idx * 3 + 1] ?? 0;
        out[o + 2] = palette?.[idx * 3 + 2] ?? 0;
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (type === 0 || type === 4) {
        const g = sample(x, 0) * scale;
        out[o] = out[o + 1] = out[o + 2] = g;
        out[o + 3] = type === 4 ? sample(x, 1) : 255;
      } else {
        out[o] = sample(x, 0);
        out[o + 1] = sample(x, 1);
        out[o + 2] = sample(x, 2);
        out[o + 3] = type === 6 ? sample(x, 3) : 255;
      }
    }
    cur.copy(prev);
  }
  return { w, h, data: out };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(kind: string, body: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const kb = Buffer.concat([Buffer.from(kind, "latin1"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(kb));
  return Buffer.concat([len, kb, crc]);
}

/** piksele RGB -> PNG */
export function encodePng(img: Rgba): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB (tło arkusza jest jednolite)
  const raw = Buffer.alloc(img.h * (img.w * 3 + 1));
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4, o = y * (img.w * 3 + 1) + 1 + x * 3;
      raw[o] = img.data[i];
      raw[o + 1] = img.data[i + 1];
      raw[o + 2] = img.data[i + 2];
    }
  return Buffer.concat([Buffer.from(SIG), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Arkusz: obrazki w siatce (każdy przeskalowany do kratki, przezroczystość na szarym tle).
 * Zwraca PNG jako data URL.
 */
export function makeSheet(images: Rgba[], cell = 160, cols = 4): string {
  const rows = Math.ceil(images.length / cols);
  const gap = 8;
  const W = cols * (cell + gap) + gap, H = rows * (cell + gap) + gap;
  const data = new Uint8Array(W * H * 4).fill(200);
  images.forEach((img, n) => {
    const s = Math.min(cell / img.w, cell / img.h);
    const dw = Math.max(1, Math.round(img.w * s)), dh = Math.max(1, Math.round(img.h * s));
    const ox = gap + (n % cols) * (cell + gap) + ((cell - dw) >> 1);
    const oy = gap + Math.floor(n / cols) * (cell + gap) + ((cell - dh) >> 1);
    for (let y = 0; y < dh; y++)
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(img.w - 1, Math.floor(x / s)), sy = Math.min(img.h - 1, Math.floor(y / s));
        const si = (sy * img.w + sx) * 4, di = ((oy + y) * W + ox + x) * 4;
        const a = img.data[si + 3] / 255;
        for (let c = 0; c < 3; c++) data[di + c] = Math.round(img.data[si + c] * a + 200 * (1 - a));
      }
  });
  return "data:image/png;base64," + encodePng({ w: W, h: H, data }).toString("base64");
}
