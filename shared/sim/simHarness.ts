// Symulacja gry 3D do testów: własny zegar, zapisane wiadomości, dotykanie klocków i punkty.
import { DEFAULT_AVATAR } from "../catalog.ts";
import type { WorldData } from "../types.ts";
import { GameSim } from "./gameSim.ts";

/** symulacja z własnym zegarem (skrypty liczą czas z Date.now) */
export function run(data: WorldData) {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const said: string[] = [];
  const badges: string[] = [];
  const errors: string[] = [];
  const kicked: string[] = [];
  const sim = new GameSim(
    data,
    {
      send: (sid, type, msg) => {
        sent.push({ sid, type, msg });
        const m = msg as { text?: string; error?: boolean };
        if (type === "log" && m.error) errors.push(String(m.text));
        if (type === "chat" && m.text) said.push(m.text);
      },
      broadcast: (type, msg) => {
        sent.push({ sid: "*", type, msg });
        const m = msg as { text?: string };
        if (type === "chat" && m.text) said.push(m.text);
      },
      badge: (sid, name) => badges.push(`${sid}:${name}`),
      kick: (sid) => kicked.push(sid),
    },
    { id: 1, name: "test", ownerName: "Twórca" },
  );
  const join = (sid: string, owner = false) =>
    sim.join(sid, { userId: sid.length, username: "Gracz_" + sid, avatar: DEFAULT_AVATAR, isOwner: owner });
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds * 20; t++) {
      clock += 50;
      sim.tick();
    }
  };
  const part = (name: string) => data.parts.find((p) => p.name === name)!;
  /** gracz podchodzi do klocka i go dotyka */
  const touch = (sid: string, name: string) => {
    const p = part(name);
    sim.handle(sid, "m", { x: p.x, y: p.y + 2, z: p.z, ry: 0, a: "idle" });
    sim.handle(sid, "touch", p.id);
  };
  const score = (sid: string) => {
    const s = [...sent].reverse().find((m) => m.type === "scores");
    return (s?.msg as { name: string; score: number }[] | undefined)?.find((e) => e.name === "Gracz_" + sid)?.score ?? 0;
  };
  const done = () => {
    sim.dispose();
    Date.now = realNow;
  };
  return { sim, join, advance, touch, part, score, said, badges, errors, kicked, sent, done };
}
