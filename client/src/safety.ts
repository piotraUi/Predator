// Zablokowani gracze i ustawienia prywatności zalogowanego gracza (z /me, aktualizowane po zmianach).
import { DEFAULT_PRIVACY, type Privacy } from "../../shared/types.ts";

export interface BlockedUser {
  id: number;
  username: string;
}

const listeners = new Set<() => void>();

export const safety = {
  blocked: [] as BlockedUser[],
  privacy: { ...DEFAULT_PRIVACY } as Privacy,
  set(v: { blocked?: BlockedUser[]; privacy?: Privacy }) {
    if (v.blocked) safety.blocked = v.blocked;
    if (v.privacy) safety.privacy = v.privacy;
    listeners.forEach((l) => l());
  },
  isBlocked: (id: number) => safety.blocked.some((b) => b.id === id),
  /** wiadomości na czacie gry mają tylko nick */
  isBlockedName: (name: string) => safety.blocked.some((b) => b.username.toLowerCase() === name.toLowerCase()),
  onChange(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
