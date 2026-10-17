// Prawdziwe narzędzia asystenta (te same, których używa Studio) uruchomione bez przeglądarki: do sprawdzania skryptów i generowania
// wiarygodnych odpowiedzi narzędzi (write_script z kontrolą składni, run_test w symulacji gry).
import type { Part, WorldData } from "../../shared/types.ts";
import { emptyWorld, sanitizeWorld } from "../../shared/world.ts";
import { MAIN_PLACE } from "../../shared/places.ts";
import { tools3d } from "../../client/src/studio/aiTools3d.ts";

export function studio3d(data: WorldData, focus: [number, number, number] = [0, 0, 0]) {
  let place = MAIN_PLACE;
  const shown: Part[] = [];
  const t = tools3d(
    {
      data,
      place: () => place,
      switchPlace: (id) => (place = id),
      focusPoint: () => ({ x: focus[0], y: focus[1], z: focus[2] }),
      selection: () => [],
      showParts: (p) => shown.push(...p),
      lookAt: () => {},
      added: () => {},
      updated: () => {},
      removed: () => {},
      refresh: () => {},
      changed: () => {},
    },
    { images: [] },
  );
  return t;
}

export const newWorld = () => sanitizeWorld(emptyWorld());
