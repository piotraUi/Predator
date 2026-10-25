<!-- Plik wygenerowany przez scripts/build-skills.ts - nie edytuj ręcznie -->

# Funkcje Lua w grach 3D

Pełna lista funkcji dostępnych w skryptach gry. **Funkcji, których tu nie ma, nie ma w Predatorze** - nie wymyślaj ich. Opisy są po polsku, bo tak widzi je twórca w Studio.

## Zdarzenia

- `onPurchase(function(player, product) ... end)` — gracz coś kupił - product to nazwa produktu
- `onPlayerJoin(function(player) ... end)` — gdy gracz dołączy
- `onSit(function(player, seat) ... end)` — gracz usiadł na siedzeniu / wsiadł do pojazdu (typ klocka: Siedzenie / pojazd)
- `onUnsit(function(player, seat) ... end)` — gracz wstał / wysiadł
- `onPlayerLeave(function(player) ... end)` — gdy gracz wyjdzie
- `onTouch("Nazwa", function(player) ... end)` — gdy gracz dotknie klocka o tej nazwie
- `onChat(function(player, message) ... end)` — gdy gracz coś napisze
- `onRespawn(function(player) ... end)` — gdy gracz się odrodzi
- `onGuiClick(function(player, gui, button) ... end)` — gracz kliknął przycisk w GUI (nazwy z edytora GUI)
- `onClientEvent("nazwa", function(player, a, b) end)` — serwer: odbierz zdarzenie ze skryptu gracza (fireServer); do 5 argumentów
- `-- skrypt GRACZA (🎮): fireServer("nazwa", a) · onServerEvent("nazwa", function(a) end) · onKey("E", function() end) · showText("Cześć", 3) · localSay("tekst") · myPos() · setLightLocal(0.5, 200) · playSoundLocal("dźwięk")` — skrypty działające u gracza (wybierz 🎮 Gracz przy skrypcie w Studiu) - tylko efekty i klawisze, świat zmienia serwer
- `onToolUse(function(player, toolName) ... end)` — gdy gracz użyje narzędzia
- `onDied(function(player, killer) ... end)` — gdy gracz zginie (killer = "" gdy nikt)
- `onAnswer(function(player, id, text) end)` — gracz odpowiedział w okienku prompt
- `onBlockBreak(function(player, x, y, z, block) ... end)` — gracz wykopał blok
- `onBlockPlace(function(player, x, y, z, block) ... end)` — gracz postawił blok

## Czas i timery

- `every(sekundy, function() ... end)` — powtarzaj co X sekund
- `after(sekundy, function() ... end)` — zrób raz po X sekundach
- `wait(sekundy)` — czekaj (tylko wewnątrz funkcji)
- `time()` — sekundy od startu serwera
- `local t = every(2, f) · cancel(t)` — every i after zwracają uchwyt - cancel(uchwyt) kończy odliczanie / powtarzanie
- `cooldown("klucz", 3)` — true, jeśli minęły 3 s od ostatniego razu - ogranicza spam akcji
- `formatTime(sekundy) · formatNumber(n)` — "2:05" / "12 345"

## Gracze

- `teleportToPlace(player, "Arena")` — przenieś gracza do innego miejsca gry (Studio → Miejsca)
- `exitGame(player)` — wyjście gracza z gry (do strony głównej)
- `kill(player)` — zabij gracza
- `teleport(player, x, y, z)` — teleportuj gracza
- `playerName(player)` — nick gracza
- `getPlayers()` — lista wszystkich graczy
- `getPlayerPosition(player)` — zwraca x, y, z gracza
- `addScore(player, 1) / setScore / getScore` — punkty w rankingu gry
- `setSpeed(player, 16)` — prędkość chodzenia (norm. 16)
- `setJump(player, 50)` — siła skoku (norm. 50)
- `giveTool(player, "Miecz")` — daj narzędzie (po nazwie)
- `removeTool(player, "Miecz")` — zabierz narzędzie
- `hasTool(player, "Miecz")` — czy gracz ma narzędzie
- `damage(player, 20)` — zadaj obrażenia
- `heal(player, 20)` — ulecz
- `getHealth(player) / setHealth(player, 100)` — zdrowie (0-100)
- `setCharacter(player, "Zombie")` — zmień wygląd gracza na postać (bez nazwy = własny)
- `playAnimation(player, "Taniec")` — odtwórz animację na graczu
- `stopAnimation(player)` — zatrzymaj animację
- `getPlayerLook(player)` — kierunek patrzenia gracza: tabela {x, z}
- `tryOn(player, "hardhat")` — przymierz rzecz z katalogu (id przedmiotu) - tylko w tej grze, bez zmiany konta; zwraca true/false
- `takeOff(player, "hat")` — zdejmij rzecz: hair, hat, face, shirt, pants, back, neck
- `setAvatarColor(player, "torso", "#ff8800")` — kolor części ciała (head, torso, arms, legs) albo włosów (hairColor)
- `resetAvatar(player)` — przywróć wygląd z konta gracza
- `isOwner(player) / isAdmin(player)` — czy gracz jest właścicielem gry / administracją gry (właściciel, współtwórca, moderator Predatora)
- `getUserId(player)` — stały numer konta gracza (do własnych list banów, VIP-ów itp.)
- `kick(player, "powód")` — wyrzuć gracza z gry (nie działa na administrację gry)
- `setTeam(player, "Czerwoni") · getTeam(player) · teamPlayers("Czerwoni") · teamCount("Czerwoni") · clearTeams()` — drużyny graczy
- `playerCount() · findPlayer("nick") · tellAll("tekst")` — ilu graczy / znajdź gracza po nicku / wiadomość do wszystkich
- `playersNear(x, y, z, promień) · nearestPlayer(x, y, z, maks)` — lista graczy w pobliżu / najbliższy gracz (zwraca gracza i odległość)
- `topPlayers(3)` — najlepsi gracze wg punktów (lista)

## Klocki i obiekty

- `setColor("Nazwa", "#ff0000")` — zmień kolor klocka
- `setPosition("Nazwa", x, y, z)` — przestaw klocek
- `move("Nazwa", dx, dy, dz)` — przesuń klocek o tyle
- `setSize("Nazwa", sx, sy, sz)` — zmień rozmiar
- `setVisible("Nazwa", true/false)` — pokaż / ukryj (i wyłącz kolizję)
- `setTransparency("Nazwa", 0.5)` — przezroczystość 0-1
- `setCollide("Nazwa", false)` — czy można przez niego przechodzić
- `getPosition("Nazwa")` — zwraca x, y, z klocka
- `tweenPart("Nazwa", x, y, z, 1.5)` — przesuń klocek płynnie w tyle sekund (np. taśma, winda)
- `tweenMove("Nazwa", 0, 10, 0, 2)` — przesuń płynnie o tyle (wszystkie klocki o tej nazwie razem)
- `setPhysics("Kula", true, 0.6)` — fizyka bryły: klocek spada, odbija się (0-1) i można go popychać (maks. 100 takich klocków)
- `pushPart("Kula", 0, 40, 30)` — kopnij klocek z fizyką (prędkość x, y, z)
- `setRotation("Nazwa", 90)` — obróć klocek / NPC wokół osi pionowej (stopnie) - np. żeby patrzył w stronę ruchu
- `setLabel("Nazwa", "Kup: 50 💰")` — napis nad klockiem (pusty tekst = bez napisu)
- `npcAnimation("Barista", "Machanie")` — animacja NPC (po nazwie klocka)
- `setVisibleFor(player, "Moneta", false)` — pokaż / ukryj klocek tylko dla jednego gracza
- `getSize("Nazwa")` — zwraca sx, sy, sz klocka
- `getColor("Nazwa") / getTransparency("Nazwa") / getRotation("Nazwa") / getLabel("Nazwa")` — kolor, przezroczystość, obrót, napis klocka (nil gdy nie ma takiego klocka)
- `partExists("Nazwa")` — czy jest klocek o tej nazwie

## Okienka (GUI)

- `promptPurchase(player, "VIP")` — okienko zakupu produktu ze sklepu gry (Ustawienia gry → Sklep gry)
- `showGui(player, "Menu")` — pokaż GUI graczowi (nil = wszystkim); hideGui / toggleGui tak samo
- `setGuiText(player, "Licznik", "Napis", "⭐ 5")` — zmień napis w GUI (nil = wszystkim)
- `isGuiOpen(player, "Menu")` — czy GUI jest otwarte u gracza
- `speak(player, "Cześć!", "pl-PL")` — przeczytaj tekst na głos ("en-US" = po angielsku)
- `prompt(player, "pytanie1", "Ile to 2+2?")` — okienko z pytaniem - odpowiedź przychodzi do onAnswer

## Dźwięk, światło, niebo

- `setSky("#102040")` — kolor nieba (np. noc)
- `playSound(player, "nazwa")` — zagraj dźwięk graczowi ("" = wszystkim) - Ustawienia gry → Dźwięki
- `setMusic("nazwa")` — muzyka w tle (drugi argument: tylko dla gracza)
- `setSkyFor(player, "#000000")` — kolor nieba tylko dla jednego gracza
- `flicker(player, 2)` — latarka gracza mruga przez 2 s (bez gracza = wszystkim)
- `setSkybox("night")` — gotowe niebo: day, cloudy, sunset, dawn, night, aurora, space, storm, candy, hell ("" = zwykły kolor)
- `setSkybox("space", player)` — gotowe niebo tylko dla jednego gracza
- `setHour(21.5)` — pora dnia w grze 3D (0-24; 12 = południe, 0 = północ) - niebo, słońce, księżyc i gwiazdy zmieniają się płynnie (silnik Apex)
- `setDayCycle(300)` — doba trwa 300 sekund i czas płynie sam (0 = czas stoi); getHour() podaje godzinę
- `setWeather("rain")` — pogoda: clear, rain (deszcz), snow (śnieg), storm (burza z piorunami); getWeather()
- `setWind(0.8)` — siła wiatru 0-1 (znosi deszcz, kołysze trawę i drzewa)
- `setLight(0.2, 60, player)` — jasność i mgła (bez gracza = dla wszystkich)

## Zapis i sklep

- `saveData(player, "monety", 10)` — zapisz postęp gracza (zostaje po wyjściu z gry): liczba, tekst albo true/false
- `loadData(player, "monety", 0)` — wczytaj zapis gracza (0 = gdy jeszcze nic nie ma)
- `deleteData(player, "monety")` — usuń zapis
- `ownsProduct(player, "VIP")` — czy gracz ma kupiony produkt (kupowany raz, na zawsze)
- `openShop(player)` — otwórz graczowi cały sklep gry
- `awardBadge(player, "Nazwa odznaki")` — daj graczowi odznakę (Ustawienia gry → Odznaki)
- `saveGlobal("rekord", 120) / loadGlobal("rekord", 0)` — dane całej gry (wspólne dla wszystkich graczy i serwerów), np. rekord wszech czasów

## Świat z bloków

- `getBlock(x, y, z)` — świat z bloków: blok na pozycji (współrzędne bloków, y = 0 to dno) - np. "stone", "air"
- `setBlock(x, y, z, "glass")` — postaw / zmień blok ("air" = usuń)
- `blockAt(x, y, z)` — blok pod punktem świata (np. pozycją gracza): b = blockAt(...) - b[1], b[2], b[3]
- `getSurface(x, z)` — wysokość najwyższego bloku w kolumnie
- `giveItem(player, "diamond", 3)` — daj przedmiot (bloki, diamond, iron_ingot, apple, wood_pickaxe, diamond_sword…)
- `takeItem(player, "coal", 1) / countItem(player, "coal")` — zabierz przedmiot (false = za mało) / ile ma
- `setTime(0.25) / getTime() / isNight()` — pora dnia: 0 wschód, 0.25 południe, 0.5 zachód, 0.75 północ
- `spawnMob("zombie", x, y, z)` — stwórz moba: zombie, creeper, pig, sheep, cow
- `explode(x, y, z, 3)` — wybuch jak TNT (promień w blokach)

## Miejsca i pokoje

- `openRooms(player, "Arena", 4)` — okno pokoi (multiplayer): lista, tworzenie i dołączanie; w pokoju gra się na tym poziomie / w tym miejscu
- `getRoom()` — nazwa pokoju, w którym działa serwer ("" = zwykły serwer gry)
- `getPlace()` — nazwa miejsca, w którym działa ten serwer

## Matematyka i narzędzia

- `clamp(x, a, b) · lerp(a, b, t) · round(x, miejsca) · sign(x)` — matematyka
- `distance(x1, z1, x2, z2) · distance3(x1, y1, z1, x2, y2, z2)` — odległość
- `choice(lista) · shuffle(lista) · contains(lista, wartość)` — losowy element / pomieszaj listę / czy lista zawiera

## Inne

- `say("tekst")` — wiadomość do wszystkich
- `tell(player, "tekst")` — wiadomość do jednego gracza
- `print("tekst")` — wypisz w konsoli (F9 w grze)
- `fireClient(player, "nazwa", a, b)` — serwer: wyślij zdarzenie do skryptów gracza (player = nil: do wszystkich)
