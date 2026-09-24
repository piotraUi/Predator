// Płaskie miniaturki awatarów (głowa + ramiona) rysowane na płótnie - lekkie, bez silnika 3D.
import type { Avatar } from "../../../shared/types.ts";
import { drawFace } from "../engine/face.ts";
import { drawShirtFront } from "../engine/clothes.ts";
import { findItem } from "../../../shared/catalog.ts";

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
    case "none":
      break;
    case "beanie":
    case "frog":
    case "propeller":
    case "viking":
    case "rainbowcap": {
      ctx.fillStyle = findItem(hat)?.color ?? "#888";
      ctx.beginPath();
      ctx.ellipse(64, 40, 36, 24, 0, Math.PI, 0);
      ctx.fill();
      if (hat === "beanie") {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(64, 12, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (hat === "frog") {
        for (const x of [48, 80]) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, 20, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#111";
          ctx.fillRect(x - 2, 18, 4, 4);
        }
      } else if (hat === "propeller") {
        ctx.fillStyle = "#e63946";
        ctx.fillRect(40, 12, 48, 4);
      } else if (hat === "viking") {
        ctx.fillStyle = "#f1faee";
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(64 + s * 30, 34);
          ctx.quadraticCurveTo(64 + s * 50, 20, 64 + s * 46, 4);
          ctx.lineTo(64 + s * 36, 26);
          ctx.fill();
        }
      }
      break;
    }
    case "catears":
    case "bunny":
    case "bear":
      ctx.fillStyle = findItem(hat)?.color ?? "#888";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        if (hat === "catears") {
          ctx.moveTo(64 + s * 16, 36);
          ctx.lineTo(64 + s * 32, 8);
          ctx.lineTo(64 + s * 36, 38);
        } else if (hat === "bunny") {
          ctx.ellipse(64 + s * 16, 12, 8, 22, s * 0.15, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#c9c9d1";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#ffb3c7";
          ctx.beginPath();
          ctx.ellipse(64 + s * 16, 14, 4, 14, s * 0.15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = findItem(hat)?.color ?? "#888";
          continue;
        }
        else ctx.arc(64 + s * 28, 30, 11, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "predatorcrown":
      ctx.fillStyle = "#111";
      roundRect(ctx, 30, 30, 68, 12, 3);
      ctx.fillStyle = "#e63946";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(34 + i * 16, 32);
        ctx.lineTo(42 + i * 16, 4);
        ctx.lineTo(50 + i * 16, 32);
        ctx.fill();
      }
      break;
    case "ltd-icecrown":
    case "ltd-goldhorns":
    case "ltd-galaxyhalo": {
      const c = findItem(hat)?.color ?? "#888";
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      if (hat === "ltd-icecrown") {
        ctx.beginPath();
        ctx.moveTo(32, 42);
        for (let i = 0; i <= 8; i++) ctx.lineTo(32 + i * 8, i % 2 ? 26 : 8);
        ctx.lineTo(96, 42);
        ctx.fill();
      } else if (hat === "ltd-goldhorns") {
        for (const sd of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(64 + sd * 20, 34);
          ctx.quadraticCurveTo(64 + sd * 44, 26, 64 + sd * 40, 2);
          ctx.quadraticCurveTo(64 + sd * 34, 22, 64 + sd * 28, 36);
          ctx.fill();
        }
      } else {
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(64, 12, 28, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#4cc9f0";
        for (const x of [40, 64, 88]) ctx.fillRect(x - 2, 10, 4, 4);
      }
      break;
    }
    case "chef":
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#b8bcc4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(48, 18, 14, 0, Math.PI * 2);
      ctx.arc(64, 12, 16, 0, Math.PI * 2);
      ctx.arc(80, 18, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(38, 18, 52, 22, 3);
      ctx.fill();
      ctx.stroke();
      break;
    case "unicorn":
      ctx.fillStyle = "#ffd60a";
      ctx.beginPath();
      ctx.moveTo(56, 34);
      ctx.lineTo(72, 34);
      ctx.lineTo(64, 2);
      ctx.fill();
      break;
    case "dino":
      ctx.fillStyle = "#43aa8b";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(40 + i * 14, 34);
        ctx.lineTo(47 + i * 14, 18);
        ctx.lineTo(54 + i * 14, 34);
        ctx.fill();
      }
      break;
    default: {
      // pozostałe czapki: prosty kształt w kolorze przedmiotu
      const it = findItem(hat);
      if (!it) break;
      ctx.fillStyle = it.color ?? "#888";
      roundRect(ctx, 34, 12, 60, 26, 10);
      ctx.fillRect(22, 34, 84, 7);
      break;
    }
  }
}

/** Obrazek (data URL) z głową i ramionami postaci */
export function headshot(a: Avatar): string {
  const key = [a.head, a.torso, a.arms, a.hat, a.face, a.shirt, a.neck].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  // tułów i ramiona
  ctx.fillStyle = shade(a.arms, 0.92);
  roundRect(ctx, 6, 100, 26, 40, 6);
  roundRect(ctx, 96, 100, 26, 40, 6);
  const shirt = findItem(a.shirt ?? "none")?.cloth;
  if (shirt) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(28, 96, 72, 44, 8);
    ctx.clip();
    drawShirtFront(ctx, shirt, 28, 92, 72, 72);
    ctx.restore();
  } else {
    ctx.fillStyle = a.torso;
    roundRect(ctx, 28, 96, 72, 44, 8);
  }
  const neck = findItem(a.neck ?? "none");
  if (neck && neck.id !== "none") {
    ctx.fillStyle = neck.color ?? "#888";
    roundRect(ctx, 50, 96, 28, 10, 4);
  }
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
