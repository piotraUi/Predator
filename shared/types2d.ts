// Gry 2D w Predatorze: poziomy z obiektami (sprite'y, kafelki, teksty, strefy, światła),
// fizyka platformówki i te same skrypty Lua co w 3D.
// Współrzędne jak w typowych edytorach 2D: x w prawo, y w dół, piksele.

/** Obrazek, dźwięk albo czcionka bitmapowa zapisane w grze (data URL) */
export interface Asset2D {
  id: string;
  name: string;
  type: "image" | "sound" | "font";
  /** data URL (obrazek / dźwięk) albo tekst pliku .fnt (czcionka) */
  data: string;
  /** rozmiar obrazka w pikselach */
  w?: number;
  h?: number;
  /** czcionka: obrazek z literami */
  image?: string;
  /** rysuj piksele ostro (pixel art) */
  pixel?: boolean;
}

export interface Anim2D {
  name: string;
  /** id obrazków kolejnych klatek */
  frames: string[];
  /** sekundy na klatkę */
  frameTime: number;
  loop: boolean;
}

/** Jak obiekt zachowuje się w fizyce */
export type Solid2D = "none" | "solid" | "jumpthru" | "ladder";

/**
 * Wbudowane zachowania obiektów - bez pisania skryptów:
 *  hazard     - zabija gracza (ogień, kolce, lawa)
 *  pickup     - gracz zbiera (znika); z licznikiem = moneta
 *  checkpoint - zapisuje miejsce odrodzenia
 *  goal       - przenosi na inny poziom
 *  enemy      - chodzi w lewo i prawo (potwór), zabija gracza
 *  jumpzone   - potwory skaczą, gdy w nią wejdą
 *  button     - przycisk; wciśnięty otwiera bramy z tym samym kluczem
 *  gate       - brama (zamknięta = ściana)
 *  spawn      - miejsce pojawienia się graczy
 *  respawn    - miejsce odrodzenia po śmierci (zamiast spawnu)
 *  spring     - trampolina: wyrzuca gracza (siła push przez sekundę, jak w GDevelopie)
 */
export type Role2D =
  | "none" | "hazard" | "pickup" | "checkpoint" | "goal" | "enemy" | "jumpzone" | "button" | "gate" | "spawn" | "respawn" | "spring";

export interface Obj2D {
  id: string;
  name: string;
  kind: "sprite" | "tiled" | "text" | "light";
  /** sprite: animacje; tiled: pierwsza klatka to powtarzany obrazek */
  anims: Anim2D[];
  /** domyślny rozmiar nowej instancji */
  w: number;
  h: number;
  /** prostokąt kolizji jako ułamki rozmiaru [x, y, szer, wys] */
  hitbox: [number, number, number, number];
  solid: Solid2D;
  role: Role2D;
  /** niewidoczny w grze (strefa / wyzwalacz) */
  hidden?: boolean;
  /** pickup: zbierany osobno przez każdego gracza (inaczej znika dla wszystkich) */
  perPlayer?: boolean;
  /** pickup: dodaje do licznika monet */
  coin?: boolean;
  /** goal: nazwa poziomu docelowego */
  toLevel?: string;
  /** enemy: prędkość w px/s i siła skoku */
  speed?: number;
  jump?: number;
  /** animacja stania gracza na tym obiekcie (np. "Cylinder i beczka") */
  standAnim?: string;
  /** tekst; w napisach można użyć {coins} (monety gracza), {left} (zostało monet), {time} (czas), {player} (nick) */
  text?: string;
  color?: string;
  fontSize?: number;
  /** id czcionki bitmapowej */
  font?: string;
  /** światło */
  radius?: number;
  /** spring: siła wyrzutu [w prawo, w dół] w px/s (np. [0, -800] = w górę) */
  push?: [number, number];
  /** spring: animacja gracza przy wyrzucie */
  pushAnim?: string;
  /** dźwięk (id assetu) - np. trampolina, zebranie */
  sound?: string;
}

export interface Inst2D {
  id: string;
  obj: string;
  /** nazwa dla skryptów (inaczej nazwa obiektu) */
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** bg = tło (rysowane pod spodem), hud = przyklejone do ekranu */
  layer: "bg" | "main" | "hud";
  flip?: boolean;
  /** obrót w stopniach wokół środka (tylko wygląd, jak w GDevelopie) */
  angle?: number;
  /** animacja początkowa */
  anim?: string;
  /** button / gate: klucz, który je łączy */
  key?: number;
  /** tło: przesuwa się wolniej (0 - 1) */
  parallax?: number;
}

export interface Level2D {
  id: string;
  name: string;
  background: string;
  /** ile razy przybliżony widok (2 = piksele 2x większe) */
  zoom: number;
  instances: Inst2D[];
  /** spadnięcie poniżej = śmierć (null = brak) */
  killY: number | null;
  /** kamera nie schodzi niżej niż ta linia */
  cameraBottom: number | null;
  /** ciemność (np. noc) - kolor otoczenia, światła rozjaśniają */
  ambient?: string;
  /** śmierć bez checkpointu zaczyna poziom od nowa (monety wracają) */
  restartOnDeath?: boolean;
  /** wszyscy gracze na tym poziomie wyglądają jak ta postać */
  character?: string;
  /** postacie do wyboru tylko na tym poziomie (np. mniejsze na mapę multiplayer) - zamiast ogólnej listy */
  characters?: string[];
  /** gracze mogą stawać sobie na głowach */
  stackPlayers?: boolean;
  /** można go wybrać z menu gry (inaczej trzeba do niego dojść) */
  selectable?: boolean;
  /** widok z góry (jak w grach RPG): bez grawitacji, ruch w 4 strony, ściany blokują ze wszystkich stron */
  topDown?: boolean;
  /** kamera stoi w miejscu w poziomie / w pionie (środek widoku), zamiast iść za graczem */
  cameraX?: number;
  cameraY?: number;
}

/** Postać do grania: sprite i nazwy jego animacji */
export interface Character2D {
  id: string;
  name: string;
  obj: string;
  w: number;
  h: number;
  anims: {
    idle: string;
    walk: string;
    run?: string;
    jump: string;
    fall: string;
    climb: string;
    dead: string;
    up?: string;
    down?: string;
  };
  /** postać-towarzysz, która biegnie za graczem (powtarza jego ruchy) */
  companion?: string;
  /** tylko jako towarzysz / NPC - nie do wyboru w menu postaci */
  npc?: boolean;
}

export interface Physics2D {
  gravity: number;
  jumpSpeed: number;
  /** jak długo trzymanie skoku utrzymuje prędkość (s) */
  jumpSustain: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  maxFallSpeed: number;
  ladderSpeed: number;
}

export interface World2D {
  assets: Asset2D[];
  objects: Obj2D[];
  levels: Level2D[];
  characters: Character2D[];
  startLevel: string;
  physics: Physics2D;
  /** dźwięki wbudowanych zdarzeń (id assetów) */
  sounds: { jump?: string; coin?: string; hurt?: string; checkpoint?: string; gate?: string };
}

/** Stan gracza 2D w sieci */
export interface NetPlayer2D {
  sid: string;
  username: string;
  level: string;
  character: string;
  x: number;
  y: number;
  anim: string;
  flip: boolean;
  /** ukryty (np. wyszedł drzwiami) */
  hidden?: boolean;
  /** towarzysz (np. pies) */
  pet?: { x: number; y: number; anim: string; flip: boolean } | null;
}

export interface Enemy2D {
  id: string;
  x: number;
  y: number;
  flip: boolean;
  anim?: string;
  /** zginął (np. wszedł w ogień) - niewidoczny, wróci za chwilę */
  dead?: boolean;
}

/** Zmiany stanu instancji na poziomie (skrypty, bramy, zebrane rzeczy) */
export interface InstState2D {
  hidden?: boolean;
  anim?: string;
  x?: number;
  y?: number;
  text?: string;
  /** brama otwarta */
  open?: boolean;
  /** odbicie w poziomie */
  flip?: boolean;
  /** przesuwanie ze skryptu: skąd i w ile sekund jedzie do x, y */
  from?: { x: number; y: number };
  dur?: number;
}
