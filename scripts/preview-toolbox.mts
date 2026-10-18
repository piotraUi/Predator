// Podgląd modeli z Zestawu (Studio 3D) w prawdziwej grze Apex: każdy model na osobnym polu, zrzut pod kątem 3/4.
// Użycie (serwer testowy na porcie 2599, konto Predator w SP/data2): SP=<katalog> npx tsx scripts/preview-toolbox.ts [id|kategoria ...]
import fs from "node:fs";
import { emptyWorld, makePart, sanitizeWorld } from "../shared/world.ts";
import { TOOLBOX } from "../client/src/studio/toolbox.ts";
import { buildBlueprint, blueprintIds } from "../shared/blueprints/catalog.ts";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const BASE = "http://localhost:2599";
const SP = process.env.SP ?? process.cwd();
const args = process.argv.slice(2);
// "bp:house" = budowla z biblioteki (shared/blueprints), "bp:all" = wszystkie
const bpIds = args.flatMap((a) => (a === "bp:all" ? blueprintIds() : a.startsWith("bp:") ? [a.slice(3)] : []));
const bpModels = bpIds.map((id) => ({ id: "bp-" + id, name: id, icon: "", cat: "bp", parts: () => buildBlueprint(id, {}, 3)!.parts as never[] }));
const rest = args.filter((a) => !a.startsWith("bp:"));
const models = [...bpModels, ...(rest.length || !bpModels.length ? (rest.length ? TOOLBOX.filter((m) => rest.includes(m.id) || rest.includes(m.cat)) : TOOLBOX) : [])];
const pass = /Hasło:\s*(\S+)/.exec(fs.readFileSync(`${SP}/data2/konto-predator.txt`, "utf8"))![1];
const login = (await (await fetch(BASE + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "Predator", password: pass }) })).json()) as { token: string };
const H = { "content-type": "application/json", authorization: "Bearer " + login.token };

const w = emptyWorld();
const cams: { id: string; x: number; z: number; h: number; d: number }[] = [];
models.forEach((m, i) => {
  const ox = (i % 8) * 140, oz = Math.floor(i / 8) * 140;
  const defs = m.parts();
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, h = 0;
  for (const d of defs) {
    const sx = d.sx ?? 1, sy = d.sy ?? 1, sz = d.sz ?? 1, x = d.x ?? 0, z = d.z ?? 0, y = d.y ?? sy / 2;
    x0 = Math.min(x0, x - sx / 2); x1 = Math.max(x1, x + sx / 2); z0 = Math.min(z0, z - sz / 2); z1 = Math.max(z1, z + sz / 2); h = Math.max(h, y + sy / 2);
    w.parts.push(makePart({ ...d, name: m.name, x: ox + x, y, z: oz + z }));
  }
  cams.push({ id: m.id, x: ox + (x0 + x1) / 2, z: oz + (z0 + z1) / 2, h, d: Math.max(x1 - x0, z1 - z0) });
});
const data = sanitizeWorld(w);
// gracz daleko od modeli (żeby nie siadał w pojazdach), duża podłoga pod wszystkim
for (const p of data.parts) if (p.kind === "spawn") { p.x = -400; p.z = -400; }
data.parts.push(makePart({ name: "Podłoga podglądu", x: 500, y: -0.5, z: 300, sx: 2400, sy: 1, sz: 1600, color: "#7f8c72" }));
const mine = (await (await fetch(BASE + "/api/worlds/mine", { headers: H })).json()) as { id: number; name: string }[];
for (const m of mine) if (m.name === "Zestaw podglad") await fetch(BASE + "/api/worlds/" + m.id, { method: "DELETE", headers: H });
const created = (await (await fetch(BASE + "/api/worlds", { method: "POST", headers: H, body: JSON.stringify({ name: "Zestaw podglad" }) })).json()) as { id: number };
const put = await fetch(BASE + "/api/worlds/" + created.id, { method: "PUT", headers: H, body: JSON.stringify({ name: "Zestaw podglad", description: "x", maxPlayers: 20, published: true, data }) });
if (!put.ok) console.log("PUT", put.status, await put.text());

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await b.newContext({ viewport: { width: 640, height: 480 } })).newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.addInitScript(() => { localStorage.setItem("predator.settings", JSON.stringify({ quality: "medium", gfxApi: "webgl2" })); localStorage.setItem("apexDebug", "1"); });
await page.goto(BASE);
await page.evaluate((t) => localStorage.setItem("predator.token", t), login.token);
await page.goto(BASE + "/");
await page.waitForTimeout(1500);
await page.getByText("Pomiń").first().click({ timeout: 2000 }).catch(() => {});
await page.screenshot({ path: `${SP}/tb-home.png` });
await page.locator("[class*=card]", { hasText: "Zestaw podglad" }).first().click();
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
await page.addStyleTag({ content: "body *{visibility:hidden!important} canvas{visibility:visible!important}" });
fs.mkdirSync(`${SP}/tb`, { recursive: true });
const ang = Number(process.env.ANG ?? 0.75);
for (const c of cams) {
  const dist = Math.max(c.d * 1.15 + 6, c.h * 1.3 + 4);
  const ex = c.x + Math.sin(ang) * dist, ez = c.z - Math.cos(ang) * dist, ey = c.h * 0.55 + dist * 0.35;
  await page.evaluate(([a, b2, c2, tx, ty, tz]) => { (window as unknown as { __cam: unknown }).__cam = { eye: [a, b2, c2], target: [tx, ty, tz] }; }, [ex, ey, ez, c.x, c.h * 0.4, c.z]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SP}/tb/${c.id}${process.env.SUFFIX ?? ""}.png` });
}
await b.close();
console.log("ok", cams.length);
