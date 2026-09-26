// Gracze na serwerze (przycisk 👥 w grze): dodaj do znajomych, zablokuj, zgłoś.
// Zgłoszenie idzie przez pokój gry - administrator dostaje też ostatnie wiadomości z czatu.
import { REPORT_REASONS } from "../../../shared/types.ts";
import { safety, type BlockedUser } from "../safety.ts";
import { h, modal, toast } from "../ui/dom.ts";
import type { GameConnection } from "./connection.ts";

export interface GamePlayer {
  sid: string;
  username: string;
}

/** okno zgłoszenia gracza z gry (voice = zgłoszenie z czatu głosowego) */
export function openGameReport(conn: GameConnection, p: GamePlayer, voice = false) {
  if (document.pointerLockElement) document.exitPointerLock();
  const reason = h("select", null, h("option", { value: "" }, "— wybierz powód —"), REPORT_REASONS.map((r) => h("option", { value: r }, r)));
  const text = h("textarea", { rows: 3, maxLength: 300, placeholder: voice ? "Co mówił(a) na czacie głosowym?" : "Co się stało? (nieobowiązkowe)" });
  const block = h("input", { type: "checkbox", checked: true });
  const close = modal(
    `🚩 Zgłoś gracza: ${p.username}`,
    h(
      "div",
      { class: "form" },
      h(
        "p",
        { class: "muted", style: "margin:0;font-size:13px" },
        "Administrator zobaczy zgłoszenie razem z ostatnimi wiadomościami z czatu tej gry. Nikt inny nie dowie się, że to Ty.",
      ),
      h("label", null, "Powód", reason),
      h("label", null, "Opis", text),
      h("label", { class: "check" }, block, h("span", null, "Od razu zablokuj tę osobę")),
    ),
    [
      { label: "Anuluj", onClick: () => close() },
      {
        label: "Wyślij zgłoszenie",
        kind: "danger",
        onClick: () => {
          if (!reason.value) return toast("Wybierz powód", "error");
          conn.send("report", { sid: p.sid, reason: reason.value, text: text.value, voice });
          if (block.checked) conn.send("block", { sid: p.sid });
          close();
        },
      },
    ],
  );
}

export function playersPanel(conn: GameConnection, list: () => GamePlayer[]) {
  const button = h("button", { class: "hud-btn", title: "Gracze na serwerze" }, "👥");
  button.addEventListener("click", () => open());

  conn.onMessage("reported", (m: { ok?: boolean; error?: string; username?: string }) =>
    m.ok ? toast(`Dziękujemy! Zgłoszenie gracza ${m.username} trafiło do administratora.`, "good") : toast(m.error ?? "Nie udało się zgłosić", "error"),
  );
  conn.onMessage("blocked", (m: { blocked: BlockedUser[] }) => {
    safety.set({ blocked: m.blocked });
    toast("🚫 Zablokowano - nie zobaczysz wiadomości tej osoby i nie usłyszysz jej głosu", "good");
  });
  conn.onMessage("befriended", (m: { text: string; ok: boolean }) => toast(m.text, m.ok ? "good" : "error"));

  function open() {
    if (document.pointerLockElement) document.exitPointerLock();
    const body = h("div", { class: "players-list" });
    const render = () => {
      const players = list();
      body.replaceChildren(
        ...(players.length
          ? players.map((p) => {
              const blocked = safety.isBlockedName(p.username);
              return h(
                "div",
                { class: "players-row" },
                h("b", null, (blocked ? "🚫 " : "") + p.username),
                h(
                  "div",
                  { class: "players-actions" },
                  blocked ? "" : h("button", { class: "btn small", title: "Zaproś do znajomych", onClick: () => conn.send("befriend", { sid: p.sid }) }, "➕"),
                  blocked
                    ? h("span", { class: "muted small" }, "zablokowany")
                    : h("button", { class: "btn small", title: "Zablokuj", onClick: () => (conn.send("block", { sid: p.sid }), setTimeout(render, 400)) }, "🚫"),
                  h("button", { class: "btn small danger", title: "Zgłoś", onClick: () => (close(), openGameReport(conn, p)) }, "🚩"),
                ),
              );
            })
          : [h("p", { class: "muted" }, "Jesteś tu sam(a).")]),
      );
    };
    render();
    const close = modal("👥 Gracze na serwerze", h("div", null, h("p", { class: "muted", style: "margin:0 0 8px;font-size:13px" }, "➕ znajomy · 🚫 zablokuj · 🚩 zgłoś"), body));
  }

  return { button };
}
