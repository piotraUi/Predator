// Pokój gry na serwerze - cienka nakładka na wspólną logikę GameSim (shared/sim).
// Tu zostaje tylko to, co wymaga serwera: logowanie, monety, wizyty i status znajomych.
import { Room, type Client } from "colyseus";
import { GameSim } from "../../../shared/sim/gameSim.ts";
import { sanitizeWorld } from "../../../shared/world.ts";
import { userFromToken } from "../auth.ts";
import { config } from "../config.ts";
import { toPublicUser, users, worlds, type UserRow, type WorldRow } from "../db.ts";
import { presence } from "../presence.ts";

const TICK_MS = 50; // 20 razy na sekundę
const MESSAGES = ["m", "chat", "touch", "equip", "use", "anim", "died", "respawned"];

export class WorldRoom extends Room {
  private world!: WorldRow;
  private sim!: GameSim;
  private joinedAt = new Map<string, { userId: number; at: number }>();

  onCreate(options: { worldId?: number }) {
    const world = worlds.byId(Number(options.worldId));
    if (!world) throw new Error("Nie ma takiej gry");
    this.world = world;
    this.maxClients = world.max_players;
    this.autoDispose = true;
    this.setMetadata({ worldId: world.id, name: world.name });

    this.sim = new GameSim(
      // sanitizeWorld uzupełnia też brakujące pola w starszych zapisach
      sanitizeWorld(JSON.parse(world.data)),
      {
        send: (sid, type, msg) => this.clients.find((c) => c.sessionId === sid)?.send(type, msg),
        broadcast: (type, msg, exceptSid) => {
          const except = exceptSid ? this.clients.find((c) => c.sessionId === exceptSid) : undefined;
          this.broadcast(type, msg, except ? { except } : undefined);
        },
      },
      { id: world.id, name: world.name, ownerName: users.byId(world.owner_id)?.username ?? "?" },
    );
    for (const type of MESSAGES) this.onMessage(type, (client, msg) => this.sim.handle(client.sessionId, type, msg));

    this.clock.setInterval(() => this.sim.tick(), TICK_MS);
    this.clock.setInterval(() => this.payCoins(), 60_000);
  }

  onAuth(_client: Client, options: { token?: string }) {
    const user = userFromToken(options.token);
    if (!user) throw new Error("Zaloguj się ponownie");
    if (!this.world.published && user.id !== this.world.owner_id) throw new Error("Ta gra nie jest opublikowana");
    return user;
  }

  onJoin(client: Client, _options: unknown, user: UserRow) {
    worlds.addVisit(this.world.id);
    if (user.id !== this.world.owner_id) users.addCoins(this.world.owner_id, config.creatorCoinsPerVisit);
    presence.setPlaying(user.id, { worldId: this.world.id, worldName: this.world.name, roomId: this.roomId });
    presence.setWorldCount(this.world.id, 1);
    this.joinedAt.set(client.sessionId, { userId: user.id, at: Date.now() });
    this.sim.join(client.sessionId, {
      userId: user.id,
      username: user.username,
      avatar: toPublicUser(user).avatar,
      isOwner: user.id === this.world.owner_id,
    });
  }

  onLeave(client: Client) {
    const j = this.joinedAt.get(client.sessionId);
    if (!j) return;
    this.joinedAt.delete(client.sessionId);
    this.sim.leave(client.sessionId);
    presence.setPlaying(j.userId, null);
    presence.setWorldCount(this.world.id, -1);
  }

  onDispose() {
    this.sim.dispose();
  }

  private payCoins() {
    for (const client of this.clients) {
      const j = this.joinedAt.get(client.sessionId);
      if (!j || Date.now() - j.at < 55_000) continue;
      const earned = users.earn(j.userId, config.coinsPerMinute, config.dailyEarnCap);
      if (earned > 0) client.send("coins", { earned, coins: users.byId(j.userId)?.coins ?? 0 });
    }
  }
}
