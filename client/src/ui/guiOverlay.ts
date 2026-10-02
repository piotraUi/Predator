// GUI gry na ekranie gracza (2D i 3D) - ta sama warstwa rysuje też podgląd w edytorze GUI w Studio.
// Pozycje w procentach, a wielkość napisów rośnie razem z ekranem (wzorzec: 1280x720).
import type { GuiDef, GuiEl } from "../../../shared/gui.ts";
import { h } from "./dom.ts";

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** jeden element GUI jako HTML (gra i edytor) */
export function renderGuiEl(el: GuiEl, text?: string, editor = false): HTMLElement {
  const tag = el.type === "button" && !editor ? "button" : "div";
  const node = h(tag, { class: `gui-el gui-${el.type}` });
  const st = node.style;
  st.left = el.x + "%";
  st.top = el.y + "%";
  st.width = el.w + "%";
  st.height = el.h + "%";
  if (el.bg) st.background = hexA(el.bg, el.bgOpacity ?? 1);
  else if (el.type === "button") st.background = hexA("#3a86ff", el.bgOpacity ?? 1);
  if (el.radius) st.borderRadius = `calc(var(--gs, 1px) * ${el.radius})`;
  if (el.border) st.border = `calc(var(--gs, 1px) * 3) solid ${el.border}`;
  st.color = el.color ?? "#ffffff";
  st.fontSize = `calc(var(--gs, 1px) * ${el.fontSize ?? 24})`;
  if (el.bold) st.fontWeight = "800";
  st.justifyContent = el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center";
  st.textAlign = el.align ?? "center";
  if (el.type === "image" && el.image) node.append(h("img", { src: el.image, alt: el.name, draggable: false }));
  const t = text ?? el.text;
  if (t && el.type !== "image") node.append(h("span", null, t));
  return node;
}

/** skala GUI: 1 "piksel" wzorca 1280x720 na tym ekranie */
export function guiScale(w: number, h: number) {
  return Math.max(0.2, Math.min(w / 1280, h / 720));
}

/**
 * Warstwa GUI w grze. Serwer mówi, które GUI są otwarte i jakie napisy ustawiły skrypty;
 * kliknięcie przycisku idzie do serwera (akcja + onGuiClick).
 */
export class GuiOverlay {
  readonly el = h("div", { class: "gui-layer" });
  private open = new Set<string>();
  private text: Record<string, string> = {};
  private where = "";
  private ro: ResizeObserver;

  constructor(
    parent: HTMLElement,
    private guis: GuiDef[],
    private onClick: (gui: string, el: string) => void,
  ) {
    parent.append(this.el);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.resize();
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    this.el.style.setProperty("--gs", guiScale(r.width || innerWidth, r.height || innerHeight) + "px");
  }

  /** poziom 2D / miejsce 3D, w którym jest gracz (GUI z "where" tylko tam) */
  setWhere(where: string) {
    if (where === this.where) return;
    this.where = where;
    this.render();
  }

  setState(m: { open?: string[]; text?: Record<string, string> }) {
    this.open = new Set(m.open ?? []);
    this.text = m.text ?? {};
    this.render();
  }

  /** czy jest otwarte okno przyciemniające grę (np. menu) */
  get modal() {
    return this.visible().some((g) => g.modal);
  }

  private visible() {
    return this.guis.filter((g) => this.open.has(g.id) && (!g.where || g.where === this.where));
  }

  private render() {
    const list = this.visible();
    this.el.replaceChildren(
      ...list.map((g) => {
        const layer = h("div", { class: "gui-root" + (g.modal ? " gui-modal" : "") });
        for (const e of g.elements) {
          const node = renderGuiEl(e, this.text[g.id + "/" + e.id]);
          if (e.type === "button")
            node.addEventListener("click", (ev) => {
              ev.stopPropagation();
              this.onClick(g.id, e.id);
            });
          layer.append(node);
        }
        return layer;
      }),
    );
    this.el.classList.toggle("has-modal", list.some((g) => g.modal));
  }

  dispose() {
    this.ro.disconnect();
    this.el.remove();
  }
}
