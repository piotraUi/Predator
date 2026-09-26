import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import compression from "compression";
import cors from "cors";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { WorldData } from "../../shared/types.ts";
import { demoArena, demoObby, sanitizeWorld, welcomeBadge } from "../../shared/world.ts";
import { upgradeAngles, upgradeLudzikCharacters } from "../../shared/import/upgrades.ts";
import { demoCity } from "../../shared/demos/city.ts";
import { MINIGAMES } from "../../shared/demos/minigames.ts";
import { api } from "./api.ts";
import { admin } from "./admin.ts";
import { social } from "./socialApi.ts";
import { parseGameFile } from "../../shared/gamefile.ts";
import { config } from "./config.ts";
import { sourceHash } from "../../shared/sourceHash.ts";
import { users, worlds } from "./db.ts";
import { StudioRoom } from "./rooms/StudioRoom.ts";
import { startBackups } from "./maintenance.ts";
import { appUpdateRouter } from "./appUpdate.ts";
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
// wersja gry na serwerze - aplikacje porównują ją ze swoją
const SERVER_HASH = sourceHash(config.root);
app.get("/api/version", (_req, res) => res.json({ name: "Predator", hash: SERVER_HASH }));
// nowa wersja gry dla aplikacji (exe / APK) - pobierana automatycznie
app.use("/app-update", cors(), appUpdateRouter(SERVER_HASH));
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
const gameServer = new Server({ greet: false, transport: new WebSocketTransport({ server, maxPayload: 16 * 1024 * 1024 }) });
gameServer.define("world", WorldRoom).filterBy(["worldId"]);
// prywatne serwery - osobna nazwa, żeby zwykłe "Graj" nigdy do nich nie trafiło
gameServer.define("private", WorldRoom).filterBy(["worldId", "privateCode"]);
// wspólna edycja w Studiu - jeden pokój na grę
gameServer.define("studio", StudioRoom).filterBy(["worldId"]);

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
/** skrót pliku gry - gdy się zmieni (nowa wersja), gra na koncie Predator jest podmieniana */
const fileHashes = new Map<string, string>();
for (const [file, thumb] of [["Tacos World", "tacos"], ["Tunnel Escape", "tunnel"], ["Spelling Bee", "spelling"]]) {
  const f = path.join(config.gamesDir, file + ".pgame");
  if (!fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, "utf8");
  fileHashes.set(file, crypto.createHash("sha1").update(text).digest("hex"));
  demos.push([file, parseGameFile(text).description, fromFile(file + ".pgame"), thumb]);
}
const versionsFile = path.join(config.dataDir, "demo-versions.json");
const versions: Record<string, string> = (() => {
  try {
    return JSON.parse(fs.readFileSync(versionsFile, "utf8"));
  } catch {
    return {};
  }
})();
/** kategorie przykładowych gier */
const DEMO_GENRES: Record<string, string> = {
  "Tor przeszkód": "obby", Arena: "fight", "Predator City": "roleplay", "Ludzik 4": "platform",
  "Pizzeria Tycoon": "tycoon", Chowany: "minigames", "Wyścigi": "race", "Wieża Piekieł": "obby",
  "Tacos World": "adventure", "Tunnel Escape": "horror", "Spelling Bee": "puzzle",
};
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
  // Ludzik 4 zapisany starszą wersją serwera: wybór postaci na mapie multiplayer
  if (name === "Ludzik 4") {
    const r = worlds.byId(id);
    const fresh = make();
    let cur = r ? (JSON.parse(r.data) as WorldData) : null;
    const chars = cur && upgradeLudzikCharacters(cur, fresh);
    if (chars) (cur = chars), console.log("Ludzik 4: dodano wybór postaci na mapie multiplayer");
    const angles = cur && upgradeAngles(cur, fresh);
    if (angles) (cur = angles), console.log("Ludzik 4: latarnie w Level 1 Cz2 stoją pionowo");
    if (cur && (chars || angles)) worlds.setData(id, sanitizeWorld(cur));
  }
  // nowa wersja gry z pliku (np. straszniejszy Tunnel Escape) - podmieniamy, póki gra jest na koncie Predator
  const hash = fileHashes.get(name);
  if (hash && versions[name] !== hash) {
    const r = worlds.byId(id);
    if (r && r.owner_id === owner.id) {
      const fresh = make();
      const badges = fresh.badges?.length ? fresh.badges : [welcomeBadge()];
      worlds.setData(id, sanitizeWorld({ ...fresh, badges }));
      console.log(`Zaktualizowano grę '${name}' do nowej wersji`);
    }
    versions[name] = hash;
    fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2));
  }
  // starsze zapisy przykładowych gier dostają odznakę za wejście (raz - potem decyduje twórca)
  const row = worlds.byId(id);
  if (row) {
    const raw = JSON.parse(row.data) as WorldData;
    if (raw.badges === undefined) worlds.setData(id, { ...raw, badges: [welcomeBadge()] });
  }
  // kategoria przykładowej gry (raz - potem decyduje twórca)
  const genre = DEMO_GENRES[name];
  const cur = worlds.byId(id);
  if (genre && cur && !cur.genre) {
    const raw = JSON.parse(cur.data) as WorldData;
    if (!raw.genre) worlds.setData(id, { ...raw, genre });
  }
  // gotowa miniaturka do menu (dopóki twórca nie zapisze własnej ze Studia)
  const file = path.join(config.assetsDir, "thumbs", thumb + ".jpg");
  if (id && !worlds.thumbnail(id) && fs.existsSync(file))
    worlds.setThumbnail(id, "data:image/jpeg;base64," + fs.readFileSync(file).toString("base64"));
  if (creator) giveGamesToCreator(creator);
}

await gameServer.listen(config.port, config.host);
// codzienne kopie zapasowe bazy (data/backups)
startBackups();

const addrs = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);
console.log(`\n  🎮 Serwer Predator działa!`);
console.log(`     Na tym komputerze:  http://localhost:${config.port}`);
for (const a of addrs) console.log(`     W sieci lokalnej:   http://${a}:${config.port}`);
console.log(`     Dane zapisywane w:  ${config.dataDir}\n`);
