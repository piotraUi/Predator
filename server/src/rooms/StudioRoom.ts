// Współpraca w Studiu: wszyscy edytujący jedną grę są w tym pokoju. Serwer trzyma aktualny stan gry,
// rozsyła zmiany (klocki, teren, skrypty...) i pozycje kamer innych twórców (kulki w Studiu).
// Co chwilę zapisuje grę w bazie, więc nikt nie traci pracy.
import { Room, type Client } from "colyseus";
import type { Part, WorldData } from "../../../shared/types.ts";
import { MAX_PARTS, sanitizeWorld } from "../../../shared/world.ts";
import { applyOps2d, flatten2d } from "../../../shared/collab2d.ts";
import { userFromToken } from "../auth.ts";
import { canEdit, worlds, type UserRow } from "../db.ts";
import { queueWorldScan } from "../moderation.ts";

/** pola gry (poza klockami), które synchronizujemy w całości */
export const STUDIO_FIELDS = [
  "scripts", "tools", "characters", "animations", "skyColor", "skybox", "gravity", "pvp", "playerCharacter",
  "badges", "products", "sounds", "music", "light", "atmosphere", "nature", "gore", "genre", "terrain", "guis", "places", "startPlace", "blocks",
] as const;
type Field = (typeof STUDIO_FIELDS)[number];

const COLORS = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00acc1", "#fdd835", "#d81b60", "#6d4c41", "#3949ab"];
const SAVE_EVERY_MS = 15_000;

interface Editor {
  sid: string;
  userId: number;
  username: string;
  color: string;
}

export class StudioRoom extends Room {
  private worldId = 0;
  private data!: WorldData;
  private editors = new Map<string, Editor>();
  private dirty = false;

  onCreate(options: { worldId?: number }) {
    const w = worlds.byId(Number(options.worldId));
    if (!w) throw new Error("Nie ma takiej gry");
    this.worldId = w.id;
    this.data = sanitizeWorld(JSON.parse(w.data));
    this.maxClients = 11;
    this.autoDispose = true;

    this.onMessage("ops", (client, m: { parts?: unknown; del?: unknown; fields?: unknown }) => this.onOps(client, m));
    this.onMessage("ops2d", (client, m: { set?: unknown }) => this.onOps2d(client, m));
    this.onMessage("cursor2d", (client, m: { x?: unknown; y?: unknown; level?: unknown; sel?: unknown }) => {
      const x = Number(m?.x), y = Number(m?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || typeof m.level !== "string") return;
      const sel = typeof m.sel === "string" ? m.sel.slice(0, 40) : null;
      this.broadcast("cursor2d", { sid: client.sessionId, x: Math.round(x), y: Math.round(y), level: m.level.slice(0, 40), sel }, { except: client });
    });
    this.onMessage("cursor", (client, m: { p?: unknown; t?: unknown; sel?: unknown }) => {
      const nums = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? (v as number[]) : null);
      const p = nums(m?.p), t = nums(m?.t);
      if (!p || !t) return;
      const sel = typeof m.sel === "string" ? m.sel.slice(0, 40) : null;
      this.broadcast("cursor", { sid: client.sessionId, p, t, sel }, { except: client });
    });
    this.clock.setInterval(() => this.save(), SAVE_EVERY_MS);
  }

  onAuth(_client: Client, options: { token?: string }) {
    const user = userFromToken(options.token);
    if (!user) throw new Error("Zaloguj się ponownie");
    const w = worlds.byId(this.worldId);
    if (!w || !canEdit(w, user.id)) throw new Error("Nie możesz edytować tej gry");
    return user;
  }

  onJoin(client: Client, _o: unknown, user: UserRow) {
    const used = new Set([...this.editors.values()].map((e) => e.color));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[this.editors.size % COLORS.length];
    const ed: Editor = { sid: client.sessionId, userId: user.id, username: user.username, color };
    this.editors.set(client.sessionId, ed);
    client.send("state", { you: client.sessionId, data: this.data, editors: [...this.editors.values()] });
    this.broadcast("joined", ed, { except: client });
  }

  onLeave(client: Client) {
    this.editors.delete(client.sessionId);
    this.broadcast("left", client.sessionId);
    // ostatni wychodzi - zapisujemy od razu
    if (this.editors.size === 0) this.save();
  }

  onDispose() {
    this.save();
  }

  private onOps(client: Client, m: { parts?: unknown; del?: unknown; fields?: unknown }) {
    const out: { from: string; parts?: Part[]; del?: string[]; fields?: Partial<Record<Field, unknown>> } = { from: client.sessionId };
    if (Array.isArray(m?.parts) && m.parts.length) {
      // każdy klocek czyścimy tak samo jak przy zapisie gry (id zostaje)
      // miejsca (places) z tej samej wiadomości albo z gry - inaczej klocek straciłby swoje miejsce
      const f = (m.fields && typeof m.fields === "object" ? m.fields : {}) as Record<string, unknown>;
      const clean = sanitizeWorld({ parts: m.parts.slice(0, MAX_PARTS), places: "places" in f ? f.places : this.data.places }).parts;
      const byId = new Map(this.data.parts.map((p, i) => [p.id, i]));
      for (const p of clean) {
        const i = byId.get(p.id);
        if (i === undefined) this.data.parts.push(p);
        else this.data.parts[i] = p;
      }
      out.parts = clean;
    }
    if (Array.isArray(m?.del) && m.del.length) {
      const del = new Set(m.del.filter((x): x is string => typeof x === "string"));
      this.data.parts = this.data.parts.filter((p) => !del.has(p.id));
      out.del = [...del];
    }
    if (m?.fields && typeof m.fields === "object") {
      const f = m.fields as Record<string, unknown>;
      const keys = STUDIO_FIELDS.filter((k) => k in f);
      if (keys.length) {
        // czyszczenie razem z resztą gry (np. narzędzia sprawdzane względem klocków)
        const merged = { ...this.data } as Record<string, unknown>;
        for (const k of keys) {
          if (f[k] === null) delete merged[k];
          else merged[k] = f[k];
        }
        const clean = sanitizeWorld(merged) as unknown as Record<string, unknown>;
        out.fields = {};
        for (const k of keys) {
          (this.data as unknown as Record<string, unknown>)[k] = clean[k];
          if (clean[k] === undefined) delete (this.data as unknown as Record<string, unknown>)[k];
          out.fields[k] = clean[k] ?? null;
        }
      }
    }
    if (!out.parts && !out.del && !out.fields) return;
    this.dirty = true;
    this.broadcast("ops", out, { except: client });
  }

  /** gra 2D: zmienione kawałki (obrazek, obiekt, poziom, instancja...) - klucz -> wartość albo null */
  private onOps2d(client: Client, m: { set?: unknown }) {
    if (this.data.mode !== "2d" || !m?.set || typeof m.set !== "object" || Array.isArray(m.set)) return;
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m.set as Record<string, unknown>).slice(0, 20000)) {
      if (k.length > 200 || !/^(f:|world$|asset:|obj:|char:|level:|inst:)/.test(k)) continue;
      if (v !== null && (typeof v !== "object" || Array.isArray(v)) && !k.startsWith("f:")) continue;
      set[k] = v;
    }
    const keys = Object.keys(set);
    if (!keys.length) return;
    // czyścimy całą grę tak samo jak przy zapisie, a innym wysyłamy wyczyszczone kawałki
    this.data = sanitizeWorld(applyOps2d(this.data, set));
    const flat = flatten2d(this.data);
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = flat.get(k) ?? null;
    this.dirty = true;
    this.broadcast("ops2d", { from: client.sessionId, set: out }, { except: client });
  }

  private save() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      worlds.setData(this.worldId, this.data);
      // opublikowana gra zmieniona we wspólnej edycji - moderacja sprawdzi ją jeszcze raz
      if (worlds.byId(this.worldId)?.published) queueWorldScan(this.worldId, 30_000);
    } catch (e) {
      console.error("Studio: zapis gry", e);
    }
  }
}
