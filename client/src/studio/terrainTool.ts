// Studio: malowanie terenu pędzlem - wzgórza, doliny, wygładzanie, kolory i woda.
import { Color3, MeshBuilder, StandardMaterial, type ArcRotateCamera, type Mesh, type Scene } from "@babylonjs/core";
import { flatTerrain, TERRAIN_MATERIALS, TerrainGrid } from "../../../shared/terrain.ts";
import type { WorldData } from "../../../shared/types.ts";
import type { WorldView } from "../engine/world.ts";
import { h, toast } from "../ui/dom.ts";

type Brush = "raise" | "lower" | "smooth" | "flatten" | "paint" | "water" | "dry";

const BRUSHES: { id: Brush; icon: string; label: string; tip: string }[] = [
  { id: "raise", icon: "⛰️", label: "Podnieś", tip: "Wzgórza i góry - przytrzymaj i maluj" },
  { id: "lower", icon: "🕳️", label: "Obniż", tip: "Doliny, rowy, dno jeziora" },
  { id: "smooth", icon: "〰️", label: "Wygładź", tip: "Łagodne zbocza" },
  { id: "flatten", icon: "▭", label: "Spłaszcz", tip: "Równa powierzchnia na wysokości miejsca kliknięcia" },
  { id: "paint", icon: "🎨", label: "Maluj", tip: "Trawa, piasek, skała, śnieg..." },
  { id: "water", icon: "🌊", label: "Woda", tip: "Wlewa wodę tam, gdzie teren jest niżej niż poziom wody" },
  { id: "dry", icon: "🏜️", label: "Osusz", tip: "Usuwa wodę" },
];

export interface TerrainToolOpts {
  scene: Scene;
  canvas: HTMLCanvasElement;
  camera: ArcRotateCamera;
  view: WorldView;
  data: WorldData;
  pushUndo: () => void;
  changed: () => void;
}

export function terrainTool(o: TerrainToolOpts) {
  let grid: TerrainGrid | null = TerrainGrid.decode(o.data.terrain);
  let brush: Brush = "raise";
  let size = 16;
  let strength = 5;
  let material = 0;
  let waterLevel = 2;
  let enabled = false;
  const page = h("div", { class: "ltab-page terrain-page" });

  // kółko pędzla na terenie
  const ring = MeshBuilder.CreateTorus("brush", { diameter: 2, thickness: 0.035, tessellation: 48 }, o.scene);
  const ringMat = new StandardMaterial("brush", o.scene);
  ringMat.emissiveColor = new Color3(1, 1, 1);
  ringMat.disableLighting = true;
  ring.material = ringMat;
  ring.isPickable = false;
  ring.setEnabled(false);
  (ring as Mesh).renderingGroupId = 1;

  const pickTerrain = () => {
    const pick = o.scene.pick(o.scene.pointerX, o.scene.pointerY, (m) => !!m.metadata?.terrain);
    return pick?.hit && pick.pickedPoint ? pick.pickedPoint : null;
  };

  // ---------- pędzel ----------
  let painting = false;
  let flatH = 0;
  let waterDirty = false;
  function apply(px: number, pz: number, dt: number) {
    const g = grid;
    if (!g) return;
    const r = size;
    const n = g.n;
    const k = strength / 5;
    if (brush === "paint" || brush === "water" || brush === "dry") {
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const cx = g.x0 + (i + 0.5) * g.cell, cz = g.z0 + (j + 0.5) * g.cell;
          if (Math.hypot(cx - px, cz - pz) > r) continue;
          const c = j * n + i;
          if (brush === "paint") g.m[c] = material;
          else if (brush === "dry") (g.w[c] = NaN), (waterDirty = true);
          else if (g.heightAt(cx, cz) < waterLevel || Math.min(g.hAt(i, j), g.hAt(i + 1, j), g.hAt(i, j + 1), g.hAt(i + 1, j + 1)) < waterLevel) {
            g.w[c] = waterLevel;
            waterDirty = true;
          }
        }
      return;
    }
    const old = brush === "smooth" ? g.h.slice() : g.h;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell;
        const d = Math.hypot(x - px, z - pz);
        if (d > r) continue;
        const f = 0.5 + 0.5 * Math.cos((d / r) * Math.PI); // miękki brzeg pędzla
        const idx = j * (n + 1) + i;
        if (brush === "raise") g.h[idx] += 14 * k * f * dt;
        else if (brush === "lower") g.h[idx] -= 14 * k * f * dt;
        else if (brush === "flatten") g.h[idx] += (flatH - g.h[idx]) * Math.min(1, 4 * k * f * dt);
        else {
          let s = 0, c = 0;
          for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii > n || jj > n) continue;
            s += old[jj * (n + 1) + ii];
            c++;
          }
          g.h[idx] += (s / c - old[idx]) * Math.min(1, 6 * k * f * dt);
        }
        g.h[idx] = Math.max(-500, Math.min(1000, g.h[idx]));
      }
  }

  let raf = 0;
  let last = 0;
  function frame(t: number) {
    if (!painting) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    const p = pickTerrain();
    if (p) {
      apply(p.x, p.z, dt);
      o.view.terrain.refresh();
      if (waterDirty) (o.view.terrain.refreshWater(), (waterDirty = false));
    }
    raf = requestAnimationFrame(frame);
  }

  const onDown = (e: PointerEvent) => {
    if (!enabled || !grid) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = pickTerrain();
    if (!p) return;
    // pędzel zamiast zaznaczania / obracania kamery
    e.stopImmediatePropagation();
    e.preventDefault();
    o.canvas.setPointerCapture(e.pointerId);
    o.pushUndo();
    painting = true;
    flatH = grid.heightAt(p.x, p.z);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const onUp = () => {
    if (!painting) return;
    painting = false;
    cancelAnimationFrame(raf);
    if (grid) o.data.terrain = grid.encode();
    o.changed();
  };
  const onMove = () => {
    if (!enabled || !grid) return ring.setEnabled(false);
    const p = pickTerrain();
    ring.setEnabled(!!p);
    if (p) {
      ring.position.set(p.x, p.y + 0.3, p.z);
      ring.scaling.setAll(size);
      ringMat.emissiveColor = brush === "lower" || brush === "dry" ? new Color3(1, 0.5, 0.4) : brush === "water" ? new Color3(0.4, 0.8, 1) : new Color3(1, 1, 1);
    }
  };
  o.canvas.addEventListener("pointerdown", onDown, true);
  o.canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  // ---------- panel ----------
  function create(n: number, cell: number, hills: boolean) {
    o.pushUndo();
    const g = flatTerrain(n, cell, Math.round(o.camera.target.x / cell) * cell, Math.round(o.camera.target.z / cell) * cell);
    if (hills) {
      // kilka łagodnych wzgórz na brzegach, płasko w środku
      const seeds = Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2 + Math.random(), d: 0.3 + Math.random() * 0.15, h: 12 + Math.random() * 30, r: 30 + Math.random() * 50 }));
      for (let j = 0; j <= n; j++)
        for (let i = 0; i <= n; i++) {
          const x = g.x0 + i * cell, z = g.z0 + j * cell;
          let hh = 0;
          for (const s of seeds) {
            const sx = g.cx + Math.cos(s.a) * s.d * g.size, sz = g.cz + Math.sin(s.a) * s.d * g.size;
            const d = Math.hypot(x - sx, z - sz);
            if (d < s.r) hh = Math.max(hh, s.h * (0.5 + 0.5 * Math.cos((d / s.r) * Math.PI)));
          }
          g.h[j * (n + 1) + i] = hh;
        }
    }
    // stare płaskie podłoże pod terenem tylko by migotało
    const base = o.data.parts.findIndex((p) => p.name === "Podłoże" && p.sx >= 200 && p.sz >= 200 && p.y + p.sy / 2 <= 0.01 && p.y + p.sy / 2 >= -0.01);
    if (base >= 0) {
      o.view.remove(o.data.parts[base].id);
      o.data.parts.splice(base, 1);
      toast("Podłoże zamieniono na teren (Ctrl+Z cofa)", "info");
    }
    grid = g;
    o.data.terrain = g.encode();
    o.view.setTerrain(g);
    o.changed();
    render();
  }

  function remove() {
    if (!grid) return;
    o.pushUndo();
    grid = null;
    delete o.data.terrain;
    o.view.setTerrain(null);
    o.changed();
    render();
  }

  function render() {
    enabled = enabled && !!grid;
    o.canvas.classList.toggle("terrain-brush", enabled);
    if (!grid) {
      const sizeSel = h(
        "select",
        null,
        h("option", { value: "64" }, "Mały (256 × 256)"),
        h("option", { value: "128", selected: true }, "Średni (512 × 512)"),
        h("option", { value: "256" }, "Duży (1024 × 1024)"),
      );
      const hills = h("input", { type: "checkbox", checked: true });
      page.replaceChildren(
        h("div", { class: "panel-title" }, "🏔 Teren"),
        h("p", { class: "hint" }, "Teren to ziemia, którą malujesz pędzlem: wzgórza, doliny, piasek, śnieg i jeziora. Chodzi się po nim jak po klockach."),
        h("label", null, "Wielkość", sizeSel),
        h("label", { class: "check" }, hills, h("span", null, "Od razu kilka wzgórz")),
        h("button", { class: "btn primary", onClick: () => create(Number(sizeSel.value), 4, hills.checked) }, "Utwórz teren"),
      );
      return;
    }
    const range = (min: number, max: number, value: number, set: (v: number) => void) => {
      const r = h("input", { type: "range", min: String(min), max: String(max), value: String(value) });
      r.addEventListener("input", () => set(Number(r.value)));
      return r;
    };
    const lvl = h("input", { type: "number", step: "1", value: String(waterLevel) });
    lvl.addEventListener("change", () => (waterLevel = Number(lvl.value) || 0));
    page.replaceChildren(
      h("div", { class: "panel-title" }, "🏔 Teren"),
      h(
        "button",
        { class: "btn " + (enabled ? "primary" : ""), onClick: () => ((enabled = !enabled), render(), !enabled && ring.setEnabled(false)) },
        enabled ? "🖌 Pędzel: włączony" : "🖌 Włącz pędzel",
      ),
      h("p", { class: "hint" }, enabled ? "Przytrzymaj lewy przycisk (albo palec) na terenie i maluj. Kamera: prawy przycisk / wyłącz pędzel." : "Włącz pędzel, żeby malować."),
      h(
        "div",
        { class: "terrain-brushes" },
        BRUSHES.map((b) =>
          h(
            "button",
            { class: "tbx-item" + (b.id === brush ? " active" : ""), title: b.tip, onClick: () => ((brush = b.id), (enabled = true), render()) },
            h("span", { class: "tbx-ic" }, b.icon),
            h("span", { class: "tbx-name" }, b.label),
          ),
        ),
      ),
      brush === "paint"
        ? h(
            "div",
            { class: "terrain-mats" },
            TERRAIN_MATERIALS.map((m) =>
              h(
                "button",
                {
                  class: "terrain-mat" + (m.id === material ? " active" : ""),
                  title: m.name,
                  style: `background:rgb(${m.color.map((c) => Math.round(c * 255)).join(",")})`,
                  onClick: () => ((material = m.id), render()),
                },
                m.icon,
              ),
            ),
          )
        : "",
      brush === "water" ? h("label", null, "Poziom wody (wysokość)", lvl) : "",
      h("label", null, "Wielkość pędzla", range(2, 60, size, (v) => (size = v))),
      h("label", null, "Siła", range(1, 10, strength, (v) => (strength = v))),
      h("button", { class: "btn small danger", style: "margin-top:12px", onClick: () => remove() }, "Usuń teren"),
    );
  }
  render();

  return {
    page,
    /** po cofnięciu (Ctrl+Z) - teren z danych gry */
    reload() {
      grid = TerrainGrid.decode(o.data.terrain);
      o.view.setTerrain(grid);
      render();
    },
    /** zakładka zamknięta - pędzel się wyłącza */
    deactivate() {
      if (!enabled) return;
      enabled = false;
      ring.setEnabled(false);
      render();
    },
    dispose() {
      o.canvas.removeEventListener("pointerdown", onDown, true);
      o.canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(raf);
      ring.dispose();
    },
  };
}
