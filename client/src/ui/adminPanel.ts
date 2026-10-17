// Panel admina (tylko dla kont z listy adminów - serwer i tak sprawdza każde żądanie).
import { CATALOG } from "../../../shared/catalog.ts";
import { adminApi, getServerUrl, getToken, type AdminReport, type AdminUser, type AdminWorld } from "../api.ts";
import { ask, h, modal, toast } from "./dom.ts";

const fmt = new Intl.NumberFormat("pl-PL");

async function run<T>(p: Promise<T>, ok?: string): Promise<T | null> {
  try {
    const r = await p;
    if (ok) toast(ok, "good");
    return r;
  } catch (e) {
    toast((e as Error).message, "error");
    return null;
  }
}

function inputModal(title: string, label: string, opts: { type?: string; value?: string; ok?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = h("input", { class: "input", type: opts.type ?? "text", value: opts.value ?? "" });
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    inp.addEventListener("keydown", (e) => e.key === "Enter" && finish(inp.value));
    const close = modal(title, h("label", { class: "field" }, h("span", null, label), inp), [
      { label: "Anuluj", onClick: () => finish(null) },
      { label: opts.ok ?? "OK", kind: "primary", onClick: () => finish(inp.value) },
    ]);
    setTimeout(() => inp.focus(), 30);
  });
}

export function adminPanel(el: HTMLElement, who: { admin: boolean; superAdmin: boolean } = { admin: true, superAdmin: false }) {
  const all = ["Start", "Zgłoszenia", "Gracze", "Zbanowani", "Gry", "Ogłoszenie", "Moderacja", "Moderacja AI", "AI", "Aplikacje", "Serwer", "Historia"] as const;
  // moderator widzi tylko to, co mu wolno: zgłoszenia, gracze (ban, wyciszenie, wyrzucenie), zbanowani
  const tabs = (who.admin ? all.filter((t) => t !== "Moderacja" || who.superAdmin) : (["Zgłoszenia", "Gracze", "Zbanowani"] as const)) as readonly (typeof all)[number][];
  let tab: (typeof all)[number] = tabs[0];
  const tabBar = h("div", { class: "shop-tabs adm-tabs" });
  const body = h("div", { class: "adm-body" });
  el.append(tabBar, body);

  const renderTabs = () =>
    tabBar.replaceChildren(
      ...tabs.map((t) => h("button", { class: "shop-tab" + (t === tab ? " active" : ""), onClick: () => ((tab = t), show()) }, t)),
    );

  const show = () => {
    renderTabs();
    body.replaceChildren();
    if (tab === "Start") statsTab(body);
    else if (tab === "Zgłoszenia") reportsTab(body);
    else if (tab === "Historia") logTab(body);
    else if (tab === "Aplikacje") appsTab(body);
    else if (tab === "Serwer") serverTab(body);
    else if (tab === "Moderacja") rolesTab(body);
    else if (tab === "Zbanowani") bansTab(body, who.admin);
    else if (tab === "Moderacja AI") moderationTab(body);
    else if (tab === "AI") aiTab(body);
    else if (tab === "Gracze") usersTab(body, who.admin);
    else if (tab === "Gry") worldsTab(body);
    else announceTab(body);
  };
  show();
}

async function statsTab(el: HTMLElement) {
  const s = await run(adminApi.stats());
  if (!s) return;
  const card = (label: string, v: number, ic: string) =>
    h("div", { class: "adm-stat" }, h("div", { class: "adm-stat-ic" }, ic), h("b", null, fmt.format(v)), h("span", { class: "muted" }, label));
  el.append(
    h(
      "div",
      { class: "adm-stats" },
      card("Kont", s.users, "👤"),
      card("Gier", s.worlds, "🎮"),
      card("Online", s.online, "🟢"),
      card("Gra teraz", s.playing, "🕹️"),
      card("Serwerów gier", s.rooms, "🖥️"),
      card("Przedmiotów w sklepie", s.items, "🛍️"),
      card("Grup", s.groups, "👥"),
      card("Otwarte zgłoszenia", s.reports, "⚑"),
    ),
  );
}

function usersTab(el: HTMLElement, fullAdmin = true) {
  const q = h("input", { class: "input", type: "search", placeholder: "Szukaj gracza…" });
  const list = h("div", { class: "adm-list" });
  let timer = 0;
  const load = async () => {
    const r = await run(adminApi.users(q.value.trim()));
    if (r) list.replaceChildren(...(r.length ? r.map(row) : [h("div", { class: "muted" }, "Brak graczy")]));
  };
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(load, 250);
  });

  const row = (u: AdminUser): HTMLElement => {
    const replace = (nu: AdminUser | null) => nu && r.replaceWith(row(nu));
    const r = h(
      "div",
      { class: "adm-row" + (u.banned ? " banned" : "") },
      h(
        "div",
        { class: "adm-row-main" },
        h("b", null, u.username),
        u.role === "moderator" ? h("span", { class: "adm-tag warn" }, "MODERATOR") : null,
        u.admin ? h("span", { class: "adm-tag" }, u.role === "super" ? "ADMIN GŁÓWNY" : "ADMIN") : null,
        u.banned ? h("span", { class: "adm-tag bad" }, "ZABLOKOWANY") : null,
        u.online ? h("span", { class: "adm-tag good" }, "online") : null,
        u.mutedUntil ? h("span", { class: "adm-tag warn", title: "do " + new Date(u.mutedUntil).toLocaleString("pl-PL") }, "WYCISZONY") : null,
        h("div", { class: "muted small" }, `🪙 ${fmt.format(u.coins)} · 🎒 ${u.items} · od ${new Date(u.createdAt).toLocaleDateString("pl-PL")}`),
      ),
      h(
        "div",
        { class: "adm-actions" },
        !fullAdmin ? null : h(
          "button",
          {
            class: "btn small",
            onClick: async () => {
              const v = await inputModal(`Monety: ${u.username}`, "Ile dodać (ujemna liczba = zabierz)", { type: "number", value: "1000", ok: "Dodaj" });
              if (v !== null && v.trim()) replace(await run(adminApi.coins(u.id, Number(v)), "Zmieniono monety"));
            },
          },
          "🪙 Monety",
        ),
        !fullAdmin ? null : h(
          "button",
          {
            class: "btn small",
            onClick: async () => {
              const pick = h("select", { class: "input" }, h("option", { value: "all" }, "⭐ Wszystkie przedmioty"), ...CATALOG.map((i) => h("option", { value: i.id }, `${i.icon} ${i.name}`)));
              const close = modal(`Daj przedmiot: ${u.username}`, pick, [
                { label: "Anuluj", onClick: () => close() },
                { label: "Daj", kind: "primary", onClick: async () => (close(), replace(await run(adminApi.give(u.id, pick.value), "Dano przedmiot"))) },
              ]);
            },
          },
          "🎁 Daj",
        ),
        !fullAdmin ? null : h(
          "button",
          {
            class: "btn small",
            onClick: async () => {
              const v = await inputModal(`Nowe hasło: ${u.username}`, "Nowe hasło (min. 6 znaków)", { ok: "Zmień" });
              if (v) await run(adminApi.password(u.id, v), "Zmieniono hasło");
            },
          },
          "🔑 Hasło",
        ),
        u.admin || u.role === "moderator"
          ? null
          : h(
              "button",
              {
                class: "btn small",
                onClick: async () => {
                  if (u.mutedUntil) return replace(await run(adminApi.mute(u.id, 0), "Zdjęto wyciszenie"));
                  const m = await pickMute(u.username);
                  if (m) replace(await run(adminApi.mute(u.id, m), "Wyciszono"));
                },
              },
              u.mutedUntil ? "🔊 Odcisz" : "🔇 Wycisz",
            ),
        u.admin || u.role === "moderator"
          ? null
          : h(
              "button",
              {
                class: "btn small " + (u.banned ? "" : "danger"),
                onClick: async () => {
                  if (u.banned) return replace(await run(adminApi.ban(u.id, false), "Odblokowano"));
                  const b = await pickBan(u.username);
                  if (b) replace(await run(adminApi.ban(u.id, true, b.reason, b.days), "Zablokowano"));
                },
              },
              u.banned ? "✅ Odblokuj" : "⛔ Zablokuj",
            ),
        u.admin || u.role === "moderator"
          ? null
          : h("button", { class: "btn small", onClick: async () => (await run(adminApi.kick(u.id), "Wyrzucono z gry")) }, "👢 Wyrzuć z gry"),
      ),
    );
    return r;
  };

  el.append(q, list);
  load();
}

function worldsTab(el: HTMLElement) {
  const q = h("input", { class: "input", type: "search", placeholder: "Szukaj gry…" });
  const list = h("div", { class: "adm-list" });
  let timer = 0;
  const load = async () => {
    const r = await run(adminApi.worlds(q.value.trim()));
    if (r) list.replaceChildren(...(r.length ? r.map(row) : [h("div", { class: "muted" }, "Brak gier")]));
  };
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(load, 250);
  });
  const row = (w: AdminWorld): HTMLElement =>
    h(
      "div",
      { class: "adm-row" },
      h(
        "div",
        { class: "adm-row-main" },
        h("b", null, w.name),
        w.published ? h("span", { class: "adm-tag good" }, "publiczna") : h("span", { class: "adm-tag" }, "prywatna"),
        h("div", { class: "muted small" }, `Twórca: ${w.ownerName} · 👣 ${fmt.format(w.visits)} wizyt · 🕹️ ${w.playing}`),
      ),
      h(
        "div",
        { class: "adm-actions" },
        h(
          "button",
          { class: "btn small", onClick: async () => (await run(adminApi.publish(w.id, !w.published), w.published ? "Ukryto grę" : "Opublikowano")) !== null && load() },
          w.published ? "🙈 Ukryj" : "🌍 Opublikuj",
        ),
        h(
          "button",
          {
            class: "btn small",
            onClick: async () => {
              const v = await inputModal(`Nowy właściciel: ${w.name}`, "Nazwa konta", { ok: "Przekaż" });
              if (v?.trim() && (await run(adminApi.owner(w.id, v.trim()), "Przekazano grę")) !== null) load();
            },
          },
          "👤 Właściciel",
        ),
        h(
          "button",
          {
            class: "btn small danger",
            onClick: async () => {
              if (!(await ask(`Usunąć grę „${w.name}” na zawsze?`, "Usuń", "Anuluj", true))) return;
              if ((await run(adminApi.deleteWorld(w.id), "Usunięto grę")) !== null) load();
            },
          },
          "🗑️ Usuń",
        ),
      ),
    );
  el.append(q, list);
  load();
}

function announceTab(el: HTMLElement) {
  const text = h("textarea", { class: "input", rows: 3, maxLength: 300, placeholder: "Np. Dziś o 18:00 wydarzenie w grze Ludzik 4!" });
  el.append(
    h("p", { class: "muted" }, "Ogłoszenie trafi do powiadomień wszystkich graczy i pojawi się na czacie we wszystkich trwających grach."),
    text,
    h(
      "button",
      {
        class: "btn primary",
        style: "margin-top:10px",
        onClick: async () => {
          if (!text.value.trim()) return;
          const r = await run(adminApi.announce(text.value.trim()));
          if (r) {
            toast(`Wysłano ogłoszenie (gier na żywo: ${r.rooms})`, "good");
            text.value = "";
          }
        },
      },
      "📢 Wyślij ogłoszenie",
    ),
  );
}

const MUTE_TIMES: [number, string][] = [
  [15, "15 minut"],
  [60, "1 godzina"],
  [60 * 24, "1 dzień"],
  [60 * 24 * 7, "7 dni"],
  [60 * 24 * 30, "30 dni"],
];

/** ban: powód (zobaczy go zbanowany) i czas */
function pickBan(name: string): Promise<{ reason: string; days: number } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { reason: string; days: number } | null) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    const reason = h("textarea", { class: "input", rows: 3, maxLength: 300, placeholder: "Powód bana (zobaczy go gracz)…" }) as HTMLTextAreaElement;
    const days = h(
      "select",
      { class: "input" },
      ...([[1, "1 dzień"], [3, "3 dni"], [7, "7 dni"], [30, "30 dni"], [0, "Na zawsze"]] as [number, string][]).map(([v, l]) => h("option", { value: String(v) }, l)),
    ) as HTMLSelectElement;
    const close = modal(
      `Zablokuj: ${name}`,
      h("div", { class: "form" }, h("label", { class: "field" }, h("span", null, "Powód"), reason), h("label", { class: "field" }, h("span", null, "Na jak długo"), days), h("p", { class: "muted small" }, "Na ekranie bana gracz zobaczy powód i Twój nick jako podpis. Zostanie wylogowany i wyrzucony z gier.")),
      [
        { label: "Anuluj", onClick: () => finish(null) },
        {
          label: "Zablokuj",
          kind: "primary",
          onClick: () => (reason.value.trim().length < 3 ? toast("Wpisz powód (min. 3 znaki)", "error") : finish({ reason: reason.value.trim(), days: Number(days.value) })),
        },
      ],
    );
  });
}

/** zakładka Zbanowani: kto ma bana, za co, od kogo i do kiedy */
async function bansTab(el: HTMLElement, canUnban: boolean) {
  const list = h("div", { class: "adm-list" }, h("div", { class: "muted" }, "Wczytuję…"));
  el.append(list);
  const load = async () => {
    const r = await run(adminApi.bans());
    if (!r) return;
    list.replaceChildren(
      ...(r.length
        ? r.map((u) =>
            h(
              "div",
              { class: "adm-row banned" },
              h(
                "div",
                { class: "adm-row-main" },
                h("b", null, u.username),
                h("span", { class: "adm-tag bad" }, u.ban?.until ? "do " + new Date(u.ban.until).toLocaleString("pl-PL") : "NA ZAWSZE"),
                h("div", { class: "muted small" }, `Powód: ${u.ban?.reason || "-"} · zbanował: ${u.ban?.by || "-"} · ${u.ban?.at ? new Date(u.ban.at).toLocaleString("pl-PL") : ""}`),
              ),
              canUnban || true ? h("div", { class: "adm-actions" }, h("button", { class: "btn small", onClick: async () => ((await run(adminApi.ban(u.id, false), "Odblokowano")) && load()) }, "✅ Odblokuj")) : null,
            ),
          )
        : [h("div", { class: "muted" }, "Nikt nie jest zbanowany.")]),
    );
  };
  load();
}

/** zakładka Moderacja (tylko Predator i Piotrek53_3): nadawanie ról moderatora i admina */
function rolesTab(el: HTMLElement) {
  const q = h("input", { class: "input", type: "search", placeholder: "Szukaj gracza, żeby nadać rolę…" });
  const list = h("div", { class: "adm-list" });
  let timer = 0;
  const load = async () => {
    const term = q.value.trim();
    const r = term ? await run(adminApi.users(term)) : await run(adminApi.roles());
    if (r) list.replaceChildren(...(r.length ? r.map(row) : [h("div", { class: "muted" }, term ? "Brak graczy" : "Nikt jeszcze nie ma roli - wyszukaj gracza powyżej.")]));
  };
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(load, 250);
  });
  const row = (u: AdminUser): HTMLElement => {
    const set = async (role: "" | "moderator" | "admin") => {
      const nu = await run(adminApi.setRole(u.id, role), role ? "Nadano rolę" : "Zdjęto rolę");
      if (nu) r.replaceWith(row(nu));
    };
    const r = h(
      "div",
      { class: "adm-row" },
      h(
        "div",
        { class: "adm-row-main" },
        h("b", null, u.username),
        u.role === "super" ? h("span", { class: "adm-tag" }, "ADMIN GŁÓWNY") : u.role === "admin" ? h("span", { class: "adm-tag" }, "ADMIN") : u.role === "moderator" ? h("span", { class: "adm-tag warn" }, "MODERATOR") : h("span", { class: "muted small" }, "gracz"),
      ),
      u.role === "super"
        ? null
        : h(
            "div",
            { class: "adm-actions" },
            u.role === "moderator" ? null : h("button", { class: "btn small", onClick: () => set("moderator") }, "🛡️ Moderator"),
            u.role === "admin" ? null : h("button", { class: "btn small", onClick: () => set("admin") }, "👑 Admin"),
            u.role ? h("button", { class: "btn small danger", onClick: () => set("") }, "Zdejmij rolę") : null,
          ),
    );
    return r;
  };
  el.append(h("p", { class: "muted small" }, "Moderator: zgłoszenia, bany, wyciszenia i wyrzucanie z gier. Admin: cały panel. Role nadają tylko konta Predator i Piotrek53_3."), q, list);
  load();
}

/** wybór czasu wyciszenia (minuty albo null) */
function pickMute(name: string): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    const close = modal(
      `Wycisz: ${name}`,
      h(
        "div",
        { class: "adm-mute" },
        h("p", { class: "muted", style: "margin:0 0 8px" }, "Gracz nie będzie mógł pisać na czacie w grach, w wiadomościach ani w grupach."),
        MUTE_TIMES.map(([m, label]) => h("button", { class: "btn", onClick: () => finish(m) }, "🔇 " + label)),
      ),
      [{ label: "Anuluj", onClick: () => finish(null) }],
    );
  });
}

const KIND_LABEL = { user: "👤 Gracz", world: "🎮 Gra", group: "👥 Grupa" } as const;

function reportsTab(el: HTMLElement) {
  let closed = false;
  const list = h("div", { class: "adm-list" });
  const toggle = h("div", { class: "pv-chips" });
  const load = async () => {
    toggle.replaceChildren(
      h("button", { class: "pv-chip" + (!closed ? " active" : ""), onClick: () => ((closed = false), load()) }, "Otwarte"),
      h("button", { class: "pv-chip" + (closed ? " active" : ""), onClick: () => ((closed = true), load()) }, "Zamknięte"),
    );
    const r = await run(adminApi.reports(closed));
    if (r) list.replaceChildren(...(r.length ? r.map(row) : [h("div", { class: "pv-empty" }, "✅", closed ? "Brak zamkniętych zgłoszeń" : "Brak zgłoszeń - jest spokojnie!")]));
  };
  const act = async (p: Promise<unknown>, ok: string) => {
    if ((await run(p, ok)) !== null) load();
  };
  const row = (r: AdminReport): HTMLElement => {
    const acts: Node[] = [];
    if (r.status === "open") {
      if (r.kind === "user") {
        acts.push(
          h(
            "button",
            {
              class: "btn small",
              onClick: async () => {
                const m = await pickMute(r.targetName);
                if (m) act(adminApi.mute(r.targetId, m), "Wyciszono");
              },
            },
            "🔇 Wycisz",
          ),
          h(
            "button",
            {
              class: "btn small danger",
              onClick: async () =>
                (await ask(`Zablokować konto ${r.targetName}?`, "Zablokuj", "Anuluj", true)) && act(adminApi.ban(r.targetId, true), "Zablokowano"),
            },
            "⛔ Zablokuj",
          ),
        );
      } else if (r.kind === "world") {
        acts.push(h("button", { class: "btn small danger", onClick: () => act(adminApi.publish(r.targetId, false), "Ukryto grę") }, "🙈 Ukryj grę"));
      } else {
        acts.push(
          h(
            "button",
            {
              class: "btn small danger",
              onClick: async () => (await ask(`Usunąć grupę ${r.targetName}?`, "Usuń", "Anuluj", true)) && act(adminApi.deleteGroup(r.targetId), "Usunięto grupę"),
            },
            "🗑️ Usuń grupę",
          ),
        );
      }
      acts.push(h("button", { class: "btn small", onClick: () => act(adminApi.closeReport(r.id), "Zamknięto zgłoszenie") }, "✓ Bez kary"));
    }
    return h(
      "div",
      { class: "adm-row" },
      h(
        "div",
        { class: "adm-row-main" },
        h("span", { class: "adm-tag" }, KIND_LABEL[r.kind]),
        " ",
        h("b", null, r.targetName),
        h("span", { class: "adm-tag bad" }, r.reason),
        r.text ? h("div", { class: "adm-report-text" }, "„" + r.text + "”") : null,
        h("div", { class: "muted small" }, `Zgłosił: ${r.reporterName} · ${new Date(r.at).toLocaleString("pl-PL")}`),
      ),
      h("div", { class: "adm-actions" }, acts),
    );
  };
  el.append(toggle, list);
  load();
}

/** Gemini (Google Cloud): plik klucza JSON, model, asystent w Studio */
async function aiTab(el: HTMLElement) {
  const s = await run(adminApi.ai());
  if (!s) return;
  const redraw = () => (el.replaceChildren(), aiTab(el));
  // bez filtra typu: Android nie zna typu .json i wyszarza takie pliki w wyborze plików
  const fileIn = h("input", { type: "file", class: "hidden" });
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files?.[0];
    if (!f) return;
    fileIn.value = "";
    if (f.size > 32_000) return toast("To za duży plik - klucz konta usługi ma ok. 2-3 KB", "error");
    if ((await run(adminApi.uploadAiKey(await f.text()), "Klucz Gemini zapisany ✔")) !== null) redraw();
  });
  // telefon: zawartość pliku można też wkleić (otwórz plik w notatkach / przeglądarce, Zaznacz wszystko, Kopiuj)
  const pasteIn = h("textarea", { rows: 3, placeholder: '…albo wklej tu całą zawartość pliku JSON (zaczyna się od { "type": "service_account" …)', autocomplete: "off", spellcheck: false });
  const pasteBtn = h("button", { class: "btn small", onClick: async () => {
    const t = pasteIn.value.trim();
    if (!t) return toast("Wklej zawartość pliku JSON", "error");
    if ((await run(adminApi.uploadAiKey(t), "Klucz Gemini zapisany ✔")) !== null) redraw();
  } }, "📋 Zapisz wklejony klucz");
  const model = h("input", { value: s.model, placeholder: "gemini-3.8-flash" });
  const fastModel = h("input", { value: s.fastModel, placeholder: "gemini-3.5-flash-lite" });
  const loc = h("input", { value: s.location, placeholder: "global" });
  const limit = h("input", { type: "number", min: "0", value: String(s.dailyLimit) });
  const m = s.media;
  const imgModel = h("input", { value: m.imageModel, placeholder: m.defaults.image });
  const vidModel = h("input", { value: m.videoModel, placeholder: m.defaults.video });
  const imgLoc = h("input", { value: m.imageLocation, placeholder: "global" });
  const vidLoc = h("input", { value: m.videoLocation, placeholder: "us-central1" });
  const numIn = (v: number) => h("input", { type: "number", min: "0", value: String(v) });
  const imgCoins = numIn(m.imageCoins);
  const vidCoins = numIn(m.videoCoins);
  const imgDaily = numIn(m.imageDaily);
  const vidDaily = numIn(m.videoDaily);
  const testOut = h("div", { class: "muted small" });
  const lUrl = h("input", { value: s.local.url, placeholder: "http://127.0.0.1:8080/v1" });
  const lModel = h("input", { value: s.local.model, placeholder: "predator" });
  const lKey = h("input", { type: "password", placeholder: s.local.hasKey ? "(klucz zapisany - wpisz nowy, żeby zmienić)" : "klucz API (opcjonalnie)", autocomplete: "off" });
  const lOut = h("div", { class: "muted small" });
  el.append(
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "✨ Gemini (Google Cloud)"),
      h("p", { class: "muted small" }, "Gemini napędza asystenta AI w Studio i (zamiast Groq) moderację czatu, gier, obrazków i dźwięków. Serwer łączy się z Google plikiem klucza konta usługi (JSON). Plik zostaje tylko na serwerze."),
      s.ready
        ? h("p", null, "✅ Klucz wgrany", h("br"), h("span", { class: "muted small" }, `Konto: ${s.email} · projekt: ${s.project}`))
        : h("p", null, "❌ Brak klucza - wgraj plik JSON"),
      s.fromEnv
        ? h("p", { class: "muted small" }, "Klucz jest ustawiony w zmiennej GOOGLE_APPLICATION_CREDENTIALS na serwerze.")
        : h(
            "div",
            { class: "row wrap" },
            fileIn,
            h("button", { class: "btn primary small", onClick: () => fileIn.click() }, s.ready ? "📄 Wgraj nowy plik JSON" : "📄 Wgraj plik klucza JSON"),
            h("div", { class: "field", style: "width:100%" }, pasteIn, pasteBtn),
            s.ready
              ? h(
                  "button",
                  {
                    class: "btn small danger",
                    onClick: async () => (await ask("Usunąć klucz Gemini z serwera?", "Usuń", "Anuluj", true)) && (await run(adminApi.deleteAiKey(), "Usunięto klucz")) && redraw(),
                  },
                  "Usuń klucz",
                )
              : "",
          ),
      h(
        "details",
        { class: "adm-help" },
        h("summary", null, "❓ Jak zrobić plik klucza JSON"),
        h(
          "ol",
          { class: "small" },
          h("li", null, "Wejdź na console.cloud.google.com i wybierz projekt (ten sam co maszyna wirtualna może być)."),
          h("li", null, "Menu → „APIs & Services” → „Enable APIs” → wyszukaj „Vertex AI API” → Enable."),
          h("li", null, "Menu → „IAM & Admin” → „Service Accounts” → „Create service account”. Nazwa np. predator-ai."),
          h("li", null, "Rola: „Vertex AI User” → Continue → Done."),
          h("li", null, "Kliknij to konto → zakładka „Keys” → „Add key” → „Create new key” → JSON → Create. Pobierze się plik .json."),
          h("li", null, "Tutaj kliknij „Wgraj plik klucza JSON” i wybierz ten plik. Nie wysyłaj go nikomu i nie wrzucaj na GitHuba."),
        ),
      ),
    ),
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "⚙️ Model"),
      h("label", { class: "field" }, h("span", null, "Model główny: asystent, gry, obrazki, dźwięki (np. gemini-3.8-flash)"), model),
      h("label", { class: "field" }, h("span", null, "Szybki model: czat i nicki (np. gemini-3.5-flash-lite)"), fastModel),
      h("label", { class: "field" }, h("span", null, "Region (global działa dla najnowszych modeli)"), loc),
      h(
        "div",
        { class: "row wrap" },
        h("button", { class: "btn small primary", onClick: async () => (await run(adminApi.setAi({ model: model.value, fastModel: fastModel.value, location: loc.value }), "Zapisano")) && redraw() }, "Zapisz"),
        h(
          "button",
          {
            class: "btn small",
            disabled: !s.ready,
            onClick: async () => {
              testOut.textContent = "⏳ Pytam oba modele…";
              const main = await run(adminApi.testAi());
              const fast = await run(adminApi.testAi(true));
              const line = (name: string, r: typeof main) => (r ? `✅ ${name} działa (${(r.ms / 1000).toFixed(1)} s): „${r.text}”` : `❌ ${name} nie działa - zobacz komunikat`);
              testOut.replaceChildren(line("Główny", main), h("br"), line("Szybki", fast));
            },
          },
          "🧪 Sprawdź połączenie",
        ),
      ),
      testOut,
    ),
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "🎨 Obrazy i filmiki AI"),
      h("p", { class: "muted small" }, "Asystent w Studio może rysować obrazy (Nano Banana) i robić filmiki (Veo 3.1) przez Vertex AI - tym samym kluczem. Kosztuje to monety graczy (admini za darmo); nieudane generowanie zwraca monety. Veo działa tylko w wybranych regionach (np. us-central1)."),
      h("p", null, m.enabled ? "✅ Włączone" : "⏸️ Wyłączone", s.ready ? "" : " (potrzebny klucz Gemini)"),
      h("p", { class: "muted small" }, `Dzisiaj: ${m.imagesToday} obrazów, ${m.videosToday} filmików.`),
      h("label", { class: "field" }, h("span", null, "Model obrazów (Nano Banana, np. " + m.defaults.image + ")"), imgModel),
      h("label", { class: "field" }, h("span", null, "Region obrazów (global)"), imgLoc),
      h("label", { class: "field" }, h("span", null, "Model filmów (Veo 3.1, np. " + m.defaults.video + ")"), vidModel),
      h("label", { class: "field" }, h("span", null, "Region filmów (us-central1)"), vidLoc),
      h("label", { class: "field" }, h("span", null, "Cena obrazu w monetach"), imgCoins),
      h("label", { class: "field" }, h("span", null, "Cena filmu w monetach"), vidCoins),
      h("label", { class: "field" }, h("span", null, "Obrazów na gracza dziennie"), imgDaily),
      h("label", { class: "field" }, h("span", null, "Filmów na gracza dziennie"), vidDaily),
      h(
        "div",
        { class: "row wrap" },
        h(
          "button",
          {
            class: "btn small primary",
            onClick: async () =>
              (await run(
                adminApi.setAi({ imageModel: imgModel.value, videoModel: vidModel.value, imageLocation: imgLoc.value, videoLocation: vidLoc.value, imageCoins: Number(imgCoins.value) || 0, videoCoins: Number(vidCoins.value) || 0, imageDaily: Number(imgDaily.value) || 0, videoDaily: Number(vidDaily.value) || 0 }),
                "Zapisano",
              )) && redraw(),
          },
          "Zapisz",
        ),
        h("button", { class: "btn small", onClick: async () => (await run(adminApi.setAi({ media: !m.enabled }))) && redraw() }, m.enabled ? "⏸️ Wyłącz obrazy i filmy" : "▶️ Włącz obrazy i filmy"),
      ),
    ),
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "🧠 Własny model asystenta (zamiast Gemini)"),
      h("p", { class: "muted small" }, "Model wytrenowany przez Ciebie (ai-model/README.md) uruchomiony jako serwer zgodny z OpenAI (llama.cpp, Ollama albo vLLM). Obsługuje mapy i skrypty w grach 3D po polsku i angielsku; gry 2D, obrazy i moderacja nadal używają Gemini."),
      h("p", null, s.local.provider === "local" ? "✅ Asystent używa własnego modelu" : "ℹ️ Asystent używa Gemini", s.local.ready ? "" : " (brak adresu modelu)"),
      h("label", { class: "field" }, h("span", null, "Adres API (kończy się na /v1)"), lUrl),
      h("label", { class: "field" }, h("span", null, "Nazwa modelu na serwerze"), lModel),
      h("label", { class: "field" }, h("span", null, "Klucz API"), lKey),
      h(
        "div",
        { class: "row wrap" },
        h("button", { class: "btn small primary", onClick: async () => (await run(adminApi.setAi({ localUrl: lUrl.value, localModel: lModel.value, ...(lKey.value ? { localKey: lKey.value } : {}) }), "Zapisano")) && redraw() }, "Zapisz"),
        h("button", { class: "btn small", onClick: async () => {
          lOut.textContent = "Łączę…";
          const r = await run(adminApi.testLocalAi());
          if (r) lOut.textContent = r.ok ? `✅ ${r.ms} ms: ${r.reply}` : "❌ " + r.error;
        } }, "🧪 Test połączenia"),
        h("button", { class: "btn small", onClick: async () => (await run(adminApi.setAi({ provider: s.local.provider === "local" ? "gemini" : "local" }))) && redraw() }, s.local.provider === "local" ? "↩️ Wróć do Gemini" : "▶️ Używaj własnego modelu"),
      ),
      lOut,
    ),
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "🤖 Asystent AI w Studio"),
      h("p", { class: "muted small" }, "Twórcy piszą, co chcą zrobić, a asystent sam buduje mapę, obiekty, skrypty i GUI w ich grze. Jeden krok asystenta = jedno zapytanie do Gemini (zwykła prośba to ok. 5-20 kroków)."),
      h("p", null, s.assistant ? "✅ Włączony" : "⏸️ Wyłączony", s.ready ? "" : " (potrzebny klucz Gemini)"),
      h("p", { class: "muted small" }, `Dzisiaj: ${fmt.format(s.stats.requests)} kroków, ${fmt.format(s.stats.tokens)} tokenów, ${s.stats.users} twórców.`),
      h("label", { class: "field" }, h("span", null, "Limit kroków na twórcę dziennie (admini bez limitu)"), limit),
      h(
        "div",
        { class: "row wrap" },
        h("button", { class: "btn small primary", onClick: async () => (await run(adminApi.setAi({ dailyLimit: Number(limit.value) || 0 }), "Zapisano")) && redraw() }, "Zapisz limit"),
        h("button", { class: "btn small", onClick: async () => (await run(adminApi.setAi({ assistant: !s.assistant }))) && redraw() }, s.assistant ? "⏸️ Wyłącz asystenta" : "▶️ Włącz asystenta"),
      ),
    ),
  );
}

/** kopie zapasowe bazy i aktualizacja serwera z GitHuba */
/** moderacja AI (Gemini albo Groq): klucz, włącz / wyłącz, próba, sprawdzenie gier, dziennik */
async function moderationTab(el: HTMLElement) {
  const s = await run(adminApi.moderation());
  if (!s) return;
  const flagged = (await run(adminApi.flaggedWorlds())) ?? [];
  const keyIn = h("input", { type: "password", placeholder: s.hasKey ? `Zapisany klucz: ${s.keyHint}` : "gsk_...", autocomplete: "off" });
  const testIn = h("input", { placeholder: "Np. wiadomość do sprawdzenia" });
  const testOut = h("div", { class: "muted small" });
  const redraw = () => (el.replaceChildren(), moderationTab(el));
  const KIND_ICONS: Record<string, string> = { "czat w grze": "💬", "wiadomość prywatna": "✉️", "czat grupy": "👥", gra: "🎮", nick: "🪪", mute: "🔇" };
  el.append(
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "🛡️ Moderacja AI"),
      h(
        "p",
        { class: "muted small" },
        s.provider === "gemini"
          ? `Sprawdza Gemini: czat i nicki szybki model ${s.fastModel}, reszta ${s.textModel}. Sprawdzane są czat (w grach, prywatny i w grupach), nicki i nazwy, a w opublikowanych grach teksty, skrypty, obrazki i dźwięki / piosenki (Gemini słucha nagrań sam). Klucz Gemini ustawiasz w zakładce AI. Gdy AI nie działa, zostaje zwykły filtr słów.`
          : `Sprawdza Groq: czat (w grach, prywatny i w grupach), nicki i nazwy, a opublikowane gry: teksty, skrypty, obrazki i dźwięki / piosenki (Whisper zamienia je na tekst). Model tekstu i obrazków: ${s.textModel}, dźwięku: ${s.audioModel}. Gdy Groq nie działa, zostaje zwykły filtr słów.`,
      ),
      h(
        "div",
        { class: "row wrap" },
        h("span", null, "Kto sprawdza:"),
        ...(["gemini", "groq"] as const).map((pv) =>
          h(
            "button",
            {
              class: "btn small" + (s.provider === pv ? " primary" : ""),
              onClick: async () => (await run(adminApi.setModeration({ provider: pv }))) && redraw(),
            },
            pv === "gemini" ? "✨ Gemini" : "⚡ Groq",
          ),
        ),
      ),
      h(
        "p",
        null,
        s.enabled ? "✅ Włączona" : s.hasKey ? "⏸️ Wyłączona" : "❌ Brak klucza",
        s.flaggedWorlds ? ` · gier zatrzymanych przez moderację: ${s.flaggedWorlds}` : "",
      ),
      s.limits.requestsLeft !== null
        ? h("p", { class: "muted small" }, `Limit Groq: zostało zapytań ${s.limits.requestsLeft}, tokenów w tej minucie ${s.limits.tokensLeft ?? "?"}. Darmowy plan ma mało zapytań na dzień - przy wielu graczach potrzebny jest płatny plan Groq.`)
        : "",
      s.limits.paused ? h("p", { class: "form-error" }, "⏸️ " + s.limits.paused) : "",
      s.keyFromEnv
        ? h("p", { class: "muted small" }, "Klucz jest ustawiony w zmiennej GROQ_API_KEY na serwerze.")
        : h(
            "div",
            { class: "row" },
            keyIn,
            h("button", { class: "btn primary small", onClick: async () => (await run(adminApi.setModeration({ key: keyIn.value }), "Zapisano klucz")) && redraw() }, "Zapisz klucz"),
            s.hasKey ? h("button", { class: "btn small danger", onClick: async () => (await run(adminApi.setModeration({ key: "" }), "Usunięto klucz")) && redraw() }, "Usuń") : "",
          ),
      s.hasKey
        ? h(
            "button",
            { class: "btn small", onClick: async () => (await run(adminApi.setModeration({ enabled: !s.enabled }))) && redraw() },
            s.enabled ? "⏸️ Wyłącz moderację AI" : "▶️ Włącz moderację AI",
          )
        : "",
    ),
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "🧪 Sprawdź tekst" + (s.provider ? (s.provider === "gemini" ? " (Gemini)" : " (Groq)") : "")),
      h(
        "div",
        { class: "row" },
        testIn,
        h(
          "button",
          {
            class: "btn small",
            onClick: async () => {
              testOut.textContent = "⏳ Sprawdzam…";
              const r = await run(adminApi.testModeration(testIn.value));
              testOut.textContent = r ? (r.ok ? "✅ W porządku" : "🚫 Zablokowane: " + r.reason) : "";
            },
          },
          "Sprawdź",
        ),
      ),
      testOut,
    ),
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "🎮 Gry"),
      h("p", { class: "muted small" }, "Każda opublikowana gra jest sprawdzana po zapisie. Gra z problemem jest ukrywana, a twórca dostaje powiadomienie z powodem. Po poprawce i zapisie sprawdza się jeszcze raz i publikuje sama."),
      s.scanAll?.running
        ? h("p", null, "⏳ Trwa sprawdzanie wszystkich gier…")
        : h(
            "button",
            { class: "btn small", onClick: async () => (await run(adminApi.scanAllWorlds(), "Sprawdzanie ruszyło - odśwież za chwilę")) && redraw() },
            "Sprawdź wszystkie opublikowane gry",
          ),
      s.scanAll && !s.scanAll.running && s.scanAll.checked ? h("p", { class: "muted small" }, `Ostatnio: sprawdzono ${s.scanAll.checked}, ukryto ${s.scanAll.flagged}.`) : "",
      flagged.length
        ? h(
            "div",
            { class: "adm-list" },
            h("p", { class: "muted small" }, "Zatrzymane gry. AI czasem się myli (np. „widzi” kształty w drzewach) - „Zatwierdź” publikuje grę mimo to, dopóki twórca jej nie zmieni."),
            flagged.map((f) =>
              h(
                "div",
                { class: "adm-row" },
                h("div", null, h("b", null, `${f.status === "pending" ? "⏳" : "🚫"} ${f.name}`), h("span", { class: "muted small" }, ` · ${f.owner}`), f.reason ? h("div", { class: "muted small" }, f.reason) : ""),
                h(
                  "div",
                  { class: "row" },
                  h("button", { class: "btn small primary", onClick: async () => (await run(adminApi.approveWorld(f.id), "Zatwierdzono grę")) && redraw() }, "✅ Zatwierdź"),
                  h("button", { class: "btn small", onClick: async () => (await run(adminApi.scanWorld(f.id), "Sprawdzono jeszcze raz")) && redraw() }, "🔁 Sprawdź jeszcze raz"),
                ),
              ),
            ),
          )
        : "",
    ),
    h(
      "div",
      { class: "adm-box" },
      h("h3", null, "📜 Zablokowane ostatnio"),
      h(
        "div",
        { class: "adm-list" },
        s.log?.length
          ? s.log.map((l) =>
              h(
                "div",
                { class: "adm-row" },
                h(
                  "div",
                  { class: "adm-row-main" },
                  h("b", null, `${KIND_ICONS[l.kind] ?? "🛡️"} ${l.kind}`),
                  h("span", { class: "muted small" }, ` · ${l.user ?? "?"}${l.world ? " · " + l.world : ""} · ${new Date(l.at).toLocaleString("pl-PL")}`),
                  l.content ? h("div", { class: "small" }, "„" + l.content + "”") : "",
                  h("div", { class: "small" }, "Powód: " + l.reason),
                ),
                l.worldId
                  ? h(
                      "button",
                      {
                        class: "btn small",
                        onClick: async () => {
                          const r = await run(adminApi.scanWorld(l.worldId!));
                          if (r) toast(r.ok ? "✅ Gra jest teraz w porządku" : "🚫 " + r.problems.map((p) => p.where + ": " + p.reason).join("; "), r.ok ? "good" : "error");
                        },
                      },
                      "Sprawdź grę",
                    )
                  : "",
              ),
            )
          : [h("p", { class: "muted" }, "Nic nie zostało zablokowane.")],
      ),
    ),
  );
}

/** trailer startowy, APK i instalator Windows: wgrywanie (z paskiem postępu), podmiana i usuwanie */
function appsTab(el: HTMLElement) {
  type Info = { size: number; at: number; id: string; custom: boolean } | null;
  const KINDS = [
    { kind: "trailer", icon: "🎬", name: "Trailer startowy (.mp4)", note: "Nowy gracz widzi go raz po wejściu, a gracze po wgraniu nowego pliku - też raz. Bez wgranego pliku działa trailer wbudowany w serwer.", accept: ".mp4,video/mp4" },
    { kind: "apk", icon: "📱", name: "Aplikacja na Androida (.apk)", note: "Telefony z Androidem dostają na stronie przycisk pobierania tego pliku.", accept: ".apk" },
    { kind: "setup", icon: "🖥", name: "Instalator na Windows (.exe)", note: "Komputery z Windows dostają na stronie przycisk pobierania instalatora. iOS nie dostaje nic.", accept: ".exe" },
  ] as const;
  const box = h("div", { class: "adm-box" });
  el.append(box);
  const size = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB");
  const call = async (method: string, kind: string, body?: File, onProgress?: (p: number) => void) =>
    new Promise<void>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, `${getServerUrl()}/api/admin/media/${kind}`);
      if (getToken()) x.setRequestHeader("authorization", "Bearer " + getToken());
      if (body) x.setRequestHeader("x-file-name", encodeURIComponent(body.name));
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) return resolve();
        let msg = "Błąd " + x.status;
        try {
          msg = JSON.parse(x.responseText).error ?? msg;
        } catch {
          /* brak */
        }
        reject(new Error(x.status === 413 ? "Plik jest za duży (limit serwera lub serwera pośredniczącego)" : msg));
      };
      x.onerror = () => reject(new Error("Brak połączenia z serwerem"));
      x.send(body ?? null);
    });
  const draw = async () => {
    let info: Record<string, Info> | null = null;
    try {
      const r = await fetch(`${getServerUrl()}/api/admin/media`, { headers: getToken() ? { authorization: "Bearer " + getToken() } : {} });
      info = await r.json();
    } catch {
      /* brak */
    }
    box.replaceChildren(
      h("h3", null, "📦 Aplikacje i trailer"),
      h("p", { class: "muted small" }, "Pliki leżą na serwerze w data/downloads. Wgranie nowego pliku od razu zastępuje stary."),
      ...KINDS.map((k) => {
        const cur = info?.[k.kind] ?? null;
        const file = h("input", { type: "file", accept: k.accept, class: "hidden" }) as HTMLInputElement;
        const status = h("span", { class: "muted small" }, cur ? `${cur.custom ? "wgrany" : "wbudowany"} · ${size(cur.size)} · ${new Date(cur.at).toLocaleString("pl-PL")}` : "nie wgrano");
        const bar = h("progress", { max: "1", value: "0", class: "hidden", style: "width:100%" }) as HTMLProgressElement;
        file.addEventListener("change", async () => {
          const f = file.files?.[0];
          if (!f) return;
          bar.classList.remove("hidden");
          try {
            await call("PUT", k.kind, f, (p) => (bar.value = p));
            toast("Wgrano: " + f.name, "good");
          } catch (e) {
            toast((e as Error).message, "error");
          }
          draw();
        });
        return h(
          "div",
          { class: "adm-row", style: "flex-direction:column;align-items:stretch;gap:6px" },
          h("div", null, h("b", null, `${k.icon} ${k.name}`), " · ", status),
          h("span", { class: "muted small" }, k.note),
          h(
            "div",
            { class: "row" },
            file,
            h("button", { class: "btn small primary", onClick: () => file.click() }, cur?.custom ? "Podmień plik" : "Wgraj plik"),
            cur?.custom ? h("button", { class: "btn small danger", onClick: async () => ((await call("DELETE", k.kind).then(() => true, (e) => (toast(e.message, "error"), false))) && draw()) }, "Usuń") : null,
            k.kind !== "trailer" && cur ? h("a", { class: "btn small", href: `${getServerUrl()}/download/${k.kind === "apk" ? "predator.apk" : "predator-setup.exe"}` }, "Pobierz") : null,
          ),
          bar,
        );
      }),
    );
  };
  draw();
}

function serverTab(el: HTMLElement) {
  const upd = h("div", { class: "adm-box" });
  const backups = h("div", { class: "adm-box" });
  const size = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB");
  let poll = 0;

  const renderBackups = async () => {
    const list = await run(adminApi.backups());
    if (!list) return;
    backups.replaceChildren(
      h("h3", null, "💾 Kopie zapasowe bazy"),
      h("p", { class: "muted small" }, "Serwer robi kopię codziennie (i przed każdą aktualizacją) i trzyma 14 ostatnich w folderze data/backups. Konta, monety i gry są bezpieczne."),
      h("button", { class: "btn primary small", onClick: async () => (await run(adminApi.backupNow(), "Zrobiono kopię")) && renderBackups() }, "Zrób kopię teraz"),
      h(
        "div",
        { class: "adm-list" },
        list.length
          ? list.map((b) =>
              h(
                "div",
                { class: "adm-row" },
                h("div", { class: "adm-row-main" }, h("b", null, b.name), h("span", { class: "muted small" }, ` · ${size(b.size)} · ${new Date(b.at).toLocaleString("pl-PL")}`)),
                h(
                  "button",
                  {
                    class: "btn small",
                    onClick: async () => {
                      // pobranie z tokenem (zwykły link nie wyśle nagłówka logowania)
                      const r = await fetch(getServerUrl() + "/api/admin/backups/" + encodeURIComponent(b.name), { headers: { authorization: "Bearer " + getToken() } });
                      if (!r.ok) return toast("Nie udało się pobrać", "error");
                      const url = URL.createObjectURL(await r.blob());
                      const a = h("a", { href: url, download: b.name });
                      document.body.append(a);
                      a.click();
                      a.remove();
                      setTimeout(() => URL.revokeObjectURL(url), 5000);
                    },
                  },
                  "⬇️ Pobierz",
                ),
              ),
            )
          : h("div", { class: "muted" }, "Jeszcze nie ma kopii."),
      ),
    );
  };

  const renderUpdate = async (check = false) => {
    const s = await run(adminApi.updateStatus(check));
    if (!s) return;
    const st = s.state;
    upd.replaceChildren(
      h("h3", null, "🔄 Aktualizacja serwera"),
      !s.git
        ? h("p", { class: "form-error" }, "Serwer nie jest pobrany przez „git clone”, więc nie umie się sam zaktualizować. Pobierz nową wersję ręcznie.")
        : h(
            "p",
            { class: "muted small" },
            "Pobiera nową wersję z GitHuba, robi kopię bazy i uruchamia serwer ponownie (gracze zostaną rozłączeni na chwilę). Aplikacje graczy same pobiorą nową wersję gry.",
          ),
      s.git && !s.supervised
        ? h("p", { class: "form-error" }, "Uwaga: serwer nie został uruchomiony przez start-server.bat / start-server.sh - po aktualizacji trzeba go uruchomić ponownie ręcznie.")
        : "",
      s.check
        ? s.check.error
          ? h("p", { class: "form-error" }, s.check.error)
          : h(
              "div",
              null,
              h("p", null, s.check.behind ? `Nowych zmian: ${s.check.behind} (gałąź ${s.check.branch})` : `✅ Serwer jest aktualny (gałąź ${s.check.branch})`),
              s.check.commits?.length ? h("ul", { class: "adm-commits" }, s.check.commits.map((c) => h("li", null, c))) : "",
            )
        : "",
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn small", disabled: !s.git, onClick: () => renderUpdate(true) }, "Sprawdź aktualizacje"),
        h(
          "button",
          {
            class: "btn primary small",
            disabled: !s.git || st.running,
            onClick: async () => {
              if (!(await ask("Zaktualizować serwer? Gracze zostaną na chwilę rozłączeni.", "Aktualizuj", "Anuluj"))) return;
              if (await run(adminApi.updateServer())) startPolling();
            },
          },
          st.running ? "Aktualizuję…" : "Aktualizuj i uruchom ponownie",
        ),
      ),
      st.log.length ? h("pre", { class: "adm-log-box" }, st.log.join("\n")) : "",
    );
  };

  // w trakcie aktualizacji serwer się wyłącza - czekamy, aż wróci
  const startPolling = () => {
    clearInterval(poll);
    let sawDown = false;
    poll = window.setInterval(async () => {
      if (!el.isConnected) return clearInterval(poll);
      try {
        await adminApi.updateStatus();
        if (sawDown) {
          clearInterval(poll);
          toast("✅ Serwer działa w nowej wersji", "good");
        }
        renderUpdate();
      } catch {
        sawDown = true;
        upd.querySelector(".adm-log-box")?.append("\n⏳ Serwer się uruchamia…");
      }
    }, 3000);
  };

  el.append(upd, backups);
  renderUpdate();
  renderBackups();
}

async function logTab(el: HTMLElement) {
  const r = await run(adminApi.log());
  if (!r) return;
  el.append(
    h(
      "div",
      { class: "adm-list" },
      r.length
        ? r.map((l) =>
            h(
              "div",
              { class: "adm-row adm-log" },
              h(
                "div",
                { class: "adm-row-main" },
                h("b", null, l.admin),
                " — ",
                l.action,
                l.target ? [" ", h("b", null, l.target)] : null,
                l.details ? h("span", { class: "muted" }, ` (${l.details})`) : null,
              ),
              h("span", { class: "muted small" }, new Date(l.at).toLocaleString("pl-PL")),
            ),
          )
        : h("div", { class: "muted" }, "Pusto - nikt jeszcze nic nie zrobił."),
    ),
  );
}
