// Apex (eksperymentalny): ekran gry 3D na własnym silniku WebGL2. Używa tej samej sieci, fizyki (CollisionWorld/stepBody),
// czatu, GUI i sterowania co silnik Babylon - zmienia się tylko warstwa rysowania. Gry, których Apex jeszcze nie
// umie (narzędzia, siedzenia, światy z blokami), uruchamiają się w Babylonie (patrz apexUnsupported).
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { drive, forward, Rides, startDrive, type DriveState, type Pose, type Ride, type RideHost } from "../game/vehicles.ts";
import { CollisionWorld, PLAYER_HEIGHT, PLAYER_RADIUS, rayBox, raycastParts, rotationMatrix, stepBody, SWIM_CHEST, waterAt, type Body, type SwimInput } from "../../../shared/physics.ts";
import { findSkybox } from "../../../shared/skybox.ts";
import { TerrainGrid } from "../../../shared/terrain.ts";
import type { ActionAnim, Anim, Avatar, ChatMsg, NetPlayer, Part, ToolDef } from "../../../shared/types.ts";
import { DEFAULT_LIGHT, EMOTES, FREE_EMOTES, SHOP_EMOTES, type Emote } from "../../../shared/types.ts";
import { Input } from "../engine/input.ts";
import { chatBox } from "../game/chatBox.ts";
import { GameAudio } from "../game/audio3d.ts";
import type { GameConnection } from "../game/connection.ts";
import { promptBox, type PromptMsg } from "../game/promptBox.ts";
import type { InitMsg } from "../game/play.ts";
import { onSettingsChange, openSettings, settings } from "../settings.ts";
import { detectTier, isMobile, QualityGovernor, TIERS } from "./quality.ts";
import { safety } from "../safety.ts";
import { session } from "../state.ts";
import { GuiOverlay } from "../ui/guiOverlay.ts";
import { h, toast } from "../ui/dom.ts";
import { ApexAvatar } from "./avatar.ts";
import { Particles, type FxKind } from "./particles.ts";
import { Hotbar } from "../game/hotbar.ts";
import { EMOTE_ALIASES, EMOTE_LABELS } from "../game/emotes.ts";
import { gameShop } from "../game/gameShop.ts";
import { VoiceChat } from "../game/voice.ts";
import { openGameReport, playersPanel } from "../game/playersPanel.ts";
import { chaosFx } from "../game/chaosFx.ts";
import { PadMenuNav } from "../engine/gamepad.ts";
import { setupVoxelsApex, type ApexVoxels } from "./voxelApex.ts";
import { openRoomsWindow } from "../game/rooms.ts";
import { MAIN_PLACE } from "../../../shared/places.ts";
import { cachedToolShape, drawTool } from "./toolModel.ts";
import { ROBLOX_FOV } from "../engine/camera.ts";
import { MAT, rgb, ApexRenderer } from "./renderer.ts";
import { lookRot, rotY, type V3 } from "./math.ts";
import { isTouch } from "../ui/dom.ts";

const WALK_SPEED = 16;
const SWIM_SLOW = 0.7;
const JUMP_POWER = 50;
const BOUNCE_POWER = 110;
const SEND_EVERY = 1 / 15;

/** powód, dla którego Apex nie uruchomi tej gry (null = da radę) */
export function apexUnsupported(init: InitMsg): string | null {
  const w = init.world;
  if (typeof WebGL2RenderingContext === "undefined") return "ta przeglądarka nie ma WebGL2";
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
  // jakość grafiki: stały poziom albo automatyczny (dobór do urządzenia i obniżanie, gdy gra zwalnia)
  const detected = detectTier(rend.gl);
  let gov = new QualityGovernor(settings.quality, detected);
  const applyQuality = () => rend.setQuality(TIERS[gov.tier], settings.apexBloom);
  applyQuality();
  const fx = new Particles();
  const padNav = new PadMenuNav();
  const input = new Input(wrap, (k) => (k === "ps" ? "✕ skok, prawa gałka kamera, Options menu" : "A skok, prawa gałka kamera, Menu = menu"));
  input.padDpadMoves = false;

  // ---------- świat ----------
  const parts = new Map<string, Part>(init.world.parts.map((p) => [p.id, p]));
  const rot = (p: Part) => rotationMatrix(p.rx ?? 0, p.ry, p.rz ?? 0);
  const spinning = new Map<string, number>();
  const charsById = new Map(init.world.characters.map((c) => [c.id, c]));
  const npcs = new Map<string, ApexAvatar>();
  const npcAnim = new Map<string, string>();
  const labels = new Map<string, HTMLElement>();
  const pickups = new Map<string, Part>();
  const isNpc = (p: Part) => p.kind === "npc" && p.transparency < 0.999;
  const refreshPart = (p: Part) => {
    rend.updatePart(p, rot(p));
    fx.setEmitter(p.id, p.emitter ?? null, [p.x, p.y, p.z], [p.sx, p.sy, p.sz]);
    if (p.spin) spinning.set(p.id, p.ry);
    else spinning.delete(p.id);
    if (isNpc(p)) {
      rend.removePart(p.id);
      let n = npcs.get(p.id);
      const ch = p.characterId ? charsById.get(p.characterId) : undefined;
      if (!n) {
        npcs.set(p.id, (n = new ApexAvatar(rend, ch?.look ?? DEFAULT_AVATAR)));
        n.setCharacter(ch?.look ?? DEFAULT_AVATAR, ch ?? null);
      }
      if ((p.animId ?? "") !== (npcAnim.get(p.id) ?? "")) {
        npcAnim.set(p.id, p.animId ?? "");
        n.playCustom(p.animId ? (init.world.animations.find((a) => a.id === p.animId) ?? null) : null);
      }
      n.x = p.x; n.y = p.y - p.sy / 2; n.z = p.z;
      n.ry = (p.ry * Math.PI) / 180;
    } else if (npcs.has(p.id)) {
      npcs.get(p.id)?.dispose();
      npcs.delete(p.id);
    }
    if (p.kind === "pickup" && p.toolId && p.transparency < 0.999) pickups.set(p.id, p);
    else pickups.delete(p.id);
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
  const rideHost: RideHost = {
    begin() {},
    place(p, x, y, z, ryDeg) {
      rend.updatePart({ ...p, x, y, z, ry: ryDeg }, rotationMatrix(p.rx ?? 0, ryDeg, p.rz ?? 0));
    },
    finish: (p) => refreshPart(p),
  };
  const rides = new Rides(rideHost, collisions, parts);
  let myRide: Ride | null = null;
  let drv: DriveState | null = null;
  let nearSeat: Part | null = null;
  let sitPendingUntil = 0;
  let sitBlockedUntil = 0;
  let leftSeatId: string | null = null;
  let camHoldUntil = 0;
  let autoAlpha: number | null = null;
  const terrain = TerrainGrid.decode(init.world.terrain);
  collisions.terrain = terrain;
  rend.setTerrain(terrain);
  const light = { ...DEFAULT_LIGHT, ...(init.world.light ?? {}) };
  let skyColor = init.world.skyColor;
  const setSkybox = (id: string | null | undefined) => rend.setSky(skyColor, findSkybox(id));
  setSkybox(init.world.skybox);
  rend.setLight(light.brightness, light.fog);
  // mruganie latarki: samo z siebie co jakiś czas (light.flicker) albo na polecenie skryptu
  let nextFlicker = performance.now() + 8000 + Math.random() * 12000;
  let flickerUntil = 0;
  const flashlightK = (now: number) => {
    if (light.flicker && now > nextFlicker) {
      flickerUntil = now + 400 + Math.random() * 900;
      nextFlicker = now + 7000 + Math.random() * 16000;
    }
    return now < flickerUntil ? (Math.random() < 0.45 ? 0.03 : 0.35 + Math.random() * 0.6) : 1;
  };
  const gravity = init.world.gravity;

  // ---------- gracz ----------
  const body: Body = { ...init.spawn, vx: 0, vy: 0, vz: 0, onGround: false };
  const mePlayer = init.players.find((p) => p.sid === init.you);
  const local = new ApexAvatar(rend, me.avatar);
  const toolsById = new Map<string, ToolDef>(init.world.tools.map((t) => [t.id, t]));
  const toolDefs = (ids: string[]) => ids.map((id) => toolsById.get(id)).filter((t): t is ToolDef => !!t);
  const charFor = (id: string | null) => charsById.get(id ?? "") ?? charsById.get(init.world.playerCharacter ?? "") ?? null;
  const applyLook = (av: ApexAvatar, base: Avatar, charId: string | null) => {
    const c = charFor(charId);
    av.setCharacter(base, c);
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
  let vox: ApexVoxels | null = null;
  let shakeAmt = 0;
  const spawnPoint = () => (vox ? vox.spawn() : { x: init.spawn.x, y: init.spawn.y, z: init.spawn.z });

  // ---------- kamera ----------
  let alpha = Math.atan2(init.spawn.z, init.spawn.x);
  let beta = 1.25;
  // świat z bloków: jak w Minecrafcie zaczynamy w pierwszej osobie
  let wantRadius = init.world.blocks ? 1 : 12.5;
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
  /** tapnięcie (krótkie, bez przesunięcia) = użycie narzędzia w to miejsce ekranu */
  const taps = new Map<number, { x: number; y: number; t: number; moved: boolean; button: number }>();
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 2 && e.button !== 0) return;
    taps.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, button: e.button });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* wskaźnik już nieaktywny */
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    const tp = taps.get(e.pointerId);
    if (tp && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) > 8) tp.moved = true;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) wantRadius = Math.min(128, Math.max(0.5, wantRadius * (pinch / d)));
      pinch = d;
      return;
    }
    if (e.pointerType === "mouse" && e.buttons === 1 && !firstPerson()) return;
    // przy złapanej myszce kamerę obraca ruch myszki (onLockedMove), więc tu nie dublujemy
    if (e.pointerType === "mouse" && document.pointerLockElement === canvas) return;
    const deg = e.pointerType === "mouse" ? 0.32 : 0.45;
    look(dx, dy, ((deg * settings.sensitivity) * Math.PI) / 180);
  };
  const onUp = (e: PointerEvent) => {
    const tp = taps.get(e.pointerId);
    taps.delete(e.pointerId);
    if (tp && !tp.moved && performance.now() - tp.t < 400 && e.type === "pointerup" && hotbar.current && (e.pointerType !== "mouse" || tp.button === 0)) {
      const rc = canvas.getBoundingClientRect();
      if (firstPerson()) useTool();
      else useTool(e.clientX - rc.left, e.clientY - rc.top);
    }
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  // komputer: w pierwszej osobie myszka obraca kamerę od razu (jak w Robloxie); przy pierwszym kliknięciu albo klawiszu
  // przeglądarka ją łapie (Esc oddaje ją do menu), żeby nie uciekała z okna
  const touchDevice = matchMedia("(pointer: coarse)").matches;
  let fpFreed = false;
  let lastFp = false;
  const lockMouse = () => {
    if (!firstPerson() || touchDevice || document.pointerLockElement === canvas) return;
    fpFreed = false;
    try {
      canvas.requestPointerLock?.()?.catch?.(() => {});
    } catch {
      /* przeglądarka nie pozwala */
    }
  };
  const onLockDown = () => lockMouse();
  const onLockKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.key === "Escape" || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
    if (!fpFreed) lockMouse();
  };
  const onLockChange = () => {
    if (firstPerson() && document.pointerLockElement !== canvas) fpFreed = true;
    canvas.classList.toggle("fp-mouse", firstPerson() && !touchDevice && !fpFreed);
  };
  const onLockedMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas || !firstPerson()) return;
    // tuż po złapaniu myszki przeglądarka potrafi wysłać jeden ogromny skok - pomijamy go
    if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
    look(e.movementX, e.movementY, ((0.32 * settings.sensitivity) * Math.PI) / 180);
  };
  canvas.addEventListener("pointerdown", onLockDown);
  document.addEventListener("mousemove", onLockedMove);
  window.addEventListener("keydown", onLockKey);
  document.addEventListener("pointerlockchange", onLockChange);
  cleanups.push(() => {
    canvas.removeEventListener("pointerdown", onLockDown);
    document.removeEventListener("mousemove", onLockedMove);
    window.removeEventListener("keydown", onLockKey);
    document.removeEventListener("pointerlockchange", onLockChange);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });
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
    av.setTool(p.tool ? (toolsById.get(p.tool) ?? null) : null);
    if (p.animation) av.playCustom(init.world.animations.find((a) => a.id === p.animation) ?? null);
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
  // emotki: animacje wbudowane (menu 😀 i komenda /e) oraz animacje z edytora animacji
  const hasEmote = (e: Emote) => (FREE_EMOTES as Emote[]).includes(e) || !!params.offline || me.inventory.includes(e);
  let emote: Emote | null = null;
  let emoteAnim: string | null = null;
  const chat = chatBox({
    placeholder: "Napisz wiadomość…",
    onSend: (t) => {
      const em = /^\/e(?:mote)?\s+(\S+)/i.exec(t);
      if (em) {
        const e = EMOTE_ALIASES[em[1].toLowerCase()];
        if (e && hasEmote(e)) startEmote(e);
        else if (e) toast("Tę emotkę kupisz w sklepie: Awatar → 💃 Emotki", "info");
        else toast("Emotki: /e wave, dance, cheer, point, sit", "info");
      } else r.send("chat", t);
    },
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
    if (hp < lastHp) vox?.hurt();
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
  // konsola skryptów (tylko twórca gry)
  const consoleLog = h("div", { class: "console-log" });
  const consoleBox = h(
    "div",
    { class: "console hidden" },
    h("div", { class: "console-head" }, "Konsola skryptów", h("button", { class: "icon-btn", onClick: () => consoleBox.classList.add("hidden") }, "✕")),
    consoleLog,
  );
  if (init.info.isOwner) topbar.insertBefore(h("button", { class: "hud-btn", onClick: () => consoleBox.classList.toggle("hidden"), title: "Konsola (F9)" }, "🖥"), topbar.querySelector(".hud-title"));
  const emoteMenu = h(
    "div",
    { class: "emote-menu hidden" },
    EMOTES.filter(hasEmote).map((e) => h("button", { class: "btn small", onClick: () => (startEmote(e), emoteMenu.classList.add("hidden")) }, EMOTE_LABELS[e])),
    SHOP_EMOTES.some((e) => !hasEmote(e)) ? h("div", { class: "emote-more" }, "Więcej emotek: Awatar → 💃 Emotki") : null,
    init.world.animations.filter((a) => a.emote).map((a) => h("button", { class: "btn small", onClick: () => (startAnimEmote(a.id), emoteMenu.classList.add("hidden")) }, "✨ " + a.name)),
  );
  const startAnimEmote = (id: string) => {
    if (dead || myRide) return;
    emote = null;
    emoteAnim = id;
    hotbar.select(null);
    local.playCustom(init.world.animations.find((a) => a.id === id) ?? null);
    r.send("anim", id);
  };
  const stopAnimEmote = () => {
    if (!emoteAnim) return;
    emoteAnim = null;
    local.playCustom(null);
    r.send("anim", null);
  };
  const startEmote = (e: Emote) => {
    if (!dead && body.onGround && !myRide) {
      emote = e;
      hotbar.select(null);
    }
  };
  topbar.insertBefore(h("button", { class: "hud-btn", onClick: () => emoteMenu.classList.toggle("hidden"), title: "Emotki" }, "😀"), topbar.querySelector(".hud-title"));
  const crosshair = h("div", { class: "fp-cross hidden" });
  const lastUse = new Map<string, number>();
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
  // świat z bloków (Minecraft): rysowanie, kopanie, stawianie, ekwipunek, moby
  if (init.world.blocks) {
    vox = setupVoxelsApex(init.world.blocks, {
      rend, canvas, wrap, conn: r, body,
      eye: () => eye,
      forward: () => { const d = camDir(); return [-d[0], -d[1], -d[2]]; },
      firstPerson: () => firstPerson(),
      dead: () => dead,
      toggleView: () => (wantRadius = firstPerson() ? 12 : 1),
      setSky: (hex) => ((skyColor = hex), setSkybox(null)),
      setLight: (b, fog) => ((light.brightness = b), (light.fog = fog), rend.setLight(b, fog)),
      shake: (k) => (shakeAmt = Math.max(shakeAmt, k)),
    });
    collisions.voxels = vox.world;
    cleanups.push(() => vox?.dispose());
  }
  // ---------- siedzenia i pojazdy ----------
  const myPose = (): Pose => ({ x: body.x, y: body.y, z: body.z, ry });
  const exitBtn = h("button", { class: "exit-seat hidden", onClick: () => leaveSeat(true) }, "⬆ Wysiądź");
  const enterBtn = h("button", { class: "exit-seat enter hidden", onClick: () => trySit() }, "");
  function trySit() {
    const now = performance.now();
    if (!nearSeat || myRide || dead || now < sitPendingUntil) return;
    r.send("sit", nearSeat.id);
    sitPendingUntil = now + 1000;
  }
  const onSeatKey = (e: KeyboardEvent) => {
    if (e.code === "KeyE" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) trySit();
  };
  window.addEventListener("keydown", onSeatKey);
  cleanups.push(() => window.removeEventListener("keydown", onSeatKey));
  let seatScan = 0;
  const scanSeats = () => {
    let best: Part | null = null;
    let bestD = Infinity;
    if (!myRide && !dead)
      for (const p of parts.values()) {
        if (p.kind !== "seat" || p.transparency >= 0.999 || rides.taken(p.id)) continue;
        // do pojazdu podchodzi się z boku - zasięg liczymy od całego modelu
        const reach = Math.max(p.sx, p.sz) / 2 + (p.vehicle && p.vehicle !== "skate" ? 8 : 4);
        const d = Math.hypot(p.x - body.x, p.z - body.z);
        if (d < reach && Math.abs(p.y - body.y) < 8 && d < bestD) (best = p), (bestD = d);
      }
    if (best !== nearSeat) {
      nearSeat = best;
      enterBtn.classList.toggle("hidden", !best);
      if (best) enterBtn.textContent = best.vehicle === "car" ? "🚗 Wsiądź (E)" : best.vehicle === "boat" ? "🚤 Wsiądź (E)" : best.vehicle === "skate" ? "🛹 Wskocz na deskę (E)" : "🪑 Usiądź (E)";
    }
  };
  /** wstawanie: send = my wstajemy (skok / przycisk); false = serwer już wie (śmierć) */
  function leaveSeat(send: boolean) {
    if (!myRide) return;
    const ride = myRide;
    if (send) r.send("unsit");
    rides.end(init.you, myPose());
    myRide = null;
    drv = null;
    exitBtn.classList.add("hidden");
    sitBlockedUntil = performance.now() + 1500;
    // wysiadamy obok pojazdu (z lewej strony), a z krzesła lekko podskakujemy
    leftSeatId = ride.seat.id;
    const [fx, fz] = forward(ry);
    if (ride.type && ride.type !== "skate") {
      body.x += -fz * 3.5;
      body.z += fx * 3.5;
      body.y += 1;
    } else if (!ride.type) {
      body.x += fx * (ride.seat.sz / 2 + 1.2);
      body.z += fz * (ride.seat.sz / 2 + 1.2);
    }
    body.vx = body.vz = 0;
    body.vy = jumpPower * 0.5;
    body.onGround = false;
  }
  wrap.append(topbar, chat.box, board, consoleBox, menu, hpBox, hurt, emoteMenu, debug, crosshair, actionBtn, exitBtn, enterBtn);
  // czat głosowy ze znajomymi, lista graczy (znajomi / zablokuj / zgłoś) i sklep gry
  if (!params.offline) {
    const voice = new VoiceChat(r, init.you);
    voice.volumeFor = (sid) => {
      const rm = remotes.get(sid);
      if (!rm) return 1;
      const d = Math.hypot(rm.tx - body.x, rm.ty - body.y, rm.tz - body.z);
      return d < 25 ? 1 : Math.max(0.08, 1 - (d - 25) / 140);
    };
    voice.onReport = (sid, username) => openGameReport(r, { sid, username }, true);
    voice.onSpeaking = (sid, on) => {
      const rm = remotes.get(sid);
      const t = rm?.tag.firstElementChild as HTMLElement | null;
      if (rm && t) t.textContent = (on ? "🔊 " : "") + rm.username;
    };
    topbar.insertBefore(voice.button, topbar.querySelector(".hud-title"));
    wrap.append(voice.panel);
    cleanups.push(() => voice.dispose());
    const pp = playersPanel(r, () => [...remotes.entries()].map(([sid, rm]) => ({ sid, username: rm.username })));
    topbar.insertBefore(pp.button, topbar.querySelector(".hud-title"));
  }
  const shop = gameShop(r, { offline: !!params.offline, onCoins: (c) => (coinsEl.textContent = String(c)) });
  topbar.insertBefore(shop.button, topbar.querySelector(".hud-title"));
  cleanups.push(() => shop.dispose());
  if (localStorage.getItem("predator.debug"))
    (window as unknown as { __play: unknown }).__play = { body, parts, rides, get nearSeat() { return nearSeat; }, get myRide() { return myRide; }, trySit, get vox() { return vox; } };
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
    if (myRide) leaveSeat(false);
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
  }
  function leave() {
    leaving = true;
    r.leave();
    back();
  }

  // ---------- narzędzia: smugi strzałów i używanie ----------
  const tracers: { from: V3; to: V3; color: string; until: number }[] = [];
  /** błyski strzałów: krótkie światło w lufie i w miejscu trafienia */
  const flashes: { pos: V3; until: number; color: [number, number, number] }[] = [];
  const addTracer = (from: V3, to: V3, color = "#ffe066") => {
    tracers.push({ from, to, color, until: performance.now() + 110 });
    fx.burst("flash", from, 2);
    fx.burst("hit", to, 7);
    const c = rgb(color);
    flashes.push({ pos: from, until: performance.now() + 90, color: c }, { pos: to, until: performance.now() + 70, color: c });
  };
  /** punkt, w który celujemy: pierwsze trafienie promienia w świat albo w innego gracza */
  function aimPoint(dir: V3, range: number): V3 {
    let best = Math.max(range, 50);
    const w = raycastParts(collisions, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 1000);
    if (w && w.dist < best) best = w.dist;
    for (const rm of remotes.values()) {
      if (rm.av.anim === "dead") continue;
      const t = rayBox(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], rm.av.x - PLAYER_RADIUS, rm.av.y, rm.av.z - PLAYER_RADIUS, rm.av.x + PLAYER_RADIUS, rm.av.y + PLAYER_HEIGHT, rm.av.z + PLAYER_RADIUS);
      if (t !== null && t < best) best = t;
    }
    return [eye[0] + dir[0] * best, eye[1] + dir[1] * best, eye[2] + dir[2] * best];
  }
  /** używa trzymanego narzędzia, celując w punkt ekranu (domyślnie środek) */
  function useTool(sx = wrap.clientWidth / 2, sy = wrap.clientHeight / 2) {
    const def = hotbar.current;
    if (!def || dead || myRide) return;
    const now = performance.now();
    if (now - (lastUse.get(def.id) ?? 0) < def.cooldown * 1000) return;
    lastUse.set(def.id, now);
    hotbar.cooldown(def.id, def.cooldown);
    const dir = rend.ray(sx / wrap.clientWidth, sy / wrap.clientHeight, eye);
    const aim = aimPoint(dir, def.range);
    const face = (dx: number, dz: number) => {
      if (Math.hypot(dx, dz) > 0.01) ry = Math.atan2(-dx, -dz);
    };
    let action: ActionAnim = "use";
    const msg: Record<string, unknown> = { id: def.id };
    if (def.type === "ranged") {
      action = "shoot";
      face(aim[0] - body.x, aim[2] - body.z);
      const origin: V3 = local.toolTip(ry) ?? [body.x, body.y + 4.5, body.z];
      const d: V3 = [aim[0] - origin[0], aim[1] - origin[1], aim[2] - origin[2]];
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      const n: V3 = [d[0] / len, d[1] / len, d[2] / len];
      Object.assign(msg, { ox: origin[0], oy: origin[1], oz: origin[2], dx: n[0], dy: n[1], dz: n[2] });
      const reach = Math.min(len, def.range);
      addTracer(origin, [origin[0] + n[0] * reach, origin[1] + n[1] * reach, origin[2] + n[2] * reach], def.color);
    } else if (def.type === "melee" || def.type === "custom") {
      action = "swing";
      face(aim[0] - body.x, aim[2] - body.z);
    }
    msg.ry = ry;
    local.ry = ry;
    local.playAction(action);
    r.send("use", msg);
  }

  let shotPending = false;
  const onKey = (e: KeyboardEvent) => {
    if (chat.typing()) return;
    if (e.key === "Enter" || e.key === "/") {
      e.preventDefault();
      chat.focus();
    } else if (e.code === "KeyR") die();
    else if (/^Digit[1-9]$/.test(e.code)) !vox && hotbar.toggle(Number(e.code.slice(5)) - 1);
    else if (e.code === "Digit0" || e.code === "Backquote") hotbar.select(null);
    else if (e.key === "Escape") menu.classList.toggle("hidden");
    else if (e.key === "F9" && init.info.isOwner) consoleBox.classList.toggle("hidden");
    else if (e.key === "F2") {
      // zrzut ekranu gry do pliku PNG (zapisywany zaraz po narysowaniu klatki)
      e.preventDefault();
      shotPending = true;
    } else if (e.key === "F3") {
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
  r.onMessage("fx", (m: { kind: FxKind; x: number; y: number; z: number; n: number }) => fx.burst(m.kind, [m.x, m.y, m.z], m.n));
  r.onMessage("log", (l: { text: string; error: boolean }) => {
    consoleLog.append(h("div", { class: l.error ? "log-err" : "log-line" }, l.text));
    consoleLog.scrollTop = consoleLog.scrollHeight;
    if (l.error) consoleBox.classList.remove("hidden");
  });
  r.onMessage("flicker", (secs: number) => (flickerUntil = performance.now() + Math.min(10, Math.max(0.1, Number(secs) || 1)) * 1000));
  r.onMessage("seat", (m: { sid: string; id: string | null }) => {
    if (m.sid === init.you) {
      if (!m.id) return leaveSeat(false);
      sitPendingUntil = 0;
      const ride = rides.start(init.you, m.id);
      if (!ride || dead) return;
      myRide = ride;
      drv = ride.type ? startDrive(ride) : null;
      ry = ride.seat.ry * (Math.PI / 180);
      hotbar.select(null);
      exitBtn.classList.remove("hidden");
      exitBtn.textContent = ride.type === "skate" ? "⬆ Zejdź z deski" : ride.type ? "⬆ Wysiądź" : "⬆ Wstań";
      if (ride.type) toast(ride.type === "skate" ? "🛹 Jedziesz! Skok = ollie" : ride.type === "boat" ? "🚤 W/S - gaz, A/D - skręt" : "🚗 W/S - gaz i hamulec, A/D - skręt, spacja - wysiądź", "info");
      return;
    }
    if (m.id) rides.start(m.sid, m.id);
    else {
      const rm = remotes.get(m.sid);
      rides.end(m.sid, rm ? { x: rm.tx, y: rm.ty, z: rm.tz, ry: rm.tr } : null);
    }
  });
  for (const p of init.players) if (p.seat && p.sid !== init.you) rides.start(p.sid, p.seat);
  r.onMessage("kill", () => die(true));
  r.onMessage("hp", (m: { sid: string; hp: number; max: number }) => {
    if (m.sid === init.you) return setHp(m.hp, m.max);
    const rm = remotes.get(m.sid);
    if (!rm) return;
    setRemoteHp(rm, m.hp, m.max);
    if (m.hp > 0) rm.av.flash();
  });
  r.onMessage("inv", (ids: string[]) => hotbar.set(toolDefs(ids)));
  r.onMessage("picked", (id: string) => {
    const t = toolsById.get(id);
    if (t) toast(`Podniesiono: ${t.name} (klawisz ${hotbar.indexOf(id) + 1})`, "good");
  });
  r.onMessage("eq", (m: { sid: string; tool: string | null }) => {
    if (m.sid === init.you) return;
    remotes.get(m.sid)?.av.setTool(m.tool ? (toolsById.get(m.tool) ?? null) : null);
  });
  r.onMessage("act", (m: { sid: string; type: ActionAnim; tool: string; from?: number[]; to?: number[] }) => {
    if (m.sid === init.you) return;
    remotes.get(m.sid)?.av.playAction(m.type);
    if (m.from && m.to) addTracer(m.from as V3, m.to as V3, toolsById.get(m.tool)?.color);
  });
  // przymierzanie ubrań przez skrypt gry (tryOn): tymczasowy wygląd gracza w tej grze
  const worn = new Map<string, Avatar>();
  chaosFx(r);
  r.onMessage("wear", (m: { sid: string; avatar: Avatar }) => {
    worn.set(m.sid, m.avatar);
    const av = m.sid === init.you ? local : remotes.get(m.sid)?.av;
    if (av) applyLook(av, m.avatar, null);
  });
  r.onMessage("char", (m: { sid: string; character: string | null }) => {
    if (m.sid === init.you) return applyLook(local, worn.get(m.sid) ?? me.avatar, m.character);
    const rm = remotes.get(m.sid);
    if (rm) applyLook(rm.av, worn.get(m.sid) ?? rm.av.avatar, m.character);
  });
  // animacje z edytora animacji włączone przez skrypt (gracz i inni)
  r.onMessage("panim", (m: { sid: string; anim: string | null }) => {
    if (m.sid === init.you) {
      // animację włączoną przez skrypt gracz widzi u siebie; własną emotkę już odtwarza
      if (m.anim !== emoteAnim) {
        emoteAnim = null;
        local.playCustom(m.anim ? (init.world.animations.find((a) => a.id === m.anim) ?? null) : null);
      }
      return;
    }
    remotes.get(m.sid)?.av.playCustom(m.anim ? (init.world.animations.find((a) => a.id === m.anim) ?? null) : null);
  });
  r.onMessage("gui", (m: { open: string[]; text: Record<string, string> }) => guiLayer.setState(m));
  r.onMessage("exit", () => leave());
  // skrypt albo przycisk GUI przenosi do innego miejsca gry: łączymy się z serwerem tamtego miejsca
  r.onMessage("place", (m: { id: string; name: string }) => {
    if (leaving) return;
    leaving = true;
    toast(`➡ ${m.name}`, "info");
    const start = init.world.startPlace ?? MAIN_PLACE;
    go("play", {
      ...(params.worldId !== undefined ? { worldId: params.worldId } : {}),
      ...(params.privateCode ? { privateCode: params.privateCode } : {}),
      ...(params.offline ? { offline: params.offline } : {}),
      ...(params.back ? { back: params.back } : {}),
      ...(m.id !== start ? { place: m.id } : params.offline ? { place: m.id } : {}),
    });
  });
  // pokoje (multiplayer): okno wyboru pokoju i nazwa bieżącego pokoju w tytule
  let inRoom = false;
  r.onMessage("rooms", (m: { target?: string; max?: number }) =>
    openRoomsWindow({
      worldId: params.worldId,
      target: m?.target ?? "",
      max: m?.max,
      offline: !!params.offline,
      go,
      back: inRoom ? params.back : { screen: "play", params: { worldId: params.worldId, ...(params.back ? { back: params.back } : {}) } },
      leave: () => {
        leaving = true;
        r.leave();
      },
    }),
  );
  r.onMessage("room", (m: { name: string; code?: string }) => {
    inRoom = true;
    const title = topbar.querySelector(".hud-title");
    if (title) title.textContent = `${init.info.name} · 🎮 ${m.name}${m.code ? ` (kod ${m.code})` : ""}`;
    toast(`🎮 Pokój „${m.name}”` + (m.code ? ` - kod dla znajomych: ${m.code}` : ""), "good");
  });
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
    toast(code === 4000 ? "Wyrzucono z gry" : code === 4002 ? "Serwer został zrestartowany - wejdź ponownie" : "Rozłączono z serwerem", "error");
    back();
  });

  // ---------- pętla gry ----------
  const scale = () => Math.min(devicePixelRatio || 1, TIERS[gov.tier].dprCap, isMobile() ? 1.5 : 3) * TIERS[gov.tier].renderScale;
  const fit = () => rend.resize(wrap.clientWidth || innerWidth, wrap.clientHeight || innerHeight, scale());
  const offSettings = onSettingsChange((st) => {
    if (st.quality !== gov.level) gov = new QualityGovernor(st.quality, detected);
    applyQuality();
    fit();
  });
  cleanups.push(offSettings);
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
    const nt = gov.sample(dt);
    if (nt) {
      applyQuality();
      fit();
    }
    tick(dt);
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = fpsN = 0; }
    if (showDebug) {
      const s = rend.stats;
      debug.textContent = `Apex (${TIERS[gov.tier].label}${settings.quality === "auto" ? ", auto" : ""}) · ${fps.toFixed(0)} FPS · rysowanie ${s.ms.toFixed(1)} ms\nwywołania ${s.draws} · instancje ${s.instances} · trójkąty ${(s.tris / 1000).toFixed(1)}k\nrozdzielczość ${rend.width}×${rend.height}`;
    }
  };

  function tick(dt: number) {
    input.update();
    if (guiLayer.modal) {
      input.moveX = input.moveY = 0;
      input.jump = false;
    }
    const fp = firstPerson();
    if (fp !== lastFp) {
      lastFp = fp;
      fpFreed = false;
      canvas.classList.toggle("fp-mouse", fp && !touchDevice);
      if (!fp && document.pointerLockElement === canvas) document.exitPointerLock();
    }
    // gamepad: prawa gałka obraca kamerę
    if (input.pad?.connected) {
      const sens = dt * 2.6 * settings.sensitivity;
      alpha -= input.pad.rx * sens;
      beta = clampBeta(beta - input.pad.ry * sens * 0.8 * (settings.invertY ? -1 : 1), fp);
      const pad = input.pad;
      if (pad.pressed.start) menu.classList.toggle("hidden");
      if (pad.pressed.y) emoteMenu.classList.toggle("hidden");
      // pad steruje menu / oknem / GUI gry (postać stoi): krzyżak i A / B jak w Babylonie
      const menuOpen = !menu.classList.contains("hidden");
      const emotesOpen = !emoteMenu.classList.contains("hidden");
      const dialog = document.querySelector<HTMLElement>(".modal-bg .modal");
      const root = dialog ?? (menuOpen ? menu : emotesOpen ? emoteMenu : guiLayer.padRoot(false));
      padNav.update(pad, root, dialog ? () => dialog.closest(".modal-bg")?.remove() : menuOpen ? () => menu.classList.add("hidden") : emotesOpen ? () => emoteMenu.classList.add("hidden") : undefined);
      if (root) {
        input.moveX = input.moveY = 0;
        input.jump = false;
      } else {
        if (vox) vox.pad(pad);
        else {
          if (pad.down.rt && !myRide) useTool();
          if (pad.pressed.x) myRide ? leaveSeat(true) : trySit();
          if (pad.pressed.rb || pad.pressed.right) hotbar.cycle(1);
          if (pad.pressed.lb || pad.pressed.left) hotbar.cycle(-1);
        }
        if (pad.pressed.rs) wantRadius = fp ? 12 : 1;
      }
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
    // skok = wysiadanie (na deskorolce skok to ollie - schodzi się przyciskiem)
    if (myRide && !dead && jumpPressed && myRide.type !== "skate") leaveSeat(true);
    if (myRide && !dead) {
      const ride = myRide;
      body.vx = body.vy = body.vz = 0;
      if (!drv) {
        // krzesło / ławka: siedzimy na wierzchu (także gdy skrypt je przesuwa)
        const seat = parts.get(ride.seat.id) ?? ride.seat;
        body.x = seat.x; body.y = seat.y + seat.sy / 2; body.z = seat.z;
        ry = seat.ry * (Math.PI / 180);
        body.onGround = true;
      } else {
        const d = drv;
        for (let i = 0; i < steps; i++) {
          const res = drive(ride, d, { moveX: input.moveX, moveY: input.moveY, jump: input.jump, camFwd: [fwdX, fwdZ] }, dt / steps, gravity, collisions, jumpPower);
          for (const p of res.touched) {
            newTouch.add(p.id);
            if (p.kind === "kill" && !dead) die();
          }
          if (res.landedOn?.kind === "bounce" && !dead) d.vb.vy = BOUNCE_POWER;
        }
        // kurz spod kół i plusk za łódką
        if (Math.abs(d.speed) > 12 && (ride.type === "car" || ride.type === "boat") && (ride.type === "boat" || d.vb.onGround) && Math.random() < dt * 40) {
          const [bx, bz] = forward(d.heading);
          fx.burst(ride.type === "boat" ? "splash" : "dust", [d.vb.x - bx * 4, d.vb.y + 0.4, d.vb.z - bz * 4], 1);
        }
        body.x = d.vb.x; body.y = d.vb.y + ride.lift; body.z = d.vb.z;
        body.onGround = d.vb.onGround;
        ry = d.heading;
        if (d.vb.y < -150 && !dead) die();
      }
    }
    for (let i = 0; i < (myRide ? 0 : steps); i++) {
      const res = stepBody(collisions, body, dt / steps, gravity, swimIn);
      swimming = res.swimming;
      for (const p of res.touched) {
        newTouch.add(p.id);
        if (p.kind === "kill" && !dead) die();
      }
      if (res.landedOn?.kind === "bounce" && !dead) body.vy = BOUNCE_POWER;
      groundPartId = res.landedOn?.id ?? null;
      // siadanie: wystarczy dotknąć siedzenia
      const now = performance.now();
      if (leftSeatId && !res.touched.some((p) => p.id === leftSeatId)) leftSeatId = null;
      if (!dead && now > sitBlockedUntil && now > sitPendingUntil)
        for (const p of res.touched)
          if (p.kind === "seat" && p.id !== leftSeatId && !rides.taken(p.id)) {
            r.send("sit", p.id);
            sitPendingUntil = now + 1000;
            break;
          }
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
    if (moving && !dead && !myRide) {
      const target = Math.atan2(-mx, -mz);
      let d = target - ry;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ry += d * Math.min(1, dt * 14);
    }
    if (!dead) anim = myRide ? (myRide.type === "skate" ? (drv?.vb.onGround === false ? "jump" : "skate") : myRide.type ? "drive" : "seated") : swimming ? (moving ? "swim" : "tread") : !body.onGround ? (body.vy > 0 ? "jump" : "fall") : moving ? "walk" : "idle";
    // ruch albo skok przerywa emotkę
    if (!dead) {
      if (anim !== "idle") {
        emote = null;
        stopAnimEmote();
      } else if (emote) anim = emote;
    }
    local.x = body.x; local.y = body.y; local.z = body.z; local.ry = ry; local.anim = anim;
    local.update(dt);
    if ((seatScan += dt) > 0.2) {
      seatScan = 0;
      scanSeats();
    }
    // w samochodzie i łódce kamera sama obraca się za pojazd (chyba że gracz właśnie nią kręci)
    if (drv && myRide?.type !== "skate" && !fp) {
      const now = performance.now();
      if (autoAlpha !== null && Math.abs(alpha - autoAlpha) > 1e-4) camHoldUntil = now + 1500;
      if (now > camHoldUntil && Math.abs(drv.speed) > 4) {
        let d = Math.PI / 2 - ry - alpha;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        alpha += d * Math.min(1, dt * 2.5);
      }
      autoAlpha = alpha;
    } else autoAlpha = null;

    vox?.update(dt, swimming);
    if (shakeAmt > 0.001) {
      alpha += (Math.random() - 0.5) * shakeAmt * 0.05;
      beta += (Math.random() - 0.5) * shakeAmt * 0.05;
      shakeAmt *= Math.max(0, 1 - dt * 5);
    }
    // kamera
    radius += (Math.min(radius, wantRadius) - radius);
    const head: V3 = [body.x, body.y + 4.6, body.z];
    let useRadius = wantRadius;
    if (fp) {
      const down = Math.max(0, dir[1]);
      const lean = 0.4 + down * 0.75;
      // oczy przed twarzą; patrzymy od oka w kierunku kamery (dir wskazuje od celu do oka)
      eye[0] = body.x + fwdX * lean;
      eye[1] = body.y + 4.7 - down * 0.3;
      eye[2] = body.z + fwdZ * lean;
      target[0] = eye[0] - dir[0]; target[1] = eye[1] - dir[1]; target[2] = eye[2] - dir[2];
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
    // pojazdy jadą za kierowcami (my i inni gracze)
    if (rides.bySid.size)
      rides.update((sid) => {
        if (sid === init.you) return myPose();
        const rm = remotes.get(sid);
        return rm ? { x: rm.av.x, y: rm.av.y, z: rm.av.z, ry: rm.av.ry } : null;
      });
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
      const angle = base + ((performance.now() / 1000) * 90) % 360;
      // NPC: kręci się postać, a nie klocek-podstawka (ten jest niewidoczny)
      const npc = npcs.get(id);
      if (npc) {
        npc.ry = (angle * Math.PI) / 180;
        continue;
      }
      const saved = p.ry;
      p.ry = angle;
      rend.updatePart(p, rot(p));
      p.ry = saved;
    }

    sendTimer += dt;
    if (sendTimer >= SEND_EVERY) {
      sendTimer = 0;
      r.send("m", { x: body.x, y: body.y, z: body.z, ry: Math.atan2(Math.sin(ry), Math.cos(ry)), a: anim });
    }

    // rysowanie
    const now = performance.now();
    for (const p of pickups.values()) {
      const def = toolsById.get(p.toolId ?? "");
      if (!def) continue;
      const secs = now / 1000;
      drawTool(rend, cachedToolShape(def), rotY(secs * 1.6), [p.x, p.y + p.sy / 2 + 1.6 + Math.sin(secs * 2.5) * 0.25, p.z], 1.3);
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      if (now > tr.until) { tracers.splice(i, 1); continue; }
      const d: V3 = [tr.to[0] - tr.from[0], tr.to[1] - tr.from[1], tr.to[2] - tr.from[2]];
      const len = Math.hypot(d[0], d[1], d[2]);
      if (len < 0.01) continue;
      const mid: V3 = [(tr.from[0] + tr.to[0]) / 2, (tr.from[1] + tr.to[1]) / 2, (tr.from[2] + tr.to[2]) / 2];
      const c = rgb(tr.color);
      const col: [number, number, number] = [Math.min(1, c[0] + 0.3), Math.min(1, c[1] + 0.3), Math.min(1, c[2] + 0.3)];
      rend.drawBox("box", lookRot(d), mid, [0.14, 0.14, len], col, 0.85, MAT.neon);
      rend.drawBox("sphere", [1, 0, 0, 0, 1, 0, 0, 0, 1], tr.to, [0.6, 0.6, 0.6], col, 0.85, MAT.neon);
    }
    crosshair.classList.toggle("hidden", !fp);
    // latarka (światło gry): reflektor tam, gdzie patrzy kamera, i słaba poświata wokół gracza
    if (light.flashlight) {
      const k = flashlightK(now);
      const hd: V3 = [body.x, body.y + 4.4, body.z];
      const dd: V3 = [-dir[0], -dir[1] * 0.6, -dir[2]];
      const dl = Math.hypot(dd[0], dd[1], dd[2]) || 1;
      rend.addLight({ pos: hd, color: [1, 0.95, 0.8], intensity: 2.2 * k, range: 95, dir: [dd[0] / dl, dd[1] / dl, dd[2] / dl], cone: 0.62 });
      rend.addLight({ pos: hd, color: [1, 0.95, 0.8], intensity: 0.5 * k, range: 20 });
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      if (now > f.until) { flashes.splice(i, 1); continue; }
      rend.addLight({ pos: f.pos, color: f.color, intensity: 2.5, range: 22 });
    }
    fx.update(dt);
    fx.draw(rend);
    vox?.draw();
    local.draw();
    for (const rm of remotes.values()) rm.av.draw();
    for (const n of npcs.values()) if (rend.inView(n.x, n.y + 4 * n.scale, n.z, 8 * n.scale, TIERS[gov.tier].drawDist * 0.14)) n.draw();
    rend.render({ eye, target, fov: ROBLOX_FOV, near: fp ? 0.05 : 0.2, far: 2000 });
    if (shotPending) {
      shotPending = false;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${init.info.name || "predator"}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.png`;
      a.click();
      toast("📸 Zapisano zrzut ekranu", "good");
    }
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
