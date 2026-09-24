// Koszulki i spodnie rysowane na płótnie (bez Babylona) - tekstury modelu 3D i miniaturki awatarów.
import type { ClothSpec } from "../../../shared/catalog.ts";

type Ctx = CanvasRenderingContext2D;

function star(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}
function heart(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.3, y, x - s * 0.6, y - s * 0.9, x, y - s * 0.2);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s * 1.3, y, x, y + s * 0.9);
  ctx.fill();
}
const RAINBOW = ["#ff4d6d", "#ff9f1c", "#ffd60a", "#52b788", "#3a86ff", "#8338ec"];

/** Tło z wzorem (paski, kropki, moro, galaktyka...) na całym prostokącie */
function fillPattern(ctx: Ctx, c: ClothSpec, x: number, y: number, w: number, h: number, seed = 1) {
  ctx.fillStyle = c.color;
  ctx.fillRect(x, y, w, h);
  const s = w / 128;
  let r = seed * 9301;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  switch (c.pattern) {
    case "stripes":
      ctx.fillStyle = c.accent;
      for (let yy = y + 8 * s; yy < y + h; yy += 22 * s) ctx.fillRect(x, yy, w, 10 * s);
      break;
    case "dots":
      ctx.fillStyle = c.accent;
      for (let yy = y + 10 * s; yy < y + h; yy += 24 * s)
        for (let xx = x + ((yy / (24 * s)) % 2 ? 10 : 22) * s; xx < x + w; xx += 24 * s) {
          ctx.beginPath();
          ctx.arc(xx, yy, 6 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      break;
    case "flannel":
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = c.accent;
      for (let xx = x; xx < x + w; xx += 32 * s) ctx.fillRect(xx, y, 12 * s, h);
      for (let yy = y; yy < y + h; yy += 32 * s) ctx.fillRect(x, yy, w, 12 * s);
      ctx.globalAlpha = 1;
      break;
    case "camo":
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = i % 2 ? c.accent : (c.accent2 ?? c.accent);
        ctx.beginPath();
        ctx.ellipse(x + rnd() * w, y + rnd() * h, (10 + rnd() * 16) * s, (6 + rnd() * 10) * s, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "rainbow":
      RAINBOW.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(x, y + (h / RAINBOW.length) * i, w, h / RAINBOW.length + 1);
      });
      break;
    case "galaxy": {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, c.color);
      g.addColorStop(0.5, "#3c1a78");
      g.addColorStop(1, "#0b2a5b");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 30; i++) ctx.fillRect(x + rnd() * w, y + rnd() * h, 2 * s, 2 * s);
      ctx.fillStyle = c.accent;
      for (let i = 0; i < 5; i++) star(ctx, x + rnd() * w, y + rnd() * h, 5 * s);
      break;
    }
    case "gold": {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, "#fff3b0");
      g.addColorStop(0.4, c.color);
      g.addColorStop(1, "#a67c00");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case "star":
      ctx.fillStyle = c.accent;
      for (let i = 0; i < 8; i++) star(ctx, x + rnd() * w, y + rnd() * h, 6 * s);
      break;
    case "sport":
      ctx.fillStyle = c.accent;
      ctx.fillRect(x + 4 * s, y, 8 * s, h);
      ctx.fillRect(x + w - 12 * s, y, 8 * s, h);
      break;
  }
}

/** Przód koszulki na prostokącie (x, y, w, h) */
export function drawShirtFront(ctx: Ctx, c: ClothSpec, x: number, y: number, w: number, h: number) {
  const s = w / 128;
  const cx = x + w / 2, cy = y + h / 2;
  fillPattern(ctx, c, x, y, w, h, 3);
  ctx.fillStyle = c.accent;
  switch (c.pattern) {
    case "heart":
      ctx.fillStyle = c.accent;
      heart(ctx, cx, cy, 30 * s);
      break;
    case "star":
      if (c.short) star(ctx, cx, cy, 36 * s);
      break;
    case "cat":
      ctx.beginPath();
      ctx.arc(cx, cy + 6 * s, 28 * s, 0, Math.PI * 2);
      ctx.moveTo(cx - 26 * s, cy - 6 * s);
      ctx.lineTo(cx - 20 * s, cy - 36 * s);
      ctx.lineTo(cx - 4 * s, cy - 18 * s);
      ctx.moveTo(cx + 26 * s, cy - 6 * s);
      ctx.lineTo(cx + 20 * s, cy - 36 * s);
      ctx.lineTo(cx + 4 * s, cy - 18 * s);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx - 10 * s, cy + 2 * s, 5 * s, 0, Math.PI * 2);
      ctx.arc(cx + 10 * s, cy + 2 * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "dino":
      ctx.beginPath();
      ctx.ellipse(cx, cy + 10 * s, 34 * s, 20 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 34 * s, cy - 14 * s, 14 * s, 10 * s, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx + 20 * s, cy - 10 * s, 10 * s, 20 * s);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 24 * s + i * 14 * s, cy - 6 * s);
        ctx.lineTo(cx - 17 * s + i * 14 * s, cy - 20 * s);
        ctx.lineTo(cx - 10 * s + i * 14 * s, cy - 6 * s);
        ctx.fill();
      }
      ctx.fillRect(cx - 22 * s, cy + 24 * s, 8 * s, 14 * s);
      ctx.fillRect(cx + 10 * s, cy + 24 * s, 8 * s, 14 * s);
      break;
    case "pizza":
      ctx.fillStyle = c.accent2 ?? "#f4a261";
      ctx.beginPath();
      ctx.moveTo(cx - 34 * s, cy - 30 * s);
      ctx.lineTo(cx + 34 * s, cy - 30 * s);
      ctx.lineTo(cx, cy + 40 * s);
      ctx.fill();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.moveTo(cx - 26 * s, cy - 22 * s);
      ctx.lineTo(cx + 26 * s, cy - 22 * s);
      ctx.lineTo(cx, cy + 30 * s);
      ctx.fill();
      ctx.fillStyle = c.accent;
      for (const [dx, dy] of [[-10, -12], [8, -8], [0, 8]]) {
        ctx.beginPath();
        ctx.arc(cx + dx * s, cy + dy * s, 6 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "jersey":
      ctx.fillRect(x, y, w, 14 * s);
      ctx.font = `bold ${56 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("10", cx, cy + 6 * s);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      break;
    case "hoodie":
      ctx.fillRect(cx - 34 * s, cy + 16 * s, 68 * s, 30 * s);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(cx - 10 * s, y);
      ctx.lineTo(cx - 10 * s, y + 40 * s);
      ctx.moveTo(cx + 10 * s, y);
      ctx.lineTo(cx + 10 * s, y + 40 * s);
      ctx.stroke();
      break;
    case "sport":
      ctx.fillRect(cx - 3 * s, y, 6 * s, h);
      break;
    case "tuxedo":
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.moveTo(cx - 26 * s, y);
      ctx.lineTo(cx + 26 * s, y);
      ctx.lineTo(cx, y + h * 0.75);
      ctx.fill();
      ctx.fillStyle = c.accent2 ?? "#d62828";
      ctx.beginPath();
      ctx.moveTo(cx, y + 18 * s);
      ctx.lineTo(cx - 14 * s, y + 10 * s);
      ctx.lineTo(cx - 14 * s, y + 26 * s);
      ctx.moveTo(cx, y + 18 * s);
      ctx.lineTo(cx + 14 * s, y + 10 * s);
      ctx.lineTo(cx + 14 * s, y + 26 * s);
      ctx.fill();
      ctx.fillStyle = "#1b1b1b";
      for (const dy of [44, 62, 80]) {
        ctx.beginPath();
        ctx.arc(cx, y + dy * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "robot":
      ctx.fillStyle = "#6c757d";
      ctx.fillRect(cx - 36 * s, cy - 30 * s, 72 * s, 60 * s);
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, 16 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e63946";
      ctx.fillRect(cx - 30 * s, cy + 20 * s, 10 * s, 6 * s);
      ctx.fillStyle = "#52b788";
      ctx.fillRect(cx + 20 * s, cy + 20 * s, 10 * s, 6 * s);
      break;
    case "unicorn":
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8 * s, 26 * s, 30 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd60a";
      ctx.beginPath();
      ctx.moveTo(cx - 6 * s, cy - 20 * s);
      ctx.lineTo(cx + 6 * s, cy - 20 * s);
      ctx.lineTo(cx, cy - 50 * s);
      ctx.fill();
      RAINBOW.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(cx - 34 * s + i * 4 * s, cy - 20 * s + i * 6 * s, 10 * s, 20 * s);
      });
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(cx + 8 * s, cy, 3 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "hero":
      ctx.fillStyle = c.accent2 ?? "#ffd60a";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 34 * s);
      ctx.lineTo(cx + 34 * s, cy - 14 * s);
      ctx.lineTo(cx, cy + 34 * s);
      ctx.lineTo(cx - 34 * s, cy - 14 * s);
      ctx.fill();
      ctx.fillStyle = c.accent;
      ctx.font = `bold ${44 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", cx, cy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = c.accent;
      ctx.fillRect(x, y + h - 14 * s, w, 8 * s);
      break;
    case "predator":
      ctx.fillStyle = c.accent;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.2);
      ctx.fillRect(-26 * s, -26 * s, 52 * s, 52 * s);
      ctx.fillStyle = c.color;
      ctx.fillRect(-11 * s, -11 * s, 22 * s, 22 * s);
      ctx.restore();
      break;
    case "gold":
      ctx.strokeStyle = "#a67c00";
      ctx.lineWidth = 4 * s;
      ctx.strokeRect(x + 12 * s, y + 12 * s, w - 24 * s, h - 24 * s);
      ctx.fillStyle = "#fff3b0";
      star(ctx, cx, cy, 22 * s);
      break;
    case "galaxy":
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, 14 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 30 * s, 9 * s, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
}

/** Rękaw (cały bok ręki); krótki rękaw = dół w kolorze skóry */
export function drawSleeve(ctx: Ctx, c: ClothSpec, skin: string, x: number, y: number, w: number, h: number) {
  fillPattern(ctx, c, x, y, w, h, 5);
  if (c.pattern === "sport") {
    ctx.fillStyle = c.accent;
    ctx.fillRect(x + w / 2 - 3, y, 6, h);
  }
  if (c.short) {
    ctx.fillStyle = skin;
    ctx.fillRect(x, y + h * 0.35, w, h * 0.65);
  } else {
    ctx.fillStyle = c.pattern === "tuxedo" ? "#ffffff" : c.accent;
    ctx.fillRect(x, y + h * 0.9, w, h * 0.1);
  }
}

/** Nogawka spodni; szorty = dół w kolorze nóg */
export function drawLeg(ctx: Ctx, c: ClothSpec, skin: string, x: number, y: number, w: number, h: number) {
  fillPattern(ctx, c, x, y, w, h, 7);
  if (c.pattern === "overalls") {
    ctx.fillStyle = c.accent;
    ctx.fillRect(x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.12);
  }
  if (c.pattern === "plain" && !c.short) {
    // szew dżinsów
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + w / 2 - 1, y, 2, h);
    ctx.globalAlpha = 1;
  }
  if (c.short) {
    ctx.fillStyle = skin;
    ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
  }
}

/** Płótno z teksturą: koszulka (przód | gładki bok), rękaw albo nogawka */
export function clothCanvas(kind: "shirt" | "sleeve" | "leg", c: ClothSpec, skin: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  if (kind === "shirt") {
    cv.width = 256;
    cv.height = 128;
    const ctx = cv.getContext("2d")!;
    drawShirtFront(ctx, c, 0, 0, 128, 128);
    fillPattern(ctx, c, 128, 0, 128, 128, 11);
  } else {
    cv.width = 64;
    cv.height = 128;
    const ctx = cv.getContext("2d")!;
    if (kind === "sleeve") drawSleeve(ctx, c, skin, 0, 0, 64, 128);
    else drawLeg(ctx, c, skin, 0, 0, 64, 128);
  }
  return cv;
}
