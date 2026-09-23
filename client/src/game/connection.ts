// Połączenie z grą: prawdziwy serwer (Colyseus) albo lokalny pokój w przeglądarce (testy offline).
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { GameSim } from "../../../shared/sim/gameSim.ts";
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
  private queue = new Map<string, unknown[]>();
  private sim: GameSim;
  private timer: number;
  private readonly sid = "local";

  constructor(data: WorldData, name: string, user: { username: string; avatar?: Avatar }) {
    // kopia, żeby skrypty w teście nie zmieniały edytowanego świata
    const copy = structuredClone(data);
    this.sim = new GameSim(
      copy,
      {
        send: (_sid, type, msg) => this.deliver(type, msg),
        broadcast: (type, msg, except) => except !== this.sid && this.deliver(type, msg),
      },
      { id: 0, name, ownerName: user.username },
    );
    this.timer = window.setInterval(() => this.sim.tick(), 50);
    queueMicrotask(() =>
      this.sim.join(this.sid, { userId: 0, username: user.username, avatar: user.avatar ?? DEFAULT_AVATAR, isOwner: true }),
    );
  }

  private deliver(type: string, msg: unknown) {
    // kopia jak przy wysyłce przez sieć - gra nie może zmieniać obiektów symulacji
    const m = msg === undefined ? undefined : structuredClone(msg);
    queueMicrotask(() => {
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

  send(type: string, msg?: unknown) {
    const m = msg === undefined ? undefined : structuredClone(msg);
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
