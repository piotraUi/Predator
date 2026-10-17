// Wiedza i rozmowa: słowniczek (co to hulajnoga, checkpoint, tycoon...), swobodne prośby budowania ("chcę jeździć na hulajnodze")
// oraz zwykły czat po polsku (powitania, żarty, pomoc w Lua, porady dla twórców gier).
import { Rng } from "./core.ts";
import { Session } from "./session.ts";
import { buildOne, decorate, pickLang, sampleSingle, toPart, type Sample } from "./samples.ts";
import { stripPl } from "./lang.ts";
import type { Lang } from "./requests.ts";

export interface Term {
  /** nazwa główna i odmiany używane w pytaniach */
  pl: string;
  aliases?: string[];
  en: string;
  /** krótka definicja (1-2 zdania) po polsku i angielsku */
  defPl: string;
  defEn?: string;
  /** id budowli, którą asystent może zaproponować i zbudować */
  build?: string;
}

const T = (pl: string, en: string, defPl: string, defEn?: string, build?: string, aliases?: string[]): Term => ({ pl, en, defPl, defEn, build, aliases });

export const TERMS: Term[] = [
  T("hulajnoga", "scooter", "Hulajnoga to pojazd z deską do stania, dwoma kółkami i kierownicą. Odpycha się od ziemi nogą (albo napędza silnikiem).", "A scooter is a ride with a standing deck, two wheels and handlebars that you push along with one foot.", "scooter", ["hulajnoge", "hulajnogi"]),
  T("rower", "bicycle", "Rower to pojazd z dwoma kołami, ramą, siodełkiem i kierownicą, napędzany pedałami.", "A bicycle has two wheels, a frame, a seat and handlebars, and is driven by pedals.", "bicycle"),
  T("deskorolka", "skateboard", "Deskorolka to deska na czterech kółkach, na której stoi się i jeździ, odpychając się nogą.", "A skateboard is a board on four wheels that you stand on and push along.", "skateboard"),
  T("motocykl", "motorcycle", "Motocykl to dwukołowy pojazd z silnikiem, bakiem i kierownicą.", "A motorcycle is a two-wheeled vehicle with an engine, a fuel tank and handlebars.", "motorcycle", ["motor"]),
  T("samolot", "airplane", "Samolot to pojazd latający ze skrzydłami, kadłubem i silnikami, który startuje z pasa.", "An airplane is a flying vehicle with wings, a fuselage and engines.", "airplane"),
  T("helikopter", "helicopter", "Helikopter to maszyna latająca z wirnikiem na górze. Potrafi zawisnąć w powietrzu i lądować pionowo.", "A helicopter is an aircraft with a rotor on top that can hover and land vertically.", "helicopter", ["śmigłowiec"]),
  T("pociąg", "train", "Pociąg to lokomotywa z wagonami, która jeździ po szynach.", "A train is a locomotive pulling carriages along rails.", "train"),
  T("autobus", "bus", "Autobus to duży pojazd drogowy do przewozu wielu pasażerów.", "A bus is a large road vehicle that carries many passengers.", "bus"),
  T("rakieta", "rocket", "Rakieta to pojazd kosmiczny z silnikami odrzutowymi, który wynosi ładunek w kosmos.", "A rocket is a spacecraft with jet engines that lifts cargo into space.", "rocket"),
  T("czołg", "tank", "Czołg to ciężki pojazd opancerzony na gąsienicach z armatą w obrotowej wieży (w grach zwykle w wersji kreskówkowej).", "A tank is a heavy armored vehicle on tracks with a cannon in a turret (cartoon-style in games).", "tank"),
  T("UFO", "UFO", "UFO to latający spodek - w grach i filmach statek kosmitów.", "A UFO is a flying saucer, the spaceship of aliens in games and movies.", "ufo", ["latający talerz"]),
  T("statek piracki", "pirate ship", "Statek piracki to żaglowiec z masztem, żaglami i czarną banderą.", "A pirate ship is a sailing ship with masts, sails and a black flag.", "pirateShip"),
  T("łódź", "boat", "Łódź to mały pojazd pływający po wodzie, napędzany wiosłami, żaglem lub silnikiem.", "A boat is a small vehicle that floats on water.", "boat", ["łódka"]),
  T("samochód", "car", "Samochód to czterokołowy pojazd z silnikiem do jazdy po drogach.", "A car is a four-wheeled motor vehicle for driving on roads.", "car", ["auto"]),
  T("zamek", "castle", "Zamek to średniowieczna warownia z murami, basztami i bramą, w której mieszkał władca.", "A castle is a medieval fortress with walls, towers and a gate.", "castle"),
  T("wieża", "tower", "Wieża to wysoka, wąska budowla, z której widać okolicę.", "A tower is a tall, narrow building you can see far from.", "tower"),
  T("most", "bridge", "Most to konstrukcja, która pozwala przejść albo przejechać nad wodą lub przepaścią.", "A bridge lets you cross over water or a gap.", "bridge"),
  T("latarnia morska", "lighthouse", "Latarnia morska to wysoka wieża ze światłem, która wskazuje statkom drogę przy brzegu.", "A lighthouse is a tall tower with a light that guides ships near the coast.", "lighthouse"),
  T("wiatrak", "windmill", "Wiatrak to budowla z obracającymi się śmigłami, którą napędza wiatr, np. do mielenia zboża.", "A windmill is a building with sails turned by wind, used for milling grain.", "windmill", ["młyn"]),
  T("piramida", "pyramid", "Piramida to ogromna kamienna budowla o trójkątnych ścianach, znana z Egiptu.", "A pyramid is a huge stone structure with triangular sides, famous from Egypt.", "pyramid"),
  T("igloo", "igloo", "Igloo to domek z bloków śniegu lub lodu, w którym mieszkają mieszkańcy Arktyki.", "An igloo is a dome-shaped house made of blocks of snow.", "igloo"),
  T("kaktus", "cactus", "Kaktus to roślina z pustyni z grubą łodygą pokrytą kolcami, magazynuje wodę.", "A cactus is a desert plant with a thick spiny stem that stores water.", "cactus"),
  T("muchomor", "mushroom", "Muchomor to grzyb z czerwonym kapeluszem w białe kropki. Jest trujący, więc nie wolno go jeść!", "A fly agaric is a red mushroom with white dots - poisonous, never eat it!", "mushroom", ["grzyb"]),
  T("trampolina", "trampoline", "Trampolina to sprężysta mata, od której można się wysoko odbijać.", "A trampoline is a springy mat you can bounce high on.", "trampoline"),
  T("diabelski młyn", "ferris wheel", "Diabelski młyn to wielkie koło z gondolami, które powoli obraca się w wesołym miasteczku.", "A Ferris wheel is a giant wheel with gondolas that slowly turns at a fairground.", "ferrisWheel"),
  T("katapulta", "catapult", "Katapulta to średniowieczna machina, która wyrzuca kamienie ramieniem.", "A catapult is a medieval machine that throws stones with an arm.", "catapult"),
  T("domek na drzewie", "treehouse", "Domek na drzewie to mała chatka zbudowana wysoko między gałęziami.", "A treehouse is a small hut built high up in a tree.", "treehouse"),
  T("kościół", "church", "Kościół to budynek do modlitwy, zwykle z wysoką wieżą i dzwonami.", "A church is a building for worship, usually with a tall tower.", "church"),
  T("szkoła", "school", "Szkoła to budynek, w którym uczą się dzieci i młodzież.", "A school is a building where children learn.", "school"),
  T("sklep", "shop", "Sklep to miejsce, w którym kupuje się towary.", "A shop is a place where you buy goods.", "shop"),
  T("basen", "swimming pool", "Basen to zbiornik z wodą do pływania, często z trampoliną i drabinkami.", "A swimming pool is a water tank for swimming.", "swimmingPool"),
  T("boisko piłkarskie", "football pitch", "Boisko piłkarskie to prostokątna murawa z bramkami na końcach i białymi liniami.", "A football pitch is a rectangular grass field with goals at each end.", "footballPitch"),
  T("fontanna", "fountain", "Fontanna to zbiornik z wodą, z którego tryska woda, często na placu.", "A fountain sprays water from a basin, often in a square.", "fountain"),
  T("studnia", "well", "Studnia to głęboki otwór w ziemi, z którego czerpie się wodę.", "A well is a deep hole in the ground used to draw water.", "well"),
  T("ognisko", "campfire", "Ognisko to ogień rozpalony na zewnątrz, przy którym siedzi się na biwaku.", "A campfire is an outdoor fire people sit around while camping.", "campfire"),
  T("namiot", "tent", "Namiot to przenośny schron z płótna rozpiętego na kijach, do spania na biwaku.", "A tent is a portable cloth shelter for sleeping outdoors.", "tent"),
  T("huśtawka", "swing", "Huśtawka to siedzisko na łańcuchach, na którym bujasz się w przód i w tył.", "A swing is a seat on chains that you sway back and forth on.", "swing"),
  T("zjeżdżalnia", "slide", "Zjeżdżalnia to pochyła rynna, po której zjeżdża się z drabinki na dół.", "A slide is a sloped chute you ride down from a ladder.", "slide"),
  T("labirynt", "maze", "Labirynt to sieć korytarzy ze ścianami, w której trzeba znaleźć drogę do wyjścia.", "A maze is a network of walled corridors where you must find the exit.", "maze"),
  T("arena", "arena", "Arena to ogrodzony plac do walk lub zawodów, zwykle z osłonami.", "An arena is a walled field for fights or competitions.", "arena"),
  T("wieżowiec", "skyscraper", "Wieżowiec to bardzo wysoki budynek ze szklanymi ścianami i wieloma piętrami.", "A skyscraper is a very tall building with many floors.", "skyscraper"),
  T("robot", "robot", "Robot to maszyna, która wykonuje zadania, czasem podobna do człowieka.", "A robot is a machine that does tasks, sometimes shaped like a person.", "robot"),
  T("bałwan", "snowman", "Bałwan to figura ze śniegu: trzy kule, marchewka zamiast nosa i kapelusz.", "A snowman is a figure made of snow with three balls, a carrot nose and a hat.", "snowman"),
  T("portal", "portal", "Portal to magiczna brama, która przenosi z jednego miejsca w inne.", "A portal is a magic gate that teleports you somewhere else.", "portal"),
  T("skrzynia skarbów", "treasure chest", "Skrzynia skarbów to drewniana skrzynia ze złotem i klejnotami, której szukają piraci.", "A treasure chest is a wooden box full of gold that pirates look for.", "treasureChest"),
  T("kanapa", "sofa", "Kanapa (sofa) to wygodne meble do siedzenia dla kilku osób.", "A sofa is comfortable furniture for several people to sit on.", "sofa", ["sofa"]),
  T("telewizor", "television", "Telewizor to urządzenie z ekranem do oglądania filmów i programów.", "A television is a screen device for watching shows.", "television", ["tv"]),
  // pojęcia z gier i Predatora
  T("obby", "obby", "Obby (tor przeszkód) to mapa, na której trzeba przejść od startu do mety, skacząc po platformach i omijając pułapki.", "An obby is an obstacle course where you jump across platforms from start to finish.", "obby", ["parkour", "tor przeszkód"]),
  T("checkpoint", "checkpoint", "Checkpoint to punkt kontrolny - po śmierci wracasz na ostatni zaliczony, a nie na sam początek.", "A checkpoint saves your progress so you respawn there instead of at the start.", undefined),
  T("spawn", "spawn", "Spawn to miejsce, w którym gracz pojawia się w grze (i odradza po śmierci).", "A spawn is where a player appears and respawns."),
  T("respawn", "respawn", "Respawn to odrodzenie gracza po śmierci.", "Respawning means coming back to life after dying."),
  T("NPC", "NPC", "NPC to postać sterowana przez grę, a nie przez gracza, np. sprzedawca albo strażnik.", "An NPC is a character controlled by the game, not by a player."),
  T("tycoon", "tycoon", "Tycoon to gra, w której zarabiasz pieniądze i kupujesz kolejne budynki i ulepszenia, aż zbudujesz imperium."),
  T("lawa", "lava", "Lawa to płynna, rozżarzona skała z wulkanu. W grach zwykle zabija po dotknięciu."),
  T("kind=kill", "kill part", "Klocek z rodzajem kill zabija gracza po dotknięciu - tak robi się lawę, kolce i inne pułapki."),
  T("klocek", "part", "Klocek (part) to podstawowy element mapy w Predatorze: ma kształt, rozmiar, kolor i położenie. Z klocków buduje się wszystko."),
  T("skrypt", "script", "Skrypt to program w języku Lua, który mówi grze, co ma się dziać, np. co robi klocek po dotknięciu."),
  T("Lua", "Lua", "Lua to prosty język programowania, w którym pisze się skrypty w Predatorze. Wygląda np. tak: print(\"cześć\")."),
  T("GUI", "GUI", "GUI to okienka na ekranie: przyciski, napisy i liczniki, np. menu startowe albo licznik monet."),
  T("model", "model", "Model to kilka klocków połączonych w jedną całość (np. dom albo auto), które przesuwa się razem."),
  T("pvp", "PvP", "PvP (gracz kontra gracz) oznacza, że gracze mogą się nawzajem ranić bronią."),
  T("lag", "lag", "Lag to opóźnienie w grze: obraz się szarpie, bo połączenie z serwerem jest wolne."),
  T("FPS", "FPS", "FPS to liczba klatek na sekundę. Im więcej, tym płynniejsza gra (60 jest dobre)."),
  T("ranking", "leaderboard", "Ranking to lista graczy uporządkowana według punktów, od najlepszego."),
  T("kamera", "camera", "Kamera pokazuje świat gry z jakiegoś miejsca - u nas zwykle zza pleców gracza."),
  T("tekstura", "texture", "Tekstura to wzór nałożony na klocek, np. cegły, drewno albo trawa. W Predatorze ustawia się ją w polu texture."),
  T("emiter", "emitter", "Emiter to klocek, z którego wylatują cząsteczki: ogień, dym, iskry albo magia."),
  T("tween", "tween", "Tween to płynne przesunięcie klocka z jednego miejsca w drugie w określonym czasie, np. winda. W Lua: tweenMove."),
  T("cooldown", "cooldown", "Cooldown to czas oczekiwania, zanim da się coś zrobić znowu, np. użyć skrzynki - chroni przed spamem."),
  T("kolizja", "collision", "Kolizja oznacza, że przedmioty zderzają się ze sobą i nie można przez nie przejść. Wyłączysz ją przez collide=0."),
  T("serwer", "server", "Serwer to komputer, na którym działa gra i do którego łączą się gracze."),
  T("moderator", "moderator", "Moderator to osoba pilnująca porządku w grze: może wyrzucać graczy łamiących regulamin."),
];

const ASK_PL = ["Co to jest {t}?", "co to {t}", "Co to {t}?", "Wiesz co to jest {t}?", "Wytłumacz mi, czym jest {t}", "Czym jest {t}?", "Co oznacza {t}?", "Powiedz mi coś o: {t}", "Nie wiem co to {t}, pomożesz?", "Opisz {t} w paru słowach", "co to jest {t} ??", "Mógłbyś wyjaśnić, co to {t}?"];
const ASK_EN = ["What is a {t}?", "what's {t}", "Explain what {t} means", "Do you know what a {t} is?", "Tell me about {t}"];

function offer(t: Term, lang: Lang, r: Rng): string {
  if (!t.build) return "";
  if (lang === "en") return r.pick([" Want me to build one in your game?", " Should I build it for you?"]);
  const s = r.pick([" Chcesz, żebym zbudował to w Twojej grze?", " Mogę to dla Ciebie zbudować - mam zrobić?", " Zbudować Ci taki obiekt w grze?"]);
  return lang === "pl-noaccent" ? stripPl(s) : s;
}

export function sampleDefine(r: Rng): Sample {
  const t = r.pick(TERMS);
  let lang = pickLang(r);
  if (!t.defEn && lang === "en") lang = "pl";
  const S = new Session(r);
  const name = lang === "en" ? t.en : t.pl;
  const ask = (lang === "en" ? r.pick(ASK_EN) : r.pick(ASK_PL)).replace("{t}", r.chance(0.25) && t.aliases?.length && lang !== "en" ? r.pick(t.aliases) : name);
  S.user(lang === "pl-noaccent" ? stripPl(ask) : r.chance(0.1) ? ask.toLowerCase() : ask);
  const body = lang === "en" ? t.defEn ?? t.defPl : t.defPl;
  const txt = body + offer(t, lang, r);
  S.say(lang === "pl-noaccent" ? stripPl(txt) : txt);
  return { id: "know-define", kind: "chat", lang, messages: S.msgs };
}

/** pytanie "co to X?" -> wyjaśnienie -> "tak, zbuduj" -> budowa prawdziwymi narzędziami */
export async function sampleDefineBuild(r: Rng): Promise<Sample | null> {
  const t = r.pick(TERMS.filter((x) => x.build));
  const id = t.build!;
  const lang = pickLang(r);
  const focus: [number, number, number] = [r.chance(0.5) ? 0 : r.snap(r.range(-80, 80), 5), 0, r.chance(0.5) ? 0 : r.snap(r.range(-80, 80), 5)];
  const S = new Session(r, focus);
  const name = lang === "en" ? t.en : t.pl;
  S.user(lang === "pl-noaccent" ? stripPl(`Co to ${name}?`) : lang === "en" ? `What is a ${name}?` : `Co to ${name}?`);
  S.say((lang === "en" ? t.defEn ?? t.defPl : t.defPl) + offer(t, lang, r));
  S.user(lang === "en" ? r.pick(["yes please", "sure, build it", "yes"]) : r.pick(["tak", "tak, zbuduj", "pewnie", "jasne, zrób to", "dawaj", "tak poproszę"]));
  const it = buildOne(id, r, [focus[0], focus[2]], 0);
  if (!it) return null;
  await S.turn(lang === "en" ? "Let me check the map." : "Sprawdzę mapę.", [{ name: "get_overview", args: {} }]);
  const res = await S.turn(lang === "en" ? "Building it now." : "Buduję.", [{ name: "create_parts", args: { parts: it.parts.map(toPart), model_name: it.built.model }, at: { at: it.at, yaw: it.yaw } }]);
  if ((res[0] as { error?: string }).error) return null;
  S.say(lang === "en" ? `Done! The ${t.en} is next to the camera focus. Want any changes?` : `Gotowe! ${t.pl[0].toUpperCase() + t.pl.slice(1)} stoi przy miejscu, na które patrzy kamera. Chcesz coś zmienić?`);
  return { id: "know-define-build", kind: "build", lang, messages: S.msgs };
}

// ---------- swobodne prośby ----------

export const INTENTS: Record<string, { pl: string[]; en: string[] }> = {
  scooter: { pl: ["chcę jeździć na hulajnodze po mojej mapie", "dodaj coś na czym można jeździć odpychając się nogą (hulajnogę)", "zrób hulajnogę do jazdy"], en: ["I want to ride a scooter in my game", "add a kick scooter players can ride"] },
  bicycle: { pl: ["potrzebuję roweru do jazdy po parku", "zrób rowerek dla graczy"], en: ["add a bike players can ride"] },
  motorcycle: { pl: ["dodaj szybki motor do ścigania", "zrób motocykl"], en: ["add a fast motorbike"] },
  skateboard: { pl: ["zrób deskorolkę, żeby się ścigać", "chcę deskorolkę w grze"], en: ["I want a skateboard in my game"] },
  car: { pl: ["potrzebuję auta, którym można jeździć", "zrób samochód do wyścigów", "dodaj jakiś pojazd z kierownicą"], en: ["I need a car to drive around", "add a vehicle players can drive"] },
  boat: { pl: ["chcę pływać po jeziorze łódką", "dodaj łódź do pływania"], en: ["I want a boat to sail on the lake"] },
  airplane: { pl: ["zrób coś do latania - samolot", "chcę samolot na lotnisku"], en: ["build me an airplane"] },
  helicopter: { pl: ["dodaj helikopter z wirnikiem", "zrób śmigłowiec do latania"], en: ["add a helicopter with a rotor"] },
  train: { pl: ["zrób pociąg z wagonami na torach", "chcę kolejkę z lokomotywą"], en: ["make a train with carriages on tracks"] },
  bus: { pl: ["potrzebuję autobusu miejskiego", "zrób duży autobus"], en: ["add a city bus"] },
  rocket: { pl: ["zrób rakietę kosmiczną na wyrzutni", "chcę lecieć w kosmos - zbuduj rakietę"], en: ["build a space rocket on a launch pad"] },
  ufo: { pl: ["dodaj latający spodek kosmitów", "zrób UFO nad miastem"], en: ["add a flying saucer"] },
  pirateShip: { pl: ["zbuduj statek pirata z żaglami", "chcę piracki żaglowiec"], en: ["build a pirate ship with sails"] },
  tank: { pl: ["zrób czołg do zabawy", "dodaj pancerny pojazd z armatą"], en: ["add a toy tank"] },
  castle: { pl: ["chcę mieszkać w prawdziwym zamku z basztami", "zrób średniowieczną twierdzę"], en: ["I want a medieval castle with towers"] },
  house: { pl: ["gdzie mogę mieszkać? zrób mi dom", "potrzebuję domu dla mojej postaci"], en: ["I need a house for my character"] },
  treehouse: { pl: ["chcę domek na drzewie", "zrób kryjówkę wysoko na drzewie"], en: ["build a treehouse hideout"] },
  tower: { pl: ["zrób wysoką wieżę do obserwacji", "chcę wieżę strażniczą"], en: ["make a tall watchtower"] },
  bridge: { pl: ["muszę przejść przez rzekę - zrób most", "potrzebuję czegoś do przejścia nad przepaścią"], en: ["I need a way to cross the river"] },
  windmill: { pl: ["dodaj wiatrak na wsi", "zrób młyn ze śmigłami"], en: ["add a windmill to the village"] },
  lighthouse: { pl: ["zrób latarnię przy morzu", "potrzebuję latarni morskiej"], en: ["build a lighthouse by the sea"] },
  obby: { pl: ["chcę parkour z platformami i lawą", "zrób tor przeszkód do skakania", "zrób grę w stylu obby"], en: ["make a parkour course with lava", "build an obby"] },
  maze: { pl: ["zrób labirynt, w którym łatwo się zgubić", "chcę zagadkę z korytarzami i wyjściem"], en: ["build a maze that's easy to get lost in"] },
  arena: { pl: ["potrzebuję miejsca do walk graczy", "zrób arenę do pojedynków"], en: ["I need a place for players to fight"] },
  skyscraper: { pl: ["zrób wysoki biurowiec ze szkła", "chcę drapacz chmur"], en: ["build a tall glass skyscraper"] },
  pyramid: { pl: ["zrób egipską piramidę na pustyni", "chcę piramidę"], en: ["build an Egyptian pyramid"] },
  campfire: { pl: ["zrób ognisko na biwaku", "dodaj ogień, przy którym można usiąść"], en: ["add a campfire to sit around"] },
  tent: { pl: ["potrzebuję namiotu na biwak", "zrób namiot do spania"], en: ["add a tent for camping"] },
  fountain: { pl: ["zrób fontannę na rynku", "chcę fontannę z tryskającą wodą"], en: ["add a fountain to the square"] },
  swing: { pl: ["dodaj plac zabaw z huśtawką", "zrób huśtawkę"], en: ["add a swing"] },
  slide: { pl: ["zrób zjeżdżalnię dla dzieci", "chcę zjeżdżalnię"], en: ["add a playground slide"] },
  trampoline: { pl: ["chcę skakać wysoko - zrób trampolinę", "dodaj trampolinę"], en: ["add a trampoline to bounce on"] },
  ferrisWheel: { pl: ["zrób wesołe miasteczko z diabelskim młynem", "chcę diabelski młyn"], en: ["build a Ferris wheel"] },
  swimmingPool: { pl: ["potrzebuję basenu do pływania", "zrób basen z wodą"], en: ["add a swimming pool"] },
  footballPitch: { pl: ["chcę zagrać w piłkę - zrób boisko", "zrób boisko z bramkami"], en: ["I want to play football, build a pitch"] },
  school: { pl: ["zrób szkołę z flagą", "chcę budynek szkoły"], en: ["build a school with a flag"] },
  shop: { pl: ["zrób sklep ze szyldem", "potrzebuję sklepu"], en: ["add a shop with a sign"] },
  church: { pl: ["zrób kościół z wieżą", "chcę kościółek we wsi"], en: ["build a church with a tower"] },
  robot: { pl: ["zrób robota", "chcę metalowego robota z antenką"], en: ["build a robot"] },
  snowman: { pl: ["zrób bałwana", "chcę bałwana z marchewką"], en: ["make a snowman"] },
  igloo: { pl: ["zrób igloo na lodzie", "chcę domek z lodu"], en: ["build an igloo"] },
  cactus: { pl: ["dodaj kaktusa na pustyni", "zrób kaktusa"], en: ["add a cactus"] },
  mushroom: { pl: ["zrób wielkiego muchomora", "dodaj grzyba w lesie"], en: ["add a giant mushroom"] },
  portal: { pl: ["zrób magiczny portal", "chcę bramę do teleportacji"], en: ["build a magic portal"] },
  treasureChest: { pl: ["zrób skrzynię ze skarbem", "chcę skrzynię piratów"], en: ["add a treasure chest"] },
  sofa: { pl: ["zrób kanapę do salonu", "chcę wygodną sofę"], en: ["add a sofa"] },
  bed: { pl: ["zrób łóżko do sypialni", "chcę łóżko z kołdrą"], en: ["add a bed"] },
  tableChairs: { pl: ["zrób stół z krzesłami do jadalni", "chcę stół i krzesła"], en: ["add a dining table with chairs"] },
  television: { pl: ["dodaj telewizor w salonie", "zrób TV na szafce"], en: ["add a TV"] },
  catapult: { pl: ["zrób średniowieczną katapultę", "chcę machinę oblężniczą"], en: ["build a medieval catapult"] },
};

export async function sampleIntent(r: Rng): Promise<Sample | null> {
  const id = r.pick(Object.keys(INTENTS));
  const lang = pickLang(r);
  const list = lang === "en" ? INTENTS[id].en : INTENTS[id].pl;
  const raw = r.pick(list);
  const ask = lang === "pl-noaccent" ? stripPl(raw) : raw;
  return sampleSingle(r, id, decorate(ask, r, lang), lang);
}

// ---------- zwykła rozmowa ----------

interface Chat { q: string[]; a: string; lang?: "pl" | "en" }
export const CHAT: Chat[] = [
  { q: ["Kim jesteś?", "kim ty jesteś", "Jak masz na imię?", "przedstaw się"], a: "Jestem asystentem Predator Studio. Pomagam budować mapy i pisać skrypty w Lua, odpowiadam też na pytania o gry i nie tylko. Co chcesz dziś zrobić?" },
  { q: ["Who are you?", "what's your name"], a: "I'm the Predator Studio assistant. I build maps, write Lua scripts and answer questions. What shall we make?", lang: "en" },
  { q: ["Dzięki!", "dzieki", "dziękuję bardzo", "super, dzięki"], a: "Nie ma za co! Jak będziesz chciał coś dodać albo poprawić, po prostu napisz." },
  { q: ["thanks", "thank you!"], a: "You're welcome! Tell me if you want to add or change anything.", lang: "en" },
  { q: ["Jak się masz?", "co słychać?", "jak leci"], a: "Dobrze, dziękuję! Jestem gotowy do budowania. A Ty co dziś robisz w Studiu?" },
  { q: ["Opowiedz dowcip", "powiedz jakiś żart", "rozśmiesz mnie"], a: "Dlaczego programista nie lubi natury? Bo ma za dużo bugów! 🐞 Chcesz kolejny, czy wracamy do budowania?" },
  { q: ["Opowiedz coś ciekawego", "powiedz ciekawostkę"], a: "Ciekawostka: ośmiornica ma trzy serca i niebieską krew! A w grach ciekawe jest to, że pierwszy dźwięk w Pac-Manie nagrano w kilka dni. Chcesz zrobić grę o morzu?" },
  { q: ["Jak zrobić żeby moja gra była popularna?", "jak zrobić fajną grę?", "daj rady dla twórcy gry"], a: "Kilka rad: 1) zrób jasny cel (meta, punkty), 2) daj nagrody i odznaki, 3) dodaj checkpointy, żeby nie frustrować, 4) wymyśl ładną miniaturę i nazwę, 5) testuj z kolegami i poprawiaj. Mogę od razu zbudować taką mapę - powiedz jaką." },
  { q: ["Co to jest pętla for w Lua?", "jak działa for w lua", "wytłumacz pętlę for"], a: "Pętla for powtarza kod kilka razy. Przykład:\n```lua\nfor i = 1, 5 do\n  print(\"Krok \" .. i)\nend\n```\nWypisze Krok 1 ... Krok 5. W Predatorze często używa się jej do monet: `for i = 1, 10 do ... end`." },
  { q: ["Jak w Lua zrobić zmienną?", "co to zmienna w lua"], a: "Zmienna to pudełko na wartość. W Lua piszesz `local punkty = 0`, a potem np. `punkty = punkty + 1`. Słowo `local` oznacza, że zmienna działa tylko w tym miejscu skryptu - polecam zawsze go używać." },
  { q: ["Co to funkcja w Lua?", "wyjaśnij funkcje w lua"], a: "Funkcja to kawałek kodu z nazwą, który możesz uruchamiać wiele razy:\n```lua\nlocal function powitaj(gracz)\n  tell(gracz, \"Cześć!\")\nend\n```\nPotem wywołujesz `powitaj(player)`. W Predatorze funkcje dajesz też zdarzeniom, np. `onTouch(\"Meta\", function(player) ... end)`." },
  { q: ["Jak działa onTouch?", "co robi onTouch"], a: "`onTouch(\"Nazwa\", function(player) ... end)` uruchamia kod, gdy gracz dotknie klocka o tej nazwie. Zmienna `player` to ten gracz, więc możesz np. napisać `kill(player)` albo `addScore(player, 1)`." },
  { q: ["Czym się różni every od after?", "every a after"], a: "`after(5, f)` wykonuje funkcję raz, po 5 sekundach. `every(5, f)` powtarza ją co 5 sekund w kółko. Gdy chcesz to zatrzymać, zapisz `local t = every(...)` i wywołaj `cancel(t)`." },
  { q: ["Jak zrobić żeby klocek zniknął?", "jak ukryć klocek w lua"], a: "Użyj `setVisible(\"Nazwa\", false)` - klocek znika i traci kolizję. Chcesz ukryć go tylko dla jednego gracza? Wtedy `setVisibleFor(player, \"Nazwa\", false)`." },
  { q: ["Jak zrobić żeby klocek się ruszał?", "ruchomy klocek"], a: "Najprościej `tweenMove(\"Nazwa\", 0, 10, 0, 2)` - przesuwa klocek o 10 w górę przez 2 sekundy. Połącz z `every(...)`, a zrobisz windę albo ruchomą platformę. Mogę ją od razu dla Ciebie napisać." },
  { q: ["Jak zrobić lawę?", "jak zrobić pułapkę która zabija"], a: "Dwa sposoby: ustaw klockowi rodzaj `kind=kill` (zabija po dotknięciu, bez skryptu) albo napisz `onTouch(\"Lawa\", function(p) kill(p) end)`. Pierwszy jest prostszy. Zbudować Ci kawałek mapy z lawą?" },
  { q: ["Ile wysoko skacze gracz?", "jak wysoko skacze postać"], a: "Postać skacze mniej więcej 6 jednostek w górę i 8 w dal, a chodzi z prędkością 16 na sekundę. Dlatego w parkourze dziury powinny mieć 3-6 jednostek." },
  { q: ["Jak zmienić kolor nieba?", "zmiana nieba"], a: "W skrypcie: `setSky(\"#102040\")` ustawia kolor, a `setSkybox(\"sunset\")` gotowe niebo (day, cloudy, sunset, dawn, night, aurora, space, storm, candy, hell). Pora dnia: `setHour(21.5)`. Mogę też zmienić to narzędziem w ustawieniach gry." },
  { q: ["Czy możesz zrobić całą grę?", "zrób mi całą grę"], a: "Mogę zrobić dużo: mapę, skrypty, okienka i punkty. Powiedz tylko, jaka to ma być gra (np. obby z lawą, arena walk, tycoon) - zaczynam od mapy, potem dodaję zasady i testuję. Jaki gatunek wybierasz?" },
  { q: ["nudzi mi się", "nie wiem co robić"], a: "To zbudujmy coś! Propozycje: obby z lawą i checkpointami, arena do walk, labirynt ze skarbem albo wioska z NPC. Co brzmi najlepiej?" },
  { q: ["Jaka jest stolica Polski?", "stolica polski"], a: "Stolicą Polski jest Warszawa." },
  { q: ["Ile to jest 12 razy 8?", "12*8"], a: "12 × 8 = 96." },
  { q: ["Jaki kolor ma niebo?", "dlaczego niebo jest niebieskie"], a: "Niebo jest niebieskie, bo atmosfera najmocniej rozprasza niebieskie światło słoneczne. O zachodzie słońca światło przechodzi dłuższą drogę, więc niebo robi się czerwone i pomarańczowe." },
  { q: ["Ile nóg ma pająk?", "ile nog ma pajak"], a: "Pająk ma osiem nóg." },
  { q: ["Kto wymyślił żarówkę?", "kto wynalazł zarowke"], a: "Żarówkę udoskonalił i spopularyzował Thomas Edison w 1879 roku, choć przed nim pracowało nad nią wielu wynalazców." },
  { q: ["Co to jest Roblox?", "czym jest roblox"], a: "Roblox to platforma, na której gracze tworzą i grają w gry innych ludzi. Predator jest podobny: budujesz mapy z klocków i piszesz skrypty w Lua." },
  { q: ["Jak mam zacząć w Studio?", "jak zacząć robić gry", "od czego zacząć"], a: "Na początek: 1) otwórz Studio i nową grę 3D, 2) postaw kilka klocków (platformy, podłoga), 3) ustaw Spawn, 4) kliknij ▶ Testuj. Możesz mi też po prostu napisać, co chcesz zbudować, a ja to zrobię i wytłumaczę krok po kroku." },
  { q: ["Czy uczysz się na moich grach?", "czy widzisz moje gry"], a: "Widzę tylko to, co jest w otwartej grze, gdy mnie o coś prosisz - po to, żeby użyć właściwych nazw. Nie przekazuję Twojej pracy innym." },
  { q: ["Umiesz po polsku?", "mówisz po polsku?"], a: "Tak, rozmawiam po polsku! Możesz też pisać po angielsku - odpowiem w tym samym języku." },
  { q: ["Do you speak Polish?", "can you write in Polish"], a: "Tak, mówię po polsku! I speak English too - I'll answer in the language you write in.", lang: "en" },
  { q: ["Jaki język programowania jest w Predatorze?", "w czym się skryptuje"], a: "W Predatorze skrypty piszesz w Lua 5.3. To prosty język - jest w nim `if`, `for`, funkcje i tabele, a do tego gotowe funkcje gry jak `onTouch`, `kill` albo `teleport`." },
  { q: ["Dlaczego mój skrypt nie działa?", "skrypt mi nie działa pomóż"], a: "Najczęstsze powody: 1) nazwa klocka w skrypcie nie zgadza się z nazwą w mapie (wielkość liter!), 2) brak `end`, 3) skrypt jest wyłączony, 4) używasz funkcji, której nie ma w Predatorze. Napisz mi nazwę skryptu, to go przeczytam, przetestuję i naprawię." },
];

export function sampleChatKnow(r: Rng): Sample {
  const c = r.pick(CHAT);
  const S = new Session(r);
  const lang: Lang = c.lang === "en" ? "en" : pickLang(r) === "pl-noaccent" && r.chance(0.5) ? "pl-noaccent" : "pl";
  const q = r.pick(c.q);
  S.user(lang === "pl-noaccent" ? stripPl(q) : q);
  S.say(c.a);
  return { id: "chat-know", kind: "chat", lang, messages: S.msgs };
}
