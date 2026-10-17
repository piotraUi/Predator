// Mechaniki Lua, część 2: okienka (GUI), drużyny, pułapki, pogoda, zdarzenia gry. Każda przechodzi test w symulacji (patrz lua.ts).
import { box, pick, type Maker, type Mech } from "./lua.ts";
import type { Spec } from "./core.ts";

export const guiBtn = (name: string, text: string, x: number, y: number, w: number, h: number, bg: string, action?: { type: string; target?: string }) => ({ name, type: "button", x, y, w, h, text, bg, color: "#ffffff", fontSize: 28, bold: true, radius: 14, align: "center", ...(action ? { action } : {}) });
export const guiText = (name: string, text: string, x: number, y: number, w: number, h: number, fontSize = 30, color = "#ffffff", bg?: string) => ({ name, type: "text", x, y, w, h, text, color, fontSize, bold: true, align: "center", ...(bg ? { bg, bgOpacity: 0.55, radius: 12 } : {}) });

const hudCoins: Maker = (r) => {
  const icon = pick(r, ["⭐", "💰", "🪙"]);
  const gui = { name: "Licznik", open: true, elements: [guiText("Napis", `${icon} 0`, 2, 2, 18, 8, 30, "#ffd54f", "#000000")] };
  const src = `local function odswiez(player)\n  setGuiText(player, "Licznik", "Napis", "${icon} " .. getScore(player))\nend\n\nonPlayerJoin(function(player)\n  showGui(player, "Licznik")\n  odswiez(player)\nend)\n\nonTouch("Moneta", function(player)\n  addScore(player, 1)\n  setVisibleFor(player, "Moneta", false)\n  odswiez(player)\nend)\n`;
  return {
    id: "hudCoins",
    ask: { pl: [`Zrób licznik monet na ekranie, który pokazuje ile gracz ma punktów`, `Dodaj GUI z licznikiem ${icon} w rogu ekranu, aktualizowany po zebraniu monety`], en: [`Add an on-screen coin counter that updates when a coin is collected`] },
    existing: [{ name: "Moneta", shape: "cylinder", x: 0, y: 3, z: -15, sx: 2.4, sy: 0.5, sz: 2.4, rz: 90, color: "#ffd700", material: "neon", spin: true, collide: false }],
    create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Licznik monet", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Moneta" }] },
    reply: { pl: `Gotowe! W lewym górnym rogu jest licznik "${icon} 0". Po dotknięciu monety rośnie, a skrypt odświeża go przez setGuiText.`, en: `Done! There's a counter in the top-left corner. It goes up when a coin is touched (updated with setGuiText).` },
    check: (res) => (res.events.some((e) => e.includes(`${icon} 1`)) ? null : "licznik się nie zmienił"),
  };
};

const shopGui: Maker = (r) => {
  const price = r.pick([5, 10, 20]);
  const gui = {
    name: "Sklep", modal: true,
    elements: [
      { name: "Tło", type: "frame", x: 25, y: 20, w: 50, h: 60, bg: "#1e2a38", bgOpacity: 0.95, radius: 20 },
      guiText("Tytuł", "Sklep", 25, 22, 50, 10, 40),
      guiBtn("Szybkość", `Szybkość (${price} pkt)`, 32, 38, 36, 12, "#2e7d32"),
      guiBtn("Skok", `Skok (${price} pkt)`, 32, 54, 36, 12, "#1565c0"),
      guiBtn("Zamknij", "Zamknij", 38, 70, 24, 8, "#b71c1c", { type: "close" }),
    ],
  };
  const src = `onTouch("Kasa", function(player)\n  showGui(player, "Sklep")\nend)\n\nonGuiClick(function(player, gui, button)\n  if gui ~= "Sklep" then return end\n  if button == "Szybkość" then\n    if getScore(player) >= ${price} then\n      addScore(player, -${price})\n      setSpeed(player, 28)\n      tell(player, "Kupiono szybkość!")\n    else\n      tell(player, "Za mało punktów")\n    end\n  elseif button == "Skok" then\n    if getScore(player) >= ${price} then\n      addScore(player, -${price})\n      setJump(player, 80)\n      tell(player, "Kupiono wyższy skok!")\n    else\n      tell(player, "Za mało punktów")\n    end\n  end\nend)\n`;
  return {
    id: "shopGui",
    ask: { pl: [`Zrób sklep w grze: okienko z przyciskami, za punkty kupuje się szybkość i skok (${price} pkt)`, `Dodaj sklep GUI otwierany przez dotknięcie "Kasa"`], en: [`Add an in-game shop window where players buy speed and jump with points (${price} each)`] },
    existing: [box("Kasa", 0, 1.5, -15, 4, 3, 4, "#fbc02d", { label: "SKLEP" })],
    create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Sklep", source: src }],
    test: { seconds: 3, actions: [{ at: 0.5, type: "touch", target: "Kasa" }, { at: 1.5, type: "gui_click", target: "Sklep", text: "Szybkość" }] },
    reply: { pl: `Gotowe! Dotknięcie "Kasa" otwiera okno sklepu. Przyciski "Szybkość" i "Skok" kosztują ${price} pkt i działają tylko, gdy gracz ma dość punktów.`, en: `Done! Touching "Kasa" opens the shop. "Szybkość" and "Skok" cost ${price} points each.` },
    check: (res) => (res.chat.some((c) => c.includes("Za mało punktów")) ? null : "przycisk nie zadziałał"),
  };
};

const startMenu: Maker = (r) => {
  const title = pick(r, ["Parkour Mistrzów", "Wielka Przygoda", "Super Obby", "Arena Walk"]);
  const gui = { name: "Menu", open: true, modal: true, elements: [{ name: "Tło", type: "frame", x: 20, y: 15, w: 60, h: 70, bg: "#102a43", bgOpacity: 0.96, radius: 24 }, guiText("Tytuł", title, 20, 25, 60, 16, 52, "#ffd54f"), guiBtn("Graj", "▶ Graj", 35, 55, 30, 14, "#2e7d32")] };
  const src = `onPlayerJoin(function(player)\n  showGui(player, "Menu")\nend)\n\nonGuiClick(function(player, gui, button)\n  if gui == "Menu" and button == "Graj" then\n    hideGui(player, "Menu")\n    tell(player, "Powodzenia!")\n  end\nend)\n`;
  return {
    id: "startMenu",
    ask: { pl: [`Zrób menu startowe z tytułem "${title}" i przyciskiem Graj`, `Chcę ekran powitalny z przyciskiem ▶ Graj, który się zamyka`], en: [`Make a start menu titled "${title}" with a Play button that closes it`] },
    existing: [], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Menu startowe", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "gui_click", target: "Menu", text: "Graj" }] },
    reply: { pl: `Gotowe! Po wejściu gracz widzi menu "${title}". Przycisk "▶ Graj" zamyka je i życzy powodzenia.`, en: `Done! Players see the "${title}" menu on join and the Play button closes it.` },
    check: (res) => (res.chat.some((c) => c.includes("Powodzenia")) ? null : "menu nie zamknięte"),
  };
};

const winGui: Maker = () => {
  const gui = { name: "Wygrana", elements: [{ name: "Tło", type: "frame", x: 25, y: 25, w: 50, h: 45, bg: "#0b3d2e", bgOpacity: 0.95, radius: 20 }, guiText("Napis", "🏆 Wygrałeś!", 25, 32, 50, 14, 46, "#ffd54f"), guiBtn("Zamknij", "Super!", 38, 55, 24, 10, "#2e7d32", { type: "close" })] };
  const src = `onTouch("Meta", function(player)\n  showGui(player, "Wygrana")\n  addScore(player, 50)\n  say(playerName(player) .. " wygrał!")\nend)\n`;
  return {
    id: "winGui",
    ask: { pl: [`Po dotknięciu mety pokaż okienko "Wygrałeś!" z przyciskiem zamknięcia`, `Zrób ekran wygranej na mecie`], en: [`Show a "You won!" window when the player touches the finish`] },
    existing: [box("Meta", 0, 0.4, -50, 10, 0.8, 10, "#ffd700")], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Ekran wygranej", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Meta" }] },
    reply: { pl: `Gotowe! Meta pokazuje okno "Wygrałeś!", daje 50 pkt i ogłasza zwycięzcę na czacie.`, en: `Done! The finish shows the "You won!" window, gives 50 points and announces the winner.` },
    check: (res) => (res.events.some((e) => e.includes("open GUIs: Wygrana")) ? null : "okno się nie otworzyło"),
  };
};

const healZone: Maker = (r) => {
  const hp = r.pick([5, 10, 20]);
  const src = `every(1, function()\n  local x, y, z = getPosition("Strefa leczenia")\n  for _, player in ipairs(playersNear(x, y, z, 12)) do\n    if getHealth(player) < 100 then\n      heal(player, ${hp})\n      print("Wyleczono " .. playerName(player))\n    end\n  end\nend)\n`;
  return {
    id: "healZone",
    ask: { pl: [`Zrób strefę leczenia: kto w niej stoi, odzyskuje ${hp} HP co sekundę`, `Dodaj zielone pole leczące graczy`], en: [`Add a healing zone that heals players ${hp} HP every second`] },
    existing: [box("Strefa leczenia", 0, 0.2, 0, 20, 0.4, 20, "#69f0ae", { material: "neon", collide: false, transparency: 0.4 })], create: [],
    scripts: [{ name: "Leczenie", source: src }],
    test: { seconds: 4, actions: [] },
    reply: { pl: `Gotowe! Co sekundę każdy gracz w promieniu 12 od "Strefa leczenia" dostaje +${hp} HP (do 100).`, en: `Done! Every second players within 12 studs of the zone get +${hp} HP.` },
  };
};

const teams: Maker = () => {
  const src = `onPlayerJoin(function(player)\n  if teamCount("Czerwoni") <= teamCount("Niebiescy") then\n    setTeam(player, "Czerwoni")\n    tell(player, "Jesteś w drużynie Czerwonych!")\n  else\n    setTeam(player, "Niebiescy")\n    tell(player, "Jesteś w drużynie Niebieskich!")\n  end\nend)\n`;
  return {
    id: "teams",
    ask: { pl: [`Podziel graczy na dwie drużyny: Czerwoni i Niebiescy, po równo`, `Zrób automatyczne drużyny po wejściu do gry`], en: [`Automatically split players into two balanced teams`] },
    existing: [], create: [],
    scripts: [{ name: "Drużyny", source: src }],
    test: { seconds: 2, actions: [] },
    reply: { pl: `Gotowe! Każdy nowy gracz trafia do mniejszej drużyny (Czerwoni albo Niebiescy) i dostaje o tym wiadomość.`, en: `Done! Each new player joins the smaller team (red or blue) and is told which.` },
    check: (res) => (res.chat.some((c) => c.includes("Jesteś w drużynie")) ? null : "brak przydziału"),
  };
};

const fallingTiles: Maker = (r) => {
  const n = r.pick([4, 6, 8]);
  const create: Spec[] = [];
  for (let i = 1; i <= n; i++) create.push(box(`Kruche${i}`, 0, 0.4, -10 - i * 7, 6, 0.8, 6, "#ffcc80"));
  const src = `for i = 1, ${n} do\n  local nazwa = "Kruche" .. i\n  onTouch(nazwa, function(player)\n    after(1, function() setVisible(nazwa, false) end)\n    after(4, function() setVisible(nazwa, true) end)\n  end)\nend\n`;
  return {
    id: "fallingTiles",
    ask: { pl: [`Zrób kruche platformy (${n}), które znikają sekundę po dotknięciu i wracają`, `Dodaj spadające płytki w parkourze`], en: [`Add ${n} crumbling platforms that vanish 1 second after being touched and come back`] },
    existing: [], create,
    scripts: [{ name: "Kruche platformy", source: src }],
    test: { seconds: 3, actions: [{ at: 0.5, type: "touch", target: "Kruche1" }] },
    reply: { pl: `Gotowe! Postawiłem ${n} kruchych platform. Znikają sekundę po dotknięciu i po 4 sekundach wracają.`, en: `Done! I placed ${n} crumbling platforms. They vanish 1 s after touch and return after 4 s.` },
  };
};

const spinner: Maker = (r) => {
  const speed = r.pick([60, 120, 200]);
  const src = `local kat = 0\n\nevery(0.05, function()\n  kat = (kat + ${speed * 0.05}) % 360\n  setRotation("Wirnik", kat)\nend)\n\nonTouch("Wirnik", function(player)\n  kill(player)\nend)\n`;
  return {
    id: "spinner",
    ask: { pl: [`Niech "Wirnik" się kręci i zabija graczy po dotknięciu`, `Zrób obracającą się belkę-pułapkę`], en: [`Make the "Wirnik" bar spin and kill players on touch`] },
    existing: [box("Wirnik", 0, 3, -25, 24, 1.2, 1.6, "#d32f2f", { material: "neon" })], create: [],
    scripts: [{ name: "Wirnik", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Wirnik" }] },
    reply: { pl: `Gotowe! "Wirnik" obraca się o ${speed}° na sekundę, a dotknięcie go zabija.`, en: `Done! "Wirnik" spins ${speed}° per second and kills on touch.` },
  };
};

const passwordDoor: Maker = (r) => {
  const word = pick(r, ["sezam", "tajne", "otwórz", "hasło123"]);
  const src = `onChat(function(player, message)\n  if message == "${word}" then\n    setVisible("Brama", false)\n    say(playerName(player) .. " odgadł hasło!")\n    after(5, function()\n      setVisible("Brama", true)\n    end)\n  end\nend)\n`;
  return {
    id: "passwordDoor",
    ask: { pl: [`Brama ma się otwierać, gdy ktoś napisze na czacie "${word}"`, `Zrób bramę z hasłem na czacie (${word}), otwartą na 5 sekund`], en: [`Make a gate that opens for 5 seconds when someone types "${word}" in chat`] },
    existing: [box("Brama", 0, 5, -20, 12, 10, 1.5, "#6d4c41", { texture: "planks" })], create: [],
    scripts: [{ name: "Brama z hasłem", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "chat", text: word }] },
    reply: { pl: `Gotowe! Kto napisze "${word}", otwiera "Brama" na 5 sekund i wszyscy to widzą.`, en: `Done! Whoever types "${word}" opens the gate for 5 seconds.` },
    check: (res) => (res.chat.some((c) => c.includes("odgadł hasło")) ? null : "hasło nie zadziałało"),
  };
};

const keyDoor: Maker = () => {
  const src = `local klucze = {}\n\nonTouch("Klucz", function(player)\n  klucze[playerName(player)] = true\n  setVisibleFor(player, "Klucz", false)\n  tell(player, "Masz klucz!")\nend)\n\nonTouch("Zamknięte drzwi", function(player)\n  if klucze[playerName(player)] then\n    setVisible("Zamknięte drzwi", false)\n    say(playerName(player) .. " otworzył drzwi")\n  else\n    tell(player, "Drzwi są zamknięte. Znajdź klucz!")\n  end\nend)\n`;
  return {
    id: "keyDoor",
    ask: { pl: [`Zrób klucz do zebrania i zamknięte drzwi, które otwiera tylko ten klucz`, `Dodaj zagadkę: znajdź klucz, żeby otworzyć drzwi`], en: [`Add a key to collect and a locked door that only opens with that key`] },
    existing: [{ name: "Klucz", shape: "box", x: 15, y: 2, z: -10, sx: 1, sy: 2.4, sz: 0.5, color: "#ffd700", material: "neon", spin: true, collide: false }, box("Zamknięte drzwi", 0, 5, -30, 10, 10, 1.5, "#5d4037", { texture: "planks" })], create: [],
    scripts: [{ name: "Klucz i drzwi", source: src }],
    test: { seconds: 4, actions: [{ at: 0.5, type: "touch", target: "Zamknięte drzwi" }, { at: 1.5, type: "touch", target: "Klucz" }, { at: 2.5, type: "touch", target: "Zamknięte drzwi" }] },
    reply: { pl: `Gotowe! Bez klucza drzwi mówią, że są zamknięte. Po zebraniu "Klucz" (znika tylko dla gracza) drzwi się otwierają.`, en: `Done! Without the key the door stays shut; after picking up "Klucz" it opens.` },
    check: (res) => (res.chat.some((c) => c.includes("otworzył drzwi")) ? null : "drzwi się nie otwarły"),
  };
};

const lootBox: Maker = (r) => {
  const prizes = r.pick([[10, 50, 100], [5, 20, 100], [1, 10, 25]]);
  const src = `onTouch("Skrzynka", function(player)\n  if not cooldown("skrzynka" .. playerName(player), 10) then\n    tell(player, "Poczekaj chwilę...")\n    return\n  end\n  local nagroda = choice({${prizes.join(", ")}})\n  addScore(player, nagroda)\n  tell(player, "Wylosowałeś " .. nagroda .. " punktów!")\nend)\n`;
  return {
    id: "lootBox",
    ask: { pl: [`Zrób losową skrzynkę z nagrodą (${prizes.join(", ")} pkt), raz na 10 sekund`, `Dodaj skrzynkę-niespodziankę z losowymi punktami`], en: [`Add a mystery box that gives a random prize (${prizes.join(", ")} points) every 10 seconds`] },
    existing: [box("Skrzynka", 0, 1.5, -15, 3.4, 3, 3.4, "#7e57c2", { material: "neon" })], create: [],
    scripts: [{ name: "Skrzynka", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Skrzynka" }] },
    reply: { pl: `Gotowe! "Skrzynka" losuje nagrodę z listy ${prizes.join("/")} punktów, a cooldown 10 s chroni przed spamem.`, en: `Done! "Skrzynka" picks a random prize (${prizes.join("/")} points) with a 10 s cooldown.` },
    check: (res) => (res.chat.some((c) => c.includes("Wylosowałeś")) ? null : "brak nagrody"),
  };
};

const raceTimer: Maker = () => {
  const src = `local start = {}\n\nonTouch("Linia startu", function(player)\n  start[playerName(player)] = time()\n  tell(player, "Start! Biegnij do mety.")\nend)\n\nonTouch("Meta", function(player)\n  local t0 = start[playerName(player)]\n  if t0 then\n    say(playerName(player) .. " ukończył bieg w " .. formatTime(time() - t0))\n    start[playerName(player)] = nil\n  end\nend)\n`;
  return {
    id: "raceTimer",
    ask: { pl: [`Zrób pomiar czasu: start na linii, meta mierzy ile trwał bieg`, `Dodaj stoper wyścigu i ogłaszaj czas na czacie`], en: [`Add a race timer: start line begins timing and the finish announces the time`] },
    existing: [box("Linia startu", 0, 0.3, 0, 12, 0.6, 3, "#ffffff", { texture: "checker" }), box("Meta", 0, 0.3, -20, 12, 0.6, 3, "#ffd700", { texture: "checker" })], create: [],
    scripts: [{ name: "Stoper", source: src }],
    test: { seconds: 5, actions: [{ at: 0.5, type: "touch", target: "Linia startu" }, { at: 3, type: "touch", target: "Meta" }] },
    reply: { pl: `Gotowe! Dotknięcie "Linia startu" włącza stoper, a "Meta" ogłasza czas gracza na czacie.`, en: `Done! Touching the start line starts the clock; the finish announces the player's time.` },
    check: (res) => (res.chat.some((c) => c.includes("ukończył bieg")) ? null : "brak czasu"),
  };
};

const dayCycle: Maker = (r) => {
  const sec = r.pick([120, 180, 300, 600]);
  const src = `setDayCycle(${sec})\nsetHour(8)\n\nonPlayerJoin(function(player)\n  tell(player, "Doba trwa ${sec} sekund. Teraz godzina " .. round(getHour(), 0) .. ":00")\nend)\n`;
  return {
    id: "dayCycle",
    ask: { pl: [`Niech czas w grze płynie: pełna doba w ${sec} sekund, start o 8 rano`, `Zrób cykl dnia i nocy (${sec} s)`], en: [`Make time flow in the game: a full day lasts ${sec} seconds`] },
    existing: [], create: [],
    scripts: [{ name: "Cykl dnia", source: src }],
    test: { seconds: 2, actions: [] },
    reply: { pl: `Gotowe! Doba trwa ${sec} sekund (setDayCycle), gra startuje o 8:00, a nowi gracze dostają informację o godzinie.`, en: `Done! A day lasts ${sec} seconds, starting at 8:00, and joining players are told the time.` },
  };
};

const randomWeather: Maker = (r) => {
  const sec = r.pick([10, 15, 20, 30]);
  const src = `local pogody = {"clear", "rain", "storm", "snow"}\nlocal nazwy = {clear = "słonecznie", rain = "deszcz", storm = "burza", snow = "śnieg"}\n\nevery(${sec}, function()\n  local p = choice(pogody)\n  setWeather(p)\n  say("Pogoda się zmienia: " .. nazwy[p])\nend)\n`;
  return {
    id: "randomWeather",
    ask: { pl: [`Co ${sec} sekund losuj pogodę (słońce, deszcz, burza, śnieg) i ogłaszaj na czacie`, `Zrób losową zmianę pogody`], en: [`Pick a random weather every ${sec} seconds and announce it`] },
    existing: [], create: [],
    scripts: [{ name: "Losowa pogoda", source: src }],
    test: { seconds: Math.min(sec + 2, 40), actions: [] },
    reply: { pl: `Gotowe! Co ${sec} s pogoda zmienia się na losową (słonecznie/deszcz/burza/śnieg) i jest ogłaszana na czacie.`, en: `Done! Every ${sec} s the weather changes randomly and is announced.` },
    check: (res) => (res.chat.some((c) => c.includes("Pogoda się zmienia")) ? null : "pogoda się nie zmieniła"),
  };
};

const horror: Maker = (r) => {
  const dark = r.pick([0.1, 0.15, 0.2]);
  const src = `setHour(0)\nsetLight(${dark}, 70)\n\nevery(${r.pick([12, 20, 30])}, function()\n  flicker(nil, 2)\n  say("Coś szepcze w ciemności...")\nend)\n`;
  return {
    id: "horror",
    ask: { pl: [`Zrób klimat horroru: ciemno, mgła i latarki które czasem migają`, `Chcę straszną atmosferę - noc, mgła i migające światło`], en: [`Give the game a horror mood: dark, foggy, flickering flashlights`] },
    existing: [], create: [],
    scripts: [{ name: "Horror", source: src }],
    test: { seconds: 3, actions: [] },
    reply: { pl: `Gotowe! Ustawiłem północ, jasność ${dark} i mgłę 70. Co kilkanaście sekund latarki migają i pojawia się szept na czacie.`, en: `Done! Midnight, brightness ${dark}, fog 70, flickering flashlights and whispers in chat.` },
  };
};

const killStreak: Maker = () => {
  const src = `onDied(function(player, killer)\n  if killer ~= "" then\n    local k = findPlayer(killer)\n    if k then\n      addScore(k, 1)\n      tell(k, "Pokonałeś " .. playerName(player) .. "! +1 punkt")\n    end\n  end\nend)\n`;
  return {
    id: "killStreak",
    ask: { pl: [`Daj punkt graczowi, który pokona innego gracza`, `Dodaj punktację za pokonanie przeciwnika`], en: [`Give a point to the player who defeats another player`] },
    existing: [], create: [],
    scripts: [{ name: "Punkty za pokonanie", source: src }],
    test: { seconds: 2, actions: [] },
    reply: { pl: `Gotowe! Gdy gracz zginie z ręki innego, zabójca dostaje +1 punkt i wiadomość.`, en: `Done! When a player is defeated, the killer gets +1 point and a message.` },
  };
};

const respawnBoost: Maker = (r) => {
  const sec = r.pick([3, 5]);
  const src = `onRespawn(function(player)\n  setHealth(player, 100)\n  setSpeed(player, 28)\n  tell(player, "Ochrona po odrodzeniu: szybszy bieg przez ${sec} s")\n  after(${sec}, function()\n    setSpeed(player, 16)\n  end)\nend)\n`;
  return {
    id: "respawnBoost",
    ask: { pl: [`Po odrodzeniu gracz ma biec szybciej przez ${sec} sekund`, `Dodaj bonus po respawnie`], en: [`Give players a speed boost for ${sec} seconds after respawning`] },
    existing: [], create: [],
    scripts: [{ name: "Bonus po respawnie", source: src }],
    test: { seconds: 2, actions: [] },
    reply: { pl: `Gotowe! Po każdym odrodzeniu gracz ma pełne HP i szybszy bieg przez ${sec} s.`, en: `Done! After each respawn players have full HP and run faster for ${sec} s.` },
  };
};

const tips: Maker = (r) => {
  const sec = r.pick([10, 15, 20, 30]);
  const src = `local wskazowki = {\n  "Wskazówka: zbieraj monety, żeby kupić ulepszenia!",\n  "Wskazówka: uważaj na lawę!",\n  "Wskazówka: napisz /top, żeby zobaczyć ranking.",\n}\n\nevery(${sec}, function()\n  say(choice(wskazowki))\nend)\n`;
  return {
    id: "tips",
    ask: { pl: [`Co ${sec} sekund wysyłaj na czacie losową wskazówkę dla graczy`, `Dodaj automatyczne podpowiedzi na czacie`], en: [`Post a random tip in chat every ${sec} seconds`] },
    existing: [], create: [],
    scripts: [{ name: "Wskazówki", source: src }],
    test: { seconds: Math.min(sec + 2, 40), actions: [] },
    reply: { pl: `Gotowe! Co ${sec} sekund na czacie pojawia się jedna z trzech wskazówek.`, en: `Done! Every ${sec} seconds one of three tips appears in chat.` },
    check: (res) => (res.chat.some((c) => c.includes("Wskazówka")) ? null : "brak wskazówki"),
  };
};

const vip: Maker = () => {
  const src = `local vipy = {1001, 1002}\n\nonPlayerJoin(function(player)\n  if contains(vipy, getUserId(player)) then\n    tell(player, "Witaj VIP-ie!")\n    say("VIP " .. playerName(player) .. " dołączył")\n    setSpeed(player, 22)\n  end\nend)\n`;
  return {
    id: "vip",
    ask: { pl: [`Zrób listę VIP-ów po numerze konta: VIP dostaje powitanie i trochę szybszy bieg`, `Dodaj specjalne bonusy dla wybranych graczy (VIP)`], en: [`Add a VIP list by account id: VIPs get a greeting and a small speed boost`] },
    existing: [], create: [],
    scripts: [{ name: "VIP", source: src }],
    test: { seconds: 2, actions: [] },
    reply: { pl: `Gotowe! Numery kont w tabeli "vipy" dostają powitanie i prędkość 22. Wpisz tam swoje numery (getUserId).`, en: `Done! Account ids in the "vipy" table get a greeting and speed 22. Put your ids there.` },
    check: (res) => (res.chat.some((c) => c.includes("Witaj VIP")) ? null : "VIP nie rozpoznany"),
  };
};

const bounceFloor: Maker = (r) => {
  const j = r.pick([90, 120, 160]);
  const src = `onTouch("Odbijacz", function(player)\n  setJump(player, ${j})\n  tell(player, "Skacz!")\n  after(3, function()\n    setJump(player, 50)\n  end)\nend)\n`;
  return {
    id: "bounceFloor",
    ask: { pl: [`Zrób płytkę, po której skacze się dużo wyżej przez 3 sekundy`, `Dodaj odbijacz zwiększający skok do ${j}`], en: [`Add a pad that boosts jump height for 3 seconds`] },
    existing: [box("Odbijacz", 0, 0.3, -12, 8, 0.6, 8, "#ff4081", { material: "neon" })], create: [],
    scripts: [{ name: "Odbijacz", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Odbijacz" }] },
    reply: { pl: `Gotowe! "Odbijacz" ustawia siłę skoku ${j} na 3 sekundy, potem wraca normalne 50.`, en: `Done! "Odbijacz" sets jump power ${j} for 3 s, then back to 50.` },
    check: (res) => (res.chat.some((c) => c.includes("Skacz!")) ? null : "brak skoku"),
  };
};

const conveyor: Maker = (r) => {
  const dz = r.pick([0.6, 1, 1.5]);
  const src = `every(0.1, function()\n  local x, y, z = getPosition("Taśma")\n  for _, player in ipairs(playersNear(x, y, z, 8)) do\n    local px, py, pz = getPlayerPosition(player)\n    if py < y + 8 then\n      teleport(player, px, py, pz - ${dz})\n    end\n  end\nend)\n`;
  return {
    id: "conveyor",
    ask: { pl: [`Zrób taśmę, która przesuwa graczy do przodu`, `Dodaj ruchomy chodnik ("Taśma")`], en: [`Add a conveyor belt that moves players along`] },
    existing: [box("Taśma", 0, 0.3, 0, 8, 0.6, 30, "#455a64", { texture: "hazard" })], create: [],
    scripts: [{ name: "Taśma", source: src }],
    test: { seconds: 3, actions: [] },
    reply: { pl: `Gotowe! Gracze stojący na "Taśma" są przesuwani w kierunku -Z co 0.1 s.`, en: `Done! Players standing on "Taśma" are pushed along -Z every 0.1 s.` },
  };
};

const rankingAuto: Maker = (r) => {
  const sec = r.pick([30, 60, 120]);
  const src = `every(${sec}, function()\n  local lista = topPlayers(3)\n  if #lista == 0 then return end\n  local tekst = "TOP: "\n  for i, p in ipairs(lista) do\n    tekst = tekst .. i .. ". " .. playerName(p) .. " (" .. getScore(p) .. ")  "\n  end\n  say(tekst)\nend)\n`;
  return {
    id: "rankingAuto",
    ask: { pl: [`Co ${sec} sekund pokazuj na czacie trzech najlepszych graczy`, `Zrób automatyczny ranking co ${sec} s`], en: [`Show the top 3 players in chat every ${sec} seconds`] },
    existing: [], create: [],
    scripts: [{ name: "Automatyczny ranking", source: src }],
    test: { seconds: Math.min(sec + 2, 40), actions: [] },
    reply: { pl: `Gotowe! Co ${sec} s na czacie pojawia się TOP 3 graczy według punktów.`, en: `Done! Every ${sec} s the top 3 players by score appear in chat.` },
  };
};

const elevator: Maker = (r) => {
  const h = r.pick([20, 30, 40]);
  const src = `local jedzie = false\n\nonTouch("Przycisk windy", function(player)\n  if jedzie then return end\n  jedzie = true\n  tell(player, "Winda rusza!")\n  tweenMove("Winda", 0, ${h}, 0, 3)\n  after(8, function()\n    tweenMove("Winda", 0, -${h}, 0, 3)\n    after(4, function() jedzie = false end)\n  end)\nend)\n`;
  return {
    id: "elevator",
    ask: { pl: [`Zrób windę: przycisk wysyła ją ${h} w górę, po 8 sekundach wraca`, `Dodaj windę z przyciskiem`], en: [`Add an elevator: a button sends it up ${h} studs and it returns after 8 seconds`] },
    existing: [box("Winda", 0, 0.5, -20, 8, 1, 8, "#90a4ae"), box("Przycisk windy", 7, 0.8, -16, 2, 1.2, 2, "#e53935", { material: "neon" })], create: [],
    scripts: [{ name: "Winda", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Przycisk windy" }] },
    reply: { pl: `Gotowe! "Przycisk windy" unosi "Winda" o ${h} w 3 s, po 8 s zjeżdża z powrotem.`, en: `Done! The button lifts "Winda" ${h} studs in 3 s and sends it back after 8 s.` },
    check: (res) => (res.chat.some((c) => c.includes("Winda rusza")) ? null : "winda nie ruszyła"),
  };
};

export const MECHS2: Record<string, Maker> = {
  hudCoins, shopGui, startMenu, winGui, healZone, teams, fallingTiles, spinner, passwordDoor, keyDoor, lootBox, raceTimer, dayCycle, randomWeather, horror, killStreak, respawnBoost, tips, vip, bounceFloor, conveyor, rankingAuto, elevator,
};
void ({} as Mech);
