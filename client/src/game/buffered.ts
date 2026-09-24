// Połączenie z buforem wiadomości (bez importu logiki gry - lekki plik).
import type { GameConnection } from "./connection.ts";

/**
 * Pośrednik, który zbiera wiadomości, zanim ekran gry zarejestruje swoje funkcje
 * (ekran 2D / 3D wczytuje się dopiero po dołączeniu - nic nie może zginąć po drodze).
 */
export class BufferedConnection implements GameConnection {
  private handlers = new Map<string, ((msg: never) => void)[]>();
  private queue = new Map<string, unknown[]>();

  constructor(readonly inner: GameConnection) {
    const onAny = (type: string, msg: unknown) => this.dispatch(type, msg);
    if ("onAny" in inner) (inner as unknown as { onAny(cb: typeof onAny): void }).onAny(onAny);
    else (inner as unknown as { onMessage(t: string, cb: (type: string, msg: unknown) => void): void }).onMessage("*", onAny);
  }

  private dispatch(type: string, msg: unknown) {
    const list = this.handlers.get(type);
    if (list) for (const h of list) h(msg as never);
    else {
      const q = this.queue.get(type) ?? [];
      if (q.length < 300) q.push(msg);
      this.queue.set(type, q);
    }
  }

  onMessage(type: string, cb: (msg: never) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(cb);
    this.handlers.set(type, list);
    const q = this.queue.get(type);
    if (q) {
      this.queue.delete(type);
      for (const m of q) cb(m as never);
    }
  }

  send(type: string, msg?: unknown) {
    this.inner.send(type, msg);
  }
  onLeave(cb: (code: number) => void) {
    this.inner.onLeave(cb);
  }
  onError(cb: (code: number, message?: string) => void) {
    this.inner.onError(cb);
  }
  leave() {
    this.inner.leave();
  }
}
