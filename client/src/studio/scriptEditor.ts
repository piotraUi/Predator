// Okno edycji skryptu: Lua (tekst) albo bloczki.
import type { WorldScript } from "../../../shared/types.ts";
import { ask, h, toast } from "../ui/dom.ts";

export const LUA_HELP: [string, string][] = [
  ['saveData(player, "monety", 10)', "zapisz postęp gracza (zostaje po wyjściu z gry): liczba, tekst albo true/false"],
  ['loadData(player, "monety", 0)', "wczytaj zapis gracza (0 = gdy jeszcze nic nie ma)"],
  ['deleteData(player, "monety")', "usuń zapis"],
  ['promptPurchase(player, "VIP")', "okienko zakupu produktu ze sklepu gry (Ustawienia gry → Sklep gry)"],
  ["onPurchase(function(player, product) ... end)", "gracz coś kupił - product to nazwa produktu"],
  ['ownsProduct(player, "VIP")', "czy gracz ma kupiony produkt (kupowany raz, na zawsze)"],
  ["openShop(player)", "otwórz graczowi cały sklep gry"],
  ["onPlayerJoin(function(player) ... end)", "gdy gracz dołączy"],
  ['onSit(function(player, seat) ... end)', "gracz usiadł na siedzeniu / wsiadł do pojazdu (typ klocka: Siedzenie / pojazd)"],
  ['onUnsit(function(player, seat) ... end)', "gracz wstał / wysiadł"],
  ["onPlayerLeave(function(player) ... end)", "gdy gracz wyjdzie"],
  ['onTouch("Nazwa", function(player) ... end)', "gdy gracz dotknie klocka o tej nazwie"],
  ["onChat(function(player, message) ... end)", "gdy gracz coś napisze"],
  ["onRespawn(function(player) ... end)", "gdy gracz się odrodzi"],
  ["every(sekundy, function() ... end)", "powtarzaj co X sekund"],
  ["after(sekundy, function() ... end)", "zrób raz po X sekundach"],
  ["wait(sekundy)", "czekaj (tylko wewnątrz funkcji)"],
  ['say("tekst")', "wiadomość do wszystkich"],
  ['tell(player, "tekst")', "wiadomość do jednego gracza"],
  ['print("tekst")', "wypisz w konsoli (F9 w grze)"],
  ['setColor("Nazwa", "#ff0000")', "zmień kolor klocka"],
  ['setPosition("Nazwa", x, y, z)', "przestaw klocek"],
  ['move("Nazwa", dx, dy, dz)', "przesuń klocek o tyle"],
  ['setSize("Nazwa", sx, sy, sz)', "zmień rozmiar"],
  ['setVisible("Nazwa", true/false)', "pokaż / ukryj (i wyłącz kolizję)"],
  ['setTransparency("Nazwa", 0.5)', "przezroczystość 0-1"],
  ['setCollide("Nazwa", false)', "czy można przez niego przechodzić"],
  ['getPosition("Nazwa")', "zwraca x, y, z klocka"],
  ['tweenPart("Nazwa", x, y, z, 1.5)', "przesuń klocek płynnie w tyle sekund (np. taśma, winda)"],
  ['tweenMove("Nazwa", 0, 10, 0, 2)', "przesuń płynnie o tyle (wszystkie klocki o tej nazwie razem)"],
  ['showGui(player, "Menu")', "pokaż GUI graczowi (nil = wszystkim); hideGui / toggleGui tak samo"],
  ['setGuiText(player, "Licznik", "Napis", "⭐ 5")', "zmień napis w GUI (nil = wszystkim)"],
  ['isGuiOpen(player, "Menu")', "czy GUI jest otwarte u gracza"],
  ['onGuiClick(function(player, gui, button) ... end)', "gracz kliknął przycisk w GUI (nazwy z edytora GUI)"],
  ['teleportToPlace(player, "Arena")', "przenieś gracza do innego miejsca gry (Studio → Miejsca)"],
  ["getPlace()", "nazwa miejsca, w którym działa ten serwer"],
  ['setLabel("Nazwa", "Kup: 50 💰")', "napis nad klockiem (pusty tekst = bez napisu)"],
  ["kill(player)", "zabij gracza"],
  ["teleport(player, x, y, z)", "teleportuj gracza"],
  ["playerName(player)", "nick gracza"],
  ["getPlayers()", "lista wszystkich graczy"],
  ["getPlayerPosition(player)", "zwraca x, y, z gracza"],
  ["addScore(player, 1) / setScore / getScore", "punkty w rankingu gry"],
  ["setSpeed(player, 16)", "prędkość chodzenia (norm. 16)"],
  ["setJump(player, 50)", "siła skoku (norm. 50)"],
  ["time()", "sekundy od startu serwera"],
  ["onToolUse(function(player, toolName) ... end)", "gdy gracz użyje narzędzia"],
  ['onDied(function(player, killer) ... end)', "gdy gracz zginie (killer = \"\" gdy nikt)"],
  ['giveTool(player, "Miecz")', "daj narzędzie (po nazwie)"],
  ['removeTool(player, "Miecz")', "zabierz narzędzie"],
  ['hasTool(player, "Miecz")', "czy gracz ma narzędzie"],
  ["damage(player, 20)", "zadaj obrażenia"],
  ["heal(player, 20)", "ulecz"],
  ["getHealth(player) / setHealth(player, 100)", "zdrowie (0-100)"],
  ['setCharacter(player, "Zombie")', "zmień wygląd gracza na postać (bez nazwy = własny)"],
  ['playAnimation(player, "Taniec")', "odtwórz animację na graczu"],
  ["stopAnimation(player)", "zatrzymaj animację"],
  ['npcAnimation("Barista", "Machanie")', "animacja NPC (po nazwie klocka)"],
  ['setSky("#102040")', "kolor nieba (np. noc)"],
  ['awardBadge(player, "Nazwa odznaki")', "daj graczowi odznakę (Ustawienia gry → Odznaki)"],
  ['playSound(player, "nazwa")', "zagraj dźwięk graczowi (\"\" = wszystkim) - Ustawienia gry → Dźwięki"],
  ['setMusic("nazwa")', "muzyka w tle (drugi argument: tylko dla gracza)"],
  ['speak(player, "Cześć!", "pl-PL")', "przeczytaj tekst na głos (\"en-US\" = po angielsku)"],
  ['prompt(player, "pytanie1", "Ile to 2+2?")', "okienko z pytaniem - odpowiedź przychodzi do onAnswer"],
  ["onAnswer(function(player, id, text) end)", "gracz odpowiedział w okienku prompt"],
  ['setVisibleFor(player, "Moneta", false)', "pokaż / ukryj klocek tylko dla jednego gracza"],
  ["getPlayerLook(player)", "kierunek patrzenia gracza: tabela {x, z}"],
  ['setSkyFor(player, "#000000")', "kolor nieba tylko dla jednego gracza"],
  ["flicker(player, 2)", "latarka gracza mruga przez 2 s (bez gracza = wszystkim)"],
  ['setSkybox("night")', "gotowe niebo: day, cloudy, sunset, dawn, night, aurora, space, storm, candy, hell (\"\" = zwykły kolor)"],
  ['setSkybox("space", player)', "gotowe niebo tylko dla jednego gracza"],
  ["setLight(0.2, 60, player)", "jasność i mgła (bez gracza = dla wszystkich)"],
];

export const LUA_HELP_2D: [string, string][] = [
  ['saveData(player, "monety", 10)', "zapisz postęp gracza (zostaje po wyjściu z gry): liczba, tekst albo true/false"],
  ['loadData(player, "monety", 0)', "wczytaj zapis gracza (0 = gdy jeszcze nic nie ma)"],
  ['deleteData(player, "monety")', "usuń zapis"],
  ['promptPurchase(player, "VIP")', "okienko zakupu produktu ze sklepu gry (Ustawienia gry → Sklep gry)"],
  ["onPurchase(function(player, product) ... end)", "gracz coś kupił - product to nazwa produktu"],
  ['ownsProduct(player, "VIP")', "czy gracz ma kupiony produkt (kupowany raz, na zawsze)"],
  ["openShop(player)", "otwórz graczowi cały sklep gry"],
  ['onTouch("Obiekt", function(player) ... end)', "gdy gracz dotknie obiektu (nazwa obiektu albo instancji)"],
  ["onLevelEnter(function(player, level) ... end)", "gdy gracz wejdzie na poziom"],
  ["onPlayerJoin(function(player) ... end)", "gdy gracz dołączy"],
  ["onDied(function(player) ... end)", "gdy gracz zginie"],
  ["onChat(function(player, message) ... end)", "gdy gracz coś napisze"],
  ["every(sekundy, function() ... end)", "powtarzaj co X sekund"],
  ["after(sekundy, function() ... end)", "zrób raz po X sekundach"],
  ["wait(sekundy)", "czekaj (tylko wewnątrz funkcji)"],
  ['say("tekst") / tell(player, "tekst")', "wiadomość do wszystkich / do gracza"],
  ['setLevel(player, "Poziom 2")', "przenieś gracza na poziom"],
  ['showGui(player, "Menu")', "pokaż GUI graczowi (nil = wszystkim); hideGui / toggleGui tak samo"],
  ['setGuiText(player, "Licznik", "Napis", "⭐ 5")', "zmień napis w GUI (nil = wszystkim)"],
  ['isGuiOpen(player, "Menu")', "czy GUI jest otwarte u gracza"],
  ['onGuiClick(function(player, gui, button) ... end)', "gracz kliknął przycisk w GUI (nazwy z edytora GUI)"],
  ['restartLevel("Poziom 1")', "zacznij poziom od nowa (dla wszystkich na nim)"],
  ["getLevel(player)", "nazwa poziomu gracza"],
  ['getPlayersOnLevel("Poziom 1")', "lista graczy na poziomie"],
  ['playSound("nazwa", player)', "zagraj dźwięk (bez player = wszystkim)"],
  ['setAnimation("Drzwi", "Otwarte")', "zmień animację obiektu"],
  ['setText("Napis", "tekst")', "zmień napis"],
  ['hideObject("Most") / showObject("Most")', "schowaj / pokaż obiekt (dla wszystkich)"],
  ['moveObject("Boss", x, y, 0.5)', "przesuń obiekt płynnie w X sekund (0 = od razu)"],
  ['flipObject("Boss", true)', "odwróć obiekt w poziomie (false = z powrotem)"],
  ['showFor(player, "Moneta")', "przywróć zebrane przez gracza rzeczy"],
  ['countObjects("Moneta", "Poziom 1")', "ile widocznych obiektów"],
  ['createObject("Potwor", x, y, "Poziom 1")', "stwórz obiekt"],
  ['deleteObject("Potwor")', "usuń obiekt"],
  ["setSpeed(player, 400) / setJump(player, 500)", "prędkość biegu / siła skoku"],
  ['setPlayerAnimation(player, "walk", "Bieg")', "podmień animację (idle, walk, jump, fall, climb)"],
  ["resetPlayerAnimations(player)", "przywróć animacje postaci"],
  ["setForce(player, 500)", "stała siła w prawo (jazda); 0 = koniec"],
  ["jump(player)", "podskok"],
  ["lockCamera(player, x, y) / unlockCamera(player)", "zatrzymaj kamerę"],
  ["autoWalk(player, 1)", "idź sam w prawo (-1 w lewo, 0 stop)"],
  ["hidePlayer(player, true) / isHidden(player)", "schowaj gracza (np. wyszedł drzwiami)"],
  ["getCoins / setCoins / addCoins(player, 1)", "monety gracza (licznik {coins})"],
  ["teleport(player, x, y) / kill(player)", "przenieś / zabij"],
  ['setCharacter(player, "Pies")', "zmień postać (bez nazwy = wybrana)"],
  ['setBackground("#102040")', "kolor tła"],
  ["addScore(player, 1)", "punkty w rankingu"],
  ['awardBadge(player, "Nazwa odznaki")', "daj graczowi odznakę (Ustawienia gry → Odznaki)"],
  ['print("tekst")', "wypisz w konsoli"],
];

export function openScriptEditor(script: WorldScript, onSave: (s: WorldScript) => void, helpList: [string, string][] = LUA_HELP, mode: "3d" | "2d" = "3d") {
  const nameInput = h("input", { class: "script-name", value: script.name, maxLength: 40 });
  let dirty = false;
  const markDirty = () => (dirty = true);
  nameInput.addEventListener("input", markDirty);

  const body = h("div", { class: "script-body" });
  const overlay = h("div", { class: "script-editor" });
  let getResult: () => WorldScript;
  let cleanup = () => {};

  const close = async (save: boolean) => {
    if (save) onSave(getResult());
    else if (dirty && !(await ask("Masz niezapisane zmiany w skrypcie. Zamknąć bez zapisywania?", "Zamknij", "Wróć", true))) return;
    cleanup();
    overlay.remove();
    window.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      close(true);
    }
  };
  window.addEventListener("keydown", onKey, true);

  overlay.append(
    h(
      "div",
      { class: "script-top" },
      h("span", { class: "badge" }, script.type === "lua" ? "Lua" : "Bloczki"),
      nameInput,
      h("div", { class: "spacer" }),
      h("button", { class: "btn", onClick: () => close(false) }, "Anuluj"),
      h("button", { class: "btn primary", onClick: () => close(true) }, "✔ Gotowe"),
    ),
    body,
  );
  document.body.append(overlay);

  if (script.type === "lua") {
    const area = h("textarea", { class: "code", spellcheck: false, value: script.source });
    area.addEventListener("input", markDirty);
    area.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = area.selectionStart;
        area.setRangeText("  ", s, area.selectionEnd, "end");
        markDirty();
      }
    });
    const help = h(
      "div",
      { class: "help" },
      h("h3", null, "Co można użyć"),
      h("p", { class: "muted" }, "Kliknij, żeby wstawić do kodu. Klocki wskazujesz po nazwie z panelu Właściwości."),
      helpList.map(([code, desc]) =>
        h(
          "button",
          {
            class: "help-item",
            onClick: () => {
              area.setRangeText(code, area.selectionStart, area.selectionEnd, "end");
              area.focus();
              markDirty();
            },
          },
          h("code", null, code),
          h("span", null, desc),
        ),
      ),
    );
    body.append(area, help);
    area.focus();
    getResult = () => ({ ...script, name: nameInput.value.trim() || script.name, source: area.value });
  } else {
    const wsDiv = h("div", { class: "blockly" });
    const preview = h("pre", { class: "lua-preview hidden" });
    const toggle = h(
      "button",
      { class: "btn small preview-toggle", onClick: () => preview.classList.toggle("hidden") },
      "Pokaż kod Lua",
    );
    body.append(wsDiv, preview, toggle);
    const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Ładowanie bloczków…");
    wsDiv.append(loading);
    let editor: import("./blocks.ts").BlocksEditor | null = null;
    getResult = () =>
      editor
        ? { ...script, name: nameInput.value.trim() || script.name, blocks: editor.getState(), source: editor.getLua() }
        : { ...script, name: nameInput.value.trim() || script.name };
    import("./blocks.ts")
      .then(({ createBlocksEditor }) => {
        loading.remove();
        editor = createBlocksEditor(wsDiv, script.blocks, mode);
        const upd = () => (preview.textContent = editor!.getLua());
        upd();
        editor.onChange(() => {
          markDirty();
          upd();
        });
        const onResize = () => editor?.resize();
        window.addEventListener("resize", onResize);
        cleanup = () => {
          window.removeEventListener("resize", onResize);
          editor?.dispose();
        };
      })
      .catch((e) => toast("Nie udało się wczytać bloczków: " + e.message, "error"));
  }
}
