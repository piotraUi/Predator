// Mechaniki gier jako zadania dla asystenta: prośba -> klocki (jeśli trzeba) -> skrypt Lua -> test w symulacji -> odpowiedź.
// Każdy skrypt jest naprawdę uruchamiany w symulacji gry (run_test), więc dane uczą tylko działającego Lua.
import { Rng, type Spec } from "./core.ts";
import { stripPl } from "./lang.ts";
import { Session } from "./session.ts";
import { decorate, pickLang, toPart, type Sample } from "./samples.ts";
import type { Lang } from "./requests.ts";

export interface TestAction { at: number; player?: number; type: "touch" | "chat" | "gui_click" | "answer"; target?: string; text?: string }
export interface Mech {
  id: string;
  /** prośby: pl i en */
  ask: { pl: string[]; en: string[] };
  /** klocki, które już stoją w grze (widać je w get_overview) */
  existing: Spec[];
  /** klocki, które asystent ma dobudować */
  create: Spec[];
  scripts: { name: string; source: string; place?: string }[];
  /** narzędzia wywołane przed skryptami (np. save_tool) */
  pre?: { name: string; args: Record<string, unknown> }[];
  test: { seconds: number; actions: TestAction[] };
  /** opis końcowy */
  reply: { pl: string; en: string };
  /** sprawdzenie wyniku testu (zwraca powód odrzucenia albo null) */
  check?: (res: TestResult) => string | null;
}
export interface TestResult { seconds: number; chat: string[]; errors: string[]; prints: string[]; events: string[]; scores?: string[] }

export const pick = <T,>(r: Rng, a: readonly T[]) => r.pick(a);
export const box = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Partial<Spec> = {}): Spec => ({ name, shape: "box", x, y, z, sx, sy, sz, color, ...extra });

// ---------- mechaniki ----------

export type Maker = (r: Rng) => Mech;

const HAZARDS = [
  { name: "Lawa", color: "#ff5a1f", pl: ["lawa", "lawy", "lawę"], en: "lava", msg: "Auć, gorąca lawa!" },
  { name: "Kolce", color: "#9aa0a6", pl: ["kolce", "kolców", "kolce"], en: "spikes", msg: "Uważaj na kolce!" },
  { name: "Ogień", color: "#ff8a1f", pl: ["ogień", "ognia", "ogień"], en: "fire", msg: "Płonie!" },
  { name: "Kwas", color: "#76ff03", pl: ["kwas", "kwasu", "kwas"], en: "acid", msg: "Kwas topi!" },
  { name: "Magma", color: "#d84315", pl: ["magma", "magmy", "magmę"], en: "magma", msg: "Magma parzy!" },
  { name: "Prąd", color: "#00e5ff", pl: ["prąd", "prądu", "prąd"], en: "electricity", msg: "Bzzzt! Porażenie prądem!" },
];

const hazard: Maker = (r) => {
  const h = pick(r, HAZARDS);
  const mode = r.pick(["kill", "kill", "damage", "msg"]);
  const body =
    mode === "kill"
      ? `  kill(player)`
      : mode === "damage"
        ? `  if cooldown("${h.name}" .. playerName(player), 1) then\n    damage(player, ${r.pick([20, 25, 30, 40])})\n    tell(player, "${h.msg}")\n  end`
        : `  tell(player, "${h.msg}")\n  kill(player)`;
  const src = `onTouch("${h.name}", function(player)\n${body}\nend)\n`;
  return {
    id: "hazard",
    ask: {
      pl: [`Niech ${h.pl[0]} zabija graczy`, `Zrób żeby ${h.pl[0]} zabijała gracza po dotknięciu`, `Dodaj skrypt: dotknięcie klocka "${h.name}" ${mode === "damage" ? "rani" : "zabija"} gracza`, `${h.name} ma ${mode === "damage" ? "ranić" : "zabijać"} jak ktoś na to wejdzie`],
      en: [`Make the ${h.en} ${mode === "damage" ? "hurt" : "kill"} players when they touch it`, `Script: touching "${h.name}" ${mode === "damage" ? "damages" : "kills"} the player`],
    },
    existing: [box(h.name, 0, 0.4, -30, 20, 0.8, 20, h.color, { kind: "normal", material: "neon" })],
    create: [],
    scripts: [{ name: h.name, source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: h.name }] },
    reply: { pl: `Gotowe! Skrypt "${h.name}" ${mode === "damage" ? "zadaje obrażenia" : "zabija gracza"} po dotknięciu klocka ${h.name}. Sprawdź to przyciskiem ▶ Testuj.`, en: `Done! The "${h.name}" script ${mode === "damage" ? "damages" : "kills"} the player on touch. Try it with ▶ Test.` },
  };
};

const coins: Maker = (r) => {
  const n = r.pick([5, 8, 10, 12, 15]);
  const create: Spec[] = [];
  const style = r.pick(["line", "circle"]);
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const [x, z] = style === "line" ? [-((n - 1) * 5) / 2 + (i - 1) * 5, -20] : [Math.cos(a) * 18, -30 + Math.sin(a) * 18];
    create.push({ name: `Moneta${i}`, shape: "cylinder", x: Math.round(x * 10) / 10, y: 3, z: Math.round(z * 10) / 10, sx: 2.4, sy: 0.5, sz: 2.4, rz: 90, color: "#ffd700", material: "neon", spin: true, collide: false });
  }
  const val = r.pick([1, 1, 5, 10]);
  const src = `for i = 1, ${n} do\n  local nazwa = "Moneta" .. i\n  onTouch(nazwa, function(player)\n    addScore(player, ${val})\n    setVisibleFor(player, nazwa, false)\n    tell(player, "+${val} ${val === 1 ? "moneta" : "monet"}!")\n  end)\nend\n`;
  return {
    id: "coins",
    ask: {
      pl: [`Dodaj ${n} monet do zbierania, każda daje ${val} pkt`, `Zrób monety do zbierania (${n} sztuk) z punktami`, `Chcę zbieranie monet - ${n} monet, zniknie po zebraniu`, `Rozstaw ${n} monet i niech dają punkty`],
      en: [`Add ${n} collectible coins worth ${val} point${val > 1 ? "s" : ""} each`, `Make ${n} coins players can collect for points`],
    },
    existing: [],
    create,
    scripts: [{ name: "Monety", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Moneta1" }, { at: 1.5, type: "touch", target: `Moneta${Math.min(n, 3)}` }] },
    reply: { pl: `Gotowe! Postawiłem ${n} złotych monet. Każda daje ${val} pkt i znika tylko dla gracza, który ją zebrał.`, en: `Done! I placed ${n} gold coins. Each gives ${val} point(s) and disappears only for the player who took it.` },
    check: (res) => (res.scores?.some((s) => s.includes(`${val * 2}`)) ? null : "punkty nie wzrosły"),
  };
};

const checkpoints: Maker = (r) => {
  const k = r.pick([2, 3, 4, 5]);
  const create: Spec[] = [];
  for (let i = 1; i <= k; i++) create.push(box(`Checkpoint${i}`, 0, 0.4, -40 * i, 10, 0.8, 10, "#4caf50", { material: "neon" }));
  const src = `local punkty = {}\n\nfor i = 1, ${k} do\n  local nazwa = "Checkpoint" .. i\n  onTouch(nazwa, function(player)\n    local x, y, z = getPosition(nazwa)\n    punkty[playerName(player)] = {x, y + 4, z}\n    tell(player, "Zapisano checkpoint " .. i)\n  end)\nend\n\nonRespawn(function(player)\n  local p = punkty[playerName(player)]\n  if p then\n    teleport(player, p[1], p[2], p[3])\n  end\nend)\n`;
  return {
    id: "checkpoints",
    ask: {
      pl: [`Dodaj ${k} checkpointy - po śmierci gracz wraca do ostatniego`, `Zrób checkpointy w grze (${k}) żeby nie zaczynać od nowa`, `Potrzebuję checkpointów: ${k} zielone platformy zapisujące postęp`],
      en: [`Add ${k} checkpoints so players respawn at the last one`, `Make ${k} checkpoints that save progress`],
    },
    existing: [],
    create,
    scripts: [{ name: "Checkpointy", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Checkpoint1" }] },
    reply: { pl: `Gotowe! Postawiłem ${k} zielone checkpointy. Dotknięcie zapisuje miejsce, a po śmierci gracz odradza się na ostatnim.`, en: `Done! I placed ${k} green checkpoints. Touching one saves it and the player respawns at the last one.` },
    check: (res) => (res.chat.some((c) => c.includes("Zapisano checkpoint 1")) ? null : "brak wiadomości o checkpoincie"),
  };
};

const goal: Maker = (r) => {
  const nm = pick(r, ["Meta", "Cel", "Koniec", "Finisz"]);
  const reward = r.pick([10, 50, 100]);
  const src = `onTouch("${nm}", function(player)\n  say(playerName(player) .. " dotarł do mety!")\n  addScore(player, ${reward})\n  local x, y, z = getPosition("Spawn")\n  teleport(player, x, y + 4, z)\nend)\n`;
  return {
    id: "goal",
    ask: { pl: [`Zrób metę: kto dotknie "${nm}" wygrywa i dostaje ${reward} punktów`, `Po dotknięciu ${nm} gracz ma wygrać i wrócić na start`, `Dodaj koniec gry - wygrana na klocku ${nm}`], en: [`Make a finish: whoever touches "${nm}" wins ${reward} points and goes back to the start`] },
    existing: [box(nm, 0, 0.4, -60, 12, 0.8, 12, "#ffd700", { kind: "normal", label: nm.toUpperCase() })],
    create: [],
    scripts: [{ name: "Meta", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: nm }] },
    reply: { pl: `Gotowe! Kto dotknie "${nm}", dostaje ${reward} pkt, wszyscy widzą komunikat o wygranej, a zwycięzca wraca na start.`, en: `Done! Whoever touches "${nm}" gets ${reward} points, everyone sees a win message and the winner returns to the start.` },
    check: (res) => (res.chat.some((c) => c.includes("dotarł do mety")) ? null : "brak komunikatu o wygranej"),
  };
};

const door: Maker = (r) => {
  const open = r.pick([8, 10, 12]);
  const t = r.pick([2, 3, 5]);
  const src = `local otwarte = false\n\nonTouch("Przycisk", function(player)\n  if otwarte then return end\n  otwarte = true\n  tweenMove("Drzwi", 0, ${open}, 0, 1)\n  tell(player, "Drzwi się otwierają")\n  after(${t}, function()\n    tweenMove("Drzwi", 0, -${open}, 0, 1)\n    otwarte = false\n  end)\nend)\n`;
  return {
    id: "door",
    ask: { pl: [`Zrób drzwi, które otwiera przycisk i zamykają się po ${t} sekundach`, `Przycisk ma podnosić drzwi na ${t} s`, `Dodaj przycisk otwierający bramę na chwilę`], en: [`Make a button that opens a door for ${t} seconds`] },
    existing: [box("Drzwi", 0, 5, -20, 10, 10, 1.5, "#8b5a2b", { texture: "planks" }), box("Przycisk", 8, 0.8, -16, 3, 0.6, 3, "#e53935", { material: "neon" })],
    create: [],
    scripts: [{ name: "Drzwi", source: src }],
    test: { seconds: 6, actions: [{ at: 1, type: "touch", target: "Przycisk" }] },
    reply: { pl: `Gotowe! Dotknięcie przycisku podnosi drzwi, a po ${t} sekundach same się zamykają.`, en: `Done! Touching the button lifts the door and it closes by itself after ${t} seconds.` },
    check: (res) => (res.chat.some((c) => c.includes("Drzwi się otwierają")) ? null : "drzwi się nie otwarły"),
  };
};

const teleporter: Maker = (r) => {
  const a = "Portal A", b = "Portal B";
  const src = `onTouch("${a}", function(player)\n  local x, y, z = getPosition("${b}")\n  teleport(player, x, y + 4, z + 6)\nend)\n\nonTouch("${b}", function(player)\n  local x, y, z = getPosition("${a}")\n  teleport(player, x, y + 4, z + 6)\nend)\n`;
  return {
    id: "teleporter",
    ask: { pl: [`Zrób dwa portale, które przenoszą graczy między sobą`, `Dodaj teleporty ${a} i ${b} - wejście w jeden przenosi do drugiego`], en: [`Make two portals that teleport players between each other`] },
    existing: [box(a, -30, 0.4, 0, 8, 0.8, 8, "#7e57c2", { material: "neon" }), box(b, 30, 0.4, 0, 8, 0.8, 8, "#26c6da", { material: "neon" })],
    create: [],
    scripts: [{ name: "Portale", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: a }] },
    reply: { pl: `Gotowe! Wejście w ${a} przenosi gracza do ${b} i odwrotnie.`, en: `Done! Stepping on ${a} sends the player to ${b} and back.` },
  };
};

const speedPad: Maker = (r) => {
  const sp = r.pick([28, 32, 40]);
  const sec = r.pick([3, 5, 8]);
  const src = `onTouch("Przyspieszacz", function(player)\n  setSpeed(player, ${sp})\n  tell(player, "Turbo!")\n  after(${sec}, function()\n    setSpeed(player, 16)\n  end)\nend)\n`;
  return {
    id: "speedPad",
    ask: { pl: [`Zrób przyspieszacz: po wejściu gracz biegnie szybciej przez ${sec} sekund`, `Dodaj turbo-płytkę, która daje prędkość ${sp} na ${sec} s`], en: [`Add a speed pad that makes players run faster for ${sec} seconds`] },
    existing: [box("Przyspieszacz", 0, 0.3, -15, 8, 0.6, 12, "#00e5ff", { material: "neon" })],
    create: [],
    scripts: [{ name: "Przyspieszacz", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Przyspieszacz" }] },
    reply: { pl: `Gotowe! Płytka "Przyspieszacz" ustawia prędkość ${sp} na ${sec} sekund, potem wraca normalna (16).`, en: `Done! The "Przyspieszacz" pad sets speed ${sp} for ${sec} seconds, then back to normal (16).` },
    check: (res) => (res.chat.some((c) => c.includes("Turbo!")) ? null : "brak turbo"),
  };
};

const chatCommands: Maker = (r) => {
  const cmds = r.shuffle([
    { c: "/heal", lua: `    heal(player, 100)\n    tell(player, "Wyleczono!")`, pl: "leczy gracza", en: "heals the player" },
    { c: "/szybko", lua: `    setSpeed(player, 30)\n    tell(player, "Biegniesz szybciej")`, pl: "przyspiesza gracza", en: "speeds the player up" },
    { c: "/wolno", lua: `    setSpeed(player, 16)\n    tell(player, "Normalna prędkość")`, pl: "przywraca normalną prędkość", en: "resets speed" },
    { c: "/skok", lua: `    setJump(player, 80)\n    tell(player, "Skaczesz wyżej")`, pl: "podnosi skok", en: "boosts jump" },
    { c: "/start", lua: `    local x, y, z = getPosition("Spawn")\n    teleport(player, x, y + 4, z)`, pl: "teleportuje na start", en: "teleports to the start" },
  ]).slice(0, r.int(2, 4));
  const src = `onChat(function(player, message)\n${cmds.map((c, i) => `  ${i ? "elseif" : "if"} message == "${c.c}" then\n${c.lua}`).join("\n")}\n  end\nend)\n`;
  return {
    id: "chatCommands",
    ask: { pl: [`Dodaj komendy na czacie: ${cmds.map((c) => c.c).join(", ")}`, `Zrób komendy czatu ${cmds.map((c) => c.c).join(" i ")}`], en: [`Add chat commands ${cmds.map((c) => c.c).join(", ")}`] },
    existing: [],
    create: [],
    scripts: [{ name: "Komendy", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "chat", text: cmds[0].c }] },
    reply: { pl: `Gotowe! Komendy: ${cmds.map((c) => `${c.c} (${c.pl})`).join(", ")}.`, en: `Done! Commands: ${cmds.map((c) => `${c.c} (${c.en})`).join(", ")}.` },
  };
};

const weatherCmds: Maker = (r) => {
  const hour = r.pick([0, 21.5, 6]);
  const src = `onChat(function(player, message)\n  if message == "/deszcz" then\n    setWeather("rain")\n    say("Zaczyna padać deszcz")\n  elseif message == "/burza" then\n    setWeather("storm")\n    say("Nadciąga burza!")\n  elseif message == "/snieg" then\n    setWeather("snow")\n  elseif message == "/slonce" then\n    setWeather("clear")\n  elseif message == "/noc" then\n    setHour(${hour})\n  elseif message == "/dzien" then\n    setHour(12)\n  end\nend)\n`;
  return {
    id: "weather",
    ask: { pl: [`Zrób komendy pogody: /deszcz /burza /snieg /slonce oraz /noc i /dzien`, `Chcę zmieniać pogodę i porę dnia komendami na czacie`], en: [`Add chat commands to change the weather and time of day`] },
    existing: [],
    create: [],
    scripts: [{ name: "Pogoda", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "chat", text: "/burza" }] },
    reply: { pl: `Gotowe! Na czacie: /deszcz, /burza, /snieg, /slonce zmieniają pogodę, a /noc i /dzien porę dnia.`, en: `Done! Chat: /deszcz, /burza, /snieg, /slonce change the weather; /noc and /dzien change the time of day.` },
    check: (res) => (res.chat.some((c) => c.includes("Nadciąga burza")) ? null : "brak komunikatu burzy"),
  };
};

const roundTimer: Maker = (r) => {
  const sec = r.pick([30, 60, 90, 120]);
  const src = `local czas = ${sec}\nlocal trwa = false\n\nlocal function start()\n  czas = ${sec}\n  trwa = true\n  say("Runda się zaczęła! Masz ${sec} sekund.")\nend\n\nevery(1, function()\n  if not trwa then return end\n  czas = czas - 1\n  if czas == 10 then say("Zostało 10 sekund!") end\n  if czas <= 0 then\n    trwa = false\n    say("Koniec rundy!")\n    after(5, start)\n  end\nend)\n\nonPlayerJoin(function(player)\n  if not trwa then start() end\nend)\n`;
  return {
    id: "roundTimer",
    ask: { pl: [`Zrób rundy po ${sec} sekund: odliczanie, komunikat na końcu i nowa runda`, `Dodaj timer rundy ${sec}s z powtarzaniem`], en: [`Make ${sec}-second rounds that restart automatically`] },
    existing: [],
    create: [],
    scripts: [{ name: "Rundy", source: src }],
    test: { seconds: Math.min(sec + 2, 30), actions: [] },
    reply: { pl: `Gotowe! Runda trwa ${sec} sekund, przy 10 s zostaje ostrzeżenie, na końcu "Koniec rundy!" i po 5 sekundach startuje następna.`, en: `Done! Each round lasts ${sec} seconds, warns at 10 s left, announces the end, and a new one starts after 5 seconds.` },
  };
};

const movingPlatform: Maker = (r) => {
  const dz = r.pick([20, 30, 40]);
  const t = r.pick([2, 3, 4]);
  const axis = r.pick(["x", "z", "y"]);
  const mv = axis === "x" ? `${dz}, 0, 0` : axis === "z" ? `0, 0, ${dz}` : `0, ${dz / 2}, 0`;
  const back = axis === "x" ? `-${dz}, 0, 0` : axis === "z" ? `0, 0, -${dz}` : `0, -${dz / 2}, 0`;
  const src = `local okres = ${t * 2 + 1}\n\nevery(okres, function()\n  tweenMove("Winda", ${mv}, ${t})\n  after(${t + 0.5}, function()\n    tweenMove("Winda", ${back}, ${t})\n  end)\nend)\n`;
  return {
    id: "movingPlatform",
    ask: { pl: [`Niech platforma "Winda" jeździ w tę i z powrotem co kilka sekund`, `Zrób ruchomą platformę ${axis === "y" ? "(winda góra-dół)" : ""}`], en: [`Make the "Winda" platform move back and forth`] },
    existing: [box("Winda", 0, 1, -20, 10, 1, 10, "#ffa726")],
    create: [],
    scripts: [{ name: "Winda", source: src }],
    test: { seconds: okresTest(t), actions: [] },
    reply: { pl: `Gotowe! "Winda" przesuwa się o ${axis === "y" ? dz / 2 : dz} jednostek w ${t} s i wraca, w kółko.`, en: `Done! "Winda" moves ${axis === "y" ? dz / 2 : dz} units in ${t} s and comes back, repeatedly.` },
  };
};
const okresTest = (t: number) => Math.min(30, t * 2 + 3);

const saveCoins: Maker = (r) => {
  const src = `onPlayerJoin(function(player)\n  local zapis = loadData(player, "monety", 0)\n  setScore(player, zapis)\n  tell(player, "Masz " .. zapis .. " monet")\nend)\n\nonTouch("Moneta", function(player)\n  addScore(player, 1)\n  saveData(player, "monety", getScore(player))\n  setVisibleFor(player, "Moneta", false)\nend)\n`;
  return {
    id: "saveCoins",
    ask: { pl: [`Zapisuj monety gracza, żeby zostały po wyjściu z gry`, `Chcę żeby postęp (monety) się zapisywał na stałe`], en: [`Save the player's coins so they persist between sessions`] },
    existing: [{ name: "Moneta", shape: "cylinder", x: 0, y: 3, z: -15, sx: 2.4, sy: 0.5, sz: 2.4, rz: 90, color: "#ffd700", material: "neon", spin: true, collide: false }],
    create: [],
    scripts: [{ name: "Zapis monet", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Moneta" }] },
    reply: { pl: `Gotowe! Monety zapisują się przez saveData przy każdym zebraniu i wczytują przy wejściu do gry.`, en: `Done! Coins are saved with saveData on every pickup and loaded when the player joins.` },
  };
};

const leaderboardCmd: Maker = () => {
  const src = `onChat(function(player, message)\n  if message == "/top" then\n    local lista = topPlayers(3)\n    local tekst = "Najlepsi: "\n    for i, p in ipairs(lista) do\n      tekst = tekst .. i .. ". " .. playerName(p) .. " (" .. getScore(p) .. ") "\n    end\n    say(tekst)\n  end\nend)\n`;
  return {
    id: "leaderboard",
    ask: { pl: [`Dodaj komendę /top która pokazuje 3 najlepszych graczy`, `Zrób ranking na czacie`], en: [`Add a /top chat command that shows the 3 best players`] },
    existing: [],
    create: [],
    scripts: [{ name: "Ranking", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "chat", text: "/top" }] },
    reply: { pl: `Gotowe! Napisz /top, a na czacie pojawi się trzech najlepszych graczy wg punktów.`, en: `Done! Type /top to see the three best players by score.` },
    check: (res) => (res.chat.some((c) => c.includes("Najlepsi")) ? null : "brak rankingu"),
  };
};

const npcTalk: Maker = (r) => {
  const npc = pick(r, ["Sprzedawca", "Strażnik", "Przewodnik", "Czarodziej"]);
  const lines = {
    Sprzedawca: ["Witaj! Mam dziś świetne ceny.", "Zajrzyj później, przyjacielu."],
    Strażnik: ["Stój! Tu nie wolno wchodzić bez klucza.", "Pilnuję tej bramy."],
    Przewodnik: ["Cześć! Cel gry jest po drugiej stronie mapy.", "Uważaj na lawę!"],
    Czarodziej: ["Witaj, młody podróżniku...", "Magia kryje się w monetach."],
  }[npc as "Sprzedawca"];
  const src = `onTouch("${npc}", function(player)\n  if cooldown("${npc}" .. playerName(player), 4) then\n    tell(player, ${npc ? `choice({"${lines[0]}", "${lines[1]}"})` : ""})\n  end\nend)\n`;
  return {
    id: "npcTalk",
    ask: { pl: [`Niech NPC ${npc} gada z graczem, kiedy do niego podejdzie`, `Zrób dialog: gracz dotyka ${npc} i dostaje wiadomość`], en: [`Make the NPC "${npc}" say something when a player touches it`] },
    existing: [box(npc, 0, 3, -20, 3, 6, 3, "#8e6e53", { kind: "npc" })].map((p) => ({ ...p, kind: "normal" as const })),
    create: [],
    scripts: [{ name: npc, source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: npc }] },
    reply: { pl: `Gotowe! ${npc} odpowiada losową wypowiedzią, a cooldown 4 s chroni przed spamem.`, en: `Done! ${npc} replies with a random line, with a 4 s cooldown against spam.` },
  };
};

const giveTool: Maker = (r) => {
  const tool = pick(r, ["Miecz", "Pistolet", "Różdżka", "Siekiera"]);
  const type = tool === "Pistolet" ? "ranged" : "melee";
  const model = { Miecz: "sword", Pistolet: "pistol", Różdżka: "wand", Siekiera: "axe" }[tool as "Miecz"];
  const src = `onTouch("Skrzynia", function(player)\n  if hasTool(player, "${tool}") then\n    tell(player, "Już to masz!")\n  else\n    giveTool(player, "${tool}")\n    tell(player, "Dostałeś: ${tool}")\n  end\nend)\n`;
  return {
    id: "giveTool",
    ask: { pl: [`Zrób skrzynię, z której gracz dostaje ${tool.toLowerCase()}`, `Dotknięcie "Skrzynia" ma dawać broń: ${tool}`], en: [`Make a chest that gives the player a ${model}`] },
    existing: [box("Skrzynia", 0, 1.5, -15, 4, 3, 3, "#8d5a2b", { texture: "planks" })],
    create: [],
    pre: [{ name: "save_tool", args: { name: tool, type, model, damage: type === "ranged" ? 20 : 25, range: type === "ranged" ? 120 : 8, cooldown: type === "ranged" ? 0.5 : 0.7 } }],
    scripts: [{ name: "Skrzynia", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Skrzynia" }] },
    reply: { pl: `Gotowe! Stworzyłem narzędzie "${tool}" i skrypt: dotknięcie "Skrzynia" daje je graczowi (tylko raz).`, en: `Done! I created the "${tool}" tool and a script: touching "Skrzynia" gives it once.` },
    check: (res) => (res.chat.some((c) => c.includes("Dostałeś")) ? null : "narzędzie nie zostało nadane"),
  };
};

const fallKill: Maker = (r) => {
  const y = r.pick([-30, -50, -80]);
  const src = `every(0.5, function()\n  for _, player in ipairs(getPlayers()) do\n    local x, py, z = getPlayerPosition(player)\n    if py < ${y} then\n      tell(player, "Spadłeś!")\n      kill(player)\n    end\n  end\nend)\n`;
  return {
    id: "fallKill",
    ask: { pl: [`Jak gracz spadnie poniżej mapy, ma zginąć i się odrodzić`, `Zrób zabezpieczenie przed spadnięciem w przepaść (y < ${y})`], en: [`Kill players who fall off the map`] },
    existing: [],
    create: [],
    scripts: [{ name: "Spadanie", source: src }],
    test: { seconds: 3, actions: [] },
    reply: { pl: `Gotowe! Co pół sekundy sprawdzam wysokość graczy - poniżej ${y} giną i odradzają się.`, en: `Done! Every half second I check player height - below ${y} they die and respawn.` },
  };
};

const welcome: Maker = (r) => {
  const game = pick(r, ["Parkour Mistrzów", "Wyspa Skarbów", "Arena Walk", "Świat Przygód"]);
  const src = `onPlayerJoin(function(player)\n  tell(player, "Witaj w grze ${game}, " .. playerName(player) .. "!")\n  say(playerName(player) .. " dołączył do gry")\nend)\n`;
  return {
    id: "welcome",
    ask: { pl: [`Dodaj powitanie dla graczy: "Witaj w grze ${game}"`, `Chcę wiadomość powitalną po wejściu do gry`], en: [`Add a welcome message for players joining`] },
    existing: [],
    create: [],
    scripts: [{ name: "Powitanie", source: src }],
    test: { seconds: 2, actions: [] },
    reply: { pl: `Gotowe! Każdy nowy gracz dostaje powitanie, a wszyscy widzą, że dołączył.`, en: `Done! Every new player gets a welcome and everyone sees who joined.` },
    check: (res) => (res.chat.some((c) => c.includes("Witaj w grze")) ? null : "brak powitania"),
  };
};

const trapToggle: Maker = (r) => {
  const t = r.pick([2, 3, 4]);
  const src = `local aktywne = true\n\nevery(${t}, function()\n  aktywne = not aktywne\n  setVisible("Kolce", aktywne)\nend)\n\nonTouch("Kolce", function(player)\n  kill(player)\nend)\n`;
  return {
    id: "trapToggle",
    ask: { pl: [`Kolce mają się chować i wysuwać co ${t} sekundy, a wysunięte zabijają`, `Pułapka: kolce migają co ${t} s`], en: [`Spikes that toggle every ${t} seconds and kill when visible`] },
    existing: [box("Kolce", 0, 1, -25, 14, 2, 6, "#9aa0a6", { material: "metal" })],
    create: [],
    scripts: [{ name: "Pułapka", source: src }],
    test: { seconds: t * 2 + 1, actions: [{ at: t + 0.5, type: "touch", target: "Kolce" }] },
    reply: { pl: `Gotowe! Kolce zmieniają widoczność co ${t} sekundy; gdy są widoczne, zabijają po dotknięciu.`, en: `Done! The spikes toggle every ${t} seconds and kill when visible.` },
  };
};

const colorFloor: Maker = (r) => {
  const t = r.pick([1, 2]);
  const src = `local kolory = {"#ef5350", "#ffa726", "#ffee58", "#66bb6a", "#42a5f5", "#ab47bc"}\n\nevery(${t}, function()\n  setColor("Podłoga disco", choice(kolory))\nend)\n`;
  return {
    id: "colorFloor",
    ask: { pl: [`Zrób podłogę disco, która zmienia kolor co ${t} s`, `Niech klocek "Podłoga disco" miga kolorami`], en: [`Make a disco floor that changes color every ${t} s`] },
    existing: [box("Podłoga disco", 0, 0.3, -30, 30, 0.6, 30, "#ffffff")],
    create: [],
    scripts: [{ name: "Disco", source: src }],
    test: { seconds: 3, actions: [] },
    reply: { pl: `Gotowe! "Podłoga disco" co ${t} s dostaje losowy kolor z tęczowej listy.`, en: `Done! "Podłoga disco" picks a random rainbow color every ${t} s.` },
  };
};

const MECHS1: Record<string, Maker> = {
  hazard, coins, checkpoints, goal, door, teleporter, speedPad, chatCommands, weather: weatherCmds, roundTimer, movingPlatform, saveCoins, leaderboard: leaderboardCmd, npcTalk, giveTool, fallKill, welcome, trapToggle, colorFloor,
};

import { MECHS2 } from "./lua2.ts";
export const MECHS: Record<string, Maker> = { ...MECHS1, ...MECHS2 };

// ---------- składanie rozmowy ----------

const PLAN_LUA = {
  pl: ["Sprawdzę, jakie klocki są w grze.", "Najpierw zobaczę, co już stoi na mapie.", "Zajrzę do mapy, żeby użyć właściwych nazw."],
  en: ["Let me check which parts exist in the game.", "I'll look at the map first so I use the right names."],
};
const WRITE_PL = ["Piszę skrypt.", "Dodaję skrypt i sprawdzę go testem.", "Robię to skryptem Lua."];
const WRITE_EN = ["Writing the script.", "I'll add a script and then test it."];
const TEST_PL = ["Sprawdzam to w symulacji.", "Testuję, czy działa.", "Uruchamiam test."];
const TEST_EN = ["Testing it in the simulation.", "Let me run a quick test."];

export async function sampleLua(r: Rng, forceId?: string): Promise<Sample | null> {
  const id = forceId ?? r.pick(Object.keys(MECHS));
  const m = MECHS[id](r);
  const lang: Lang = pickLang(r);
  const ask0 = lang === "en" ? r.pick(m.ask.en) : r.pick(m.ask.pl);
  const ask = decorate(lang === "pl-noaccent" ? stripPl(ask0) : ask0, r, lang);
  const tr = (pl: string[], en: string[]) => (lang === "en" ? r.pick(en) : lang === "pl" ? r.pick(pl) : stripPl(r.pick(pl)));
  const S = new Session(r);
  if (m.existing.length) await S.exec("create_parts", { parts: m.existing.map(toPart) });
  S.user(ask);
  await S.turn(tr(PLAN_LUA.pl, PLAN_LUA.en), [{ name: "get_overview", args: {} }]);

  const calls: Parameters<Session["turn"]>[1] = [];
  for (const p of m.pre ?? []) calls.push({ name: p.name, args: p.args });
  if (m.create.length) calls.push({ name: "create_parts", args: { parts: m.create.map(toPart), model_name: m.id === "coins" ? "Monety" : m.id === "checkpoints" ? "Checkpointy" : undefined } });
  for (const sc of m.scripts) calls.push({ name: "write_script", args: { name: sc.name, source: sc.source, ...(sc.place ? { place: sc.place } : {}) } });
  const res = await S.turn(tr(WRITE_PL, WRITE_EN), calls);
  for (const x of res) if ((x as { error?: string }).error) return null;

  const rt = (await S.turn(tr(TEST_PL, TEST_EN), [{ name: "run_test", args: { seconds: m.test.seconds, ...(m.test.actions.length ? { actions: m.test.actions } : {}) } }]))[0] as TestResult;
  if (rt.errors?.length) return null;
  const why = m.check?.(rt);
  if (why) return null;
  if (S.bad.length) return null;
  S.say(lang === "en" ? m.reply.en : lang === "pl" ? m.reply.pl : stripPl(m.reply.pl));
  return { id: `lua-${m.id}`, kind: "lua", lang, messages: S.msgs };
}
