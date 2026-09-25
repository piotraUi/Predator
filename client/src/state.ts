import type { PublicUser } from "../../shared/types.ts";

type Listener = (u: PublicUser) => void;
const listeners = new Set<Listener>();

export const session = {
  user: null as PublicUser | null,
  set(u: PublicUser) {
    session.user = u;
    listeners.forEach((l) => l(u));
  },
  /** wylogowanie z widoku (np. serwer przestał odpowiadać) - token zostaje, żeby potem wejść samemu */
  clear() {
    session.user = null;
  },
  onChange(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
