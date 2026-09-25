// Sklep w grze (3D i 2D): przycisk 🛒 w górnym pasku, lista produktów i okienko zakupu,
// które może też otworzyć skrypt gry (promptPurchase). Monety pobiera serwer.
import type { ProductDef } from "../../../shared/types.ts";
import { session } from "../state.ts";
import { h, toast } from "../ui/dom.ts";
import type { GameConnection } from "./connection.ts";

export function gameShop(conn: GameConnection, opts: { offline?: boolean; onCoins?: (coins: number) => void }) {
  let products: ProductDef[] = [];
  const owned = new Set<string>();
  let overlay: HTMLElement | null = null;
  let busy = "";

  const button = h("button", { class: "hud-btn hidden", title: "Sklep gry", onClick: () => openShop() }, "🛒");

  const close = () => {
    overlay?.remove();
    overlay = null;
  };
  const show = (title: string, body: Node) => {
    close();
    if (document.pointerLockElement) document.exitPointerLock();
    overlay = h(
      "div",
      { class: "modal-bg shop-bg", onClick: (e: Event) => e.target === overlay && close() },
      h(
        "div",
        { class: "modal shop-modal" },
        h("div", { class: "modal-head" }, h("h2", null, title), h("button", { class: "icon-btn", onClick: close }, "✕")),
        h("div", { class: "modal-body" }, body),
      ),
    );
    // klawisze nie sterują postacią, gdy sklep jest otwarty
    overlay.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") close();
    });
    document.body.append(overlay);
    (overlay.querySelector<HTMLButtonElement>("button.primary:not([disabled])") ?? overlay.querySelector<HTMLButtonElement>(".icon-btn"))?.focus();
  };

  const coins = () => session.user?.coins ?? 0;
  const balance = () =>
    h("div", { class: "shop-balance" }, opts.offline ? "Test w Studio - zakupy są za darmo" : `Masz: 🪙 ${coins()}`);

  const buyButton = (p: ProductDef) => {
    if (p.kind === "pass" && owned.has(p.id)) return h("button", { class: "btn small", disabled: true }, "✔ Masz");
    const tooPoor = !opts.offline && coins() < p.price && !isOwnerFree();
    return h(
      "button",
      {
        class: "btn small primary",
        disabled: tooPoor || busy === p.id,
        title: tooPoor ? "Masz za mało monet" : "",
        onClick: () => buy(p),
      },
      busy === p.id ? "…" : `Kup za 🪙 ${p.price}`,
    );
  };
  // twórca kupuje we własnej grze za darmo (serwer to sprawdza) - tu tylko nie blokujemy przycisku
  let ownerFree = false;
  const isOwnerFree = () => ownerFree;

  const card = (p: ProductDef) =>
    h(
      "div",
      { class: "shop-item" },
      h("div", { class: "shop-icon" }, p.icon),
      h(
        "div",
        { class: "shop-text" },
        h("div", { class: "shop-name" }, p.name),
        p.description ? h("div", { class: "shop-desc" }, p.description) : null,
        h("div", { class: "shop-kind" }, p.kind === "pass" ? "Na zawsze" : "Można kupować wiele razy"),
      ),
      buyButton(p),
    );

  function openShop() {
    if (!products.length) return;
    show("🛒 Sklep gry", h("div", null, balance(), h("div", { class: "shop-list" }, products.map(card))));
  }

  function prompt(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    if (p.kind === "pass" && owned.has(p.id)) return toast(`Masz już „${p.name}”`);
    show(
      "Kupić?",
      h(
        "div",
        { class: "shop-prompt" },
        h("div", { class: "shop-icon big" }, p.icon),
        h("div", { class: "shop-name" }, p.name),
        p.description ? h("div", { class: "shop-desc" }, p.description) : null,
        balance(),
        h("div", { class: "shop-prompt-actions" }, h("button", { class: "btn", onClick: close }, "Anuluj"), buyButton(p)),
      ),
    );
  }

  function buy(p: ProductDef) {
    if (busy) return;
    busy = p.id;
    refresh();
    conn.send("buy", { id: p.id });
  }

  const refresh = () => {
    if (!overlay) return;
    const title = overlay.querySelector("h2")?.textContent ?? "";
    if (title.startsWith("🛒")) openShop();
    else if (busy) prompt(busy);
  };

  conn.onMessage("shop", (m: { products: ProductDef[]; owned: string[]; owner?: boolean }) => {
    products = m.products ?? [];
    for (const id of m.owned ?? []) owned.add(id);
    ownerFree = !!m.owner;
    button.classList.toggle("hidden", !products.length);
  });
  conn.onMessage("shopprompt", (m: { id: string }) => prompt(m.id));
  conn.onMessage("shopopen", () => openShop());
  conn.onMessage("bought", (m: { id: string; coins?: number; paid?: number; test?: boolean }) => {
    busy = "";
    const p = products.find((x) => x.id === m.id);
    if (p?.kind === "pass") owned.add(p.id);
    if (typeof m.coins === "number") {
      if (session.user) session.set({ ...session.user, coins: m.coins });
      opts.onCoins?.(m.coins);
    }
    close();
    if (p) toast(`${p.icon} Kupiono „${p.name}”${m.test ? " (test - za darmo)" : m.paid ? ` za ${m.paid} 🪙` : ""}`, "good");
  });
  conn.onMessage("buyfail", (m: { id: string; error: string }) => {
    busy = "";
    refresh();
    toast(m.error || "Nie udało się kupić", "error");
  });

  return { button, dispose: close };
}

