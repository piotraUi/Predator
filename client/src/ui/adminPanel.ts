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

export function adminPanel(el: HTMLElement) {
  const tabs = ["Start", "Zgłoszenia", "Gracze", "Gry", "Ogłoszenie", "Moderacja", "AI", "Serwer", "Historia"] as const;
  let tab: (typeof tabs)[number] = "Start";
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
    else if (tab === "Serwer") serverTab(body);
    else if (tab === "Moderacja") moderationTab(body);
    else if (tab === "AI") aiTab(body);
    else if (tab === "Gracze") usersTab(body);
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

function usersTab(el: HTMLElement) {
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
        u.admin ? h("span", { class: "adm-tag" }, "ADMIN") : null,
        u.banned ? h("span", { class: "adm-tag bad" }, "ZABLOKOWANY") : null,
        u.online ? h("span", { class: "adm-tag good" }, "online") : null,
        u.mutedUntil ? h("span", { class: "adm-tag warn", title: "do " + new Date(u.mutedUntil).toLocaleString("pl-PL") }, "WYCISZONY") : null,
        h("div", { class: "muted small" }, `🪙 ${fmt.format(u.coins)} · 🎒 ${u.items} · od ${new Date(u.createdAt).toLocaleDateString("pl-PL")}`),
      ),
      h(
        "div",
        { class: "adm-actions" },
        h(
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
        h(
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
        h(
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
        u.admin
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
        u.admin
          ? null
          : h(
              "button",
              {
                class: "btn small " + (u.banned ? "" : "danger"),
                onClick: async () => {
                  if (!u.banned && !(await ask(`Zablokować konto ${u.username}? Zostanie wylogowany i wyrzucony z gier.`, "Zablokuj", "Anuluj", true))) return;
                  replace(await run(adminApi.ban(u.id, !u.banned), u.banned ? "Odblokowano" : "Zablokowano"));
                },
              },
              u.banned ? "✅ Odblokuj" : "⛔ Zablokuj",
            ),
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
  const loc = h("input", { value: s.location, placeholder: "global" });
  const limit = h("input", { type: "number", min: "0", value: String(s.dailyLimit) });
  const testOut = h("div", { class: "muted small" });
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
      h("label", { class: "field" }, h("span", null, "Nazwa modelu (np. gemini-3.8-flash)"), model),
      h("label", { class: "field" }, h("span", null, "Region (global działa dla najnowszych modeli)"), loc),
      h(
        "div",
        { class: "row wrap" },
        h("button", { class: "btn small primary", onClick: async () => (await run(adminApi.setAi({ model: model.value, location: loc.value }), "Zapisano")) && redraw() }, "Zapisz"),
        h(
          "button",
          {
            class: "btn small",
            disabled: !s.ready,
            onClick: async () => {
              testOut.textContent = "⏳ Pytam Gemini…";
              const r = await run(adminApi.testAi());
              testOut.textContent = r ? `✅ Działa (${(r.ms / 1000).toFixed(1)} s): „${r.text}”` : "❌ Nie działa - zobacz komunikat";
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
          ? `Sprawdza Gemini (${s.textModel}): czat (w grach, prywatny i w grupach), nicki i nazwy, a w opublikowanych grach teksty, skrypty, obrazki i dźwięki / piosenki (Gemini słucha nagrań sam). Klucz Gemini ustawiasz w zakładce AI. Gdy AI nie działa, zostaje zwykły filtr słów.`
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
