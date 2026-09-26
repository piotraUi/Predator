// Gry, które mają swojego twórcę: gdy jego konto istnieje (albo zostanie założone),
// gra przechodzi na to konto - może ją edytować w Studio i dostaje monety za wizyty.
import { users, worlds, type UserRow } from "./db.ts";

/** nazwa gry -> nick twórcy */
export const GAME_CREATORS: Record<string, string> = {
  "Ludzik 4": "Fadnmade",
  "Ludzik 3 & Nero": "Fadnmade",
};

/** Konto, na którym serwer tworzy przykładowe gry */
export const DEMO_OWNER = "Predator";

/** Przekazuje twórcy jego gry, które wciąż są na koncie przykładowych gier */
export function giveGamesToCreator(user: UserRow) {
  const demo = users.byName(DEMO_OWNER);
  if (!demo || demo.id === user.id) return;
  for (const [game, creator] of Object.entries(GAME_CREATORS)) {
    if (creator !== user.username) continue;
    const w = worlds.byOwner(demo.id).find((x) => x.name === game);
    if (!w) continue;
    worlds.setOwner(w.id, user.id);
    console.log(`Gra '${game}' przekazana twórcy ${user.username}`);
  }
}
