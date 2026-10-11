// Renderuje klatki trailera na karcie graficznej (Chromium przez Playwright).
//   node render.mjs                 -> 1080p, 30 kl/s
//   set RES=1440 / 2160, set FPS=60 -> wyższa rozdzielczość / płynność
//   set WORKERS=3                   -> ile procesów liczy naraz (domyślnie 2)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RES = Number(process.env.RES ?? 1080);
const FPS = Number(process.env.FPS ?? 30);
const TOTAL = Math.ceil(80.6 * FPS);
const dir = path.join(here, "frames");

if (process.argv[2] === "worker") {
  const S = Number(process.argv[3]), E = Number(process.argv[4]);
  const b = await chromium.launch({
    headless: process.env.HEADED ? false : true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.env.HEADED ? {} : { channel: "chromium" }),
    args: ["--use-angle=" + (process.env.ANGLE ?? "d3d11"), "--enable-gpu", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-webgl", "--allow-file-access-from-files", ...(process.env.SOFTWARE ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])],
  });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: RES / 1080 });
  p.on("pageerror", (e) => console.log("[błąd]", e.message));
  await p.goto("file://" + path.join(here, "trailer.html").replace(/\\/g, "/") + `?fps=${FPS}`);
  await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const gpu = await p.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const e = gl?.getExtension("WEBGL_debug_renderer_info");
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?";
  });
  console.log(`[${S}-${E}] karta: ${gpu}`);
  await p.evaluate((S) => { for (let i = 0; i < S; i++) window.setFrame(i, true); }, S);
  const t0 = Date.now();
  for (let f = S; f < E; f++) {
    const name = path.join(dir, `f${String(f).padStart(5, "0")}.jpg`);
    if (fs.existsSync(name)) continue;
    await p.evaluate((f) => window.setFrame(f), f);
    await p.screenshot({ path: name, type: "jpeg", quality: 95 });
    if ((f - S) % 60 === 0) console.log(`[${S}-${E}] klatka ${f} z ${E} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await b.close();
  process.exit(0);
}

fs.mkdirSync(dir, { recursive: true });
const workers = Math.max(1, Number(process.env.WORKERS ?? 2));
const per = Math.ceil(TOTAL / workers);
console.log(`Rozdzielczość ${RES * 16 / 9 | 0}x${RES}, ${FPS} kl/s, ${TOTAL} klatek, procesy: ${workers}`);
const jobs = [];
for (let w = 0; w < workers; w++) {
  const S = w * per, E = Math.min(TOTAL, S + per);
  jobs.push(new Promise((res) => spawn(process.execPath, [fileURLToPath(import.meta.url), "worker", String(S), String(E)], { stdio: "inherit" }).on("exit", res)));
}
await Promise.all(jobs);
console.log("Klatki gotowe:", fs.readdirSync(dir).length, "/", TOTAL);
