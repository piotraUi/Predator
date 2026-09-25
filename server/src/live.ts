// Powiadomienia "na żywo": znajomy wszedł do Predatora, znajomy gra w…, zaproszenie do gry.
// Trzymane w pamięci (krótko) - aplikacja odbiera je co kilka sekund (GET /live).
import { friends, users } from "./db.ts";
import { presenceHooks } from "./presence.ts";

export type LiveEvent =
  | { kind: "online"; fromId: number; from: string; at: number }
  | { kind: "playing"; fromId: number; from: string; worldId: number; worldName: string; roomId: string; at: number }
  | { kind: "invite"; fromId: number; from: string; worldId: number; worldName: string; roomId: string; privateCode?: string; at: number };

type NewEvent = LiveEvent extends infer E ? (E extends LiveEvent ? Omit<E, "at"> : never) : never;

const queues = new Map<number, LiveEvent[]>();
const MAX_QUEUE = 20;
const KEEP_MS = 5 * 60_000;
/** żeby nie zasypać znajomych: to samo zdarzenie od tej samej osoby najwyżej raz na jakiś czas */
const lastSent = new Map<string, number>();
const COOLDOWN: Record<LiveEvent["kind"], number> = { online: 10 * 60_000, playing: 2 * 60_000, invite: 10_000 };

export const live = {
  push(userId: number, ev: NewEvent) {
    const key = `${userId}:${ev.kind}:${ev.fromId}:${"worldId" in ev ? ev.worldId : ""}`;
    const now = Date.now();
    if (now - (lastSent.get(key) ?? 0) < COOLDOWN[ev.kind]) return false;
    lastSent.set(key, now);
    const q = (queues.get(userId) ?? []).filter((e) => now - e.at < KEEP_MS);
    // "gra w X" zastępuje "jest online" od tej samej osoby
    // zaproszenie od tej osoby zastępuje "gra w X"
    const kept =
      ev.kind === "playing"
        ? q.filter((e) => !(e.fromId === ev.fromId && e.kind !== "invite"))
        : ev.kind === "invite"
          ? q.filter((e) => !(e.fromId === ev.fromId && e.kind !== "online" && e.kind !== "invite"))
          : q;
    kept.push({ ...ev, at: now } as LiveEvent);
    queues.set(userId, kept.slice(-MAX_QUEUE));
    return true;
  },
  /** odbiór - zdarzenia znikają z kolejki */
  drain(userId: number): LiveEvent[] {
    const q = queues.get(userId) ?? [];
    queues.delete(userId);
    const now = Date.now();
    return q.filter((e) => now - e.at < KEEP_MS);
  },
  /** wysyła zdarzenie do wszystkich znajomych gracza */
  toFriends(userId: number, ev: NewEvent) {
    for (const f of friends.list(userId)) if (f.status === "accepted") live.push(f.other_id, ev);
  },
  /** ktoś wszedł do Predatora (był offline) */
  cameOnline(userId: number) {
    const u = users.byId(userId);
    if (u) live.toFriends(userId, { kind: "online", fromId: userId, from: u.username });
  },
  /** ktoś zaczął grać (publiczny serwer - prywatnych nie ogłaszamy) */
  startedPlaying(userId: number, p: { worldId: number; worldName: string; roomId: string }) {
    const u = users.byId(userId);
    if (u) live.toFriends(userId, { kind: "playing", fromId: userId, from: u.username, ...p });
  },
};

// sprzątanie starych wpisów ochrony przed spamem
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of lastSent) if (now - t > 15 * 60_000) lastSent.delete(k);
}, 5 * 60_000).unref();

presenceHooks.online = (id) => live.cameOnline(id);
presenceHooks.playing = (id, p) => live.startedPlaying(id, { worldId: p.worldId, worldName: p.worldName, roomId: p.roomId });
