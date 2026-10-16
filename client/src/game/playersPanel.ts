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

export function playersPanel(conn: GameConnection, list: () => GamePlayer[], myName = "") {
  const button = h("button", { class: "hud-btn", title: "Gracze na serwerze" }, "👥");
  button.addEventListener("click", () => open());
  // administracja gry (właściciel, współtwórcy, moderatorzy): serwer sam włącza ten tryb
  let admin = false;
  let tools: string[] = [];
  conn.onMessage("gadmin", (m: { on?: boolean; tools?: string[] }) => {
    if (m?.on) {
      admin = true;
      tools = m.tools ?? [];
      button.textContent = "👥🛡️";
      button.title = "Gracze i administracja gry";
    }
  });
  const gadmin = (msg: Record<string, unknown>) => conn.send("gadmin", msg);
  const askText = (title: string, label: string, def = ""): Promise<string | null> =>
    new Promise((resolve) => {
      const inp = h("input", { class: "input", value: def, maxLength: 120 }) as HTMLInputElement;
      let done = false;
      const fin = (v: string | null) => {
        if (done) return;
        done = true;
        close();
        resolve(v);
      };
      const close = modal(title, h("label", { class: "field" }, h("span", null, label), inp), [
        { label: "Anuluj", onClick: () => fin(null) },
        { label: "OK", kind: "primary", onClick: () => fin(inp.value) },
      ]);
      setTimeout(() => inp.focus(), 30);
    });
  /** menu narzędzi: wybór narzędzia dla gracza (albo wszystkich) */
  const pickTool = (title: string): Promise<string | null> =>
    new Promise((resolve) => {
      const sel = h("select", { class: "input" }, h("option", { value: "*" }, "⭐ Wszystkie narzędzia"), ...tools.map((t) => h("option", { value: t }, t))) as HTMLSelectElement;
      let done = false;
      const fin = (v: string | null) => {
        if (done) return;
        done = true;
        close();
        resolve(v);
      };
      const close = modal(title, tools.length ? sel : h("p", { class: "muted" }, "Ta gra nie ma żadnych narzędzi."), [
        { label: "Anuluj", onClick: () => fin(null) },
        ...(tools.length ? [{ label: "Wybierz", kind: "primary" as const, onClick: () => fin(sel.value) }] : []),
      ]);
    });
  async function adminDialog(p: GamePlayer, ban: boolean) {
    const reason = await askText(ban ? `⛔ Ban w tej grze: ${p.username}` : `👢 Wyrzuć: ${p.username}`, "Powód (zobaczy go gracz)");
    if (reason === null) return;
    if (!ban) return gadmin({ action: "kick", sid: p.sid, reason });
    const minutes = await askText("Na ile minut? (0 = na zawsze)", "Minuty", "60");
    if (minutes === null) return;
    gadmin({ action: "ban", sid: p.sid, reason, minutes: Number(minutes) || 0 });
  }
  function openBans() {
    const body = h("div", { class: "players-list" }, h("p", { class: "muted" }, "Wczytuję…"));
    const close = modal("⛔ Zbanowani w tej grze", body);
    conn.onMessage("gbans", (list: { username: string; until: number; reason: string; byName: string }[]) => {
      body.replaceChildren(
        ...(list.length
          ? list.map((b) =>
              h(
                "div",
                { class: "players-row" },
                h("div", null, h("b", null, b.username), h("div", { class: "muted small" }, `${b.reason || "-"} · ${b.byName} · ${b.until ? "do " + new Date(b.until).toLocaleString("pl-PL") : "na zawsze"}`)),
                h("button", { class: "btn small", onClick: () => (gadmin({ action: "unban", name: b.username }), close()) }, "Odbanuj"),
              ),
            )
          : [h("p", { class: "muted" }, "Nikt nie jest zbanowany.")]),
      );
    });
    gadmin({ action: "bans" });
  }

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
        ...(admin
          ? [
              h(
                "div",
                { class: "players-admin" },
                h("b", null, "🛡️ Administracja gry"),
                h(
                  "div",
                  { class: "players-actions" },
                  h("button", { class: "btn small", onClick: async () => { const t = await pickTool("🎁 Daj sobie narzędzie"); if (t) gadmin({ action: "give", sid: "me", tool: t }); } }, "🎁 Daj sobie narzędzie"),
                  h("button", { class: "btn small", onClick: async () => { const t = await askText("📣 Ogłoszenie dla wszystkich", "Tekst"); if (t) gadmin({ action: "announce", text: t }); } }, "📣 Ogłoszenie"),
                  h("button", { class: "btn small", onClick: openBans }, "⛔ Zbanowani"),
                  h("button", { class: "btn small danger", onClick: () => { close(); gadmin({ action: "chaos", on: true }); } }, "💥 Włącz chaos"),
                  h("button", { class: "btn small", onClick: () => { close(); gadmin({ action: "chaos", on: false }); } }, "🧹 Wyłącz chaos"),
                  h("button", { class: "btn small danger", onClick: () => { close(); gadmin({ action: "restart" }); } }, "🔄 Restart serwera"),
                ),
              ),
            ]
          : []),
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
                  admin ? h("button", { class: "btn small", title: "Daj narzędzie", onClick: async () => { const t = await pickTool(`🎁 Narzędzie dla: ${p.username}`); if (t) gadmin({ action: "give", sid: p.sid, tool: t }); } }, "🎁") : "",
                  admin ? h("button", { class: "btn small", title: "Zabierz narzędzia", onClick: () => gadmin({ action: "take", sid: p.sid, tool: "*" }) }, "🧹") : "",
                  admin ? h("button", { class: "btn small danger", title: "Wyrzuć z gry", onClick: () => (close(), void adminDialog(p, false)) }, "👢") : "",
                  admin ? h("button", { class: "btn small danger", title: "Zbanuj w tej grze", onClick: () => (close(), void adminDialog(p, true)) }, "⛔") : "",
                ),
              );
            })
          : [h("p", { class: "muted" }, "Jesteś tu sam(a).")]),
      );
    };
    render();
    const close = modal("👥 Gracze na serwerze", h("div", null, h("p", { class: "muted", style: "margin:0 0 8px;font-size:13px" }, "➕ znajomy · 🚫 zablokuj · 🚩 zgłoś"), body));
  }

  void myName;
  return { button };
}
