// Płaskie miniaturki awatarów (głowa + ramiona) rysowane na płótnie - lekkie, bez silnika 3D.
import type { Avatar } from "../../../shared/types.ts";
import { drawFace } from "../engine/face.ts";

const cache = new Map<string, string>();

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawHat(ctx: CanvasRenderingContext2D, hat: string) {
  switch (hat) {
    case "cap":
      ctx.fillStyle = "#d62828";
      ctx.beginPath();
      ctx.ellipse(64, 42, 34, 22, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#a01d1d";
      roundRect(ctx, 26, 38, 76, 9, 4);
      break;
    case "party":
      ctx.fillStyle = "#ff4fa3";
      ctx.beginPath();
      ctx.moveTo(44, 42);
      ctx.lineTo(64, 2);
      ctx.lineTo(84, 42);
      ctx.fill();
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      ctx.arc(64, 4, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "tophat":
      ctx.fillStyle = "#1d1d1d";
      roundRect(ctx, 26, 36, 76, 8, 3);
      roundRect(ctx, 40, 2, 48, 38, 3);
      ctx.fillStyle = "#c4281c";
      ctx.fillRect(40, 28, 48, 7);
      break;
    case "crown":
      ctx.fillStyle = "#ffc300";
      ctx.beginPath();
      ctx.moveTo(34, 42);
      ctx.lineTo(34, 16);
      ctx.lineTo(47, 28);
      ctx.lineTo(64, 10);
      ctx.lineTo(81, 28);
      ctx.lineTo(94, 16);
      ctx.lineTo(94, 42);
      ctx.fill();
      break;
    case "horns":
      ctx.fillStyle = "#b3001b";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(64 + s * 18, 32);
        ctx.quadraticCurveTo(64 + s * 40, 20, 64 + s * 36, 4);
        ctx.quadraticCurveTo(64 + s * 30, 22, 64 + s * 28, 34);
        ctx.fill();
      }
      break;
    case "halo":
      ctx.strokeStyle = "#ffe98a";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(64, 12, 26, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
}

/** Obrazek (data URL) z głową i ramionami postaci */
export function headshot(a: Avatar): string {
  const key = [a.head, a.torso, a.arms, a.hat, a.face].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  // tułów i ramiona
  ctx.fillStyle = shade(a.arms, 0.92);
  roundRect(ctx, 6, 100, 26, 40, 6);
  roundRect(ctx, 96, 100, 26, 40, 6);
  ctx.fillStyle = a.torso;
  roundRect(ctx, 28, 96, 72, 44, 8);
  // głowa
  ctx.fillStyle = shade(a.head, 0.85);
  roundRect(ctx, 30, 34, 68, 64, 16);
  ctx.fillStyle = a.head;
  roundRect(ctx, 30, 32, 68, 62, 16);
  // twarz
  const f = document.createElement("canvas");
  f.width = f.height = 128;
  drawFace(f.getContext("2d")!, a.face);
  ctx.drawImage(f, 34, 34, 60, 60);
  drawHat(ctx, a.hat);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
