// Okienko "Zdobyto odznakę!" pokazywane w trakcie gry.
import { h } from "./dom.ts";

export interface BadgeMsg {
  name: string;
  icon: string;
  description: string;
  reward: number;
  coins?: number;
  test?: boolean;
}

const queue: BadgeMsg[] = [];
let showing = false;

export function showBadge(b: BadgeMsg) {
  queue.push(b);
  if (!showing) next();
}

function next() {
  const b = queue.shift();
  if (!b) {
    showing = false;
    return;
  }
  showing = true;
  const el = h(
    "div",
    { class: "badge-pop" },
    h("div", { class: "badge-pop-icon" }, b.icon || "🏅"),
    h(
      "div",
      { class: "badge-pop-text" },
      h("div", { class: "badge-pop-title" }, b.test ? "Odznaka (test)" : "Zdobyto odznakę!"),
      h("div", { class: "badge-pop-name" }, b.name),
      b.description ? h("div", { class: "badge-pop-desc" }, b.description) : null,
      b.reward > 0 ? h("div", { class: "badge-pop-reward" }, `+${b.reward} 🪙`) : null,
    ),
  );
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => {
      el.remove();
      next();
    }, 400);
  }, 4200);
}
