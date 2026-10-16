// Logika jednej gry: gracze, zdrowie, narzędzia, podnoszenie, skrypty Lua.
// Działa na serwerze (pokój Colyseus) i w przeglądarce (testowanie offline w Studio) -
// różni się tylko "transport", którym wysyłamy wiadomości do graczy.
import { filterChat } from "../chatFilter.ts";
import { findSkybox, SKYBOXES } from "../skybox.ts";
import { GameShop } from "./shop.ts";
import { TerrainGrid } from "../terrain.ts";
import { PlayerDataStore, type GameStorage } from "./playerData.ts";
import { CollisionWorld, rayBox, raycastParts, waterAt } from "../physics.ts";
import { LuaEngine, type ScriptHost } from "../scripting/lua.ts";
import { findItem } from "../catalog.ts";
import type { ActionAnim, Anim, Avatar, ChatMsg, NetPlayer, Part, ToolDef, WorldData } from "../types.ts";
import { EMOTES, MAX_HP, MAX_INVENTORY, SHOP_EMOTES, type ShopEmote } from "../types.ts";

import { MAX_LABEL } from "../world.ts";
import { clientGuiAction, GuiRuntime, guiLuaFunctions, roomLuaFunctions, type RoomInfo } from "../gui.ts";
import { findPlace, MAIN_PLACE } from "../places.ts";
import { VoxelGame } from "./voxelSim.ts";
import { RigidWorld } from "../rigid.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** zmiana klocka wysyłana graczom; tw = płynne przejście do nowej pozycji (sekundy) */
export type PartChange = Partial<Part> & { tw?: number };

const ANIMS: Anim[] =["idle", "walk", "jump", "fall", "dead", "swim", "tread", "seated", "drive", "skate", ...EMOTES];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LIMIT = 2000;
const SPAWN_PROTECTION_MS = 2000;
/** połowa szerokości trafienia: postać z rękami ma ok. 4 szerokości, więc trafienie w ramię też się liczy */
const PLAYER_HALF = 1.6;
const PLAYER_HEIGHT = 5.2;

export interface SimTransport {
  send(sid: string, type: string, msg?: unknown): void;
  broadcast(type: string, msg?: unknown, exceptSid?: string): void;
  /** skrypt przyznaje odznakę (nazwa odznaki z ustawień gry) */
  badge?(sid: string, name: string): void;
  /** zapis postępu graczy (saveData / loadData) */
  storage?: GameStorage;
  /** wykryto oszukiwanie ruchem (kick = wyrzucić z gry) */
  cheat?(sid: string, reason: string, kick: boolean): void;
  /** skrypt wyrzuca gracza z gry (kick) */
  kick?(sid: string, reason: string): void;
  /** zapis świata z bloków (to, co zbudowali gracze) */
  worldSave?: { load(): string | null; save(data: string): void };
}

export interface SimUser {
  userId: number;
  username: string;
  avatar: Avatar;
  isOwner: boolean;
  /** kupione emotki (brak = wszystkie, np. test w Studio) */
  emotes?: string[];
  /** kupione passy w sklepie tej gry (id produktów) */
  owned?: string[];
  /** administracja gry (właściciel, współtwórca, moderator Predatora) - może wyrzucać, banować, dawać narzędzia */
  admin?: boolean;
}

export interface SimInfo {
  id: number;
  name: string;
  ownerName: string;
  /** serwer jest pokojem (multiplayer) - nazwa, kod */
  room?: RoomInfo;
  /** gry 2D: poziom, na który wchodzą gracze (pokój gra na swoim poziomie) */
  startLevel?: string;
}

interface PlayerState extends NetPlayer {
  isOwner: boolean;
  /** administracja gry */
  admin: boolean;
  /** wygląd z konta (do przywrócenia po przymierzaniu ubrań przez skrypt) */
  baseAvatar: Avatar;
  emotes?: Set<string>;
  score: number;
  lastTouch: Map<string, number>;
  lastChat: number;
  /** limit zdarzeń ze skryptu gracza (okno 1 s) */
  netWindow: number;
  netCount: number;
  dead: boolean;
  protectedUntil: number;
  tools: string[];
  lastUse: Map<string, number>;
  /** siedzenie, na którym siedzi (id klocka) */
  seat: string | null;
  /** strażnik ruchu: ostatnia sprawdzona pozycja, prędkość i skok ze skryptów, przyspieszenie, czas w powietrzu */
  mv: MoveState;
}

interface MoveState {
  x: number;
  y: number;
  z: number;
  t: number;
  walk: number;
  jump: number;
  boostUntil: number;
  boostMult: number;
  /** po teleporcie / odrodzeniu - każda pozycja jest dobra */
  graceUntil: number;
  airTime: number;
  airStartY: number;
  strikes: number[];
}

const finite = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

export class GameSim {
  readonly players = new Map<string, PlayerState>();
  /** gracze bez filtra słów na czacie (konta Predator i Piotrek53_3 - ustawia serwer) */
  readonly unfiltered = new Set<string>();
  private partsById = new Map<string, Part>();
  private toolsById = new Map<string, ToolDef>();
  private collisions: CollisionWorld;
  /** bryły z fizyką (dynamic) */
  private rigid: RigidWorld;
  private lastPos = new Map<string, [number, number, number, number]>();
  private dirtyParts = new Map<string, PartChange>();
  /** CHAOS (włącza administracja gry): fala zniszczenia od punktu, który niszczy mapę i pochłania graczy */
  private chaos: { cx: number; cz: number; t0: number; radius: number; list: { part: Part; d: number }[]; next: number; maxD: number } | null = null;
  private chaosOrig = new Map<string, { x: number; y: number; z: number; ry?: number; transparency?: number; collide?: boolean }>();
  private chaosSteps: { at: number; id: string; step: 2 | 3; dx: number; dz: number }[] = [];
  /** gracze pochłonięci przez chaos: kiedy zostaną wyrzuceni (po glitchu ekranu) */
  private chaosHits = new Map<string, number>();
  private scoresDirty = false;
  private lua: LuaEngine | null = null;
  private logs: { text: string; error: boolean }[] = [];
  private sky: string;
  /** zapisany postęp graczy (saveData / loadData) */
  private dataStore: PlayerDataStore;
  /** sklep gry (promptPurchase / ownsProduct / onPurchase) */
  readonly shop: GameShop;
  /** gotowe niebo (skybox) - pusty = zwykły kolor */
  private skybox: string;
  /** GUI graczy (które okienka są otwarte) */
  readonly gui: GuiRuntime;
  /** świat z bloków (Minecraft) */
  readonly vox: VoxelGame | null = null;

  constructor(
    private data: WorldData,
    private t: SimTransport,
    private info: SimInfo,
  ) {
    for (const p of data.parts) this.partsById.set(p.id, p);
    for (const tool of data.tools) this.toolsById.set(tool.id, tool);
    this.collisions = new CollisionWorld(data.parts);
    this.collisions.terrain = TerrainGrid.decode(data.terrain);
    this.rigid = new RigidWorld(this.collisions, data.gravity);
    for (const p of data.parts) if (p.dynamic) this.rigid.add(p);
    this.dataStore = new PlayerDataStore(t.storage, (text, error) => this.log(text, error));
    this.shop = new GameShop(data.products ?? [], (sid, type, msg) => this.t.send(sid, type, msg));
    this.sky = data.skyColor;
    this.skybox = data.skybox ?? "";
    this.gui = new GuiRuntime(data.guis ?? [], (sid, msg) => this.t.send(sid, "gui", msg));
    if (data.blocks)
      this.vox = new VoxelGame(data.blocks, {
        players: () => this.players.values(),
        player: (sid) => this.players.get(sid),
        send: (sid, type, msg) => this.t.send(sid, type, msg),
        broadcast: (type, msg) => this.t.broadcast(type, msg),
        damage: (sid, n) => {
          const p = this.players.get(sid);
          if (p) this.damage(p, n, null);
        },
        heal: (sid, n) => {
          const p = this.players.get(sid);
          if (p) this.heal(p, n);
        },
        log: (text, error) => this.log(text, error),
        getData: (sid, key) => this.dataStore.get(sid, key),
        setData: (sid, key, value) => {
          try {
            this.dataStore.set(sid, key, value);
          } catch {
            /* gracz już wyszedł */
          }
        },
        lua: () => this.lua,
        collisions: this.collisions,
        gravity: data.gravity,
        worldSave: t.worldSave,
      });
    this.startScripts();
  }

  // ---------- Dołączanie ----------

  join(sid: string, user: SimUser) {
    // zapis gracza wczytujemy od razu (świat z bloków pamięta jego ekwipunek i miejsce)
    this.dataStore.attach(sid, user.userId);
    const spawn = this.vox && !this.hasSpawnParts ? this.vox.spawnFor(sid) : this.spawnPoint();
    const p: PlayerState = {
      sid,
      userId: user.userId,
      username: user.username,
      avatar: user.avatar,
      isOwner: user.isOwner,
      admin: !!user.admin || user.isOwner,
      baseAvatar: { ...user.avatar },
      emotes: user.emotes ? new Set(user.emotes) : undefined,
      ...spawn,
      ry: 0,
      anim: "idle",
      tool: null,
      character: null,
      animation: null,
      hp: MAX_HP,
      maxHp: MAX_HP,
      score: 0,
      lastTouch: new Map(),
      lastChat: 0,
      netWindow: 0,
      netCount: 0,
      dead: false,
      protectedUntil: Date.now() + SPAWN_PROTECTION_MS,
      tools: this.starterTools(),
      lastUse: new Map(),
      seat: null,
      mv: { ...spawn, t: Date.now(), walk: 16, jump: 50, boostUntil: 0, boostMult: 1, graceUntil: Date.now() + 3000, airTime: 0, airStartY: spawn.y, strikes: [] },
    };
    this.players.set(sid, p);

    const { scripts: _hidden, ...publicData } = this.data;
    this.t.send(sid, "init", {
      you: sid,
      world: {
        ...publicData,
        skyColor: this.sky,
        skybox: this.skybox || undefined,
        parts: [...this.partsById.values()],
        ...(this.vox ? { blocks: { ...this.vox.cfg, edits: this.vox.editsForJoin() } } : {}),
      },
      info: { ...this.info, isOwner: user.isOwner },
      players: [...this.players.values()].map(this.netPlayer),
      spawn,
      inventory: p.tools,
      // skrypty gracza (działają w przeglądarce): kod jest jawny jak w LocalScript
      clientScripts: this.data.scripts.filter((s) => s.enabled && s.side === "client" && s.source.trim()).map((s) => ({ name: s.name, source: s.source })),
    });
    this.gui.enter(sid, this.data.currentPlace?.id ?? MAIN_PLACE);
    if (this.chaos) this.t.send(sid, "chaos", { on: true, x: this.chaos.cx, z: this.chaos.cz });
    this.vox?.join(sid);
    this.t.broadcast("join", this.netPlayer(p), sid);
    this.chat({ from: "", text: `${user.username} dołączył do gry`, system: true });
    if (user.isOwner) for (const l of this.logs) this.t.send(sid, "log", l);
    this.shop.attach(sid, user.owned, user.isOwner);
    this.lua?.playerJoined(sid);
    this.scoresDirty = true;
  }

  leave(sid: string) {
    const p = this.players.get(sid);
    if (!p) return;
    this.standUp(p);
    this.lua?.playerLeft(sid);
    this.vox?.leave(sid);
    this.dataStore.detach(sid);
    this.shop.detach(sid);
    this.gui.leave(sid);
    this.players.delete(sid);
    this.t.broadcast("leave", sid);
    this.chat({ from: "", text: `${p.username} wyszedł z gry`, system: true });
    this.scoresDirty = true;
  }

  dispose() {
    this.vox?.dispose();
    this.lua?.close();
    this.lua = null;
  }

  private netPlayer = (p: PlayerState): NetPlayer => ({
    sid: p.sid,
    userId: p.userId,
    username: p.username,
    avatar: p.avatar,
    x: p.x,
    y: p.y,
    z: p.z,
    ry: p.ry,
    anim: p.anim,
    tool: p.tool,
    character: p.character,
    animation: p.animation,
    hp: p.hp,
    maxHp: p.maxHp,
    seat: p.seat,
  });

  private starterTools() {
    return this.data.tools.filter((t) => t.starter).slice(0, MAX_INVENTORY).map((t) => t.id);
  }

  private get hasSpawnParts() {
    for (const p of this.partsById.values()) if (p.kind === "spawn") return true;
    return false;
  }

  private spawnPoint() {
    const spawns = [...this.partsById.values()].filter((p) => p.kind === "spawn");
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    if (!s) return this.vox ? this.vox.world.spawn() : { x: 0, y: 5, z: 0 };
    return { x: s.x + (Math.random() - 0.5) * 2, y: s.y + s.sy / 2 + 3, z: s.z + (Math.random() - 0.5) * 2 };
  }

  // ---------- Wiadomości od graczy ----------

  /** serwer pobrał monety za produkt - skrypt dostaje onPurchase */
  purchased(sid: string, productId: string) {
    const name = this.shop.purchased(sid, productId);
    if (name && this.players.has(sid)) this.lua?.purchased(sid, name);
  }

  handle(sid: string, type: string, msg: unknown) {
    switch (type) {
      case "m":
        return this.onMove(sid, msg);
      case "chat":
        return this.onChat(sid, msg);
      case "touch":
        return this.onTouch(sid, msg);
      case "equip":
        return this.onEquip(sid, msg);
      case "use":
        return this.onUse(sid, msg);
      case "anim":
        return this.onEmoteAnim(sid, msg);
      case "died": {
        const p = this.players.get(sid);
        if (p && !p.dead) this.markDead(p, null);
        return;
      }
      case "respawned":
        return this.onRespawned(sid);
      case "gui":
        return this.onGui(sid, msg);
      case "sit":
        return this.onSit(sid, msg);
      case "unsit": {
        const p = this.players.get(sid);
        if (p) this.standUp(p);
        return;
      }
      case "cev": {
        // zdarzenie ze skryptu gracza: { n: nazwa, a: [argumenty] } - nie ufamy niczemu, limit 30 / s
        const v = (msg ?? {}) as { n?: unknown; a?: unknown };
        const p = this.players.get(sid);
        if (!p || typeof v.n !== "string" || v.n.length > 40) return;
        const now = Date.now();
        if (now - p.netWindow > 1000) {
          p.netWindow = now;
          p.netCount = 0;
        }
        if (++p.netCount > 30) return;
        const args = (Array.isArray(v.a) ? v.a : []).slice(0, 5).map((x) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "boolean" ? x : typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, "").slice(0, 200) : ""));
        return this.lua?.fireNet(v.n, [sid, ...args]);
      }
      case "answer": {
        // odpowiedź z okienka prompt() skryptu
        const v = (msg ?? {}) as Record<string, unknown>;
        if (!this.players.has(sid) || typeof v.id !== "string" || typeof v.text !== "string") return;
        return this.lua?.answered(sid, v.id.slice(0, 40), v.text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80));
      }
      default:
        this.vox?.handle(sid, type, msg);
    }
  }

  /** przycisk w GUI: wbudowana akcja (zamknij, otwórz inne, idź do miejsca), potem onGuiClick w skryptach */
  private onGui(sid: string, msg: unknown) {
    const c = this.gui.click(sid, msg);
    if (!c) return;
    const a = c.el.action;
    if (clientGuiAction(a, (type, m) => this.t.send(sid, type, m))) {
      // okno pokoi / wyjście - GUI zostaje
    } else if (a && a.type !== "none") {
      this.gui.setOpen(sid, c.gui.id, false);
      if (a.type === "open" && a.target) this.gui.setOpen(sid, a.target, true);
      if (a.type === "place" && a.target) this.teleportToPlace(sid, a.target);
    }
    this.lua?.fire("gui", sid, c.gui.name, c.el.name);
  }

  /** przejście gracza do innego miejsca gry - klient łączy się z serwerem tamtego miejsca */
  teleportToPlace(sid: string, idOrName: string) {
    if (!this.players.has(sid)) return false;
    const place = findPlace(this.data, idOrName);
    if (!place) {
      this.log(`nie ma miejsca „${idOrName}” (Studio → Miejsca)`, true);
      return false;
    }
    this.t.send(sid, "place", { id: place.id, name: place.name });
    return true;
  }

  private onMove(sid: string, m: unknown) {
    const p = this.players.get(sid);
    if (!p || !m || typeof m !== "object" || this.chaosHits.has(sid)) return;
    const v = m as Record<string, unknown>;
    const x = finite(v.x, -LIMIT, LIMIT);
    const y = finite(v.y, -1000, LIMIT);
    const z = finite(v.z, -LIMIT, LIMIT);
    if (x === undefined || y === undefined || z === undefined) return;
    // ochrona przed oszustami: niemożliwy ruch = gracz wraca na ostatnią dobrą pozycję
    if (!this.moveAllowed(p, x, y, z)) return;
    p.x = x;
    p.y = y;
    p.z = z;
    // kąt spoza zakresu (stary klient dopisywał pełne obroty) zawijamy, zamiast go ignorować - inaczej postać "chodzi bokiem"
    const ryRaw = finite(v.ry, -1000, 1000);
    if (ryRaw !== undefined) p.ry = Math.atan2(Math.sin(ryRaw), Math.cos(ryRaw));
    let anim = ANIMS.includes(v.a as Anim) ? (v.a as Anim) : "idle";
    // emotka ze sklepu tylko dla tych, którzy ją kupili
    if (p.emotes && SHOP_EMOTES.includes(anim as ShopEmote) && !p.emotes.has(anim)) anim = "idle";
    // "dead" ustawia tylko serwer
    p.anim = p.dead ? "dead" : anim === "dead" ? "idle" : anim;
  }

  private onChat(sid: string, text: unknown) {
    const p = this.players.get(sid);
    if (!p || typeof text !== "string") return;
    const now = Date.now();
    if (now - p.lastChat < 700) return; // anty-spam
    p.lastChat = now;
    const clean = this.unfiltered.has(sid) ? text.trim().slice(0, 300) : filterChat(text);
    if (!clean) return;
    this.chat({ from: p.username, text: clean });
    this.lua?.chat(sid, clean);
  }

  private onTouch(sid: string, partId: unknown) {
    const p = this.players.get(sid);
    const part = typeof partId === "string" ? this.partsById.get(partId) : undefined;
    if (!p || !part || p.dead) return;
    // czy gracz jest naprawdę blisko klocka (ochrona przed oszustwami)
    const margin = 8;
    if (
      Math.abs(p.x - part.x) > part.sx / 2 + margin ||
      Math.abs(p.y - part.y) > part.sy / 2 + margin ||
      Math.abs(p.z - part.z) > part.sz / 2 + margin
    )
      return;
    const now = Date.now();
    if (now - (p.lastTouch.get(part.id) ?? 0) < 300) return;
    p.lastTouch.set(part.id, now);
    if (part.kind === "pickup" && part.toolId && part.transparency < 0.999) this.giveTool(p, part.toolId, true);
    this.lua?.touched(part.name, sid);
  }

  /** Gracz sam włącza animację oznaczoną jako emotka (albo null = stop) */
  private onEmoteAnim(sid: string, animId: unknown) {
    const p = this.players.get(sid);
    if (!p || p.dead) return;
    if (animId === null) return this.setAnimation(p, null);
    const anim = typeof animId === "string" ? this.data.animations.find((a) => a.id === animId) : undefined;
    if (anim?.emote) this.setAnimation(p, anim.id);
  }

  private setAnimation(p: PlayerState, animId: string | null) {
    p.animation = animId;
    this.t.broadcast("panim", { sid: p.sid, anim: animId });
  }

  // ---------- Narzędzia i zdrowie ----------

  private sendInventory(p: PlayerState) {
    this.t.send(p.sid, "inv", p.tools);
  }

  private giveTool(p: PlayerState, toolId: string, announce = false) {
    const tool = this.toolsById.get(toolId);
    if (!tool || p.tools.includes(toolId)) return false;
    if (p.tools.length >= MAX_INVENTORY) {
      if (announce) this.t.send(p.sid, "chat", { from: "", text: "Ekwipunek pełny!", system: true });
      return false;
    }
    p.tools.push(toolId);
    this.sendInventory(p);
    if (announce) this.t.send(p.sid, "picked", tool.id);
    return true;
  }

  private removeTool(p: PlayerState, toolId: string) {
    if (!p.tools.includes(toolId)) return;
    p.tools = p.tools.filter((t) => t !== toolId);
    if (p.tool === toolId) this.setEquipped(p, null);
    this.sendInventory(p);
  }

  private setEquipped(p: PlayerState, toolId: string | null) {
    if (p.tool === toolId) return;
    p.tool = toolId;
    this.t.broadcast("eq", { sid: p.sid, tool: toolId });
  }

  private onEquip(sid: string, toolId: unknown) {
    const p = this.players.get(sid);
    if (!p) return;
    if (toolId === null) return this.setEquipped(p, null);
    if (typeof toolId === "string" && p.tools.includes(toolId) && !p.dead) this.setEquipped(p, toolId);
  }

  private broadcastHp(p: PlayerState) {
    this.t.broadcast("hp", { sid: p.sid, hp: Math.round(p.hp), max: p.maxHp });
  }

  /** Zadaje obrażenia. attacker = null dla lawy/skryptów. */
  private damage(victim: PlayerState, amount: number, attacker: PlayerState | null, force = false) {
    if (victim.dead || amount <= 0) return;
    if (!force) {
      if (Date.now() < victim.protectedUntil) return;
      if (attacker && !this.data.pvp) return;
    }
    victim.hp = Math.max(0, victim.hp - amount);
    this.broadcastHp(victim);
    if (victim.hp <= 0) {
      this.t.send(victim.sid, "kill");
      this.markDead(victim, attacker);
    }
  }

  private heal(p: PlayerState, amount: number) {
    if (p.dead) return;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    this.broadcastHp(p);
  }

  // ---------- strażnik ruchu (ochrona przed oszustami) ----------

  /** kiedy skrypt ostatnio przesunął klocek (gracze stojący na ruchomych platformach jadą szybciej) */
  private partMovedAt = new Map<string, number>();

  /** teleport ze skryptu, odrodzenie - przez chwilę każda pozycja jest dobra */
  private moveGrace(p: PlayerState, ms: number) {
    Object.assign(p.mv, { x: p.x, y: p.y, z: p.z, t: Date.now(), graceUntil: Date.now() + ms, airTime: 0, airStartY: p.y });
  }

  /** czy ruch jest możliwy (prędkość, skok, latanie) - z dużym zapasem, żeby nie karać uczciwych graczy */
  private moveAllowed(p: PlayerState, x: number, y: number, z: number): boolean {
    const mv = p.mv;
    const now = Date.now();
    const accept = () => {
      Object.assign(mv, { x, y, z, t: now });
      return true;
    };
    if (p.dead || now < mv.graceUntil) return accept() && this.resetAir(p, y);
    const dt = Math.min(2, Math.max(0.05, (now - mv.t) / 1000));
    const seat = p.seat ? this.partsById.get(p.seat) : undefined;
    // pod nogami: klocek / teren (albo woda, albo siedzenie)
    const ground = raycastParts(this.collisions, x, y + 0.6, z, 0, -1, 0, 4);
    const inWater = waterAt(this.collisions, x, y + 1.5, z) !== null;
    const grounded = !!seat || inWater || !!ground;
    // prędkość w poziomie
    const speed = seat?.vehicle ? 95 : Math.max(mv.walk, 16) * (now < mv.boostUntil ? mv.boostMult : 1);
    let allowH = (speed * 1.5 + 12) * dt + 6;
    const movedPart = ground && ground.part.id !== "__terrain" ? this.partMovedAt.get(ground.part.id) : undefined;
    if (movedPart && now - movedPart < 1500) allowH += 150 * dt + 20; // ruchoma platforma
    // w górę: skok albo trampolina
    const upSpeed = Math.max(mv.jump, this.hasBounce ? 110 : 0, 50);
    let allowUp = upSpeed * 1.4 * dt + 6;
    if (movedPart && now - movedPart < 1500) allowUp += 150 * dt + 20; // winda
    const dh = Math.hypot(x - mv.x, z - mv.z);
    const up = y - mv.y;
    if (dh > allowH || up > allowUp) return this.moveViolation(p, dh > allowH ? `za szybki ruch (${dh.toFixed(0)} w ${dt.toFixed(2)} s)` : "za wysoki skok");
    // latanie: długo w powietrzu i nie spada
    if (grounded) this.resetAir(p, y);
    else {
      if (mv.airTime === 0) mv.airStartY = mv.y;
      mv.airTime += dt;
      const maxAir = ((2 * upSpeed) / Math.max(10, this.data.gravity)) * 1.6 + 1.5;
      if (mv.airTime > maxAir && y > mv.airStartY - 1) return this.moveViolation(p, "latanie");
    }
    return accept();
  }

  private resetAir(p: PlayerState, y: number) {
    p.mv.airTime = 0;
    p.mv.airStartY = y;
    return true;
  }

  private get hasBounce() {
    return (this._hasBounce ??= this.data.parts.some((q) => q.kind === "bounce"));
  }
  private _hasBounce: boolean | undefined;

  private moveViolation(p: PlayerState, reason: string): false {
    const now = Date.now();
    const mv = p.mv;
    mv.strikes = mv.strikes.filter((t) => now - t < 60_000);
    mv.strikes.push(now);
    mv.airTime = 0;
    mv.t = now;
    // wraca na ostatnią dobrą pozycję
    this.t.send(p.sid, "tp", { x: mv.x, y: mv.y, z: mv.z });
    if (mv.strikes.length === 1) this.t.send(p.sid, "chat", { from: "", text: "⚠️ Serwer cofnął twój ruch (niemożliwy ruch)", system: true });
    if (mv.strikes.length === 12) this.t.cheat?.(p.sid, reason, false);
    if (mv.strikes.length >= 40) this.t.cheat?.(p.sid, reason, true);
    return false;
  }

  // ---------- siedzenia i pojazdy ----------

  /** kto siedzi na którym siedzeniu (id klocka -> gracz) */
  private seated = new Map<string, string>();
  /** pojazd w chwili wsiadania: siedzenie i części modelu (żeby po wyjściu przestawić cały model) */
  private rides = new Map<string, { seat: { x: number; y: number; z: number; ry: number }; parts: Map<string, { x: number; y: number; z: number; ry: number }> }>();

  /** klocki jednego modelu (albo sam klocek) */
  private groupParts(part: Part): Part[] {
    if (!part.group) return [part];
    return [...this.partsById.values()].filter((o) => o.group === part.group);
  }

  // ---------- administracja gry (właściciel, współtwórcy, moderatorzy) ----------

  /** nazwy narzędzi tej gry (do okna admina) */
  toolNames(): string[] {
    return this.data.tools.map((t) => t.name);
  }

  /** daje narzędzie po nazwie ("*" = wszystkie) */
  adminGiveTool(sid: string, name: string): number {
    const p = this.players.get(sid);
    if (!p) return 0;
    let n = 0;
    for (const t of this.data.tools) if ((name === "*" || t.name === name) && this.giveTool(p, t.id, true)) n++;
    return n;
  }

  /** zabiera narzędzie po nazwie ("*" = wszystkie) */
  adminTakeTool(sid: string, name: string) {
    const p = this.players.get(sid);
    if (!p) return;
    for (const t of this.data.tools) if (name === "*" || t.name === name) this.removeTool(p, t.id);
  }

  private onSit(sid: string, msg: unknown) {
    const p = this.players.get(sid);
    const id = typeof msg === "string" ? msg : String((msg as { id?: unknown })?.id ?? "");
    const part = this.partsById.get(id);
    if (!p || !part || part.kind !== "seat" || p.dead || p.seat) return;
    if (this.seated.has(part.id)) return;
    // gracz musi być przy siedzeniu (ochrona przed oszustwami)
    const margin = 10;
    if (Math.abs(p.x - part.x) > part.sx / 2 + margin || Math.abs(p.y - part.y) > part.sy / 2 + margin || Math.abs(p.z - part.z) > part.sz / 2 + margin) return;
    this.seated.set(part.id, sid);
    p.seat = part.id;
    if (part.vehicle) {
      const parts = new Map(this.groupParts(part).map((o) => [o.id, { x: o.x, y: o.y, z: o.z, ry: o.ry }]));
      this.rides.set(sid, { seat: { x: part.x, y: part.y, z: part.z, ry: part.ry }, parts });
    }
    this.t.broadcast("seat", { sid, id: part.id });
    this.lua?.fire("sit", sid, part.name);
  }

  /** gracz wstaje (skok, śmierć, wyjście z gry) - pojazd zostaje tam, gdzie dojechał */
  private standUp(p: PlayerState) {
    if (!p.seat) return;
    const part = this.partsById.get(p.seat);
    this.seated.delete(p.seat);
    p.seat = null;
    const ride = this.rides.get(p.sid);
    this.rides.delete(p.sid);
    if (part && ride) {
      // siedzenie jest pod stopami kierowcy, a model obraca się razem z nim
      const turn = ((p.ry * 180) / Math.PI - ride.seat.ry) * (Math.PI / 180);
      const cos = Math.cos(turn), sin = Math.sin(turn);
      const nx = p.x, nz = p.z;
      const ny = p.y - part.sy / 2;
      for (const [id, o] of ride.parts) {
        const q = this.partsById.get(id);
        if (!q) continue;
        const dx = o.x - ride.seat.x, dz = o.z - ride.seat.z;
        q.x = Math.min(LIMIT, Math.max(-LIMIT, nx + dx * cos + dz * sin));
        q.z = Math.min(LIMIT, Math.max(-LIMIT, nz - dx * sin + dz * cos));
        q.y = Math.min(LIMIT, Math.max(-500, ny + (o.y - ride.seat.y)));
        q.ry = (((o.ry + (turn * 180) / Math.PI) % 360) + 360) % 360;
        this.collisions.set(q);
        this.dirtyParts.set(q.id, { ...this.dirtyParts.get(q.id), x: q.x, y: q.y, z: q.z, ry: q.ry });
      }
    }
    this.t.broadcast("seat", { sid: p.sid, id: null });
    if (part) this.lua?.fire("unsit", p.sid, part.name);
  }

  private markDead(p: PlayerState, killer: PlayerState | null) {
    this.standUp(p);
    p.dead = true;
    p.anim = "dead";
    if (p.hp !== 0) {
      p.hp = 0;
      this.broadcastHp(p);
    }
    if (killer && killer !== p) this.chat({ from: "", text: `⚔️ ${killer.username} pokonał ${p.username}`, system: true });
    this.lua?.died(p.sid, killer?.sid ?? "");
  }

  private onRespawned(sid: string) {
    const p = this.players.get(sid);
    if (!p) return;
    // gracz pojawia się na spawnie - to nie teleport-oszustwo
    this.moveGrace(p, 3000);
    p.dead = false;
    p.hp = p.maxHp;
    p.protectedUntil = Date.now() + SPAWN_PROTECTION_MS;
    // po śmierci ekwipunek wraca do startowego (jak w Robloxie)
    p.tools = this.starterTools();
    this.setEquipped(p, null);
    this.sendInventory(p);
    this.broadcastHp(p);
    this.lua?.playerRespawned(sid);
  }

  private onUse(sid: string, m: unknown) {
    const p = this.players.get(sid);
    if (!p || p.dead || !m || typeof m !== "object") return;
    const v = m as Record<string, unknown>;
    const tool = typeof v.id === "string" ? this.toolsById.get(v.id) : undefined;
    if (!tool || !p.tools.includes(tool.id)) return;
    const now = Date.now();
    // mały zapas na opóźnienia sieci
    if (now - (p.lastUse.get(tool.id) ?? 0) < tool.cooldown * 1000 * 0.85) return;
    p.lastUse.set(tool.id, now);
    if (p.tool !== tool.id) this.setEquipped(p, tool.id);
    const ry = finite(v.ry, -10, 10);
    if (ry !== undefined) p.ry = ry;

    let action: ActionAnim = "use";
    let to: number[] | undefined;
    let from: number[] | undefined;
    if (tool.type === "melee") {
      action = "swing";
      this.meleeHit(p, tool);
    } else if (tool.type === "ranged") {
      action = "shoot";
      const res = this.shoot(p, tool, v);
      from = res.from;
      to = res.to;
    } else if (tool.type === "heal") {
      this.heal(p, tool.heal);
    } else if (tool.type === "boost") {
      this.t.send(sid, "boost", { secs: tool.boost, mult: 1.8 });
      Object.assign(p.mv, { boostUntil: Date.now() + (tool.boost ?? 0) * 1000 + 500, boostMult: 1.8 });
    } else {
      action = "swing";
    }
    this.t.broadcast("act", { sid: p.sid, type: action, tool: tool.id, from, to });
    this.lua?.toolUsed(p.sid, tool.name);
  }

  private meleeHit(p: PlayerState, tool: ToolDef) {
    // przód postaci to -z obrócone o ry
    const fx = -Math.sin(p.ry);
    const fz = -Math.cos(p.ry);
    for (const other of this.players.values()) {
      if (other === p || other.dead) continue;
      const dx = other.x - p.x;
      const dz = other.z - p.z;
      const dy = other.y - p.y;
      const dist = Math.hypot(dx, dz);
      if (dist > tool.range + 1 || Math.abs(dy) > 5) continue;
      // cel musi być mniej więcej przed nami (albo tuż obok)
      if (dist > 2.5 && (dx * fx + dz * fz) / dist < 0.35) continue;
      this.damage(other, tool.damage, p);
    }
  }

  private shoot(p: PlayerState, tool: ToolDef, v: Record<string, unknown>) {
    const head = { x: p.x, y: p.y + 4, z: p.z };
    let ox = finite(v.ox, -LIMIT, LIMIT) ?? head.x;
    let oy = finite(v.oy, -1000, LIMIT) ?? head.y;
    let oz = finite(v.oz, -LIMIT, LIMIT) ?? head.z;
    // start strzału musi być przy graczu
    if (Math.hypot(ox - head.x, oy - head.y, oz - head.z) > 8) [ox, oy, oz] = [head.x, head.y, head.z];
    let dx = finite(v.dx, -1, 1) ?? -Math.sin(p.ry);
    let dy = finite(v.dy, -1, 1) ?? 0;
    let dz = finite(v.dz, -1, 1) ?? -Math.cos(p.ry);
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;

    const wall = raycastParts(this.collisions, ox, oy, oz, dx, dy, dz, tool.range);
    let maxDist = wall ? wall.dist : tool.range;
    let target: PlayerState | null = null;
    for (const other of this.players.values()) {
      if (other === p || other.dead) continue;
      const t = rayBox(
        ox, oy, oz, dx, dy, dz,
        other.x - PLAYER_HALF, other.y, other.z - PLAYER_HALF,
        other.x + PLAYER_HALF, other.y + PLAYER_HEIGHT, other.z + PLAYER_HALF,
      );
      if (t !== null && t < maxDist) {
        maxDist = t;
        target = other;
      }
    }
    if (target) this.damage(target, tool.damage, p);
    const r = (n: number) => Math.round(n * 100) / 100;
    return { from: [r(ox), r(oy), r(oz)], to: [r(ox + dx * maxDist), r(oy + dy * maxDist), r(oz + dz * maxDist)] };
  }

  // ---------- Pętla gry ----------

  tick() {
    this.lua?.tick();
    this.vox?.tick(0.05);
    this.stepRigid();
    this.stepChaos();
    if (this.players.size > 0) {
      const snap = [...this.players.values()].map((p) => [
        p.sid,
        Math.round(p.x * 100) / 100,
        Math.round(p.y * 100) / 100,
        Math.round(p.z * 100) / 100,
        Math.round(p.ry * 100) / 100,
        p.anim,
      ]);
      this.t.broadcast("s", snap);
    }
    if (this.dirtyParts.size > 0) {
      this.t.broadcast(
        "part",
        [...this.dirtyParts.entries()].map(([id, props]) => ({ id, ...props })),
      );
      this.dirtyParts.clear();
    }
    if (this.scoresDirty) {
      this.scoresDirty = false;
      const hasScores = [...this.players.values()].some((p) => p.score !== 0);
      this.t.broadcast(
        "scores",
        hasScores ? [...this.players.values()].map((p) => ({ name: p.username, score: p.score })) : [],
      );
    }
  }

  // ---------- CHAOS ----------

  get chaosOn() {
    return !!this.chaos;
  }

  /** zmiana klocka przez chaos (jak skrypt: płynne przejście tw, kolizje serwera od razu aktualne) */
  private chaosSet(part: Part, props: PartChange) {
    const { tw, ...rest } = props;
    Object.assign(part, rest);
    this.collisions.set(part);
    if (rest.x !== undefined || rest.y !== undefined || rest.z !== undefined) this.partMovedAt.set(part.id, Date.now());
    const next: PartChange = { ...this.dirtyParts.get(part.id), ...rest };
    if (tw) next.tw = tw;
    else delete next.tw;
    this.dirtyParts.set(part.id, next);
  }

  /** Włącza chaos: fala zniszczenia rusza z miejsca, w którym stoi włączający. Zwraca false, gdy już trwa. */
  startChaos(fromSid: string): boolean {
    if (this.chaos) return false;
    const from = this.players.get(fromSid);
    const cx = from?.x ?? 0;
    const cz = from?.z ?? 0;
    const list: { part: Part; d: number }[] = [];
    let maxD = 0;
    for (const part of this.partsById.values()) {
      if (part.kind === "spawn") continue;
      const big = Math.max(part.sx, part.sz);
      // wielkie klocki (podłoga) wymagają, żeby fala przeszła prawie przez całe
      const d = Math.hypot(part.x - cx, part.z - cz) + (big > 30 ? big * 0.3 : 0);
      list.push({ part, d });
      if (d > maxD) maxD = d;
    }
    list.sort((a, b) => a.d - b.d);
    this.chaos = { cx, cz, t0: Date.now(), radius: 0, list, next: 0, maxD };
    this.t.broadcast("chaos", { on: true, x: cx, z: cz });
    return true;
  }

  /** Wyłącza chaos i przywraca mapę. */
  stopChaos() {
    if (!this.chaos) return;
    this.chaos = null;
    this.chaosSteps = [];
    for (const [id, o] of this.chaosOrig) {
      const part = this.partsById.get(id);
      if (part) this.chaosSet(part, { x: o.x, y: o.y, z: o.z, ry: o.ry, transparency: o.transparency ?? 0, collide: o.collide, tw: 0 });
    }
    this.chaosOrig.clear();
    this.t.broadcast("chaos", { on: false });
  }

  private stepChaos() {
    const now = Date.now();
    // pochłonięci gracze: po glitchu ekranu wylatują z gry
    for (const [sid, at] of this.chaosHits) {
      if (now < at) continue;
      this.chaosHits.delete(sid);
      if (this.players.has(sid)) this.t.kick?.(sid, "Pochłonął Cię chaos 💥");
    }
    const c = this.chaos;
    if (!c) return;
    // kolejne etapy rozbitych klocków: wzlot -> spadanie w otchłań -> niewidoczne
    while (this.chaosSteps.length && this.chaosSteps[0].at <= now) {
      const st = this.chaosSteps.shift()!;
      const part = this.partsById.get(st.id);
      if (!part) continue;
      if (st.step === 2) this.chaosSet(part, { x: round2(part.x + st.dx), y: -150, z: round2(part.z + st.dz), tw: 2.2 });
      else this.chaosSet(part, { transparency: 1 });
    }
    const el = (now - c.t0) / 1000;
    c.radius = 3 + 6 * el + 0.8 * el * el;
    // niszczymy klocki, do których dotarła fala (po kolei od najbliższych; nie więcej niż 60 naraz)
    let budget = 60;
    let pushed = false;
    while (c.next < c.list.length && c.list[c.next].d <= c.radius && budget-- > 0) {
      const { part } = c.list[c.next++];
      if (!this.chaosOrig.has(part.id)) this.chaosOrig.set(part.id, { x: part.x, y: part.y, z: part.z, ry: part.ry, transparency: part.transparency, collide: part.collide });
      const ang = Math.atan2(part.z - c.cz, part.x - c.cx) + (Math.random() - 0.5) * 0.8;
      const big = Math.max(part.sx, part.sz) > 30;
      const out = big ? 0 : 4 + Math.random() * 9;
      const dx = Math.cos(ang) * out;
      const dz = Math.sin(ang) * out;
      const up = big ? -3 : 6 + Math.random() * 14;
      const tw = big ? 1.2 : 0.7 + Math.random() * 0.6;
      this.chaosSet(part, { x: round2(part.x + dx), y: round2(Math.max(-500, part.y + up)), z: round2(part.z + dz), ry: Math.round(((part.ry ?? 0) + (Math.random() - 0.5) * 720) % 3600), collide: false, tw });
      this.chaosSteps.push({ at: now + tw * 1000, id: part.id, step: 2, dx: dx * 0.4, dz: dz * 0.4 });
      this.chaosSteps.push({ at: now + tw * 1000 + 2300, id: part.id, step: 3, dx: 0, dz: 0 });
      pushed = true;
    }
    if (pushed) this.chaosSteps.sort((a, b) => a.at - b.at);
    // gracze (poza administracją gry), do których dotarła fala: glitch ekranu, a potem wyrzucenie
    for (const p of this.players.values()) {
      if (p.admin || this.chaosHits.has(p.sid)) continue;
      if (Math.hypot(p.x - c.cx, p.z - c.cz) <= c.radius - 1) {
        this.chaosHits.set(p.sid, now + 3000);
        this.t.send(p.sid, "chaosHit", { ms: 3000 });
        this.chat({ from: "", text: `💥 ${p.username} został pochłonięty przez chaos`, system: true });
      }
    }
  }

  /** fizyka brył: gracze popychają, ruszone klocki idą do klientów jak zmiany skryptów */
  private stepRigid() {
    if (this.rigid.bodies.size === 0) return;
    const now = Date.now();
    const pushers = [...this.players.values()]
      .filter((p) => !p.dead)
      .map((p) => {
        const prev = this.lastPos.get(p.sid);
        this.lastPos.set(p.sid, [p.x, p.y, p.z, now]);
        const dt = prev ? Math.max(0.02, (now - prev[3]) / 1000) : 0;
        return { x: p.x, y: p.y, z: p.z, vx: prev && dt < 0.5 ? (p.x - prev[0]) / dt : 0, vz: prev && dt < 0.5 ? (p.z - prev[2]) / dt : 0 };
      });
    for (const b of this.rigid.step(0.05, pushers)) {
      this.partMovedAt.set(b.id, now);
      this.dirtyParts.set(b.id, { ...this.dirtyParts.get(b.id), x: round2(b.x), y: round2(b.y), z: round2(b.z), tw: 0.07 });
    }
  }

  private chat(msg: ChatMsg) {
    this.t.broadcast("chat", msg);
  }

  private toolByName(name: string) {
    return this.data.tools.find((t) => t.name === name);
  }

  // ---------- Skrypty ----------

  private startScripts() {
    const scripts = this.data.scripts.filter((s) => s.enabled && s.source.trim() && s.side !== "client");
    if (scripts.length === 0) return;
    const player = (sid: string) => this.players.get(sid);
    const host: ScriptHost = {
      say: (text) => this.chat({ from: "", text: filterChat(text), system: true }),
      tell: (sid, text) => this.t.send(sid, "chat", { from: "", text: filterChat(text), system: true }),
      log: (text, error = false) => this.log(text, error),
      setPart: (name, props) => this.updatePartsByName(name, () => props),
      movePart: (name, dx, dy, dz) =>
        this.updatePartsByName(name, (part) => ({ x: part.x + dx, y: part.y + dy, z: part.z + dz })),
      getPart: (name) => {
        for (const p of this.partsById.values()) if (p.name === name) return p;
        return null;
      },
      kill: (sid) => {
        const p = player(sid);
        if (p && !p.dead) this.damage(p, p.hp, null, true);
      },
      teleport: (sid, x, y, z) => {
        const p = player(sid);
        const tx = finite(x, -LIMIT, LIMIT);
        const ty = finite(y, -500, LIMIT);
        const tz = finite(z, -LIMIT, LIMIT);
        if (!p || tx === undefined || ty === undefined || tz === undefined) return;
        Object.assign(p, { x: tx, y: ty, z: tz });
        this.moveGrace(p, 1500);
        this.t.send(sid, "tp", { x: tx, y: ty, z: tz });
      },
      playerName: (sid) => player(sid)?.username ?? "",
      players: () => [...this.players.keys()],
      playerPosition: (sid) => {
        const p = player(sid);
        return p ? { x: p.x, y: p.y, z: p.z } : null;
      },
      getScore: (sid) => player(sid)?.score ?? 0,
      setScore: (sid, value) => {
        const p = player(sid);
        if (!p || !Number.isFinite(value)) return;
        p.score = value;
        this.scoresDirty = true;
      },
      setSpeed: (sid, speed) => {
        const p = player(sid);
        const v = finite(speed, 0, 200);
        if (p && v !== undefined) p.mv.walk = v;
        this.t.send(sid, "stats", { speed: v });
      },
      setJump: (sid, jump) => {
        const p = player(sid);
        const v = finite(jump, 0, 300);
        if (p && v !== undefined) p.mv.jump = v;
        this.t.send(sid, "stats", { jump: v });
      },
      giveTool: (sid, name) => {
        const p = player(sid);
        const t = this.toolByName(name);
        return !!p && !!t && this.giveTool(p, t.id);
      },
      removeTool: (sid, name) => {
        const p = player(sid);
        const t = this.toolByName(name);
        if (p && t) this.removeTool(p, t.id);
      },
      hasTool: (sid, name) => {
        const t = this.toolByName(name);
        return !!t && !!player(sid)?.tools.includes(t.id);
      },
      damage: (sid, n) => {
        const p = player(sid);
        const v = finite(n, 0, 1e6);
        if (p && v) this.damage(p, v, null, true);
      },
      heal: (sid, n) => {
        const p = player(sid);
        const v = finite(n, 0, 1e6);
        if (p && v) this.heal(p, v);
      },
      getHealth: (sid) => player(sid)?.hp ?? 0,
      setHealth: (sid, n) => {
        const p = player(sid);
        const v = finite(n, 0, p?.maxHp ?? 0);
        if (!p || v === undefined || p.dead) return;
        if (v <= 0) return this.damage(p, p.hp, null, true);
        p.hp = v;
        this.broadcastHp(p);
      },
      setCharacter: (sid, name) => {
        const p = player(sid);
        if (!p) return;
        const c = name ? this.data.characters.find((x) => x.name === name) : undefined;
        if (name && !c) return this.log(`setCharacter: nie ma postaci „${name}”`, true);
        p.character = c?.id ?? null;
        this.t.broadcast("char", { sid, character: p.character });
      },
      playAnimation: (sid, name) => {
        const p = player(sid);
        const a = this.data.animations.find((x) => x.name === name);
        if (!a) return this.log(`playAnimation: nie ma animacji „${name}”`, true);
        if (p) this.setAnimation(p, a.id);
      },
      stopAnimation: (sid) => {
        const p = player(sid);
        if (p) this.setAnimation(p, null);
      },
      npcAnimation: (partName, name) => {
        const a = name ? this.data.animations.find((x) => x.name === name) : undefined;
        if (name && !a) return this.log(`npcAnimation: nie ma animacji „${name}”`, true);
        this.updatePartsByName(partName, () => ({ animId: a?.id ?? "" }));
      },
      setSky: (c) => {
        if (!COLOR_RE.test(c)) return;
        this.sky = c;
        this.skybox = "";
        this.t.broadcast("sky", c);
      },
    };
    try {
      this.lua = new LuaEngine(host);
    } catch (e) {
      this.log(String(e), true);
      return;
    }
    this.dataStore.register(this.lua);
    this.shop.register(this.lua);
    if (this.vox) this.lua.defineFunctions(this.vox.luaFunctions());
    // cel: id gracza albo pusty tekst / nil = wszyscy
    const to = (target: unknown, type: string, msg: unknown) => {
      const sid = typeof target === "string" ? target : "";
      if (sid) {
        if (this.players.has(sid)) this.t.send(sid, type, msg);
      } else this.t.broadcast(type, msg);
    };
    const soundName = (n: unknown) => {
      const name = String(n ?? "");
      if (name && !this.data.sounds?.some((x) => x.name === name)) this.log(`nie ma dźwięku „${name}” (Ustawienia gry → Dźwięki)`, true);
      return name;
    };
    this.lua.defineFunctions(guiLuaFunctions(this.gui, () => [...this.players.keys()], (text) => this.log(text, true)));
    this.lua.defineFunctions(roomLuaFunctions((sid, type, msg) => this.players.has(sid) && this.t.send(sid, type, msg), this.info.room));
    this.lua.defineFunctions({
      // miejsca gry: teleportToPlace(player, "Arena"), getPlace() = nazwa tego miejsca
      teleportToPlace: (sid, name) => this.teleportToPlace(String(sid ?? ""), String(name ?? "")),
      getPlace: () => this.data.currentPlace?.name ?? "",
      // administracja: czy gracz jest właścicielem / administracją gry, jego numer konta, wyrzucenie z gry
      isOwner: (sid) => !!this.players.get(String(sid ?? ""))?.isOwner,
      isAdmin: (sid) => !!this.players.get(String(sid ?? ""))?.admin,
      getUserId: (sid) => this.players.get(String(sid ?? ""))?.userId ?? 0,
      kick: (sid, reason) => {
        const p = this.players.get(String(sid ?? ""));
        if (p && !p.admin) this.t.kick?.(p.sid, String(reason ?? "").slice(0, 120));
      },
      // przymierzalnia: ubranie z katalogu na graczu (tylko w tej grze, nie zmienia konta). Zwraca true, gdy się udało
      tryOn: (sid, itemId) => {
        const p = this.players.get(String(sid ?? ""));
        const item = findItem(String(itemId ?? ""));
        if (!p || !item || item.type === "emote") return false;
        p.avatar = { ...p.avatar, [item.type]: item.id };
        this.t.broadcast("wear", { sid: p.sid, avatar: p.avatar });
        return true;
      },
      // zdejmij rzecz z miejsca: takeOff(player, "hair" | "hat" | "face" | "shirt" | "pants" | "back" | "neck")
      takeOff: (sid, slot) => {
        const p = this.players.get(String(sid ?? ""));
        const k = String(slot ?? "");
        if (!p || !["hair", "hat", "face", "shirt", "pants", "back", "neck"].includes(k)) return;
        p.avatar = { ...p.avatar, [k]: k === "face" ? "smile" : "none" };
        this.t.broadcast("wear", { sid: p.sid, avatar: p.avatar });
      },
      // kolor części ciała i włosów: setAvatarColor(player, "head" | "torso" | "arms" | "legs" | "hairColor", "#ff8800")
      setAvatarColor: (sid, part, color) => {
        const p = this.players.get(String(sid ?? ""));
        const k = String(part ?? "");
        if (!p || !["head", "torso", "arms", "legs", "hairColor"].includes(k) || !COLOR_RE.test(String(color ?? ""))) return;
        p.avatar = { ...p.avatar, [k]: String(color) };
        this.t.broadcast("wear", { sid: p.sid, avatar: p.avatar });
      },
      // przywraca wygląd z konta
      resetAvatar: (sid) => {
        const p = this.players.get(String(sid ?? ""));
        if (!p) return;
        p.avatar = { ...p.baseAvatar };
        this.t.broadcast("wear", { sid: p.sid, avatar: p.avatar });
      },
      awardBadge: (sid, name) => this.t.badge?.(String(sid ?? ""), String(name ?? "")),
      playSound: (target, name) => to(target, "sound", { name: soundName(name) }),
      setMusic: (name, target) => to(target, "music", { name: name ? soundName(name) : "" }),
      // efekt cząsteczkowy (silnik Apex): effect("fire", x, y, z, ilość) - ogień, dym, iskry, magia, kurz, plusk, błysk
      effect: (kind, x, y, z, n) => {
        const k = String(kind ?? "");
        const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
        if (!["fire", "smoke", "sparks", "magic", "dust", "splash", "flash", "hit"].includes(k)) return this.log(`nie ma efektu „${k}” (fire, smoke, sparks, magic, dust, splash, flash, hit)`, true);
        this.t.broadcast("fx", { kind: k, x: num(x), y: num(y), z: num(z), n: Math.min(60, Math.max(1, Math.round(num(n, 14)))) });
      },
      speak: (target, text, lang) =>
        to(target, "speak", { text: filterChat(String(text ?? "")).slice(0, 200), lang: typeof lang === "string" ? lang.slice(0, 10) : "pl-PL" }),
      prompt: (target, id, question, sayText, lang) => {
        if (typeof target !== "string" || !this.players.has(target)) return;
        this.t.send(target, "prompt", {
          id: String(id ?? "").slice(0, 40),
          question: filterChat(String(question ?? "")).slice(0, 200),
          ...(sayText ? { speak: String(sayText).slice(0, 200), lang: typeof lang === "string" ? lang.slice(0, 10) : "pl-PL" } : {}),
        });
      },
      closePrompt: (target) => to(target, "prompt", null),
      // napis nad klockiem (np. cena przycisku): setLabel("Przycisk", "Dropper - 50 💰"), "" = bez napisu
      // fizyka brył: setPhysics("Kula", true, 0.6) - klocek spada, odbija się i da się go popychać; pushPart("Kula", vx, vy, vz) - kopnięcie
      // zdarzenia do skryptów graczy: fireClient(player, "nazwa", a, b) - player = nil: wszyscy
      fireClient: (target, name, a, b, c, d, e) => {
        const n = String(name ?? "").slice(0, 40);
        const clean = [a, b, c, d, e].filter((x) => x !== null && x !== undefined).map((x) => (typeof x === "string" ? x.slice(0, 200) : x));
        to(target, "sev", { n, a: clean });
      },
      setPhysics: (name, on, bounce) => {
        for (const part of this.partsById.values()) {
          if (part.name !== String(name ?? "")) continue;
          if (on === false) {
            delete part.dynamic;
            this.rigid.remove(part.id);
          } else {
            part.dynamic = true;
            part.bounce = typeof bounce === "number" ? Math.min(1, Math.max(0, bounce)) : (part.bounce ?? 0.3);
            this.rigid.remove(part.id);
            if (!this.rigid.add(part)) this.log("za dużo brył z fizyką (maks. 100)", true);
          }
        }
      },
      pushPart: (name, vx, vy, vz) => {
        const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-200, Math.min(200, v)) : 0);
        for (const part of this.partsById.values()) if (part.name === String(name ?? "")) this.rigid.push(part.id, n(vx), n(vy), n(vz));
      },
      // obrót klocka / NPC wokół osi Y w stopniach (np. potwór patrzy w stronę, w którą idzie)
      setRotation: (name, deg) => this.updatePartsByName(String(name ?? ""), () => ({ ry: deg })),
      setLabel: (name, text) => this.updatePartsByName(String(name ?? ""), () => ({ label: String(text ?? "") })),
      // płynne przesunięcie klocka do x, y, z w podanym czasie (np. cukierek jadący po taśmie)
      tweenPart: (name, x, y, z, secs) =>
        this.updatePartsByName(String(name ?? ""), () => ({ x, y, z, tw: typeof secs === "number" ? secs : 0 })),
      // płynne przesunięcie o tyle (wszystkie klocki o tej nazwie razem - np. cała rakieta)
      tweenMove: (name, dx, dy, dz, secs) => {
        const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
        this.updatePartsByName(String(name ?? ""), (part) => ({ x: part.x + n(dx), y: part.y + n(dy), z: part.z + n(dz), tw: n(secs) }));
      },
      getPlayerLook: (sid) => {
        const p = this.players.get(String(sid ?? ""));
        return p ? [-Math.sin(p.ry), -Math.cos(p.ry)] : null;
      },
      setVisibleFor: (sid, name, visible) => {
        const target = String(sid ?? "");
        if (!this.players.has(target)) return;
        const changes: (Partial<Part> & { id: string })[] = [];
        for (const part of this.partsById.values())
          if (part.name === name) changes.push({ id: part.id, transparency: visible ? part.transparency : 1, collide: visible ? part.collide : false });
        if (changes.length) this.t.send(target, "part", changes);
      },
      // gotowe niebo: setSkybox("night") dla wszystkich albo setSkybox("night", player); "" = zwykły kolor
      setSkybox: (name, target) => {
        const id = typeof name === "string" && name && name !== "none" ? findSkybox(name)?.id : "";
        if (id === undefined) return this.log(`setSkybox: nie ma nieba „${String(name)}” (są: ${SKYBOXES.map((s) => s.id).join(", ")})`, true);
        if (target === undefined || target === null || target === "") this.skybox = id;
        to(target, "skybox", id);
      },
      // latarka mruga (horror): flicker(player, sekundy) albo flicker(nil, sekundy) dla wszystkich
      flicker: (target, secs) => to(target, "flicker", typeof secs === "number" ? Math.min(10, Math.max(0.1, secs)) : 1),
      setSkyFor: (sid, color) => {
        if (typeof color === "string" && COLOR_RE.test(color)) to(sid, "sky", color);
      },
      setLight: (brightness, fog, target) =>
        to(target, "light", {
          ...(typeof brightness === "number" ? { brightness: Math.min(1.5, Math.max(0.02, brightness)) } : {}),
          ...(typeof fog === "number" ? { fog: Math.min(2000, Math.max(0, fog)) } : {}),
        }),
    });
    for (const s of scripts) this.lua.runScript(s.name, s.source);
  }

  private log(text: string, error: boolean) {
    const entry = { text: text.slice(0, 500), error };
    this.logs.push(entry);
    if (this.logs.length > 50) this.logs.shift();
    for (const p of this.players.values()) if (p.isOwner) this.t.send(p.sid, "log", entry);
  }

  /** Zmienia wszystkie klocki o danej nazwie (skrypty odwołują się do klocków po nazwie). */
  private updatePartsByName(name: string, change: (part: Part) => Record<string, unknown>) {
    for (const part of this.partsById.values()) {
      if (part.name !== name) continue;
      const props = change(part);
      const clean: Partial<Part> = {};
      if (typeof props.color === "string" && COLOR_RE.test(props.color)) clean.color = props.color;
      for (const k of ["x", "z"] as const) {
        const v = finite(props[k], -LIMIT, LIMIT);
        if (v !== undefined) clean[k] = v;
      }
      const y = finite(props.y, -500, LIMIT);
      if (y !== undefined) clean.y = y;
      for (const k of ["sx", "sy", "sz"] as const) {
        const v = finite(props[k], 0.1, 2048);
        if (v !== undefined) clean[k] = v;
      }
      const t = finite(props.transparency, 0, 1);
      if (t !== undefined) clean.transparency = t;
      const ryv = finite(props.ry, -3600, 3600);
      if (ryv !== undefined) clean.ry = ryv;
      if (typeof props.collide === "boolean") clean.collide = props.collide;
      if (typeof props.animId === "string") clean.animId = props.animId;
      if (typeof props.label === "string") clean.label = filterChat(props.label.slice(0, MAX_LABEL));
      if (Object.keys(clean).length === 0) continue;
      Object.assign(part, clean);
      if (clean.x !== undefined || clean.y !== undefined || clean.z !== undefined) this.partMovedAt.set(part.id, Date.now());
      this.collisions.set(part);
      if (part.dynamic && (clean.x !== undefined || clean.y !== undefined || clean.z !== undefined)) this.rigid.teleport(part.id, part.x, part.y, part.z);
      // tw = płynne przejście (sekundy) - klient przesuwa klocek po drodze, serwer od razu zna pozycję końcową
      const tw = finite(props.tw, 0, 600);
      const next: PartChange = { ...this.dirtyParts.get(part.id), ...clean };
      if (tw) next.tw = tw;
      else if (clean.x !== undefined || clean.y !== undefined || clean.z !== undefined) delete next.tw;
      this.dirtyParts.set(part.id, next);
    }
  }
}
