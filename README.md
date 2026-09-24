# 🟥 Predator

Klockowa gra-platforma w stylu Robloxa. Budujesz własne światy w edytorze, programujesz je w **Lua** albo **bloczkami** i grasz w nie ze znajomymi.
Działa w przeglądarce na komputerze, telefonie i tablecie, a do tego jako aplikacja **Windows (.exe)**, **Android (.apk)** i **iOS**.

Serwer uruchamiasz **na swojej maszynie**, bez Firebase i bez zewnętrznych usług. Konta, gry i monety są zapisywane lokalnie w bazie SQLite.

## Co już jest

| | |
|---|---|
| 🎮 **Gra** | chodzenie (WASD / joystick na ekranie), skakanie, kamera 3. i 1. osoby z kolizją ze ścianami, fizyka z rampami i schodkami, lawa, trampoliny, odradzanie się |
| ⚔️ **Narzędzia i bronie** | miecze, topory, młoty, pistolety, karabiny, blastery, różdżki, apteczki, mikstury i kawa (przyspieszenie); pasek narzędzi na dole ekranu (klawisze 1–9); narzędzia od startu w ekwipunku albo do podniesienia ze złotych pól; zdrowie, obrażenia, PvP |
| 🕺 **Animacje** | chodzenie, skok, spadanie, rozpadanie się po śmierci, trzymanie narzędzia, cios, strzał, picie/leczenie, mignięcie po trafieniu, emotki: machanie, taniec, wiwatowanie, wskazywanie, siadanie |
| 👥 **Multiplayer** | domyślnie 30 graczy na serwer gry, twórca może ustawić do 50; płynny ruch innych graczy, nicki nad głowami |
| 🧸 **Łatwe Studio** | zakładka **Zestaw** z gotowymi modelami (drzewo, dom, most, samochód, latarnia, zjeżdżalnia, meta…) wstawianymi jednym kliknięciem w wolne miejsce; części modelu przesuwają się, obracają i kopiują razem; **Zachowania** - kliknij „💰 Daje punkt”, „👻 Znika”, „↕️ Jeździ”, „🌀 Teleport”, „🚪 Drzwi”… i skrypt pisze się sam; szybkie kolory, wyszukiwarka obiektów, podpowiedzi na dole ekranu i przewodnik „Pierwsze kroki” (❓ Pomoc) |
| 🧱 **Studio** | dodawanie klocków, kul, walców, klinów, spawnów, lawy, trampolin i pól z narzędziami; przesuwanie i skalowanie z siatką, obracanie, kolory, materiały, cofanie (Ctrl+Z), edytor narzędzi i broni, włączanie PvP, publikowanie |
| 📜 **Skrypty Lua** | uruchamiane na serwerze w piaskownicy (nieskończona pętla nie zawiesi serwera), zdarzenia, `wait()`, punkty, teleporty |
| 🧩 **Bloczki** | programowanie jak w Scratchu (Blockly); bloczki zamieniają się w kod Lua |
| 💬 **Czat** | dymki nad głowami, filtr wulgaryzmów (PL + EN), ochrona przed spamem |
| 🧍 **Awatar** | ponad 100 przedmiotów: czapki (uszy kotka i króliczka, jednorożec, dinozaur, żabka, czapka ze śmigłem, kask astronauty…), twarze, **koszulki** (z kotkiem, dinozaurem, pizzą, tęczowa, galaktyka, bluzy z kapturem…), **spodnie** (jeansy, szorty, dres, tęczowe, piżama…), rzeczy na plecy (plecak z misiem, skorupa żółwia, peleryny, skrzydła, plecak odrzutowy) i na szyję; rzadkość przedmiotów, podgląd 3D |
| 🏅 **Odznaki** | twórca ustawia w Studio nagrody dla graczy: za wejście do gry albo ze skryptu (`awardBadge(player, "Nazwa")`), każda z nagrodą w monetach; każda nowa gra ma od razu odznakę „Witaj w grze!”; twórca dostaje premię i powiadomienie za kolejne progi wizyt (1, 10, 50, 100, 500, 1000…) |
| 👤 **Profil gracza** | awatar, data założenia konta, odznaki, grupy, ulubione gry (⭐ na stronie gry) i gry twórcy; dodawanie do znajomych, wiadomość, wymiana |
| 👥 **Grupy (klany)** | tworzenie grupy za 100 monet, logo (emotka + kolor), opis, członkowie z rolami (właściciel, zastępca), wyrzucanie, czat grupy |
| 🔒 **Prywatne serwery** | na stronie gry: własny serwer, na który wchodzą Twoi znajomi albo osoby z **kodem zaproszenia** (np. `TXW74Q`); nowy kod unieważnia stary |
| 🔁 **Wymiany i limitowane** | wymiana przedmiotów ze znajomymi (propozycja → przyjmij / odrzuć); limitowane przedmioty z licznikiem sztuk (np. „Diamentowe skrzydła” 25 sztuk) - po wyprzedaniu tylko przez wymianę |
| 💃 **Emotki w sklepie** | salto, bączek, oklaski, taniec robota, floss, ukłon, pajacyki, zombie - kupione są w menu 😀 w grze i pod `/e salto` |
| 🎤 **Czat głosowy** | w grze, tylko ze znajomymi, którzy też włączyli głos; wyciszanie siebie i innych, podświetlenie, kto mówi. Działa w aplikacji (.exe, APK) i na stronie przez https (przeglądarka nie da mikrofonu na zwykłym http w sieci lokalnej) |
| ⚑ **Zgłoszenia i kary** | zgłaszanie graczy, gier i grup z powodem; w panelu admina lista zgłoszeń z szybkimi karami: wyciszenie na czas (15 min – 30 dni, blokuje czat w grach, wiadomości i grupy), blokada konta, ukrycie gry, usunięcie grupy; historia działań adminów |
| 🛡 **Panel admina** | dla kont **piotrek53_3** i **Predator**: statystyki, szukanie graczy, dawanie monet i przedmiotów, zmiana hasła, blokowanie kont (z wyrzuceniem z gry), ukrywanie, usuwanie i przekazywanie gier, ogłoszenia dla wszystkich |
| 🧑‍🎤 **Postacie** | edytor postaci w Studio (kolory, twarz, czapka, skala, dodatki doczepione do części ciała), import modeli **.glb** (np. z Blendera, Mixamo), eksport/import **.pchar**; postacie jako NPC albo wygląd wszystkich graczy |
| 🎞 **Animacje** | edytor animacji z osią czasu i klatkami kluczowymi, gotowe szablony (machanie, disco, ukłon, siedzenie…); animacje jako emotki, na NPC albo ze skryptu |
| 📄 **Pliki .pgame** | gra zapisana w jednym pliku (JSON); dwuklik otwiera Predatora prosto w Studio, bez serwera; test gry offline ze skryptami |
| 🪙 **Monety** | 50 na start, codzienny bonus, monety za granie (limit dzienny), twórca dostaje monety, gdy ktoś wchodzi do jego gry; sklep z czapkami i twarzami |
| 🤝 **Znajomi** | zaproszenia, status online, „Dołącz” do gry, w którą gra znajomy |
| 📱 **Menu** | jasny wygląd jak w aplikacjach mobilnych: na telefonie dolny pasek (Strona główna, Hity, Awatar, Czat), na komputerze menu boczne; rząd znajomych, „Polecane dla ciebie” z miniaturkami gier, wyszukiwarka, powiadomienia z czerwoną kropką |
| 🔥 **Hity i oceny** | strona gry z dużym przyciskiem Graj, łapki w górę / w dół i „Ocena 93%”, listy: popularne, najlepiej oceniane, najczęściej odwiedzane, nowe |
| ✉️ **Czat ze znajomymi** | prywatne wiadomości poza grą, licznik nieprzeczytanych |
| 🖼 **Miniaturki** | zapis gry w Studio robi zdjęcie tego, co widać w edytorze, i ustawia je jako miniaturkę w menu |

## Uruchomienie serwera

Potrzebujesz **[Node.js 22.13 lub nowszego](https://nodejs.org)**.

- **Windows:** kliknij dwa razy `start-server.bat`
- **Linux / macOS:** `./start-server.sh`
- albo ręcznie: `npm install`, `npm run build`, `npm start`

Po starcie serwer wypisze adresy, np.:

```
🎮 Serwer Predator działa!
   Na tym komputerze:  http://localhost:2567
   W sieci lokalnej:   http://192.168.1.10:2567
```

- Na tym samym komputerze otwórz `http://localhost:2567` w przeglądarce.
- Na telefonie lub tablecie w tej samej sieci Wi-Fi otwórz adres „W sieci lokalnej”. Możesz też dodać grę do ekranu głównego, wtedy działa na pełnym ekranie.
- Jeśli telefon nie może się połączyć, zezwól na port **2567** w zaporze Windows.
- Żeby grali znajomi spoza Twojej sieci, przekieruj port 2567 na routerze albo użyj VPN, np. Tailscale.

Przy pierwszym uruchomieniu powstają przykładowe gry:

- **🏙️ Predator City**: gra społeczna. Prace w Ratuszu (policjant, lekarz, kucharz) z wypłatą co 30 s, kawiarnia z baristą, park ze stawem i trampoliną, klub disco z kolorowym parkietem i DJ-em, domy z otwieranymi drzwiami, cykl dnia i nocy, rozmowy z NPC. Komendy na czacie: `/pomoc`, `/praca`, `/kasa`.
- **⚔️ Arena**: miecz i pistolet na start, karabin, młot, apteczki i kawa do podniesienia.
- **🔥 Tor przeszkód**: skoki nad lawą ze skryptami.
- **🍕 Pizzeria Tycoon**: zajmij działkę, zarabiaj co sekundę i kupuj po kolei ściany, piec, stoły, dach, neon, fontannę i wieżę.
- **🙈 Chowany**: jeden gracz szuka z piankowym młotkiem (czeka 15 s w klatce), reszta chowa się w domach, szafach i krzakach. Runda 2 minuty.
- **🏎️ Wyścigi**: wszyscy startują razem; turbo, błoto, skocznia nad wodą, ruchome spychacze, 3 checkpointy i punkty za miejsca.
- **🗼 Wieża Piekieł**: spiralna wieża z 6 etapami (lawa, wąskie belki, bujające się i znikające płytki), bez checkpointów, runda 6 minut.

Te same gry są w folderze `games/` jako pliki `.pgame` (`npm run export-games` tworzy je od nowa).

### Ustawienia (zmienne środowiskowe)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `2567` | port serwera |
| `HOST` | `0.0.0.0` | na jakim adresie nasłuchiwać |
| `DATA_DIR` | `./data` | gdzie zapisywać bazę danych (zrób kopię tego folderu!) |
| `PREDATOR_PASSWORD` | (losowe) | hasło konta **Predator** |

**Konto Predator** serwer tworzy sam przy każdym starcie (jeśli go nie ma) i ustawia na nim wszystko: skórkę Predatora (Korona Predatora, Koszulka Predatora, Skrzydła Predatora), wszystkie przedmioty, milion monet i uprawnienia admina. Hasło bierze ze zmiennej `PREDATOR_PASSWORD`, a jeśli jej nie ma, wymyśla je przy pierwszym starcie i zapisuje w pliku `konto-predator.txt` w folderze danych. Lista adminów jest w `server/src/config.ts`.

Ilość monet za granie, dzienny limit i bonus zmienisz w `server/src/config.ts`.

## Aplikacje: EXE, APK i iOS

Aplikacje łączą się z Twoim serwerem. Przy pierwszym uruchomieniu wpisujesz jego adres, np. `192.168.1.10:2567`.

### Najprościej: GitHub Actions (nie potrzebujesz Maca)

W repozytorium na GitHubie wejdź w **Actions**, wybierz **„Zbuduj aplikacje”** i kliknij **Run workflow**.
Po kilkunastu minutach w sekcji *Artifacts* będą:

- **Predator-Windows**: instalator `.exe` i wersja portable
- **Predator-Android**: plik `.apk` do zainstalowania na telefonie (włącz „instalację z nieznanych źródeł”)
- **Predator-iOS**: `.ipa` bez podpisu. Na iPhone'a zainstalujesz go przez **AltStore** albo **Sideloadly** (podpiszą go Twoim Apple ID). Żeby wrzucić grę do App Store, potrzebne jest konto Apple Developer (99 $/rok).

To samo dzieje się automatycznie po wypchnięciu tagu, np. `git tag v0.1.0 && git push --tags`.

### Lokalnie

- **EXE (Windows):** `npm run build:app -w client`, potem `cd desktop`, `npm install`, `npm run dist:win`. Wynik trafia do `desktop/release/`. Gra jest wbudowana w aplikację, a pliki `.pgame` są z nią skojarzone.
- **APK (Android):** potrzebujesz Android Studio. Potem `cd client`, `npm run build:app`, `npx cap add android`, `npx cap open android`.
- **iOS:** tylko na Macu z Xcode: `cd client`, `npm run build:app`, `npx cap add ios`, `npx cap open ios`.

## Gry 2D

Oprócz gier 3D w Predatorze można robić **platformówki 2D** z obrazków (pixel art). Przy tworzeniu gry wybierz **Gra 2D**.
Gra 2D działa tak samo jak 3D: na serwerze z multiplayerem, w przeglądarce, na telefonie (joystick i przycisk skoku) i offline w Studio.

- **Poziomy:** każdy gracz może być na innym poziomie; widzi tylko graczy ze swojego poziomu.
- **Obiekty:** obrazek lub animacja (sprite), kafelki, napis, światło i niewidzialna strefa.
- **Zachowania bez kodu:** platforma, platforma przenikalna od dołu, drabina. Do tego: zabija, moneta (dla każdego osobno albo wspólna), checkpoint, przejście na inny poziom, potwór chodzący w lewo i prawo, przycisk i brama, start i miejsce odrodzenia.
- **Fizyka jak w GDevelop:** przyspieszanie, skok z przytrzymaniem, drabiny, ta sama grawitacja. Gry przeniesione z GDevelopa zachowują się tak samo.
- **Postacie:** sprite z animacjami (stoi, idzie, skacze, spada, wspina się, ginie). Postać może mieć **towarzysza**, który biegnie za graczem i powtarza jego ruchy (jak pies w Ludziku).
- **Ciemność i światła** (poziomy nocne), **napisy na ekranie** z `{coins}`, `{left}` i `{time}`, a także **czcionki bitmapowe** i dźwięki.
- **Skrypty Lua** z dodatkowymi funkcjami 2D:
  - poziomy i obiekty: `setLevel`, `playSound`, `setAnimation`, `countObjects`, `showFor`;
  - ruch i kamera: `setForce`, `lockCamera`, `autoWalk`;
  - gracze: `hidePlayer`, `restartLevel`.

  Pełna lista jest w oknie skryptu w Studio.
- **Import z GDevelopa:** Studio → Plik → „Importuj grę z GDevelopa (.zip)” (eksport HTML5). Przenosi sceny, obiekty, animacje, maski kolizji, dźwięki i światła. Logikę (zdarzenia) trzeba ustawić zachowaniami i w Lua.

### Ludzik 4

Gra **Ludzik 4** (z GDevelopa) jest przeniesiona do Predatora i serwer tworzy ją sam jako przykładową grę (`games/Ludzik 4.pgame`):

- **Level 1:** monety, ogień, potwór, drabiny, checkpoint, przyspieszenie, liana i Michael Jackson. Postać do wyboru w menu: Ludzik z psem, Ludzik, Pies albo Nero.
- **Level 1 część 2:** noc ze światłami, jazda w prawo.
- **Multiplayer:** mapa dla drużyny. Przyciski otwierają bramy, monety są wspólne, a po zebraniu wszystkich otwierają się drzwi. Zamiast serwerów GDevelopa działa multiplayer Predatora: wchodzisz z menu gry („Idź do poziomu”).

Twórcą gry jest **Fadnmade**. Jeśli konto o tym nicku już istnieje, serwer przy starcie przekazuje mu grę. Jeśli nie, gra trafia do tego, kto założy konto Fadnmade. Twórca może ją edytować w Studio i dostaje monety za wizyty. Listę gier z przypisanymi twórcami ustawisz w `server/src/creators.ts`.

Plik powstaje z oryginalnego zipa skryptem `npx tsx scripts/port-ludzik.ts game.zip`.

## Pliki gier .pgame i Studio bez serwera

Gra (świat, skrypty, narzędzia, postacie, animacje) zapisuje się do jednego pliku **`.pgame`**. W środku jest zwykły JSON, więc da się go też pisać albo poprawiać w edytorze tekstu:

```json
{ "format": "predator-game", "version": 1, "name": "Moja gra", "description": "…", "maxPlayers": 30,
  "data": { "parts": [ … ], "scripts": [ … ], "tools": [ … ], "characters": [ … ], "animations": [ … ], … } }
```

- **Dwuklik na plik `.pgame`** (aplikacja .exe) otwiera Predatora od razu w **Studio**, bez łączenia z serwerem. **Ctrl+S** zapisuje do tego samego pliku.
- **Bez serwera** możesz budować i **testować grę** (▶ Testuj). Skrypty Lua, narzędzia i zdrowie działają lokalnie. Nie działa multiplayer, publikowanie, monety ani znajomi.
- **Z serwerem** (po zalogowaniu): Studio → 📁 Plik → **☁ Wyślij na serwer** zamienia plik w grę na serwerze, którą można opublikować.
- W przeglądarce: ekran logowania → **„Studio bez serwera”** albo zakładka Twórz → **📂 Otwórz plik**. Zapis pobiera plik.
- Postacie zapisuje się osobno do plików **`.pchar`** (edytor postaci → 💾), żeby przenosić je między grami.

## Skrypty Lua: ściąga

Klocki wskazujesz **po nazwie**, którą ustawiasz w panelu Właściwości. Wszystkie klocki o tej samej nazwie reagują razem.

```lua
onPlayerJoin(function(player)
  say("Witaj " .. playerName(player) .. "!")
end)

onTouch("Meta", function(player)
  addScore(player, 1)
  teleport(player, 0, 5, 0)
end)

onChat(function(player, message)
  if message == "szybko" then setSpeed(player, 40) end
end)

every(1, function()
  setColor("Lampa", string.format("#%06x", math.random(0, 16777215)))
end)
```

| Funkcja | Co robi |
|---|---|
| `onPlayerJoin(fn)`, `onPlayerLeave(fn)`, `onRespawn(fn)` | zdarzenia gracza |
| `onTouch("Nazwa", fn)` | gracz dotknął klocka |
| `onChat(fn(player, message))` | gracz napisał na czacie |
| `every(s, fn)`, `after(s, fn)`, `wait(s)`, `time()` | czas |
| `say(tekst)`, `tell(player, tekst)`, `print(...)` | wiadomości (print pokazuje się w konsoli F9 twórcy) |
| `setColor`, `setPosition`, `move`, `setSize`, `setVisible`, `setTransparency`, `setCollide`, `getPosition` | klocki |
| `kill`, `teleport`, `playerName`, `getPlayers`, `getPlayerPosition`, `setSpeed`, `setJump` | gracze |
| `addScore`, `setScore`, `getScore` | ranking w prawym górnym rogu |
| `awardBadge(player, "Nazwa")` | daje graczowi odznakę ustawioną w Ustawieniach gry (raz na gracza, z nagrodą w monetach) |
| `onToolUse(fn(player, toolName))`, `onDied(fn(player, killer))` | użycie narzędzia, śmierć gracza (`killer` = `""`, gdy nikt nie zabił) |
| `giveTool`, `removeTool`, `hasTool` | ekwipunek (narzędzia po nazwie) |
| `damage`, `heal`, `getHealth`, `setHealth` | zdrowie (0–100) |
| `setCharacter(player, "Nazwa")` | wygląd gracza jako postać ze Studio (bez nazwy = własny awatar) |
| `playAnimation(player, "Nazwa")`, `stopAnimation(player)` | animacja z edytora animacji na graczu |
| `npcAnimation("NazwaKlocka", "Animacja")` | animacja NPC |
| `setSky("#0b1026")` | kolor nieba (np. noc) |

## Narzędzia i bronie

W Studio, w panelu **„Narzędzia i bronie”**, kliknij **+ Nowe** i wybierz gotowy szablon (miecz, pistolet, apteczka…) albo ustaw wszystko sam: rodzaj, wygląd, kolor, obrażenia, zasięg, czas odnowienia.

- **„Gracze mają je od startu”**: narzędzie jest w ekwipunku od razu po wejściu i po każdym odrodzeniu.
- **Dodaj → „Narzędzie do podniesienia”**: złote pole w świecie. Gracz dotyka go i dostaje narzędzie. Pole ukryte skryptem (`setVisible`) nic nie daje.
- **PvP** (Ustawienia gry) decyduje, czy bronie ranią innych graczy.
- Obrażenia, zasięg i czas odnowienia sprawdza serwer, więc nie da się ich oszukać w przeglądarce.

## Sterowanie

| | Komputer | Telefon / tablet |
|---|---|---|
| Ruch | WASD / strzałki | joystick po lewej |
| Skok | Spacja | przycisk po prawej |
| Kamera | przytrzymaj **prawy przycisk myszy** i ruszaj, kółko przybliża (FOV 70° jak w Robloxie) | przeciągnij palcem, szczypanie |
| Czat | Enter lub `/` | 💬 |
| Narzędzia | klawisze 1–9 (0 chowa), klik = użyj | dotknij ikonę na pasku, czerwony przycisk = użyj |
| Emotki | 😀 albo na czacie `/e dance`, `/e wave`, `/e cheer`, `/e point`, `/e sit` | 😀 |
| Reset postaci | R | ☰ → Zresetuj |
| Czułość kamery | ⚙ w menu albo ☰ → Ustawienia (suwak) | to samo |
| Konsola skryptów (twórca) | F9 | 🖥 |

**Studio:** 1/2/3 to narzędzia wybierz/przesuń/skaluj, R obraca, F pokazuje zaznaczony klocek, Delete usuwa, Ctrl+D duplikuje, Ctrl+Z/Y cofa i ponawia, Ctrl+S zapisuje. Kamera jak w Roblox Studio: przytrzymany **prawy przycisk** rozgląda się w miejscu, WASD i Q/E latają, **środkowy przycisk** przesuwa widok, kółko przybliża.

## Dla programistów

```
server/   serwer: Node.js + Colyseus (multiplayer) + Express (API) + SQLite
client/   gra: TypeScript + Babylon.js + Vite, Capacitor (Android/iOS)
desktop/  aplikacja na komputer (Electron) z wbudowaną grą
shared/   wspólne: logika gry (sim/GameSim), silnik Lua (fengari), fizyka, animacje, format .pgame
games/    przykładowe gry jako pliki .pgame
```

```bash
npm install
npm run dev        # serwer na :2567 + klient z hot-reload na :5173
npm test           # testy (Lua, fizyka, raycast, animacje, pliki .pgame, filtr czatu)
npm run typecheck
```
