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
import { demoArena, demoObby, welcomeBadge } from "../../shared/world.ts";
import { demoCity } from "../../shared/demos/city.ts";
import { MINIGAMES } from "../../shared/demos/minigames.ts";
import { api } from "./api.ts";
import { admin } from "./admin.ts";
import { social } from "./socialApi.ts";
import { parseGameFile } from "../../shared/gamefile.ts";
import { config } from "./config.ts";
import { users, worlds } from "./db.ts";
import { WorldRoom } from "./rooms/WorldRoom.ts";
import { GAME_CREATORS, giveGamesToCreator } from "./creators.ts";
import { setupPredatorAccount } from "./predatorAccount.ts";

const app = express();
// kompresja - gra pobiera się kilka razy szybciej (ważne na telefonach)
app.use(compression());
// aplikacje na telefon / exe łączą się z innego adresu, więc pozwalamy na CORS
app.use(cors());
app.use("/api/admin", admin);
app.use("/api", api);
app.use("/api", social);
app.get("/health", (_req, res) => res.json({ ok: true, name: "Predator" }));
// muzyka i dźwięki przykładowych gier (za duże, żeby trzymać je w danych gry)
app.use("/game-assets", express.static(path.join(config.assetsDir, "games"), { maxAge: "7d", fallthrough: false }));

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
// prywatne serwery - osobna nazwa, żeby zwykłe "Graj" nigdy do nich nie trafiło
gameServer.define("private", WorldRoom).filterBy(["worldId", "privateCode"]);

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
for (const m of MINIGAMES) demos.push([m.name, m.description, m.make, m.thumb]);
// gry przeniesione z paczki GamesToadd (npm run port-games)
for (const [file, thumb] of [["Tacos World", "tacos"], ["Tunnel Escape", "tunnel"], ["Spelling Bee", "spelling"]]) {
  const f = path.join(config.gamesDir, file + ".pgame");
  if (fs.existsSync(f)) demos.push([file, parseGameFile(fs.readFileSync(f, "utf8")).description, fromFile(file + ".pgame"), thumb]);
}
// konto Predator: zawsze jest, ma swój wygląd, wszystkie przedmioty i jest adminem
const owner = setupPredatorAccount();
for (const [name, description, make, thumb] of demos) {
  // gra z przypisanym twórcą może już być na jego koncie
  const creator = GAME_CREATORS[name] ? users.byName(GAME_CREATORS[name]) : undefined;
  let id = worlds.byOwner(owner.id).find((w) => w.name === name)?.id ?? (creator && worlds.byOwner(creator.id).find((w) => w.name === name)?.id);
  if (!id) {
    const data = { ...make(), badges: [welcomeBadge()] };
    id = worlds.create(owner.id, name, data, 30).id;
    worlds.update(id, { name, description, maxPlayers: 30, published: true, data });
    console.log(`Utworzono przykładową grę '${name}'`);
  }
  // starsze zapisy przykładowych gier dostają odznakę za wejście (raz - potem decyduje twórca)
  const row = worlds.byId(id);
  if (row) {
    const raw = JSON.parse(row.data) as WorldData;
    if (raw.badges === undefined) worlds.setData(id, { ...raw, badges: [welcomeBadge()] });
  }
  // gotowa miniaturka do menu (dopóki twórca nie zapisze własnej ze Studia)
  const file = path.join(config.assetsDir, "thumbs", thumb + ".jpg");
  if (id && !worlds.thumbnail(id) && fs.existsSync(file))
    worlds.setThumbnail(id, "data:image/jpeg;base64," + fs.readFileSync(file).toString("base64"));
  if (creator) giveGamesToCreator(creator);
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
