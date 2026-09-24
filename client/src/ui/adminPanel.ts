// Panel admina (tylko dla kont z listy adminów - serwer i tak sprawdza każde żądanie).
import { CATALOG } from "../../../shared/catalog.ts";
import { adminApi, type AdminUser, type AdminWorld } from "../api.ts";
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
  const tabs = ["Start", "Gracze", "Gry", "Ogłoszenie"] as const;
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
