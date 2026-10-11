// Interfejs świata z bloków (wspólny dla silników Babylon i Apex): pasek przedmiotów, nazwa trzymanego
// przedmiotu, ekwipunek z craftingiem lub paletą (tryb kreatywny).
import { item, RECIPES, type Recipe } from "../../../shared/voxel.ts";
import type { GameConnection } from "./connection.ts";
import { itemIcon, PLACEABLE } from "../engine/voxelAtlas.ts";
import { h, modal } from "../ui/dom.ts";

export type Slot = [string, number] | null;
export const HOTBAR = 9;

export function createVoxelUi(o: { wrap: HTMLElement; conn: GameConnection; creative: boolean; onSelect?: () => void }) {
  const { wrap, conn: r, creative } = o;
  let slots: Slot[] = new Array(36).fill(null);
  let sel = 0;
  /** okno ekwipunku (otwarte = funkcje zamknięcia i odświeżenia) - przed rejestracją wiadomości, bo połączenie oddaje je od razu */
  let invClose: (() => void) | null = null;
  let renderInv: (() => void) | null = null;

  // ---------- pasek przedmiotów ----------
  const bar = h("div", { class: "vox-hotbar" });
  const nameTip = h("div", { class: "vox-name" });
  wrap.append(bar, nameTip);
  let tipTimer = 0;
  const showName = () => {
    const s = slots[sel];
    nameTip.textContent = s ? item(s[0])?.name ?? s[0] : "";
    nameTip.classList.toggle("on", !!s);
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => nameTip.classList.remove("on"), 1500);
  };
  const renderBar = () => {
    bar.replaceChildren(
      ...slots.slice(0, HOTBAR).map((s, i) =>
        h(
          "button",
          { class: "vox-slot" + (i === sel ? " on" : ""), onClick: () => select(i) },
          s ? h("img", { src: itemIcon(s[0]), alt: s[0], draggable: false }) : null,
          s && s[1] > 1 ? h("span", { class: "vox-count" }, String(s[1])) : null,
        ),
      ),
      h("button", { class: "vox-slot vox-bag", title: "Ekwipunek (E)", onClick: () => openInventory() }, "🎒"),
    );
  };
  const select = (i: number) => {
    sel = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    r.send("vs", sel);
    renderBar();
    showName();
    o.onSelect?.();
  };
  renderBar();

  // ---------- ekwipunek i crafting ----------
  function openInventory() {
    if (invClose) return;
    let picked: number | null = null;
    const body = h("div", { class: "vox-inv" });
    const slotEl = (i: number) => {
      const s = slots[i];
      return h(
        "button",
        {
          class: "vox-slot" + (picked === i ? " picked" : "") + (i === sel ? " on" : ""),
          "data-pad": "1",
          title: s ? `${item(s[0])?.name ?? s[0]} ×${s[1]}` : "",
          onClick: () => {
            if (picked === null) picked = s ? i : null;
            else {
              if (picked !== i) r.send("vsw", { a: picked, b: i });
              picked = null;
            }
            renderInv?.();
          },
        },
        s ? h("img", { src: itemIcon(s[0]), alt: s[0], draggable: false }) : null,
        s && s[1] > 1 ? h("span", { class: "vox-count" }, String(s[1])) : null,
      );
    };
    const have = (key: string) => slots.reduce((n, s) => n + (s?.[0] === key ? s[1] : 0), 0);
    const recipeRow = (rc: Recipe) => {
      const ok = rc.in.every(([k, n]) => have(k) >= n);
      const out = item(rc.out[0]);
      return h(
        "div",
        { class: "vox-recipe" + (ok ? "" : " missing") },
        h("img", { src: itemIcon(rc.out[0]), alt: "" }),
        h("div", { class: "vox-r-main" }, h("b", null, `${out?.name ?? rc.out[0]}${rc.out[1] > 1 ? " ×" + rc.out[1] : ""}`), h("span", { class: "muted small" }, rc.in.map(([k, n]) => `${n}× ${item(k)?.name ?? k}`).join(" + ") + (rc.station === "table" ? " · 🪵 stół" : rc.station === "furnace" ? " · 🔥 piec" : ""))),
        h("button", { class: "btn small" + (ok ? " primary" : ""), "data-pad": "1", disabled: !ok, onClick: () => r.send("vc", { id: rc.id, n: 1 }) }, "Zrób"),
      );
    };
    renderInv = () => {
      const grid = h("div", { class: "vox-grid" }, ...Array.from({ length: 27 }, (_, i) => slotEl(HOTBAR + i)));
      const hot = h("div", { class: "vox-grid hot" }, ...Array.from({ length: HOTBAR }, (_, i) => slotEl(i)));
      const tools = h(
        "div",
        { class: "row" },
        h("span", { class: "muted small" }, picked !== null ? "Kliknij inne miejsce, żeby przenieść" : "Kliknij przedmiot, potem miejsce"),
        picked !== null ? h("button", { class: "btn small danger", onClick: () => (r.send("vd", picked), (picked = null)) }, "🗑 Wyrzuć") : null,
      );
      let side: HTMLElement;
      if (creative) {
        side = h(
          "div",
          { class: "vox-palette" },
          h("div", { class: "prop-group" }, `Wszystkie przedmioty - kliknij, żeby dać do miejsca ${sel + 1} paska`),
          h(
            "div",
            { class: "vox-grid pal" },
            ...[...PLACEABLE, "wood_pickaxe", "diamond_pickaxe", "diamond_sword", "apple", "cooked_porkchop", "coal", "iron_ingot", "gold_ingot", "diamond", "stick", "gunpowder"].map((k) =>
              h("button", { class: "vox-slot", "data-pad": "1", title: item(k)?.name ?? k, onClick: () => r.send("vg", { slot: sel, key: k }) }, h("img", { src: itemIcon(k), alt: k })),
            ),
          ),
        );
      } else {
        const list = [...RECIPES].sort((a, b) => Number(b.in.every(([k, n]) => have(k) >= n)) - Number(a.in.every(([k, n]) => have(k) >= n)));
        side = h("div", { class: "vox-crafting" }, h("div", { class: "prop-group" }, "🔨 Crafting"), ...list.map(recipeRow));
      }
      body.replaceChildren(h("div", { class: "vox-inv-left" }, h("div", { class: "prop-group" }, "🎒 Plecak"), grid, h("div", { class: "prop-group" }, "Pasek"), hot, tools), side);
    };
    renderInv();
    const close = modal(creative ? "🎒 Ekwipunek (tryb kreatywny)" : "🎒 Ekwipunek i crafting", body);
    const bg = body.closest(".modal-bg");
    bg?.classList.add("vox-modal");
    invClose = () => {
      close();
      invClose = null;
      renderInv = null;
    };
    // zamknięcie krzyżykiem / kliknięciem obok
    const obs = new MutationObserver(() => {
      if (!bg?.isConnected) {
        invClose = null;
        renderInv = null;
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true });
  }

  // serwer przysyła cały ekwipunek
  r.onMessage("vi", (m: { s: Slot[]; sel: number }) => {
    slots = m.s;
    renderBar();
    renderInv?.();
  });

  return {
    get slots() {
      return slots;
    },
    get sel() {
      return sel;
    },
    select,
    renderBar,
    openInventory,
    toggleInventory: () => (invClose ? invClose() : openInventory()),
    get inventoryOpen() {
      return !!invClose;
    },
    /** zużywa jedną sztukę trzymanego przedmiotu (poza trybem kreatywnym) */
    consumeHeld() {
      if (creative || !slots[sel]) return;
      slots[sel]![1]--;
      if (slots[sel]![1] <= 0) slots[sel] = null;
      renderBar();
    },
    held: () => {
      const s = slots[sel];
      return s ? item(s[0]) : undefined;
    },
    dispose() {
      invClose?.();
    },
  };
}
export type VoxelUi = ReturnType<typeof createVoxelUi>;
