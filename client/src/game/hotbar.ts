// Pasek narzędzi na dole ekranu (jak w Robloxie). Klawisze 1-9 albo dotknięcie wybiera narzędzie.
import { toolIcon } from "../../../shared/tools.ts";
import type { ToolDef } from "../../../shared/types.ts";
import { h } from "../ui/dom.ts";

export class Hotbar {
  readonly el: HTMLElement;
  private tools: ToolDef[] = [];
  private slots: HTMLElement[] = [];
  selected: string | null = null;

  constructor(
    container: HTMLElement,
    private onSelect: (toolId: string | null) => void,
  ) {
    this.el = h("div", { class: "hotbar hidden" });
    container.append(this.el);
  }

  set(tools: ToolDef[]) {
    this.tools = tools;
    if (this.selected && !tools.some((t) => t.id === this.selected)) this.select(null);
    this.render();
  }

  private render() {
    this.el.classList.toggle("hidden", this.tools.length === 0);
    this.slots = this.tools.map((t, i) =>
      h(
        "button",
        {
          class: "slot" + (t.id === this.selected ? " active" : ""),
          title: t.name,
          onPointerdown: (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle(i);
          },
        },
        h("span", { class: "slot-key" }, String(i + 1)),
        h("span", { class: "slot-icon" }, toolIcon(t)),
        h("span", { class: "slot-name" }, t.name),
        h("span", { class: "slot-cd" }),
      ),
    );
    this.el.replaceChildren(...this.slots);
  }

  /** Klawisz 1-9: zakłada narzędzie albo chowa, jeśli już trzymane */
  toggle(index: number) {
    const t = this.tools[index];
    if (!t) return;
    this.select(this.selected === t.id ? null : t.id);
  }

  select(id: string | null) {
    if (this.selected === id) return;
    this.selected = id;
    this.slots.forEach((s, i) => s.classList.toggle("active", this.tools[i]?.id === id));
    this.onSelect(id);
  }

  /** Pokazuje odliczanie czasu odnowienia na przycisku */
  cooldown(toolId: string, seconds: number) {
    const i = this.tools.findIndex((t) => t.id === toolId);
    const cd = this.slots[i]?.querySelector<HTMLElement>(".slot-cd");
    if (!cd || seconds <= 0) return;
    cd.style.transition = "none";
    cd.style.transform = "scaleY(1)";
    void cd.offsetHeight;
    cd.style.transition = `transform ${seconds}s linear`;
    cd.style.transform = "scaleY(0)";
  }

  indexOf(toolId: string) {
    return this.tools.findIndex((t) => t.id === toolId);
  }

  get current(): ToolDef | null {
    return this.tools.find((t) => t.id === this.selected) ?? null;
  }
}
