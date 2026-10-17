// Okno "Zaproś znajomych" w menu gry - znajomy dostaje powiadomienie z przyciskiem Dołącz
// (a gdy nie ma go w Predatorze - wiadomość na czacie).
import { api } from "../api.ts";
import { portrait } from "../ui/headshot.ts";
import { h, modal, toast } from "../ui/dom.ts";

export function openInviteFriends(privateCode?: string) {
  if (document.pointerLockElement) document.exitPointerLock();
  const list = h("div", { class: "invite-list" }, h("div", { class: "muted" }, "Ładowanie…"));
  const close = modal("Zaproś znajomych", list);
  api
    .friends()
    .then((all) => {
      const friends = all.filter((f) => f.status === "accepted").sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
      if (!friends.length) return list.replaceChildren(h("p", { class: "muted" }, "Nie masz jeszcze znajomych. Dodaj ich na stronie głównej → Znajomi."));
      list.replaceChildren(
        ...friends.map((f) => {
          const btn = h("button", { class: "btn small primary" }, "Zaproś");
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            try {
              const r = await api.invite(f.id, privateCode);
              btn.textContent = r.online ? "✔ Wysłano" : "✔ Wiadomość";
              toast(r.online ? `Zaproszono ${f.username}` : `${f.username} nie ma teraz w Predatorze - dostanie wiadomość na czacie`, "good");
            } catch (e) {
              btn.disabled = false;
              toast((e as Error).message, "error");
            }
          });
          return h(
            "div",
            { class: "invite-row" },
            h("img", { class: "pv-head small", src: portrait(f.avatar), alt: "" }),
            h(
              "div",
              { class: "invite-name" },
              h("b", null, f.username),
              h("div", { class: "muted small" }, f.playing ? `gra w ${f.playing.worldName}` : f.online ? "🟢 online" : "offline"),
            ),
            btn,
          );
        }),
      );
    })
    .catch((e) => list.replaceChildren(h("div", { class: "form-error" }, (e as Error).message)));
  return close;
}
