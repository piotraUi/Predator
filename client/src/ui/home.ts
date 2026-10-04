// Menu główne w stylu aplikacji mobilnej: górny pasek, znajomi, polecane gry, Hity, Awatar, Czat.
// Na telefonie dolny pasek zakładek, na komputerze boczne menu. Bez silnika 3D (awatar wczytuje się osobno).
import { DEFAULT_MAX_PLAYERS, findGenre, GENRES, worldRating, type ChatMessage, type FriendInfo, type WorldInfo } from "../../../shared/types.ts";
import { GAME_EXT, parseGameFile } from "../../../shared/gamefile.ts";
import { api, setToken, thumbnailUrl } from "../api.ts";
import { session } from "../state.ts";
import { openSettings } from "../settings.ts";
import { pickFile } from "../files.ts";
import { ask, h, hashColor, logo, modal, toast } from "./dom.ts";
import { headshot } from "./headshot.ts";
import { icon } from "./icons.ts";
import { groupsView, groupView, privateServersSection, profileView, reportDialog, tradesView } from "./social.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;
type Route =
  | { v: "home" }
  | { v: "charts"; sort?: Sort; genre?: string }
  | { v: "avatar" }
  | { v: "chat"; with?: number }
  | { v: "friends" }
  | { v: "create" }
  | { v: "game"; id: number }
  | { v: "search"; q?: string }
  | { v: "admin" }
  | { v: "profile"; name: string }
  | { v: "groups" }
  | { v: "group"; id: number }
  | { v: "trades" };
type Sort = "popular" | "rating" | "liked" | "visits" | "new";
type Cleanup = void | (() => void);
export type Ctx = { go: Go; nav: (r: Route, replace?: boolean) => void; back: () => void; refreshBadges: () => void };

const MAIN_TABS = ["home", "charts", "avatar", "chat", "friends", "create", "admin", "groups", "trades"] as const;
export const isHomeTab = (t: string) => (MAIN_TABS as readonly string[]).includes(t);

export function homeScreen(root: HTMLElement, params: { tab?: string; worldId?: number }, go: Go) {
  const main = h("main", { class: "pv-main" });
  const stack: Route[] = [];
  let current: Route = { v: "home" };
  let viewId = 0;
  let cleanupView: (() => void) | null = null;

  // ---------- górny pasek ----------
  const coinsNum = h("span");
  const bellBadge = h("span", { class: "pv-badge hidden" });
  const tradeBadge = h("span", { class: "pv-badge inline hidden" });
  const chatBadges: HTMLElement[] = [];
  const mkChatBadge = () => {
    const b = h("span", { class: "pv-badge hidden" });
    chatBadges.push(b);
    return b;
  };
  const search = h("input", { class: "pv-search-input", type: "search", placeholder: "Szukaj gier", maxLength: 40 });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && search.value.trim()) nav({ v: "search", q: search.value.trim() });
  });
  const top = h(
    "header",
    { class: "pv-top" },
    h("button", { class: "pv-icon-btn pv-only-mobile", title: "Menu", onClick: () => toggleDrawer(true) }, icon("menu")),
    h("button", { class: "pv-logo", title: "Strona główna", onClick: () => nav({ v: "home" }) }, logo()),
    h(
      "div",
      { class: "pv-top-links pv-only-desktop" },
      h("button", { onClick: () => nav({ v: "charts" }) }, "Hity"),
      h("button", { onClick: () => nav({ v: "create" }) }, "Twórz"),
      h("button", { onClick: () => nav({ v: "avatar" }) }, "Awatar"),
    ),
    h("label", { class: "pv-search pv-only-desktop" }, icon("search", 18), search),
    h("div", { class: "spacer pv-only-mobile" }),
    h("button", { class: "pv-icon-btn pv-only-mobile", title: "Szukaj", onClick: () => nav({ v: "search" }) }, icon("search")),
    h(
      "button",
      { class: "pv-coins", title: "Monety - zdobywasz je grając", onClick: () => toast(`Masz ${session.user!.coins} monet. Graj w gry, żeby zdobyć więcej!`) },
      icon("coin", 22),
      coinsNum,
    ),
    h("button", { class: "pv-icon-btn pv-bell", title: "Powiadomienia", onClick: () => openNotifications() }, icon("bell"), bellBadge),
    h("button", { class: "pv-icon-btn pv-only-desktop", title: "Ustawienia", onClick: () => openSettings() }, icon("settings")),
  );

  // ---------- boczne menu (komputer) / wysuwane menu (telefon) ----------
  const sideUser = h("button", { class: "pv-side-user", title: "Mój profil", onClick: () => nav({ v: "profile", name: session.user!.username }) });
  const sideItem = (r: Route["v"], ic: Parameters<typeof icon>[0], label: string, badge?: HTMLElement) =>
    h("button", { class: "pv-side-item", "data-v": r, onClick: () => nav({ v: r } as Route) }, icon(ic, 22), h("span", null, label), badge ?? null);
  const side = h(
    "aside",
    { class: "pv-side" },
    sideUser,
    sideItem("home", "home", "Strona główna"),
    sideItem("charts", "fire", "Hity"),
    sideItem("avatar", "person", "Awatar"),
    sideItem("chat", "chat", "Czat", mkChatBadge()),
    sideItem("friends", "users", "Znajomi"),
    sideItem("groups", "users", "Grupy"),
    sideItem("trades", "coin", "Wymiany", tradeBadge),
    sideItem("create", "build", "Twórz"),
    session.user?.admin ? sideItem("admin", "settings", "Panel admina") : null,
    h("button", { class: "pv-side-item", onClick: () => go("offline") }, icon("folder", 22), h("span", null, "Studio bez serwera")),
    h("div", { class: "pv-side-sep" }),
    h("button", { class: "pv-side-item", onClick: () => (toggleDrawer(false), openSettings()) }, icon("settings", 22), h("span", null, "Ustawienia")),
    h(
      "button",
      {
        class: "pv-side-item",
        onClick: async () => {
          if (!(await ask("Wylogować się?", "Wyloguj", "Anuluj"))) return;
          await api.logout().catch(() => {});
          setToken(null);
          go("auth");
        },
      },
      icon("logout", 22),
      h("span", null, "Wyloguj"),
    ),
  );
  const backdrop = h("div", { class: "pv-backdrop", onClick: () => toggleDrawer(false) });
  const toggleDrawer = (open: boolean) => {
    side.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
  };

  // ---------- dolny pasek (telefon) ----------
  const tabBtn = (r: Route["v"], ic: Parameters<typeof icon>[0] | null, label: string, badge?: HTMLElement) => {
    const face = ic ? icon(ic, 26) : h("img", { class: "pv-tab-avatar", alt: "" });
    return h("button", { class: "pv-tab", "data-v": r, onClick: () => nav({ v: r } as Route) }, h("span", { class: "pv-tab-ic" }, face, badge ?? null), h("span", null, label));
  };
  const bottom = h(
    "nav",
    { class: "pv-bottom" },
    tabBtn("home", "home", "Strona główna"),
    tabBtn("charts", "fire", "Hity"),
    tabBtn("avatar", null, "Awatar"),
    tabBtn("chat", "chat", "Czat", mkChatBadge()),
  );

  const el = h("div", { class: "pv" }, top, side, backdrop, main, bottom);
  root.append(el);

  const updateUser = () => {
    const u = session.user!;
    coinsNum.textContent = String(u.coins);
    const face = headshot(u.avatar);
    sideUser.replaceChildren(h("img", { class: "pv-head", src: face, alt: "" }), h("b", null, u.username));
    for (const img of bottom.querySelectorAll<HTMLImageElement>(".pv-tab-avatar")) img.src = face;
  };
  updateUser();
  const unsub = session.onChange(updateUser);

  // ---------- nawigacja ----------
  const ctx: Ctx = { go, nav: (r, replace) => nav(r, replace), back: () => back(), refreshBadges: () => void pollNotifications() };
  function nav(r: Route, replace = false) {
    toggleDrawer(false);
    const isTab = isHomeTab(r.v);
    if (isTab) stack.length = 0;
    else if (!replace) stack.push(current);
    render(r);
  }
  function back() {
    render(stack.pop() ?? { v: "home" });
  }
  function render(r: Route) {
    current = r;
    const id = ++viewId;
    cleanupView?.();
    cleanupView = null;
    main.replaceChildren();
    main.scrollTop = 0;
    const tab = r.v === "game" || r.v === "search" || r.v === "profile" ? "" : r.v === "group" ? "groups" : r.v;
    for (const b of el.querySelectorAll<HTMLElement>("[data-v]")) b.classList.toggle("active", b.dataset.v === tab);
    el.dataset.view = r.v;
    if (isHomeTab(r.v)) history.replaceState(null, "", "#" + r.v);
    const view = h("div", { class: "pv-view pv-" + r.v });
    main.append(view);
    const res: Cleanup | Promise<Cleanup> =
      r.v === "home"
        ? homeView(view, ctx)
        : r.v === "charts"
          ? chartsView(view, ctx, r.sort ?? "popular", r.genre ?? "")
          : r.v === "avatar"
            ? avatarView(view)
            : r.v === "chat"
              ? r.with
                ? conversationView(view, ctx, r.with)
                : chatListView(view, ctx)
              : r.v === "friends"
                ? friendsView(view, ctx)
                : r.v === "create"
                  ? createView(view, ctx)
                  : r.v === "game"
                    ? gameView(view, ctx, r.id)
                    : r.v === "admin"
                      ? adminView(view)
                      : r.v === "profile"
                        ? profileView(view, ctx, r.name)
                        : r.v === "groups"
                          ? groupsView(view, ctx)
                          : r.v === "group"
                            ? groupView(view, ctx, r.id)
                            : r.v === "trades"
                              ? tradesView(view, ctx)
                              : searchView(view, ctx, r.q ?? "");
    Promise.resolve(res).then((c) => {
      if (!c) return;
      if (id === viewId) cleanupView = c;
      else c(); // użytkownik zdążył przejść dalej
    });
  }

  // ---------- powiadomienia (czerwone kropki) ----------
  const setBadge = (b: HTMLElement, n: number) => {
    b.textContent = n > 9 ? "9+" : String(n);
    b.classList.toggle("hidden", n <= 0);
  };
  const pollNotifications = async () => {
    try {
      const n = await api.notifications();
      setBadge(bellBadge, n.friendRequests + (n.alerts?.length ?? 0) + (n.trades ?? 0));
      setBadge(tradeBadge, n.trades ?? 0);
      for (const b of chatBadges) setBadge(b, n.unreadMessages);
      if (session.user && session.user.coins !== n.coins) session.set({ ...session.user, coins: n.coins });
    } catch {
      /* brak sieci - spróbujemy za chwilę */
    }
  };
  const notifTimer = setInterval(pollNotifications, 15_000);
  pollNotifications();

  async function openNotifications() {
    const list = h("div", { class: "pv-notifs" }, h("div", { class: "muted" }, "Ładowanie…"));
    const close = modal("Powiadomienia", list);
    const refresh = async () => {
      try {
        const [friends, n] = await Promise.all([api.friends(), api.notifications()]);
        const incoming = friends.filter((f) => f.status === "incoming");
        const items: Node[] = incoming.map((f) =>
          h(
            "div",
            { class: "pv-notif" },
            h("img", { class: "pv-head small", src: headshot(f.avatar), alt: "" }),
            h("div", { class: "pv-notif-text" }, h("b", null, f.username), " chce zostać twoim znajomym"),
            h("button", { class: "btn small primary", onClick: async () => (await api.acceptFriend(f.id), refresh(), pollNotifications()) }, "Akceptuj"),
            h("button", { class: "btn small", onClick: async () => (await api.removeFriend(f.id), refresh(), pollNotifications()) }, "Odrzuć"),
          ),
        );
        if (n.trades)
          items.push(
            h(
              "button",
              { class: "pv-notif link-row", onClick: () => (close(), nav({ v: "trades" })) },
              h("span", { style: "font-size:22px" }, "🔁"),
              h("div", { class: "pv-notif-text" }, `Propozycje wymiany czekają na Ciebie: ${n.trades}`),
            ),
          );
        if (n.unreadMessages)
          items.push(
            h(
              "button",
              { class: "pv-notif link-row", onClick: () => (close(), nav({ v: "chat" })) },
              icon("chat", 22),
              h("div", { class: "pv-notif-text" }, `Masz nieprzeczytane wiadomości: ${n.unreadMessages}`),
            ),
          );
        for (const a of n.alerts ?? [])
          items.push(h("div", { class: "pv-notif pv-alert-row" }, h("div", { class: "pv-notif-text" }, a.text), h("span", { class: "muted small" }, timeAgo(a.at))));
        if (n.alerts?.length) api.readAlerts().then(pollNotifications, () => {});
        list.replaceChildren(...(items.length ? items : [h("div", { class: "pv-empty" }, icon("bell", 36), "Brak nowych powiadomień")]));
      } catch (e) {
        list.replaceChildren(h("div", { class: "form-error" }, (e as Error).message));
      }
    };
    refresh();
  }

  // ---------- start ----------
  const t = params.tab ?? "home";
  if (t === "game" && params.worldId) {
    stack.push({ v: "home" });
    render({ v: "game", id: params.worldId });
  } else render({ v: (isHomeTab(t) ? t : "home") as "home" });

  api
    .me()
    .then(({ user, dailyBonus }) => {
      session.set(user);
      if (dailyBonus) toast(`Codzienny bonus: +${dailyBonus} monet`, "good");
    })
    .catch(() => {});

  return () => {
    viewId++;
    cleanupView?.();
    clearInterval(notifTimer);
    unsub();
    el.remove();
  };
}

// =====================================================================
// wspólne kawałki
// =====================================================================

export function thumb(w: WorldInfo, cls = "g-thumb") {
  const url = thumbnailUrl(w);
  const fallback = () =>
    h(
      "div",
      { class: cls + " g-thumb-empty", style: `--c:${hashColor(w.name)}` },
      h("span", null, w.name.slice(0, 1).toUpperCase()),
    );
  if (!url) return fallback();
  const box = h("div", { class: cls });
  const img = h("img", { src: url, alt: "", loading: "lazy", decoding: "async" });
  img.addEventListener("error", () => box.replaceWith(fallback()));
  box.append(img);
  return box;
}

function ratingLabel(w: WorldInfo) {
  const r = worldRating(w);
  return r === null ? "Nowość" : `Ocena ${r}%`;
}

function gameCard(w: WorldInfo, onClick: () => void, extra?: Node) {
  return h(
    "div",
    { class: "g-card", role: "button", tabIndex: 0, onClick, onKeydown: (e: KeyboardEvent) => e.key === "Enter" && onClick() },
    thumb(w),
    h("div", { class: "g-title" }, w.name),
    h(
      "div",
      { class: "g-meta" },
      h("span", null, icon("thumbUp", 14), ratingLabel(w)),
      w.playing ? h("span", { class: "g-live" }, icon("person", 14), String(w.playing)) : null,
    ),
    extra ?? null,
  );
}

export function gameGrid(list: WorldInfo[], ctx: Ctx, empty: string) {
  if (!list.length) return h("div", { class: "pv-empty" }, icon("search", 36), empty);
  return h("div", { class: "g-grid" }, list.map((w) => gameCard(w, () => ctx.nav({ v: "game", id: w.id }))));
}

export const loading = () => h("div", { class: "pv-loading" }, h("div", { class: "spinner" }));
export const errorBox = (e: unknown, retry?: () => void) =>
  h(
    "div",
    { class: "pv-empty" },
    icon("offline", 36),
    (e as Error).message,
    retry ? h("button", { class: "btn", onClick: retry }, "Spróbuj ponownie") : null,
  );

export function sectionHead(title: string, onMore?: () => void) {
  return h(
    "div",
    { class: "pv-section-head" },
    h("h2", null, title),
    onMore ? h("button", { class: "pv-more", onClick: onMore }, "Więcej", icon("back", 16, "ic flip")) : null,
  );
}

function friendBubble(f: FriendInfo, onClick: () => void) {
  return h(
    "button",
    { class: "pv-friend", onClick, title: f.username },
    h("span", { class: "pv-friend-face" }, h("img", { class: "pv-head", src: headshot(f.avatar), alt: "" }), f.online ? h("span", { class: "pv-dot" }) : null),
    h("span", { class: "pv-friend-name" }, f.username),
    f.playing ? h("span", { class: "pv-friend-game" }, f.playing.worldName) : null,
  );
}

function friendMenu(f: FriendInfo, ctx: Ctx) {
  const actions: { label: string; kind?: string; onClick: () => void }[] = [];
  if (f.playing) {
    const p = f.playing;
    actions.push({ label: "Dołącz do gry", kind: "green", onClick: () => (close(), ctx.go("play", { worldId: p.worldId, roomId: p.roomId })) });
  }
  actions.push({ label: "Profil", onClick: () => (close(), ctx.nav({ v: "profile", name: f.username })) });
  actions.push({ label: "Napisz", kind: "primary", onClick: () => (close(), ctx.nav({ v: "chat", with: f.id })) });
  const close = modal(
    f.username,
    h(
      "div",
      { class: "pv-friend-card" },
      h("img", { class: "pv-head big", src: headshot(f.avatar), alt: "" }),
      h("div", { class: "muted" }, f.playing ? `Gra w: ${f.playing.worldName}` : f.online ? "Online" : "Offline"),
    ),
    actions,
  );
}

// =====================================================================
// Strona główna
// =====================================================================

function homeView(el: HTMLElement, ctx: Ctx): Cleanup {
  const u = session.user!;
  const hello = h(
    "button",
    { class: "pv-hello", onClick: () => ctx.nav({ v: "avatar" }) },
    h("img", { class: "pv-head big", src: headshot(u.avatar), alt: "" }),
    h("div", null, h("div", { class: "pv-hello-name" }, u.username), h("div", { class: "muted" }, "Edytuj awatar")),
  );
  const friendsRow = h("div", { class: "pv-friends-row" });
  const friendsCount = h("span", { class: "muted" });
  const games = h("div", null, loading());
  el.append(
    hello,
    h(
      "div",
      { class: "pv-section-head" },
      h("h2", null, "Znajomi ", friendsCount),
      h("button", { class: "pv-more", onClick: () => ctx.nav({ v: "friends" }) }, "Wszyscy", icon("back", 16, "ic flip")),
    ),
    friendsRow,
    sectionHead("Polecane dla ciebie", () => ctx.nav({ v: "charts" })),
    games,
    h("h2", { class: "pv-cat-title" }, "Kategorie"),
    h(
      "div",
      { class: "pv-cats" },
      GENRES.map((g) =>
        h("button", { class: "pv-cat", onClick: () => ctx.nav({ v: "charts", genre: g.id }) }, h("span", { class: "pv-cat-ic" }, g.icon), h("span", null, g.label)),
      ),
    ),
  );

  const addBtn = h(
    "button",
    { class: "pv-friend", onClick: () => ctx.nav({ v: "friends" }) },
    h("span", { class: "pv-friend-face add" }, icon("userPlus", 30)),
    h("span", { class: "pv-friend-name" }, "Dodaj znajomych"),
  );
  const loadFriends = async () => {
    try {
      const list = (await api.friends()).filter((f) => f.status === "accepted");
      friendsCount.textContent = `(${list.length})`;
      friendsRow.replaceChildren(addBtn, ...list.map((f) => friendBubble(f, () => friendMenu(f, ctx))));
    } catch {
      friendsRow.replaceChildren(addBtn);
    }
  };
  loadFriends();
  const loadGames = async () => {
    games.replaceChildren(loading());
    try {
      games.replaceChildren(gameGrid(await api.worlds("popular"), ctx, "Nie ma jeszcze opublikowanych gier. Stwórz pierwszą w zakładce Twórz!"));
    } catch (e) {
      games.replaceChildren(errorBox(e, loadGames));
    }
  };
  loadGames();
  const timer = setInterval(loadFriends, 20_000);
  return () => clearInterval(timer);
}

// =====================================================================
// Hity
// =====================================================================

const SORTS: [Sort, string][] = [
  ["popular", "Popularne teraz"],
  ["rating", "Najlepiej oceniane"],
  ["liked", "Najwięcej łapek"],
  ["visits", "Najczęściej odwiedzane"],
  ["new", "Nowe i zaktualizowane"],
];

/** rząd kategorii (przewijany w bok) - "" = wszystkie */
function genreChips(active: string, pick: (id: string) => void) {
  return h(
    "div",
    { class: "pv-chips pv-genres" },
    h("button", { class: "pv-chip " + (active === "" ? "active" : ""), onClick: () => pick("") }, "Wszystkie"),
    GENRES.map((g) => h("button", { class: "pv-chip " + (g.id === active ? "active" : ""), onClick: () => pick(g.id) }, `${g.icon} ${g.label}`)),
  );
}

function chartsView(el: HTMLElement, ctx: Ctx, sort: Sort, genre: string) {
  const chips = h("div", { class: "pv-chips" });
  const genres = h("div");
  const title = h("h1");
  const out = h("div");
  let seq = 0;
  const load = async () => {
    const my = ++seq;
    const g = findGenre(genre);
    title.textContent = g ? `${g.icon} ${g.label}` : "Hity";
    chips.replaceChildren(
      ...SORTS.map(([id, label]) => h("button", { class: "pv-chip " + (id === sort ? "active" : ""), onClick: () => ((sort = id), load()) }, label)),
    );
    genres.replaceChildren(genreChips(genre, (id) => ((genre = id), load())));
    out.replaceChildren(loading());
    try {
      const list = await api.worlds(sort, "", genre);
      if (my === seq) out.replaceChildren(gameGrid(list, ctx, genre ? "W tej kategorii nie ma jeszcze gier - stwórz pierwszą!" : "Pusto - nikt jeszcze nie opublikował gry."));
    } catch (e) {
      if (my === seq) out.replaceChildren(errorBox(e, load));
    }
  };
  el.append(title, genres, chips, out);
  load();
}

// =====================================================================
// Wyszukiwanie
// =====================================================================

function searchView(el: HTMLElement, ctx: Ctx, q: string): Cleanup {
  const input = h("input", { type: "search", placeholder: "Szukaj gier (nazwa, twórca, opis)", value: q, maxLength: 40 });
  const out = h("div");
  const genres = h("div");
  const sortSel = h("select", { class: "pv-sort" }, SORTS.map(([id, label]) => h("option", { value: id }, label)));
  let genre = "";
  let timer = 0;
  let seq = 0;
  const run = async () => {
    const my = ++seq;
    const text = input.value.trim();
    genres.replaceChildren(genreChips(genre, (id) => ((genre = id), run())));
    out.replaceChildren(loading());
    try {
      const list = await api.worlds(sortSel.value as Sort, text, genre);
      if (my === seq) out.replaceChildren(gameGrid(list, ctx, text ? `Brak gier dla „${text}”` : "Brak gier"));
    } catch (e) {
      if (my === seq) out.replaceChildren(errorBox(e, run));
    }
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(run, 300);
  });
  el.append(
    h(
      "div",
      { class: "pv-search-page" },
      h("button", { class: "pv-icon-btn", title: "Wróć", onClick: () => ctx.back() }, icon("back")),
      h("label", { class: "pv-search" }, icon("search", 18), input),
      sortSel,
    ),
    genres,
    out,
  );
  sortSel.addEventListener("change", () => run());
  run();
  if (!q) setTimeout(() => input.focus(), 50);
  return () => clearTimeout(timer);
}

// =====================================================================
// Strona gry
// =====================================================================

async function gameView(el: HTMLElement, ctx: Ctx, id: number) {
  el.append(loading());
  let w: WorldInfo;
  try {
    w = await api.worldInfo(id);
  } catch (e) {
    el.replaceChildren(h("button", { class: "pv-back", onClick: () => ctx.back() }, icon("back", 20), "Wróć"), errorBox(e));
    return;
  }
  const mine = w.ownerId === session.user!.id;
  const likeBtn = h("button", { class: "pv-vote" });
  const dislikeBtn = h("button", { class: "pv-vote" });
  const bar = h("div", { class: "pv-vote-bar" }, h("div"));
  const renderVotes = () => {
    likeBtn.className = "pv-vote" + (w.myVote === 1 ? " on" : "");
    dislikeBtn.className = "pv-vote" + (w.myVote === -1 ? " on bad" : "");
    likeBtn.replaceChildren(icon("thumbUp", 22), String(w.likes));
    dislikeBtn.replaceChildren(icon("thumbDown", 22), String(w.dislikes));
    const r = worldRating(w);
    (bar.firstChild as HTMLElement).style.width = (r ?? 0) + "%";
    bar.classList.toggle("none", r === null);
  };
  const vote = async (v: number) => {
    if (!w.published) return toast("Najpierw opublikuj grę", "error");
    try {
      w = await api.vote(w.id, w.myVote === v ? 0 : v);
      renderVotes();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  // ulubione
  const favBtn = h("button", { class: "btn small pv-fav" }, "☆ Ulubione");
  let fav = { favorite: false, favorites: 0 };
  const renderFav = () => {
    favBtn.textContent = `${fav.favorite ? "★" : "☆"} Ulubione · ${fav.favorites}`;
    favBtn.classList.toggle("on", fav.favorite);
  };
  api.favorite(w.id).then((f) => ((fav = f), renderFav()), () => {});
  favBtn.addEventListener("click", async () => {
    try {
      fav = await api.favorite(w.id, !fav.favorite);
      renderFav();
      if (fav.favorite) toast("Dodano do ulubionych ⭐", "good");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  });
  renderFav();
  likeBtn.addEventListener("click", () => vote(1));
  dislikeBtn.addEventListener("click", () => vote(-1));
  renderVotes();

  const stat = (label: string, value: string) => h("div", { class: "pv-stat" }, h("div", { class: "muted" }, label), h("b", null, value));
  const fmt = new Intl.NumberFormat("pl-PL");
  el.replaceChildren(
    h("button", { class: "pv-back", onClick: () => ctx.back() }, icon("back", 20), "Wróć"),
    h(
      "div",
      { class: "pv-game-top" },
      thumb(w, "pv-game-thumb"),
      h(
        "div",
        { class: "pv-game-side" },
        h("h1", null, w.name),
        h(
          "div",
          { class: "muted" },
          "Twórca: ",
          h("a", { href: "#", class: "pv-link", onClick: (e: Event) => (e.preventDefault(), ctx.nav({ v: "profile", name: w.ownerName })) }, w.ownerName),
        ),
        findGenre(w.genre)
          ? h("button", { class: "pv-genre-tag", onClick: () => ctx.nav({ v: "charts", genre: w.genre }) }, `${findGenre(w.genre)!.icon} ${findGenre(w.genre)!.label}`)
          : null,
        h(
          "button",
          {
            class: "pv-play",
            title: "Graj",
            onClick: () => ctx.go("play", { worldId: w.id, back: { screen: "home", params: { tab: "game", worldId: w.id } } }),
          },
          icon("play", 34),
        ),
        h("div", { class: "pv-votes" }, likeBtn, bar, dislikeBtn),
        h("div", { class: "pv-game-extra" }, favBtn, mine ? null : h("button", { class: "btn small ghost", onClick: () => reportDialog("world", w.id, w.name) }, "⚑ Zgłoś")),
        mine
          ? h("button", { class: "btn", onClick: () => ctx.go("studio", { worldId: w.id }) }, icon("edit", 18), " Edytuj w Studio")
          : null,
      ),
    ),
    h(
      "div",
      { class: "pv-stats" },
      stat("Aktywni", fmt.format(w.playing)),
      stat("Wizyty", fmt.format(w.visits)),
      stat("Serwer", `${w.maxPlayers} graczy`),
      stat("Aktualizacja", new Date(w.updatedAt).toLocaleDateString("pl-PL")),
    ),
    h("h2", null, "Opis"),
    h("p", { class: "pv-desc" }, w.description || "Twórca nie dodał jeszcze opisu."),
    w.published ? privateServersSection(w, ctx) : "",
    ...(w.products?.length
      ? [h("h2", null, "Sklep gry"), h(
          "div",
          { class: "pv-badges" },
          w.products.map((p) =>
            h(
              "div",
              { class: "pv-badge-card" + (p.owned ? " mine" : "") },
              h("div", { class: "pv-badge-ic shop" }, p.icon || "🛍️"),
              h(
                "div",
                { class: "pv-badge-main" },
                h("b", null, p.name),
                p.description ? h("div", { class: "muted small" }, p.description) : null,
                h("div", { class: "small" }, p.owned ? "✅ Masz to" : `🪙 ${p.price}${p.kind === "item" ? " · można kupować wiele razy" : ""}`),
              ),
            ),
          ),
        ), h("p", { class: "muted small" }, "Kupujesz w grze - przycisk 🛒 na górze ekranu.")]
      : []),
    ...(w.badges?.length
      ? [h("h2", null, "Odznaki"), h(
          "div",
          { class: "pv-badges" },
          w.badges.map((b) =>
            h(
              "div",
              { class: "pv-badge-card" + (b.mine ? " mine" : "") },
              h("div", { class: "pv-badge-ic" }, b.icon || "🏅"),
              h(
                "div",
                { class: "pv-badge-main" },
                h("b", null, b.name),
                h("div", { class: "muted small" }, b.description || (b.trigger === "join" ? "Wejdź do gry" : "")),
                h(
                  "div",
                  { class: "small" },
                  b.mine ? "✅ Masz ją · " : "",
                  `Zdobyło: ${fmt.format(b.earned)}`,
                  b.reward ? ` · Nagroda: ${b.reward} 🪙` : "",
                ),
              ),
            ),
          ),
        )]
      : []),
  );
}

export function timeAgo(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "teraz";
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} godz.`;
  return new Date(at).toLocaleDateString("pl-PL");
}

// =====================================================================
// Panel admina (wczytywany osobno)
// =====================================================================

async function adminView(el: HTMLElement) {
  el.append(h("h1", null, "Panel admina"));
  if (!session.user?.admin) return void el.append(h("div", { class: "pv-empty" }, "Brak dostępu"));
  const box = h("div", null, loading());
  el.append(box);
  try {
    const { adminPanel } = await import("./adminPanel.ts");
    if (!box.isConnected) return;
    box.replaceChildren();
    adminPanel(box);
  } catch (e) {
    box.replaceChildren(errorBox(e));
  }
}

// =====================================================================
// Awatar (wczytywany osobno - potrzebuje silnika 3D)
// =====================================================================

async function avatarView(el: HTMLElement) {
  el.append(h("h1", null, "Awatar"));
  const box = h("div", null, loading());
  el.append(box);
  try {
    const { avatarEditor } = await import("./avatarEditor.ts");
    if (!box.isConnected) return;
    box.replaceChildren();
    return avatarEditor(box);
  } catch (e) {
    box.replaceChildren(errorBox(e));
  }
}

// =====================================================================
// Czat
// =====================================================================

export function timeLabel(at: number) {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

async function chatListView(el: HTMLElement, ctx: Ctx) {
  el.append(h("h1", null, "Czat"));
  const list = h("div", { class: "pv-list" }, loading());
  el.append(list);
  const load = async () => {
    try {
      const [convs, friends] = await Promise.all([api.chat(), api.friends()]);
      const talked = new Set(convs.map((c) => c.friend.id));
      const others = friends.filter((f) => f.status === "accepted" && !talked.has(f.id));
      const rows: Node[] = convs.map((c) =>
        h(
          "button",
          { class: "pv-row", onClick: () => ctx.nav({ v: "chat", with: c.friend.id }) },
          h("span", { class: "pv-friend-face" }, h("img", { class: "pv-head", src: headshot(c.friend.avatar), alt: "" }), c.friend.online ? h("span", { class: "pv-dot" }) : null),
          h(
            "div",
            { class: "pv-row-main" },
            h("div", { class: "pv-row-top" }, h("b", null, c.friend.username), h("span", { class: "muted small" }, timeLabel(c.last.at))),
            h("div", { class: "pv-row-sub" + (c.unread ? " unread" : "") }, (c.last.fromMe ? "Ty: " : "") + c.last.text),
          ),
          c.unread ? h("span", { class: "pv-badge inline" }, String(c.unread)) : null,
        ),
      );
      if (others.length) {
        rows.push(h("h3", { class: "pv-list-title" }, "Napisz do znajomego"));
        rows.push(h("div", { class: "pv-friends-row" }, others.map((f) => friendBubble(f, () => ctx.nav({ v: "chat", with: f.id })))));
      }
      if (!rows.length)
        rows.push(
          h(
            "div",
            { class: "pv-empty" },
            icon("chat", 36),
            "Tu pojawią się rozmowy ze znajomymi.",
            h("button", { class: "btn primary", onClick: () => ctx.nav({ v: "friends" }) }, "Dodaj znajomych"),
          ),
        );
      list.replaceChildren(...rows);
    } catch (e) {
      list.replaceChildren(errorBox(e, load));
    }
  };
  await load();
  const timer = setInterval(load, 10_000);
  return () => clearInterval(timer);
}

async function conversationView(el: HTMLElement, ctx: Ctx, friendId: number) {
  const friends = await api.friends().catch(() => [] as FriendInfo[]);
  const f = friends.find((x) => x.id === friendId && x.status === "accepted");
  if (!f) {
    el.append(h("button", { class: "pv-back", onClick: () => ctx.back() }, icon("back", 20), "Wróć"), h("div", { class: "pv-empty" }, "Możesz pisać tylko ze znajomymi."));
    return;
  }
  el.classList.add("convo-open");
  const log = h("div", { class: "pv-msgs" });
  const input = h("input", { placeholder: "Napisz wiadomość…", maxLength: 200, enterKeyHint: "send" });
  const sendBtn = h("button", { class: "pv-send", title: "Wyślij" }, icon("send", 22));
  let lastId = 0;
  let lastDay = "";
  const add = (m: ChatMessage) => {
    if (m.id <= lastId) return;
    lastId = m.id;
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      log.append(h("div", { class: "pv-msg-day" }, new Date(m.at).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })));
    }
    log.append(h("div", { class: "pv-msg " + (m.fromMe ? "me" : "them") }, h("span", null, m.text), h("small", null, timeLabel(m.at))));
  };
  const scrollDown = () => (log.scrollTop = log.scrollHeight);
  const poll = async () => {
    try {
      const list = await api.chatWith(friendId, lastId);
      if (list.some((m) => !m.fromMe)) ctx.refreshBadges(); // przeczytane - znika czerwona kropka
      if (list.length) {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
        list.forEach(add);
        if (atBottom) scrollDown();
      }
    } catch {
      /* spróbujemy znowu */
    }
  };
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      add(await api.sendChat(friendId, text));
      scrollDown();
    } catch (e) {
      input.value = text;
      toast((e as Error).message, "error");
    }
    input.focus();
  };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => e.key === "Enter" && send());

  el.append(
    h(
      "div",
      { class: "pv-convo" },
      h(
        "div",
        { class: "pv-convo-head" },
        h("button", { class: "pv-icon-btn", title: "Wróć", onClick: () => ctx.back() }, icon("back")),
        h("span", { class: "pv-friend-face" }, h("img", { class: "pv-head small", src: headshot(f.avatar), alt: "" }), f.online ? h("span", { class: "pv-dot" }) : null),
        h("div", null, h("b", null, f.username), h("div", { class: "muted small" }, f.playing ? `Gra w: ${f.playing.worldName}` : f.online ? "Online" : "Offline")),
        h("div", { class: "spacer" }),
        f.playing
          ? h("button", { class: "btn small green", onClick: () => ctx.go("play", { worldId: f.playing!.worldId, roomId: f.playing!.roomId }) }, "Dołącz")
          : null,
      ),
      log,
      h("div", { class: "pv-compose" }, input, sendBtn),
    ),
  );
  await poll();
  if (!lastId) log.append(h("div", { class: "pv-msg-day" }, `Przywitaj się z ${f.username}!`));
  scrollDown();
  const timer = setInterval(poll, 3000);
  return () => clearInterval(timer);
}

// =====================================================================
// Znajomi
// =====================================================================

async function friendsView(el: HTMLElement, ctx: Ctx) {
  const input = h("input", { placeholder: "Wpisz nick gracza", maxLength: 20 });
  const list = h("div", { class: "pv-list" }, loading());
  const add = async () => {
    if (!input.value.trim()) return;
    try {
      const r = await api.addFriend(input.value.trim());
      toast(r.accepted ? "Jesteście teraz znajomymi!" : "Wysłano zaproszenie", "good");
      input.value = "";
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && add());
  el.append(
    h("h1", null, "Znajomi"),
    h("div", { class: "pv-add-friend" }, h("label", { class: "pv-search" }, icon("userPlus", 18), input), h("button", { class: "btn primary", onClick: add }, "Dodaj")),
    list,
  );

  const row = (f: FriendInfo) => {
    const actions: Node[] = [];
    const small = (label: string, kind: string, fn: () => void) => h("button", { class: "btn small " + kind, onClick: (e: Event) => (e.stopPropagation(), fn()) }, label);
    if (f.status === "incoming") {
      actions.push(
        small("Akceptuj", "primary", async () => (await api.acceptFriend(f.id), refresh())),
        small("Odrzuć", "", async () => (await api.removeFriend(f.id), refresh())),
      );
    } else if (f.status === "outgoing") {
      actions.push(small("Anuluj", "", async () => (await api.removeFriend(f.id), refresh())));
    } else {
      if (f.playing) {
        const p = f.playing;
        actions.push(small("Dołącz", "green", () => ctx.go("play", { worldId: p.worldId, roomId: p.roomId })));
      }
      actions.push(
        h("button", { class: "pv-icon-btn", title: "Napisz", onClick: (e: Event) => (e.stopPropagation(), ctx.nav({ v: "chat", with: f.id })) }, icon("chat", 20)),
        h(
          "button",
          {
            class: "pv-icon-btn",
            title: "Usuń ze znajomych",
            onClick: async (e: Event) => {
              e.stopPropagation();
              if (await ask(`Usunąć ${f.username} ze znajomych?`, "Usuń", "Anuluj", true)) {
                await api.removeFriend(f.id);
                refresh();
              }
            },
          },
          icon("trash", 20),
        ),
      );
    }
    const status =
      f.status === "incoming"
        ? "Chce zostać twoim znajomym"
        : f.status === "outgoing"
          ? "Zaproszenie wysłane"
          : f.playing
            ? `Gra w: ${f.playing.worldName}`
            : f.online
              ? "Online"
              : "Offline";
    return h(
      "div",
      { class: "pv-row", onClick: () => f.status === "accepted" && friendMenu(f, ctx) },
      h("span", { class: "pv-friend-face" }, h("img", { class: "pv-head", src: headshot(f.avatar), alt: "" }), f.online && f.status === "accepted" ? h("span", { class: "pv-dot" }) : null),
      h("div", { class: "pv-row-main" }, h("b", null, f.username), h("div", { class: "pv-row-sub" + (f.playing ? " playing" : "") }, status)),
      h("div", { class: "pv-row-actions" }, actions),
    );
  };

  const refresh = async () => {
    try {
      const friends = await api.friends();
      const incoming = friends.filter((f) => f.status === "incoming");
      const accepted = friends.filter((f) => f.status === "accepted");
      const outgoing = friends.filter((f) => f.status === "outgoing");
      list.replaceChildren(
        incoming.length ? h("h3", { class: "pv-list-title" }, `Zaproszenia (${incoming.length})`) : "",
        ...incoming.map(row),
        h("h3", { class: "pv-list-title" }, `Znajomi (${accepted.length})`),
        ...(accepted.length ? accepted.map(row) : [h("div", { class: "pv-empty small" }, "Dodaj znajomych po nicku, żeby razem grać i pisać.")]),
        outgoing.length ? h("h3", { class: "pv-list-title" }, "Wysłane zaproszenia") : "",
        ...outgoing.map(row),
      );
    } catch (e) {
      list.replaceChildren(errorBox(e, refresh));
    }
  };
  await refresh();
  const timer = setInterval(refresh, 10_000);
  return () => clearInterval(timer);
}

// =====================================================================
// Twórz
// =====================================================================

async function createView(el: HTMLElement, ctx: Ctx) {
  const newGame = () => {
    const input = h("input", { placeholder: "Nazwa gry", maxLength: 40, value: "Moja gra" });
    let mode: "3d" | "2d" | "2dtop" | "blocks" = "3d";
    const pick = h("div", { class: "mode-pick" });
    const renderPick = () =>
      pick.replaceChildren(
        ...(
          [
            ["3d", "🧱", "Gra 3D", "Klocki, postacie, narzędzia - jak w Robloxie"],
            ["2d", "🎮", "Gra 2D", "Platformówka z obrazków: skakanie, monety, poziomy"],
            ["2dtop", "🗺️", "Gra 2D z góry", "Widok z góry jak w RPG: chodzenie w 4 strony"],
            ["blocks", "⛏️", "Świat z bloków", "Jak Minecraft: kopanie, crafting, noc z potworami"],
          ] as const
        ).map(([m, icon, label, desc]) =>
          h(
            "button",
            { class: "mode-card" + (mode === m ? " active" : ""), onClick: () => ((mode = m), renderPick()) },
            h("span", { class: "mode-icon" }, icon),
            h("b", null, label),
            h("span", null, desc),
          ),
        ),
      );
    renderPick();
    const close = modal("Nowa gra", h("div", { class: "form" }, h("label", null, "Nazwa", input), pick), [
      {
        label: "Utwórz",
        kind: "primary",
        onClick: async () => {
          try {
            const w = await api.createWorld(input.value, mode);
            close();
            ctx.go("studio", { worldId: w.id });
          } catch (e) {
            toast((e as Error).message, "error");
          }
        },
      },
    ]);
    input.select();
  };
  const openFile = async () => {
    const f = await pickFile([GAME_EXT], "Gra Predator");
    if (!f) return;
    try {
      const { data, ...meta } = parseGameFile(f.text);
      ctx.go("studio", { file: { meta, data, path: f.path, fileName: f.name } });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  el.append(
    h("h1", null, "Twórz"),
    h(
      "div",
      { class: "pv-create-actions" },
      h("button", { class: "pv-create-card primary", onClick: newGame }, icon("plus", 28), h("b", null, "Nowa gra"), h("span", null, "Zacznij w Predator Studio")),
      h("button", { class: "pv-create-card", onClick: openFile }, icon("folder", 28), h("b", null, "Otwórz plik"), h("span", null, `Gra zapisana jako ${GAME_EXT}`)),
      h("button", { class: "pv-create-card", onClick: () => ctx.go("offline") }, icon("offline", 28), h("b", null, "Bez serwera"), h("span", null, "Szablony i test offline")),
    ),
    h("p", { class: "muted" }, `Buduj w edytorze, pisz skrypty w Lua albo układaj bloczki i opublikuj grę. Domyślnie do ${DEFAULT_MAX_PLAYERS} graczy na serwer.`),
    sectionHead("Twoje gry"),
  );
  const out = h("div", null, loading());
  el.append(out);
  try {
    const list = await api.myWorlds();
    out.replaceChildren(
      list.length
        ? h(
            "div",
            { class: "g-grid" },
            list.map((w) =>
              gameCard(
                w,
                () => ctx.go("studio", { worldId: w.id }),
                h(
                  "div",
                  { class: "g-actions" },
                  w.coEditor
                    ? h("span", { class: "pv-pill co", title: `Twórca: ${w.ownerName}` }, "👥 Współtworzysz")
                    : h("span", { class: "pv-pill " + (w.published ? "on" : "") }, w.published ? "Publiczna" : "Prywatna"),
                  h(
                    "button",
                    { class: "pv-icon-btn", title: "Strona gry", onClick: (e: Event) => (e.stopPropagation(), ctx.nav({ v: "game", id: w.id })) },
                    icon("play", 18),
                  ),
                ),
              ),
            ),
          )
        : h("div", { class: "pv-empty" }, icon("build", 36), "Nie masz jeszcze żadnych gier.", h("button", { class: "btn primary", onClick: newGame }, "Stwórz pierwszą")),
    );
  } catch (e) {
    out.replaceChildren(errorBox(e));
  }
}
