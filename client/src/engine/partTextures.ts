// Wzory na klockach (Part.texture): rysowane na płótnie 128x128, jasne, żeby kolor klocka je barwił.
// Bez Babylona - korzysta z nich silnik Apex.

const SIZE = 128;
type Ctx = CanvasRenderingContext2D;

function rng(seed: number) {
  let r = seed * 9301 + 49297;
  return () => ((r = (r * 9301 + 49297) % 233280) / 233280);
}
const g = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;

function noise(ctx: Ctx, rnd: () => number, amount: number, base: number, cell = 2) {
  for (let y = 0; y < SIZE; y += cell)
    for (let x = 0; x < SIZE; x += cell) {
      ctx.fillStyle = g(base + (rnd() - 0.5) * amount);
      ctx.fillRect(x, y, cell, cell);
    }
}

const PAINT: Record<string, (ctx: Ctx, rnd: () => number) => void> = {
  brick(ctx, rnd) {
    ctx.fillStyle = g(205);
    ctx.fillRect(0, 0, SIZE, SIZE);
    const h = SIZE / 8, w = SIZE / 4;
    for (let row = 0; row < 8; row++)
      for (let c = -1; c < 5; c++) {
        const x = c * w + (row % 2 ? w / 2 : 0);
        ctx.fillStyle = g(215 + (rnd() - 0.5) * 70);
        ctx.fillRect(x + 2, row * h + 2, w - 4, h - 4);
      }
  },
  planks(ctx, rnd) {
    const n = 4, h = SIZE / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = g(215 + (rnd() - 0.5) * 40);
      ctx.fillRect(0, i * h, SIZE, h);
      ctx.strokeStyle = g(150);
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const y = i * h + 4 + rnd() * (h - 8);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(40, y + (rnd() - 0.5) * 4, 90, y + (rnd() - 0.5) * 4, SIZE, y);
        ctx.stroke();
      }
      ctx.fillStyle = g(120);
      ctx.fillRect(0, i * h, SIZE, 2);
    }
  },
  stone(ctx, rnd) {
    noise(ctx, rnd, 38, 205, 4);
    ctx.strokeStyle = g(150);
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let x = rnd() * SIZE, y = rnd() * SIZE;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) ctx.lineTo((x += (rnd() - 0.5) * 36), (y += (rnd() - 0.5) * 36));
      ctx.stroke();
    }
  },
  cobble(ctx, rnd) {
    ctx.fillStyle = g(130);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const cx = x * 32 + 16 + (y % 2 ? 8 : 0), cy = y * 32 + 16;
        ctx.fillStyle = g(205 + (rnd() - 0.5) * 50);
        ctx.beginPath();
        ctx.ellipse(cx % SIZE, cy, 14 + rnd() * 2, 13 + rnd() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
  },
  grass(ctx, rnd) {
    ctx.fillStyle = g(200);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 700; i++) {
      ctx.strokeStyle = g(160 + rnd() * 95);
      const x = rnd() * SIZE, y = rnd() * SIZE;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 5);
      ctx.stroke();
    }
  },
  sand(ctx, rnd) {
    noise(ctx, rnd, 30, 232, 2);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = g(205);
      ctx.beginPath();
      const y = rnd() * SIZE;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(40, y + 6, 90, y - 6, SIZE, y + 2);
      ctx.stroke();
    }
  },
  dirt(ctx, rnd) {
    noise(ctx, rnd, 60, 190, 4);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = g(120 + rnd() * 50);
      ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 3 + rnd() * 4, 3 + rnd() * 3);
    }
  },
  checker(ctx) {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 ? g(110) : g(255);
        ctx.fillRect(x * 32, y * 32, 32, 32);
      }
  },
  tiles(ctx, rnd) {
    ctx.fillStyle = g(150);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = g(238 + (rnd() - 0.5) * 12);
        ctx.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.fillRect(x * 32 + 2, y * 32 + 2, 28, 3);
      }
  },
  metal(ctx, rnd) {
    ctx.fillStyle = g(205);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const d = (x + y) % 2;
        ctx.save();
        ctx.translate(x * 16 + 8, y * 16 + 8);
        ctx.rotate(d ? Math.PI / 4 : -Math.PI / 4);
        ctx.fillStyle = g(245);
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.fillStyle = g(150);
        ctx.fillRect(-6, 1.5, 12, 1.5);
        ctx.restore();
      }
    noise(ctx, rnd, 0, 0, SIZE);
  },
  concrete(ctx, rnd) {
    noise(ctx, rnd, 28, 215, 2);
    ctx.strokeStyle = g(170);
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = g(150 + rnd() * 40);
      ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 2, 2);
    }
  },
  hazard(ctx) {
    ctx.fillStyle = g(255);
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = g(70);
    for (let i = -4; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32 + 16, 0);
      ctx.lineTo(i * 32 + 16 + SIZE, SIZE);
      ctx.lineTo(i * 32 + SIZE, SIZE);
      ctx.fill();
    }
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/** płótno ze wzorem o danym id (null = nieznany wzór) */
export function partTextureCanvas(id: string): HTMLCanvasElement | null {
  const paint = PAINT[id];
  if (!paint) return null;
  let c = cache.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d")!;
    let seed = 0;
    for (const ch of id) seed = seed * 31 + ch.charCodeAt(0);
    paint(ctx, rng(seed));
    cache.set(id, c);
  }
  return c;
}
