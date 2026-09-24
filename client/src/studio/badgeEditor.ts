// Edytor odznak gry (w Ustawieniach gry) - wspólny dla Studia 3D i 2D.
import { MAX_BADGE_REWARD, type BadgeDef } from "../../../shared/types.ts";
import { h } from "../ui/dom.ts";

const ICONS = ["🏅", "👋", "⭐", "🏆", "💎", "🔥", "🎯", "🚀", "👑", "🍀", "🦖", "🐱", "🌈", "🎉", "💀", "⚡"];

export function badgeEditor(initial: BadgeDef[] | undefined) {
  const list: BadgeDef[] = structuredClone(initial ?? []);
  const box = h("div", { class: "badge-edit" });

  const render = () => {
    box.replaceChildren(
      ...list.map((b, i) => {
        const icon = h("select", { class: "badge-edit-icon" }, [...new Set([b.icon, ...ICONS])].map((e) => h("option", { value: e, selected: e === b.icon }, e)));
        icon.addEventListener("change", () => (b.icon = icon.value));
        const name = h("input", { value: b.name, maxLength: 40, placeholder: "Nazwa odznaki" });
        name.addEventListener("input", () => (b.name = name.value));
        const desc = h("input", { value: b.description, maxLength: 200, placeholder: "Za co? (opis)" });
        desc.addEventListener("input", () => (b.description = desc.value));
        const trig = h(
          "select",
          null,
          h("option", { value: "join", selected: b.trigger === "join" }, "Za wejście do gry"),
          h("option", { value: "script", selected: b.trigger === "script" }, "Ze skryptu (awardBadge)"),
        );
        trig.addEventListener("change", () => (b.trigger = trig.value as BadgeDef["trigger"]));
        const reward = h("input", { type: "number", min: "0", max: String(MAX_BADGE_REWARD), value: String(b.reward), title: "Nagroda w monetach" });
        reward.addEventListener("input", () => (b.reward = Math.max(0, Math.min(MAX_BADGE_REWARD, Math.round(Number(reward.value) || 0)))));
        return h(
          "div",
          { class: "badge-edit-row" },
          h("div", { class: "badge-edit-top" }, icon, name, h("button", { class: "btn small danger", title: "Usuń", onClick: () => (list.splice(i, 1), render()) }, "✕")),
          desc,
          h("div", { class: "badge-edit-top" }, trig, h("label", { class: "badge-edit-reward" }, "🪙", reward)),
          b.trigger === "script" ? h("code", { class: "muted small" }, `awardBadge(player, "${b.name || "Nazwa"}")`) : null,
        );
      }),
      h(
        "button",
        {
          class: "btn small",
          onClick: () => {
            list.push({ id: "b" + Math.random().toString(36).slice(2, 10), name: "Nowa odznaka", description: "", icon: "⭐", trigger: "script", reward: 5 });
            render();
          },
        },
        "+ Dodaj odznakę",
      ),
    );
  };
  render();
  return {
    el: h(
      "div",
      null,
      h("div", { class: "prop-group" }, "Odznaki (nagrody dla graczy)"),
      h("p", { class: "muted", style: "font-size:12px;margin:0 0 6px" }, `Gracz dostaje odznakę raz. Nagroda: 0–${MAX_BADGE_REWARD} monet.`),
      box,
    ),
    read: () => list.filter((b) => b.name.trim()),
  };
}
