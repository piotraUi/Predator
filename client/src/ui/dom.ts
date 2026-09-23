// Mini-pomocnik do budowania HTML bez frameworka.

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === "class") el.className = String(v);
      else if (k === "style") el.setAttribute("style", String(v));
      // właściwości DOM (value, checked, maxLength...) ustawiamy bezpośrednio - np. textarea ignoruje atrybut value
      else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(text: string, kind: "info" | "error" | "good" = "info") {
  let box = document.getElementById("toasts");
  if (!box) {
    box = h("div", { id: "toasts" });
    document.body.append(box);
  }
  const t = h("div", { class: "toast " + kind }, text);
  box.append(t);
  setTimeout(() => t.classList.add("hide"), 3200);
  setTimeout(() => t.remove(), 3700);
}

/** Proste okno dialogowe. Zwraca funkcję zamykającą. */
export function modal(title: string, body: Node, actions: { label: string; kind?: string; onClick: () => void }[] = []) {
  const close = () => overlay.remove();
  const overlay = h(
    "div",
    { class: "modal-bg", onClick: (e: Event) => e.target === overlay && close() },
    h(
      "div",
      { class: "modal" },
      h("div", { class: "modal-head" }, h("h2", null, title), h("button", { class: "icon-btn", onClick: close }, "✕")),
      h("div", { class: "modal-body" }, body),
      actions.length
        ? h(
            "div",
            { class: "modal-actions" },
            actions.map((a) => h("button", { class: "btn " + (a.kind ?? ""), onClick: a.onClick }, a.label)),
          )
        : null,
    ),
  );
  document.body.append(overlay);
  return close;
}

export const isTouch = () => matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

export function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** Kolor z nazwy - do miniaturek gier */
export function hashColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 65% 50%)`;
}
