// Połączenie z grą: prawdziwy serwer (Colyseus) albo lokalny pokój w przeglądarce (testy offline).
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { GameSim } from "../../../shared/sim/gameSim.ts";
import { Sim2D } from "../../../shared/sim/sim2d.ts";
import { browserStorage } from "../../../shared/sim/playerData.ts";
import { placeData } from "../../../shared/places.ts";
import type { Avatar, WorldData } from "../../../shared/types.ts";

export interface GameConnection {
  onMessage(type: string, cb: (msg: never) => void): void;
  send(type: string, msg?: unknown): void;
  onLeave(cb: (code: number) => void): void;
  onError(cb: (code: number, message?: string) => void): void;
  leave(): void;
}

/**
 * Gra uruchomiona w całości w przeglądarce - ta sama logika co na serwerze (GameSim),
 * więc skrypty Lua, narzędzia i zdrowie działają tak samo. Tylko jeden gracz i bez monet.
 */
export class LocalRoom implements GameConnection {
  private handlers = new Map<string, (msg: never) => void>();
  private any: ((type: string, msg: unknown) => void) | null = null;
  private queue = new Map<string, unknown[]>();
  private sim: GameSim | Sim2D;
  private timer: number;
  private readonly sid = "local";

  constructor(data: WorldData, name: string, user: { username: string; avatar?: Avatar }, placeId?: string) {
    // kopia, żeby skrypty w teście nie zmieniały edytowanego świata; gra z miejscami - tylko jedno miejsce
    const copy = placeData(structuredClone(data), placeId);
    const Sim = copy.mode === "2d" ? Sim2D : GameSim;
    this.sim = new Sim(
      copy,
      {
        send: (_sid, type, msg) => this.deliver(type, msg),
        broadcast: (type, msg, except) => except !== this.sid && this.deliver(type, msg),
        // test w Studio: odznaka tylko się pokazuje, nic nie jest zapisywane
        badge: (_sid, name) => this.testBadge(copy, name),
        // zapisy saveData w teście - w przeglądarce (osobno dla każdej gry)
        storage: browserStorage(name),
      },
      { id: 0, name, ownerName: user.username },
    );
    this.timer = window.setInterval(() => this.sim.tick(), 50);
    queueMicrotask(() =>
      this.sim.join(this.sid, { userId: 1, username: user.username, avatar: user.avatar ?? DEFAULT_AVATAR, isOwner: true }),
    );
    for (const b of copy.badges ?? []) if (b.trigger === "join") setTimeout(() => this.testBadge(copy, b.id), 2500);
  }

  private shownBadges = new Set<string>();
  private testBadge(data: WorldData, name: string) {
    const b = data.badges?.find((x) => x.name === name || x.id === name);
    if (!b || this.shownBadges.has(b.id)) return;
    this.shownBadges.add(b.id);
    this.deliver("badge", { name: b.name, icon: b.icon, description: b.description, reward: b.reward, test: true });
  }

  private deliver(type: string, msg: unknown) {
    // kopia jak przy wysyłce przez sieć - gra nie może zmieniać obiektów symulacji
    const m = msg === undefined ? undefined : structuredClone(msg);
    queueMicrotask(() => {
      if (this.any) return this.any(type, m);
      const h = this.handlers.get(type);
      if (h) h(m as never);
      else {
        const q = this.queue.get(type) ?? [];
        q.push(m);
        this.queue.set(type, q);
      }
    });
  }

  onMessage(type: string, cb: (msg: never) => void) {
    this.handlers.set(type, cb);
    const q = this.queue.get(type);
    if (q) {
      this.queue.delete(type);
      for (const m of q) cb(m as never);
    }
  }

  /** wszystkie wiadomości do jednej funkcji (używa tego BufferedConnection) */
  onAny(cb: (type: string, msg: unknown) => void) {
    this.any = cb;
    for (const [type, list] of this.queue) for (const m of list) cb(type, m);
    this.queue.clear();
  }

  send(type: string, msg?: unknown) {
    const m = msg === undefined ? undefined : structuredClone(msg);
    // test w Studio: zakup za darmo, żeby sprawdzić skrypt onPurchase
    if (type === "buy") {
      const id = String((m as { id?: unknown })?.id ?? "");
      this.deliver("bought", { id, test: true });
      queueMicrotask(() => this.sim.purchased(this.sid, id));
      return;
    }
    queueMicrotask(() => this.sim.handle(this.sid, type, m));
  }

  onLeave() {}
  onError() {}

  leave() {
    clearInterval(this.timer);
    this.sim.leave(this.sid);
    this.sim.dispose();
  }
}
