// Kto jest online i w co gra (trzymane w pamięci serwera).

interface Presence {
  lastSeen: number;
  playing: { worldId: number; worldName: string; roomId: string; private?: boolean } | null;
}

const map = new Map<number, Presence>();
const ONLINE_MS = 60_000;

/** Ile osób gra w danym świecie */
const worldCounts = new Map<number, number>();
/** Ile osób gra na prywatnym serwerze (po kodzie) */
const privateCounts = new Map<string, number>();

export const presence = {
  touch(userId: number) {
    const p = map.get(userId) ?? { lastSeen: 0, playing: null };
    p.lastSeen = Date.now();
    map.set(userId, p);
  },
  setPlaying(userId: number, playing: Presence["playing"]) {
    const p = map.get(userId) ?? { lastSeen: Date.now(), playing: null };
    p.playing = playing;
    p.lastSeen = Date.now();
    map.set(userId, p);
  },
  get(userId: number) {
    const p = map.get(userId);
    const online = !!p && (p.playing !== null || Date.now() - p.lastSeen < ONLINE_MS);
    return { online, playing: online ? (p?.playing ?? null) : null };
  },
  setWorldCount(worldId: number, delta: number) {
    const n = (worldCounts.get(worldId) ?? 0) + delta;
    if (n <= 0) worldCounts.delete(worldId);
    else worldCounts.set(worldId, n);
  },
  worldCount: (worldId: number) => worldCounts.get(worldId) ?? 0,
  setPrivateCount(code: string, delta: number) {
    const n = (privateCounts.get(code) ?? 0) + delta;
    if (n <= 0) privateCounts.delete(code);
    else privateCounts.set(code, n);
  },
  privateCount: (code: string) => privateCounts.get(code) ?? 0,
  /** ile osób jest teraz online i ile gra */
  stats() {
    let online = 0, playing = 0;
    for (const id of map.keys()) {
      const p = presence.get(id);
      if (p.online) online++;
      if (p.playing) playing++;
    }
    return { online, playing };
  },
};
