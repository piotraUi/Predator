// Apex: ocena akustyki pomieszczenia z promieni (czysta funkcja, bez Web Audio).
import type { V3 } from "./math.ts";

export interface RoomInfo {
  /** ile pogłosu dodać (0 = otwarta przestrzeń, 1 = ciasne zamknięte pomieszczenie) */
  wet: number;
  /** czas wybrzmiewania w sekundach */
  decay: number;
}

/** kierunki, w które sprawdzamy otoczenie słuchacza: 8 poziomych, góra i dwa skośne w górę */
export const ROOM_RAYS: V3[] = (() => {
  const out: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push([Math.cos(a), 0, Math.sin(a)]);
  }
  out.push([0, 1, 0], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]);
  return out;
})();

/** ocena pomieszczenia: `cast(dir)` zwraca odległość do przeszkody (albo null, gdy nic nie ma w zasięgu `max`) */
export function estimateRoom(cast: (dir: V3) => number | null, max = 60): RoomInfo {
  let hit = 0, sum = 0;
  for (const d of ROOM_RAYS) {
    const t = cast(d);
    if (t !== null && t < max) {
      hit++;
      sum += t;
    } else sum += max;
  }
  const n = ROOM_RAYS.length;
  const enclosed = hit / n;
  const avg = sum / n;
  // zamknięte i duże = długi pogłos; zamknięte i małe = krótki, ale wyraźny; otwarte = prawie nic
  const wet = Math.min(1, Math.max(0, (enclosed - 0.35) / 0.55)) * (avg < 6 ? 0.7 : 1);
  const decay = Math.min(3.2, Math.max(0.25, avg * 0.09));
  return { wet, decay };
}

