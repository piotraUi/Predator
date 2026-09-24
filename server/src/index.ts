import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import compression from "compression";
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
import { parseGameFile } from "../../shared/gamefile.ts";
import { hashPassword } from "./auth.ts";
import { config } from "./config.ts";
import { users, worlds } from "./db.ts";
import { WorldRoom } from "./rooms/WorldRoom.ts";

const app = express();
// kompresja - gra pobiera się kilka razy szybciej (ważne na telefonach)
app.use(compression());
// aplikacje na telefon / exe łączą się z innego adresu, więc pozwalamy na CORS
app.use(cors());
app.use("/api", api);
app.get("/health", (_req, res) => res.json({ ok: true, name: "Predator" }));

// gra w przeglądarce - serwujemy zbudowanego klienta
if (fs.existsSync(config.clientDist)) {
  // pliki z hashem w nazwie (assets/) mogą leżeć w pamięci przeglądarki na zawsze,
  // a index.html zawsze sprawdzamy na nowo - inaczej po aktualizacji telefon ładuje starą wersję
  app.use(
    "/assets",
    express.static(path.join(config.clientDist, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }),
  );
  app.use(
    express.static(config.clientDist, {
      setHeaders: (res, file) => {
        if (file.endsWith(".html") || file.endsWith(".webmanifest")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.get(/^(?!\/api|\/matchmake|\/assets).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(config.clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) =>
    res.send("Serwer Predator działa. Zbuduj klienta (npm run build), żeby grać pod tym adresem."),
  );
}

const server = http.createServer(app);
const gameServer = new Server({ greet: false, transport: new WebSocketTransport({ server }) });
gameServer.define("world", WorldRoom).filterBy(["worldId"]);

// przykładowe gry - tworzone, jeśli ich jeszcze nie ma
/** gra z pliku .pgame w folderze games/ (np. przeniesiona z GDevelopa) */
const fromFile = (file: string) => () => parseGameFile(fs.readFileSync(path.join(config.gamesDir, file), "utf8")).data;
const demos: [string, string, () => WorldData, string][] = [
  ["Tor przeszkód", "Przykładowy tor przeszkód. Uważaj na lawę!", demoObby, "obby"],
  ["Arena", "Walka na miecze i pistolety! Zbieraj bronie z złotych pól.", demoArena, "arena"],
  ["Predator City", "Miasto do spotkań: prace, kawiarnia, park, klub disco i domy. Zarabiaj, tańcz i poznawaj ludzi!", demoCity, "city"],
];
if (fs.existsSync(path.join(config.gamesDir, "Ludzik 4.pgame")))
  demos.push([
    "Ludzik 4",
    "Platformówka 2D: zbieraj monety, uważaj na ogień i potwora, wspinaj się po drabinach i graj z psem. Mapa multiplayer dla drużyny!",
    fromFile("Ludzik 4.pgame"),
    "ludzik",
  ]);
let owner = users.byName("Predator");
if (!owner) {
  const { hash, salt } = hashPassword(crypto.randomUUID());
  owner = users.create("Predator", hash, salt);
}
const existing = new Set(worlds.byOwner(owner.id).map((w) => w.name));
for (const [name, description, make, thumb] of demos) {
  let id = worlds.byOwner(owner.id).find((w) => w.name === name)?.id;
  if (!existing.has(name)) {
    const data = make();
    id = worlds.create(owner.id, name, data, 30).id;
    worlds.update(id, { name, description, maxPlayers: 30, published: true, data });
    console.log(`Utworzono przykładową grę '${name}'`);
  }
  // gotowa miniaturka do menu (dopóki twórca nie zapisze własnej ze Studia)
  const file = path.join(config.assetsDir, "thumbs", thumb + ".jpg");
  if (id && !worlds.thumbnail(id) && fs.existsSync(file))
    worlds.setThumbnail(id, "data:image/jpeg;base64," + fs.readFileSync(file).toString("base64"));
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
