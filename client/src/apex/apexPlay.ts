// Apex (eksperymentalny): ekran gry 3D na własnym silniku WebGL2. Używa tej samej sieci, fizyki (CollisionWorld/stepBody),
// czatu, GUI i sterowania co silnik Babylon - zmienia się tylko warstwa rysowania. Gry, których Apex jeszcze nie
// umie (narzędzia, siedzenia, światy z blokami), uruchamiają się w Babylonie (patrz apexUnsupported).
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { CollisionWorld, PLAYER_RADIUS, raycastParts, rotationMatrix, stepBody, SWIM_CHEST, waterAt, type Body, type SwimInput } from "../../../shared/physics.ts";
import { findSkybox } from "../../../shared/skybox.ts";
import { TerrainGrid } from "../../../shared/terrain.ts";
import type { Anim, Avatar, ChatMsg, NetPlayer, Part } from "../../../shared/types.ts";
import { DEFAULT_LIGHT } from "../../../shared/types.ts";
import { Input } from "../engine/input.ts";
import { chatBox } from "../game/chatBox.ts";
import { GameAudio } from "../game/audio3d.ts";
import type { GameConnection } from "../game/connection.ts";
import { promptBox, type PromptMsg } from "../game/promptBox.ts";
import type { InitMsg } from "../game/play.ts";
import { openSettings, settings } from "../settings.ts";
import { safety } from "../safety.ts";
import { session } from "../state.ts";
import { GuiOverlay } from "../ui/guiOverlay.ts";
import { h, toast } from "../ui/dom.ts";
import { ApexAvatar } from "./avatar.ts";
import { ROBLOX_FOV } from "../engine/camera.ts";
import { ApexRenderer } from "./renderer.ts";
import type { V3 } from "./math.ts";

const WALK_SPEED = 16;
const SWIM_SLOW = 0.7;
const JUMP_POWER = 50;
const BOUNCE_POWER = 110;
const SEND_EVERY = 1 / 15;
const MAIN_PLACE = "main";

/** powód, dla którego Apex nie uruchomi tej gry (null = da radę) */
export function apexUnsupported(init: InitMsg): string | null {
  const w = init.world;
  if (typeof WebGL2RenderingContext === "undefined") return "ta przeglądarka nie ma WebGL2";
  if (w.blocks) return "to świat z blokami (Minecraft)";
  if (w.tools?.length) return "gra ma narzędzia (jeszcze nie w Apex)";
  if (w.parts.some((p) => p.kind === "seat")) return "gra ma siedzenia i pojazdy (jeszcze nie w Apex)";
  if ((w.places?.length ?? 0) > 1) return "gra ma kilka miejsc (jeszcze nie w Apex)";
  return null;
}

interface Remote {
  av: ApexAvatar;
  tag: HTMLElement;
  hpFill: HTMLElement;
  hpBar: HTMLElement;
  tx: number; ty: number; tz: number; tr: number;
  username: string;
}

export interface ApexParams {
  conn: GameConnection;
  init: InitMsg;
  back?: { screen: string; params?: Record<string, unknown> };
  offline?: boolean;
  privateCode?: string;
  worldId?: number;
}

export function apexPlayScreen(root: HTMLElement, params: ApexParams, go: (screen: string, params?: Record<string, unknown>) => void): () => void {
  const { init, conn: r } = params;
  const canvas = h("canvas", { class: "game-canvas" });
  const tagLayer = h("div", { class: "apex-tags" });
  const tint = h("div", { class: "underwater-tint" });
  const wrap = h("div", { class: "play-screen apex-play" }, canvas, tagLayer, tint);
  root.append(wrap);
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let leaving = false;
  const back = () => go(params.back?.screen ?? "home", params.back?.params);
  const me = session.user ?? { id: 0, username: "Gracz", coins: 0, avatar: DEFAULT_AVATAR, inventory: [] };

  const rend = new ApexRenderer(canvas);
  const input = new Input(wrap, (k) => (k === "ps" ? "✕ skok, prawa gałka kamera, Options menu" : "A skok, prawa gałka kamera, Menu = menu"));
  input.padDpadMoves = false;

  // ---------- świat ----------
  const parts = new Map<string, Part>(init.world.parts.map((p) => [p.id, p]));
  const rot = (p: Part) => rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0);
  const spinning = new Map<string, number>();
  const charsById = new Map(init.world.characters.map((c) => [c.id, c]));
  const npcs = new Map<string, ApexAvatar>();
  const labels = new Map<string, HTMLElement>();
  const isNpc = (p: Part) => p.kind === "npc" && p.transparency < 0.999;
  const refreshPart = (p: Part) => {
    rend.updatePart(p, rot(p));
    if (p.spin) spinning.set(p.id, p.ry);
    else spinning.delete(p.id);
    if (isNpc(p)) {
      rend.removePart(p.id);
      let n = npcs.get(p.id);
      const ch = p.characterId ? charsById.get(p.characterId) : undefined;
      if (!n) npcs.set(p.id, (n = new ApexAvatar(rend, ch?.look ?? DEFAULT_AVATAR)));
      n.scale = ch?.scale ?? 1;
      n.x = p.x; n.y = p.y - p.sy / 2; n.z = p.z;
      n.ry = (p.ry * Math.PI) / 180;
    } else if (npcs.has(p.id)) {
      npcs.get(p.id)?.dispose();
      npcs.delete(p.id);
    }
    if (p.label && p.transparency < 0.999 && p.kind !== "npc") {
      let el = labels.get(p.id);
      if (!el) tagLayer.append((el = h("div", { class: "apex-tag part" })));
      labels.set(p.id, el);
      if (el.textContent !== p.label) el.textContent = p.label;
    } else if (labels.has(p.id)) {
      labels.get(p.id)?.remove();
      labels.delete(p.id);
    }
  };
  for (const p of parts.values()) refreshPart(p);
  const collisions = new CollisionWorld(init.world.parts);
  const terrain = TerrainGrid.decode(init.world.terrain);
  collisions.terrain = terrain;
  rend.setTerrain(terrain);
  const light = { ...DEFAULT_LIGHT, ...(init.world.light ?? {}) };
  let skyColor = init.world.skyColor;
  const setSkybox = (id: string | null | undefined) => rend.setSky(skyColor, findSkybox(id));
  setSkybox(init.world.skybox);
  rend.setLight(light.brightness, light.fog);
  const gravity = init.world.gravity;

  // ---------- gracz ----------
  const body: Body = { ...init.spawn, vx: 0, vy: 0, vz: 0, onGround: false };
  const mePlayer = init.players.find((p) => p.sid === init.you);
  const local = new ApexAvatar(rend, me.avatar);
  const charFor = (id: string | null) => charsById.get(id ?? "") ?? charsById.get(init.world.playerCharacter ?? "") ?? null;
  const applyLook = (av: ApexAvatar, base: Avatar, charId: string | null) => {
    const c = charFor(charId);
    av.setLook(c?.look ?? base);
    av.scale = c?.scale ?? 1;
  };
  applyLook(local, me.avatar, mePlayer?.character ?? null);
  let ry = Math.hypot(init.spawn.x, init.spawn.z) > 1 ? Math.atan2(init.spawn.x, init.spawn.z) : 0;
  let anim: Anim = "idle";
  let dead = false;
  let walkSpeed = WALK_SPEED;
  let jumpPower = JUMP_POWER;
  let swimming = false;
  let boostUntil = 0;
  let boostMult = 1;
  let maxHp = 100;
  let groundPartId: string | null = null;
  let touching = new Set<string>();
  let jumpWasDown = false;
  let sendTimer = 0;
  const spawnPoint = () => ({ x: init.spawn.x, y: init.spawn.y, z: init.spawn.z });

  // ---------- kamera ----------
  let alpha = Math.atan2(init.spawn.z, init.spawn.x);
  let beta = 1.25;
  let wantRadius = 12.5;
  let radius = wantRadius;
  const eye: V3 = [0, 0, 0];
  const target: V3 = [0, 0, 0];
  const camDir = () => [Math.cos(alpha) * Math.sin(beta), Math.cos(beta), Math.sin(alpha) * Math.sin(beta)] as V3;
  const clampBeta = (b: number, fp: boolean) => Math.min(fp ? Math.PI * 0.94 : Math.PI * 0.7, Math.max(fp ? 0.05 : 0.15, b));
  const firstPerson = () => wantRadius < 1.5;
  const look = (dx: number, dy: number, perPx: number) => {
    alpha -= dx * perPx;
    beta = clampBeta(beta - dy * perPx * (settings.invertY ? -1 : 1), firstPerson());
  };
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 2 && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) wantRadius = Math.min(128, Math.max(0.5, wantRadius * (pinch / d)));
      pinch = d;
      return;
    }
    if (e.pointerType === "mouse" && e.buttons === 1 && !firstPerson()) return;
    const deg = e.pointerType === "mouse" ? 0.32 : 0.45;
    look(dx, dy, ((deg * settings.sensitivity) * Math.PI) / 180);
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    wantRadius = Math.min(128, Math.max(0.5, wantRadius * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  // lewy przycisk myszy obraca kamerę tylko w pierwszej osobie, prawy zawsze (jak w Babylonie)
  const onMouseMoveLeft = (e: MouseEvent) => {
    if (e.buttons === 1 && firstPerson()) look(e.movementX, e.movementY, ((0.32 * settings.sensitivity) * Math.PI) / 180);
  };
  void onMouseMoveLeft;

  // ---------- inni gracze ----------
  const remotes = new Map<string, Remote>();
  const addRemote = (p: NetPlayer) => {
    if (p.sid === init.you || remotes.has(p.sid)) return;
    const av = new ApexAvatar(rend, p.avatar as Avatar);
    applyLook(av, p.avatar as Avatar, p.character);
    av.x = p.x; av.y = p.y; av.z = p.z; av.ry = p.ry;
    const hpFill = h("div", { class: "hp-fill" });
    const hpBar = h("div", { class: "apex-hp hidden" }, hpFill);
    const tag = h("div", { class: "apex-tag" }, h("span", null, p.username), hpBar);
    tagLayer.append(tag);
    const rm: Remote = { av, tag, hpFill, hpBar, tx: p.x, ty: p.y, tz: p.z, tr: p.ry, username: p.username };
    remotes.set(p.sid, rm);
    setRemoteHp(rm, p.hp, p.maxHp);
  };
  const setRemoteHp = (rm: Remote, hp: number, max: number) => {
    const k = Math.max(0, Math.min(1, hp / max));
    rm.hpBar.classList.toggle("hidden", !(k < 1 && k > 0));
    rm.hpFill.style.width = k * 100 + "%";
    rm.hpFill.style.background = k > 0.5 ? "#2ecc71" : k > 0.25 ? "#f1c40f" : "#e74c3c";
  };
  const removeRemote = (sid: string) => {
    const rm = remotes.get(sid);
    if (!rm) return;
    rm.av.dispose();
    rm.tag.remove();
    remotes.delete(sid);
  };
  init.players.forEach(addRemote);

  // ---------- HUD ----------
  const coinsEl = h("span", null, String(me.coins));
  const bubbles = new Map<string, HTMLElement>();
  const addChat = (m: ChatMsg) => {
    if (!m.system && safety.isBlockedName(m.from)) return;
    chat.add(m);
    if (m.system) return;
    const rm = [...remotes.values()].find((x) => x.username === m.from);
    const host = rm?.tag ?? (m.from === me.username ? localTag : null);
    if (!host) return;
    bubbles.get(m.from)?.remove();
    const b = h("div", { class: "apex-bubble" }, m.text.slice(0, 80));
    host.append(b);
    bubbles.set(m.from, b);
    setTimeout(() => b.remove(), 6000);
  };
  const chat = chatBox({
    placeholder: "Napisz wiadomość…",
    onSend: (t) => r.send("chat", t),
    onTyping: (typing) => (input.enabled = !typing),
  });
  const localTag = h("div", { class: "apex-tag me" }, h("span", null, me.username));
  tagLayer.append(localTag);
  const hpFillEl = h("div", { class: "hp-fill" });
  const hpText = h("span", { class: "hp-text" }, "100");
  const hpBox = h("div", { class: "hp-bar" }, hpFillEl, hpText);
  const hurt = h("div", { class: "hurt" });
  let lastHp = 100;
  const setHp = (hp: number, max: number) => {
    maxHp = max;
    const k = Math.max(0, Math.min(1, hp / max));
    hpFillEl.style.width = k * 100 + "%";
    hpFillEl.style.background = k > 0.5 ? "#2ecc71" : k > 0.25 ? "#f1c40f" : "#e74c3c";
    hpText.textContent = String(Math.round(hp));
    if (hp < lastHp && hp > 0) {
      local.flash();
      hurt.classList.remove("on");
      void hurt.offsetWidth;
      hurt.classList.add("on");
    }
    lastHp = hp;
  };
  const board = h("div", { class: "leaderboard hidden" });
  const debug = h("div", { class: "apex-debug" });
  let showDebug = false;
  debug.style.display = "none";
  const menu = h(
    "div",
    { class: "game-menu hidden" },
    h("h3", null, init.info.name),
    h("p", { class: "muted" }, "Twórca: " + init.info.ownerName + " · silnik Apex (eksperymentalny)"),
    h("button", { class: "btn", onClick: () => (menu.classList.add("hidden"), die()) }, "Zresetuj postać (R)"),
    h("button", { class: "btn", onClick: () => openSettings() }, "🎚 Ustawienia (silnik, kamera)"),
    h("button", { class: "btn", onClick: () => (showDebug = !showDebug, (debug.style.display = showDebug ? "block" : "none")) }, "📊 Statystyki silnika (F3)"),
    h("button", { class: "btn", onClick: () => menu.classList.add("hidden") }, "Wróć do gry"),
    h("button", { class: "btn danger", onClick: () => leave() }, "Wyjdź z gry"),
  );
  const topbar = h(
    "div",
    { class: "hud-top" },
    h("button", { class: "hud-btn", onClick: () => menu.classList.toggle("hidden"), title: "Menu" }, "☰"),
    chat.button,
    h("div", { class: "hud-title" }, init.info.name),
    h("div", { class: "hud-coins" }, "🪙 ", coinsEl),
  );
  wrap.append(topbar, chat.box, board, menu, hpBox, hurt, debug);
  const audio = new GameAudio(init.world.sounds, init.world.music);
  cleanups.push(() => audio.dispose());
  const showPrompt = promptBox(wrap, (id, text) => r.send("answer", { id, text }), (t, l) => audio.speak(t, l));
  void import("../game/clientScripts.ts").then(({ startClientScripts }) =>
    startClientScripts({
      conn: r,
      scripts: init.clientScripts ?? [],
      container: wrap,
      myName: me.username,
      myPos: () => [body.x, body.y, body.z],
      say: (text) => chat.add({ from: "", text, system: true }),
      setLight: (b, fog) => {
        if (b !== undefined) light.brightness = Math.min(1.5, Math.max(0.02, b));
        if (fog !== undefined) light.fog = Math.min(2000, Math.max(0, fog));
        rend.setLight(light.brightness, light.fog);
      },
      setSky: (c) => ((skyColor = c), setSkybox(null)),
      setSkybox: (id) => setSkybox(id || null),
      playSound: (name) => audio.play(name),
      keysEnabled: () => !chat.typing() && !guiLayer.modal,
    }).then((cs) => (cs ? (disposed ? cs.dispose() : cleanups.push(() => cs.dispose())) : null)),
  );
  const guiLayer = new GuiOverlay(wrap, init.world.guis ?? [], (g, e) => r.send("gui", { g, e }));
  guiLayer.setWhere(init.world.currentPlace?.id ?? MAIN_PLACE);
  cleanups.push(() => guiLayer.dispose());

  function die(fromServer = false) {
    if (dead) return;
    dead = true;
    anim = "dead";
    if (!fromServer) r.send("died");
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
  }
  function leave() {
    leaving = true;
    r.leave();
    back();
  }

  const onKey = (e: KeyboardEvent) => {
    if (chat.typing()) return;
    if (e.key === "Enter" || e.key === "/") {
      e.preventDefault();
      chat.focus();
    } else if (e.code === "KeyR") die();
    else if (e.key === "Escape") menu.classList.toggle("hidden");
    else if (e.key === "F3") {
      e.preventDefault();
      showDebug = !showDebug;
      debug.style.display = showDebug ? "block" : "none";
    }
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
      rm.tx = x; rm.ty = y; rm.tz = z; rm.tr = rot;
      rm.av.anim = a;
    }
  });
  /** płynne przesunięcia (tweenPart, fizyka brył): klient dochodzi do pozycji z serwera */
  const tweens = new Map<string, { fx: number; fy: number; fz: number; t0: number; dur: number }>();
  const shownPos = (p: Part): [number, number, number] => {
    const tw = tweens.get(p.id);
    if (!tw) return [p.x, p.y, p.z];
    const k = Math.min(1, (performance.now() - tw.t0) / 1000 / tw.dur);
    return [tw.fx + (p.x - tw.fx) * k, tw.fy + (p.y - tw.fy) * k, tw.fz + (p.z - tw.fz) * k];
  };
  r.onMessage("part", (changes: (Partial<Part> & { id: string; tw?: number })[]) => {
    for (const { tw, ...c } of changes) {
      const p = parts.get(c.id);
      if (!p) continue;
      const from = tw && !isNpc(p) ? shownPos(p) : null;
      if (c.id === groundPartId && body.onGround) {
        body.x += (c.x ?? p.x) - p.x;
        body.y += (c.y ?? p.y) - p.y + ((c.sy ?? p.sy) - p.sy) / 2;
        body.z += (c.z ?? p.z) - p.z;
      }
      Object.assign(p, c);
      if (from && (c.x !== undefined || c.y !== undefined || c.z !== undefined)) tweens.set(p.id, { fx: from[0], fy: from[1], fz: from[2], t0: performance.now(), dur: Math.max(0.03, tw!) });
      else if (c.x !== undefined || c.y !== undefined || c.z !== undefined) tweens.delete(p.id);
      refreshPart(p);
      if (tweens.has(p.id)) rend.updatePart({ ...p, x: from![0], y: from![1], z: from![2] }, rot(p));
      collisions.set(p);
    }
  });
  r.onMessage("kill", () => die(true));
  r.onMessage("hp", (m: { sid: string; hp: number; max: number }) => {
    if (m.sid === init.you) return setHp(m.hp, m.max);
    const rm = remotes.get(m.sid);
    if (!rm) return;
    setRemoteHp(rm, m.hp, m.max);
    if (m.hp > 0) rm.av.flash();
  });
  r.onMessage("char", (m: { sid: string; character: string | null }) => {
    if (m.sid === init.you) return applyLook(local, me.avatar, m.character);
    const rm = remotes.get(m.sid);
    if (rm) applyLook(rm.av, rm.av.avatar, m.character);
  });
  r.onMessage("gui", (m: { open: string[]; text: Record<string, string> }) => guiLayer.setState(m));
  r.onMessage("exit", () => leave());
  r.onMessage("sky", (c: string) => ((skyColor = c), setSkybox(null)));
  r.onMessage("skybox", (id: string) => setSkybox(id || null));
  r.onMessage("light", (l: { brightness?: number; fog?: number }) => {
    if (typeof l.brightness === "number") light.brightness = l.brightness;
    if (typeof l.fog === "number") light.fog = l.fog;
    rend.setLight(light.brightness, light.fog);
  });
  r.onMessage("sound", (m: { name: string }) => audio.play(m.name));
  r.onMessage("music", (m: { name: string }) => audio.setMusic(m.name));
  r.onMessage("speak", (m: { text: string; lang?: string }) => audio.speak(m.text, m.lang));
  r.onMessage("prompt", (m: PromptMsg | null) => showPrompt(m));
  r.onMessage("boost", (b: { secs: number; mult: number }) => {
    boostUntil = performance.now() + b.secs * 1000;
    boostMult = b.mult;
    toast(`⚡ Przyspieszenie na ${b.secs} s!`, "good");
  });
  r.onMessage("tp", (t: { x: number; y: number; z: number }) => void Object.assign(body, t, { vx: 0, vy: 0, vz: 0 }));
  r.onMessage("stats", (s: { speed?: number; jump?: number }) => {
    if (typeof s.speed === "number") walkSpeed = s.speed;
    if (typeof s.jump === "number") jumpPower = s.jump;
  });
  r.onMessage("scores", (list: { name: string; score: number }[]) => {
    board.classList.toggle("hidden", list.length === 0);
    board.replaceChildren(
      h("div", { class: "lb-head" }, h("span", null, "Gracz"), h("span", null, "Punkty")),
      ...list.sort((a, b) => b.score - a.score).map((e) => h("div", { class: "lb-row" }, h("span", null, e.name), h("span", null, String(e.score)))),
    );
  });
  r.onMessage("coins", (c: { earned: number; coins: number }) => {
    coinsEl.textContent = String(c.coins);
    if (session.user) session.set({ ...session.user, coins: c.coins });
    toast(`+${c.earned} 🪙 za granie`, "good");
  });
  r.onLeave((code) => {
    if (leaving || disposed) return;
    toast(code === 4000 ? "Wyrzucono z gry" : "Rozłączono z serwerem", "error");
    back();
  });

  // ---------- pętla gry ----------
  const scale = () => Math.min(devicePixelRatio || 1, matchMedia("(pointer: coarse)").matches ? 1.5 : 2);
  const fit = () => rend.resize(wrap.clientWidth || innerWidth, wrap.clientHeight || innerHeight, scale());
  const ro = new ResizeObserver(fit);
  ro.observe(wrap);
  fit();
  cleanups.push(() => ro.disconnect());

  let last = performance.now();
  let fpsAcc = 0, fpsN = 0, fps = 0;
  let raf = 0;
  const frame = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    rend.time += dt;
    tick(dt);
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = fpsN = 0; }
    if (showDebug) {
      const s = rend.stats;
      debug.textContent = `Apex · ${fps.toFixed(0)} FPS · rysowanie ${s.ms.toFixed(1)} ms\nwywołania ${s.draws} · instancje ${s.instances} · trójkąty ${(s.tris / 1000).toFixed(1)}k\nrozdzielczość ${rend.width}×${rend.height}`;
    }
  };

  function tick(dt: number) {
    input.update();
    if (guiLayer.modal) {
      input.moveX = input.moveY = 0;
      input.jump = false;
    }
    const fp = firstPerson();
    // gamepad: prawa gałka obraca kamerę
    if (input.pad?.connected) {
      const sens = dt * 2.6 * settings.sensitivity;
      alpha -= input.pad.rx * sens;
      beta = clampBeta(beta - input.pad.ry * sens * 0.8 * (settings.invertY ? -1 : 1), fp);
    }
    const dir = camDir();
    const fl = Math.hypot(dir[0], dir[2]) || 1;
    const fwdX = -dir[0] / fl, fwdZ = -dir[2] / fl;
    const rightX = fwdZ, rightZ = -fwdX;
    let mx = 0, mz = 0;
    if (!dead) {
      mx = rightX * input.moveX + fwdX * input.moveY;
      mz = rightZ * input.moveX + fwdZ * input.moveY;
    }
    const moving = Math.hypot(mx, mz) > 0.05;
    const speed = walkSpeed * (performance.now() < boostUntil ? boostMult : 1) * (swimming ? SWIM_SLOW : 1);
    body.vx = mx * speed;
    body.vz = mz * speed;
    if (!dead && input.jump && body.onGround && !swimming) {
      body.vy = jumpPower;
      body.onGround = false;
    }
    const lookY = -dir[1];
    const lookPitch = Math.abs(lookY) > 0.3 ? (lookY - Math.sign(lookY) * 0.3) / 0.7 : 0;
    const swimIn: SwimInput = { up: !dead && input.jump, down: !dead && input.down, pitch: input.moveY > 0.2 ? lookPitch * input.moveY : 0 };
    if (swimming && !dead && input.jump && waterAt(collisions, body.x, body.y + SWIM_CHEST + 0.9, body.z) === null) body.vy = Math.max(body.vy, jumpPower * 0.75);

    const steps = Math.ceil(dt / (1 / 60));
    const newTouch = new Set<string>();
    const jumpPressed = input.jump && !jumpWasDown;
    jumpWasDown = input.jump;
    void jumpPressed;
    for (let i = 0; i < steps; i++) {
      const res = stepBody(collisions, body, dt / steps, gravity, swimIn);
      swimming = res.swimming;
      for (const p of res.touched) {
        newTouch.add(p.id);
        if (p.kind === "kill" && !dead) die();
      }
      if (res.landedOn?.kind === "bounce" && !dead) body.vy = BOUNCE_POWER;
      groundPartId = res.landedOn?.id ?? null;
    }
    // gracze nie przenikają przez siebie
    if (!dead) {
      const minDist = PLAYER_RADIUS * 2 * 0.9;
      for (const rm of remotes.values()) {
        if (rm.av.anim === "dead" || Math.abs(rm.av.y - body.y) > 4.5) continue;
        const dx = body.x - rm.av.x, dz = body.z - rm.av.z;
        const d = Math.hypot(dx, dz);
        if (d >= minDist) continue;
        body.x += (d > 1e-3 ? dx / d : 1) * (minDist - d);
        body.z += (d > 1e-3 ? dz / d : 0) * (minDist - d);
      }
    }
    for (const id of newTouch) if (!touching.has(id)) r.send("touch", id);
    touching = newTouch;
    if (body.y < -150 && !dead) die();

    // kierunek i animacja
    if (moving && !dead) {
      const target = Math.atan2(-mx, -mz);
      let d = target - ry;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ry += d * Math.min(1, dt * 14);
    }
    if (!dead) anim = swimming ? (moving ? "swim" : "tread") : !body.onGround ? (body.vy > 0 ? "jump" : "fall") : moving ? "walk" : "idle";
    local.x = body.x; local.y = body.y; local.z = body.z; local.ry = ry; local.anim = anim;
    local.update(dt);

    // kamera
    radius += (Math.min(radius, wantRadius) - radius);
    const head: V3 = [body.x, body.y + 4.6, body.z];
    let useRadius = wantRadius;
    if (fp) {
      const down = Math.max(0, dir[1]);
      const lean = 0.4 + down * 0.75;
      target[0] = body.x + fwdX * lean;
      target[1] = body.y + 4.7 - down * 0.3;
      target[2] = body.z + fwdZ * lean;
      eye[0] = target[0]; eye[1] = target[1]; eye[2] = target[2];
      local.visible = false;
    } else {
      local.visible = true;
      const hit = raycastParts(collisions, head[0], head[1], head[2], dir[0], dir[1], dir[2], useRadius);
      if (hit) useRadius = Math.max(0.5, hit.dist - 0.6);
      eye[0] = head[0] + dir[0] * useRadius; eye[1] = head[1] + dir[1] * useRadius; eye[2] = head[2] + dir[2] * useRadius;
      target[0] = head[0]; target[1] = head[1]; target[2] = head[2];
    }
    radius = useRadius;
    // mgła/niebo z kamery: kamera pod wodą - niebieski filtr
    const under = waterAt(collisions, eye[0], eye[1], eye[2]) !== null;
    wrap.classList.toggle("underwater", under);
    rend.followShadows(head);

    // inni gracze
    const k = Math.min(1, dt * 12);
    for (const rm of remotes.values()) {
      const a = rm.av;
      if (Math.abs(rm.tx - a.x) + Math.abs(rm.ty - a.y) + Math.abs(rm.tz - a.z) > 40) { a.x = rm.tx; a.y = rm.ty; a.z = rm.tz; }
      else { a.x += (rm.tx - a.x) * k; a.y += (rm.ty - a.y) * k; a.z += (rm.tz - a.z) * k; }
      let d = rm.tr - a.ry;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a.ry += d * k;
      a.update(dt);
    }
    for (const n of npcs.values()) n.update(dt);
    // przesuwane klocki
    for (const [id, tw] of tweens) {
      const p = parts.get(id);
      if (!p) { tweens.delete(id); continue; }
      const k = Math.min(1, (performance.now() - tw.t0) / 1000 / tw.dur);
      const [x, y, z] = shownPos(p);
      rend.updatePart({ ...p, x, y, z }, rot(p));
      if (k >= 1) tweens.delete(id);
    }
    // kręcące się klocki
    for (const [id, base] of spinning) {
      const p = parts.get(id);
      if (!p) continue;
      const saved = p.ry;
      p.ry = base + ((performance.now() / 1000) * 90) % 360;
      rend.updatePart(p, rot(p));
      p.ry = saved;
    }

    sendTimer += dt;
    if (sendTimer >= SEND_EVERY) {
      sendTimer = 0;
      r.send("m", { x: body.x, y: body.y, z: body.z, ry, a: anim });
    }

    // rysowanie
    local.draw();
    for (const rm of remotes.values()) rm.av.draw();
    for (const n of npcs.values()) n.draw();
    rend.render({ eye, target, fov: ROBLOX_FOV, near: fp ? 0.05 : 0.2, far: 2000 });
    placeTags();
  }

  const placeTags = () => {
    const w = wrap.clientWidth, hh = wrap.clientHeight;
    const put = (el: HTMLElement, p: V3, maxDist = 400) => {
      const d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      const s = d < maxDist ? rend.project(p, w, hh) : null;
      if (!s) return void (el.style.display = "none");
      el.style.display = "";
      el.style.transform = `translate(${s[0]}px, ${s[1]}px) translate(-50%, -100%)`;
    };
    put(localTag, local.headPoint());
    localTag.style.display = firstPerson() ? "none" : localTag.style.display;
    for (const rm of remotes.values()) put(rm.tag, rm.av.headPoint());
    for (const [id, el] of labels) {
      const p = parts.get(id);
      if (p) put(el, [p.x, p.y + p.sy / 2 + 0.6, p.z], 150);
    }
  };

  raf = requestAnimationFrame(frame);
  // wiadomość o gotowości (gracz załadowany)
  setHp(maxHp, maxHp);

  return () => {
    disposed = true;
    leaving = true;
    cancelAnimationFrame(raf);
    r.leave();
    cleanups.forEach((f) => f());
    input.dispose();
    local.dispose();
    for (const rm of remotes.values()) rm.av.dispose();
    rend.dispose();
    wrap.remove();
  };
}
