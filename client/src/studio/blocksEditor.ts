// Ustawienia świata z bloków (Minecraft) w oknie "Ustawienia gry".
import type { BlockWorldDef } from "../../../shared/types.ts";
import { voxelConfig, VOXEL_LIMITS } from "../../../shared/voxel.ts";
import { h } from "../ui/dom.ts";

export function blocksEditor(cur: BlockWorldDef | undefined) {
  const c = voxelConfig(cur);
  const on = h("input", { type: "checkbox", checked: !!cur }) as HTMLInputElement;
  const seed = h("input", { type: "number", value: String(c.seed), style: "width:9em" }) as HTMLInputElement;
  const dice = h("button", { type: "button", class: "btn small", title: "Losowe ziarno", onClick: () => (seed.value = String(Math.floor(Math.random() * 1_000_000))) }, "🎲");
  const sel = (options: [string | number, string][], value: string | number) =>
    h("select", null, options.map(([v, label]) => h("option", { value: String(v), selected: String(v) === String(value) }, label))) as HTMLSelectElement;
  const size = sel(VOXEL_LIMITS.sizes.map((n) => [n, `${n} × ${n} bloków`]), c.sx);
  const height = sel(VOXEL_LIMITS.heights.map((n) => [n, `${n} bloków`]), c.sy);
  const gen = sel([["hills", "🏔 Wzgórza, góry, jaskinie"], ["flat", "⬜ Płaski"]], c.gen);
  const mode = sel([["survival", "⛏ Przetrwanie (kopanie, crafting)"], ["creative", "🎨 Kreatywny (wszystkie bloki)"]], c.mode);
  const day = sel([[0, "☀ Zawsze dzień"], [300, "5 minut"], [600, "10 minut"], [1200, "20 minut"]], [0, 300, 600, 1200].includes(c.day) ? c.day : 600);
  const check = (v: boolean) => h("input", { type: "checkbox", checked: v }) as HTMLInputElement;
  const mobs = check(c.mobs), caves = check(c.caves), trees = check(c.trees);
  const details = h(
    "div",
    { class: "form", style: "padding-left:8px;border-left:3px solid var(--line)" },
    h("label", null, "Ziarno (inne ziarno = inny świat)", h("div", { class: "row" }, seed, dice)),
    h("div", { class: "row wrap" }, h("label", null, "Rozmiar", size), h("label", null, "Wysokość", height)),
    h("label", null, "Teren", gen),
    h("label", null, "Tryb gry", mode),
    h("label", null, "Doba (dzień i noc)", day),
    h("label", { class: "check" }, mobs, h("span", null, "Zwierzęta, a w nocy zombie i creepery")),
    h("label", { class: "check" }, caves, h("span", null, "Jaskinie i lawa pod ziemią")),
    h("label", { class: "check" }, trees, h("span", null, "Drzewa i kaktusy")),
    h("p", { class: "muted small", style: "margin:0" }, "Świat buduje się z ziarna, a to, co zbudują gracze, serwer zapisuje osobno dla każdego ziarna. Skrypty: getBlock, setBlock, giveItem, onBlockBreak…"),
  );
  const sync = () => details.classList.toggle("hidden", !on.checked);
  on.addEventListener("change", sync);
  sync();
  const el = h("div", { class: "prop" }, h("div", { class: "prop-group" }, "⛏️ Świat z bloków"), h("label", { class: "check" }, on, h("span", null, "Świat z bloków (jak Minecraft)")), details);
  return {
    el,
    read(): BlockWorldDef | undefined {
      if (!on.checked) return undefined;
      const next = voxelConfig({
        sx: Number(size.value), sz: Number(size.value), sy: Number(height.value), size: c.size, seed: Number(seed.value),
        gen: gen.value as BlockWorldDef["gen"], mode: mode.value as BlockWorldDef["mode"], day: Number(day.value), mobs: mobs.checked, caves: caves.checked, trees: trees.checked,
      });
      // zmiany twórcy pasują tylko do tego samego świata
      const same = cur && cur.seed === next.seed && cur.sx === next.sx && cur.sz === next.sz && cur.sy === next.sy && cur.gen === next.gen && cur.caves === next.caves && cur.trees === next.trees;
      if (same && cur?.edits) next.edits = cur.edits;
      return next;
    },
  };
}
