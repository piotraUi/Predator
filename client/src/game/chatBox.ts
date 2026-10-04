// Okienko czatu w grze (2D i 3D). Przycisk 💬 otwiera i zamyka okienko; gdy jest otwarte,
// pole do pisania jest zawsze widoczne. Na telefonie czat startuje zamknięty, a nowe
// wiadomości pokazują licznik na przycisku.
import type { ChatMsg } from "../../../shared/types.ts";
import { h } from "../ui/dom.ts";

const isPhone = () => matchMedia("(pointer: coarse)").matches || innerWidth < 760;

export function chatBox(opts: {
  placeholder: string;
  /** wysłanie tekstu z pola */
  onSend: (text: string) => void;
  /** pisanie w polu (wyłącza sterowanie gry) */
  onTyping: (typing: boolean) => void;
}) {
  const log = h("div", { class: "chat-log" });
  const input = h("input", { class: "chat-input", placeholder: opts.placeholder, maxLength: 200, enterKeyHint: "send" }) as HTMLInputElement;
  const box = h("div", { class: "chat" }, log, input);
  const badge = h("span", { class: "chat-badge hidden" });
  const button = h("button", { class: "hud-btn chat-btn", title: "Czat (Enter)", onClick: () => toggle() }, "💬", badge);
  let unread = 0;

  const setOpen = (open: boolean) => {
    box.classList.toggle("open", open);
    button.classList.toggle("on", open);
    if (open) {
      unread = 0;
      badge.classList.add("hidden");
      log.scrollTop = log.scrollHeight;
    } else input.blur();
  };
  const isOpen = () => box.classList.contains("open");
  const toggle = () => setOpen(!isOpen());
  /** otwiera czat i ustawia kursor w polu (Enter na klawiaturze) */
  const focus = () => {
    setOpen(true);
    input.focus();
  };

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      const t = input.value.trim();
      if (t) opts.onSend(t);
      input.value = "";
      input.blur();
    } else if (e.key === "Escape") input.blur();
  });
  input.addEventListener("focus", () => opts.onTyping(true));
  input.addEventListener("blur", () => opts.onTyping(false));

  const add = (m: ChatMsg) => {
    log.append(m.system ? h("div", { class: "chat-line system" }, m.text) : h("div", { class: "chat-line" }, h("b", null, m.from + ": "), m.text));
    while (log.children.length > 60) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
    if (!isOpen() && !m.system) {
      unread++;
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.classList.remove("hidden");
    }
  };

  setOpen(!isPhone());
  return { box, button, input, add, focus, toggle, isOpen, typing: () => document.activeElement === input };
}
