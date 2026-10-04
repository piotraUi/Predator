import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AVATAR } from "../catalog.ts";
import { emptyWorld } from "../world.ts";
import { VoxelWorld, voxelConfig, breakTime, blockDrop } from "../voxel.ts";
import { CollisionWorld, stepBody } from "../physics.ts";
import { GameSim } from "./gameSim.ts";
import type { WorldData } from "../types.ts";

function world(over: Record<string, unknown> = {}): WorldData {
  const w = emptyWorld();
  w.parts = [];
  w.blocks = voxelConfig({ sx: 64, sz: 64, sy: 48, gen: "flat", mobs: false, ...over });
  w.scripts = [
    { id: "s", name: "S", type: "lua", enabled: true, source: 'onBlockBreak(function(p, x, y, z, b) say("rozbito " .. b) end)' },
  ];
  return w;
}

function run(data: WorldData, saved: { v: string | null } = { v: null }) {
  const sent: { sid: string; type: string; msg: unknown }[] = [];
  const sim = new GameSim(
    data,
    {
      send: (sid, type, msg) => sent.push({ sid, type, msg }),
      broadcast: (type, msg) => sent.push({ sid: "*", type, msg }),
      worldSave: { load: () => saved.v, save: (d) => (saved.v = d) },
    },
    { id: 1, name: "t", ownerName: "x" },
  );
  const join = (sid: string) => sim.join(sid, { userId: 1, username: sid, avatar: DEFAULT_AVATAR, isOwner: false });
  const inv = (sid: string) => ([...sent].reverse().find((m) => m.sid === sid && m.type === "vi")?.msg as { s: ([string, number] | null)[] }).s;
  const advance = (s: number) => {
    for (let i = 0; i < s * 20; i++) sim.tick();
  };
  return { sim, sent, join, inv, advance, saved };
}

test("generator: ten sam świat z ziarna, zmiany wracają z zapisu", () => {
  const a = new VoxelWorld(voxelConfig({ sx: 64, sz: 64, sy: 48, seed: 7 }));
  const b = new VoxelWorld(voxelConfig({ sx: 64, sz: 64, sy: 48, seed: 7 }));
  assert.deepEqual(a.data, b.data);
  a.set(3, 20, 4, 6);
  const c = new VoxelWorld(voxelConfig({ sx: 64, sz: 64, sy: 48, seed: 7, edits: a.encodeEdits() }));
  assert.equal(c.get(3, 20, 4), 6);
  // kamień bez kilofa: długo i nic nie wypada; drewnianym kilofem szybciej i wypada bruk
  assert.ok(breakTime(3, 0) > breakTime(3, 1));
  assert.equal(blockDrop(3, 0), null);
  assert.equal(blockDrop(3, 1), "cobblestone");
});

test("gracz stoi na blokach i nie przelatuje", () => {
  const v = new VoxelWorld(voxelConfig({ sx: 64, sz: 64, sy: 48, gen: "flat" }));
  const cw = new CollisionWorld([]);
  cw.voxels = v;
  const body = { x: 1.5, y: 40, z: 1.5, vx: 0, vy: 0, vz: 0, onGround: false };
  for (let i = 0; i < 240; i++) stepBody(cw, body, 1 / 60, 196.2);
  assert.ok(body.onGround);
  assert.ok(Math.abs(body.y - 7 * v.S) < 0.05, `stoi na trawie: ${body.y}`);
  // ściana z bloków zatrzymuje
  const bx = v.bx(body.x), bz = v.bz(body.z);
  for (let y = 7; y < 10; y++) v.set(bx + 2, y, bz, 3);
  body.vx = 16;
  for (let i = 0; i < 120; i++) stepBody(cw, { ...body }, 1 / 60, 196.2), (body.vx = 16), stepBody(cw, body, 1 / 60, 196.2);
  assert.ok(body.x < v.x0 + (bx + 2) * v.S, "ściana zatrzymała");
});

test("kopanie, stawianie, crafting, Lua i zapis świata", () => {
  const t = run(world());
  t.join("a");
  const p = t.sim.players.get("a")!;
  const w = t.sim.vox!.world;
  assert.ok(Math.abs(p.y - 7 * w.S) < 0.2, "start na trawie");
  const bx = w.bx(p.x), bz = w.bz(p.z);
  // kopie trawę obok siebie - dostaje ziemię
  t.sim.handle("a", "vb", { x: bx + 1, y: 6, z: bz });
  t.advance(0.1);
  assert.equal(w.get(bx + 1, 6, bz), 0);
  assert.deepEqual(t.inv("a")[0], ["dirt", 1]);
  assert.ok(t.sent.some((m) => m.type === "chat" && String((m.msg as { text: string }).text).includes("rozbito grass")));
  // za szybkie kopanie (kamień bez kilofa) jest odrzucone
  t.sim.handle("a", "vb", { x: bx + 1, y: 5, z: bz });
  assert.equal(w.get(bx + 1, 5, bz), 2, "ziemia pod spodem - za szybko");
  // stawia ziemię z powrotem
  t.sim.handle("a", "vp", { x: bx + 1, y: 6, z: bz });
  assert.equal(w.get(bx + 1, 6, bz), 2);
  assert.equal(t.inv("a")[0], null);
  // nie można postawić bloku w sobie ani w powietrzu bez sąsiada
  t.sim.vox!.addItem("a", "dirt", 5);
  t.sim.handle("a", "vp", { x: bx, y: 7, z: bz });
  assert.equal(w.get(bx, 7, bz), 0);
  t.sim.handle("a", "vp", { x: bx + 3, y: 12, z: bz });
  assert.equal(w.get(bx + 3, 12, bz), 0);
  // crafting: pień -> deski -> patyki; kilof tylko przy stole
  t.sim.vox!.addItem("a", "log", 3);
  t.sim.handle("a", "vc", { id: "planks", n: 3 });
  assert.equal(t.sim.vox!.count("a", "planks"), 12);
  t.sim.handle("a", "vc", { id: "stick" });
  assert.equal(t.sim.vox!.count("a", "stick"), 4);
  t.sim.handle("a", "vc", { id: "wood_pickaxe" });
  assert.equal(t.sim.vox!.count("a", "wood_pickaxe"), 0, "bez stołu");
  t.sim.vox!.setBlock(bx - 3, 7, bz, 19);
  t.sim.handle("a", "vc", { id: "wood_pickaxe" });
  assert.equal(t.sim.vox!.count("a", "wood_pickaxe"), 1);
  // TNT wybucha i robi dziurę
  t.sim.vox!.setBlock(bx + 4, 7, bz, 28);
  t.advance(1);
  (p as unknown as { protectedUntil: number }).protectedUntil = 0;
  t.sim.handle("a", "vb", { x: bx + 4, y: 7, z: bz });
  t.advance(3);
  assert.equal(w.get(bx + 4, 6, bz), 0, "dziura po wybuchu");
  assert.ok(p.hp < 100, "wybuch rani gracza obok");
  // zapis: nowy serwer ma te same zmiany
  t.sim.dispose();
  assert.ok(t.saved.v);
  const t2 = run(world(), t.saved);
  assert.equal(t2.sim.vox!.world.get(bx - 3, 7, bz), 19);
  assert.equal(t2.sim.vox!.world.get(bx + 4, 6, bz), 0);
});

test("w nocy pojawiają się potwory, w dzień zwierzęta", () => {
  const t = run(world({ mobs: true, day: 600 }));
  t.join("a");
  t.advance(20);
  const mobs = () => ([...t.sent].reverse().find((m) => m.type === "vm")?.msg as [number, string][] | undefined) ?? [];
  assert.ok(mobs().length > 0 && mobs().every((m) => ["pig", "sheep", "cow"].includes(m[1])), "dzień: zwierzęta");
  t.sim.vox!.time = 0.75;
  t.advance(20);
  assert.ok(mobs().some((m) => m[1] === "zombie" || m[1] === "creeper"), "noc: potwory");
});
