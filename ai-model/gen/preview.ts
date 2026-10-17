// Podgląd budowli w prawdziwej grze (Apex): wstawia wygenerowane klocki do świata, otwiera go i robi zrzuty z kilku kątów.
// Użycie (serwer testowy na porcie 2599): npx tsx ../ai-model/gen/preview.ts <id> [ziarno]
import fs from "node:fs";
import { emptyWorld, sanitizeWorld, makePart } from "../../shared/world.ts";
import { Rng, Scene, type Spec } from "./core.ts";
import { REGISTRY } from "./registry.ts";
import { parseAssistant } from "../../shared/ai/localFormat.ts";
import { sampleScene } from "./scenes.ts";
import { sampleSingle } from "./samples.ts";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const BASE = "http://localhost:2599";
const SP = process.env.SP ?? process.cwd();
const ids = process.argv.slice(2).filter((a) => !/^\d+$/.test(a));
const seed = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 1);
const pass = /Hasło:\s*(\S+)/.exec(fs.readFileSync(`${SP}/data2/konto-predator.txt`, "utf8"))![1];
const login = (await (await fetch(BASE + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "Predator", password: pass }) })).json()) as { token: string };
const H = { "content-type": "application/json", authorization: "Bearer " + login.token };

const w = emptyWorld();
const centers: { id: string; x: number; z: number; h: number; d: number }[] = [];
ids.forEach((id, i) => {
  // "scene:village" / "single:house" - pełna próbka przechodzi przez format zapisu i parser (to, co zobaczyłby model i serwer)
  if (id.includes(":")) {
    const [kind, what] = id.split(":");
    const smp = kind === "scene" ? sampleScene(new Rng(seed * 100 + i), what) : sampleSingle(new Rng(seed * 100 + i), what);
    if (!smp) throw new Error("brak próbki " + id);
    const all: Spec[] = [];
    for (const m of smp.messages) if (m.role === "assistant") for (const c of parseAssistant(m.content).calls) if (c.name === "create_parts") all.push(...((c.args.parts as unknown) as Spec[]));
    for (const sp of all) w.parts.push(makePart({ ...(sp as object), id: undefined as never }));
    const xs = all.map((p) => p.x), zs = all.map((p) => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    for (const p of w.parts.slice(-all.length)) { p.x += i * 400 - cx; p.z -= cz; }
    centers.push({ id: id.replace(":", "-"), x: i * 400, z: 0, h: Math.max(...all.map((p) => p.y + p.sy / 2)), d: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 20 });
    return;
  }
  const b = REGISTRY[id];
  if (!b) throw new Error("brak budowli " + id);
  const r = new Rng(seed * 100 + i), s = new Scene(i * 160, 0, 0);
  const built = b.build(r, s);
  for (const sp of s.parts) w.parts.push(makePart({ ...(sp as object), id: undefined as never }));
  centers.push({ id, x: i * 160, z: 0, h: Math.max(...s.parts.map((p) => p.y + p.sy / 2)), d: Math.max(built.foot[0], built.foot[1]) });
});
const data = sanitizeWorld(w);
const mine = (await (await fetch(BASE + "/api/worlds/mine", { headers: H })).json()) as { id: number; name: string }[];
for (const m of mine) if (m.name === "AI podglad") await fetch(BASE + "/api/worlds/" + m.id, { method: "DELETE", headers: H });
const created = (await (await fetch(BASE + "/api/worlds", { method: "POST", headers: H, body: JSON.stringify({ name: "AI podglad" }) })).json()) as { id: number };
console.log("created", JSON.stringify(created));
const put = await fetch(BASE + "/api/worlds/" + created.id, { method: "PUT", headers: H, body: JSON.stringify({ name: "AI podglad", description: "x", maxPlayers: 20, published: true, data }) });
if (!put.ok) console.log("PUT", put.status, await put.text());

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.addInitScript(() => { localStorage.setItem("predator.settings", JSON.stringify({ quality: "medium", gfxApi: "webgl2" })); localStorage.setItem("apexDebug", "1"); });
await page.goto(BASE);
await page.evaluate((t) => localStorage.setItem("predator.token", t), login.token);
await page.goto(BASE + "/");
await page.waitForTimeout(1500);
await page.locator("[class*=card]", { hasText: "AI podglad" }).first().click();
await page.waitForTimeout(1200);
await page.locator(".pv-play").first().click();
await page.waitForSelector(".game-canvas", { timeout: 20000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const r = (window as unknown as { __apexRend: { render: (l: unknown) => void } }).__apexRend;
  const orig = r.render.bind(r);
  (window as unknown as { __cam: unknown }).__cam = null;
  r.render = (look: unknown) => {
    const c = (window as unknown as { __cam: { eye: number[]; target: number[] } | null }).__cam;
    orig(c ? { ...(look as object), eye: c.eye, target: c.target } : look);
  };
});
for (const c of centers) {
  const views: [string, number, number][] = [["front", -0.0, 1], ["side", 1.0, 1], ["back", 3.1, 1.2], ["top", 0.5, 2.6]];
  for (const [nm, ang, elev] of views) {
    const dist = Math.max(c.d * 1.25 + 12, c.h * 1.15), hgt = Math.max(c.h * 0.5, 6);
    const ex = c.x + Math.sin(ang) * dist, ez = c.z - Math.cos(ang) * dist;
    const ey = hgt + (nm === "top" ? dist * 0.9 : dist * 0.28 * elev);
    await page.evaluate(([ex2, ey2, ez2, tx, ty, tz]) => { (window as unknown as { __cam: unknown }).__cam = { eye: [ex2, ey2, ez2], target: [tx, ty, tz] }; }, [ex, ey, ez, c.x, hgt * 0.7, c.z]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SP}/prev-${c.id}-${nm}.png` });
  }
}
await b.close();
console.log("ok", ids.join(","));
