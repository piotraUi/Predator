// Współpraca w Studiu 2D: zmiany wysyłane na żywo innym twórcom tej gry (tylko zmienione kawałki gry),
// a inni twórcy widoczni na planszy jako kolorowe kropki z nickiem; ich zaznaczenie ma ramkę w ich kolorze.
import { Client, type Room } from "colyseus.js";
import { flatten2d, sig2d, unflatten2d, FIELDS_2D } from "../../../shared/collab2d.ts";
import type { WorldData } from "../../../shared/types.ts";
import type { Asset2D, Level2D } from "../../../shared/types2d.ts";
import { getToken, wsUrl } from "../api.ts";
import type { Editor } from "../studio/collab.ts";

export interface Remote2D extends Editor {
  x: number;
  y: number;
  /** pozycja rysowana (płynnie goni x, y) */
  dx: number;
  dy: number;
  level: string;
  sel: string | null;
  seen: boolean;
}

export interface Change2D {
  /** nowe albo zmienione obrazki / dźwięki */
  assets: Asset2D[];
  keys: string[];
}

export interface Collab2DOpts {
  worldId: number;
  data: WorldData;
  /** gdzie jest mój kursor (w świecie) i co zaznaczyłem */
  cursor: () => { x: number; y: number; level: string; sel: string | null };
  /** zmiany od innych (albo stan z serwera po połączeniu) już są w data - Studio odświeża widok */
  onRemote: (c: Change2D) => void;
  onEditors: (list: Editor[]) => void;
}

const SEND_EVERY_MS = 150;

export class Collab2D {
  private room: Room | null = null;
  readonly remotes = new Map<string, Remote2D>();
  /** ostatnio uzgodniony z serwerem stan: podpis każdego kawałka (+ dane obrazków osobno) */
  private sent = new Map<string, string>();
  private sentData = new Map<string, string>();
  private me = "";
  private timer = 0;
  private lastCursor = "";
  private disposed = false;
  connected = false;

  constructor(private o: Collab2DOpts) {
    this.baseline(flatten2d(o.data));
    this.connect();
    this.timer = window.setInterval(() => {
      this.flush();
      this.sendCursor();
    }, SEND_EVERY_MS);
  }

  private async connect() {
    try {
      const room = await new Client(wsUrl()).joinOrCreate("studio", { worldId: this.o.worldId, token: getToken() });
      if (this.disposed) return room.leave();
      this.room = room;
      room.onMessage("state", (m: { you: string; data: WorldData; editors: Editor[] }) => this.onState(m));
      room.onMessage("joined", (e: Editor) => {
        this.addRemote(e);
        this.emitEditors();
      });
      room.onMessage("left", (sid: string) => {
        this.remotes.delete(sid);
        this.emitEditors();
      });
      room.onMessage("ops2d", (m: { set: Record<string, unknown> }) => {
        // moje niewysłane jeszcze zmiany idą najpierw; serwer dostanie je po tych, więc tych kawałków nie nadpisujemy
        const mine = this.flush();
        const set = { ...m.set };
        for (const k of mine) delete set[k];
        if (Object.keys(set).length) this.apply(set, true);
      });
      room.onMessage("cursor2d", (m: { sid: string; x: number; y: number; level: string; sel: string | null }) => {
        const r = this.remotes.get(m.sid);
        if (!r) return;
        Object.assign(r, { x: m.x, y: m.y, level: m.level, sel: m.sel });
        if (!r.seen) Object.assign(r, { dx: m.x, dy: m.y, seen: true });
      });
      room.onLeave(() => {
        this.connected = false;
        this.remotes.clear();
        this.emitEditors([]);
        if (!this.disposed) setTimeout(() => this.connect(), 3000);
      });
    } catch {
      if (!this.disposed) setTimeout(() => this.connect(), 5000);
    }
  }

  /** połączono (także ponownie po zerwaniu): stan z serwera + moje zmiany, których serwer jeszcze nie ma */
  private onState(m: { you: string; data: WorldData; editors: Editor[] }) {
    this.me = m.you;
    const pending = this.pending();
    const srv = flatten2d(m.data);
    const set: Record<string, unknown> = {};
    const local = flatten2d(this.o.data);
    for (const k of new Set([...srv.keys(), ...local.keys()])) {
      if (k in pending) continue;
      const a = srv.get(k), b = local.get(k);
      if (sig2d(k, a) !== sig2d(k, b) || (k.startsWith("asset:") && (a as Asset2D | undefined)?.data !== (b as Asset2D | undefined)?.data)) set[k] = a ?? null;
    }
    if (Object.keys(set).length) this.apply(set, false);
    this.baseline(srv);
    this.connected = true;
    this.flush();
    for (const e of m.editors) if (e.sid !== this.me) this.addRemote(e);
    this.emitEditors();
  }

  private baseline(flat: Map<string, unknown>) {
    this.sent = new Map();
    this.sentData = new Map();
    for (const [k, v] of flat) {
      this.sent.set(k, sig2d(k, v));
      if (k.startsWith("asset:")) this.sentData.set(k, (v as Asset2D).data);
    }
  }

  /** kawałki różne od ostatnio uzgodnionych (null = usunięty) */
  private pending(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const flat = flatten2d(this.o.data);
    for (const [k, v] of flat) {
      if (this.sent.get(k) !== sig2d(k, v) || (k.startsWith("asset:") && this.sentData.get(k) !== (v as Asset2D).data)) out[k] = v;
    }
    for (const k of this.sent.keys()) if (!flat.has(k)) out[k] = null;
    return out;
  }

  /** wysyła moje zmiany (sprawdzane co chwilę - Studio nie musi zgłaszać każdej) */
  flush(): string[] {
    if (!this.room || !this.connected) return [];
    const set = this.pending();
    const keys = Object.keys(set);
    if (!keys.length) return [];
    for (const k of keys) this.remember(k, set[k]);
    this.room.send("ops2d", { set });
    return keys;
  }

  private remember(k: string, v: unknown) {
    if (v === null || v === undefined) {
      this.sent.delete(k);
      this.sentData.delete(k);
    } else {
      this.sent.set(k, sig2d(k, v));
      if (k.startsWith("asset:")) this.sentData.set(k, (v as Asset2D).data);
    }
  }

  /** nakłada kawałki na grę w miejscu (te same obiekty zostają - Studio trzyma do nich odwołania) */
  private apply(set: Record<string, unknown>, remember: boolean) {
    const d = this.o.data;
    const w = d.world2d!;
    const flat = flatten2d(d);
    const change: Change2D = { assets: [], keys: Object.keys(set) };
    for (const [k, v] of Object.entries(set)) {
      if (remember) this.remember(k, v);
      if (v === null || v === undefined) {
        flat.delete(k);
        continue;
      }
      const cur = flat.get(k);
      const inPlace = /^(asset:|obj:|char:|inst:)/.test(k) && cur && typeof cur === "object" && typeof v === "object";
      if (inPlace) {
        const c = cur as Record<string, unknown>;
        for (const key of Object.keys(c)) if (!(key in (v as object))) delete c[key];
        Object.assign(c, v);
      } else flat.set(k, v);
      if (k.startsWith("asset:")) change.assets.push((inPlace ? cur : v) as Asset2D);
    }
    const rec = d as unknown as Record<string, unknown>;
    for (const f of FIELDS_2D) {
      const v = flat.get("f:" + f);
      if (v === undefined) delete rec[f];
      else rec[f] = v;
    }
    const nw = unflatten2d(flat);
    // poziomy też zostają tymi samymi obiektami
    const oldLevels = new Map<string, Level2D>(w.levels.map((l) => [l.id, l]));
    nw.levels = nw.levels.map((l) => {
      const cur = oldLevels.get(l.id);
      if (!cur) return l;
      const c = cur as unknown as Record<string, unknown>;
      for (const key of Object.keys(c)) if (!(key in l)) delete c[key];
      return Object.assign(cur, l);
    });
    Object.assign(w, nw);
    this.o.onRemote(change);
  }

  private addRemote(e: Editor) {
    if (this.remotes.has(e.sid) || e.sid === this.me) return;
    this.remotes.set(e.sid, { ...e, x: 0, y: 0, dx: 0, dy: 0, level: "", sel: null, seen: false });
  }

  private emitEditors(list?: Editor[]) {
    const all = list ?? [...this.remotes.values()];
    this.o.onEditors(all.filter((e) => e.sid !== this.me).map(({ sid, userId, username, color }) => ({ sid, userId, username, color })));
  }

  private sendCursor() {
    if (!this.room || !this.connected) return;
    const c = this.o.cursor();
    const msg = { x: Math.round(c.x), y: Math.round(c.y), level: c.level, sel: c.sel };
    const j = JSON.stringify(msg);
    if (j === this.lastCursor) return;
    this.lastCursor = j;
    this.room.send("cursor2d", msg);
  }

  /** płynny ruch kropek innych twórców (wywoływane co klatkę) */
  animate(dt: number) {
    const k = Math.min(1, dt * 12);
    for (const r of this.remotes.values()) {
      r.dx += (r.x - r.dx) * k;
      r.dy += (r.y - r.dy) * k;
    }
  }

  dispose() {
    this.flush();
    this.disposed = true;
    clearInterval(this.timer);
    this.remotes.clear();
    this.room?.leave();
  }
}
