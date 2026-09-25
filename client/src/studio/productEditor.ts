// Edytor sklepu gry (w Ustawieniach gry) - wspólny dla Studia 3D i 2D.
import { CREATOR_SHARE, MAX_PRODUCT_PRICE, creatorCut, type ProductDef } from "../../../shared/types.ts";
import { h } from "../ui/dom.ts";

const ICONS = ["🛍️", "👑", "⭐", "💎", "🪙", "⚡", "🚀", "🗡️", "🛡️", "🎁", "🍕", "🐶", "🦄", "🔑", "❤️", "🏎️"];

export function productEditor(initial: ProductDef[] | undefined) {
  const list: ProductDef[] = structuredClone(initial ?? []);
  const box = h("div", { class: "badge-edit" });

  const render = () => {
    box.replaceChildren(
      ...list.map((p, i) => {
        const icon = h("select", { class: "badge-edit-icon" }, [...new Set([p.icon, ...ICONS])].map((e) => h("option", { value: e, selected: e === p.icon }, e)));
        icon.addEventListener("change", () => (p.icon = icon.value));
        const name = h("input", { value: p.name, maxLength: 40, placeholder: "Nazwa (np. VIP, Podwójna prędkość)" });
        name.addEventListener("input", () => ((p.name = name.value), (code.textContent = usage(p))));
        const desc = h("input", { value: p.description, maxLength: 200, placeholder: "Co daje? (opis)" });
        desc.addEventListener("input", () => (p.description = desc.value));
        const kind = h(
          "select",
          null,
          h("option", { value: "pass", selected: p.kind === "pass" }, "Raz, na zawsze (np. VIP)"),
          h("option", { value: "item", selected: p.kind === "item" }, "Wiele razy (np. 100 monet w grze)"),
        );
        kind.addEventListener("change", () => ((p.kind = kind.value as ProductDef["kind"]), (code.textContent = usage(p))));
        const cut = h("div", { class: "product-edit-cut" }, cutText(p.price));
        const price = h("input", { type: "number", min: "1", max: String(MAX_PRODUCT_PRICE), value: String(p.price), title: "Cena w monetach Predatora" });
        price.addEventListener("input", () => {
          p.price = Math.max(1, Math.min(MAX_PRODUCT_PRICE, Math.round(Number(price.value) || 1)));
          cut.textContent = cutText(p.price);
        });
        const code = h("code", { class: "muted small" }, usage(p));
        return h(
          "div",
          { class: "badge-edit-row" },
          h("div", { class: "badge-edit-top" }, icon, name, h("button", { class: "btn small danger", title: "Usuń", onClick: () => (list.splice(i, 1), render()) }, "✕")),
          desc,
          h("div", { class: "badge-edit-top" }, kind, h("label", { class: "badge-edit-reward" }, "🪙", price)),
          cut,
          code,
        );
      }),
      h(
        "button",
        {
          class: "btn small",
          onClick: () => {
            list.push({ id: "p" + Math.random().toString(36).slice(2, 10), name: "VIP", description: "", icon: "👑", price: 25, kind: "pass" });
            render();
          },
        },
        "+ Dodaj produkt",
      ),
    );
  };
  render();
  return {
    el: h(
      "div",
      null,
      h("div", { class: "prop-group" }, "Sklep gry (za monety Predatora)"),
      h(
        "p",
        { class: "muted", style: "font-size:12px;margin:0 0 6px" },
        `Gracze kupują w grze przyciskiem 🛒 albo gdy skrypt pokaże okienko. Dostajesz ${Math.round(CREATOR_SHARE * 100)}% ceny. Ty kupujesz za darmo (do testów).`,
      ),
      box,
    ),
    read: () => list.filter((p) => p.name.trim()),
  };
}

const cutText = (price: number) => `Dostaniesz ${creatorCut(price)} 🪙 z każdej sprzedaży`;
const usage = (p: ProductDef) =>
  p.kind === "pass"
    ? `promptPurchase(player, "${p.name || "Nazwa"}")  ·  ownsProduct(player, "${p.name || "Nazwa"}")`
    : `promptPurchase(player, "${p.name || "Nazwa"}")  ·  onPurchase(function(player, name) … end)`;
