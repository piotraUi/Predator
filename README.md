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
| 🤖 **Asystent AI (Gemini)** | przycisk **AI** w Studio 2D i 3D: napisz, co zrobić, a agent sam buduje mapę, obiekty, skrypty Lua, GUI, miejsca i poziomy, testuje grę w symulacji i poprawia błędy; obrazki w czacie (📎); całą prośbę cofa Ctrl+Z - [więcej](#asystent-ai-w-studio-gemini) |
| 🧱 **Studio** | dodawanie klocków, kul, walców, klinów, spawnów, lawy, trampolin i pól z narzędziami; przesuwanie i skalowanie z siatką, obracanie, kolory, materiały, cofanie (Ctrl+Z), edytor narzędzi i broni, włączanie PvP, publikowanie |
| 🛠 **Studio - praca z wieloma klockami** | zaznaczanie kilku naraz (Shift / Ctrl + klik, ramka myszką, Ctrl + A, na telefonie przycisk „Wiele”); przesuwanie i obracanie całego zaznaczenia gizmem, strzałkami i PageUp / PageDown; łączenie w model (Ctrl + G); wyrównywanie i równe odstępy; wspólny kolor, materiał, przezroczystość i kolizja; kopiowanie wielu obiektów (także do innej gry); **🔁 Powiel w rzędzie** (płoty, schody, kolumny); **⬇ Na ziemię** (End); blokada (L) i chowanie w Studio (H) z Eksploratora; siatka na ziemi (G), widok z góry (T), cała mapa (Home), obrys klocka pod kursorem, pasek stanu i lista skrótów (?) |
| 🪟 **GUI (2D i 3D)** | edytor GUI w Studio (przycisk **🪟 GUI**): menu, okienka, liczniki, napisy, przyciski, ramki i obrazki na ekranie gracza; przeciąganie i zmiana rozmiaru na podglądzie 16:9; gotowe szablony (menu z przyciskiem Graj, okienko z OK, licznik w rogu); przycisk bez skryptu może zamknąć GUI, otworzyć inne, przenieść na poziom 2D albo do miejsca 3D; GUI widoczne od startu, tylko na wybranym poziomie / w miejscu, z przyciemnieniem gry (wtedy postać stoi); skrypty: `showGui`, `hideGui`, `toggleGui`, `setGuiText`, `isGuiOpen`, `onGuiClick` i bloczki w kategorii „GUI”; napisy i obrazki przechodzą przez filtr i moderację |
| 🗺 **Miejsca (places) w grach 3D** | jedna gra może mieć kilka map (np. Menu, Lobby, Arena) - przycisk **🗺 Miejsca** i lista miejsc na pasku Studio; każde miejsce ma własny serwer, klocki, niebo i skrypty (skrypt działa w wybranym miejscu albo „wszędzie”); przejście skryptem `teleportToPlace(player, "Arena")`, bloczkiem albo przyciskiem GUI; miejsce startowe (⭐) i **miejsce tylko na GUI** (menu gry: bez postaci i sterowania, kamera powoli krąży); test ze Studio zaczyna się w edytowanym miejscu |
| 🪟 **Poziomy menu w grach 2D** | poziom oznaczony „Poziom menu / GUI” nie ma postaci ani sterowania, kamera stoi (na starcie albo w „Kamera stoi w X / Y”) - z GUI z przyciskiem „Idź na poziom” robisz menu główne gry |
| 📸 **Wygoda** | **F2** w grze zapisuje zrzut ekranu (2D i 3D), **Ctrl + F** w Studio szuka obiektu, telefon w Predator City ma własny model 📱 |
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

## Asystent AI w Studio (Gemini)

W Studio 2D i 3D jest przycisk **🤖 AI**. Twórca pisze po polsku, co chce zrobić (np. „zrób tor przeszkód z lawą i metą”, „dodaj menu startowe z przyciskiem Graj”, „sprawdź moje skrypty i napraw błędy”), a asystent sam to robi w otwartej grze:

- ogląda grę (klocki, poziomy, obiekty, skrypty, GUI, zaznaczenie i miejsce, na które patrzy kamera),
- buduje i zmienia klocki (3D) albo obiekty i instancje na poziomach (2D, z prostą grafiką rysowaną od razu albo z dołączonego obrazka),
- pisze skrypty Lua (kod jest sprawdzany przed zapisem; błąd wraca do asystenta, który go poprawia),
- robi GUI, miejsca (3D), poziomy (2D), narzędzia, odznaki, ustawienia gry i fizykę,
- **testuje grę w symulacji** (gracze dotykają klocków, piszą na czacie, klikają GUI) i naprawia błędy, które zobaczy.

Każdą zmianę widać od razu, a całą prośbę cofa jedno **Ctrl+Z**. Do wiadomości można dołączyć obrazki 📎 (szkic mapy, grafika postaci) - asystent je widzi i może użyć jako grafiki w grze albo w GUI. Działa też przy wspólnej edycji (zmiany idą do innych twórców jak zwykłe).

Gemini działa przez Google Cloud (Vertex AI). Admin wgrywa **plik klucza JSON** w panelu admina → **AI** (instrukcja jest tam po kliknięciu „Jak zrobić plik klucza JSON”):

1. console.cloud.google.com → wybierz projekt → **APIs & Services → Enable APIs** → „Vertex AI API” → Enable.
2. **IAM & Admin → Service Accounts → Create service account** (np. `predator-ai`), rola **Vertex AI User**.
3. To konto → **Keys → Add key → Create new key → JSON** - pobierze się plik.
4. Panel admina → AI → **Wgraj plik klucza JSON** → **Sprawdź połączenie**.

Plik zostaje tylko na serwerze (`data/gemini-key.json`, prawa 600) i nie trafia do aplikacji ani do repozytorium. W tej samej zakładce: model główny (domyślnie `gemini-3.8-flash`), szybki model do czatu i nicków (domyślnie `gemini-3.5-flash-lite`), region, włączanie asystenta, dzienny limit kroków na twórcę (admini bez limitu) i dzisiejsze zużycie. Ten sam klucz przełącza moderację na Gemini.

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
- **🍭 Fabryka Słodyczy Tycoon**: 6 fabryk. Dropery zrzucają cukierki na taśmę, a ulepszacze ×2 i ×3 mnożą ich wartość. Pakowarka zamienia cukierki na pieniądze w kasie. Kupujesz 17 rzeczy, a przyciski z cenami pojawiają się po kolei. Na końcu cukierkowa rakieta i odrodzenie (+50% kasy na zawsze). Postęp się zapisuje, a w sklepie gry jest „Podwójna kasa”.
- **🍕 Pizzeria Tycoon**: zajmij działkę, zarabiaj co sekundę i kupuj po kolei ściany, piec, stoły, dach, neon, fontannę i wieżę.
- **🙈 Chowany**: jeden gracz szuka z piankowym młotkiem (czeka 15 s w klatce), reszta chowa się w domach, szafach i krzakach. Runda 2 minuty.
- **🏎️ Wyścigi**: wszyscy startują razem; turbo, błoto, skocznia nad wodą, ruchome spychacze, 3 checkpointy i punkty za miejsca.
- **🗼 Wieża Piekieł**: spiralna wieża z 6 etapami (lawa, wąskie belki, bujające się i znikające płytki), bez checkpointów, runda 6 minut.

Gry przeniesione z paczki GamesToadd (oryginalnie strony w three.js), teraz jako gry Predatora z multiplayerem:

- **🌮 Tacos World**: biegaj po wielkiej tortilli i zbieraj kręcące się tacos (model 3D z oryginału), muzyka i chrupanie, ranking.
- **🔦 Tunnel Escape**: horror w ciemnych tunelach z latarką. Znajdź 3 klucze (każdy gracz swoje) i dojdź do wyjścia, a potwór cię goni (szuka najkrótszej drogi w labiryncie). Pistolet od startu, amunicję trzeba znaleźć. Dwa poziomy.
- **🐝 Spelling Bee**: pszczoła czyta słowo (angielskie albo polskie), a ty wpisujesz je w okienku. Pola zmieniają poziom trudności, po 5 błędach zaczyna się tryb koszmaru, a po 10 walka z Królową Os. Działają tajne kody z oryginału (`nyan`, `obra`, `burger`, `beaver`, `blue`).

Przenosi je skrypt `npm run port-games` (kod w `scripts/ports/`). Duża muzyka leży w `server/assets/games/` i serwer udostępnia ją pod `/game-assets/`.

Te same gry są w folderze `games/` jako pliki `.pgame` (`npm run export-games` tworzy je od nowa).

### Ustawienia (zmienne środowiskowe)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `2567` | port serwera |
| `HOST` | `0.0.0.0` | na jakim adresie nasłuchiwać |
| `DATA_DIR` | `./data` | gdzie zapisywać bazę danych (zrób kopię tego folderu!) |
| `PREDATOR_PASSWORD` | (losowe) | hasło konta **Predator** |
| `GOOGLE_APPLICATION_CREDENTIALS` | (brak) | ścieżka do pliku klucza Gemini (JSON konta usługi); zwykle wygodniej wgrać plik w panelu admina → AI |
| `GEMINI_MODEL` | `gemini-3.8-flash` | główny model Gemini: asystent, gry, obrazki, dźwięki (można też zmienić w panelu admina → AI) |
| `GEMINI_FAST_MODEL` | `gemini-3.5-flash-lite` | szybki model do czatu i nicków (bez „myślenia”) |
| `GEMINI_LOCATION` | `global` | region Vertex AI |
| `GROQ_API_KEY` | (brak) | klucz Groq do moderacji AI (można też wpisać w panelu admina → Moderacja) |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` | model do sprawdzania tekstu i obrazków |
| `GROQ_AUDIO_MODEL` | `whisper-large-v3` | model zamieniający dźwięki i piosenki na tekst |

**Konto Predator** serwer tworzy sam przy każdym starcie (jeśli go nie ma) i ustawia na nim wszystko: skórkę Predatora (Korona Predatora, Koszulka Predatora, Skrzydła Predatora), wszystkie przedmioty, milion monet i uprawnienia admina. Hasło bierze ze zmiennej `PREDATOR_PASSWORD`, a jeśli jej nie ma, wymyśla je przy pierwszym starcie i zapisuje w pliku `konto-predator.txt` w folderze danych. Lista adminów jest w `server/src/config.ts`.

Ilość monet za granie, dzienny limit i bonus zmienisz w `server/src/config.ts`.

### Serwer w chmurze (Google Cloud, Linux)

Na świeżej maszynie z Ubuntu 24.04 (np. Google Cloud e2-standard-2 w regionie Warszawa, zapora: HTTP i HTTPS):

```bash
git clone https://TWÓJ_TOKEN@github.com/piotraUi/Predator.git
sudo bash Predator/scripts/setup-linux-server.sh
```

Skrypt pyta o nazwę i token **DuckDNS** (darmowy adres `nazwa.duckdns.org`) oraz opcjonalnie o klucz Groq. Instaluje Node.js 22 i Caddy (darmowy certyfikat HTTPS), ustawia serwer jako usługę, która startuje sama po restarcie maszyny, i odświeża adres DuckDNS co 5 minut. Gra jest potem pod `https://nazwa.duckdns.org` (to samo wpisujesz w aplikacjach). Logi: `sudo journalctl -u predator -f`.

### Aktualizacje i kopie zapasowe

- **Aktualizacja serwera:** Panel admina → **Serwer** → „Sprawdź aktualizacje” → „Aktualizuj i uruchom ponownie”. Serwer robi kopię bazy, pobiera nową wersję (`git pull`) i sam się uruchamia ponownie. Działa, gdy serwer był pobrany przez `git clone` i uruchomiony przez `start-server.bat` / `start-server.sh`. Bez panelu: `update-server.bat` / `update-server.sh`, a potem ponowne uruchomienie serwera.
- **Aplikacje graczy aktualizują się same:** po aktualizacji serwera aplikacja (exe, APK, iOS) przy starcie pobiera nową wersję gry z serwera (`/app-update`). Nowy exe czy APK jest potrzebny tylko wtedy, gdy zmienia się sama „skorupa” aplikacji.
- **Kopie zapasowe bazy:** codziennie i przed każdą aktualizacją w `data/backups` (14 ostatnich). Ręcznie i do pobrania: Panel admina → Serwer.

### Bezpieczeństwo graczy

- **Filtr czatu** łapie wulgaryzmy także pisane „kombinowanie” (k.u.r.w.a, kuuurwa, k u r w a, ch*j, cyfry zamiast liter, litery z innych alfabetów). Nicki z przekleństwami są blokowane przy rejestracji.
- **Blokowanie:** na profilu gracza albo w grze (przycisk 👥). Zablokowany nie pisze, nie zaprasza, nie jest słyszalny na czacie głosowym, a jego wiadomości na czacie gry są ukryte.
- **Zgłaszanie z gry i z czatu głosowego (🚩):** administrator dostaje zgłoszenie razem z ostatnimi wiadomościami z czatu tej gry.
- **Prywatność** (Ustawienia): kto może zapraszać do znajomych, pisać, zapraszać do gier i widzieć, w co grasz.
- **Moderacja AI (Gemini albo Groq), tylko na serwerze:** gdy jest klucz Gemini, sprawdza Gemini - także obrazki i dźwięki / piosenki (słucha ich sam, bez Whisper). W panelu admina → Moderacja można przełączyć na Groq. czat w grach, wiadomości prywatne i czat grup są sprawdzane, zanim trafią do innych. Po 3 zablokowanych wiadomościach w godzinę gracz ma czat wyłączony na 10 minut. Sprawdzane są też nicki i nazwy grup, serwerów oraz modeli. Opublikowane gry są sprawdzane po każdym zapisie: nazwa, opis, napisy w skryptach, odznaki, produkty, obrazki i miniaturka (model z widzeniem) oraz dźwięki i piosenki (Whisper zamienia je na tekst, a potem tekst jest sprawdzany). Gra z problemem jest ukrywana, a twórca dostaje powiadomienie z powodem. Po poprawce i zapisie sprawdza się jeszcze raz i publikuje sama. Każdy tekst, obrazek i dźwięk jest sprawdzany tylko raz (wynik zostaje w bazie). Gdy Groq nie odpowiada, działa zwykły filtr słów. Klucz, włączanie, próbę i dziennik zablokowanych treści znajdziesz w panelu admina → **Moderacja**. Klucz zostaje na serwerze i nigdy nie trafia do aplikacji graczy. Czat głosowy nie jest sprawdzany (dźwięk idzie bezpośrednio między graczami), na niego jest przycisk 🚩.
- **Ochrona przed oszustami:** serwer sprawdza ruch graczy (prędkość, teleport, latanie). Niemożliwy ruch jest cofany, a uporczywi oszuści są automatycznie zgłaszani i wyrzucani z gry.

## Aplikacje: EXE, APK i iOS

Aplikacje same łączą się z serwerem **https://playpredator.duckdns.org** (adres w `client/src/api.ts`, `DEFAULT_SERVER`). Inny serwer wpisujesz na ekranie logowania, np. `192.168.1.10:2567` albo `mojserwer.duckdns.org` (nazwa domeny = https).

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
- **Tło poziomu:** w ustawieniach poziomu (zakładka „🖼 Tło”) kolor i obrazek tła, bez stawiania obiektu na planszy. Obrazek można ułożyć na kilka sposobów: wypełnić ekran, pokazać w całości, rozciągnąć, ułożyć kafelki na całym ekranie albo pas kafelków w poziomie. Kafelki mogą przesuwać się wolniej niż świat (parallax). Tło widać w Studio i w grze.
- **Obrót i przezroczystość:** obrócone obiekty mają obróconą kolizję (deska obrócona o 90° to ściana), a każdy obiekt może być półprzezroczysty.
- **Studio 2D:**
  - zaznaczanie wielu obiektów (Shift + klik, ramka, Ctrl + A), przesuwanie całej grupy, wyrównywanie i równe odstępy;
  - kopiuj / wklej (także między poziomami) i malowanie obiektem przez przeciąganie;
  - obrót o 90° (R), odbicie (F) i blokada obiektów (L), widoczna siatka;
  - pasek stanu z pozycją kursora, przybliżeniem i przyciskiem „cały poziom”;
  - wyszukiwarka obiektów i lista skrótów (⌨).
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

### Ludzik 3 & Nero

Druga gra Fadnmade (`games/Ludzik 3 & Nero.pgame`). Serwer też tworzy ją sam i przekazuje twórcy:

- **Poziomy 1-10:** trampoliny, beczki, cylindry, lód, kolce i monety. Tabliczka „koniec” albo drzwi prowadzą dalej.
- **Postacie:** Ludzik, Nero albo Pies do wyboru w menu (☰). W GDevelopie każdy poziom był trzy razy, tu jest raz.
- **Walka z Gigantem:** trzeba przetrwać jego ataki. Dotknięcie Giganta zaczyna walkę od nowa.
- **Lot przez kosmos:** widok z góry i kamienie do rozbijania.
- **Druga walka:** po wygranej gracz dostaje odznakę „Pogromca Giganta”.

Ruchy Giganta (czasy, przesunięcia, animacje, dźwięki) skrypt portu odczytuje prosto z kodu wyeksportowanej gry. Plik powstaje skryptem `npx tsx scripts/port-ludzik3.ts gra.zip`.

Nowe rzeczy w silniku 2D, których używa ta gra:

- zachowanie **Trampolina** (wyrzuca gracza z zadaną siłą przez sekundę, jak siły w GDevelopie);
- `moveObject` / `flipObject` w Lua (płynne przesuwanie i odwracanie obiektów);
- stała kamera w poziomie lub pionie na danym poziomie.

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

-- GUI: menu z przyciskiem "Graj" i licznik (zrobione w edytorze GUI)
onGuiClick(function(player, gui, button)
  if gui == "Menu" and button == "Graj" then
    hideGui(player, "Menu")
    showGui(player, "Licznik")
  end
end)
setGuiText(player, "Licznik", "Napis", "⭐ " .. getScore(player))

-- gry 3D z kilkoma miejscami
onTouch("Portal", function(player) teleportToPlace(player, "Arena") end)
say("Ten serwer to: " .. getPlace())

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
| `playSound(player, "nazwa")`, `setMusic("nazwa", player)` | dźwięki i muzyka (Ustawienia gry → Dźwięki); `""` zamiast gracza = wszyscy |
| `speak(player, "tekst", "pl-PL")` | czytanie na głos (`"en-US"` po angielsku) |
| `prompt(player, "id", "Pytanie?")`, `onAnswer(fn(player, id, text))` | okienko z pytaniem i odpowiedź gracza |
| `setVisibleFor(player, "Nazwa", false)` | klocek widoczny / ukryty tylko dla jednego gracza |
| `getPlayerLook(player)` | kierunek patrzenia gracza `{x, z}` |
| `setSkyFor(player, "#000000")`, `setLight(jasność, mgła, player)` | niebo, jasność i mgła (np. horror); w Ustawieniach gry jest też 🔦 latarka |
| `awardBadge(player, "Nazwa")` | daje graczowi odznakę ustawioną w Ustawieniach gry (raz na gracza, z nagrodą w monetach) |
| `onToolUse(fn(player, toolName))`, `onDied(fn(player, killer))` | użycie narzędzia, śmierć gracza (`killer` = `""`, gdy nikt nie zabił) |
| `giveTool`, `removeTool`, `hasTool` | ekwipunek (narzędzia po nazwie) |
| `damage`, `heal`, `getHealth`, `setHealth` | zdrowie (0–100) |
| `setCharacter(player, "Nazwa")` | wygląd gracza jako postać ze Studio (bez nazwy = własny awatar) |
| `playAnimation(player, "Nazwa")`, `stopAnimation(player)` | animacja z edytora animacji na graczu |
| `npcAnimation("NazwaKlocka", "Animacja")` | animacja NPC |
| `setSky("#0b1026")` | kolor nieba (np. noc) |
| `flicker(player, 2)` | latarka gracza mruga przez 2 s (bez gracza = wszystkim); w Ustawieniach gry: „⚡ Latarka czasem mruga” |
| `setSkybox("night")`, `setSkybox("space", player)` | gotowe niebo: `day`, `cloudy`, `sunset`, `dawn`, `night`, `aurora`, `space`, `storm`, `candy`, `hell` (`""` = zwykły kolor); w Studio: Gra → Niebo |

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

### Pad (Xbox, PlayStation 4, PlayStation 5)

Pady działają w przeglądarce, w exe i w aplikacjach na Androida i iOS (Bluetooth albo kabel). Obsługiwane są pady Xbox (One / Series), **PlayStation 5 (DualSense i DualSense Edge)**, PlayStation 4 (DualShock 4) i inne. Gdy przeglądarka nie zna układu przycisków DualSense / DualShock (np. Firefox), gra przestawia je sama. Po podłączeniu pada w grze pojawia się podpowiedź, a przy obrażeniach pad wibruje (gdy przeglądarka na to pozwala).

| | Xbox | PlayStation |
|---|---|---|
| Ruch | lewa gałka (w 2D też krzyżak) | lewa gałka (w 2D też krzyżak) |
| Skok | A | ✕ |
| Kamera (3D) | prawa gałka | prawa gałka |
| Użyj narzędzia (3D) | RT (trzymaj = seria) | R2 |
| Zmiana narzędzia (3D) | LB / RB, krzyżak ← → | L1 / R1, krzyżak ← → |
| Przybliżenie (3D) | krzyżak ↑ ↓, prawa gałka (klik) = pierwsza osoba | krzyżak ↑ ↓, R3 = pierwsza osoba |
| Wsiądź / wysiądź (3D) | X | □ |
| W dół w wodzie (3D) | B | ○ |
| Emotki (3D) | Y | △ |
| Menu | Menu (☰) | Options |
| W menu i oknach GUI | krzyżak / gałka wybiera, A klika, B zamyka | krzyżak / gałka wybiera, ✕ klika, ○ zamyka |

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
