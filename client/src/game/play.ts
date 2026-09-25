// Ekran gry - łączy się z serwerem, steruje postacią i pokazuje innych graczy.
import {
  ArcRotateCamera,
  Color3,
  Matrix,
  MeshBuilder,
  PointerEventTypes,
  PointLight,
  Scene,
  SpotLight,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import { Client } from "colyseus.js";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { LocalRoom, type GameConnection } from "./connection.ts";
import type { ActionAnim, Anim, Avatar, ChatMsg, Emote, NetPlayer, Part, ToolDef, WorldData } from "../../../shared/types.ts";
import { DEFAULT_LIGHT, EMOTES, FREE_EMOTES, SHOP_EMOTES } from "../../../shared/types.ts";
import { getToken, wsUrl } from "../api.ts";
import { GAME_PROTOCOL } from "../../../shared/types.ts";
import { VoiceChat } from "./voice.ts";
import { GameAudio } from "./audio3d.ts";
import { AvatarModel } from "../engine/avatar.ts";
import { Input } from "../engine/input.ts";
import { CollisionWorld, PLAYER_RADIUS, raycastParts, stepBody, type Body } from "../../../shared/physics.ts";
import { createEngine, WorldView } from "../engine/world.ts";
import { session } from "../state.ts";
import { h, isTouch, toast } from "../ui/dom.ts";
import { hexColor } from "../engine/world.ts";
import { GAME_INPUTS, pointerButtons, robloxCamera } from "../engine/camera.ts";
import { Hotbar } from "./hotbar.ts";
import { openSettings } from "../settings.ts";

interface Remote {
  model: AvatarModel;
  tag: Rectangle;
  hpBar: Rectangle;
  hpFill: Rectangle;
  username: string;
  avatar: Avatar;
  tx: number; ty: number; tz: number; tr: number;
}

export interface InitMsg {
  you: string;
  world: Omit<WorldData, "scripts">;
  info: { id: number; name: string; ownerName: string; isOwner: boolean };
  players: NetPlayer[];
  spawn: { x: number; y: number; z: number };
  inventory: string[];
}

const EMOTE_LABELS: Record<Emote, string> = {
  wave: "👋 Machaj",
  dance: "💃 Tańcz",
  cheer: "🙌 Wiwatuj",
  point: "👉 Wskaż",
  sit: "🪑 Usiądź",
  flip: "🤸 Salto",
  spin: "🌀 Bączek",
  clap: "👏 Oklaski",
  robotdance: "🤖 Robot",
  floss: "🕺 Floss",
  bow: "🙇 Ukłon",
  jumpjacks: "🤾 Pajacyki",
  zombie: "🧟 Zombie",
};
/** komendy czatu: /e taniec, /e dance ... */
const EMOTE_ALIASES: Record<string, Emote> = {
  wave: "wave", machaj: "wave", hej: "wave",
  dance: "dance", taniec: "dance", tancz: "dance", "tańcz": "dance",
  cheer: "cheer", wiwat: "cheer", wiwatuj: "cheer",
  point: "point", wskaz: "point", "wskaż": "point",
  sit: "sit", siad: "sit", usiadz: "sit", "usiądź": "sit",
  flip: "flip", salto: "flip", spin: "spin", baczek: "spin", "bączek": "spin", clap: "clap", oklaski: "clap",
  robot: "robotdance", floss: "floss", bow: "bow", uklon: "bow", "ukłon": "bow", pajacyki: "jumpjacks", zombie: "zombie",
};

const WALK_SPEED = 16;
const JUMP_POWER = 50;
const BOUNCE_POWER = 110;
const SEND_EVERY = 1 / 15;

export function playScreen(
  root: HTMLElement,
  params: {
    worldId?: number;
    roomId?: string;
    /** gra uruchomiona lokalnie, bez serwera (test ze Studio) */
    offline?: { name: string; data: WorldData };
    /** dokąd wrócić po wyjściu z gry */
    back?: { screen: string; params?: Record<string, unknown> };
    /** połączenie już nawiązane przez ekran startu gry (launch.ts) */
    conn?: GameConnection;
    init?: InitMsg;
  },
  go: (screen: string, params?: Record<string, unknown>) => void,
): () => void {
  const canvas = h("canvas", { class: "game-canvas" });
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Łączenie z grą…​");
  const wrap = h("div", { class: "play-screen" }, canvas, loading);
  root.append(wrap);

  const { engine, dispose: disposeEngine } = createEngine(canvas);
  const scene = new Scene(engine);
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
  const input = new Input(wrap);
  let room: GameConnection | null = null;
  let leaving = false;
  let disposed = false;
  const back = () => go(params.back?.screen ?? "home", params.back?.params);
  // w trybie offline gramy bez konta - domyślny wygląd
  const me = session.user ?? { id: 0, username: "Gracz", coins: 0, avatar: DEFAULT_AVATAR, inventory: [] };
  // emotki ze sklepu - tylko kupione (w teście offline wszystkie)
  const hasEmote = (e: Emote) => (FREE_EMOTES as Emote[]).includes(e) || !!params.offline || me.inventory.includes(e);

  const join: Promise<GameConnection> = params.conn
    ? Promise.resolve(params.conn)
    : params.offline
    ? Promise.resolve(new LocalRoom(params.offline.data, params.offline.name, me))
    : (() => {
        const client = new Client(wsUrl());
        const joining = params.roomId
          ? client.joinById(params.roomId, { token: getToken(), v: GAME_PROTOCOL })
          : client.joinOrCreate("world", { worldId: params.worldId, token: getToken(), v: GAME_PROTOCOL });
        return joining.then((r) => r as unknown as GameConnection);
      })();

  // gdy serwer gry nie odpowiada (np. zablokowany port), nie czekamy w nieskończoność
  let started = false;
  const joinTimeout = setTimeout(() => {
    if (started || disposed) return;
    toast("Serwer gry nie odpowiada - sprawdź połączenie i spróbuj ponownie", "error");
    leaving = true;
    room?.leave();
    back();
  }, 20_000);

  join
    .then((r) => {
      if (disposed) {
        r.leave();
        return;
      }
      room = r;
      if (params.init) start(r, params.init);
      else r.onMessage("init", (m: InitMsg) => start(r, m));
      r.onLeave((code) => {
        if (!leaving && !disposed) {
          toast(code === 4000 ? "Wyrzucono z gry" : "Rozłączono z serwerem", "error");
          back();
        }
      });
      r.onError((_code, message) => toast("Błąd: " + (message ?? "?"), "error"));
    })
    .catch((e: Error) => {
      toast(e.message?.includes("full") ? "Serwer gry jest pełny" : "Nie udało się dołączyć: " + e.message, "error");
      back();
    });

  function start(r: GameConnection, init: InitMsg) {
    started = true;
    clearTimeout(joinTimeout);
    loading.remove();
    const world = new WorldView(scene, { shadows: true, skyColor: init.world.skyColor, skybox: init.world.skybox });
    const parts = new Map<string, Part>(init.world.parts.map((p) => [p.id, p]));
    world.load(init.world.parts);
    for (const [id, m] of world.meshes) {
      if (parts.get(id)?.spin) continue; // kręcące się klocki muszą się ruszać
      m.freezeWorldMatrix();
      m.doNotSyncBoundingInfo = true;
    }
    const collisions = new CollisionWorld(init.world.parts);
    const gravity = init.world.gravity;
    const toolsById = new Map<string, ToolDef>(init.world.tools.map((t) => [t.id, t]));
    const toolDefs = (ids: string[]) => ids.map((id) => toolsById.get(id)).filter((t): t is ToolDef => !!t);
    world.setTools(init.world.tools);
    const charsById = new Map(init.world.characters.map((c) => [c.id, c]));
    const animsById = new Map(init.world.animations.map((a) => [a.id, a]));
    world.setCharacters(init.world.characters, init.world.animations);
    /** postać ze świata dla gracza: ustawiona skryptem albo "postać graczy" z ustawień gry */
    const charFor = (id: string | null) => charsById.get(id ?? "") ?? charsById.get(init.world.playerCharacter ?? "") ?? null;

    // ---------- kamera ----------
    // ustawienia jak w Robloxie: odległość ~12,5, zoom do 128, FOV 70°
    const camera = new ArcRotateCamera("cam", Math.PI / 2, 1.25, 12.5, new Vector3(0, 5, 0), scene);
    camera.lowerRadiusLimit = 0.5;
    camera.upperRadiusLimit = 128;
    camera.lowerBetaLimit = 0.15;
    camera.upperBetaLimit = Math.PI * 0.7;
    camera.panningSensibility = 0;
    camera.minZ = 0.2;
    camera.maxZ = 2000;
    robloxCamera(camera, GAME_INPUTS);
    camera.attachControl(true);
    // myszką obracamy prawym przyciskiem (lewy = używanie narzędzi), palcem - jak dotąd
    cleanups.push(pointerButtons(camera, canvas, [2]));
    // na starcie patrzymy w stronę środka mapy (kamera za plecami gracza)
    camera.alpha = Math.atan2(init.spawn.z, init.spawn.x);
    // odległość kamery wybrana przez gracza (kółko / szczypanie) - kolizja może ją chwilowo skrócić
    let wantRadius = camera.radius;
    let setRadius = camera.radius;

    // ---------- gracz ----------
    const local = new AvatarModel(scene, me.avatar, world.shadows);
    local.setLook(me.avatar, charFor(init.players.find((p) => p.sid === init.you)?.character ?? null));
    /** animacja-emotka włączona przez gracza (przerywa ją ruch) */
    let emoteAnim: string | null = null;
    const body: Body = { ...init.spawn, vx: 0, vy: 0, vz: 0, onGround: false };
    // na starcie postać patrzy w stronę środka mapy
    let ry = Math.hypot(init.spawn.x, init.spawn.z) > 1 ? Math.atan2(init.spawn.x, init.spawn.z) : 0;
    let anim: Anim = "idle";
    let dead = false;
    let walkSpeed = WALK_SPEED;
    let jumpPower = JUMP_POWER;
    let sendTimer = 0;
    let touching = new Set<string>();
    /** klocek pod stopami - gdy skrypt go przesunie, gracz jedzie razem z nim */
    let groundPartId: string | null = null;
    let emote: Emote | null = null;
    let boostUntil = 0;
    let boostMult = 1;
    const lastUse = new Map<string, number>();

    const spawnPoint = () => {
      const spawns = [...parts.values()].filter((p) => p.kind === "spawn");
      const s = spawns[Math.floor(Math.random() * spawns.length)];
      return s
        ? { x: s.x + (Math.random() - 0.5) * 2, y: s.y + s.sy / 2 + 3, z: s.z + (Math.random() - 0.5) * 2 }
        : { x: 0, y: 5, z: 0 };
    };

    /** fromServer = serwer już wie (np. zabity bronią) */
    const die = (fromServer = false) => {
      if (dead) return;
      dead = true;
      anim = "dead";
      emote = null;
      if (!fromServer) r.send("died");
      hotbar.select(null);
      setHp(0, maxHp);
      setTimeout(() => {
        if (disposed) return;
        Object.assign(body, spawnPoint(), { vx: 0, vy: 0, vz: 0 });
        dead = false;
        anim = "idle";
        boostUntil = 0;
        setHp(maxHp, maxHp);
        r.send("respawned");
      }, 3000);
    };

    // ---------- inni gracze ----------
    const remotes = new Map<string, Remote>();
    const makeTag = (text: string) => {
      const rect = new Rectangle();
      rect.adaptWidthToChildren = true;
      rect.height = "26px";
      rect.cornerRadius = 6;
      rect.thickness = 0;
      rect.background = "rgba(0,0,0,0.35)";
      const t = new TextBlock();
      t.text = text;
      t.color = "white";
      t.fontSize = 15;
      t.resizeToFit = true;
      t.paddingLeft = t.paddingRight = "8px";
      rect.addControl(t);
      gui.addControl(rect);
      return rect;
    };
    const addRemote = (p: NetPlayer) => {
      if (p.sid === init.you || remotes.has(p.sid)) return;
      const model = new AvatarModel(scene, p.avatar as Avatar, world.shadows, true);
      model.setLook(p.avatar as Avatar, charFor(p.character));
      if (p.animation) model.playCustom(animsById.get(p.animation) ?? null);
      model.root.position.set(p.x, p.y, p.z);
      model.setTool(p.tool ? (toolsById.get(p.tool) ?? null) : null);
      const tag = makeTag(p.username);
      tag.linkWithMesh(model.headNode);
      tag.linkOffsetY = -55;
      // pasek zdrowia pod nickiem (widoczny tylko gdy gracz jest ranny)
      const hpBar = new Rectangle();
      hpBar.width = "64px";
      hpBar.height = "7px";
      hpBar.thickness = 0;
      hpBar.cornerRadius = 3;
      hpBar.background = "rgba(0,0,0,0.5)";
      const hpFill = new Rectangle();
      hpFill.thickness = 0;
      hpFill.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_LEFT;
      hpFill.background = "#2ecc71";
      hpBar.addControl(hpFill);
      gui.addControl(hpBar);
      hpBar.linkWithMesh(model.headNode);
      hpBar.linkOffsetY = -37;
      const rm: Remote = { model, tag, hpBar, hpFill, username: p.username, avatar: p.avatar as Avatar, tx: p.x, ty: p.y, tz: p.z, tr: p.ry };
      remotes.set(p.sid, rm);
      setRemoteHp(rm, p.hp, p.maxHp);
    };
    const setRemoteHp = (rm: Remote, hp: number, max: number) => {
      const k = Math.max(0, Math.min(1, hp / max));
      rm.hpBar.isVisible = k < 1 && k > 0;
      rm.hpFill.width = k * 100 + "%";
      rm.hpFill.background = k > 0.5 ? "#2ecc71" : k > 0.25 ? "#f1c40f" : "#e74c3c";
    };
    const removeRemote = (sid: string) => {
      const rm = remotes.get(sid);
      if (!rm) return;
      rm.model.dispose();
      rm.tag.dispose();
      rm.hpBar.dispose();
      remotes.delete(sid);
    };
    init.players.forEach(addRemote);

    /** Dymek z wiadomością nad głową gracza (znika po 6 s) */
    const showBubble = (username: string, text: string) => {
      const model =
        username === me.username ? local : [...remotes.values()].find((x) => x.username === username)?.model;
      if (!model) return;
      const rect = new Rectangle();
      rect.adaptWidthToChildren = true;
      rect.adaptHeightToChildren = true;
      rect.cornerRadius = 10;
      rect.thickness = 0;
      rect.background = "rgba(255,255,255,0.92)";
      const t = new TextBlock();
      t.text = text.length > 60 ? text.slice(0, 60) + "…" : text;
      t.color = "#111";
      t.fontSize = 15;
      t.resizeToFit = true;
      t.paddingLeft = t.paddingRight = "10px";
      t.paddingTop = t.paddingBottom = "5px";
      rect.addControl(t);
      gui.addControl(rect);
      rect.linkWithMesh(model.headNode);
      rect.linkOffsetY = -95;
      setTimeout(() => rect.dispose(), 6000);
    };

    // ---------- HUD ----------
    const coinsEl = h("span", null, String(me.coins));
    const chatLog = h("div", { class: "chat-log" });
    const chatInput = h("input", {
      class: "chat-input",
      placeholder: "Napisz wiadomość i naciśnij Enter…",
      maxLength: 200,
    });
    const chatBox = h("div", { class: "chat" }, chatLog, chatInput);
    const board = h("div", { class: "leaderboard hidden" });
    const consoleLog = h("div", { class: "console-log" });
    const consoleBox = h(
      "div",
      { class: "console hidden" },
      h("div", { class: "console-head" }, "Konsola skryptów", h("button", { class: "icon-btn", onClick: () => consoleBox.classList.add("hidden") }, "✕")),
      consoleLog,
    );
    const menu = h(
      "div",
      { class: "game-menu hidden" },
      h("h3", null, init.info.name),
      h("p", { class: "muted" }, "Twórca: " + init.info.ownerName),
      h("button", { class: "btn", onClick: () => { menu.classList.add("hidden"); die(); } }, "Zresetuj postać (R)"),
      h("button", { class: "btn", onClick: () => openSettings() }, "🎚 Ustawienia (czułość kamery)"),
      h("button", { class: "btn", onClick: () => menu.classList.add("hidden") }, "Wróć do gry"),
      h("button", { class: "btn danger", onClick: () => leave() }, "Wyjdź z gry"),
    );
    const topbar = h(
      "div",
      { class: "hud-top" },
      h("button", { class: "hud-btn", onClick: () => menu.classList.toggle("hidden"), title: "Menu" }, "☰"),
      h("button", { class: "hud-btn", onClick: () => openChat(), title: "Czat" }, "💬"),
      init.info.isOwner
        ? h("button", { class: "hud-btn", onClick: () => consoleBox.classList.toggle("hidden"), title: "Konsola (F9)" }, "🖥")
        : null,
      h("div", { class: "hud-title" }, init.info.name),
      h("div", { class: "hud-coins" }, "🪙 ", coinsEl),
    );
    // pasek zdrowia gracza
    let maxHp = 100;
    const hpFill = h("div", { class: "hp-fill" });
    const hpText = h("span", { class: "hp-text" }, "100");
    const hpBox = h("div", { class: "hp-bar" }, hpFill, hpText);
    const hurt = h("div", { class: "hurt" });
    let lastHp = 100;
    function setHp(hp: number, max: number) {
      maxHp = max;
      const k = Math.max(0, Math.min(1, hp / max));
      hpFill.style.width = k * 100 + "%";
      hpFill.style.background = k > 0.5 ? "#2ecc71" : k > 0.25 ? "#f1c40f" : "#e74c3c";
      hpText.textContent = String(Math.round(hp));
      if (hp < lastHp && hp > 0) {
        local.flash();
        hurt.classList.remove("on");
        void hurt.offsetWidth;
        hurt.classList.add("on");
      }
      lastHp = hp;
    }

    // ---------- światło, latarka, dźwięki, mowa ----------
    const light = { ...DEFAULT_LIGHT, ...(init.world.light ?? {}) };
    world.setLight(light.brightness, light.fog);
    const audio = new GameAudio(init.world.sounds, init.world.music);
    cleanups.push(() => audio.dispose());
    if (light.flashlight) {
      // latarka świeci tam, gdzie patrzy kamera, a małe światło wokół gracza pozwala widzieć ściany obok
      const torch = new SpotLight("torch", Vector3.Zero(), new Vector3(0, 0, 1), 1.15, 1.5, scene);
      torch.intensity = 2.6;
      torch.range = 90;
      torch.diffuse = new Color3(1, 0.95, 0.8);
      const glow = new PointLight("glow", Vector3.Zero(), scene);
      glow.intensity = 0.45;
      glow.range = 18;
      scene.onBeforeRenderObservable.add(() => {
        const head = new Vector3(body.x, body.y + 4.4, body.z);
        const dir = camera.target.subtract(camera.position);
        dir.y *= 0.6;
        torch.position.copyFrom(head);
        torch.direction = dir.normalize();
        glow.position.copyFrom(head);
      });
    }

    // okienko z pytaniem od skryptu (prompt) - odpowiedź trafia do onAnswer
    const promptBox = h("div", { class: "prompt-box hidden" });
    let promptId = "";
    const showPrompt = (m: { id: string; question: string; speak?: string; lang?: string } | null) => {
      if (!m) {
        promptBox.classList.add("hidden");
        return;
      }
      promptId = m.id;
      const input = h("input", { class: "prompt-input", maxLength: 80, autocomplete: "off", placeholder: "Wpisz odpowiedź…" });
      const send = () => {
        const text = input.value.trim();
        if (!text) return;
        r.send("answer", { id: promptId, text });
        promptBox.classList.add("hidden");
        input.blur();
      };
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") send();
      });
      promptBox.replaceChildren(
        h("div", { class: "prompt-q" }, m.question),
        h(
          "div",
          { class: "prompt-row" },
          m.speak ? h("button", { class: "btn", title: "Posłuchaj jeszcze raz", onClick: () => audio.speak(m.speak!, m.lang) }, "🔊") : "",
          input,
          h("button", { class: "btn primary", onClick: send }, "OK"),
        ),
      );
      promptBox.classList.remove("hidden");
      if (m.speak) audio.speak(m.speak, m.lang);
      setTimeout(() => input.focus(), 50);
    };
    wrap.append(promptBox);

    // emotki
    const emoteMenu = h(
      "div",
      { class: "emote-menu hidden" },
      EMOTES.filter(hasEmote).map((e) =>
        h("button", { class: "btn small", onClick: () => (startEmote(e), emoteMenu.classList.add("hidden")) }, EMOTE_LABELS[e]),
      ),
      SHOP_EMOTES.some((e) => !hasEmote(e)) ? h("div", { class: "emote-more" }, "Więcej emotek: Awatar → 💃 Emotki") : null,
      // animacje zrobione w edytorze animacji i oznaczone jako emotki
      init.world.animations
        .filter((a) => a.emote)
        .map((a) =>
          h("button", { class: "btn small", onClick: () => (startAnimEmote(a.id), emoteMenu.classList.add("hidden")) }, "✨ " + a.name),
        ),
    );
    const startAnimEmote = (id: string) => {
      if (dead) return;
      emote = null;
      emoteAnim = id;
      hotbar.select(null);
      local.playCustom(animsById.get(id) ?? null);
      r.send("anim", id);
    };
    const stopAnimEmote = () => {
      if (!emoteAnim) return;
      emoteAnim = null;
      local.playCustom(null);
      r.send("anim", null);
    };
    const startEmote = (e: Emote) => {
      if (!dead && body.onGround) {
        emote = e;
        hotbar.select(null);
      }
    };
    topbar.insertBefore(
      h("button", { class: "hud-btn", onClick: () => emoteMenu.classList.toggle("hidden"), title: "Emotki" }, "😀"),
      topbar.querySelector(".hud-title"),
    );

    // przycisk akcji na dotyku (strzał / cios w stronę środka ekranu)
    const actionBtn = h("div", { class: "action-btn hidden" }, "⚔️");
    actionBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      useTool();
    });

    const hotbar = new Hotbar(wrap, (id) => {
      const def = id ? (toolsById.get(id) ?? null) : null;
      local.setTool(def);
      r.send("equip", id);
      if (def) emote = null;
      actionBtn.classList.toggle("hidden", !def || !isTouch());
      if (def) actionBtn.textContent = def.type === "ranged" ? "🎯" : def.type === "melee" ? "⚔️" : "✋";
      canvas.classList.toggle("aiming", def?.type === "ranged");
    });
    hotbar.set(toolDefs(init.inventory));

    wrap.append(topbar, chatBox, board, consoleBox, menu, hpBox, hurt, emoteMenu, actionBtn);
    // czat głosowy ze znajomymi (tylko w grze na serwerze)
    if (!params.offline) {
      const voice = new VoiceChat(r, init.you);
      topbar.insertBefore(voice.button, topbar.querySelector(".hud-title"));
      wrap.append(voice.panel);
      cleanups.push(() => voice.dispose());
    }

    const addChat = (m: ChatMsg) => {
      const line = m.system
        ? h("div", { class: "chat-line system" }, m.text)
        : h("div", { class: "chat-line" }, h("b", null, m.from + ": "), m.text);
      chatLog.append(line);
      while (chatLog.children.length > 60) chatLog.firstChild?.remove();
      chatLog.scrollTop = chatLog.scrollHeight;
      if (!m.system) showBubble(m.from, m.text);
    };
    const openChat = () => {
      chatBox.classList.add("open");
      chatInput.focus();
    };
    chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const t = chatInput.value.trim();
        const em = /^\/e(?:mote)?\s+(\S+)/i.exec(t);
        if (em) {
          const e = EMOTE_ALIASES[em[1].toLowerCase()];
          if (e && hasEmote(e)) startEmote(e);
          else if (e) toast("Tę emotkę kupisz w sklepie: Awatar → 💃 Emotki", "info");
          else toast("Emotki: /e wave, dance, cheer, point, sit", "info");
        } else if (t) r.send("chat", t);
        chatInput.value = "";
        chatInput.blur();
      } else if (e.key === "Escape") chatInput.blur();
    });
    chatInput.addEventListener("focus", () => {
      input.enabled = false;
      chatBox.classList.add("open");
    });
    chatInput.addEventListener("blur", () => {
      input.enabled = true;
      chatBox.classList.remove("open");
    });
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === chatInput) return;
      if (e.key === "Enter" || e.key === "/") {
        e.preventDefault();
        openChat();
      } else if (e.code === "KeyR") die();
      else if (/^Digit[1-9]$/.test(e.code)) hotbar.toggle(Number(e.code.slice(5)) - 1);
      else if (e.code === "Digit0" || e.code === "Backquote") hotbar.select(null);
      else if (e.key === "Escape") menu.classList.toggle("hidden");
      else if (e.key === "F9" && init.info.isOwner) consoleBox.classList.toggle("hidden");
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));

    // ---------- wiadomości z serwera ----------
    r.onMessage("join", (p: NetPlayer) => addRemote(p));
    r.onMessage("leave", (sid: string) => removeRemote(sid));
    r.onMessage("chat", (m: ChatMsg) => addChat(m));
    r.onMessage("s", (snap: [string, number, number, number, number, Anim][]) => {
      for (const [sid, x, y, z, rot, a] of snap) {
        const rm = remotes.get(sid);
        if (!rm) continue;
        rm.tx = x;
        rm.ty = y;
        rm.tz = z;
        rm.tr = rot;
        rm.model.anim = a;
      }
    });
    r.onMessage("part", (changes: (Partial<Part> & { id: string })[]) => {
      for (const c of changes) {
        const p = parts.get(c.id);
        if (!p) continue;
        if (c.id === groundPartId && body.onGround) {
          // ruchoma platforma - przesuwamy gracza o tyle samo
          body.x += (c.x ?? p.x) - p.x;
          body.y += (c.y ?? p.y) - p.y + ((c.sy ?? p.sy) - p.sy) / 2;
          body.z += (c.z ?? p.z) - p.z;
        }
        Object.assign(p, c);
        const mesh = world.meshes.get(p.id);
        mesh?.unfreezeWorldMatrix();
        world.apply(p);
        if (!p.spin) mesh?.freezeWorldMatrix();
        collisions.set(p);
      }
    });
    r.onMessage("kill", () => die(true));
    r.onMessage("inv", (ids: string[]) => hotbar.set(toolDefs(ids)));
    r.onMessage("picked", (id: string) => {
      const t = toolsById.get(id);
      if (t) toast(`Podniesiono: ${t.name} (klawisz ${hotbar.indexOf(id) + 1})`, "good");
    });
    r.onMessage("eq", (m: { sid: string; tool: string | null }) => {
      if (m.sid === init.you) return;
      remotes.get(m.sid)?.model.setTool(m.tool ? (toolsById.get(m.tool) ?? null) : null);
    });
    r.onMessage("act", (m: { sid: string; type: ActionAnim; tool: string; from?: number[]; to?: number[] }) => {
      if (m.sid === init.you) return;
      remotes.get(m.sid)?.model.playAction(m.type);
      if (m.from && m.to) tracer(Vector3.FromArray(m.from), Vector3.FromArray(m.to), toolsById.get(m.tool)?.color);
    });
    r.onMessage("hp", (m: { sid: string; hp: number; max: number }) => {
      if (m.sid === init.you) return setHp(m.hp, m.max);
      const rm = remotes.get(m.sid);
      if (!rm) return;
      const before = rm.hpFill.width;
      setRemoteHp(rm, m.hp, m.max);
      if (m.hp > 0 && before !== rm.hpFill.width) rm.model.flash();
    });
    r.onMessage("char", (m: { sid: string; character: string | null }) => {
      const model = m.sid === init.you ? local : remotes.get(m.sid)?.model;
      const avatar = m.sid === init.you ? me.avatar : (remotes.get(m.sid)?.avatar ?? me.avatar);
      model?.setLook(avatar, charFor(m.character));
    });
    r.onMessage("panim", (m: { sid: string; anim: string | null }) => {
      if (m.sid === init.you) {
        // animację włączoną przez skrypt gracz widzi u siebie; własną emotkę już odtwarza
        if (m.anim !== emoteAnim) {
          emoteAnim = null;
          local.playCustom(m.anim ? (animsById.get(m.anim) ?? null) : null);
        }
        return;
      }
      remotes.get(m.sid)?.model.playCustom(m.anim ? (animsById.get(m.anim) ?? null) : null);
    });
    r.onMessage("sky", (c: string) => world.setSky(c));
    r.onMessage("skybox", (id: string) => (id ? world.setSkybox(id) : world.setSky(init.world.skyColor)));
    r.onMessage("light", (l: { brightness?: number; fog?: number }) => {
      if (typeof l.brightness === "number") light.brightness = l.brightness;
      if (typeof l.fog === "number") light.fog = l.fog;
      world.setLight(light.brightness, light.fog);
    });
    r.onMessage("sound", (m: { name: string }) => audio.play(m.name));
    r.onMessage("music", (m: { name: string }) => audio.setMusic(m.name));
    r.onMessage("speak", (m: { text: string; lang?: string }) => audio.speak(m.text, m.lang));
    r.onMessage("prompt", (m: { id: string; question: string; speak?: string; lang?: string } | null) => showPrompt(m));
    r.onMessage("boost", (b: { secs: number; mult: number }) => {
      boostUntil = performance.now() + b.secs * 1000;
      boostMult = b.mult;
      toast(`⚡ Przyspieszenie na ${b.secs} s!`, "good");
    });

    // ---------- używanie narzędzi ----------
    const tracerMats = new Map<string, StandardMaterial>();
    function tracer(from: Vector3, to: Vector3, color = "#ffe066") {
      let m = tracerMats.get(color);
      if (!m) {
        m = new StandardMaterial("tracer", scene);
        m.emissiveColor = hexColor(color).add(new Color3(0.3, 0.3, 0.3));
        m.disableLighting = true;
        m.alpha = 0.85;
        tracerMats.set(color, m);
      }
      const tube = MeshBuilder.CreateTube("tracer", { path: [from, to], radius: 0.07, tessellation: 6 }, scene);
      tube.material = m;
      tube.isPickable = false;
      const spark = MeshBuilder.CreateSphere("spark", { diameter: 0.6, segments: 6 }, scene);
      spark.position.copyFrom(to);
      spark.material = m;
      spark.isPickable = false;
      setTimeout(() => {
        tube.dispose();
        spark.dispose();
      }, 90);
    }

    /** Używa trzymanego narzędzia, celując w punkt ekranu (domyślnie środek) */
    function useTool(sx = engine.getRenderWidth() / 2, sy = engine.getRenderHeight() / 2) {
      const def = hotbar.current;
      if (!def || dead) return;
      const now = performance.now();
      if (now - (lastUse.get(def.id) ?? 0) < def.cooldown * 1000) return;
      lastUse.set(def.id, now);
      hotbar.cooldown(def.id, def.cooldown);
      emote = null;

      // punkt, w który celujemy
      const ray = scene.createPickingRay(sx, sy, Matrix.Identity(), camera);
      const pick = scene.pickWithRay(ray, (m: AbstractMesh) => m.isPickable && m.isVisible && m.isEnabled());
      const aim = pick?.pickedPoint ?? ray.origin.add(ray.direction.scale(Math.max(def.range, 50)));
      const face = (dx: number, dz: number) => {
        if (Math.hypot(dx, dz) > 0.01) ry = Math.atan2(-dx, -dz);
      };
      let action: ActionAnim = "use";
      const msg: Record<string, unknown> = { id: def.id };
      if (def.type === "ranged") {
        action = "shoot";
        face(aim.x - body.x, aim.z - body.z);
        local.root.rotation.y = ry;
        local.root.computeWorldMatrix(true);
        const origin = local.toolTip() ?? new Vector3(body.x, body.y + 4.5, body.z);
        const dir = aim.subtract(origin).normalize();
        Object.assign(msg, { ox: origin.x, oy: origin.y, oz: origin.z, dx: dir.x, dy: dir.y, dz: dir.z });
        const hit = aim.subtract(origin).length() <= def.range ? aim : origin.add(dir.scale(def.range));
        tracer(origin, hit, def.color);
      } else if (def.type === "melee" || def.type === "custom") {
        action = "swing";
        face(aim.x - body.x, aim.z - body.z);
      }
      msg.ry = ry;
      local.playAction(action);
      r.send("use", msg);
    }

    scene.onPointerObservable.add((pi) => {
      if (pi.type !== PointerEventTypes.POINTERTAP || !hotbar.current) return;
      if ((pi.event as PointerEvent).button !== 0 && (pi.event as PointerEvent).pointerType === "mouse") return;
      useTool(scene.pointerX, scene.pointerY);
    });
    r.onMessage("tp", (t: { x: number; y: number; z: number }) => {
      Object.assign(body, t, { vx: 0, vy: 0, vz: 0 });
    });
    r.onMessage("stats", (s: { speed?: number; jump?: number }) => {
      if (typeof s.speed === "number") walkSpeed = s.speed;
      if (typeof s.jump === "number") jumpPower = s.jump;
    });
    r.onMessage("scores", (list: { name: string; score: number }[]) => {
      board.classList.toggle("hidden", list.length === 0);
      board.replaceChildren(
        h("div", { class: "lb-head" }, h("span", null, "Gracz"), h("span", null, "Punkty")),
        ...list
          .sort((a, b) => b.score - a.score)
          .map((e) => h("div", { class: "lb-row" }, h("span", null, e.name), h("span", null, String(e.score)))),
      );
    });
    r.onMessage("coins", (c: { earned: number; coins: number }) => {
      coinsEl.textContent = String(c.coins);
      if (session.user) session.set({ ...session.user, coins: c.coins });
      toast(`+${c.earned} 🪙 za granie`, "good");
    });
    r.onMessage("log", (l: { text: string; error: boolean }) => {
      consoleLog.append(h("div", { class: l.error ? "log-err" : "log-line" }, l.text));
      consoleLog.scrollTop = consoleLog.scrollHeight;
      if (l.error) consoleBox.classList.remove("hidden");
    });

    // ---------- pętla gry ----------
    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      input.update();

      // kierunek ruchu względem kamery
      const fx = camera.target.x - camera.position.x;
      const fz = camera.target.z - camera.position.z;
      const fl = Math.hypot(fx, fz) || 1;
      const fwdX = fx / fl, fwdZ = fz / fl;
      const rightX = fwdZ, rightZ = -fwdX;
      let mx = 0, mz = 0;
      if (!dead) {
        mx = rightX * input.moveX + fwdX * input.moveY;
        mz = rightZ * input.moveX + fwdZ * input.moveY;
      }
      const moving = Math.hypot(mx, mz) > 0.05;
      const speed = walkSpeed * (performance.now() < boostUntil ? boostMult : 1);
      body.vx = mx * speed;
      body.vz = mz * speed;
      if (!dead && input.jump && body.onGround) {
        body.vy = jumpPower;
        body.onGround = false;
      }

      // fizyka w małych krokach
      const steps = Math.ceil(dt / (1 / 60));
      const newTouch = new Set<string>();
      for (let i = 0; i < steps; i++) {
        const res = stepBody(collisions, body, dt / steps, gravity);
        for (const p of res.touched) {
          newTouch.add(p.id);
          if (p.kind === "kill" && !dead) die();
        }
        if (res.landedOn?.kind === "bounce" && !dead) body.vy = BOUNCE_POWER;
        groundPartId = res.landedOn?.id ?? null;
      }
      // gracze nie przenikają przez siebie - lekko się odpychamy (jak w Robloxie)
      if (!dead) {
        const minDist = PLAYER_RADIUS * 2 * 0.9;
        for (const rm of remotes.values()) {
          if (rm.model.anim === "dead") continue;
          const o = rm.model.root.position;
          if (Math.abs(o.y - body.y) > 4.5) continue;
          const dx = body.x - o.x;
          const dz = body.z - o.z;
          const d = Math.hypot(dx, dz);
          if (d >= minDist) continue;
          const push = minDist - d;
          const nx = d > 1e-3 ? dx / d : 1;
          const nz = d > 1e-3 ? dz / d : 0;
          body.x += nx * push;
          body.z += nz * push;
        }
      }
      for (const id of newTouch) if (!touching.has(id)) r.send("touch", id);
      touching = newTouch;
      if (body.y < -150 && !dead) die();

      // obrót postaci w stronę ruchu (w pierwszej osobie - w stronę kamery)
      const firstPerson = camera.radius < 1.5;
      if (firstPerson) ry = Math.atan2(-fwdX, -fwdZ);
      else if (moving) {
        const target = Math.atan2(-mx, -mz);
        let diff = target - ry;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ry += diff * Math.min(1, dt * 14);
      }
      if (!dead) {
        anim = !body.onGround ? (body.vy > 0 ? "jump" : "fall") : moving ? "walk" : "idle";
        // ruch albo skok przerywa emotkę
        if (anim !== "idle") {
          emote = null;
          stopAnimEmote();
        } else if (emote) anim = emote;
      }

      local.root.position.set(body.x, body.y, body.z);
      local.root.rotation.y = ry;
      local.anim = anim;
      local.update(dt);
      local.setVisible(!firstPerson);

      // kamera za graczem
      const head = new Vector3(body.x, body.y + 4.6, body.z);
      // kamera sztywno za graczem, bez opóźnienia
      camera.target.copyFrom(head);
      // kolizja kamery: jeśli ściana zasłania gracza, kamera się przysuwa
      if (Math.abs(camera.radius - setRadius) > 0.001) wantRadius = camera.radius;
      const off = camera.position.subtract(camera.target).normalize();
      const block = raycastParts(collisions, camera.target.x, camera.target.y, camera.target.z, off.x, off.y, off.z, wantRadius);
      camera.radius = block ? Math.max(camera.lowerRadiusLimit ?? 0.5, block.dist - 0.6) : wantRadius;
      setRadius = camera.radius;
      world.followShadows(head);

      // inni gracze - płynne przejście do pozycji z serwera
      const k = Math.min(1, dt * 12);
      for (const rm of remotes.values()) {
        const p = rm.model.root.position;
        if (Math.abs(rm.tx - p.x) + Math.abs(rm.ty - p.y) + Math.abs(rm.tz - p.z) > 40) p.set(rm.tx, rm.ty, rm.tz);
        else p.set(p.x + (rm.tx - p.x) * k, p.y + (rm.ty - p.y) * k, p.z + (rm.tz - p.z) * k);
        let d = rm.tr - rm.model.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        rm.model.root.rotation.y += d * k;
        rm.model.update(dt);
      }

      sendTimer += dt;
      if (sendTimer >= SEND_EVERY) {
        sendTimer = 0;
        r.send("m", { x: body.x, y: body.y, z: body.z, ry, a: anim });
      }
    });
  }

  const cleanups: (() => void)[] = [];
  engine.runRenderLoop(() => scene.activeCamera && scene.render());

  function leave() {
    leaving = true;
    room?.leave();
    back();
  }

  return () => {
    clearTimeout(joinTimeout);
    disposed = true;
    leaving = true;
    room?.leave();
    cleanups.forEach((f) => f());
    input.dispose();
    scene.dispose();
    disposeEngine();
    wrap.remove();
  };
}
