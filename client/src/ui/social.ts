// Społeczność: profil gracza, grupy (klany), wymiany przedmiotów, zgłoszenia i prywatne serwery.
import { findItem, RARITY_LABELS, type CatalogItem } from "../../../shared/catalog.ts";
import {
  GROUP_COLORS,
  GROUP_ICONS,
  GROUP_PRICE,
  REPORT_REASONS,
  type GroupInfo,
  type GroupMessage,
  type PlayerProfile,
  type PrivateServerInfo,
  type TradeInfo,
  type WorldInfo,
} from "../../../shared/types.ts";
import { api } from "../api.ts";
import { session } from "../state.ts";
import { safety } from "../safety.ts";
import { ask, h, modal, toast } from "./dom.ts";
import { portrait } from "./headshot.ts";
import { errorBox, gameGrid, loading, timeAgo, timeLabel, type Ctx } from "./home.ts";
import { icon } from "./icons.ts";

const fmtDate = (at: number) => new Date(at).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
const back = (ctx: Ctx) => h("button", { class: "pv-back", onClick: () => ctx.back() }, icon("back", 20), "Wróć");

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

// =====================================================================
// Zgłoszenia
// =====================================================================

export function reportDialog(kind: "user" | "world" | "group", targetId: number, name: string) {
  const reason = h("select", null, h("option", { value: "" }, "— wybierz powód —"), REPORT_REASONS.map((r) => h("option", { value: r }, r)));
  const text = h("textarea", { rows: 3, maxLength: 300, placeholder: "Co się stało? (nieobowiązkowe)" });
  const what = kind === "user" ? "gracza" : kind === "world" ? "grę" : "grupę";
  const close = modal(
    `Zgłoś ${what}: ${name}`,
    h(
      "div",
      { class: "form" },
      h("p", { class: "muted", style: "margin:0;font-size:13px" }, "Zgłoszenie trafi do administratorów. Nikt inny nie zobaczy, że to Ty zgłosiłeś."),
      h("label", null, "Powód", reason),
      h("label", null, "Opis", text),
    ),
    [
      { label: "Anuluj", onClick: () => close() },
      {
        label: "Wyślij zgłoszenie",
        kind: "danger",
        onClick: async () => {
          if (!reason.value) return toast("Wybierz powód", "error");
          if (await run(api.report(kind, targetId, reason.value, text.value), "Dziękujemy! Administrator sprawdzi zgłoszenie.")) close();
        },
      },
    ],
  );
}

// =====================================================================
// Profil gracza
// =====================================================================

export function groupEmblem(g: { icon: string; color: string }, size = 48) {
  return h("span", { class: "grp-emblem", style: `--c:${g.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px` }, g.icon);
}

export async function profileView(el: HTMLElement, ctx: Ctx, name: string) {
  el.append(back(ctx), loading());
  let p: PlayerProfile;
  try {
    p = await api.profile(name);
  } catch (e) {
    el.replaceChildren(back(ctx), errorBox(e));
    return;
  }
  const render = () => {
    const actions: Node[] = [];
    if (p.friendStatus === "me") actions.push(h("button", { class: "btn primary", onClick: () => ctx.nav({ v: "avatar" }) }, "Edytuj awatar"));
    if (p.friendStatus === "none")
      actions.push(
        h(
          "button",
          {
            class: "btn primary",
            onClick: async () => {
              const r = await run(api.addFriend(p.username), "Wysłano zaproszenie");
              if (r) ((p.friendStatus = r.accepted ? "friends" : "outgoing"), render());
            },
          },
          icon("userPlus", 18),
          " Dodaj do znajomych",
        ),
      );
    if (p.friendStatus === "outgoing") actions.push(h("button", { class: "btn", disabled: true }, "Zaproszenie wysłane"));
    if (p.friendStatus === "incoming")
      actions.push(
        h(
          "button",
          { class: "btn primary", onClick: async () => (await run(api.acceptFriend(p.id), "Jesteście znajomymi!")) !== null && ((p.friendStatus = "friends"), render()) },
          "Akceptuj zaproszenie",
        ),
      );
    if (p.friendStatus === "friends") {
      if (p.playing && !p.playing.private)
        actions.push(h("button", { class: "btn green", onClick: () => ctx.go("play", { worldId: p.playing!.worldId, roomId: p.playing!.roomId }) }, "Dołącz do gry"));
      actions.push(h("button", { class: "btn", onClick: () => ctx.nav({ v: "chat", with: p.id }) }, icon("chat", 18), " Napisz"));
      actions.push(h("button", { class: "btn", onClick: () => newTradeDialog(p.username, () => ctx.nav({ v: "trades" })) }, "🔁 Wymiana"));
    }
    if (p.friendStatus !== "me") {
      actions.push(h("button", { class: "btn small ghost", onClick: () => reportDialog("user", p.id, p.username) }, "⚑ Zgłoś"));
      const blocked = safety.isBlocked(p.id);
      actions.push(
        h(
          "button",
          {
            class: "btn small ghost",
            onClick: async () => {
              if (!blocked && !(await ask(`Zablokować ${p.username}? Przestaniecie być znajomymi, nie będzie mógł(a) do Ciebie pisać, zapraszać Cię ani rozmawiać z Tobą głosowo.`, "Zablokuj", "Anuluj", true))) return;
              if (await run(blocked ? api.unblock(p.id) : api.block(p.id), blocked ? "Odblokowano" : "🚫 Zablokowano")) {
                if (!blocked && p.friendStatus !== "none") p.friendStatus = "none";
                render();
              }
            },
          },
          blocked ? "Odblokuj" : "🚫 Zablokuj",
        ),
      );
    }

    const stat = (label: string, v: number | string) => h("div", { class: "prof-stat" }, h("b", null, String(v)), h("span", { class: "muted" }, label));
    el.replaceChildren(
      back(ctx),
      h(
        "div",
        { class: "prof-head" },
        h("img", { class: "pv-head prof-face", src: portrait(p.avatar), alt: "" }),
        h(
          "div",
          { class: "prof-main" },
          h(
            "h1",
            null,
            p.username,
            p.admin ? h("span", { class: "adm-tag" }, "ADMIN") : null,
            p.banned ? h("span", { class: "adm-tag bad" }, "ZABLOKOWANY") : null,
          ),
          h(
            "div",
            { class: "muted" },
            p.online ? h("span", { class: "prof-online" }, p.playing ? `● Gra w: ${p.playing.worldName}` : "● Online") : null,
            p.online ? " · " : null,
            `Na Predatorze od ${fmtDate(p.createdAt)}`,
          ),
          h("div", { class: "prof-stats" }, stat("Znajomi", p.friends), stat("Odznaki", p.badges.length), stat("Grupy", p.groups.length), stat("Przedmioty", p.items)),
          h("div", { class: "prof-actions" }, actions),
        ),
      ),
      h("h2", null, "Odznaki"),
      p.badges.length
        ? h(
            "div",
            { class: "prof-badges" },
            p.badges.map((b) =>
              h(
                "button",
                { class: "prof-badge", title: `${b.name} - ${b.worldName} (${fmtDate(b.earnedAt)})`, onClick: () => ctx.nav({ v: "game", id: b.worldId }) },
                h("span", { class: "pv-badge-ic mine" }, b.icon),
                h("b", null, b.name),
                h("span", { class: "muted small" }, b.worldName),
              ),
            ),
          )
        : h("p", { class: "muted" }, "Jeszcze nie ma odznak - zdobywa się je w grach."),
      h("h2", null, "Grupy"),
      p.groups.length
        ? h(
            "div",
            { class: "prof-groups" },
            p.groups.map((g) =>
              h("button", { class: "prof-group", onClick: () => ctx.nav({ v: "group", id: g.id }) }, groupEmblem(g, 40), h("b", null, g.name), h("span", { class: "muted small" }, roleLabel(g.role))),
            ),
          )
        : h("p", { class: "muted" }, "Nie należy do żadnej grupy."),
      h("h2", null, "Ulubione gry"),
      gameGrid(p.favorites, ctx, "Brak ulubionych gier."),
      p.creations.length ? h("h2", null, "Gry twórcy") : "",
      p.creations.length ? gameGrid(p.creations, ctx, "") : "",
    );
  };
  render();
}

const roleLabel = (r: string | null) => (r === "owner" ? "👑 Właściciel" : r === "admin" ? "⭐ Zastępca" : r === "member" ? "Członek" : "");

// =====================================================================
// Grupy
// =====================================================================

function groupCard(g: GroupInfo, ctx: Ctx) {
  return h(
    "button",
    { class: "grp-card", onClick: () => ctx.nav({ v: "group", id: g.id }) },
    groupEmblem(g, 56),
    h(
      "div",
      { class: "grp-card-main" },
      h("b", null, g.name),
      h("div", { class: "muted small" }, `${g.members} ${g.members === 1 ? "członek" : "członków"}`, g.myRole ? " · " + roleLabel(g.myRole) : ""),
      g.description ? h("div", { class: "grp-card-desc" }, g.description) : null,
    ),
  );
}

export async function groupsView(el: HTMLElement, ctx: Ctx) {
  const mine = h("div", { class: "grp-list" }, loading());
  const found = h("div", { class: "grp-list" });
  const q = h("input", { type: "search", placeholder: "Szukaj grup…", maxLength: 30 });
  let timer = 0;
  const search = async () => {
    found.replaceChildren(loading());
    try {
      const list = await api.groups(q.value.trim());
      found.replaceChildren(...(list.length ? list.map((g) => groupCard(g, ctx)) : [h("div", { class: "muted" }, "Nie znaleziono grup.")]));
    } catch (e) {
      found.replaceChildren(errorBox(e, search));
    }
  };
  q.addEventListener("input", () => (clearTimeout(timer), (timer = window.setTimeout(search, 300))));
  el.append(
    h(
      "div",
      { class: "pv-section-head" },
      h("h1", null, "Grupy"),
      h("button", { class: "btn primary", onClick: () => createGroupDialog(ctx) }, "+ Utwórz grupę"),
    ),
    h("h2", null, "Moje grupy"),
    mine,
    h("h2", null, "Znajdź grupę"),
    h("label", { class: "pv-search" }, icon("search", 18), q),
    found,
  );
  try {
    const list = await api.myGroups();
    mine.replaceChildren(
      ...(list.length ? list.map((g) => groupCard(g, ctx)) : [h("div", { class: "muted" }, "Nie należysz jeszcze do żadnej grupy. Dołącz albo załóż własną!")]),
    );
  } catch (e) {
    mine.replaceChildren(errorBox(e));
  }
  search();
  return () => clearTimeout(timer);
}

function emblemPicker(initial: { icon: string; color: string }) {
  const cur = { ...initial };
  const preview = h("div", { class: "grp-pick-preview" });
  const icons = h("div", { class: "grp-pick-icons" });
  const colors = h("div", { class: "grp-pick-colors" });
  const render = () => {
    preview.replaceChildren(groupEmblem(cur, 72));
    icons.replaceChildren(
      ...GROUP_ICONS.map((i) => h("button", { type: "button", class: "grp-pick-icon" + (i === cur.icon ? " on" : ""), onClick: () => ((cur.icon = i), render()) }, i)),
    );
    colors.replaceChildren(
      ...GROUP_COLORS.map((c) =>
        h("button", { type: "button", class: "grp-pick-color" + (c === cur.color ? " on" : ""), style: `background:${c}`, onClick: () => ((cur.color = c), render()) }),
      ),
    );
  };
  render();
  return { el: h("div", { class: "grp-pick" }, preview, h("div", null, icons, colors)), value: cur };
}

function createGroupDialog(ctx: Ctx) {
  const name = h("input", { maxLength: 30, placeholder: "np. Smocza Drużyna" });
  const desc = h("textarea", { rows: 3, maxLength: 300, placeholder: "O czym jest grupa?" });
  const pick = emblemPicker({ icon: GROUP_ICONS[0], color: GROUP_COLORS[0] });
  const close = modal(
    "Nowa grupa",
    h(
      "div",
      { class: "form" },
      h("label", null, "Nazwa", name),
      h("label", null, "Opis", desc),
      h("div", { class: "prop-group" }, "Logo"),
      pick.el,
      h("p", { class: "muted", style: "margin:0;font-size:13px" }, `Założenie grupy kosztuje ${GROUP_PRICE} monet.`),
    ),
    [
      { label: "Anuluj", onClick: () => close() },
      {
        label: `Utwórz (${GROUP_PRICE} 🪙)`,
        kind: "primary",
        onClick: async () => {
          const r = await run(api.createGroup({ name: name.value.trim(), description: desc.value, icon: pick.value.icon, color: pick.value.color }), "Grupa utworzona!");
          if (!r) return;
          if (session.user) session.set({ ...session.user, coins: r.coins });
          close();
          ctx.nav({ v: "group", id: r.group.id });
        },
      },
    ],
  );
  setTimeout(() => name.focus(), 30);
}

export async function groupView(el: HTMLElement, ctx: Ctx, id: number): Promise<() => void> {
  let timer = 0;
  const cleanup = () => clearInterval(timer);
  el.append(back(ctx), loading());
  let data: Awaited<ReturnType<typeof api.group>>;
  const load = async () => (data = await api.group(id));
  try {
    await load();
  } catch (e) {
    el.replaceChildren(back(ctx), errorBox(e));
    return cleanup;
  }
  let tab: "chat" | "members" = data!.group.myRole ? "chat" : "members";
  const body = h("div", { class: "grp-body" });

  const render = () => {
    clearInterval(timer);
    const g = data.group;
    const role = g.myRole;
    const actions: Node[] = [];
    if (!role) actions.push(h("button", { class: "btn primary", onClick: async () => (await run(api.joinGroup(g.id), "Dołączono do grupy!")) && (await load(), (tab = "chat"), render()) }, "Dołącz"));
    if (role && role !== "owner")
      actions.push(
        h(
          "button",
          { class: "btn", onClick: async () => (await ask(`Wyjść z grupy ${g.name}?`, "Wyjdź")) && (await run(api.leaveGroup(g.id))) && (await load(), render()) },
          "Wyjdź z grupy",
        ),
      );
    if (role === "owner") {
      actions.push(h("button", { class: "btn", onClick: () => editGroupDialog(g, async () => (await load(), render())) }, icon("edit", 16), " Edytuj"));
      actions.push(
        h(
          "button",
          {
            class: "btn danger",
            onClick: async () => {
              if (!(await ask(`Usunąć grupę ${g.name} na zawsze? Wszyscy członkowie i czat znikną.`, "Usuń", "Anuluj", true))) return;
              if (await run(api.deleteGroup(g.id), "Usunięto grupę")) ctx.back();
            },
          },
          "Usuń",
        ),
      );
    }
    if (role !== "owner") actions.push(h("button", { class: "btn small ghost", onClick: () => reportDialog("group", g.id, g.name) }, "⚑ Zgłoś"));

    el.replaceChildren(
      back(ctx),
      h(
        "div",
        { class: "grp-head", style: `--c:${g.color}` },
        groupEmblem(g, 96),
        h(
          "div",
          { class: "grp-head-main" },
          h("h1", null, g.name),
          h(
            "div",
            { class: "muted" },
            "Właściciel: ",
            h("a", { href: "#", onClick: (e: Event) => (e.preventDefault(), ctx.nav({ v: "profile", name: g.ownerName })) }, g.ownerName),
            ` · ${g.members} ${g.members === 1 ? "członek" : "członków"} · od ${fmtDate(g.createdAt)}`,
          ),
          g.description ? h("p", { class: "grp-desc" }, g.description) : null,
          h("div", { class: "prof-actions" }, actions),
        ),
      ),
      h(
        "div",
        { class: "pv-chips" },
        role ? h("button", { class: "pv-chip" + (tab === "chat" ? " active" : ""), onClick: () => ((tab = "chat"), render()) }, "💬 Czat grupy") : null,
        h("button", { class: "pv-chip" + (tab === "members" ? " active" : ""), onClick: () => ((tab = "members"), render()) }, `👥 Członkowie (${g.members})`),
      ),
      body,
    );
    if (tab === "chat" && role) groupChat(body, g, (t) => (timer = t));
    else membersList(body, ctx, async () => (await load(), render()));
  };

  const membersList = (box: HTMLElement, ctx: Ctx, reload: () => void) => {
    const g = data.group;
    const myId = session.user!.id;
    box.replaceChildren(
      h(
        "div",
        { class: "pv-list" },
        data.members.map((m) => {
          const acts: Node[] = [];
          const canKick = (g.myRole === "owner" && m.role !== "owner") || (g.myRole === "admin" && m.role === "member");
          if (g.myRole === "owner" && m.role === "member")
            acts.push(h("button", { class: "btn small", onClick: async () => (await run(api.groupMember(g.id, m.id, "admin"), "Nadano zastępcę")) !== null && reload() }, "⭐ Zastępca"));
          if (g.myRole === "owner" && m.role === "admin")
            acts.push(h("button", { class: "btn small", onClick: async () => (await run(api.groupMember(g.id, m.id, "member"))) !== null && reload() }, "Odbierz"));
          if (canKick && m.id !== myId)
            acts.push(
              h(
                "button",
                {
                  class: "btn small danger",
                  onClick: async () => (await ask(`Wyrzucić ${m.username} z grupy?`, "Wyrzuć", "Anuluj", true)) && (await run(api.groupMember(g.id, m.id, "kick"))) !== null && reload(),
                },
                "Wyrzuć",
              ),
            );
          return h(
            "div",
            { class: "pv-row" },
            h(
              "button",
              { class: "grp-member", onClick: () => ctx.nav({ v: "profile", name: m.username }) },
              h("span", { class: "pv-friend-face" }, h("img", { class: "pv-head small", src: portrait(m.avatar), alt: "" }), m.online ? h("span", { class: "pv-dot" }) : null),
              h("div", null, h("b", null, m.username), h("div", { class: "muted small" }, roleLabel(m.role))),
            ),
            h("div", { class: "spacer" }),
            ...acts,
          );
        }),
      ),
    );
  };

  render();
  return cleanup;
}

function groupChat(box: HTMLElement, g: GroupInfo, setTimer: (t: number) => void) {
  const log = h("div", { class: "pv-msgs grp-msgs" });
  const input = h("input", { placeholder: "Napisz do grupy…", maxLength: 200, enterKeyHint: "send" });
  const sendBtn = h("button", { class: "pv-send", title: "Wyślij" }, icon("send", 22));
  const myId = session.user!.id;
  const canMod = g.myRole === "owner" || g.myRole === "admin";
  let lastId = 0;
  const add = (m: GroupMessage) => {
    if (m.id <= lastId) return;
    lastId = m.id;
    const mine = m.userId === myId;
    const row = h(
      "div",
      { class: "grp-msg " + (mine ? "me" : "them") },
      mine ? null : h("img", { class: "pv-head tiny", src: portrait(m.avatar), alt: "" }),
      h(
        "div",
        { class: "pv-msg " + (mine ? "me" : "them") },
        mine ? null : h("b", { class: "grp-msg-name" }, m.username),
        h("span", null, m.text),
        h("small", null, timeLabel(m.at)),
      ),
      canMod
        ? h(
            "button",
            { class: "grp-msg-del", title: "Usuń wiadomość", onClick: async () => (await run(api.deleteGroupChat(g.id, m.id))) !== null && row.remove() },
            "✕",
          )
        : null,
    );
    log.append(row);
  };
  const poll = async () => {
    try {
      const list = await api.groupChat(g.id, lastId);
      if (list.length) {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
        list.forEach(add);
        if (atBottom) log.scrollTop = log.scrollHeight;
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
      add(await api.sendGroupChat(g.id, text));
      log.scrollTop = log.scrollHeight;
    } catch (e) {
      input.value = text;
      toast((e as Error).message, "error");
    }
    input.focus();
  };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => e.key === "Enter" && send());
  box.replaceChildren(h("div", { class: "grp-chat" }, log, h("div", { class: "pv-compose" }, input, sendBtn)));
  poll().then(() => {
    if (!lastId) log.append(h("div", { class: "pv-msg-day" }, "Napisz pierwszą wiadomość w grupie!"));
    log.scrollTop = log.scrollHeight;
  });
  setTimer(window.setInterval(poll, 3000));
}

function editGroupDialog(g: GroupInfo, done: () => void) {
  const desc = h("textarea", { rows: 3, maxLength: 300, value: g.description });
  const pick = emblemPicker(g);
  const close = modal("Edytuj grupę", h("div", { class: "form" }, h("label", null, "Opis", desc), h("div", { class: "prop-group" }, "Logo"), pick.el), [
    { label: "Anuluj", onClick: () => close() },
    {
      label: "Zapisz",
      kind: "primary",
      onClick: async () => {
        if (await run(api.editGroup(g.id, { description: desc.value, icon: pick.value.icon, color: pick.value.color }), "Zapisano")) {
          close();
          done();
        }
      },
    },
  ]);
}

// =====================================================================
// Wymiany
// =====================================================================

function itemChip(id: string, extra?: Node) {
  const it = findItem(id);
  return h(
    "span",
    { class: "trade-item " + (it?.rarity ?? "common"), title: it ? `${it.name}${it.rarity ? " · " + RARITY_LABELS[it.rarity] : ""}` : id },
    h("span", { class: "trade-item-ic" }, it?.icon ?? "?"),
    h("span", null, it?.name ?? id),
    it?.limited ? h("span", { class: "trade-ltd" }, "LTD") : null,
    extra ?? null,
  );
}

const STATUS_LABEL: Record<TradeInfo["status"], string> = {
  pending: "⏳ Czeka",
  accepted: "✅ Zakończona",
  declined: "❌ Odrzucona",
  cancelled: "Anulowana",
  failed: "⚠️ Nieaktualna",
};

export async function tradesView(el: HTMLElement, ctx: Ctx) {
  const list = h("div", { class: "trade-list" }, loading());
  const load = async () => {
    try {
      const trades = await api.trades();
      list.replaceChildren(...(trades.length ? trades.map(row) : [h("div", { class: "pv-empty" }, "🔁", "Nie masz jeszcze żadnych wymian.")]));
    } catch (e) {
      list.replaceChildren(errorBox(e, load));
    }
  };
  const act = async (t: TradeInfo, action: "accept" | "decline" | "cancel") => {
    const r = await run(api.tradeAction(t.id, action), action === "accept" ? "Wymiana zakończona! 🎉" : undefined);
    if (r?.user) session.set(r.user);
    ctx.refreshBadges();
    load();
  };
  const row = (t: TradeInfo) => {
    const other = t.mine ? t.toName : t.fromName;
    // z mojej perspektywy: co oddaję i co dostaję
    const iGive = t.mine ? t.give : t.want;
    const iGet = t.mine ? t.want : t.give;
    return h(
      "div",
      { class: "trade-card " + t.status },
      h(
        "div",
        { class: "trade-top" },
        h("b", null, t.mine ? `Ty → ${other}` : `${other} → Ty`),
        h("span", { class: "muted small" }, STATUS_LABEL[t.status] + " · " + timeAgo(t.at)),
      ),
      h(
        "div",
        { class: "trade-sides" },
        h("div", null, h("div", { class: "muted small" }, "Oddajesz"), h("div", { class: "trade-items" }, iGive.length ? iGive.map((i) => itemChip(i)) : h("span", { class: "muted" }, "nic"))),
        h("div", { class: "trade-arrow" }, "⇄"),
        h("div", null, h("div", { class: "muted small" }, "Dostajesz"), h("div", { class: "trade-items" }, iGet.length ? iGet.map((i) => itemChip(i)) : h("span", { class: "muted" }, "nic"))),
      ),
      t.status === "pending"
        ? h(
            "div",
            { class: "trade-actions" },
            t.mine
              ? h("button", { class: "btn small", onClick: () => act(t, "cancel") }, "Anuluj")
              : [
                  h("button", { class: "btn small danger", onClick: () => act(t, "decline") }, "Odrzuć"),
                  h(
                    "button",
                    { class: "btn small green", onClick: async () => (await ask(`Przyjąć wymianę z ${other}? Tego nie da się cofnąć.`, "Przyjmij")) && act(t, "accept") },
                    "Przyjmij",
                  ),
                ],
          )
        : null,
    );
  };
  el.append(
    h(
      "div",
      { class: "pv-section-head" },
      h("h1", null, "Wymiany"),
      h(
        "button",
        {
          class: "btn primary",
          onClick: async () => {
            const friends = (await api.friends().catch(() => [])).filter((f) => f.status === "accepted");
            if (!friends.length) return toast("Wymieniać się można tylko ze znajomymi - najpierw dodaj znajomego.", "error");
            const pick = h("select", null, friends.map((f) => h("option", { value: f.username }, f.username)));
            const close = modal("Wymiana z…", h("div", { class: "form" }, h("label", null, "Znajomy", pick)), [
              { label: "Anuluj", onClick: () => close() },
              { label: "Dalej", kind: "primary", onClick: () => (close(), newTradeDialog(pick.value, load)) },
            ]);
          },
        },
        "+ Nowa wymiana",
      ),
    ),
    h("p", { class: "muted" }, "Wymieniaj się przedmiotami ze znajomymi. Darmowych rzeczy nie da się wymieniać. Limitowane przedmioty po wyprzedaniu zdobędziesz już tylko tutaj!"),
    list,
  );
  load();
}

export async function newTradeDialog(friend: string, done: () => void) {
  const mineIds = (session.user?.inventory ?? []).filter((id) => isTradeable(findItem(id)));
  let theirs: string[];
  try {
    theirs = await api.tradeable(friend);
  } catch (e) {
    return toast((e as Error).message, "error");
  }
  const give = new Set<string>();
  const want = new Set<string>();
  const col = (title: string, ids: string[], sel: Set<string>, blocked: Set<string>) => {
    const box = h("div", { class: "trade-pick" });
    const render = () =>
      box.replaceChildren(
        ...(ids.length
          ? ids.map((id) =>
              h(
                "button",
                {
                  type: "button",
                  class: "trade-pick-item" + (sel.has(id) ? " on" : "") + (blocked.has(id) ? " blocked" : ""),
                  title: blocked.has(id) ? "Druga osoba już to ma" : "",
                  onClick: () => {
                    if (blocked.has(id)) return toast("Druga osoba już ma ten przedmiot", "error");
                    if (sel.has(id)) sel.delete(id);
                    else if (sel.size < 8) sel.add(id);
                    render();
                  },
                },
                itemChip(id),
              ),
            )
          : [h("div", { class: "muted small" }, "Brak przedmiotów do wymiany")]),
      );
    render();
    return h("div", null, h("div", { class: "prop-group" }, title), box);
  };
  const theirSet = new Set(theirs);
  const mineSet = new Set(session.user?.inventory ?? []);
  const close = modal(
    `Wymiana z ${friend}`,
    h(
      "div",
      { class: "trade-dialog" },
      col("Dajesz (Twoje)", mineIds, give, theirSet),
      col(`Chcesz (od ${friend})`, theirs, want, mineSet),
    ),
    [
      { label: "Anuluj", onClick: () => close() },
      {
        label: "Wyślij propozycję",
        kind: "primary",
        onClick: async () => {
          if (!give.size && !want.size) return toast("Wybierz przedmioty", "error");
          if (await run(api.proposeTrade(friend, [...give], [...want]), "Wysłano propozycję wymiany")) {
            close();
            done();
          }
        },
      },
    ],
  );
}

const isTradeable = (it: CatalogItem | undefined) => !!it && (it.limited !== undefined || (it.price > 0 && !it.offsale));

// =====================================================================
// Prywatne serwery (na stronie gry)
// =====================================================================

export function privateServersSection(w: WorldInfo, ctx: Ctx) {
  const box = h("div", { class: "ps-list" }, loading());
  const codeIn = h("input", { placeholder: "Kod zaproszenia", maxLength: 6, class: "ps-code-in" });
  const play = (s: PrivateServerInfo) =>
    ctx.go("play", { worldId: s.worldId, privateCode: s.code, back: { screen: "home", params: { tab: "game", worldId: w.id } } });
  const load = async () => {
    try {
      const list = await api.servers(w.id);
      box.replaceChildren(
        ...(list.length
          ? list.map((s) =>
              h(
                "div",
                { class: "ps-row" },
                h("span", { class: "ps-ic" }, "🔒"),
                h(
                  "div",
                  { class: "ps-main" },
                  h("b", null, s.name),
                  h("div", { class: "muted small" }, s.mine ? "Twój serwer" : `Serwer: ${s.ownerName}`, ` · grają: ${s.playing}`),
                  s.mine
                    ? h(
                        "div",
                        { class: "ps-code" },
                        "Kod: ",
                        h("code", null, s.code),
                        h(
                          "button",
                          {
                            class: "btn tiny",
                            onClick: () => navigator.clipboard?.writeText(s.code).then(() => toast("Skopiowano kod", "good"), () => toast("Kod: " + s.code)),
                          },
                          "Kopiuj",
                        ),
                        h("button", { class: "btn tiny", onClick: async () => (await run(api.newServerCode(s.id), "Nowy kod - stary już nie działa")) && load() }, "Nowy kod"),
                        h(
                          "button",
                          { class: "btn tiny danger", onClick: async () => (await ask(`Usunąć serwer ${s.name}?`, "Usuń", "Anuluj", true)) && (await run(api.deleteServer(s.id))) !== null && load() },
                          "Usuń",
                        ),
                      )
                    : null,
                ),
                h("button", { class: "btn small green", onClick: () => play(s) }, "Graj"),
              ),
            )
          : [h("div", { class: "muted small" }, "Brak prywatnych serwerów. Utwórz własny i zaproś znajomych!")]),
      );
    } catch (e) {
      box.replaceChildren(errorBox(e, load));
    }
  };
  load();
  return h(
    "div",
    { class: "ps" },
    h(
      "div",
      { class: "pv-section-head" },
      h("h2", null, "🔒 Prywatne serwery"),
      h(
        "button",
        {
          class: "btn small",
          onClick: async () => {
            const name = h("input", { maxLength: 30, value: `Serwer ${session.user!.username}` });
            const close = modal(
              "Nowy prywatny serwer",
              h(
                "div",
                { class: "form" },
                h("label", null, "Nazwa", name),
                h("p", { class: "muted", style: "margin:0;font-size:13px" }, "Wejść mogą Twoi znajomi i każdy, komu podasz kod zaproszenia."),
              ),
              [
                { label: "Anuluj", onClick: () => close() },
                { label: "Utwórz", kind: "primary", onClick: async () => (await run(api.createServer(w.id, name.value), "Utworzono serwer")) && (close(), load()) },
              ],
            );
          },
        },
        "+ Utwórz",
      ),
    ),
    box,
    h(
      "div",
      { class: "ps-join" },
      codeIn,
      h(
        "button",
        {
          class: "btn small primary",
          onClick: async () => {
            const code = codeIn.value.trim().toUpperCase();
            if (!code) return;
            const r = await run(api.serverByCode(code));
            if (!r) return;
            if (r.world.id !== w.id) return ctx.go("play", { worldId: r.world.id, privateCode: r.server.code });
            play(r.server);
          },
        },
        "Wejdź z kodem",
      ),
    ),
  );
}
