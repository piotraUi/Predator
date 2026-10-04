// Okienko z pytaniem od skryptu (prompt) - gry 2D i 3D. Odpowiedź trafia do onAnswer w skryptach.
import { h } from "../ui/dom.ts";

export interface PromptMsg {
  id: string;
  question: string;
  speak?: string;
  lang?: string;
}

/** okienko w grze; send = wysłanie odpowiedzi do serwera, speak = czytanie pytania na głos */
export function promptBox(wrap: HTMLElement, send: (id: string, text: string) => void, speak?: (text: string, lang?: string) => void) {
  const box = h("div", { class: "prompt-box hidden" });
  wrap.append(box);
  return (m: PromptMsg | null) => {
    if (!m) {
      box.classList.add("hidden");
      return;
    }
    const input = h("input", { class: "prompt-input", maxLength: 80, autocomplete: "off", placeholder: "Wpisz odpowiedź…" });
    const ok = () => {
      const text = input.value.trim();
      if (!text) return;
      send(m.id, text);
      box.classList.add("hidden");
      input.blur();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") ok();
      else if (e.key === "Escape") box.classList.add("hidden");
    });
    box.replaceChildren(
      h("div", { class: "prompt-q" }, m.question),
      h(
        "div",
        { class: "prompt-row" },
        m.speak && speak ? h("button", { class: "btn", title: "Posłuchaj jeszcze raz", onClick: () => speak(m.speak!, m.lang) }, "🔊") : "",
        input,
        h("button", { class: "btn primary", onClick: ok }, "OK"),
        h("button", { class: "btn", title: "Zamknij", onClick: () => box.classList.add("hidden") }, "✕"),
      ),
    );
    box.classList.remove("hidden");
    if (m.speak && speak) speak(m.speak, m.lang);
    setTimeout(() => input.focus(), 50);
  };
}
