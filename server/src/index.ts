import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { WorldData } from "../../shared/types.ts";
import { demoArena, demoObby } from "../../shared/world.ts";
import { demoCity } from "../../shared/demos/city.ts";
import { api } from "./api.ts";
import { hashPassword } from "./auth.ts";
import { config } from "./config.ts";
import { users, worlds } from "./db.ts";
import { WorldRoom } from "./rooms/WorldRoom.ts";

const app = express();
// aplikacje na telefon / exe łączą się z innego adresu, więc pozwalamy na CORS
app.use(cors());
app.use("/api", api);
app.get("/health", (_req, res) => res.json({ ok: true, name: "Predator" }));

// gra w przeglądarce - serwujemy zbudowanego klienta
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  app.get(/^(?!\/api|\/matchmake).*/, (_req, res) => res.sendFile(path.join(config.clientDist, "index.html")));
} else {
  app.get("/", (_req, res) =>
    res.send("Serwer Predator działa. Zbuduj klienta (npm run build), żeby grać pod tym adresem."),
  );
}

const server = http.createServer(app);
const gameServer = new Server({ greet: false, transport: new WebSocketTransport({ server }) });
gameServer.define("world", WorldRoom).filterBy(["worldId"]);

// przykładowe gry - tworzone, jeśli ich jeszcze nie ma
const demos: [string, string, () => WorldData][] = [
  ["Tor przeszkód", "Przykładowy tor przeszkód. Uważaj na lawę!", demoObby],
  ["Arena", "Walka na miecze i pistolety! Zbieraj bronie z złotych pól.", demoArena],
  ["Predator City", "Miasto do spotkań: prace, kawiarnia, park, klub disco i domy. Zarabiaj, tańcz i poznawaj ludzi!", demoCity],
];
let owner = users.byName("Predator");
if (!owner) {
  const { hash, salt } = hashPassword(crypto.randomUUID());
  owner = users.create("Predator", hash, salt);
}
const existing = new Set(worlds.byOwner(owner.id).map((w) => w.name));
for (const [name, description, make] of demos) {
  if (existing.has(name)) continue;
  const data = make();
  const w = worlds.create(owner.id, name, data, 30);
  worlds.update(w.id, { name, description, maxPlayers: 30, published: true, data });
  console.log(`Utworzono przykładową grę '${name}'`);
}

await gameServer.listen(config.port, config.host);

const addrs = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);
console.log(`\n  🎮 Serwer Predator działa!`);
console.log(`     Na tym komputerze:  http://localhost:${config.port}`);
for (const a of addrs) console.log(`     W sieci lokalnej:   http://${a}:${config.port}`);
console.log(`     Dane zapisywane w:  ${config.dataDir}\n`);
