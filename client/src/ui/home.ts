// Menu główne: lista gier, tworzenie, awatar ze sklepem i znajomi.
import { ArcRotateCamera, Color4, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import type { CatalogItem } from "../../../shared/catalog.ts";
import { DEFAULT_MAX_PLAYERS, type Avatar, type FriendInfo, type WorldInfo } from "../../../shared/types.ts";
import { api, setToken } from "../api.ts";
import { AvatarModel } from "../engine/avatar.ts";
import { createEngine } from "../engine/world.ts";
import { session } from "../state.ts";
import { h, hashColor, modal, toast } from "./dom.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;
type Tab = "play" | "create" | "avatar" | "friends";

export function homeScreen(root: HTMLElement, params: { tab?: Tab }, go: Go) {
  let tab: Tab = params.tab ?? "play";
  let cleanupTab: (() => void) | null = null;
  const content = h("main", { class: "home-content" });
  const coins = h("span", { class: "coins" });
  const name = h("span", { class: "username" });
  const updateUser = () => {
    const u = session.user!;
    coins.textContent = "🪙 " + u.coins;
    name.textContent = u.username;
  };
  updateUser();
  const unsub = session.onChange(updateUser);

  const navItems: [Tab, string, string][] = [
    ["play", "🎮", "Graj"],
    ["create", "🧱", "Twórz"],
    ["avatar", "🧍", "Awatar"],
    ["friends", "👥", "Znajomi"],
  ];
  const nav = h(
    "nav",
    { class: "home-nav" },
    navItems.map(([id, icon, label]) =>
      h("button", { class: "nav-btn", "data-tab": id, onClick: () => show(id) }, h("span", { class: "nav-icon" }, icon), h("span", null, label)),
    ),
    h(
      "button",
      {
        class: "nav-btn logout",
        onClick: async () => {
          await api.logout().catch(() => {});
          setToken(null);
          go("auth");
        },
      },
      h("span", { class: "nav-icon" }, "🚪"),
      h("span", null, "Wyloguj"),
    ),
  );
  const header = h(
    "header",
    { class: "home-header" },
    h("div", { class: "logo small" }, h("span", { class: "logo-block" }), "PREDATOR"),
    h("div", { class: "header-right" }, coins, name),
  );
  const el = h("div", { class: "home" }, header, nav, content);
  root.append(el);

  function show(t: Tab) {
    tab = t;
    cleanupTab?.();
    cleanupTab = null;
    content.replaceChildren();
    for (const b of nav.querySelectorAll<HTMLElement>(".nav-btn[data-tab]")) b.classList.toggle("active", b.dataset.tab === t);
    history.replaceState(null, "", "#" + t);
    if (t === "play") playTab(content, go);
    else if (t === "create") createTab(content, go);
    else if (t === "avatar") cleanupTab = avatarTab(content);
    else friendsTab(content, go).then((c) => (cleanupTab = c));
  }
  show(tab);

  // odświeżenie monet i codzienny bonus
  api
    .me()
    .then(({ user, dailyBonus }) => {
      session.set(user);
      if (dailyBonus) toast(`Codzienny bonus: +${dailyBonus} 🪙`, "good");
    })
    .catch(() => {});

  return () => {
    cleanupTab?.();
    unsub();
    el.remove();
  };
}

// ---------- Graj ----------

function worldCard(w: WorldInfo, onClick: () => void, extra?: Node) {
  return h(
    "div",
    { class: "card", onClick },
    h("div", { class: "thumb", style: `background:${hashColor(w.name)}` }, h("span", null, w.name.slice(0, 1).toUpperCase())),
    h("div", { class: "card-title" }, w.name),
    h("div", { class: "card-sub" }, "od " + w.ownerName),
    h(
      "div",
      { class: "card-stats" },
      h("span", null, `👤 ${w.playing}/${w.maxPlayers}`),
      h("span", null, `👁 ${w.visits}`),
    ),
    extra ?? null,
  );
}

async function playTab(el: HTMLElement, go: Go) {
  el.append(h("h1", null, "Gry"));
  const grid = h("div", { class: "grid" }, h("div", { class: "muted" }, "Ładowanie…"));
  el.append(grid);
  try {
    const list = await api.worlds();
    grid.replaceChildren(
      ...(list.length
        ? list.map((w) => worldCard(w, () => openWorld(w, go)))
        : [h("div", { class: "muted" }, "Nie ma jeszcze opublikowanych gier. Stwórz pierwszą w zakładce Twórz!")]),
    );
  } catch (e) {
    grid.replaceChildren(h("div", { class: "form-error" }, (e as Error).message));
  }
}

function openWorld(w: WorldInfo, go: Go) {
  const close = modal(
    w.name,
    h(
      "div",
      { class: "world-details" },
      h("div", { class: "thumb big", style: `background:${hashColor(w.name)}` }, h("span", null, w.name.slice(0, 1).toUpperCase())),
      h("p", null, w.description || "Brak opisu."),
      h("p", { class: "muted" }, `Twórca: ${w.ownerName} · Gra teraz: ${w.playing} · Wizyty: ${w.visits} · Maks. graczy: ${w.maxPlayers}`),
    ),
    [{ label: "▶ Graj", kind: "primary big", onClick: () => (close(), go("play", { worldId: w.id })) }],
  );
}

// ---------- Twórz ----------

async function createTab(el: HTMLElement, go: Go) {
  const newBtn = h(
    "button",
    {
      class: "btn primary",
      onClick: async () => {
        const input = h("input", { placeholder: "Nazwa gry", maxLength: 40, value: "Moja gra" });
        const close = modal("Nowa gra", h("label", null, "Nazwa", input), [
          {
            label: "Utwórz",
            kind: "primary",
            onClick: async () => {
              try {
                const w = await api.createWorld(input.value);
                close();
                go("studio", { worldId: w.id });
              } catch (e) {
                toast((e as Error).message, "error");
              }
            },
          },
        ]);
        input.select();
      },
    },
    "+ Nowa gra",
  );
  el.append(h("div", { class: "row between" }, h("h1", null, "Twoje gry"), newBtn));
  el.append(
    h(
      "p",
      { class: "muted" },
      `Buduj w edytorze, pisz skrypty w Lua albo układaj bloczki i opublikuj grę, żeby inni mogli w nią grać. Domyślnie do ${DEFAULT_MAX_PLAYERS} graczy na serwer.`,
    ),
  );
  const grid = h("div", { class: "grid" }, h("div", { class: "muted" }, "Ładowanie…"));
  el.append(grid);
  const list = await api.myWorlds().catch((e) => (toast(e.message, "error"), []));
  grid.replaceChildren(
    ...(list.length
      ? list.map((w) =>
          worldCard(
            w,
            () => go("studio", { worldId: w.id }),
            h(
              "div",
              { class: "card-actions" },
              h("span", { class: "badge " + (w.published ? "on" : "") }, w.published ? "Opublikowana" : "Prywatna"),
              h("button", { class: "btn small", onClick: (e: Event) => (e.stopPropagation(), go("play", { worldId: w.id })) }, "▶"),
            ),
          ),
        )
      : [h("div", { class: "muted" }, "Nie masz jeszcze żadnych gier.")]),
  );
}

// ---------- Awatar ----------

const PALETTE = [
  "#f5cd30", "#f8d9b4", "#d6a47a", "#a0694b", "#6b4430", "#3b2418",
  "#ffffff", "#a3a2a5", "#636363", "#1b1b1b", "#c4281c", "#e63946",
  "#ff8c00", "#ffd700", "#a4bd47", "#2ecc71", "#1e8449", "#0d69ac",
  "#3498db", "#6ad2ff", "#8e44ad", "#ff66cc", "#ff9ecf", "#7f5539",
];

function avatarTab(el: HTMLElement): () => void {
  const user = session.user!;
  const avatar: Avatar = { ...user.avatar };
  let saveTimer = 0;

  const canvas = h("canvas", { class: "avatar-canvas" });
  const { engine, dispose } = createEngine(canvas);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  const cam = new ArcRotateCamera("c", -Math.PI / 2, 1.35, 13, new Vector3(0, 2.8, 0), scene);
  cam.attachControl(true);
  cam.lowerRadiusLimit = 7;
  cam.upperRadiusLimit = 20;
  cam.panningSensibility = 0;
  new HemisphericLight("l", new Vector3(0.3, 1, -0.6), scene).intensity = 1.1;
  const model = new AvatarModel(scene, avatar);
  scene.onBeforeRenderObservable.add(() => {
    model.root.rotation.y += engine.getDeltaTime() / 3000;
    model.update(engine.getDeltaTime() / 1000);
  });
  engine.runRenderLoop(() => scene.render());

  const save = () => {
    model.setAvatar(avatar);
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      try {
        session.set((await api.saveAvatar(avatar)).user);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }, 400);
  };

  const parts: [keyof Avatar, string][] = [
    ["head", "Głowa"],
    ["torso", "Tułów"],
    ["arms", "Ręce"],
    ["legs", "Nogi"],
  ];
  let partSel: keyof Avatar = "torso";
  const swatches = h("div", { class: "swatches" });
  const partBtns = h("div", { class: "seg" });
  const renderColors = () => {
    partBtns.replaceChildren(
      ...parts.map(([k, label]) =>
        h("button", { class: "seg-btn " + (k === partSel ? "active" : ""), onClick: () => ((partSel = k), renderColors()) }, label),
      ),
    );
    swatches.replaceChildren(
      ...PALETTE.map((c) =>
        h("button", {
          class: "swatch " + (avatar[partSel] === c ? "active" : ""),
          style: `background:${c}`,
          title: c,
          onClick: () => {
            avatar[partSel] = c;
            save();
            renderColors();
          },
        }),
      ),
      h("input", {
        type: "color",
        class: "swatch-picker",
        value: avatar[partSel],
        onInput: (e: Event) => {
          avatar[partSel] = (e.target as HTMLInputElement).value;
          save();
        },
      }),
    );
  };
  renderColors();

  const shop = h("div", { class: "shop" });
  const renderShop = (catalog: CatalogItem[]) => {
    const u = session.user!;
    const section = (type: "hat" | "face", title: string) =>
      h(
        "div",
        null,
        h("h3", null, title),
        h(
          "div",
          { class: "items" },
          catalog
            .filter((i) => i.type === type)
            .map((item) => {
              const owned = u.inventory.includes(item.id);
              const worn = avatar[type] === item.id;
              return h(
                "button",
                {
                  class: "item " + (worn ? "worn" : "") + (owned ? " owned" : ""),
                  onClick: async () => {
                    if (!owned) {
                      if (u.coins < item.price) return toast("Za mało monet - graj, żeby zdobyć więcej!", "error");
                      try {
                        session.set((await api.buy(item.id)).user);
                        toast(`Kupiono: ${item.name}`, "good");
                      } catch (e) {
                        return toast((e as Error).message, "error");
                      }
                    }
                    avatar[type] = item.id;
                    save();
                    renderShop(catalog);
                  },
                },
                h("div", { class: "item-name" }, item.name),
                h("div", { class: "item-price" }, owned ? (worn ? "✔ Założone" : "Załóż") : `🪙 ${item.price}`),
              );
            }),
        ),
      );
    shop.replaceChildren(section("hat", "Czapki"), section("face", "Twarze"));
  };
  api.catalog().then(renderShop).catch((e) => toast(e.message, "error"));

  el.append(
    h("h1", null, "Awatar"),
    h(
      "div",
      { class: "avatar-layout" },
      h("div", { class: "avatar-preview" }, canvas),
      h("div", { class: "avatar-edit" }, h("h3", null, "Kolory"), partBtns, swatches, shop),
    ),
  );
  engine.resize();
  return () => {
    clearTimeout(saveTimer);
    scene.dispose();
    dispose();
  };
}

// ---------- Znajomi ----------

async function friendsTab(el: HTMLElement, go: Go) {
  const input = h("input", { placeholder: "Nick znajomego", maxLength: 20 });
  const list = h("div", { class: "friends" });
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
    h("div", { class: "row" }, input, h("button", { class: "btn primary", onClick: add }, "Dodaj")),
    list,
  );

  const row = (f: FriendInfo) => {
    const actions: Node[] = [];
    if (f.status === "incoming") {
      actions.push(
        h("button", { class: "btn small primary", onClick: async () => (await api.acceptFriend(f.id), refresh()) }, "Akceptuj"),
        h("button", { class: "btn small", onClick: async () => (await api.removeFriend(f.id), refresh()) }, "Odrzuć"),
      );
    } else if (f.status === "outgoing") {
      actions.push(
        h("span", { class: "muted" }, "Zaproszenie wysłane"),
        h("button", { class: "btn small", onClick: async () => (await api.removeFriend(f.id), refresh()) }, "Anuluj"),
      );
    } else {
      if (f.playing) {
        const playing = f.playing;
        actions.push(
          h("button", { class: "btn small primary", onClick: () => go("play", { worldId: playing.worldId, roomId: playing.roomId }) }, "Dołącz"),
        );
      }
      actions.push(
        h(
          "button",
          {
            class: "btn small",
            onClick: async () => {
              if (confirm(`Usunąć ${f.username} ze znajomych?`)) {
                await api.removeFriend(f.id);
                refresh();
              }
            },
          },
          "Usuń",
        ),
      );
    }
    const status =
      f.status !== "accepted"
        ? ""
        : f.playing
          ? `Gra w: ${f.playing.worldName}`
          : f.online
            ? "Online"
            : "Offline";
    return h(
      "div",
      { class: "friend" },
      h("div", { class: "friend-avatar", style: `background:${hashColor(f.username)}` }, f.username.slice(0, 1).toUpperCase(),
        f.status === "accepted" ? h("span", { class: "dot " + (f.online ? "on" : "") }) : null),
      h("div", { class: "friend-info" }, h("b", null, f.username), h("div", { class: "muted" }, status)),
      h("div", { class: "friend-actions" }, actions),
    );
  };

  const refresh = async () => {
    try {
      const friends = await api.friends();
      const incoming = friends.filter((f) => f.status === "incoming");
      const rest = friends.filter((f) => f.status !== "incoming");
      list.replaceChildren(
        incoming.length ? h("h3", null, "Zaproszenia") : "",
        ...incoming.map(row),
        h("h3", null, `Znajomi (${rest.filter((f) => f.status === "accepted").length})`),
        ...(rest.length ? rest.map(row) : [h("div", { class: "muted" }, "Dodaj znajomych po nicku, żeby razem grać.")]),
      );
    } catch (e) {
      list.replaceChildren(h("div", { class: "form-error" }, (e as Error).message));
    }
  };
  await refresh();
  const timer = setInterval(refresh, 10_000);
  return () => clearInterval(timer);
}
