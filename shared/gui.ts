// GUI gier (2D i 3D): okienka, napisy, przyciski i obrazki na ekranie gracza.
// Twórca układa je w Studio (edytor GUI), a skrypty Lua / bloczki je pokazują, chowają i zmieniają napisy.
// Pozycje są w procentach ekranu, więc GUI wygląda tak samo na telefonie i na komputerze.

export type GuiElType = "frame" | "text" | "button" | "image";
/**
 * Co robi przycisk (bez pisania skryptu):
 *  close - zamyka to GUI
 *  open  - zamyka to GUI i otwiera inne (target = id GUI)
 *  level - gry 2D: przenosi gracza na poziom (target = nazwa poziomu) i zamyka GUI
 *  place - gry 3D: przenosi gracza do innego miejsca (target = id miejsca)
 *  rooms - okno pokoi gry (lista, tworzenie, dołączanie); target = poziom 2D / miejsce 3D, na którym gra się w pokoju
 *  exit  - wyjście z gry (do strony głównej Predatora)
 * Skrypt i tak dostaje onGuiClick(player, gui, przycisk).
 */
export type GuiActionType = "none" | "close" | "open" | "level" | "place" | "rooms" | "exit";

export interface GuiAction {
  type: GuiActionType;
  target?: string;
}

export interface GuiEl {
  id: string;
  /** nazwa dla skryptów (setGuiText, onGuiClick) */
  name: string;
  type: GuiElType;
  /** lewy górny róg i rozmiar w procentach ekranu (0 - 100) */
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  /** kolor napisu */
  color?: string;
  /** tło */
  bg?: string;
  bgOpacity?: number;
  /** zaokrąglenie rogów (px przy ekranie 1280x720) */
  radius?: number;
  /** wielkość napisu (px przy ekranie 1280x720) */
  fontSize?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  /** obramowanie (kolor) */
  border?: string;
  /** obrazek (data URL) - w elemencie image albo jako wygląd przycisku */
  image?: string;
  /** obrazek ostry jak pixel-art (bez rozmycia przy powiększaniu) */
  pixel?: boolean;
  /** obrazek odbity w poziomie */
  flip?: boolean;
  action?: GuiAction;
}

export interface GuiDef {
  id: string;
  /** nazwa dla skryptów (showGui, hideGui) */
  name: string;
  /** widoczne od wejścia do gry (albo wejścia na poziom / do miejsca z "where") */
  open: boolean;
  /** tylko na tym poziomie 2D / w tym miejscu 3D (id) - brak = wszędzie */
  where?: string;
  /** przyciemnia grę pod spodem (np. menu, sklep) */
  modal?: boolean;
  elements: GuiEl[];
}

export const MAX_GUIS = 40;
export const MAX_GUI_ELEMENTS = 60;
export const MAX_GUI_IMAGE = 400_000;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const TYPES: GuiElType[] = ["frame", "text", "button", "image"];
const ACTIONS: GuiActionType[] = ["none", "close", "open", "level", "place", "rooms", "exit"];

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number, def = "") => (typeof v === "string" ? v.slice(0, max) : def);
const num = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const color = (v: unknown) => (typeof v === "string" && COLOR_RE.test(v) ? v : undefined);
let counter = 0;
export const newGuiId = () => "g" + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 5);

function sanitizeEl(raw: unknown): GuiEl {
  const e = obj(raw);
  const type = TYPES.includes(e.type as GuiElType) ? (e.type as GuiElType) : "text";
  const out: GuiEl = {
    id: str(e.id, 40) || newGuiId(),
    name: str(e.name, 40).trim() || "Element",
    type,
    x: num(e.x, -50, 150, 10),
    y: num(e.y, -50, 150, 10),
    w: num(e.w, 0.5, 200, 20),
    h: num(e.h, 0.5, 200, 10),
  };
  if (typeof e.text === "string") out.text = e.text.slice(0, 300);
  const c = color(e.color);
  if (c) out.color = c;
  const bg = color(e.bg);
  if (bg) out.bg = bg;
  if (e.bgOpacity !== undefined) out.bgOpacity = num(e.bgOpacity, 0, 1, 1);
  if (e.radius !== undefined) out.radius = num(e.radius, 0, 200, 0);
  if (e.fontSize !== undefined) out.fontSize = num(e.fontSize, 6, 200, 24);
  if (e.bold === true) out.bold = true;
  if (e.align === "left" || e.align === "right" || e.align === "center") out.align = e.align;
  const border = color(e.border);
  if (border) out.border = border;
  if (typeof e.image === "string" && e.image.length <= MAX_GUI_IMAGE && IMAGE_RE.test(e.image)) out.image = e.image;
  if (e.pixel === true) out.pixel = true;
  if (e.flip === true) out.flip = true;
  const a = obj(e.action);
  if (ACTIONS.includes(a.type as GuiActionType) && a.type !== "none") {
    out.action = { type: a.type as GuiActionType };
    if (typeof a.target === "string" && a.target) out.action.target = a.target.slice(0, 40);
  }
  return out;
}

export function sanitizeGuis(raw: unknown): GuiDef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  let images = 0;
  const out = raw.slice(0, MAX_GUIS).map((r): GuiDef => {
    const g = obj(r);
    const elements = (Array.isArray(g.elements) ? g.elements.slice(0, MAX_GUI_ELEMENTS) : []).map(sanitizeEl);
    // obrazki razem nie więcej niż ok. 3 MB
    for (const el of elements) {
      if (!el.image) continue;
      images += el.image.length;
      if (images > 3_000_000) delete el.image;
    }
    const def: GuiDef = { id: str(g.id, 40) || newGuiId(), name: str(g.name, 40).trim() || "GUI", open: g.open === true, elements };
    if (typeof g.where === "string" && g.where) def.where = g.where.slice(0, 40);
    if (g.modal === true) def.modal = true;
    return def;
  });
  return out.length ? out : undefined;
}

/** gotowe szablony w edytorze GUI */
export function guiTemplate(kind: "empty" | "menu" | "window" | "counter", name: string): GuiDef {
  const el = (e: Partial<GuiEl> & Pick<GuiEl, "type" | "name">): GuiEl => ({ id: newGuiId(), x: 10, y: 10, w: 20, h: 10, ...e });
  const g: GuiDef = { id: newGuiId(), name, open: false, elements: [] };
  if (kind === "menu") {
    g.open = true;
    g.modal = true;
    g.elements = [
      el({ type: "text", name: "Tytuł", x: 15, y: 14, w: 70, h: 18, text: "Moja gra", fontSize: 72, bold: true, color: "#ffffff", align: "center" }),
      el({ type: "button", name: "Graj", x: 37.5, y: 46, w: 25, h: 11, text: "▶ Graj", fontSize: 36, bold: true, color: "#ffffff", bg: "#2ecc71", radius: 16, action: { type: "close" } }),
      el({ type: "text", name: "Podpis", x: 25, y: 84, w: 50, h: 6, text: "Zrobione w Predatorze", fontSize: 20, color: "#dddddd", align: "center" }),
    ];
  } else if (kind === "window") {
    g.modal = true;
    g.elements = [
      el({ type: "frame", name: "Okno", x: 30, y: 25, w: 40, h: 50, bg: "#1f2127", bgOpacity: 0.95, radius: 18, border: "#3a86ff" }),
      el({ type: "text", name: "Tytuł", x: 32, y: 28, w: 36, h: 9, text: "Okienko", fontSize: 34, bold: true, color: "#ffffff", align: "center" }),
      el({ type: "text", name: "Treść", x: 33, y: 39, w: 34, h: 20, text: "Tu wpisz tekst albo zmień go skryptem setGuiText.", fontSize: 20, color: "#dddddd", align: "center" }),
      el({ type: "button", name: "Zamknij", x: 42, y: 63, w: 16, h: 8, text: "OK", fontSize: 24, bold: true, color: "#ffffff", bg: "#3a86ff", radius: 12, action: { type: "close" } }),
    ];
  } else if (kind === "counter") {
    g.open = true;
    g.elements = [
      el({ type: "frame", name: "Tło", x: 1.5, y: 2.5, w: 18, h: 8, bg: "#000000", bgOpacity: 0.45, radius: 12 }),
      el({ type: "text", name: "Licznik", x: 2.5, y: 3, w: 16, h: 7, text: "⭐ 0", fontSize: 30, bold: true, color: "#ffd24a", align: "left" }),
    ];
  }
  return g;
}

/** Stan GUI graczy na serwerze: które są otwarte i jakie napisy ustawiły skrypty. */
export class GuiRuntime {
  private open = new Map<string, Set<string>>();
  private texts = new Map<string, Record<string, string>>();

  constructor(
    readonly guis: GuiDef[],
    private send: (sid: string, msg: { open: string[]; text: Record<string, string> }) => void,
  ) {}

  /** GUI po nazwie albo id */
  find(name: string) {
    return this.guis.find((g) => g.name === name) ?? this.guis.find((g) => g.id === name) ?? this.guis.find((g) => g.name.toLowerCase() === name.toLowerCase());
  }

  /** gracz wszedł do gry / na poziom / do miejsca - otwierają się GUI widoczne od startu */
  enter(sid: string, where: string) {
    let set = this.open.get(sid);
    if (!set) this.open.set(sid, (set = new Set()));
    for (const g of this.guis) if (g.open && (!g.where || g.where === where)) set.add(g.id);
    this.push(sid);
  }

  leave(sid: string) {
    this.open.delete(sid);
    this.texts.delete(sid);
  }

  isOpen(sid: string, name: string) {
    const g = this.find(name);
    return !!g && !!this.open.get(sid)?.has(g.id);
  }

  setOpen(sid: string, name: string, on: boolean) {
    const g = this.find(name);
    const set = this.open.get(sid);
    if (!g || !set) return false;
    if (on === set.has(g.id)) return true;
    if (on) set.add(g.id);
    else set.delete(g.id);
    this.push(sid);
    return true;
  }

  setText(sid: string, guiName: string, elName: string, text: string) {
    const g = this.find(guiName);
    const el = g?.elements.find((e) => e.name === elName) ?? g?.elements.find((e) => e.id === elName);
    if (!g || !el || !this.open.has(sid)) return false;
    let t = this.texts.get(sid);
    if (!t) this.texts.set(sid, (t = {}));
    t[g.id + "/" + el.id] = text.slice(0, 300);
    this.push(sid);
    return true;
  }

  /** kliknięcie przycisku: tylko w otwartym GUI i tylko przycisk */
  click(sid: string, msg: unknown): { gui: GuiDef; el: GuiEl } | null {
    const m = obj(msg);
    const g = typeof m.g === "string" ? this.guis.find((x) => x.id === m.g) : undefined;
    if (!g || !this.open.get(sid)?.has(g.id)) return null;
    const el = typeof m.e === "string" ? g.elements.find((x) => x.id === m.e) : undefined;
    if (!el || el.type !== "button") return null;
    return { gui: g, el };
  }

  private push(sid: string) {
    this.send(sid, { open: [...(this.open.get(sid) ?? [])], text: { ...(this.texts.get(sid) ?? {}) } });
  }
}

type LuaArg = string | number | boolean | null | undefined | LuaArg[];

/**
 * Funkcje Lua dla GUI (te same w grach 2D i 3D). player = nil / "" - wszyscy gracze.
 *   showGui(player, "Menu"), hideGui(player, "Menu"), toggleGui(player, "Menu"), isGuiOpen(player, "Menu"),
 *   setGuiText(player, "Licznik", "Napis", "⭐ 5")
 */
/** pokój (multiplayer), w którym działa serwer - pokazywany graczom, czytany przez skrypty */
export interface RoomInfo {
  name: string;
  /** kod prywatnego pokoju */
  code?: string;
  maxPlayers: number;
}

/**
 * Wbudowane akcje przycisków, które działają po stronie gracza: okno pokoi i wyjście z gry.
 * Zwraca true, gdy przycisk ich użył (GUI zostaje wtedy otwarte - np. menu pod oknem pokoi).
 */
export function clientGuiAction(action: GuiAction | undefined, send: (type: string, msg: unknown) => void) {
  if (action?.type === "rooms") return send("rooms", { target: action.target ?? "" }), true;
  if (action?.type === "exit") return send("exit", {}), true;
  return false;
}

/** Lua: pokoje gry i wyjście (openRooms, exitGame, getRoom) */
export function roomLuaFunctions(send: (sid: string, type: string, msg: unknown) => void, room: RoomInfo | undefined) {
  return {
    openRooms: (p: LuaArg, target: LuaArg, max: LuaArg) => {
      if (typeof p === "string") send(p, "rooms", { target: typeof target === "string" ? target.slice(0, 40) : "", ...(typeof max === "number" ? { max: Math.min(30, Math.max(2, Math.round(max))) } : {}) });
    },
    exitGame: (p: LuaArg) => {
      if (typeof p === "string") send(p, "exit", {});
    },
    /** nazwa pokoju ("" = zwykły serwer gry) */
    getRoom: () => room?.name ?? "",
  };
}

export function guiLuaFunctions(rt: GuiRuntime, players: () => string[], log: (text: string) => void) {
  const targets = (p: LuaArg) => (typeof p === "string" && p ? [p] : players());
  const known = (name: LuaArg) => {
    const ok = typeof name === "string" && !!rt.find(name);
    if (!ok) log(`nie ma GUI „${String(name ?? "")}” (Studio → GUI)`);
    return ok;
  };
  return {
    showGui: (p: LuaArg, name: LuaArg) => {
      if (known(name)) for (const sid of targets(p)) rt.setOpen(sid, String(name), true);
    },
    hideGui: (p: LuaArg, name: LuaArg) => {
      if (known(name)) for (const sid of targets(p)) rt.setOpen(sid, String(name), false);
    },
    toggleGui: (p: LuaArg, name: LuaArg) => {
      if (known(name)) for (const sid of targets(p)) rt.setOpen(sid, String(name), !rt.isOpen(sid, String(name)));
    },
    isGuiOpen: (p: LuaArg, name: LuaArg) => typeof p === "string" && typeof name === "string" && rt.isOpen(p, name),
    setGuiText: (p: LuaArg, gui: LuaArg, el: LuaArg, text: LuaArg) => {
      if (!known(gui)) return;
      for (const sid of targets(p)) rt.setText(sid, String(gui), String(el ?? ""), String(text ?? ""));
    },
  };
}
