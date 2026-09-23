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
| 🧱 **Studio** | dodawanie klocków, kul, walców, klinów, spawnów, lawy, trampolin i pól z narzędziami; przesuwanie i skalowanie z siatką, obracanie, kolory, materiały, cofanie (Ctrl+Z), edytor narzędzi i broni, włączanie PvP, publikowanie |
| 📜 **Skrypty Lua** | uruchamiane na serwerze w piaskownicy (nieskończona pętla nie zawiesi serwera), zdarzenia, `wait()`, punkty, teleporty |
| 🧩 **Bloczki** | programowanie jak w Scratchu (Blockly); bloczki zamieniają się w kod Lua |
| 💬 **Czat** | dymki nad głowami, filtr wulgaryzmów (PL + EN), ochrona przed spamem |
| 🧍 **Awatar** | kolory ciała, czapki i twarze, podgląd 3D |
| 🪙 **Monety** | 50 na start, codzienny bonus, monety za granie (limit dzienny), twórca dostaje monety, gdy ktoś wchodzi do jego gry; sklep z czapkami i twarzami |
| 🤝 **Znajomi** | zaproszenia, status online, „Dołącz” do gry, w którą gra znajomy |

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

Przy pierwszym uruchomieniu powstają przykładowe gry: **„Tor przeszkód”** ze skryptami i **„Arena”** z mieczem i pistoletem na start oraz karabinem, młotem, apteczkami i kawą do podniesienia.

### Ustawienia (zmienne środowiskowe)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `2567` | port serwera |
| `HOST` | `0.0.0.0` | na jakim adresie nasłuchiwać |
| `DATA_DIR` | `./data` | gdzie zapisywać bazę danych (zrób kopię tego folderu!) |

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

- **EXE (Windows):** `cd desktop`, `npm install`, `npm run dist:win`. Wynik trafia do `desktop/release/`.
- **APK (Android):** potrzebujesz Android Studio. Potem `cd client`, `npm run build:app`, `npx cap add android`, `npx cap open android`.
- **iOS:** tylko na Macu z Xcode: `cd client`, `npm run build:app`, `npx cap add ios`, `npx cap open ios`.

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
| `onToolUse(fn(player, toolName))`, `onDied(fn(player, killer))` | użycie narzędzia, śmierć gracza (`killer` = `""`, gdy nikt nie zabił) |
| `giveTool`, `removeTool`, `hasTool` | ekwipunek (narzędzia po nazwie) |
| `damage`, `heal`, `getHealth`, `setHealth` | zdrowie (0–100) |

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
| Kamera | przeciągnij myszą, kółko przybliża | przeciągnij palcem, szczypanie |
| Czat | Enter lub `/` | 💬 |
| Narzędzia | klawisze 1–9 (0 chowa), klik = użyj | dotknij ikonę na pasku, czerwony przycisk = użyj |
| Emotki | 😀 albo na czacie `/e dance`, `/e wave`, `/e cheer`, `/e point`, `/e sit` | 😀 |
| Reset postaci | R | ☰ → Zresetuj |
| Konsola skryptów (twórca) | F9 | 🖥 |

**Studio:** 1/2/3 to narzędzia wybierz/przesuń/skaluj, R obraca, F pokazuje zaznaczony klocek, Delete usuwa, Ctrl+D duplikuje, Ctrl+Z/Y cofa i ponawia, Ctrl+S zapisuje. WASD i Q/E przesuwają kamerę, prawy przycisk myszy przesuwa widok.

## Dla programistów

```
server/   serwer: Node.js + Colyseus (multiplayer) + Express (API) + SQLite + Lua (fengari)
client/   gra: TypeScript + Babylon.js + Vite, Capacitor (Android/iOS)
desktop/  aplikacja na komputer (Electron)
shared/   typy i logika wspólna dla klienta i serwera
```

```bash
npm install
npm run dev        # serwer na :2567 + klient z hot-reload na :5173
npm test           # testy (silnik Lua, fizyka, raycast, filtr czatu)
npm run typecheck
```
