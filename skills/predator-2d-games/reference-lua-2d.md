<!-- Plik wygenerowany przez scripts/build-skills.ts - nie edytuj ręcznie -->

# Funkcje Lua w grach 2D

Pełna lista funkcji dostępnych w skryptach gry. **Funkcji, których tu nie ma, nie ma w Predatorze** - nie wymyślaj ich. Opisy są po polsku, bo tak widzi je twórca w Studio.

## Zdarzenia

- `onPurchase(function(player, product) ... end)` — gracz coś kupił - product to nazwa produktu
- `onTouch("Obiekt", function(player) ... end)` — gdy gracz dotknie obiektu (nazwa obiektu albo instancji)
- `onLevelEnter(function(player, level) ... end)` — gdy gracz wejdzie na poziom
- `onPlayerJoin(function(player) ... end)` — gdy gracz dołączy
- `onDied(function(player) ... end)` — gdy gracz zginie
- `onChat(function(player, message) ... end)` — gdy gracz coś napisze
- `onGuiClick(function(player, gui, button) ... end)` — gracz kliknął przycisk w GUI (nazwy z edytora GUI)
- `onAnswer(function(player, id, text) ... end)` — gracz odpowiedział w okienku prompt

## Czas i timery

- `every(sekundy, function() ... end)` — powtarzaj co X sekund
- `after(sekundy, function() ... end)` — zrób raz po X sekundach
- `wait(sekundy)` — czekaj (tylko wewnątrz funkcji)
- `local t = every(2, f) · cancel(t)` — every i after zwracają uchwyt - cancel(uchwyt) kończy odliczanie / powtarzanie
- `cooldown("klucz", 3)` — true, jeśli minęły 3 s od ostatniego razu - ogranicza spam akcji

## Gracze

- `setLevel(player, "Poziom 2")` — przenieś gracza na poziom
- `chooseCharacter(player, "Nero")` — wybór postaci gracza (jak w menu postaci) - np. z własnego menu gry
- `exitGame(player)` — wyjście gracza z gry (do strony głównej)
- `getLevel(player)` — nazwa poziomu gracza
- `getPlayersOnLevel("Poziom 1")` — lista graczy na poziomie
- `setSpeed(player, 400) / setJump(player, 500)` — prędkość biegu / siła skoku
- `setPlayerAnimation(player, "walk", "Bieg")` — podmień animację (idle, walk, jump, fall, climb)
- `resetPlayerAnimations(player)` — przywróć animacje postaci
- `setForce(player, 500)` — stała siła w prawo (jazda); 0 = koniec
- `jump(player)` — podskok
- `lockCamera(player, x, y) / unlockCamera(player)` — zatrzymaj kamerę
- `autoWalk(player, 1)` — idź sam w prawo (-1 w lewo, 0 stop)
- `hidePlayer(player, true) / isHidden(player)` — schowaj gracza (np. wyszedł drzwiami)
- `getCoins / setCoins / addCoins(player, 1)` — monety gracza (licznik {coins})
- `teleport(player, x, y) / kill(player)` — przenieś / zabij
- `setCharacter(player, "Pies")` — zmień postać (bez nazwy = wybrana)
- `addScore(player, 1)` — punkty w rankingu
- `setTeam(player, "Czerwoni") · getTeam(player) · teamPlayers("Czerwoni") · teamCount("Czerwoni") · clearTeams()` — drużyny graczy
- `playerCount() · findPlayer("nick") · tellAll("tekst") · topPlayers(3)` — gracze: ilu / po nicku / wiadomość do wszystkich / najlepsi wg punktów

## Klocki i obiekty

- `setAnimation("Drzwi", "Otwarte")` — zmień animację obiektu
- `setText("Napis", "tekst")` — zmień napis
- `hideObject("Most") / showObject("Most")` — schowaj / pokaż obiekt (dla wszystkich)
- `moveObject("Boss", x, y, 0.5)` — przesuń obiekt płynnie w X sekund (0 = od razu)
- `flipObject("Boss", true)` — odwróć obiekt w poziomie (false = z powrotem)
- `showFor(player, "Moneta")` — przywróć zebrane przez gracza rzeczy
- `countObjects("Moneta", "Poziom 1")` — ile widocznych obiektów
- `createObject("Potwor", x, y, "Poziom 1")` — stwórz obiekt
- `deleteObject("Potwor")` — usuń obiekt

## Okienka (GUI)

- `promptPurchase(player, "VIP")` — okienko zakupu produktu ze sklepu gry (Ustawienia gry → Sklep gry)
- `showGui(player, "Menu")` — pokaż GUI graczowi (nil = wszystkim); hideGui / toggleGui tak samo
- `setGuiText(player, "Licznik", "Napis", "⭐ 5")` — zmień napis w GUI (nil = wszystkim)
- `isGuiOpen(player, "Menu")` — czy GUI jest otwarte u gracza
- `prompt(player, "kod", "Wpisz kod")` — okienko z pytaniem - odpowiedź przychodzi do onAnswer

## Dźwięk, światło, niebo

- `playSoundAt("nazwa", x, y, z)` — dźwięk 3D w punkcie świata: cichnie z odległością, ściana go tłumi, a w zamkniętym pomieszczeniu ma pogłos (silnik Apex)
- `playSound("nazwa", player)` — zagraj dźwięk (bez player = wszystkim)
- `effect("fire", x, y, z, ilość)` — efekt cząsteczkowy (silnik Apex): fire, smoke, sparks, magic, dust, splash, flash, hit
- `setBackground("#102040")` — kolor tła

## Zapis i sklep

- `saveData(player, "monety", 10)` — zapisz postęp gracza (zostaje po wyjściu z gry): liczba, tekst albo true/false
- `loadData(player, "monety", 0)` — wczytaj zapis gracza (0 = gdy jeszcze nic nie ma)
- `deleteData(player, "monety")` — usuń zapis
- `ownsProduct(player, "VIP")` — czy gracz ma kupiony produkt (kupowany raz, na zawsze)
- `openShop(player)` — otwórz graczowi cały sklep gry
- `awardBadge(player, "Nazwa odznaki")` — daj graczowi odznakę (Ustawienia gry → Odznaki)
- `saveGlobal("rekord", 120) / loadGlobal("rekord", 0)` — dane całej gry (wspólne dla wszystkich graczy), np. rekord wszech czasów

## Miejsca i pokoje

- `openRooms(player, "Multiplayer", 3)` — okno pokoi (multiplayer): lista, tworzenie i dołączanie; w pokoju gra się na tym poziomie (3 = maks. graczy w nowym pokoju)
- `getRoom()` — nazwa pokoju, w którym działa serwer ("" = zwykły serwer gry)

## Matematyka i narzędzia

- `clamp(x, a, b) · lerp(a, b, t) · round(x, miejsca) · sign(x) · distance(x1, y1, x2, y2)` — matematyka
- `choice(lista) · shuffle(lista) · contains(lista, wartość) · formatTime(s) · formatNumber(n)` — listy i formatowanie

## Inne

- `say("tekst") / tell(player, "tekst")` — wiadomość do wszystkich / do gracza
- `restartLevel("Poziom 1")` — zacznij poziom od nowa (dla wszystkich na nim)
- `print("tekst")` — wypisz w konsoli
