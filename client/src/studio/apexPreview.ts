// Studio: podgląd Apexa w oknie edytora. Pokazuje świat tak, jak zobaczą go gracze (cienie, woda z odbiciem, trawa, drzewa, niebo,
// pora dnia i pogoda), z obracaną kamerą, oraz edytory na żywo: niebo i światło, pora dnia i pogoda, przyroda i cząsteczki.
// Zmiany trafiają od razu do danych gry (z cofaniem) i do podglądu.
import { SKYBOXES, findSkybox } from "../../../shared/skybox.ts";
import { TerrainGrid } from "../../../shared/terrain.ts";
import { rotationMatrix } from "../../../shared/physics.ts";
import { PART_EMITTERS, WEATHERS, DEFAULT_LIGHT, type EmitterCfg, type Part, type WeatherId, type WorldData } from "../../../shared/types.ts";
import { ApexRenderer } from "../apex/renderer.ts";
import { Particles, type FxKind } from "../apex/particles.ts";
import { TIERS, detectTier } from "../apex/quality.ts";
import { buildGrass, scatterTrees } from "../apex/nature.ts";
import type { V3 } from "../apex/math.ts";
import { h } from "../ui/dom.ts";

export interface PreviewHost {
  data: WorldData;
  /** zaznaczony klocek w edytorze (cel kamery i edytora cząsteczek) */
  selected(): Part | null;
  /** zmiana danych: Studio zapisuje stan do cofania, odświeża swój widok i oznacza grę jako zmienioną */
  mutate(fn: () => void): void;
}

const WEATHER_NAMES: Record<WeatherId, string> = { clear: "☀️ Słońce", rain: "🌧️ Deszcz", snow: "❄️ Śnieg", storm: "⛈️ Burza" };

/** otwiera okno podglądu; zwraca funkcję zamykającą */
export function openApexPreview(host: PreviewHost): () => void {
  const data = host.data;
  const canvas = h("canvas", { class: "ap-canvas" });
  const side = h("div", { class: "ap-side" });
  const msg = h("div", { class: "ap-msg hidden" });
  const win = h(
    "div",
    { class: "modal-bg ap-bg" },
    h(
      "div",
      { class: "ap-win" },
      h("div", { class: "ap-head" }, h("b", null, "🎬 Podgląd Apex"), h("span", { class: "muted" }, "Przeciągnij = obrót · prawy/Shift = przesuń · kółko = zoom"), h("button", { class: "icon-btn", onClick: () => close() }, "✕")),
      h("div", { class: "ap-body" }, h("div", { class: "ap-view" }, canvas, msg), side),
    ),
  );
  document.body.append(win);

  let rend: ApexRenderer;
  try {
    rend = new ApexRenderer(canvas);
  } catch {
    msg.textContent = "Ta przeglądarka nie obsługuje WebGL2 - podgląd Apex jest niedostępny.";
    msg.classList.remove("hidden");
    return () => win.remove();
  }
  const fx = new Particles();
  const tier = detectTier(rend.gl).start;
  rend.setQuality(TIERS[tier], true);

  // ---------- świat ----------
  let terrain: TerrainGrid | null = null;
  const rot = (p: Part) => rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0);
  const treeIds = new Set<string>();
  let signature = "";
  const sig = () => {
    let s = data.parts.length;
    for (const p of data.parts) s += p.x * 1.3 + p.y * 1.7 + p.z * 1.9 + p.sx * 2.3 + p.sy * 2.9 + p.sz * 3.1 + p.ry * 0.7 + p.transparency * 5;
    return s + "|" + (data.terrain ? JSON.stringify(data.terrain).length : 0);
  };
  const loadWorld = () => {
    rend.clearParts();
    terrain = TerrainGrid.decode(data.terrain);
    rend.setTerrain(terrain);
    rend.setGrass(terrain && data.nature?.grass !== false ? buildGrass(terrain, 120_000) : []);
    for (const p of data.parts) {
      if (p.kind === "npc" || p.kind === "pickup") continue;
      rend.addPart(p, rot(p));
    }
    treeIds.clear();
    if (terrain && data.nature?.trees) {
      for (const t of scatterTrees(terrain, data.nature.trees, () => false)) {
        rend.addPart(t, rotationMatrix(0, 0, 0));
        treeIds.add(t.id);
      }
    }
    signature = sig();
  };

  // ---------- kamera ----------
  let target: V3 = [0, 8, 0];
  let yaw = 0.8, pitch = 0.45, radius = 60;
  const focus = () => {
    const sel = host.selected();
    if (sel) {
      target = [sel.x, sel.y, sel.z];
      radius = Math.max(12, Math.max(sel.sx, sel.sy, sel.sz) * 3);
    } else {
      const spawn = data.parts.find((p) => p.kind === "spawn") ?? data.parts[0];
      target = spawn ? [spawn.x, spawn.y + 3, spawn.z] : [0, 8, 0];
      radius = 70;
    }
  };

  // ---------- ustawienia podglądu ----------
  const atm = { on: !!data.atmosphere, hour: data.atmosphere?.hour ?? 12, t0: performance.now() };
  const applyAll = () => {
    rend.setSky(data.skyColor, findSkybox(data.skybox));
    const l = { ...DEFAULT_LIGHT, ...(data.light ?? {}) };
    rend.setLight(l.brightness, l.fog);
    const a = data.atmosphere;
    atm.on = !!a;
    if (a) rend.setAtmosphere({ hour: curHour(), weather: a.weather ?? "clear", wind: a.wind ?? 0.15 });
    else rend.setAtmosphere(null);
  };
  const curHour = () => {
    const a = data.atmosphere;
    if (!a) return 12;
    const base = atm.hour;
    return a.cycle ? (((base + ((performance.now() - atm.t0) / 1000 / a.cycle) * 24) % 24) + 24) % 24 : base;
  };

  // ---------- panel ----------
  const row = (label: string, ...ctl: Node[]) => h("label", { class: "ap-row" }, h("span", null, label), ...ctl);
  const range = (min: number, max: number, step: number, val: number, on: (v: number) => void) => {
    const el = h("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(val) });
    el.addEventListener("input", () => on(Number(el.value)));
    return el;
  };
  const section = (title: string, ...kids: Node[]) => h("div", { class: "ap-sec" }, h("h4", null, title), ...kids);
  const build = () => {
    side.replaceChildren();
    // niebo
    const skySel = h("select", null, h("option", { value: "" }, "🎨 Zwykły kolor"), SKYBOXES.map((s) => h("option", { value: s.id, selected: data.skybox === s.id }, s.icon + " " + s.name)));
    skySel.addEventListener("change", () =>
      host.mutate(() => {
        if (skySel.value) data.skybox = skySel.value;
        else delete data.skybox;
        applyAll();
      }),
    );
    const skyCol = h("input", { type: "color", value: data.skyColor });
    skyCol.addEventListener("input", () => host.mutate(() => ((data.skyColor = skyCol.value), applyAll())));
    const light = { ...DEFAULT_LIGHT, ...(data.light ?? {}) };
    const setLight = (patch: Partial<typeof light>) =>
      host.mutate(() => {
        const l = { ...DEFAULT_LIGHT, ...(data.light ?? {}), ...patch };
        if (l.brightness === 1 && !l.fog && !l.flashlight) delete data.light;
        else data.light = l;
        applyAll();
      });
    const flash = h("input", { type: "checkbox", checked: light.flashlight });
    flash.addEventListener("change", () => setLight({ flashlight: flash.checked }));
    side.append(
      section("🌤️ Niebo i światło", row("Niebo", skySel), row("Kolor", skyCol), row("Jasność", range(0.05, 1.5, 0.05, light.brightness, (v) => setLight({ brightness: v }))), row("Mgła (0 = brak)", range(0, 600, 10, light.fog, (v) => setLight({ fog: v }))), row("Latarka", flash)),
    );
    // pora dnia i pogoda
    const a = data.atmosphere;
    const on = h("input", { type: "checkbox", checked: !!a });
    on.addEventListener("change", () =>
      host.mutate(() => {
        if (on.checked) data.atmosphere = { hour: atm.hour, wind: 0.15 };
        else delete data.atmosphere;
        atm.t0 = performance.now();
        applyAll();
        build();
      }),
    );
    side.append(section("🕐 Pora dnia i pogoda", row("Włączone", on)));
    if (a) {
      const setA = (patch: Partial<NonNullable<WorldData["atmosphere"]>>) =>
        host.mutate(() => {
          const n = { ...(data.atmosphere ?? {}), ...patch };
          if (!n.cycle) delete n.cycle;
          if (!n.weather || n.weather === "clear") delete n.weather;
          data.atmosphere = n;
          applyAll();
        });
      const hourLbl = h("b", null, fmt(a.hour ?? 12));
      const hr = range(0, 24, 0.25, a.hour ?? 12, (v) => {
        atm.hour = v;
        atm.t0 = performance.now();
        hourLbl.textContent = fmt(v);
        setA({ hour: v });
      });
      const wsel = h("select", null, WEATHERS.map((w) => h("option", { value: w, selected: (a.weather ?? "clear") === w }, WEATHER_NAMES[w])));
      wsel.addEventListener("change", () => setA({ weather: wsel.value as WeatherId }));
      const cyc = h("input", { type: "number", min: "0", max: "7200", step: "10", value: String(a.cycle ?? 0) });
      cyc.addEventListener("change", () => setA({ cycle: Number(cyc.value) > 0 ? Math.min(7200, Math.max(20, Number(cyc.value))) : 0 }));
      side.append(section("", row("Godzina", hr, hourLbl), row("Doba trwa (s, 0 = stoi)", cyc), row("Pogoda", wsel), row("Wiatr", range(0, 1, 0.05, a.wind ?? 0.15, (v) => setA({ wind: v })))));
    }
    // przyroda
    const grass = h("input", { type: "checkbox", checked: data.nature?.grass !== false });
    grass.addEventListener("change", () =>
      host.mutate(() => {
        const n = { ...(data.nature ?? {}) };
        if (grass.checked) delete n.grass;
        else n.grass = false;
        if (Object.keys(n).length) data.nature = n;
        else delete data.nature;
        loadWorld();
      }),
    );
    let treeTimer = 0;
    side.append(
      section(
        "🌿 Przyroda",
        row("Trawa", grass),
        row(
          "Drzewa",
          range(0, 1, 0.05, data.nature?.trees ?? 0, (v) => {
            host.mutate(() => {
              const n = { ...(data.nature ?? {}) };
              if (v > 0) n.trees = v;
              else delete n.trees;
              if (Object.keys(n).length) data.nature = n;
              else delete data.nature;
            });
            clearTimeout(treeTimer);
            treeTimer = window.setTimeout(loadWorld, 150);
          }),
        ),
      ),
    );
    // cząsteczki
    side.append(particleSection());
  };
  const fmt = (v: number) => {
    const m = Math.round(v * 60);
    return String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  };

  /** edytor cząsteczek: zaznaczony klocek dostaje emiter z własnymi kolorami i mnożnikami, a podgląd pokazuje go na żywo */
  const particleSection = () => {
    const sel = host.selected();
    const sec = section("✨ Cząsteczki");
    if (!sel) {
      sec.append(h("p", { class: "muted", style: "margin:0;font-size:12px" }, "Zaznacz klocek w Studiu (kliknij go na planszy), żeby nadać mu ogień, dym, iskry i inne efekty."));
      return sec;
    }
    sec.append(h("p", { class: "muted", style: "margin:0 0 6px;font-size:12px" }, "Klocek: ", h("b", null, sel.name)));
    const kind = h("select", null, h("option", { value: "" }, "Brak"), PART_EMITTERS.map((e) => h("option", { value: e.id, selected: sel.emitter === e.id }, e.name)));
    kind.addEventListener("change", () =>
      host.mutate(() => {
        if (kind.value) sel.emitter = kind.value as Part["emitter"];
        else {
          delete sel.emitter;
          delete sel.emitterCfg;
        }
        syncEmitters();
        build();
      }),
    );
    sec.append(row("Rodzaj", kind));
    if (sel.emitter) {
      const cfg: EmitterCfg = sel.emitterCfg ?? {};
      const set = (patch: EmitterCfg) =>
        host.mutate(() => {
          const n: EmitterCfg = { ...(sel.emitterCfg ?? {}), ...patch };
          for (const k of Object.keys(n) as (keyof EmitterCfg)[]) if (n[k] === undefined) delete n[k];
          if (Object.keys(n).length) sel.emitterCfg = n;
          else delete sel.emitterCfg;
          syncEmitters();
        });
      const c0 = h("input", { type: "color", value: cfg.c0 ?? "#ff9d1c" });
      const c1 = h("input", { type: "color", value: cfg.c1 ?? "#c81e00" });
      c0.addEventListener("input", () => set({ c0: c0.value }));
      c1.addEventListener("input", () => set({ c1: c1.value }));
      sec.append(
        row("Kolor na starcie", c0),
        row("Kolor na końcu", c1),
        row("Wielkość", range(0.2, 4, 0.1, cfg.size ?? 1, (v) => set({ size: v }))),
        row("Prędkość", range(0.1, 4, 0.1, cfg.speed ?? 1, (v) => set({ speed: v }))),
        row("Czas życia", range(0.2, 3, 0.1, cfg.life ?? 1, (v) => set({ life: v }))),
        row("Gęstość", range(0.1, 4, 0.1, cfg.rate ?? 1, (v) => set({ rate: v }))),
        row("Grawitacja", range(-2, 3, 0.1, cfg.gravity ?? 1, (v) => set({ gravity: v }))),
        row("Rozrzut", range(0, 2, 0.1, cfg.spread ?? 1, (v) => set({ spread: v }))),
        h("button", { class: "btn", style: "margin-top:6px", onClick: () => host.mutate(() => (delete sel.emitterCfg, syncEmitters(), build())) }, "↺ Domyślne ustawienia"),
      );
    }
    return sec;
  };
  const syncEmitters = () => {
    for (const p of data.parts) fx.setEmitter(p.id, p.emitter ?? null, [p.x, p.y, p.z], [p.sx, p.sy, p.sz], p.emitterCfg);
  };

  // ---------- sterowanie kamerą ----------
  const ptrs = new Map<number, { x: number; y: number }>();
  let lastPinch = 0;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) radius = Math.min(500, Math.max(3, radius * (lastPinch / d)));
      lastPinch = d;
      return;
    }
    if (e.buttons === 2 || e.shiftKey) {
      const k = radius * 0.0016;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      target = [target[0] - rx * dx * k * 1, target[1] + dy * k, target[2] - rz * dx * k * 1];
    } else {
      yaw -= dx * 0.008;
      pitch = Math.min(1.5, Math.max(-0.2, pitch + dy * 0.006));
    }
  });
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    lastPinch = 0;
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    radius = Math.min(500, Math.max(3, radius * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
  }, { passive: false });

  // ---------- pętla ----------
  const fit = () => {
    const box = canvas.parentElement!;
    rend.resize(box.clientWidth || 600, box.clientHeight || 400, Math.min(devicePixelRatio || 1, 1.5));
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas.parentElement!);
  loadWorld();
  focus();
  applyAll();
  syncEmitters();
  build();
  fit();
  let raf = 0, last = performance.now(), nextCheck = 0, closed = false;
  const frame = (now: number) => {
    if (closed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    rend.time += dt;
    if (now >= nextCheck) {
      nextCheck = now + 1200;
      if (sig() !== signature) {
        loadWorld();
        syncEmitters();
      }
    }
    if (atm.on && data.atmosphere?.cycle) rend.setAtmosphere({ hour: curHour(), weather: data.atmosphere.weather ?? "clear", wind: data.atmosphere.wind ?? 0.15 });
    fx.update(dt);
    fx.draw(rend);
    const cp = Math.cos(pitch);
    const eye: V3 = [target[0] + Math.sin(yaw) * cp * radius, target[1] + Math.sin(pitch) * radius, target[2] + Math.cos(yaw) * cp * radius];
    if (terrain) {
      const g = terrain.heightAt(eye[0], eye[2]);
      if (Number.isFinite(g) && eye[1] < g + 1) eye[1] = g + 1;
    }
    rend.followShadows(target);
    rend.render({ eye, target, fov: 1.0, near: 0.3, far: 2000 });
  };
  raf = requestAnimationFrame(frame);

  const close = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    rend.dispose();
    win.remove();
  };
  void (null as unknown as FxKind);
  win.addEventListener("pointerdown", (e) => e.target === win && close());
  return close;
}
