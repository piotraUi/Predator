// Mechaniki Lua, część 3: skrypty ze stanem i okienkami - questy, sklep z zapisem, walka, poziomy, rzemiosło, tablice wyników.
import { box, pick, type Maker } from "./lua.ts";
import { guiBtn, guiText } from "./lua2.ts";

const coinPart = (name: string, x: number, z: number) => ({ name, shape: "cylinder" as const, x, y: 3, z, sx: 2.4, sy: 0.5, sz: 2.4, rz: 90, color: "#ffd700", material: "neon" as const, spin: true, collide: false });

const questGui: Maker = (r) => {
  const n = r.pick([3, 5, 8]);
  const reward = r.pick([20, 50, 100]);
  const gui = { name: "Zadanie", elements: [{ name: "Tło", type: "frame", x: 2, y: 14, w: 26, h: 12, bg: "#000000", bgOpacity: 0.55, radius: 12 }, guiText("Opis", `Zbierz ${n} monet: 0/${n}`, 2, 15, 26, 10, 24, "#ffffff")] };
  const coins = Array.from({ length: n }, (_, i) => coinPart(`Moneta${i + 1}`, -14 + i * 7, -25));
  const src = `local postep = {}\nlocal ukonczone = {}\n\nlocal function odswiez(player)\n  local p = postep[playerName(player)] or 0\n  setGuiText(player, "Zadanie", "Opis", "Zbierz ${n} monet: " .. p .. "/${n}")\nend\n\nonTouch("Zleceniodawca", function(player)\n  showGui(player, "Zadanie")\n  odswiez(player)\n  tell(player, "Zadanie: zbierz ${n} monet!")\nend)\n\nfor i = 1, ${n} do\n  local nazwa = "Moneta" .. i\n  onTouch(nazwa, function(player)\n    local kto = playerName(player)\n    if ukonczone[kto] then return end\n    postep[kto] = (postep[kto] or 0) + 1\n    setVisibleFor(player, nazwa, false)\n    odswiez(player)\n    if postep[kto] >= ${n} then\n      ukonczone[kto] = true\n      addScore(player, ${reward})\n      tell(player, "Zadanie wykonane! Nagroda: ${reward} punktów")\n    end\n  end)\nend\n`;
  return {
    id: "questGui",
    ask: { pl: [`Zrób zadanie od NPC: zbierz ${n} monet, licznik postępu na ekranie i nagroda ${reward} punktów`, `Dodaj questa z licznikiem GUI - NPC "Zleceniodawca" daje zadanie`], en: [`Add a quest: an NPC asks the player to collect ${n} coins, show progress on screen and reward ${reward} points`] },
    existing: [box("Zleceniodawca", 0, 3, -10, 3, 6, 3, "#8e6e53")],
    create: coins,
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Quest monet", source: src }],
    test: { seconds: 6, actions: [{ at: 0.5, type: "touch", target: "Zleceniodawca" }, ...coins.map((c, i) => ({ at: 1 + i * 0.4, type: "touch" as const, target: c.name }))] },
    reply: { pl: `Gotowe! Dotknięcie "Zleceniodawca" włącza zadanie i licznik "0/${n}". Po zebraniu ${n} monet gracz dostaje ${reward} pkt.`, en: `Done! Touching "Zleceniodawca" starts the quest and the counter. After ${n} coins the player gets ${reward} points.` },
    check: (res) => (res.chat.some((c) => c.includes("Zadanie wykonane")) ? null : "quest nie ukończony"),
  };
};

const persistentShop: Maker = (r) => {
  const price = r.pick([10, 25, 50]);
  const tool = pick(r, ["Miecz", "Pistolet"]);
  const gui = { name: "Sklep", modal: true, elements: [{ name: "Tło", type: "frame", x: 28, y: 25, w: 44, h: 50, bg: "#1e2a38", bgOpacity: 0.95, radius: 20 }, guiText("Tytuł", "Zbrojownia", 28, 28, 44, 10, 36), guiBtn("Kup", `Kup: ${tool} (${price} pkt)`, 33, 45, 34, 12, "#2e7d32"), guiBtn("Zamknij", "Zamknij", 38, 62, 24, 8, "#b71c1c", { type: "close" })] };
  const src = `onPlayerJoin(function(player)\n  if loadData(player, "kupiono_${tool}", false) then\n    giveTool(player, "${tool}")\n    tell(player, "Przywrócono: ${tool}")\n  end\nend)\n\nonTouch("Sprzedawca", function(player)\n  showGui(player, "Sklep")\nend)\n\nonGuiClick(function(player, gui, button)\n  if gui ~= "Sklep" or button ~= "Kup" then return end\n  if loadData(player, "kupiono_${tool}", false) then\n    tell(player, "Już to masz!")\n  elseif getScore(player) >= ${price} then\n    addScore(player, -${price})\n    saveData(player, "kupiono_${tool}", true)\n    giveTool(player, "${tool}")\n    tell(player, "Kupiono: ${tool}!")\n  else\n    tell(player, "Potrzebujesz ${price} punktów")\n  end\nend)\n`;
  return {
    id: "persistentShop",
    ask: { pl: [`Zrób sklep z bronią "${tool}" za ${price} punktów; zakup ma się zapisywać na stałe`, `Dodaj zbrojownię GUI: kupujesz ${tool.toLowerCase()} raz i masz go po powrocie do gry`], en: [`Add a shop that sells a ${tool} for ${price} points and remembers the purchase`] },
    existing: [box("Sprzedawca", 0, 3, -12, 3, 6, 3, "#6d4c41")],
    create: [],
    pre: [{ name: "save_tool", args: { name: tool, type: tool === "Pistolet" ? "ranged" : "melee", model: tool === "Pistolet" ? "pistol" : "sword", damage: 25, range: tool === "Pistolet" ? 120 : 8, cooldown: 0.6 } }, { name: "save_gui", args: gui }],
    scripts: [{ name: "Zbrojownia", source: src }],
    test: { seconds: 4, actions: [{ at: 0.5, type: "touch", target: "Sprzedawca" }, { at: 1.5, type: "gui_click", target: "Sklep", text: "Kup" }] },
    reply: { pl: `Gotowe! "Sprzedawca" otwiera sklep. ${tool} kosztuje ${price} pkt; zakup zapisuje się przez saveData i narzędzie wraca przy wejściu do gry.`, en: `Done! "Sprzedawca" opens the shop. The ${tool} costs ${price} points; the purchase is saved and restored on join.` },
    check: (res) => (res.chat.some((c) => c.includes("Potrzebujesz")) ? null : "sklep nie zareagował"),
  };
};

const healthGui: Maker = () => {
  const gui = { name: "Zdrowie", open: true, elements: [guiText("Pasek", "❤ 100", 40, 92, 20, 6, 30, "#ff8a80", "#000000")] };
  const src = `onPlayerJoin(function(player)\n  showGui(player, "Zdrowie")\nend)\n\nevery(0.5, function()\n  for _, player in ipairs(getPlayers()) do\n    setGuiText(player, "Zdrowie", "Pasek", "❤ " .. getHealth(player))\n  end\nend)\n\nonTouch("Trucizna", function(player)\n  if cooldown("trucizna" .. playerName(player), 1) then\n    damage(player, 30)\n    tell(player, "Auć! -30 HP")\n  end\nend)\n`;
  return {
    id: "healthGui",
    ask: { pl: [`Pokaż zdrowie gracza na ekranie (❤ i liczba) i zrób klocek "Trucizna", który zabiera 30 HP`, `Dodaj pasek życia w GUI, odświeżany co pół sekundy`], en: [`Show the player's health on screen and add a "Trucizna" part that deals 30 damage`] },
    existing: [box("Trucizna", 0, 0.3, -12, 10, 0.6, 10, "#76ff03", { material: "neon" })], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Pasek zdrowia", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Trucizna" }] },
    reply: { pl: `Gotowe! Na dole ekranu widać "❤ liczba", odświeżane co 0,5 s. "Trucizna" zabiera 30 HP (z ochroną co sekundę).`, en: `Done! A health readout updates every 0.5 s, and "Trucizna" deals 30 damage with a 1 s cooldown.` },
    check: (res) => (res.events.some((e) => e.includes("❤ 70")) ? null : "pasek zdrowia się nie zmienił"),
  };
};

const levels: Maker = (r) => {
  const per = r.pick([5, 10, 20]);
  const gui = { name: "Poziom", open: true, elements: [guiText("Napis", "Poziom 1", 2, 2, 16, 7, 28, "#ffe082", "#000000")] };
  const src = `local function poziom(player)\n  return math.floor(getScore(player) / ${per}) + 1\nend\n\nlocal function odswiez(player)\n  setGuiText(player, "Poziom", "Napis", "Poziom " .. poziom(player))\nend\n\nonPlayerJoin(function(player)\n  showGui(player, "Poziom")\n  local zapis = loadData(player, "punkty", 0)\n  setScore(player, zapis)\n  odswiez(player)\nend)\n\nonTouch("Trening", function(player)\n  local przed = poziom(player)\n  addScore(player, ${per})\n  saveData(player, "punkty", getScore(player))\n  odswiez(player)\n  if poziom(player) > przed then\n    tell(player, "Awansujesz na poziom " .. poziom(player) .. "!")\n    say(playerName(player) .. " ma teraz poziom " .. poziom(player))\n  end\nend)\n`;
  return {
    id: "levels",
    ask: { pl: [`Zrób system poziomów: co ${per} punktów awans, napis "Poziom N" na ekranie i zapis postępu`, `Dodaj levelowanie - klocek "Trening" daje ${per} punktów, awans ogłaszany na czacie`], en: [`Add a level system: every ${per} points is a level up, shown on screen and saved`] },
    existing: [box("Trening", 0, 1.5, -12, 4, 3, 4, "#42a5f5", { material: "neon" })], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Poziomy", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Trening" }] },
    reply: { pl: `Gotowe! Każde ${per} punktów to nowy poziom. "Trening" daje ${per} pkt, napis "Poziom N" się odświeża, awans jest ogłaszany, a postęp zapisuje się na stałe.`, en: `Done! Every ${per} points is a new level. "Trening" gives ${per} points, the label updates, level-ups are announced and progress is saved.` },
    check: (res) => (res.chat.some((c) => c.includes("Awansujesz")) ? null : "brak awansu"),
  };
};

const bossFight: Maker = (r) => {
  const hp = r.pick([5, 8, 10]);
  const gui = { name: "Boss", open: true, elements: [guiText("Pasek", `Boss: ${hp}/${hp}`, 35, 3, 30, 7, 30, "#ffffff", "#8e0000")] };
  const src = `local zycie = ${hp}\n\nonPlayerJoin(function(player)\n  showGui(player, "Boss")\nend)\n\nonTouch("Atak", function(player)\n  if zycie <= 0 then return end\n  if not cooldown("atak" .. playerName(player), 1) then return end\n  zycie = zycie - 1\n  setGuiText(nil, "Boss", "Pasek", "Boss: " .. zycie .. "/${hp}")\n  if zycie <= 0 then\n    setVisible("Boss", false)\n    say(playerName(player) .. " pokonał bossa!")\n    addScore(player, 100)\n  end\nend)\n`;
  return {
    id: "bossFight",
    ask: { pl: [`Zrób walkę z bossem: ${hp} uderzeń w "Atak", pasek życia bossa na ekranie, po pokonaniu ogłoszenie`, `Dodaj bossa z licznikiem życia w GUI`], en: [`Add a boss fight: ${hp} hits on "Atak", a boss health bar on screen and an announcement when defeated`] },
    existing: [box("Boss", 0, 6, -30, 10, 12, 10, "#b71c1c"), box("Atak", 0, 1, -22, 4, 2, 4, "#ff6f00", { material: "neon" })], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Boss", source: src }],
    test: { seconds: hp + 3, actions: Array.from({ length: hp }, (_, i) => ({ at: 0.5 + i * 1.1, type: "touch" as const, target: "Atak" })) },
    reply: { pl: `Gotowe! Każde dotknięcie "Atak" (co 1 s) zabiera bossowi 1 z ${hp} żyć, pasek na górze ekranu się zmienia, a po pokonaniu "Boss" znika i gracz dostaje 100 pkt.`, en: `Done! Each touch of "Atak" (1 s cooldown) takes 1 of ${hp} lives, the bar updates, and when he's down "Boss" disappears and the player gets 100 points.` },
    check: (res) => (res.chat.some((c) => c.includes("pokonał bossa")) ? null : "boss nie pokonany"),
  };
};

const teamScoreGui: Maker = () => {
  const gui = { name: "Wynik", open: true, elements: [guiText("Tablica", "Czerwoni 0 : 0 Niebiescy", 30, 2, 40, 7, 28, "#ffffff", "#000000")] };
  const src = `local wynik = {Czerwoni = 0, Niebiescy = 0}\n\nlocal function odswiez()\n  setGuiText(nil, "Wynik", "Tablica", "Czerwoni " .. wynik.Czerwoni .. " : " .. wynik.Niebiescy .. " Niebiescy")\nend\n\nonPlayerJoin(function(player)\n  if teamCount("Czerwoni") <= teamCount("Niebiescy") then setTeam(player, "Czerwoni") else setTeam(player, "Niebiescy") end\n  showGui(player, "Wynik")\n  odswiez()\nend)\n\nonTouch("Gol", function(player)\n  local d = getTeam(player)\n  if d and wynik[d] ~= nil then\n    wynik[d] = wynik[d] + 1\n    say("Punkt dla drużyny " .. d .. "!")\n    odswiez()\n  end\nend)\n`;
  return {
    id: "teamScoreGui",
    ask: { pl: [`Zrób drużyny Czerwoni i Niebiescy z tablicą wyniku na ekranie; trafienie w "Gol" daje punkt drużynie`, `Dodaj wynik meczu drużynowego w GUI`], en: [`Add red and blue teams with an on-screen scoreboard; touching "Gol" scores for your team`] },
    existing: [box("Gol", 0, 3, -30, 14, 6, 2, "#ffffff", { material: "neon" })], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Mecz drużynowy", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Gol" }] },
    reply: { pl: `Gotowe! Gracze są dzieleni na dwie drużyny, "Gol" daje punkt drużynie dotykającego, a tablica u góry ekranu pokazuje wynik.`, en: `Done! Players are split into two teams, "Gol" scores for the toucher's team and the scoreboard shows the result.` },
    check: (res) => (res.chat.some((c) => c.includes("Punkt dla drużyny")) ? null : "brak punktu"),
  };
};

const craftingStation: Maker = (r) => {
  const need = r.pick([3, 5]);
  const gui = { name: "Warsztat", modal: true, elements: [{ name: "Tło", type: "frame", x: 28, y: 28, w: 44, h: 44, bg: "#2b2118", bgOpacity: 0.95, radius: 20 }, guiText("Info", `Potrzeba ${need} drewna`, 28, 32, 44, 10, 30), guiBtn("Stwórz", "Stwórz siekierę", 34, 48, 32, 12, "#2e7d32"), guiBtn("Zamknij", "Zamknij", 38, 64, 24, 7, "#b71c1c", { type: "close" })] };
  const trees = Array.from({ length: need }, (_, i) => ({ name: `Drewno${i + 1}`, shape: "box" as const, x: -12 + i * 6, y: 1.2, z: -20, sx: 2.4, sy: 2.4, sz: 2.4, color: "#8d5a2b", collide: false }));
  const src = `local drewno = {}\n\nfor i = 1, ${need} do\n  local nazwa = "Drewno" .. i\n  onTouch(nazwa, function(player)\n    local kto = playerName(player)\n    drewno[kto] = (drewno[kto] or 0) + 1\n    setVisibleFor(player, nazwa, false)\n    tell(player, "Drewno: " .. drewno[kto] .. "/${need}")\n  end)\nend\n\nonTouch("Warsztat", function(player)\n  showGui(player, "Warsztat")\nend)\n\nonGuiClick(function(player, gui, button)\n  if gui ~= "Warsztat" or button ~= "Stwórz" then return end\n  local kto = playerName(player)\n  if (drewno[kto] or 0) >= ${need} then\n    drewno[kto] = drewno[kto] - ${need}\n    giveTool(player, "Siekiera")\n    tell(player, "Stworzono siekierę!")\n  else\n    tell(player, "Za mało drewna")\n  end\nend)\n`;
  return {
    id: "craftingStation",
    ask: { pl: [`Zrób rzemiosło: zbierz ${need} kawałków drewna, w "Warsztat" stwórz siekierę przyciskiem`, `Dodaj crafting - drewno do zebrania i okienko warsztatu`], en: [`Add crafting: collect ${need} pieces of wood, then craft an axe at the "Warsztat"`] },
    existing: [box("Warsztat", 0, 2, -10, 6, 4, 4, "#5d4037", { texture: "planks" })],
    create: trees,
    pre: [{ name: "save_tool", args: { name: "Siekiera", type: "melee", model: "axe", damage: 30, range: 8, cooldown: 0.8 } }, { name: "save_gui", args: gui }],
    scripts: [{ name: "Rzemiosło", source: src }],
    test: { seconds: 6, actions: [{ at: 0.5, type: "touch", target: "Warsztat" }, ...trees.map((t, i) => ({ at: 1 + i * 0.4, type: "touch" as const, target: t.name })), { at: 1 + need * 0.4 + 0.5, type: "gui_click", target: "Warsztat", text: "Stwórz" }] },
    reply: { pl: `Gotowe! Postawiłem ${need} kawałków drewna. Po zebraniu wszystkich przycisk "Stwórz siekierę" w warsztacie daje narzędzie "Siekiera".`, en: `Done! I placed ${need} pieces of wood. Once collected, the craft button at the workshop gives the "Siekiera" tool.` },
    check: (res) => (res.chat.some((c) => c.includes("Stworzono siekierę")) ? null : "nie stworzono"),
  };
};

const stageSave: Maker = (r) => {
  const k = r.pick([3, 4, 5]);
  const create = Array.from({ length: k }, (_, i) => box(`Etap${i + 1}`, 0, 0.4, -20 - i * 12, 8, 0.8, 8, ["#66bb6a", "#42a5f5", "#ffa726", "#ab47bc", "#ef5350"][i]));
  const src = `onPlayerJoin(function(player)\n  local etap = loadData(player, "etap", 0)\n  if etap > 0 then\n    local x, y, z = getPosition("Etap" .. etap)\n    teleport(player, x, y + 4, z)\n    tell(player, "Wracasz na etap " .. etap)\n  end\nend)\n\nfor i = 1, ${k} do\n  onTouch("Etap" .. i, function(player)\n    if i > loadData(player, "etap", 0) then\n      saveData(player, "etap", i)\n      tell(player, "Zapisano etap " .. i .. "/${k}")\n    end\n  end)\nend\n`;
  return {
    id: "stageSave",
    ask: { pl: [`Zapisuj etap w grze (${k} etapów): po powrocie gracz startuje na ostatnim zaliczonym`, `Zrób zapis postępu po etapach, żeby nie zaczynać od zera`], en: [`Save the player's stage (${k} stages) so they resume where they left off`] },
    existing: [], create,
    scripts: [{ name: "Etapy", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Etap1" }] },
    reply: { pl: `Gotowe! Postawiłem ${k} płytek "Etap1..${k}". Dotknięcie zapisuje najwyższy etap, a przy wejściu do gry gracz teleportuje się na ostatni.`, en: `Done! I placed ${k} stage pads. Touching one saves the highest stage and joining teleports the player back to it.` },
    check: (res) => (res.chat.some((c) => c.includes("Zapisano etap 1")) ? null : "brak zapisu"),
  };
};

const vending: Maker = (r) => {
  const price = r.pick([5, 10]);
  const src = `onTouch("Automat", function(player)\n  if not cooldown("automat" .. playerName(player), 3) then\n    tell(player, "Poczekaj chwilę")\n    return\n  end\n  if getScore(player) < ${price} then\n    tell(player, "Potrzebujesz ${price} punktów")\n    return\n  end\n  addScore(player, -${price})\n  local nagroda = choice({"heal", "speed", "jump"})\n  if nagroda == "heal" then\n    setHealth(player, 100)\n    tell(player, "Wyleczono do pełna!")\n  elseif nagroda == "speed" then\n    setSpeed(player, 28)\n    after(8, function() setSpeed(player, 16) end)\n    tell(player, "Szybszy bieg na 8 sekund!")\n  else\n    setJump(player, 80)\n    after(8, function() setJump(player, 50) end)\n    tell(player, "Wyższy skok na 8 sekund!")\n  end\nend)\n`;
  return {
    id: "vending",
    ask: { pl: [`Zrób automat: za ${price} punktów losowy bonus (leczenie, szybkość albo skok)`, `Dodaj losowy automat z bonusami`], en: [`Add a vending machine that sells a random bonus for ${price} points`] },
    existing: [box("Automat", 0, 4, -12, 4, 8, 3, "#e53935", { material: "neon", label: `${price} pkt` })], create: [],
    scripts: [{ name: "Automat", source: src }],
    test: { seconds: 3, actions: [{ at: 1, type: "touch", target: "Automat" }] },
    reply: { pl: `Gotowe! "Automat" kosztuje ${price} pkt i losuje: pełne zdrowie, szybszy bieg albo wyższy skok (8 s). Cooldown 3 s.`, en: `Done! "Automat" costs ${price} points and randomly gives full health, speed or a jump boost for 8 s.` },
    check: (res) => (res.chat.some((c) => c.includes("Potrzebujesz")) ? null : "automat nie zareagował"),
  };
};

const lobbyArena: Maker = (r) => {
  const sec = r.pick([5, 8, 10]);
  const src = `local trwa = false\n\nonTouch("Lobby", function(player)\n  if trwa then\n    tell(player, "Runda już trwa")\n    return\n  end\n  trwa = true\n  say("Start za ${sec} sekund!")\n  after(${sec}, function()\n    for _, p in ipairs(getPlayers()) do\n      local x, y, z = getPosition("Arena")\n      teleport(p, x, y + 4, z)\n    end\n    say("Walka rozpoczęta!")\n    after(30, function()\n      trwa = false\n      say("Koniec rundy")\n    end)\n  end)\nend)\n`;
  return {
    id: "lobbyArena",
    ask: { pl: [`Zrób lobby: wejście na "Lobby" odlicza ${sec} s i teleportuje wszystkich na arenę`, `Dodaj start rundy z lobby na "Arena" z odliczaniem`], en: [`Add a lobby: touching "Lobby" starts a ${sec} s countdown and teleports everyone to the "Arena"`] },
    existing: [box("Lobby", 0, 0.3, 0, 12, 0.6, 12, "#ffd54f"), box("Arena", 0, 0.3, -60, 40, 0.6, 40, "#78909c")], create: [],
    scripts: [{ name: "Lobby", source: src }],
    test: { seconds: sec + 3, actions: [{ at: 0.5, type: "touch", target: "Lobby" }] },
    reply: { pl: `Gotowe! Dotknięcie "Lobby" ogłasza start, po ${sec} s wszyscy lądują na "Arena", a po 30 s runda się kończy.`, en: `Done! Touching "Lobby" announces a start; after ${sec} s everyone lands on "Arena" and the round ends after 30 s.` },
    check: (res) => (res.chat.some((c) => c.includes("Walka rozpoczęta")) ? null : "brak przeniesienia"),
  };
};

const countdownGui: Maker = (r) => {
  const sec = r.pick([20, 30, 60]);
  const gui = { name: "Czas", open: true, elements: [guiText("Zegar", `Czas: ${sec}`, 42, 2, 16, 7, 32, "#ffffff", "#000000")] };
  const src = `local pozostalo = ${sec}\n\nonPlayerJoin(function(player)\n  showGui(player, "Czas")\nend)\n\nevery(1, function()\n  if pozostalo > 0 then\n    pozostalo = pozostalo - 1\n    setGuiText(nil, "Czas", "Zegar", "Czas: " .. pozostalo)\n    if pozostalo == 0 then\n      say("Czas minął! Wygrywa: " .. (topPlayers(1)[1] and playerName(topPlayers(1)[1]) or "nikt"))\n    end\n  end\nend)\n`;
  return {
    id: "countdownGui",
    ask: { pl: [`Pokaż na ekranie zegar odliczający ${sec} sekund; po zakończeniu ogłoś zwycięzcę`, `Dodaj licznik czasu w GUI i koniec gry po ${sec} s`], en: [`Show an on-screen countdown from ${sec} seconds and announce the winner at the end`] },
    existing: [], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Odliczanie", source: src }],
    test: { seconds: Math.min(sec + 2, 40), actions: [] },
    reply: { pl: `Gotowe! U góry ekranu jest zegar od ${sec} do 0. Gdy się skończy, na czacie pojawia się zwycięzca (najwięcej punktów).`, en: `Done! A countdown from ${sec} sits at the top of the screen; at zero the winner (highest score) is announced.` },
    check: (res) => (res.chat.some((c) => c.includes("Czas minął")) || sec > 38 ? null : "brak końca"),
  };
};

const topGui: Maker = (r) => {
  const sec = r.pick([3, 5]);
  const gui = { name: "Ranking", open: true, elements: [guiText("Lista", "TOP:", 78, 2, 20, 16, 22, "#ffffff", "#000000")] };
  const src = `onPlayerJoin(function(player)\n  showGui(player, "Ranking")\nend)\n\nevery(${sec}, function()\n  local tekst = "TOP:"\n  for i, p in ipairs(topPlayers(3)) do\n    tekst = tekst .. "\\n" .. i .. ". " .. playerName(p) .. " - " .. getScore(p)\n  end\n  setGuiText(nil, "Ranking", "Lista", tekst)\nend)\n\nonTouch("Punkty", function(player)\n  addScore(player, 5)\nend)\n`;
  return {
    id: "topGui",
    ask: { pl: [`Zrób tablicę rankingu w rogu ekranu (3 najlepszych), odświeżaną co ${sec} sekund`, `Dodaj ranking GUI - klocek "Punkty" daje 5 punktów`], en: [`Add an on-screen top-3 leaderboard refreshed every ${sec} seconds`] },
    existing: [box("Punkty", 0, 1, -12, 4, 2, 4, "#7e57c2", { material: "neon" })], create: [],
    pre: [{ name: "save_gui", args: gui }],
    scripts: [{ name: "Ranking GUI", source: src }],
    test: { seconds: sec + 3, actions: [{ at: 0.5, type: "touch", target: "Punkty" }] },
    reply: { pl: `Gotowe! W prawym górnym rogu pokazuje się TOP 3, odświeżany co ${sec} s. "Punkty" dają 5 pkt na próbę.`, en: `Done! A top-3 board appears in the top-right corner, refreshed every ${sec} s. "Punkty" gives 5 points for testing.` },
    check: (res) => (res.events.some((e) => e.includes("1. Gracz1 - 5")) ? null : "ranking się nie odświeżył"),
  };
};

const combatTool: Maker = (r) => {
  const dmg = r.pick([15, 25, 40]);
  const src = `onToolUse(function(player, toolName)\n  if toolName ~= "Pałka" then return end\n  local x, y, z = getPlayerPosition(player)\n  local cel, odleglosc = nearestPlayer(x, y, z, 12)\n  if cel and cel ~= player then\n    damage(cel, ${dmg})\n    tell(player, "Trafiłeś " .. playerName(cel) .. "!")\n    if getHealth(cel) <= 0 then addScore(player, 1) end\n  end\nend)\n\nonPlayerJoin(function(player)\n  giveTool(player, "Pałka")\nend)\n`;
  return {
    id: "combatTool",
    ask: { pl: [`Zrób walkę wręcz: każdy dostaje "Pałka", uderzenie rani najbliższego gracza w zasięgu 12 za ${dmg} HP`, `Dodaj system walki bronią "Pałka" z punktami za pokonanie`], en: [`Add melee combat: everyone gets a "Pałka" that damages the nearest player within 12 studs for ${dmg} HP`] },
    existing: [], create: [],
    pre: [{ name: "save_tool", args: { name: "Pałka", type: "melee", model: "hammer", damage: dmg, range: 8, cooldown: 0.8, starter: true } }],
    scripts: [{ name: "Walka", source: src }],
    test: { seconds: 2, actions: [] },
    reply: { pl: `Gotowe! Stworzyłem narzędzie "Pałka" (dostają je wszyscy). Jej użycie rani najbliższego gracza w promieniu 12 za ${dmg} HP, a pokonanie daje punkt.`, en: `Done! I created the "Pałka" tool for everyone. Using it hurts the nearest player within 12 studs for ${dmg} HP and a defeat gives a point.` },
  };
};

export const MECHS3: Record<string, Maker> = { questGui, persistentShop, healthGui, levels, bossFight, teamScoreGui, craftingStation, stageSave, vending, lobbyArena, countdownGui, topGui, combatTool };
