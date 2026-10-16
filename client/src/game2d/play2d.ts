// Ekran gry 2D: własna postać (fizyka u gracza), inni gracze z serwera, potwory, monety,
// checkpointy, śmierć i odradzanie, kamera, dźwięki, czat, sterowanie dotykowe i pad.
import { openRoomsWindow } from "../game/rooms.ts";
import { PadMenuNav } from "../engine/gamepad.ts";
import { newBody, NO_INPUT, SolidWorld, stepBody, stepTopDown, type Body2D, type Input2D, type Solid } from "../../../shared/physics2d.ts";
import type { Cmd2D, Init2D, LevelSync } from "../../../shared/sim/sim2d.ts";
import type { ChatMsg } from "../../../shared/types.ts";
import type { Character2D, Enemy2D, Inst2D, InstState2D, Level2D, NetPlayer2D, Obj2D, World2D } from "../../../shared/types2d.ts";
import { instBox, overlaps, SPRING_PUSH, type Box } from "../../../shared/world2d.ts";
import { Input } from "../engine/input.ts";
import type { GameConnection } from "../game/connection.ts";
import { h, isTouch, toast } from "../ui/dom.ts";
import { VoiceChat } from "../game/voice.ts";
import { chatBox } from "../game/chatBox.ts";
import { gameShop } from "../game/gameShop.ts";
import { openGameReport, playersPanel } from "../game/playersPanel.ts";
import { safety } from "../safety.ts";
import { openInviteFriends } from "../game/inviteFriends.ts";
import { AssetStore, unlockAudio } from "./assets.ts";
import { GuiOverlay } from "../ui/guiOverlay.ts";
import { promptBox, type PromptMsg } from "../game/promptBox.ts";
import { fitScale, LevelView, type Camera2D, type Entity2D } from "./render.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;
type Anims = Character2D["anims"];

const SEND_EVERY = 1 / 15;
const PET_DELAY = 0.5;

interface Remote {
  net: NetPlayer2D;
  x: number;
  y: number;
  anim: string;
  animStart: number;
  pet: { x: number; y: number; anim: string; animStart: number } | null;
}

interface EnemyView {
  e: Enemy2D;
  x: number;
  y: number;
  inst: Inst2D;
  obj: Obj2D;
}

/** Postać sterowana przez gracza albo towarzysz */
interface Actor {
  char: Character2D;
  obj: Obj2D;
  body: Body2D;
  flip: boolean;
  anim: string;
  animStart: number;
  paused: boolean;
}

export function play2dScreen(
  root: HTMLElement,
  params: { conn: GameConnection; init: Init2D; back?: { screen: string; params?: Record<string, unknown> }; offline: boolean; privateCode?: string; worldId?: number },
  go: Go,
): () => void {
  const { conn, init } = params;
  const w: World2D = init.world;
  const canvas = h("canvas", { class: "game-canvas" });
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Wczytywanie grafiki…");
  const wrap = h("div", { class: "play-screen play2d" }, canvas, loading);
  root.append(wrap);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const assets = AssetStore.forWorld(w);
  const view = new LevelView(w, assets);
  const objs = new Map(w.objects.map((o) => [o.id, o]));
  const chars = new Map(w.characters.map((c) => [c.id, c]));
  const input = new Input(wrap, (k) => (k === "ps" ? "✕ skok, krzyżak / gałka ruch, Options menu" : "A skok, krzyżak / gałka ruch, Menu = menu"));
  // joystick jak krzyżak: pchnięcie w dół/górę nie rusza postaci w bok (patrzenie na beczce, drabiny)
  input.joyFourWay = true;
  const padNav = new PadMenuNav();
  let disposed = false;
  let leaving = false;
  const back = () => go(params.back?.screen ?? "home", params.back?.params);

  // ---------- stan ----------
  let level!: Level2D;
  let solids = new SolidWorld();
  let hazards: { inst: Inst2D; obj: Obj2D }[] = [];
  let springs: { inst: Inst2D; obj: Obj2D }[] = [];
  /** trampoliny, których gracz właśnie dotyka (wyrzucają raz na dotknięcie) */
  const springTouch = new Set<string>();
  /** animacja gracza po wyrzucie z trampoliny i do kiedy */
  let springAnim: { name: string; until: number } | null = null;
  let pickups: { inst: Inst2D; obj: Obj2D }[] = [];
  let checkpoints: { inst: Inst2D; obj: Obj2D }[] = [];
  let me!: Actor;
  let pet: (Actor & { dead: number; hiddenFor: number }) | null = null;
  let petInputs: { t: number; input: Input2D }[] = [];
  let dead = 0;
  let pendingSync: (LevelSync & { character?: string }) | null = null;
  let checkpoint: { x: number; y: number } | null = null;
  let coins = 0;
  let levelStart = 0;
  let time = 0;
  const cam: Camera2D = { x: 0, y: 0, scale: 2 };
  let camInit = false;
  const remotes = new Map<string, Remote>();
  const enemies = new Map<string, EnemyView>();
  let coinPitch = 1;
  let lastCoin = 0;
  let sendTimer = 0;
  let lastSent = "";
  // polecenia ze skryptów
  let speedOverride: number | null = null;
  let jumpOverride: number | null = null;
  let animOverride: Partial<Anims> = {};
  let playAnim: string | null = null;
  let force = 0;
  let camLock: { x: number; y: number } | null = null;
  let autoWalk = 0;
  let controls = true;
  let forcedJump = false;
  let characterId = init.character;

  const physics = () => ({
    ...w.physics,
    ...(jumpOverride !== null ? { jumpSpeed: jumpOverride } : {}),
  });
  const maxSpeed = () => speedOverride ?? w.physics.maxSpeed;

  const makeActor = (charId: string, x: number, y: number): Actor | null => {
    const char = chars.get(charId) ?? w.characters[0];
    const obj = char && objs.get(char.obj);
    if (!char || !obj) return null;
    return {
      char, obj,
      body: newBody(instBox({ x, y, w: char.w, h: char.h }, obj)),
      flip: false, anim: char.anims.idle, animStart: 0, paused: false,
    };
  };
  /** lewy górny róg sprite'a z prostokąta kolizji */
  const spritePos = (a: Actor) => {
    const [hx, hy, hw] = a.obj.hitbox;
    const fx = a.flip ? 1 - hx - hw : hx;
    return { x: a.body.box.x - fx * a.char.w, y: a.body.box.y - hy * a.char.h };
  };
  const placeActor = (a: Actor, x: number, y: number) => {
    a.body = newBody(instBox({ x, y, w: a.char.w, h: a.char.h, flip: a.flip }, a.obj));
  };

  function allInst(): Inst2D[] {
    return [...level.instances.filter((i) => !view.removed.has(i.id)), ...view.created];
  }

  /** platformy, zagrożenia, monety - po zmianie poziomu albo stanu obiektów */
  function rebuild() {
    const list: Solid[] = [];
    hazards = [];
    springs = [];
    pickups = [];
    checkpoints = [];
    for (const i of allInst()) {
      const o = objs.get(i.obj);
      if (!o || i.layer === "hud") continue;
      const st = view.state.get(i.id);
      if (o.solid !== "none" && !st?.hidden && !(o.role === "gate" && st?.open)) {
        const p = view.pos(i);
        list.push({ box: instBox({ ...i, x: p.x, y: p.y }, o), type: o.solid, obj: o.id, id: i.id });
      }
      if (o.role === "hazard") hazards.push({ inst: i, obj: o });
      else if (o.role === "spring") springs.push({ inst: i, obj: o });
      else if (o.role === "pickup") pickups.push({ inst: i, obj: o });
      else if (o.role === "checkpoint") checkpoints.push({ inst: i, obj: o });
    }
    solids = new SolidWorld(list);
  }

  function applySync(sync: LevelSync & { character?: string }) {
    const l = w.levels.find((x) => x.id === sync.level) ?? w.levels[0];
    level = l;
    view.setLevel(l);
    // poziom menu / GUI: bez postaci i sterowania
    wrap.classList.toggle("gui-place", !!l.menu);
    guiLayer?.setWhere(l.id);
    for (const [id, s] of Object.entries(sync.inst)) view.state.set(id, s);
    view.created = [...sync.created];
    for (const id of sync.removed) view.removed.add(id);
    for (const id of sync.collected) view.hiddenLocal.add(id);
    // potwory rysujemy jako ruchome postacie, nie jako obiekty poziomu
    enemies.clear();
    for (const i of allInst()) if (objs.get(i.obj)?.role === "enemy") view.removed.add(i.id);
    for (const e of sync.enemies) setEnemy(e, true);
    view.invalidate();
    if (sync.character) characterId = sync.character;
    coins = sync.coins;
    checkpoint = null;
    dead = 0;
    playAnim = null;
    speedOverride = null;
    jumpOverride = null;
    animOverride = {};
    force = 0;
    camLock = null;
    autoWalk = 0;
    controls = true;
    remotes.clear();
    const a = makeActor(characterId, sync.x, sync.y);
    if (a) me = a;
    setupPet(sync.x, sync.y);
    rebuild();
    levelStart = time;
    camInit = false;
  }

  function setupPet(x: number, y: number) {
    const comp = me.char.companion ? chars.get(me.char.companion) : undefined;
    petInputs = [];
    if (!comp) {
      pet = null;
      return;
    }
    const a = makeActor(comp.id, x, y);
    pet = a ? { ...a, dead: 0, hiddenFor: 0 } : null;
  }

  function setEnemy(e: Enemy2D, snap = false) {
    let v = enemies.get(e.id);
    if (!v) {
      const inst = level.instances.find((i) => i.id === e.id) ?? view.created.find((i) => i.id === e.id);
      const obj = inst && objs.get(inst.obj);
      if (!inst || !obj) return;
      v = { e, x: e.x, y: e.y, inst, obj };
      enemies.set(e.id, v);
    }
    // wrócił po śmierci - od razu na swoim miejscu, bez przesuwania przez pół planszy
    if (v.e.dead && !e.dead) snap = true;
    v.e = e;
    if (snap) {
      v.x = e.x;
      v.y = e.y;
    }
  }

  // ---------- HUD ----------
  const chat = chatBox({
    placeholder: "Napisz wiadomość…",
    onSend: (t) => conn.send("chat", t),
    onTyping: (typing) => (input.enabled = !typing),
  });
  const board = h("div", { class: "leaderboard hidden" });
  const menu = h("div", { class: "game-menu hidden" });
  function addChat(m: ChatMsg) {
    // wiadomości zablokowanych graczy nie pokazujemy
    if (!m.system && safety.isBlockedName(m.from)) return;
    chat.add(m);
  }
  function showScores(list: { name: string; score: number }[]) {
    board.classList.remove("hidden");
    board.replaceChildren(
      h("div", { class: "lb-head" }, h("span", null, "Gracz"), h("span", null, "Punkty")),
      ...[...list].sort((a, b) => b.score - a.score).map((s) => h("div", { class: "lb-row" }, h("span", null, s.name), h("b", null, String(s.score)))),
    );
  }
  function levelMenu() {
    // gra z własnym menu (np. przeniesiona z GDevelopa) - poziomy wybiera się w jej menu
    if (w.ownMenu) return "";
    const list = w.levels.filter((l) => (l.selectable || l.id === w.startLevel) && l.id !== level.id);
    if (!list.length || !w.levels.some((l) => l.selectable)) return "";
    return h(
      "div",
      { class: "char-pick" },
      h("div", { class: "muted small" }, "Idź do poziomu"),
      h(
        "div",
        { class: "char-list" },
        list.map((l) => h("button", { class: "btn small", onClick: () => (conn.send("goto", l.id), menu.classList.add("hidden")) }, l.name)),
      ),
    );
  }
  function renderMenu() {
    // poziom może mieć własną listę postaci (np. mapa multiplayer)
    const selectable = level.characters?.length
      ? level.characters.map((id) => chars.get(id)).filter((c): c is Character2D => !!c)
      : w.characters.filter((c) => !c.npc);
    menu.replaceChildren(
      h("h3", null, init.info.name),
      h("p", { class: "muted" }, "Twórca: " + init.info.ownerName),
      !level.character && !w.ownMenu && selectable.length > 1
        ? h(
            "div",
            { class: "char-pick" },
            h("div", { class: "muted small" }, "Postać"),
            h(
              "div",
              { class: "char-list" },
              selectable.map((c) =>
                h(
                  "button",
                  {
                    class: "btn small" + (c.id === me.char.id ? " primary" : ""),
                    onClick: () => {
                      conn.send("char", c.id);
                      menu.classList.add("hidden");
                    },
                  },
                  c.name,
                ),
              ),
            ),
          )
        : "",
      levelMenu(),
      params.offline ? "" : h("button", { class: "btn", onClick: () => (menu.classList.add("hidden"), openInviteFriends(params.privateCode)) }, "👥 Zaproś znajomych"),
      h("button", { class: "btn", onClick: () => menu.classList.add("hidden") }, "Wróć do gry"),
      h("button", { class: "btn danger", onClick: () => exit() }, params.offline ? "Wróć do Studio" : "Wyjdź z gry"),
    );
  }
  const topbar = h(
    "div",
    { class: "hud-top" },
    h("div", { class: "hud-title" }, init.info.name),
    chat.button,
    h("button", { class: "hud-btn", title: "Menu", onClick: () => (renderMenu(), menu.classList.toggle("hidden")) }, "☰"),
  );
  wrap.append(topbar, chat.box, board, menu);
  // GUI gry: okienka i przyciski (serwer mówi, które są otwarte)
  const guiLayer = new GuiOverlay(wrap, init.guis ?? [], (g, e) => conn.send("gui", { g, e }));
  conn.onMessage("gui", (m: { open: string[]; text: Record<string, string> }) => guiLayer.setState(m));
  // czat głosowy ze znajomymi (tylko w grze na serwerze)
  const voice = params.offline ? null : new VoiceChat(conn, init.you);
  if (voice) (topbar.insertBefore(voice.button, topbar.lastChild), wrap.append(voice.panel));
  // gracze na serwerze: znajomi / zablokuj / zgłoś
  if (!params.offline) {
    const pp = playersPanel(conn, () => [...remotes.entries()].map(([sid, rm]) => ({ sid, username: rm.net.username })));
    topbar.insertBefore(pp.button, topbar.lastChild);
    if (voice) voice.onReport = (sid, username) => openGameReport(conn, { sid, username }, true);
  }
  // sklep gry (pokazuje się, gdy gra ma produkty)
  const shop = gameShop(conn, { offline: !!params.offline });
  topbar.insertBefore(shop.button, topbar.lastChild);
  const myName = init.players.find((p) => p.sid === init.you)?.username ?? "";

  function exit() {
    leaving = true;
    conn.leave();
    back();
  }

  // ---------- pokoje (multiplayer) i wyjście z gry ze skryptu / przycisku GUI ----------
  /** pokój, w którym jest gracz (null = zwykły serwer gry) */
  let room: { name: string; code?: string; max: number } | null = null;
  conn.onMessage("rooms", (m: { target?: string; max?: number }) =>
    openRoomsWindow({
      worldId: params.worldId,
      target: m?.target ?? "",
      max: m?.max,
      offline: params.offline,
      go,
      // z pokoju wraca się do zwykłej gry (jej menu), a stamtąd tam, skąd gracz przyszedł
      back: room ? params.back : { screen: "play", params: { worldId: params.worldId, ...(params.back ? { back: params.back } : {}) } },
      leave: () => {
        leaving = true;
        conn.leave();
      },
    }),
  );
  conn.onMessage("exit", () => exit());
  conn.onMessage("room", (m: { name: string; code?: string; max: number }) => {
    room = m;
    const title = topbar.querySelector(".hud-title");
    if (title) title.textContent = `${init.info.name} · 🎮 ${m.name}${m.code ? ` (kod ${m.code})` : ""}`;
    toast(`🎮 Pokój „${m.name}”` + (m.code ? ` - kod dla znajomych: ${m.code}` : ""), "good");
  });

  // ---------- wiadomości ----------
  // najpierw poziom z init - dopiero potem wiadomości, które czekały w buforze
  applySync({ ...init.sync, character: init.character });
  for (const n of init.players) if (n.sid !== init.you) remotes.set(n.sid, { net: n, x: n.x, y: n.y, anim: n.anim, animStart: 0, pet: n.pet ? { ...n.pet, animStart: 0 } : null });
  conn.onMessage("p", (list: NetPlayer2D[]) => {
    const seen = new Set<string>();
    for (const n of list) {
      if (n.sid === init.you || n.level !== level?.id) continue;
      seen.add(n.sid);
      const r = remotes.get(n.sid);
      if (!r) remotes.set(n.sid, { net: n, x: n.x, y: n.y, anim: n.anim, animStart: time, pet: n.pet ? { ...n.pet, animStart: time } : null });
      else {
        if (r.anim !== n.anim) {
          r.anim = n.anim;
          r.animStart = time;
        }
        if (n.pet) {
          if (!r.pet) r.pet = { ...n.pet, animStart: time };
          else if (r.pet.anim !== n.pet.anim) r.pet.animStart = time;
        } else r.pet = null;
        r.net = n;
      }
    }
    for (const sid of remotes.keys()) if (!seen.has(sid)) remotes.delete(sid);
  });
  conn.onMessage("enemies", (list: Enemy2D[]) => {
    for (const e of list) setEnemy(e);
  });
  conn.onMessage("inst", (m: { id: string; s: InstState2D }) => {
    view.state.set(m.id, { ...(view.state.get(m.id) ?? {}), ...m.s });
    if (m.s.from) view.moves.set(m.id, performance.now());
    if ("hidden" in m.s || "open" in m.s || "x" in m.s || "y" in m.s) rebuild();
  });
  conn.onMessage("create", (i: Inst2D) => {
    view.created.push(i);
    if (objs.get(i.obj)?.role === "enemy") view.removed.add(i.id);
    view.invalidate();
    rebuild();
  });
  conn.onMessage("remove", (id: string) => {
    view.removed.add(id);
    view.created = view.created.filter((c) => c.id !== id);
    enemies.delete(id);
    view.invalidate();
    rebuild();
  });
  conn.onMessage("collected", (id: string) => view.hiddenLocal.add(id));
  conn.onMessage("uncollected", (id: string) => view.hiddenLocal.delete(id));
  conn.onMessage("coins", (n: number | { earned: number }) => {
    // liczba = monety zebrane w grze, obiekt = monety Predatora za granie
    if (typeof n === "number") coins = n;
    else toast(`+${n.earned} 🪙 za granie`, "good");
  });
  conn.onMessage("level", (s: LevelSync & { character?: string }) => {
    // najpierw niech się skończy animacja śmierci
    if (dead > 0) pendingSync = s;
    else applySync(s);
  });
  conn.onMessage("sound", (m: { id: string; pitch?: number }) => assets.play(m.id, { pitch: m.pitch }));
  conn.onMessage("background", (c: string) => (view.background = c));
  conn.onMessage("cmd", (c: Cmd2D) => applyCmd(c));
  conn.onMessage("chat", (m: ChatMsg) => addChat(m));
  // okienko z pytaniem od skryptu (np. kody w Ludziku 4) - odpowiedź trafia do onAnswer
  const showPrompt = promptBox(wrap, (id, text) => conn.send("answer", { id, text }));
  conn.onMessage("prompt", (m: PromptMsg | null) => showPrompt(m));
  conn.onMessage("log", (l: { text: string; error: boolean }) => {
    if (l.error) toast("Skrypt: " + l.text, "error");
    console[l.error ? "warn" : "log"]("[Lua]", l.text);
  });
  conn.onMessage("scores", (list: { name: string; score: number }[]) => showScores(list));
  conn.onLeave((code) => {
    if (leaving || disposed) return;
    toast(code === 4000 ? "Wyrzucono z gry" : code === 4002 ? "Serwer został zrestartowany - wejdź ponownie" : "Rozłączono z serwerem", "error");
    back();
  });

  function applyCmd(c: Cmd2D) {
    if (c.speed !== undefined) speedOverride = c.speed;
    if (c.jumpSpeed !== undefined) jumpOverride = c.jumpSpeed;
    if (c.anims === null) animOverride = {};
    else if (c.anims) animOverride = { ...animOverride, ...c.anims };
    if (c.playAnim !== undefined) playAnim = c.playAnim;
    if (c.force !== undefined) force = c.force;
    if (c.jump) forcedJump = true;
    if (c.camera !== undefined) camLock = c.camera;
    if (c.autoWalk !== undefined) autoWalk = c.autoWalk;
    if (c.controls !== undefined) controls = c.controls;
    if (c.teleport) {
      placeActor(me, c.teleport.x, c.teleport.y);
      camInit = false;
    }
    if (c.kill) die();
    if (c.character && c.character !== me.char.id) {
      characterId = c.character;
      const p = spritePos(me);
      const a = makeActor(characterId, p.x, p.y + me.char.h - (chars.get(characterId)?.h ?? me.char.h));
      if (a) {
        a.flip = me.flip;
        me = a;
        setupPet(p.x, p.y);
      }
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "F2") {
      // zrzut ekranu gry do pliku PNG
      e.preventDefault();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${init.info.name || "predator"}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("📸 Zapisano zrzut ekranu", "good");
      });
      return;
    }
    if (chat.typing()) return;
    if (e.key === "Enter" || e.key === "/") {
      e.preventDefault();
      chat.focus();
    } else if (e.key === "Escape") {
      renderMenu();
      menu.classList.toggle("hidden");
    }
  };
  window.addEventListener("keydown", onKey);
  const unlock = () => unlockAudio();
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  // ---------- sterowanie ----------
  function readInput(): Input2D {
    input.update();
    let left = input.moveX < -0.35;
    let right = input.moveX > 0.35;
    let up = input.moveY > 0.45;
    let down = input.moveY < -0.45;
    let jump = input.jump;
    // pad (Xbox / PlayStation) jest już w input; Options / Menu i chodzenie po menu padem
    if (padMenu()) return { ...NO_INPUT };
    if (!controls || dead > 0 || guiLayer.modal) return { ...NO_INPUT, right: autoWalk > 0, left: autoWalk < 0 };
    if (autoWalk) return { ...NO_INPUT, right: autoWalk > 0, left: autoWalk < 0 };
    return { left, right, up, down, jump };
  }

  // ---------- śmierć i odradzanie ----------
  function respawnPoint(): { x: number; y: number } {
    const r = allInst().find((i) => objs.get(i.obj)?.role === "respawn") ?? allInst().find((i) => objs.get(i.obj)?.role === "spawn");
    if (!r) return { x: 0, y: 0 };
    return { x: r.x + r.w / 2 - me.char.w / 2, y: r.y + r.h - me.char.h };
  }

  function die() {
    if (dead > 0) return;
    dead = 0.8;
    me.anim = animName("dead");
    me.animStart = time;
    assets.play(w.sounds.hurt);
    conn.send("died", { checkpoint: !!checkpoint });
  }

  function respawn() {
    if (pendingSync) {
      const s = pendingSync;
      pendingSync = null;
      applySync(s);
      return;
    }
    if (level.restartOnDeath && !checkpoint) {
      // serwer za chwilę przyśle poziom od nowa - na wszelki wypadek odradzamy na starcie
      const p = respawnPoint();
      placeActor(me, p.x, p.y);
    } else {
      const p = checkpoint ?? respawnPoint();
      placeActor(me, p.x, p.y);
    }
    me.body.vx = me.body.vy = me.body.fallV = me.body.jumpV = 0;
    if (pet) {
      const p = spritePos(me);
      placeActor(pet, p.x, p.y);
      pet.dead = 0;
    }
  }

  // ---------- animacje postaci ----------
  function animName(kind: keyof Anims): string {
    const a = me.char.anims;
    const o = animOverride[kind];
    const has = (n?: string) => !!n && me.obj.anims.some((x) => x.name === n);
    if (has(o)) return o!;
    return (has(a[kind]) ? a[kind] : a.idle) ?? a.idle;
  }

  function pickAnim(a: Actor, inp: Input2D, isMe: boolean): string {
    const anims = a.char.anims;
    const has = (n?: string) => !!n && a.obj.anims.some((x) => x.name === n);
    const pick = (kind: keyof Anims) => {
      const o = isMe ? animOverride[kind] : undefined;
      if (has(o)) return o!;
      return has(anims[kind]) ? anims[kind]! : anims.idle;
    };
    const b = a.body;
    a.paused = false;
    if (isMe && playAnim && has(playAnim)) return playAnim;
    if (isMe && springAnim && time < springAnim.until && has(springAnim.name)) return springAnim.name;
    if (b.onLadder) {
      a.paused = b.vy === 0 && b.vx === 0;
      return pick("climb");
    }
    // widok z góry: chodzenie w każdą stronę (w górę i w dół też)
    if (level.topDown) return Math.hypot(b.vx + b.force, b.vy) > 1 ? pick("walk") : pick("idle");
    if (!b.onFloor) return b.vy < 0 ? pick("jump") : pick("fall");
    if (Math.abs(b.vx + b.force) > 1) return pick("walk");
    const stand = b.floorObj ? objs.get(b.floorObj)?.standAnim : undefined;
    if (stand) {
      if (inp.up && has(anims.up)) return anims.up!;
      if (inp.down && has(anims.down)) return anims.down!;
      if (has(stand)) return stand;
    }
    return pick("idle");
  }

  function setAnim(a: Actor, name: string) {
    if (a.anim !== name) {
      a.anim = name;
      a.animStart = time;
    }
  }

  // ---------- dotykanie rzeczy ----------
  function touchPickups(box: Box) {
    for (const { inst, obj } of pickups) {
      if (view.isHidden(inst, obj)) continue;
      const p = view.pos(inst);
      if (!overlaps(box, instBox({ ...inst, x: p.x, y: p.y }, obj))) continue;
      // od razu chowamy (serwer potwierdzi)
      if (obj.perPlayer) view.hiddenLocal.add(inst.id);
      else view.state.set(inst.id, { ...(view.state.get(inst.id) ?? {}), hidden: true });
      if (obj.sound) assets.play(obj.sound);
      if (obj.coin) {
        if (time - lastCoin > 1) coinPitch = 0.8 + Math.random() * 0.2;
        assets.play(w.sounds.coin, { pitch: coinPitch, volume: 0.6 });
        coinPitch += 0.05 + Math.round(Math.random() * 2) * 0.025;
        lastCoin = time;
      }
    }
  }

  /** trampolina: wyrzut na sekundę (jak siła w GDevelopie), raz na każde dotknięcie */
  function touchSprings(b: Box) {
    const box = { x: b.x - 0.5, y: b.y - 0.5, w: b.w + 1, h: b.h + 1.5 };
    for (const { inst, obj } of springs) {
      const p = view.pos(inst);
      const on = !view.isHidden(inst, obj) && overlaps(box, instBox({ ...inst, x: p.x, y: p.y }, obj));
      if (!on) {
        springTouch.delete(inst.id);
        continue;
      }
      if (springTouch.has(inst.id)) continue;
      springTouch.add(inst.id);
      const push = obj.push ?? SPRING_PUSH;
      Object.assign(me.body, { pushX: push[0], pushY: push[1], pushT: 1 });
      // wyrzut w górę przerywa skok i spadanie
      if (push[1] < 0) Object.assign(me.body, { fallV: 0, jumpV: 0, jumping: false, onFloor: false });
      if (obj.pushAnim) springAnim = { name: obj.pushAnim, until: time + 0.6 };
      if (obj.sound) assets.play(obj.sound);
    }
  }

  function deadly(b: Box): boolean {
    // stanie na ogniu też zabija (jak w GDevelop - dotknięcie krawędzią to kolizja)
    const box = { x: b.x - 0.5, y: b.y - 0.5, w: b.w + 1, h: b.h + 1.5 };
    for (const { inst, obj } of hazards) {
      if (view.isHidden(inst, obj)) continue;
      const p = view.pos(inst);
      if (overlaps(box, instBox({ ...inst, x: p.x, y: p.y }, obj))) return true;
    }
    for (const v of enemies.values()) {
      if (v.e.dead) continue;
      if (overlaps(box, instBox({ x: v.x, y: v.y, w: v.inst.w, h: v.inst.h, flip: v.e.flip }, v.obj))) return true;
    }
    return false;
  }

  // ---------- pętla ----------
  let raf = 0;
  let last = performance.now();
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    draw();
  }

  /** pad: Start / Options = menu; w menu i oknach GUI krzyżak wybiera, A / ✕ klika, B / ○ zamyka. true = pad steruje menu */
  function padMenu() {
    const pad = input.pad;
    if (!pad.connected) return padNav.clear(), false;
    if (pad.pressed.start) {
      renderMenu();
      menu.classList.toggle("hidden");
    }
    const menuOpen = !menu.classList.contains("hidden");
    const dialog = document.querySelector<HTMLElement>(".modal-bg .modal");
    const root = dialog ?? (menuOpen ? menu : guiLayer.padRoot(!!level.menu));
    padNav.update(pad, root, dialog ? () => dialog.closest(".modal-bg")?.remove() : menuOpen ? () => menu.classList.add("hidden") : undefined);
    return !!root;
  }

  function update(dt: number) {
    if (level.menu) {
      input.update();
      padMenu();
      return updateMenuLevel();
    }
    const inp = readInput();
    if (forcedJump) {
      inp.jump = true;
      forcedJump = false;
      me.body.jumpWas = false;
    }
    // inni gracze jako platformy
    solids.dynamic = level.stackPlayers
      ? [...remotes.values()].filter((r) => !r.net.hidden).map((r) => {
          const c = chars.get(r.net.character);
          const o = c && objs.get(c.obj);
          return { box: o ? instBox({ x: r.x, y: r.y, w: c!.w, h: c!.h, flip: r.net.flip }, o) : { x: r.x, y: r.y, w: 1, h: 1 }, type: "jumpthru" as const, obj: "", id: r.net.sid };
        })
      : [];

    if (dead > 0) {
      dead -= dt;
      if (dead <= 0) {
        dead = 0;
        respawn();
      }
    } else {
      me.body.force = force;
      const jumped = level.topDown ? (stepTopDown(solids, me.body, inp, dt, physics(), maxSpeed()), false) : stepBody(solids, me.body, inp, dt, physics(), maxSpeed());
      if (jumped) assets.play(w.sounds.jump, { volume: 0.35 });
      if (inp.left && !inp.right) me.flip = true;
      else if (inp.right && !inp.left) me.flip = false;
      setAnim(me, pickAnim(me, inp, true));
      const box = me.body.box;
      touchPickups(box);
      touchSprings(box);
      for (const { inst, obj } of checkpoints) {
        if (overlaps(box, instBox(inst, obj))) {
          const was = checkpoint;
          checkpoint = { x: inst.x, y: inst.y };
          if (obj.anims[1]) view.state.set(inst.id, { ...(view.state.get(inst.id) ?? {}), anim: obj.anims[1].name });
          if (!was || was.x !== inst.x || was.y !== inst.y) assets.play(w.sounds.checkpoint);
        }
      }
      const sp = spritePos(me);
      if (deadly(box) || (level.killY !== null && sp.y > level.killY)) die();
    }

    // towarzysz powtarza ruchy gracza z opóźnieniem
    if (pet) updatePet(dt, inp);

    // inni gracze i potwory - płynnie do ostatniej pozycji z serwera
    const k = Math.min(1, dt * 14);
    for (const r of remotes.values()) {
      r.x += (r.net.x - r.x) * k;
      r.y += (r.net.y - r.y) * k;
      if (Math.abs(r.net.x - r.x) > 300 || Math.abs(r.net.y - r.y) > 300) {
        r.x = r.net.x;
        r.y = r.net.y;
      }
      if (r.pet && r.net.pet) {
        r.pet.x += (r.net.pet.x - r.pet.x) * k;
        r.pet.y += (r.net.pet.y - r.pet.y) * k;
        r.pet.anim = r.net.pet.anim;
      }
    }
    for (const v of enemies.values()) {
      v.x += (v.e.x - v.x) * k;
      v.y += (v.e.y - v.y) * k;
    }

    // kamera
    const W = canvas.width, H = canvas.height;
    cam.scale = fitScale(W, H, level.zoom);
    const sp = spritePos(me);
    const target = camLock ?? { x: level.cameraX ?? sp.x + me.char.w / 2, y: level.cameraY ?? sp.y + me.char.h / 2 };
    if (!camInit) {
      cam.x = target.x;
      cam.y = target.y;
      camInit = true;
    } else {
      const s = camLock ? 1 : 1 - Math.exp(-dt * 7);
      cam.x += (target.x - cam.x) * s;
      cam.y += (target.y - cam.y) * s;
    }
    if (level.cameraBottom !== null) cam.y = Math.min(cam.y, level.cameraBottom - H / cam.scale / 2);

    // wysyłka pozycji
    sendTimer += dt;
    if (sendTimer >= SEND_EVERY) {
      sendTimer = 0;
      const petMsg = pet && pet.hiddenFor <= 0 ? (() => {
        const pp = spritePos(pet);
        return { x: Math.round(pp.x * 10) / 10, y: Math.round(pp.y * 10) / 10, anim: pet.anim, flip: pet.flip };
      })() : null;
      const msg = { x: Math.round(sp.x * 10) / 10, y: Math.round(sp.y * 10) / 10, anim: me.anim, flip: me.flip, pet: petMsg };
      const key = JSON.stringify(msg);
      if (key !== lastSent) {
        lastSent = key;
        conn.send("m", msg);
      }
    }

    view.vars = { coins, left: view.coinsLeft(), time: time - levelStart, player: myName };
  }

  /** poziom menu: kamera stoi (ustawiona w poziomie albo na starcie), gracz niewidoczny i nic nie wysyła */
  function updateMenuLevel() {
    const W = canvas.width, H = canvas.height;
    cam.scale = fitScale(W, H, level.zoom);
    const sp = allInst().find((i) => objs.get(i.obj)?.role === "spawn");
    cam.x = level.cameraX ?? (sp ? sp.x + sp.w / 2 : 0);
    cam.y = level.cameraY ?? (sp ? sp.y + sp.h / 2 : 0);
    camInit = true;
    view.vars = { coins, left: view.coinsLeft(), time: time - levelStart, player: myName };
  }

  function updatePet(dt: number, inp: Input2D) {
    if (!pet) return;
    petInputs.push({ t: time, input: { ...inp } });
    let delayed: Input2D = NO_INPUT;
    while (petInputs.length && petInputs[0].t <= time - PET_DELAY) delayed = petInputs.shift()!.input;
    if (petInputs.length > 200) petInputs.splice(0, petInputs.length - 200);
    if (pet.hiddenFor > 0) {
      pet.hiddenFor -= dt;
      if (pet.hiddenFor <= 0) {
        const p = spritePos(me);
        placeActor(pet, p.x, p.y);
        pet.dead = 0;
      }
      return;
    }
    if (pet.dead > 0) {
      // podskok i spadanie (jak w oryginale)
      pet.dead -= dt;
      pet.body.box.y += (pet.dead > 0.5 ? -60 : 300) * dt;
      if (pet.dead <= 0) pet.hiddenFor = 2;
      return;
    }
    pet.body.force = force;
    if (level.topDown) stepTopDown(solids, pet.body, delayed, dt, physics(), maxSpeed());
    else stepBody(solids, pet.body, delayed, dt, physics(), maxSpeed());
    if (delayed.left && !delayed.right) pet.flip = true;
    else if (delayed.right && !delayed.left) pet.flip = false;
    setAnim(pet, pickAnim(pet, delayed, false));
    touchPickups(pet.body.box);
    const pp = spritePos(pet);
    if (deadly(pet.body.box) || (level.killY !== null && pp.y > level.killY)) {
      pet.dead = 1;
      setAnim(pet, pet.char.anims.dead);
      assets.play(w.sounds.hurt);
      return;
    }
    // daleko poza ekranem - wraca do gracza
    const W = canvas.width / cam.scale, H = canvas.height / cam.scale;
    if (camInit && time - levelStart > 1 && (Math.abs(pp.x - cam.x) > W / 2 + 100 || Math.abs(pp.y - cam.y) > H / 2 + 100)) pet.hiddenFor = 2;
  }

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ents: Entity2D[] = [];
    if (level.menu) return view.draw(ctx, W, H, cam, time, ents);
    for (const v of enemies.values()) {
      if (v.e.dead) continue;
      ents.push({ obj: v.obj, x: v.x, y: v.y, w: v.inst.w, h: v.inst.h, flip: v.e.flip, anim: view.animOf(v.inst, v.obj)?.name ?? "", animStart: 0 });
    }
    for (const r of remotes.values()) {
      if (r.net.hidden) continue;
      const c = chars.get(r.net.character);
      const o = c && objs.get(c.obj);
      if (!c || !o) continue;
      ents.push({ obj: o, x: r.x, y: r.y, w: c.w, h: c.h, flip: r.net.flip, anim: r.anim, animStart: r.animStart, label: r.net.username });
      if (r.pet && c.companion) {
        const pc = chars.get(c.companion);
        const po = pc && objs.get(pc.obj);
        if (pc && po) ents.push({ obj: po, x: r.pet.x, y: r.pet.y, w: pc.w, h: pc.h, flip: r.net.pet?.flip ?? false, anim: r.pet.anim, animStart: r.pet.animStart });
      }
    }
    if (pet && pet.hiddenFor <= 0) {
      const p = spritePos(pet);
      ents.push({ obj: pet.obj, x: p.x, y: p.y, w: pet.char.w, h: pet.char.h, flip: pet.flip, anim: pet.anim, animStart: pet.animStart, paused: pet.paused });
    }
    const p = spritePos(me);
    ents.push({ obj: me.obj, x: p.x, y: p.y, w: me.char.w, h: me.char.h, flip: me.flip, anim: me.anim, animStart: me.animStart, paused: me.paused });
    view.draw(ctx, W, H, cam, time, ents);
  }

  // ---------- testy automatyczne (tylko gdy włączone w localStorage) ----------
  let debug = false;
  try {
    debug = localStorage.getItem("predator.debug") === "1";
  } catch {
    /* brak */
  }
  if (debug)
    (window as unknown as Record<string, unknown>).__p2d = {
      state: () => ({
        level: level.name, x: spritePos(me).x, y: spritePos(me).y, anim: me.anim, onFloor: me.body.onFloor, onLadder: me.body.onLadder,
        coins, dead, checkpoint, pet: pet ? { ...spritePos(pet), anim: pet.anim, hidden: pet.hiddenFor > 0 } : null,
        remotes: [...remotes.values()].map((r) => ({ name: r.net.username, x: r.x, y: r.y, hidden: !!r.net.hidden })),
        enemies: [...enemies.values()].map((e) => ({ x: e.x, y: e.y })),
        camLock, autoWalk, force, speed: maxSpeed(),
        gatesOpen: [...view.state.values()].filter((x) => x.open).length,
        coinsLeft: view.coinsLeft(),
        insts: Object.fromEntries([...view.state.entries()].filter(([, x]) => x.anim)),
      }),
      find: (name: string) =>
        allInst()
          .filter((i) => i.name === name || objs.get(i.obj)?.name === name)
          .map((i) => ({ ...view.pos(i), w: i.w, h: i.h, hidden: view.state.get(i.id)?.hidden ?? false, anim: view.state.get(i.id)?.anim })),
      body: () => ({ ...me.body.box, pushT: me.body.pushT, vy: me.body.vy, char: me.char.name }),
      teleport: (x: number, y: number) => {
        placeActor(me, x, y);
        if (pet) placeActor(pet, x, y);
      },
    };

  // ---------- start ----------
  assets.ready.then(() => {
    if (disposed) return;
    loading.remove();
    last = performance.now();
    raf = requestAnimationFrame(frame);
    if (isTouch()) toast("Joystick - ruch, ⤒ - skok");
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    input.dispose();
    guiLayer.dispose();
    voice?.dispose();
    shop.dispose();
    if (!leaving) {
      leaving = true;
      conn.leave();
    }
    wrap.remove();
  };
}
