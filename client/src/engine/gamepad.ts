// Pady: Xbox (One / Series), PlayStation 4 (DualShock 4) i PlayStation 5 (DualSense, DualSense Edge) oraz inne.
// Przeglądarka (Chrome, Edge, Safari, aplikacja na Androida i iOS, exe) daje zwykle układ "standard"; gdy nie
// (np. DualSense w Firefoksie), przyciski Sony przestawiamy sami. Wszystko sprowadzamy do jednego układu:
// A/✕, B/○, X/□, Y/△, LB/L1, RB/R1, LT/L2, RT/R2, Back/Create, Start/Options, gałki, krzyżak, Xbox/PS.
import { toast } from "../ui/dom.ts";

export type PadKind = "xbox" | "ps" | "generic";
export const PAD_BUTTONS = ["a", "b", "x", "y", "lb", "rb", "lt", "rt", "back", "start", "ls", "rs", "up", "down", "left", "right", "home", "touchpad"] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];

export interface PadState {
  connected: boolean;
  kind: PadKind;
  name: string;
  /** gałki -1..1 (y w dół = +1, jak w przeglądarce) */
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  /** spusty 0..1 */
  lt: number;
  rt: number;
  /** trzymane */
  down: Record<PadButton, boolean>;
  /** wciśnięte w tej klatce (raz) */
  pressed: Record<PadButton, boolean>;
}

const none = () => Object.fromEntries(PAD_BUTTONS.map((b) => [b, false])) as Record<PadButton, boolean>;
const EMPTY: PadState = { connected: false, kind: "generic", name: "", lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, down: none(), pressed: none() };

/** rodzaj pada z nazwy (id zawiera producenta: Sony 054c, Microsoft 045e) */
export function padKind(id: string): PadKind {
  const s = id.toLowerCase();
  if (/054c|sony|playstation|dualsense|dualshock|wireless controller|ps[345]/.test(s)) return "ps";
  if (/045e|xbox|xinput|microsoft/.test(s)) return "xbox";
  return "generic";
}
/** ładna nazwa do komunikatu */
export function padName(id: string): string {
  const s = id.toLowerCase();
  if (/0df2|dualsense edge/.test(s)) return "PlayStation 5 (DualSense Edge)";
  if (/0ce6|dualsense/.test(s)) return "PlayStation 5 (DualSense)";
  if (/05c4|09cc|0ba0|dualshock|ps4/.test(s)) return "PlayStation 4 (DualShock 4)";
  if (padKind(id) === "ps") return "PlayStation";
  if (padKind(id) === "xbox") return "Xbox";
  return "pad";
}

/** strefa martwa gałki (pady lekko „pływają” w miejscu) */
function stick(x: number, y: number, dead = 0.18): [number, number] {
  const len = Math.hypot(x, y);
  if (len < dead) return [0, 0];
  const k = Math.min(1, (len - dead) / (1 - dead)) / len;
  return [x * k, y * k];
}

/** krzyżak jako jedna oś (tzw. hat w DirectInput): -1 = góra, dalej co 1/7 zgodnie z zegarem, > 1 = puszczony */
function hat(v: number | undefined) {
  const out = { up: false, down: false, left: false, right: false };
  if (v === undefined || v > 1.05 || v < -1.05) return out;
  const i = Math.round((v + 1) * 3.5) % 8; // 0 = góra, 1 = góra-prawo, 2 = prawo...
  out.up = i === 7 || i === 0 || i === 1;
  out.right = i >= 1 && i <= 3;
  out.down = i >= 3 && i <= 5;
  out.left = i >= 5 && i <= 7;
  return out;
}

/** odczyt jednego pada w układzie wspólnym */
export function readPad(p: Gamepad): Omit<PadState, "pressed"> {
  const b = (i: number) => !!p.buttons[i]?.pressed;
  const v = (i: number) => p.buttons[i]?.value ?? 0;
  const ax = (i: number) => p.axes[i] ?? 0;
  const kind = padKind(p.id);
  const down = none();
  let lx: number, ly: number, rx: number, ry: number, lt: number, rt: number;
  if (p.mapping === "standard" || kind !== "ps") {
    // układ standard (i większość padów Xbox / zwykłych bez niego)
    [down.a, down.b, down.x, down.y, down.lb, down.rb] = [b(0), b(1), b(2), b(3), b(4), b(5)];
    lt = v(6);
    rt = v(7);
    [down.back, down.start, down.ls, down.rs] = [b(8), b(9), b(10), b(11)];
    [down.up, down.down, down.left, down.right] = [b(12), b(13), b(14), b(15)];
    down.home = b(16);
    down.touchpad = b(17);
    [lx, ly] = stick(ax(0), ax(1));
    [rx, ry] = stick(ax(2), ax(3));
    // pad bez układu standard z krzyżakiem jako osią
    if (p.mapping !== "standard" && p.axes.length > 9) Object.assign(down, Object.fromEntries(Object.entries(hat(ax(9))).map(([k, on]) => [k, on || down[k as PadButton]])));
  } else {
    // DualSense / DualShock 4 bez układu standard (np. Firefox): □ ✕ ○ △ L1 R1 L2 R2 Create Options L3 R3 PS Touchpad
    [down.x, down.a, down.b, down.y, down.lb, down.rb] = [b(0), b(1), b(2), b(3), b(4), b(5)];
    lt = Math.max(v(6), b(6) ? 1 : 0);
    rt = Math.max(v(7), b(7) ? 1 : 0);
    [down.back, down.start, down.ls, down.rs, down.home, down.touchpad] = [b(8), b(9), b(10), b(11), b(12), b(13)];
    [lx, ly] = stick(ax(0), ax(1));
    // prawa gałka: oś 2 (X) i 5 (Y); osie 3 i 4 to spusty
    [rx, ry] = stick(ax(2), ax(5));
    Object.assign(down, hat(ax(9)));
    // niektóre systemy dają krzyżak jako przyciski 14-17
    if (p.buttons.length > 17) {
      down.up ||= b(14);
      down.down ||= b(15);
      down.left ||= b(16);
      down.right ||= b(17);
    }
  }
  down.lt = lt > 0.35;
  down.rt = rt > 0.35;
  return { connected: true, kind, name: padName(p.id), lx, ly, rx, ry, lt, rt, down };
}

/**
 * Pady podłączone do komputera / telefonu. poll() raz na klatkę daje stan ostatnio używanego pada.
 * Podłączenie pada pokazuje krótką podpowiedź sterowania.
 */
export class Gamepads {
  state: PadState = EMPTY;
  private prev = none();
  private active = -1;
  private lastStamp = new Map<number, number>();
  private cleanup: () => void;

  constructor(private hint?: (kind: PadKind) => string) {
    const on = (e: GamepadEvent) => {
      const name = padName(e.gamepad.id);
      toast(`🎮 Podłączono pad ${name}` + (this.hint ? " - " + this.hint(padKind(e.gamepad.id)) : ""), "good");
    };
    const off = (e: GamepadEvent) => {
      if (e.gamepad.index === this.active) this.active = -1;
      toast("🎮 Pad odłączony");
    };
    window.addEventListener("gamepadconnected", on);
    window.addEventListener("gamepaddisconnected", off);
    this.cleanup = () => {
      window.removeEventListener("gamepadconnected", on);
      window.removeEventListener("gamepaddisconnected", off);
    };
  }

  poll(): PadState {
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads?.() ? [...navigator.getGamepads()] : [];
    } catch {
      /* przeglądarka bez padów */
    }
    // używamy pada, na którym ktoś ostatnio coś nacisnął
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const last = this.lastStamp.get(p.index);
      if (last !== undefined && p.timestamp !== last && this.active !== p.index) {
        const s = readPad(p);
        if (Object.values(s.down).some(Boolean) || Math.abs(s.lx) + Math.abs(s.ly) + Math.abs(s.rx) + Math.abs(s.ry) > 0.3) this.active = p.index;
      }
      this.lastStamp.set(p.index, p.timestamp);
      if (this.active < 0) this.active = p.index;
    }
    const pad = pads.find((p) => p && p.connected && p.index === this.active);
    if (!pad) {
      this.prev = none();
      return (this.state = EMPTY);
    }
    const s = readPad(pad);
    const pressed = none();
    for (const k of PAD_BUTTONS) pressed[k] = s.down[k] && !this.prev[k];
    this.prev = s.down;
    return (this.state = { ...s, pressed });
  }

  /** wibracje (DualSense, DualShock 4, Xbox) - gdy przeglądarka pozwala */
  rumble(strong: number, weak: number, ms: number) {
    const pad = navigator.getGamepads?.()?.[this.active];
    const act = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    act?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
  }

  dispose() {
    this.cleanup();
  }
}

/** nazwy przycisków na podpowiedziach: Xbox (A B X Y) albo PlayStation (✕ ○ □ △) */
export function btn(kind: PadKind, b: "a" | "b" | "x" | "y" | "lb" | "rb" | "lt" | "rt" | "start" | "back") {
  const ps = { a: "✕", b: "○", x: "□", y: "△", lb: "L1", rb: "R1", lt: "L2", rt: "R2", start: "Options", back: "Create" };
  const xb = { a: "A", b: "B", x: "X", y: "Y", lb: "LB", rb: "RB", lt: "LT", rt: "RT", start: "Menu", back: "View" };
  return (kind === "ps" ? ps : xb)[b];
}

/**
 * Sterowanie menu padem: krzyżak / lewa gałka przechodzi między przyciskami widocznego okna,
 * A / ✕ klika, B / ○ zamyka (gdy jest czym).
 */
export class PadMenuNav {
  private focused: HTMLElement | null = null;
  private repeatAt = 0;

  /** root: okno, w którym chodzimy; close: co zrobić na B / ○ */
  update(pad: PadState, root: HTMLElement | null, close?: () => void) {
    if (!root || !pad.connected) return this.clear();
    const items = [...root.querySelectorAll<HTMLElement>("button, .gui-button, [data-pad]")].filter((e) => {
      if ((e as HTMLButtonElement).disabled) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    });
    if (!items.length) return this.clear();
    if (!this.focused || !items.includes(this.focused)) this.focus(items[0]);
    const now = performance.now();
    const dir = pad.down.up || pad.ly < -0.6 ? "up" : pad.down.down || pad.ly > 0.6 ? "down" : pad.down.left || pad.lx < -0.6 ? "left" : pad.down.right || pad.lx > 0.6 ? "right" : null;
    const fresh = pad.pressed.up || pad.pressed.down || pad.pressed.left || pad.pressed.right;
    if (dir && (fresh || now > this.repeatAt)) {
      this.repeatAt = now + (fresh ? 380 : 160);
      const next = nearest(this.focused!, items, dir);
      if (next) this.focus(next);
    } else if (!dir) this.repeatAt = 0;
    if (pad.pressed.a && this.focused) this.focused.click();
    else if (pad.pressed.b && close) close();
  }

  private focus(e: HTMLElement) {
    this.focused?.classList.remove("pad-focus");
    this.focused = e;
    e.classList.add("pad-focus");
    e.scrollIntoView?.({ block: "nearest" });
  }

  clear() {
    this.focused?.classList.remove("pad-focus");
    this.focused = null;
  }
}

/** najbliższy przycisk w danym kierunku (na ekranie) */
function nearest(from: HTMLElement, items: HTMLElement[], dir: "up" | "down" | "left" | "right") {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const e of items) {
    if (e === from) continue;
    const r = e.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    const main = dir === "up" ? -dy : dir === "down" ? dy : dir === "left" ? -dx : dx;
    const side = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
    if (main <= 2) continue;
    const score = main + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}
