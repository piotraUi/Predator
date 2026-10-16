// Predator Studio 2D: poziomy, obiekty (obrazki, animacje, kafelki, napisy, światła, strefy),
// stawianie i przesuwanie na planszy, zachowania bez kodu, postacie, dźwięki, skrypty Lua,
// test bez serwera i zapis na serwer albo do pliku .pgame. Działa też na telefonie.
import { fileNameFor, GAME_EXT, makeGameFile, parseGameFile, type GameMeta } from "../../../shared/gamefile.ts";
import { importGDevelop } from "../../../shared/import/gdevelop.ts";
import type { WorldData, WorldInfo, WorldScript } from "../../../shared/types.ts";
import { MAX_PLAYERS_LIMIT } from "../../../shared/types.ts";
import type { Anim2D, Asset2D, Character2D, Inst2D, Level2D, LevelBg2D, Obj2D, Role2D, Solid2D, World2D } from "../../../shared/types2d.ts";
import { emptyLevel, instBox, MAX_ASSET_CHARS, newId2d, sanitizeWorld2D } from "../../../shared/world2d.ts";
import { api } from "../api.ts";
import { desktop, pickFile, pickFiles, saveTextFile } from "../files.ts";
import { AssetStore, unlockAudio } from "../game2d/assets.ts";
import { fitScale, LevelView, type Camera2D } from "../game2d/render.ts";
import { session } from "../state.ts";
import { openSettings } from "../settings.ts";
import { LUA_HELP_2D, openScriptEditor } from "../studio/scriptEditor.ts";
import type { StudioFile } from "../studio/studio.ts";
import { ask, h, isCompact, isTouch, logo, modal, toast } from "../ui/dom.ts";
import { badgeEditor } from "../studio/badgeEditor.ts";
import { genreSelect, productEditor } from "../studio/productEditor.ts";
import { openGuide, shouldShowGuide } from "../studio/toolbox.ts";
import { docTab, themeButton, useStudioTheme } from "../studioTheme.ts";
import { chooseImageSource, paintEditor, type PaintResult } from "./paint.ts";
import { KIT_2D, KIT_CATS, type Kit2D } from "./kit2d.ts";
import { Collab2D, type Change2D } from "./collab2d.ts";
import { openGuiEditor } from "../studio/guiEditor.ts";
import { chatFor, openAssistant } from "../studio/aiAssistant.ts";
import { tools2d } from "../studio/aiTools2d.ts";
import type { Editor } from "../studio/collab.ts";
import { openEditorsDialog } from "../studio/editorsDialog.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

interface Source {
  online: boolean;
  worldId?: number;
  /** twórca gry (współtwórca nie może publikować ani dodawać innych) */
  owner?: boolean;
  published: boolean;
  save(meta: GameMeta, data: WorldData, published: boolean, thumbnail?: string): Promise<void>;
}
class SaveCancelled extends Error {}

const ROLE_LABELS: Record<Role2D, string> = {
  none: "Zwykły",
  hazard: "Zabija (ogień, kolce)",
  pickup: "Do zebrania (moneta, bonus)",
  checkpoint: "Checkpoint",
  goal: "Przejście na inny poziom",
  enemy: "Potwór (chodzi)",
  jumpzone: "Potwory tu skaczą",
  button: "Przycisk (otwiera bramy)",
  gate: "Brama",
  spawn: "Start graczy",
  respawn: "Odrodzenie po śmierci",
  spring: "Trampolina (wyrzuca gracza)",
};
const SOLID_LABELS: Record<Solid2D, string> = {
  none: "Brak (można przejść)",
  solid: "Platforma / ściana",
  jumpthru: "Platforma od dołu przenikalna",
  ladder: "Drabina",
};
const KIND_ICONS: Record<Obj2D["kind"], string> = { sprite: "🖼", tiled: "▦", text: "🔤", light: "💡" };
const LAYER_LABELS: Record<Inst2D["layer"], string> = { bg: "Tło", main: "Świat", hud: "Ekran (napisy)" };

const readDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

async function imageAsset(f: File): Promise<Asset2D> {
  const data = await readDataUrl(f);
  if (data.length > MAX_ASSET_CHARS) throw new Error(`Obrazek ${f.name} jest za duży (maks. ok. 1,5 MB)`);
  const img = new Image();
  img.src = data;
  await img.decode();
  return { id: newId2d(), name: f.name, type: "image", data, w: img.naturalWidth, h: img.naturalHeight, pixel: img.naturalWidth <= 128 && img.naturalHeight <= 128 };
}

export function studio2dScreen(root: HTMLElement, params: { worldId?: number; file?: StudioFile; loaded?: { info: WorldInfo; data: WorldData } }, go: Go) {
  const canvas = h("canvas", { class: "studio-canvas studio2d-canvas" });
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Wczytywanie gry…");
  const viewport = h("div", { class: "studio-viewport" }, canvas, loading);
  const el = h("div", { class: "studio studio2d" }, viewport);
  root.append(el);
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const file = params.file;
  const exitScreen = () => (session.user ? go("home", { tab: "create" }) : go("offline"));

  if (file) {
    let path = file.path;
    const src: Source = {
      online: false,
      published: false,
      async save(meta, data) {
        const saved = await saveTextFile(file.fileName ?? fileNameFor(meta.name, GAME_EXT), makeGameFile(meta, data), GAME_EXT, path);
        if (!saved) throw new SaveCancelled();
        if (desktop) path = saved;
        file.path = path;
      },
    };
    queueMicrotask(() => start({ ...file.meta }, file.data, src, file.dirty ?? false));
  } else {
    const worldId = params.worldId!;
    (params.loaded ? Promise.resolve(params.loaded) : api.getWorld(worldId))
      .then(({ info, data }) => {
        if (disposed) return;
        const src: Source = {
          online: true,
          worldId,
          owner: info.ownerId === session.user?.id,
          published: info.published,
          async save(meta, d, published, thumbnail) {
            const res = await api.saveWorld(worldId, { ...meta, published, data: d, thumbnail });
            // gra czeka na sprawdzenie przez moderację (serwer publikuje ją sam, gdy wszystko jest dobrze)
            if (res.moderation) toast(res.moderation);
            src.published = res.published;
          },
        };
        start({ name: info.name, description: info.description, maxPlayers: info.maxPlayers }, data, src, false);
      })
      .catch((e) => {
        toast(e.message, "error");
        exitScreen();
      });
  }

  function start(meta: GameMeta, data: WorldData, src: Source, startDirty: boolean) {
    loading.remove();
    if (!data.world2d) data.world2d = sanitizeWorld2D({});
    data.mode = "2d";
    const w: World2D = data.world2d;
    const assets = AssetStore.forWorld(w);
    const view = new LevelView(w, assets);
    const ctx = canvas.getContext("2d")!;
    let level: Level2D = w.levels.find((l) => l.id === w.startLevel) ?? w.levels[0];
    view.setLevel(level);
    let selected: Inst2D | null = null;
    let editObj: Obj2D | null = null;
    let brush: Obj2D | null = null;
    /** zaznaczonych kilka naraz (Shift + klik albo ramka) - "selected" to główny z nich */
    let multi: Inst2D[] = [];
    /** wszystkie zaznaczone */
    const sel = (): Inst2D[] => (multi.length ? multi : selected ? [selected] : []);
    const isSel = (i: Inst2D) => i === selected || multi.includes(i);
    function selectOnly(i: Inst2D | null) {
      selected = i;
      multi = [];
    }
    /** skopiowane obiekty (Ctrl+C) - można wkleić na innym poziomie */
    let clipboard: Inst2D[] = [];
    let showGrid = true;
    /** telefon (bez Shift): przeciąganie po pustym zaznacza ramką */
    let boxMode = false;
    let levelTab: "general" | "bg" = "general";
    let objFilter = "";
    let grid = 8;
    let dirty = false;
    const undo: string[] = [];
    const redo: string[] = [];
    const cam: Camera2D = { x: 0, y: 0, scale: 1 };
    let zoom = 1;
    const objById = (id: string) => w.objects.find((o) => o.id === id);

    // ---------- cofanie ----------
    const snapshot = () => JSON.stringify({ levels: w.levels, objects: w.objects, characters: w.characters, startLevel: w.startLevel, scripts: data.scripts, guis: data.guis ?? null, physics: w.physics });
    function changed(keepRedo = false) {
      dirty = true;
      desktop?.setDirty(true);
      saveBtn.classList.add("unsaved");
      if (!keepRedo) redo.length = 0;
    }
    function remember() {
      undo.push(snapshot());
      if (undo.length > 60) undo.shift();
      changed();
    }
    function restore(json: string) {
      const s = JSON.parse(json);
      w.levels = s.levels;
      w.objects = s.objects;
      w.characters = s.characters;
      w.startLevel = s.startLevel;
      data.scripts = s.scripts;
      if (s.physics) w.physics = s.physics;
      if (s.guis) data.guis = s.guis;
      else if (s.guis === null) delete data.guis;
      level = w.levels.find((l) => l.id === level.id) ?? w.levels[0];
      selected = selected ? (level.instances.find((i) => i.id === selected!.id) ?? null) : null;
      multi = multi.map((m) => level.instances.find((i) => i.id === m.id)).filter((m): m is Inst2D => !!m);
      editObj = editObj ? (objById(editObj.id) ?? null) : null;
      view.refreshObjects();
      view.setLevel(level);
      renderAll();
    }
    const doUndo = () => {
      const s = undo.pop();
      if (!s) return;
      redo.push(snapshot());
      restore(s);
      changed(true);
    };
    const doRedo = () => {
      const s = redo.pop();
      if (!s) return;
      undo.push(snapshot());
      restore(s);
      changed(true);
    };

    // ---------- zapis i test ----------
    function captureThumbnail(): string | undefined {
      try {
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 360;
        const x = c.getContext("2d")!;
        const s = fitScale(640, 360, level.zoom);
        const first = level.instances.find((i) => objById(i.obj)?.role === "spawn");
        const c2: Camera2D = first ? { x: first.x + 200, y: first.y, scale: s } : { ...cam, scale: s };
        view.draw(x, 640, 360, c2, 0, []);
        const url = c.toDataURL("image/jpeg", 0.85);
        return url.length < 390_000 ? url : undefined;
      } catch {
        return undefined;
      }
    }
    async function save(quiet = false) {
      try {
        await src.save(meta, data, src.published, src.online ? captureThumbnail() : undefined);
        dirty = false;
        desktop?.setDirty(false);
        saveBtn.classList.remove("unsaved");
        if (!quiet) toast(src.online ? "Zapisano na serwerze ✔" : "Zapisano plik ✔", "good");
        return true;
      } catch (e) {
        if (!(e instanceof SaveCancelled)) toast((e as Error).message, "error");
        return false;
      }
    }
    const fileState = (): StudioFile => ({ meta, data, path: file?.path, fileName: file?.fileName, dirty });
    function testOffline() {
      go("play", { offline: { name: meta.name, data }, back: { screen: "studio", params: file ? { file: fileState() } : { worldId: params.worldId } } });
    }
    /** Testuj: osobna, lokalna gra - bez serwera i bez innych graczy */
    async function test() {
      testOffline();
    }
    async function testOnline() {
      if (!src.online) return testOffline();
      if (await save(true)) go("play", { worldId: params.worldId, back: { screen: "studio", params: { worldId: params.worldId } } });
    }
    async function confirmLeave() {
      if (!dirty) return true;
      if (await ask("Zapisać zmiany?", "Zapisz", "Nie zapisuj")) return save(true);
      return true;
    }
    async function exportFile() {
      const saved = await saveTextFile(fileNameFor(meta.name, GAME_EXT), makeGameFile(meta, data), GAME_EXT);
      if (saved) toast("Zapisano plik " + saved.split(/[\\/]/).pop(), "good");
    }
    async function openFile() {
      if (!(await confirmLeave())) return;
      const f = await pickFile([GAME_EXT], "Gra Predator");
      if (!f) return;
      try {
        const { data: d, ...m } = parseGameFile(f.text);
        go("studio", { file: { meta: m, data: d, path: f.path, fileName: f.name } });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    async function upload() {
      if (!session.user) return toast("Zaloguj się na serwerze, żeby wysłać grę", "error");
      try {
        const created = await api.createWorld(meta.name, "2d");
        await api.saveWorld(created.id, { ...meta, data, thumbnail: captureThumbnail() });
        toast("Gra wysłana na serwer ✔", "good");
        dirty = false;
        desktop?.setDirty(false);
        go("studio", { worldId: created.id });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }

    /** Import gry z GDevelopa (zip z eksportu HTML5) - dodaje poziomy, obiekty i grafiki */
    async function importGD() {
      const [f] = await pickFiles([".zip"]);
      if (!f) return;
      try {
        toast("Wczytywanie " + f.name + "…");
        const { unzipSync } = await import("fflate");
        const files = new Map(Object.entries(unzipSync(new Uint8Array(await f.arrayBuffer()))));
        const res = importGDevelop(files);
        remember();
        const imported = sanitizeWorld2D(res.world);
        w.assets.push(...imported.assets);
        for (const a of imported.assets) assets.add(a);
        w.objects.push(...imported.objects);
        w.characters.push(...imported.characters);
        w.levels.push(...imported.levels.filter((l) => l.instances.length));
        view.refreshObjects();
        await assets.ready;
        renderAll();
        modal(
          "Zaimportowano z GDevelopa",
          h(
            "div",
            null,
            h("p", null, `Poziomy: ${imported.levels.filter((l) => l.instances.length).length}, obiekty: ${imported.objects.length}, obrazki i dźwięki: ${imported.assets.length}.`),
            ...res.notes.map((n) => h("p", { class: "muted" }, n)),
            h("p", { class: "muted" }, "Ustaw obiektom zachowania (np. „Zabija”, „Do zebrania”) w panelu Właściwości, a resztę logiki napisz w Lua."),
          ),
        );
      } catch (e) {
        toast("Nie udało się zaimportować: " + (e as Error).message, "error");
      }
    }

    // ---------- pasek narzędzi ----------
    function toggleMenu(menu: HTMLElement, e: Event) {
      for (const m of el.querySelectorAll(".dropdown")) if (m !== menu) m.classList.add("hidden");
      menu.classList.toggle("hidden");
      if (menu.classList.contains("hidden")) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + "px";
      menu.style.top = r.bottom + 4 + "px";
    }
    const closeMenus = () => el.querySelectorAll(".dropdown").forEach((m) => m.classList.add("hidden"));
    const item = (label: string, fn: () => void) => h("button", { class: "dd-item", onClick: () => (closeMenus(), fn()) }, label);
    const fileMenu = h(
      "div",
      { class: "dropdown hidden" },
      item("💾 Zapisz jako plik .pgame", exportFile),
      item("📂 Otwórz plik .pgame", openFile),
      item("📦 Importuj grę z GDevelopa (.zip)", importGD),
      item("🎮 Testuj bez serwera", testOffline),
      ...(src.online ? [item("🌐 Zapisz i zagraj na serwerze", () => void testOnline())] : []),
      !src.online ? item("☁ Wyślij na serwer", upload) : null,
    );
    const saveBtn = h("button", { class: "tb-btn", onClick: () => save(), title: "Zapisz (Ctrl+S)" }, "💾", h("span", null, "Zapisz"));
    const gridSel = h(
      "select",
      { class: "tb-select", title: "Siatka", onChange: (e: Event) => (grid = Number((e.target as HTMLSelectElement).value)) },
      [1, 4, 8, 16, 32].map((v) => h("option", { value: String(v), selected: v === grid }, v === 1 ? "Bez siatki" : `Siatka ${v}`)),
    );
    const brushInfo = h("span", { class: "tb-mode hidden" });
    /** kto jeszcze edytuje + zarządzanie współtwórcami */
    const aiBtn = h("button", { class: "tb-btn ai", onClick: () => openAi(), title: "Asystent AI - napisz, co zrobić, a zbuduje to sam" }, "🤖", h("span", null, "AI"));
    const editorsBtn = h("button", {
      class: "tb-btn editors-btn",
      title: "Współpraca - kto edytuje i kto może edytować",
      onClick: () => src.worldId && openEditorsDialog(src.worldId, !!src.owner, exitScreen, "kolorowe kropki na planszy"),
    });
    const toolbar = h(
      "div",
      { class: "studio-toolbar" },
      logo(true, "tb-logo"),
      h(
        "button",
        {
          class: "tb-btn",
          onClick: async () => {
            if (await confirmLeave()) {
              desktop?.setDirty(false);
              exitScreen();
            }
          },
        },
        "←",
        h("span", null, "Wyjdź"),
      ),
      saveBtn,
      src.online ? editorsBtn : "",
      h("button", { class: "tb-btn play", onClick: () => test(), title: "Zagraj w swoją grę w osobnym teście (bez serwera, tylko Ty)" }, "▶", h("span", null, "Testuj")),
      aiBtn,
      h("div", { class: "dd-wrap" }, h("button", { class: "tb-btn", onClick: (e: Event) => toggleMenu(fileMenu, e) }, "📁", h("span", null, "Plik")), fileMenu),
      h("span", { class: "tb-mode " + (src.online ? "on" : ""), title: src.online ? "Gra na serwerze" : "Gra z pliku - bez serwera" }, src.online ? "☁ serwer · 2D" : "📄 plik · 2D"),
      h("div", { class: "tb-sep" }),
      gridSel,
      h("button", { class: "tb-btn accent", onClick: () => newObject(), title: "Nowy obiekt (obrazek, kafelki, napis...)" }, "＋", h("span", null, "Obiekt")),
      brushInfo,
      h("button", { class: "tb-btn", onClick: duplicate, title: "Duplikuj (Ctrl+D)" }, "⧉", h("span", null, "Duplikuj")),
      h("button", { class: "tb-btn", onClick: removeSelected, title: "Usuń (Delete)" }, "🗑", h("span", null, "Usuń")),
      h("button", { class: "tb-btn", onClick: () => zOrder(1), title: "Na wierzch" }, "⬆", h("span", null, "Wyżej")),
      h("button", { class: "tb-btn", onClick: () => zOrder(-1), title: "Pod spód" }, "⬇", h("span", null, "Niżej")),
      h("button", { class: "tb-btn", onClick: doUndo, title: "Cofnij (Ctrl+Z)" }, "↶"),
      h("button", { class: "tb-btn", onClick: doRedo, title: "Ponów (Ctrl+Y)" }, "↷"),
      h("div", { class: "tb-sep" }),
      h("button", { class: "tb-btn", onClick: () => openGuis(), title: "GUI: menu, okienka, przyciski i napisy na ekranie gracza" }, "🪟", h("span", null, "GUI")),
      h("button", { class: "tb-btn", onClick: () => openGameSettings(), title: "Nazwa, fizyka, dźwięki, odznaki, publikacja" }, "⚙", h("span", null, "Gra")),
      h("button", { class: "tb-btn", onClick: () => openSettings() }, "🎚", h("span", null, "Ustawienia")),
      h("button", { class: "tb-btn", onClick: () => openGuide("2d"), title: "Jak zrobić grę - przewodnik" }, "❓", h("span", null, "Pomoc")),
      themeButton(),
    );

    // ---------- panele ----------
    const levelsList = h("div", { class: "panel-body" });
    const objectsList = h("div", { class: "panel-body obj-list" });
    const charsList = h("div", { class: "panel-body" });
    const soundsList = h("div", { class: "panel-body" });
    const scriptsList = h("div", { class: "panel-body" });
    const props = h("div", { class: "panel-body" });
    const title = (text: string, ...actions: Node[]) => h("div", { class: "panel-title" }, text, actions.length ? h("span", { class: "panel-actions" }, actions) : null);
    const small = (label: string, fn: () => void, t?: string) => h("button", { class: "btn small", onClick: fn, title: t }, label);
    // lewy panel w zakładkach - jak w Studio 3D
    const kitBody = h("div", { class: "panel-body toolbox" });
    const objSearch = h("input", { class: "obj-search", type: "search", placeholder: "🔍 Szukaj obiektu…" });
    objSearch.addEventListener("input", () => {
      objFilter = objSearch.value;
      renderObjects();
    });
    const page = (...kids: (Node | string)[]) => h("div", { class: "ltab-page" }, ...kids);
    const LEFT_TABS: { id: string; icon: string; label: string; page: HTMLElement }[] = [
      { id: "kit", icon: "🧱", label: "Zestaw", page: page(title("Zestaw - kliknij i postaw"), h("p", { class: "panel-hint" }, "Gotowe rzeczy z zachowaniem. Kliknij, a potem planszę."), kitBody) },
      {
        id: "objects",
        icon: "🖼️",
        label: "Obiekty",
        page: page(
          title("Obiekty w grze", small("+ Nowy", () => newObject())),
          h("p", { class: "panel-hint" }, "Kliknij obiekt, a potem planszę (przeciągnij, żeby malować). ✎ = obrazki, rysowanie i zachowanie."),
          objSearch,
          objectsList,
        ),
      },
      { id: "levels", icon: "🗺️", label: "Poziomy", page: page(title("Poziomy", small("+ Nowy", () => addLevel())), levelsList) },
      { id: "chars", icon: "🧍", label: "Postacie", page: page(title("Postacie", small("+ Nowa", () => editCharacter(null))), h("p", { class: "panel-hint" }, "Postać gracza: obrazki z obiektu i nazwy animacji (chodzenie, skok...)."), charsList) },
      { id: "sounds", icon: "🔊", label: "Dźwięki", page: page(title("Dźwięki", small("+ Dodaj", () => addSounds())), soundsList) },
      {
        id: "scripts",
        icon: "📜",
        label: "Skrypty",
        page: page(
          title("Skrypty", small("+ Bloczki", () => addScript("blocks"), "Programowanie bloczkami jak w Scratchu"), small("+ Lua", () => addScript("lua"))),
          h("p", { class: "panel-hint" }, "Najłatwiej: Bloczki - układasz je jak w Scratchu. Lua = pisanie kodu."),
          scriptsList,
        ),
      },
    ];
    const leftTabs = h(
      "div",
      { class: "ltabs" },
      LEFT_TABS.map((t) => h("button", { class: "ltab", "data-ltab": t.id, title: t.label, onClick: () => showLeftTab(t.id) }, h("span", { class: "ltab-ic" }, t.icon), h("span", null, t.label))),
    );
    const leftPages = h("div", { class: "ltab-pages" });
    const leftPanel = h("aside", { class: "studio-panel left" }, leftTabs, leftPages);
    function showLeftTab(id: string) {
      const t = LEFT_TABS.find((x) => x.id === id) ?? LEFT_TABS[0];
      leftPages.replaceChildren(t.page);
      for (const b of leftTabs.querySelectorAll<HTMLElement>(".ltab")) b.classList.toggle("active", b.dataset.ltab === t.id);
      if (isCompact()) {
        rightPanel.classList.remove("open");
        leftPanel.classList.add("open");
        syncMobileTabs();
      }
    }
    const closeBtn = () => h("button", { class: "panel-close", title: "Zamknij", onClick: () => closePanels() }, "✕");
    leftTabs.append(closeBtn());
    const rightPanel = h("aside", { class: "studio-panel right" }, h("div", { class: "panel-title" }, "Właściwości", closeBtn()), props);
    const mobileTabs = h(
      "div",
      { class: "studio-mtabs" },
      h("button", { onClick: () => togglePanel(leftPanel) }, "🧱 Zestaw i obiekty"),
      h("button", { onClick: () => togglePanel(rightPanel) }, "🔧 Właściwości"),
    );
    function togglePanel(p: HTMLElement) {
      const open = !p.classList.contains("open");
      leftPanel.classList.remove("open");
      rightPanel.classList.remove("open");
      if (open) p.classList.add("open");
      syncMobileTabs();
    }
    function closePanels() {
      leftPanel.classList.remove("open");
      rightPanel.classList.remove("open");
      syncMobileTabs();
    }
    function syncMobileTabs() {
      const [a, b] = mobileTabs.children;
      a.classList.toggle("on", leftPanel.classList.contains("open"));
      b.classList.toggle("on", rightPanel.classList.contains("open"));
    }
    // stuknięcie w planszę zamyka wysunięty panel (telefon)
    canvas.addEventListener("pointerdown", () => isCompact() && closePanels(), true);

    // pływający pasek pod palec (telefon)
    const fabBtn = (icon: string, label: string, onClick: () => void, cls = "") =>
      h("button", { class: cls, title: label, onClick: (e: Event) => (e.stopPropagation(), onClick()) }, icon, h("small", null, label));
    const fab = {
      add: fabBtn("＋", "Dodaj", () => showLeftTab("kit"), "accent"),
      stop: fabBtn("✋", "Koniec", () => setBrush(null)),
      box: fabBtn("▢", "Ramka", () => {
        boxMode = !boxMode;
        updateFab();
        if (boxMode) toast("Przeciągnij palcem po planszy, żeby zaznaczyć kilka obiektów");
      }),
      dup: fabBtn("⧉", "Kopia", () => duplicate()),
      del: fabBtn("🗑", "Usuń", () => removeSelected()),
      up: fabBtn("⬆", "Wyżej", () => zOrder(1)),
      down: fabBtn("⬇", "Niżej", () => zOrder(-1)),
      props: fabBtn("🔧", "Cechy", () => togglePanel(rightPanel)),
      undo: fabBtn("↶", "Cofnij", () => doUndo()),
    };
    const fabBar = h("div", { class: "studio-fab" }, fab.add, fab.stop, fab.box, h("div", { class: "fab-sep" }), fab.dup, fab.del, fab.up, fab.down, fab.props, h("div", { class: "fab-sep" }), fab.undo);
    function updateFab() {
      fab.stop.classList.toggle("hidden", !brush);
      fab.stop.classList.toggle("on", !!brush);
      fab.box.classList.toggle("on", boxMode);
      for (const b of [fab.dup, fab.del, fab.up, fab.down]) (b as HTMLButtonElement).disabled = !selected;
    }
    viewport.append(fabBar);

    // pasek stanu na dole planszy: pozycja kursora, przybliżenie, liczba obiektów i szybkie przyciski widoku
    const stPos = h("span", { class: "st-pos" });
    const stInfo = h("span", { class: "st-info" });
    const stZoom = h("span", { class: "st-zoom" });
    const stBtn = (label: string, title: string, fn: () => void) => h("button", { class: "st-btn", title, onClick: (e: Event) => (e.stopPropagation(), fn()) }, label);
    const gridBtn = stBtn("▦", "Pokaż / ukryj siatkę (G)", () => ((showGrid = !showGrid), updateStatus()));
    const statusBar = h(
      "div",
      { class: "studio-status" },
      stPos,
      stInfo,
      h("span", { class: "st-sep" }),
      stBtn("−", "Oddal (-)", () => zoomBy(0.8)),
      stZoom,
      stBtn("+", "Przybliż (+)", () => zoomBy(1.25)),
      stBtn("⛶", "Cały poziom (0)", () => fitLevel()),
      stBtn("⌂", "Do startu (Home)", () => centerOnLevel()),
      gridBtn,
      stBtn("⌨", "Skróty klawiszowe (?)", () => openShortcuts()),
    );
    viewport.append(statusBar);
    function updateStatus() {
      stPos.textContent = hover ? `X ${Math.round(hover.wx)}  Y ${Math.round(hover.wy)}` : "";
      const n = sel().length;
      stInfo.textContent = `${level.instances.length} obiektów` + (n > 1 ? ` · zaznaczono ${n}` : "") + (brush ? ` · stawiasz: ${brush.name}` : "");
      gridBtn.classList.toggle("on", showGrid && grid > 1);
    }
    function openShortcuts() {
      const rows: [string, string][] = [
        ["Klik", "zaznacz obiekt (przeciągnij, żeby przesunąć)"],
        ["Shift + klik", "dodaj / usuń z zaznaczenia"],
        ["Shift + przeciągnij", "zaznacz ramką kilka obiektów"],
        ["Ctrl + A", "zaznacz wszystko na poziomie"],
        ["Ctrl + C / X / V", "kopiuj / wytnij / wklej w miejscu kursora (też na innym poziomie)"],
        ["Ctrl + D", "duplikuj"],
        ["Delete", "usuń zaznaczone"],
        ["Strzałki", "przesuń o kratkę siatki (z Shift o 1 piksel)"],
        ["R / Shift + R", "obróć o 90° w prawo / w lewo"],
        ["F", "odbij w poziomie"],
        ["L", "zablokuj (nie da się kliknąć - np. tło)"],
        ["G", "pokaż / ukryj siatkę"],
        ["Obiekt + przeciąganie", "maluj - stawia obiekt jeden obok drugiego"],
        ["Esc", "koniec stawiania, odznacz"],
        ["Kółko / + / -", "przybliż / oddal"],
        ["0 / Home", "cały poziom / do startu"],
        ["Prawy przycisk", "przesuwanie widoku"],
        ["Ctrl + Z / Y", "cofnij / ponów"],
        ["Ctrl + F", "szukaj obiektu"],
        ["Ctrl + S", "zapisz"],
      ];
      modal("Skróty w Studio 2D", h("table", { class: "shortcuts" }, rows.map(([k, v]) => h("tr", null, h("td", null, h("kbd", null, k)), h("td", null, v)))));
    }
    // wygląd Roblox: karta gry nad widokiem (w oryginalnym wyglądzie niewidoczna)
    const doc = docTab(() => meta.name, () => dirty, () => (toolbar.querySelector(".tb-btn") as HTMLElement | null)?.click());
    cleanups.push(useStudioTheme());
    el.append(toolbar, doc.el, h("div", { class: "studio-main" }, leftPanel, viewport, rightPanel), mobileTabs);

    // ---------- listy ----------
    function thumbOf(o: Obj2D): Node {
      const id = o.anims[0]?.frames[0];
      const a = id ? w.assets.find((x) => x.id === id) : undefined;
      if (a) return h("img", { class: "obj-thumb", src: a.data, alt: "" });
      return h("span", { class: "obj-thumb icon" }, o.kind === "sprite" && !o.anims.some((x) => x.frames.length) ? "▢" : KIND_ICONS[o.kind]);
    }
    function renderLevels() {
      levelsList.replaceChildren(
        ...w.levels.map((l) =>
          h(
            "button",
            { class: "tree-item " + (l.id === level.id ? "active" : ""), onClick: () => switchLevel(l) },
            h("span", { class: "tree-icon" }, l.id === w.startLevel ? "⭐" : l.menu ? "🪟" : "🗺"),
            l.name,
            h("span", { class: "tree-kind" }, String(l.instances.length)),
          ),
        ),
      );
    }
    function renderObjects() {
      const q = objFilter.trim().toLowerCase();
      const list = q ? w.objects.filter((o) => o.name.toLowerCase().includes(q)) : w.objects;
      objectsList.replaceChildren(
        ...(list.length ? [] : [h("p", { class: "panel-hint" }, "Brak obiektów o tej nazwie")]),
        ...list.map((o) =>
          h(
            "div",
            { class: "obj-row " + (brush?.id === o.id ? "brush " : "") + (editObj?.id === o.id && !selected ? "active" : "") },
            h(
              "button",
              {
                class: "tree-item",
                title: "Kliknij, a potem planszę, żeby postawić",
                onClick: () => {
                  setBrush(brush?.id === o.id ? null : o);
                  selectOnly(null);
                  editObj = o;
                  renderAll();
                },
              },
              thumbOf(o),
              h("span", { class: "obj-name" }, o.name),
              o.role !== "none" ? h("span", { class: "tree-kind" }, ROLE_LABELS[o.role].split(" ")[0]) : null,
            ),
            h("button", { class: "icon-btn", title: "Edytuj obiekt", onClick: () => ((editObj = o), selectOnly(null), setBrush(null), renderAll()) }, "✎"),
          ),
        ),
      );
    }
    function renderCharacters() {
      charsList.replaceChildren(
        ...w.characters.map((c) =>
          h(
            "button",
            { class: "tree-item", onClick: () => editCharacter(c) },
            h("span", { class: "tree-icon" }, c.npc ? "🐾" : "🧍"),
            c.name,
            c.companion ? h("span", { class: "tree-kind" }, "+ towarzysz") : null,
          ),
        ),
        w.characters.length ? "" : h("div", { class: "muted small pad" }, "Dodaj postać, żeby dało się grać."),
      );
    }
    function renderSounds() {
      soundsList.replaceChildren(
        ...w.assets
          .filter((a) => a.type === "sound")
          .map((a) =>
            h(
              "div",
              { class: "script-item" },
              h("button", { class: "icon-btn", title: "Posłuchaj", onClick: () => (unlockAudio(), assets.play(a.id)) }, "▶"),
              h("span", { class: "script-open" }, a.name),
              h(
                "button",
                {
                  class: "icon-btn",
                  title: "Usuń",
                  onClick: async () => {
                    if (!(await ask(`Usunąć dźwięk ${a.name}?`, "Usuń", "Anuluj", true))) return;
                    w.assets = w.assets.filter((x) => x.id !== a.id);
                    for (const k of Object.keys(w.sounds) as (keyof World2D["sounds"])[]) if (w.sounds[k] === a.id) delete w.sounds[k];
                    changed();
                    renderSounds();
                  },
                },
                "🗑",
              ),
            ),
          ),
      );
    }
    function renderScripts() {
      scriptsList.replaceChildren(
        ...data.scripts.map((s) =>
          h(
            "div",
            { class: "script-item" },
            h("input", {
              type: "checkbox",
              checked: s.enabled,
              title: "Włączony",
              onChange: (e: Event) => {
                remember();
                s.enabled = (e.target as HTMLInputElement).checked;
              },
            }),
            h("button", { class: "script-open", onClick: () => editScript(s) }, (s.type === "blocks" ? "🧩 " : "📜 ") + s.name),
            h(
              "button",
              {
                class: "icon-btn",
                onClick: async () => {
                  if (!(await ask(`Usunąć skrypt ${s.name}?`, "Usuń", "Anuluj", true))) return;
                  remember();
                  data.scripts = data.scripts.filter((x) => x.id !== s.id);
                  renderScripts();
                },
              },
              "🗑",
            ),
          ),
        ),
      );
    }
    /** Zestaw: kafelki z gotowymi obiektami */
    function renderKit() {
      kitBody.replaceChildren(
        ...KIT_CATS.flatMap((cat) => [
          h("div", { class: "tbx-cat" }, cat),
          h(
            "div",
            { class: "tbx-grid" },
            KIT_2D.filter((k) => k.cat === cat).map((k) =>
              h("button", { class: "tbx-item", title: k.name, onClick: () => addKit(k) }, h("span", { class: "tbx-ic" }, k.icon), h("span", { class: "tbx-name" }, k.name)),
            ),
          ),
        ]),
      );
    }
    async function addKit(k: Kit2D) {
      const { assets: list, obj: o } = k.make();
      remember();
      for (const a of list) {
        w.assets.push(a);
        await assets.add(a);
      }
      let n = 2;
      const baseName = o.name;
      while (w.objects.some((x) => x.name === o.name)) o.name = `${baseName} ${n++}`;
      w.objects.push(o);
      view.refreshObjects();
      editObj = o;
      selectOnly(null);
      setBrush(o);
      renderAll();
      if (!isCompact()) toast(`Kliknij na planszy, żeby postawić: ${o.name}. Esc = koniec`);
    }

    function renderAll() {
      renderLevels();
      renderObjects();
      renderCharacters();
      renderSounds();
      renderScripts();
      renderProps();
    }

    function setBrush(o: Obj2D | null) {
      brush = o;
      brushInfo.classList.toggle("hidden", !o);
      brushInfo.textContent = o ? "Stawiasz: " + o.name + " (Esc = koniec)" : "";
      canvas.style.cursor = o ? "copy" : "";
      renderObjects();
      updateFab();
      updateStatus();
      // na telefonie od razu pokazujemy planszę, żeby stuknięciem stawiać obiekt
      if (o && isCompact()) {
        closePanels();
        toast("Stuknij planszę, żeby postawić: " + o.name + ". ✋ = koniec");
      }
    }

    function switchLevel(l: Level2D) {
      level = l;
      selectOnly(null);
      view.setLevel(l);
      centerOnLevel();
      renderAll();
    }

    function addLevel() {
      remember();
      const l = emptyLevel("Poziom " + (w.levels.length + 1));
      const spawn = w.objects.find((o) => o.role === "spawn");
      if (spawn) l.instances.push({ id: newId2d(), obj: spawn.id, x: 40, y: 100, w: spawn.w, h: spawn.h, z: 0, layer: "main" });
      w.levels.push(l);
      switchLevel(l);
    }

    // ---------- właściwości ----------
    const field = (label: string, input: HTMLElement, hint?: string) => h("label", { class: "prop" }, label, input, hint ? h("span", { class: "hint" }, hint) : null);
    const numIn = (value: number, set: (v: number) => void, step = 1) => {
      const i = h("input", { type: "number", value: String(Math.round(value * 1000) / 1000), step: String(step) });
      i.addEventListener("change", () => {
        const v = Number(i.value);
        if (!Number.isFinite(v)) return;
        remember();
        set(v);
        view.invalidate();
        renderLevels();
      });
      return i;
    };
    const textIn = (value: string, set: (v: string) => void, placeholder = "") => {
      const i = h("input", { value, placeholder, maxLength: 200 });
      i.addEventListener("change", () => {
        remember();
        set(i.value);
        view.invalidate();
        renderLevels();
        renderObjects();
      });
      return i;
    };
    const checkIn = (label: string, value: boolean, set: (v: boolean) => void) => {
      const i = h("input", { type: "checkbox", checked: value });
      i.addEventListener("change", () => {
        remember();
        set(i.checked);
        view.invalidate();
        renderProps();
      });
      return h("label", { class: "prop check" }, i, label);
    };
    const selectIn = (options: [string, string][], value: string, set: (v: string) => void) => {
      const s = h("select", null, options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)));
      s.addEventListener("change", () => {
        remember();
        set(s.value);
        view.invalidate();
        renderAll();
      });
      return s;
    };
    const colorIn = (value: string, set: (v: string) => void) => {
      const i = h("input", { type: "color", value });
      i.addEventListener("change", () => {
        remember();
        set(i.value);
        view.background = level.background;
        view.invalidate();
      });
      return i;
    };
    const pair = (a: HTMLElement, b: HTMLElement) => h("div", { class: "xy" }, a, b);

    function renderProps() {
      updateFab();
      updateStatus();
      if (multi.length > 1) return renderMultiProps(multi);
      if (selected) return renderInstProps(selected);
      if (editObj) return renderObjProps(editObj);
      renderLevelProps();
    }

    function levelTabs() {
      const tab = (id: typeof levelTab, label: string) =>
        h("button", { class: "ptab " + (levelTab === id ? "active" : ""), onClick: () => ((levelTab = id), renderProps()) }, label);
      return h("div", { class: "ptabs" }, tab("general", "⚙ Poziom"), tab("bg", "🖼 Tło"));
    }

    /** zakładka "Tło": kolor i obrazek tła poziomu (bez stawiania obiektu na planszy) */
    function renderBgProps() {
      const l = level;
      const bg = l.bg;
      const images = w.assets.filter((a) => a.type === "image");
      const setImage = (id: string) => {
        remember();
        l.bg = { ...(l.bg ?? { mode: "cover", parallax: 0, scale: 1, x: 0, y: 0, opacity: 1 }), image: id };
        renderProps();
      };
      const upload = async () => {
        const picked = await pickImages("Obrazek tła", false);
        const a = picked?.list[0];
        if (!a) return;
        a.name = "tło " + l.name;
        w.assets.push(a);
        await assets.add(a);
        setImage(a.id);
      };
      const cur = bg && w.assets.find((a) => a.id === bg.image);
      const tiled = bg && (bg.mode === "tile" || bg.mode === "tileX");
      const MODES: [LevelBg2D["mode"], string][] = [
        ["cover", "Wypełnij ekran (przycięte brzegi)"],
        ["fit", "Cały obrazek (bez przycinania)"],
        ["stretch", "Rozciągnij na ekran"],
        ["tile", "Kafelki na cały ekran"],
        ["tileX", "Pas kafelków w poziomie (góry, chmury)"],
      ];
      props.replaceChildren(
        levelTabs(),
        h("div", { class: "prop-group" }, "Tło poziomu"),
        field("Kolor tła", colorIn(l.background, (v) => (l.background = v)), "Widać go tam, gdzie nie ma obrazka"),
        h(
          "div",
          { class: "bg-current" },
          cur ? h("img", { class: "bg-preview", src: cur.data, alt: cur.name }) : h("div", { class: "bg-preview empty" }, "Bez obrazka"),
          h(
            "div",
            { class: "bg-buttons" },
            h("button", { class: "btn small primary", onClick: upload }, cur ? "Zmień obrazek" : "📁 Wgraj / 🎨 narysuj"),
            cur ? h("button", { class: "btn small", onClick: () => (remember(), delete l.bg, renderProps()) }, "Usuń obrazek") : null,
          ),
        ),
        bg
          ? h(
              "div",
              null,
              field("Jak ułożyć", selectIn(MODES, bg.mode, (v) => (bg.mode = v as LevelBg2D["mode"]))),
              tiled
                ? h(
                    "div",
                    null,
                    field("Przesuwanie z kamerą (0 - 1)", numIn(bg.parallax, (v) => (bg.parallax = Math.min(1, Math.max(0, v))), 0.1), "0 = stoi w miejscu, 0.3 = daleko (parallax), 1 = jak świat"),
                    field("Skala kafelków", numIn(bg.scale, (v) => (bg.scale = Math.min(50, Math.max(0.05, v))), 0.1)),
                    field("Przesunięcie X / Y", pair(numIn(bg.x, (v) => (bg.x = v)), numIn(bg.y, (v) => (bg.y = v)))),
                  )
                : h("p", { class: "hint" }, "Obrazek jest przyklejony do ekranu - nie przesuwa się z kamerą. Do przesuwania wybierz kafelki."),
              field("Nieprzezroczystość (0 - 1)", numIn(bg.opacity, (v) => (bg.opacity = Math.min(1, Math.max(0, v))), 0.1)),
            )
          : "",
        images.length
          ? h(
              "div",
              { class: "prop" },
              h("span", null, "Albo wybierz obrazek z gry"),
              h(
                "div",
                { class: "bg-gallery" },
                images.slice(0, 120).map((a) =>
                  h("button", { class: "bg-pick " + (bg?.image === a.id ? "active" : ""), title: a.name, onClick: () => setImage(a.id) }, h("img", { src: a.data, alt: a.name, loading: "lazy" })),
                ),
              ),
            )
          : "",
        h("p", { class: "hint" }, "Tło jest w ustawieniach poziomu - nie trzeba stawiać obiektu na planszy. Widać je w Studio i w grze."),
      );
    }

    function renderLevelProps() {
      const l = level;
      if (levelTab === "bg") return renderBgProps();
      const locked = l.instances.filter((i) => i.locked).length;
      props.replaceChildren(
        levelTabs(),
        h("div", { class: "prop-group" }, "Poziom"),
        field("Nazwa", textIn(l.name, (v) => (l.name = v.trim().slice(0, 40) || l.name))),
        field("Przybliżenie widoku", numIn(l.zoom, (v) => (l.zoom = Math.min(10, Math.max(0.2, v))), 0.1), "2 = piksele 2x większe (jak w GDevelop: zoom kamery)"),
        field("Śmierć poniżej Y", h("div", { class: "xy" }, numIn(l.killY ?? 0, (v) => (l.killY = v)), h("button", { class: "btn small", onClick: () => (remember(), (l.killY = null), renderProps()) }, "brak")), l.killY === null ? "Brak - spadanie nie zabija" : "Czerwona linia na planszy"),
        field("Kamera nie niżej niż Y", h("div", { class: "xy" }, numIn(l.cameraBottom ?? 0, (v) => (l.cameraBottom = v)), h("button", { class: "btn small", onClick: () => (remember(), (l.cameraBottom = null), renderProps()) }, "brak")), l.cameraBottom === null ? "Brak ograniczenia" : "Niebieska linia na planszy"),
        checkIn("🪟 Poziom menu / GUI (bez postaci i sterowania - np. menu główne)", !!l.menu, (v) => (l.menu = v || undefined)),
        field(
          "Kamera stoi w X / Y",
          h(
            "div",
            { class: "xy" },
            numIn(l.cameraX ?? 0, (v) => (l.cameraX = v)),
            numIn(l.cameraY ?? 0, (v) => (l.cameraY = v)),
            h("button", { class: "btn small", title: "Ustaw na środek widoku", onClick: () => (remember(), (l.cameraX = Math.round(cam.x)), (l.cameraY = Math.round(cam.y)), renderProps()) }, "📍 tu"),
            h("button", { class: "btn small", onClick: () => (remember(), delete l.cameraX, delete l.cameraY, renderProps()) }, "brak"),
          ),
          l.cameraX === undefined && l.cameraY === undefined ? "Brak - kamera idzie za graczem" : "Kamera nie rusza się (np. menu, arena)",
        ),
        l.menu ? h("p", { class: "hint" }, "Gracz nie ma tu postaci, kamera stoi (na starcie albo w „kamera X / Y”). Dodaj GUI (🪟 GUI na pasku) z przyciskiem „Idź na poziom”.") : "",
        checkIn("Noc / ciemność (światła rozjaśniają)", !!l.ambient, (v) => (l.ambient = v ? "#606080" : undefined)),
        l.ambient ? field("Kolor ciemności", colorIn(l.ambient, (v) => (l.ambient = v))) : "",
        checkIn("Śmierć bez checkpointu = poziom od nowa", !!l.restartOnDeath, (v) => (l.restartOnDeath = v || undefined)),
        checkIn("Widok z góry (bez grawitacji, ruch w 4 strony - jak w RPG)", !!l.topDown, (v) => (l.topDown = v || undefined)),
        checkIn("Gracze mogą stawać sobie na głowach", !!l.stackPlayers, (v) => (l.stackPlayers = v || undefined)),
        checkIn("Do wyboru z menu gry", !!l.selectable, (v) => (l.selectable = v || undefined)),
        checkIn("Poziom startowy", w.startLevel === l.id, (v) => v && (w.startLevel = l.id)),
        field(
          "Postać na tym poziomie",
          selectIn([["", "Wybrana przez gracza"], ...w.characters.map((c): [string, string] => [c.id, c.name])], l.character ?? "", (v) => (l.character = v || undefined)),
        ),
        l.character
          ? ""
          : h(
              "div",
              { class: "prop" },
              h("span", null, "Postacie do wyboru na tym poziomie (nic = te same co w całej grze)"),
              ...w.characters.map((c) =>
                checkIn(c.name, !!l.characters?.includes(c.id), (v) => {
                  const list = (l.characters ?? []).filter((x) => x !== c.id);
                  if (v) list.push(c.id);
                  l.characters = list.length ? list : undefined;
                }),
              ),
            ),
        h(
          "button",
          {
            class: "btn danger small",
            onClick: async () => {
              if (w.levels.length < 2) return toast("Gra musi mieć przynajmniej jeden poziom", "error");
              if (!(await ask(`Usunąć poziom ${l.name}?`, "Usuń", "Anuluj", true))) return;
              remember();
              w.levels = w.levels.filter((x) => x.id !== l.id);
              if (w.startLevel === l.id) w.startLevel = w.levels[0].id;
              switchLevel(w.levels[0]);
            },
          },
          "Usuń poziom",
        ),
        locked
          ? h("button", { class: "btn small", onClick: () => (remember(), l.instances.forEach((i) => delete i.locked), renderProps()) }, `🔓 Odblokuj wszystkie (${locked})`)
          : "",
        h("p", { class: "hint" }, "Przesuwanie widoku: prawy / środkowy przycisk myszy albo przeciągnij puste miejsce. Kółko = przybliżenie. Shift + przeciągnij = zaznacz ramką. ⌨ na dole planszy = wszystkie skróty. Na telefonie dwa palce."),
      );
    }

    function renderInstProps(i: Inst2D) {
      const o = objById(i.obj);
      if (!o) return;
      const animNames = o.anims.map((a): [string, string] => [a.name, a.name]);
      props.replaceChildren(
        h("div", { class: "prop-group" }, "Wybrany: " + o.name),
        field("Nazwa dla skryptów", textIn(i.name ?? "", (v) => (i.name = v.trim() || undefined), o.name)),
        field("Pozycja X / Y", pair(numIn(i.x, (v) => (i.x = v)), numIn(i.y, (v) => (i.y = v)))),
        field("Szerokość / wysokość", pair(numIn(i.w, (v) => (i.w = Math.max(1, v))), numIn(i.h, (v) => (i.h = Math.max(1, v))))),
        field("Warstwa", selectIn(Object.entries(LAYER_LABELS) as [string, string][], i.layer, (v) => (i.layer = v as Inst2D["layer"]))),
        field("Obrót (stopnie, tylko wygląd)", numIn(i.angle ?? 0, (v) => (i.angle = ((v % 360) + 360) % 360 || undefined), 15)),
        i.layer === "bg" ? field("Przesuwanie tła (0 = stoi, 1 = jak świat)", numIn(i.parallax ?? 0, (v) => (i.parallax = Math.min(1, Math.max(0, v))), 0.1)) : "",
        field("Nieprzezroczystość (0 - 1)", numIn(i.opacity ?? 1, (v) => (i.opacity = v >= 1 ? undefined : Math.max(0, v)), 0.1)),
        checkIn("Odbity w poziomie", !!i.flip, (v) => (i.flip = v || undefined)),
        checkIn("🔒 Zablokowany (nie da się kliknąć na planszy)", !!i.locked, (v) => {
          i.locked = v || undefined;
          if (v) selectOnly(null);
        }),
        animNames.length > 1 ? field("Animacja", selectIn(animNames, i.anim ?? o.anims[0].name, (v) => (i.anim = v === o.anims[0].name ? undefined : v))) : "",
        o.role === "button" || o.role === "gate" ? field("Klucz (przycisk otwiera bramy z tym samym)", numIn(i.key ?? 0, (v) => (i.key = Math.round(v)))) : "",
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn small", onClick: () => ((editObj = o), selectOnly(null), renderAll()) }, "✎ Edytuj obiekt"),
          h("button", { class: "btn small", onClick: () => resetSize(i, o) }, "Rozmiar obrazka"),
        ),
      );
    }

    /** kilka zaznaczonych: wyrównanie, równe odstępy i wspólne cechy */
    function renderMultiProps(list: Inst2D[]) {
      const box = (i: Inst2D) => ({ x0: i.x, y0: i.y, x1: i.x + i.w, y1: i.y + i.h });
      const all = list.map(box);
      const L = Math.min(...all.map((b) => b.x0)), R = Math.max(...all.map((b) => b.x1));
      const T = Math.min(...all.map((b) => b.y0)), B = Math.max(...all.map((b) => b.y1));
      const act = (fn: () => void) => () => {
        remember();
        fn();
        view.invalidate();
        renderProps();
      };
      const align = (label: string, title: string, fn: (i: Inst2D) => void) => h("button", { class: "btn small", title, onClick: act(() => list.forEach(fn)) }, label);
      const distribute = (axis: "x" | "y") =>
        act(() => {
          const sorted = [...list].sort((a, b) => a[axis] - b[axis]);
          const size = axis === "x" ? "w" : "h";
          const total = sorted.reduce((n, i) => n + i[size], 0);
          const span = axis === "x" ? R - L : B - T;
          const gap = (span - total) / Math.max(1, sorted.length - 1);
          let pos = axis === "x" ? L : T;
          for (const i of sorted) {
            i[axis] = Math.round(pos);
            pos += i[size] + gap;
          }
        });
      const same = <K extends keyof Inst2D>(k: K) => list.every((i) => i[k] === list[0][k]);
      props.replaceChildren(
        h("div", { class: "prop-group" }, `Zaznaczono ${list.length}`),
        h("p", { class: "hint" }, "Przeciągnij jeden z nich, żeby przesunąć wszystkie. Strzałki przesuwają, Delete usuwa, Ctrl+C / Ctrl+V kopiuje."),
        h("span", { class: "prop-label" }, "Wyrównaj"),
        h(
          "div",
          { class: "row wrap" },
          align("⇤", "Do lewej", (i) => (i.x = L)),
          align("↔", "Środki w poziomie", (i) => (i.x = Math.round((L + R) / 2 - i.w / 2))),
          align("⇥", "Do prawej", (i) => (i.x = R - i.w)),
          align("⤒", "Do góry", (i) => (i.y = T)),
          align("↕", "Środki w pionie", (i) => (i.y = Math.round((T + B) / 2 - i.h / 2))),
          align("⤓", "Do dołu", (i) => (i.y = B - i.h)),
        ),
        h("span", { class: "prop-label" }, "Równe odstępy"),
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn small", onClick: distribute("x"), disabled: list.length < 3 }, "↔ w poziomie"),
          h("button", { class: "btn small", onClick: distribute("y"), disabled: list.length < 3 }, "↕ w pionie"),
        ),
        field("Warstwa", selectIn([...(same("layer") ? [] : [["", "(różne)"] as [string, string]]), ...(Object.entries(LAYER_LABELS) as [string, string][])], same("layer") ? list[0].layer : "", (v) => v && list.forEach((i) => (i.layer = v as Inst2D["layer"])))),
        field("Nieprzezroczystość (0 - 1)", numIn(same("opacity") ? (list[0].opacity ?? 1) : 1, (v) => list.forEach((i) => (i.opacity = v >= 1 ? undefined : Math.max(0, v))), 0.1)),
        h(
          "div",
          { class: "row wrap" },
          h("button", { class: "btn small", onClick: act(() => list.forEach((i) => (i.flip = !i.flip || undefined))) }, "↔ Odbij"),
          h("button", { class: "btn small", onClick: act(() => list.forEach((i) => (i.angle = (((i.angle ?? 0) + 90) % 360) || undefined))) }, "⟳ Obróć 90°"),
          h("button", { class: "btn small", onClick: () => duplicate() }, "⧉ Duplikuj"),
          h("button", { class: "btn small", onClick: () => copySel() }, "📋 Kopiuj"),
          h("button", { class: "btn small", onClick: act(() => (list.forEach((i) => (i.locked = true)), selectOnly(null))) }, "🔒 Zablokuj"),
          h("button", { class: "btn small danger", onClick: () => removeSelected() }, "🗑 Usuń"),
        ),
      );
    }

    function resetSize(i: Inst2D, o: Obj2D) {
      remember();
      i.w = o.w;
      i.h = o.h;
      renderProps();
    }

    function renderObjProps(o: Obj2D) {
      const roleFields: Node[] = [];
      if (o.role === "pickup") {
        roleFields.push(
          checkIn("Moneta (dodaje do licznika {coins})", !!o.coin, (v) => (o.coin = v || undefined)),
          checkIn("Każdy gracz zbiera osobno", !!o.perPlayer, (v) => (o.perPlayer = v || undefined)),
        );
      }
      if (o.role === "goal") {
        roleFields.push(field("Na poziom", selectIn([["", "(wybierz)"], ...w.levels.map((l): [string, string] => [l.name, l.name])], o.toLevel ?? "", (v) => (o.toLevel = v || undefined))));
      }
      if (o.role === "spring") {
        const push = o.push ?? [0, -800];
        roleFields.push(
          field("Wyrzut w bok / w górę", pair(numIn(push[0], (v) => (o.push = [v, (o.push ?? push)[1]])), numIn(-push[1], (v) => (o.push = [(o.push ?? push)[0], -v]))), "px/s przez sekundę, np. 0 i 800 = prosto w górę, -800 = w lewo"),
          field("Dźwięk", selectIn([["", "(brak)"], ...w.assets.filter((a) => a.type === "sound").map((a): [string, string] => [a.id, a.name])], o.sound ?? "", (v) => (o.sound = v || undefined))),
        );
      }
      if (o.role === "enemy") {
        roleFields.push(field("Prędkość / skok", pair(numIn(o.speed ?? 100, (v) => (o.speed = v)), numIn(o.jump ?? 400, (v) => (o.jump = v)))));
      }
      const kindFields: Node[] = [];
      if (o.kind === "text") {
        const ta = h("textarea", { value: o.text ?? "", rows: 2 });
        ta.addEventListener("change", () => (remember(), (o.text = ta.value), view.invalidate()));
        kindFields.push(
          field("Tekst", ta, "{coins} monety, {left} zostało monet, {time} czas, {player} nick"),
          field("Kolor", colorIn(o.color ?? "#000000", (v) => (o.color = v))),
          field("Wielkość", numIn(o.fontSize ?? 20, (v) => (o.fontSize = Math.max(4, v)))),
          field("Czcionka", selectIn([["", "Zwykła"], ...w.assets.filter((a) => a.type === "font").map((a): [string, string] => [a.id, a.name])], o.font ?? "", (v) => (o.font = v || undefined))),
        );
      }
      if (o.kind === "light") {
        kindFields.push(field("Promień", numIn(o.radius ?? 100, (v) => (o.radius = Math.max(1, v)))), field("Kolor światła", colorIn(o.color ?? "#ffffff", (v) => (o.color = v))));
      }
      props.replaceChildren(
        h("div", { class: "prop-group" }, KIND_ICONS[o.kind] + " Obiekt"),
        field("Nazwa", textIn(o.name, (v) => (o.name = v.trim().slice(0, 40) || o.name))),
        o.kind === "sprite" || o.kind === "tiled" ? field("Kolizja", selectIn(Object.entries(SOLID_LABELS) as [string, string][], o.solid, (v) => (o.solid = v as Solid2D))) : "",
        field("Zachowanie", selectIn(Object.entries(ROLE_LABELS) as [string, string][], o.role, (v) => (o.role = v as Role2D))),
        ...roleFields,
        checkIn("Niewidoczny w grze (strefa)", !!o.hidden, (v) => (o.hidden = v || undefined)),
        ...kindFields,
        field("Domyślny rozmiar", pair(numIn(o.w, (v) => (o.w = Math.max(1, v))), numIn(o.h, (v) => (o.h = Math.max(1, v))))),
        o.kind === "sprite" ? hitboxEditor(o) : "",
        o.kind === "sprite" || o.kind === "tiled" ? animEditor(o) : "",
        o.kind === "sprite" ? field("Animacja stania na tym obiekcie", textIn(o.standAnim ?? "", (v) => (o.standAnim = v.trim() || undefined), "np. Cylinder i beczka")) : "",
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn small primary", onClick: () => setBrush(o) }, "Postaw na planszy"),
          h(
            "button",
            {
              class: "btn small danger",
              onClick: async () => {
                const uses = w.levels.reduce((n, l) => n + l.instances.filter((i) => i.obj === o.id).length, 0);
                if (!(await ask(`Usunąć obiekt ${o.name}${uses ? ` i ${uses} jego kopii z poziomów` : ""}?`, "Usuń", "Anuluj", true))) return;
                remember();
                w.objects = w.objects.filter((x) => x.id !== o.id);
                for (const l of w.levels) l.instances = l.instances.filter((i) => i.obj !== o.id);
                w.characters = w.characters.filter((c) => c.obj !== o.id);
                editObj = null;
                if (brush?.id === o.id) setBrush(null);
                view.refreshObjects();
                renderAll();
              },
            },
            "Usuń obiekt",
          ),
        ),
      );
    }

    function hitboxEditor(o: Obj2D) {
      const [x, y, hw, hh] = o.hitbox;
      const pct = (v: number, set: (n: number) => void) => numIn(Math.round(v * 100), (n) => set(n / 100));
      return field(
        "Kolizja w % obrazka (x, y, szer., wys.)",
        h(
          "div",
          { class: "xyzw" },
          pct(x, (n) => (o.hitbox = [n, o.hitbox[1], o.hitbox[2], o.hitbox[3]])),
          pct(y, (n) => (o.hitbox = [o.hitbox[0], n, o.hitbox[2], o.hitbox[3]])),
          pct(hw, (n) => (o.hitbox = [o.hitbox[0], o.hitbox[1], Math.max(0.01, n), o.hitbox[3]])),
          pct(hh, (n) => (o.hitbox = [o.hitbox[0], o.hitbox[1], o.hitbox[2], Math.max(0.01, n)])),
        ),
        "Zielona ramka na planszy",
      );
    }

    /** rysunek z edytora jako obrazek gry */
    function paintAsset(r: PaintResult, name: string): Asset2D | null {
      if (r.data.length > MAX_ASSET_CHARS) {
        toast("Rysunek jest za duży - zmniejsz płótno", "error");
        return null;
      }
      return { id: newId2d(), name, type: "image", data: r.data, w: r.w, h: r.h, pixel: r.pixel };
    }
    /** obrazki do obiektu: narysowane w edytorze albo z plików (kilka plików = klatki) */
    async function pickImages(title: string, multiple: boolean): Promise<{ list: Asset2D[]; name: string } | null> {
      const src = await chooseImageSource(title, multiple);
      if (!src) return null;
      if ("drawn" in src) {
        const a = paintAsset(src.drawn, "rysunek");
        return a ? { list: [a], name: "Rysunek" } : null;
      }
      try {
        const files = src.files.sort((p, q) => p.name.localeCompare(q.name, undefined, { numeric: true }));
        return { list: await Promise.all(files.map(imageAsset)), name: files[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]?\d+$/, "") || "Obiekt" };
      } catch (e) {
        toast((e as Error).message, "error");
        return null;
      }
    }
    /** poprawianie klatki w edytorze - powstaje nowy obrazek (inne obiekty ze starym się nie zmieniają) */
    async function editFrame(a: Anim2D, idx: number) {
      const old = w.assets.find((x) => x.id === a.frames[idx]);
      if (!old) return;
      const r = await paintEditor({ title: "Popraw klatkę", image: old.data, pixel: old.pixel ?? true });
      const as = r && paintAsset(r, old.name);
      if (!as) return;
      remember();
      w.assets.push(as);
      await assets.add(as);
      a.frames[idx] = as.id;
      view.refreshObjects();
      renderProps();
      renderObjects();
    }
    /** nowa klatka narysowana na bazie ostatniej (łatwe animacje: kopiujesz i zmieniasz kawałek) */
    async function drawFrame(o: Obj2D, a: Anim2D) {
      const last = w.assets.find((x) => x.id === a.frames[a.frames.length - 1]);
      const r = await paintEditor({
        title: last ? "Nowa klatka (kopia ostatniej)" : "Nowa klatka",
        image: last?.data,
        pixel: last?.pixel ?? true,
        w: Math.max(8, Math.min(512, Math.round(o.w))),
        h: Math.max(8, Math.min(512, Math.round(o.h))),
      });
      const as = r && paintAsset(r, o.name + " " + (a.frames.length + 1));
      if (!as) return;
      remember();
      w.assets.push(as);
      await assets.add(as);
      if (o.kind === "tiled") a.frames = [as.id];
      else a.frames.push(as.id);
      view.refreshObjects();
      renderProps();
      renderObjects();
    }

    function animEditor(o: Obj2D) {
      const box = h("div", { class: "anims" });
      const addFrames = async (a: Anim2D) => {
        const picked = await pickImages(o.kind === "tiled" ? "Obrazek kafelków" : "Klatki animacji", o.kind !== "tiled");
        if (!picked) return;
        if (o.kind === "tiled") a.frames = [];
        try {
          const list = picked.list;
          remember();
          for (const as of list) {
            w.assets.push(as);
            await assets.add(as);
            a.frames.push(as.id);
          }
          if (o.anims[0] === a && a.frames.length === list.length && list[0].w && list[0].h && o.kind === "sprite") {
            o.w = list[0].w;
            o.h = list[0].h;
          }
          renderProps();
          renderObjects();
        } catch (e) {
          toast((e as Error).message, "error");
        }
      };
      for (const a of o.kind === "tiled" ? o.anims.slice(0, 1) : o.anims) {
        const frames = h(
          "div",
          { class: "frames" },
          a.frames.map((f, idx) => {
            const as = w.assets.find((x) => x.id === f);
            return h(
              "div",
              { class: "frame", title: "Kliknij, żeby poprawić w edytorze rysowania", onClick: () => editFrame(a, idx) },
              as ? h("img", { src: as.data, alt: "" }) : "?",
              h("button", { class: "frame-x", title: "Usuń klatkę", onClick: (e: Event) => (e.stopPropagation(), remember(), a.frames.splice(idx, 1), renderProps()) }, "×"),
            );
          }),
          h("button", { class: "frame add", title: o.kind === "tiled" ? "Nowy obrazek: narysuj albo wybierz plik" : "Dodaj klatki: narysuj albo wybierz pliki", onClick: () => addFrames(a) }, "+"),
          h("button", { class: "frame add frame-draw", title: "Narysuj nową klatkę (na bazie ostatniej)", onClick: () => drawFrame(o, a) }, "🎨"),
        );
        box.append(
          h(
            "div",
            { class: "anim-box" },
            o.kind === "sprite"
              ? h(
                  "div",
                  { class: "xy" },
                  textIn(a.name, (v) => (a.name = v.trim() || a.name)),
                  h(
                    "button",
                    {
                      class: "icon-btn",
                      title: "Usuń animację",
                      onClick: () => {
                        if (o.anims.length < 2) return toast("Obiekt musi mieć przynajmniej jedną animację", "error");
                        remember();
                        o.anims = o.anims.filter((x) => x !== a);
                        renderProps();
                      },
                    },
                    "🗑",
                  ),
                )
              : "",
            frames,
            o.kind === "sprite"
              ? h(
                  "div",
                  { class: "xy" },
                  field("Sekundy na klatkę", numIn(a.frameTime, (v) => (a.frameTime = Math.max(0.01, v)), 0.01)),
                  checkIn("W pętli", a.loop, (v) => (a.loop = v)),
                )
              : "",
          ),
        );
      }
      return h(
        "div",
        { class: "prop" },
        o.kind === "tiled" ? "Obrazek (powtarzany)" : "Animacje",
        box,
        o.kind === "sprite"
          ? h("button", { class: "btn small", onClick: () => (remember(), o.anims.push({ name: "Animacja " + (o.anims.length + 1), frames: [], frameTime: 0.1, loop: true }), renderProps()) }, "+ Animacja")
          : "",
      );
    }

    // ---------- nowe obiekty ----------
    function newObject() {
      const make = async (kind: "sprite" | "tiled" | "text" | "light" | "zone") => {
        close();
        let o: Obj2D;
        const base = { id: newId2d(), hitbox: [0, 0, 1, 1] as Obj2D["hitbox"], solid: "none" as Solid2D, role: "none" as Role2D };
        if (kind === "sprite" || kind === "tiled") {
          const picked = await pickImages(kind === "sprite" ? "Nowy obrazek / animacja" : "Nowe kafelki", kind === "sprite");
          if (!picked) return;
          const list = picked.list;
          for (const a of list) {
            w.assets.push(a);
            await assets.add(a);
          }
          const name = picked.name;
          const iw = list[0].w ?? 32, ih = list[0].h ?? 32;
          o = kind === "sprite"
            ? { ...base, name, kind: "sprite", anims: [{ name: "Idle", frames: list.map((a) => a.id), frameTime: 0.1, loop: true }], w: iw, h: ih }
            : { ...base, name, kind: "tiled", anims: [{ name: "Obraz", frames: [list[0].id], frameTime: 1, loop: false }], w: iw * 4, h: ih, solid: "solid" };
        } else if (kind === "text") o = { ...base, name: "Napis", kind: "text", anims: [], w: 200, h: 24, text: "Monety: {coins}", color: "#ffffff", fontSize: 24 };
        else if (kind === "light") o = { ...base, name: "Światło", kind: "light", anims: [], w: 32, h: 32, radius: 120, color: "#fff2c0" };
        else o = { ...base, name: "Strefa", kind: "sprite", anims: [{ name: "Idle", frames: [], frameTime: 0.1, loop: true }], w: 64, h: 64, hidden: true };
        remember();
        let n = 2;
        const baseName = o.name;
        while (w.objects.some((x) => x.name === o.name)) o.name = `${baseName} ${n++}`;
        w.objects.push(o);
        view.refreshObjects();
        editObj = o;
        selectOnly(null);
        setBrush(o);
        renderAll();
        toast("Kliknij na planszy, żeby postawić " + o.name);
      };
      const opt = (icon: string, label: string, desc: string, kind: Parameters<typeof make>[0]) =>
        h("button", { class: "template", onClick: () => make(kind) }, h("span", { class: "template-icon" }, icon), h("b", null, label), h("span", { class: "muted" }, desc));
      const close = modal(
        "Nowy obiekt",
        h(
          "div",
          { class: "templates-grid" },
          opt("🖼", "Obrazek / animacja", "Postać, moneta, potwór... Wybierz jeden albo kilka obrazków (klatki)", "sprite"),
          opt("▦", "Kafelki", "Powtarzany obrazek: ziemia, ściana, drabina, tło", "tiled"),
          opt("🔤", "Napis", "Tekst na planszy albo w rogu ekranu (licznik monet, czas)", "text"),
          opt("💡", "Światło", "Rozjaśnia ciemność na poziomach nocnych", "light"),
          opt("▢", "Strefa", "Niewidzialny obszar - do skryptów (onTouch), startu graczy", "zone"),
        ),
      );
    }

    async function addSounds() {
      const files = await pickFiles(["audio/*", ".mp3", ".wav", ".ogg", ".aac", ".m4a"], true);
      if (!files.length) return;
      for (const f of files) {
        const data64 = await readDataUrl(f);
        if (data64.length > MAX_ASSET_CHARS) {
          toast(`Dźwięk ${f.name} jest za duży`, "error");
          continue;
        }
        const a: Asset2D = { id: newId2d(), name: f.name, type: "sound", data: data64 };
        w.assets.push(a);
        await assets.add(a);
      }
      changed();
      renderSounds();
      toast("Dodano dźwięki - użyj ich w Ustawieniach gry albo w Lua: playSound(\"nazwa\")", "good");
    }

    // ---------- postacie ----------
    function editCharacter(c: Character2D | null) {
      const sprites = w.objects.filter((o) => o.kind === "sprite" && o.anims.some((a) => a.frames.length));
      if (!sprites.length) return toast("Najpierw dodaj obiekt z obrazkami postaci", "error");
      const cur: Character2D = c
        ? structuredClone(c)
        : { id: newId2d(), name: "Postać", obj: sprites[0].id, w: sprites[0].w, h: sprites[0].h, anims: { idle: "Idle", walk: "Idle", jump: "Idle", fall: "Idle", climb: "Idle", dead: "Idle" } };
      const body = h("div", { class: "form" });
      const render = () => {
        const o = w.objects.find((x) => x.id === cur.obj) ?? sprites[0];
        const names = o.anims.map((a) => a.name);
        const animSel = (k: keyof Character2D["anims"], label: string, optional = false) => {
          const s = h("select", null, optional ? h("option", { value: "" }, "(brak)") : null, names.map((n) => h("option", { value: n, selected: cur.anims[k] === n }, n)));
          if (!optional && !names.includes(cur.anims[k] ?? "")) cur.anims[k] = names[0];
          s.addEventListener("change", () => (cur.anims[k] = s.value || undefined!));
          return h("label", null, label, s);
        };
        const name = h("input", { value: cur.name, maxLength: 40 });
        name.addEventListener("input", () => (cur.name = name.value));
        const objSel = h("select", null, sprites.map((s) => h("option", { value: s.id, selected: s.id === cur.obj }, s.name)));
        objSel.addEventListener("change", () => {
          cur.obj = objSel.value;
          const so = w.objects.find((x) => x.id === cur.obj)!;
          cur.w = so.w;
          cur.h = so.h;
          render();
        });
        const ww = h("input", { type: "number", value: String(cur.w) });
        ww.addEventListener("change", () => (cur.w = Math.max(1, Number(ww.value) || cur.w)));
        const hh = h("input", { type: "number", value: String(cur.h) });
        hh.addEventListener("change", () => (cur.h = Math.max(1, Number(hh.value) || cur.h)));
        const comp = h("select", null, h("option", { value: "" }, "Brak"), w.characters.filter((x) => x.id !== cur.id).map((x) => h("option", { value: x.id, selected: cur.companion === x.id }, x.name)));
        comp.addEventListener("change", () => (cur.companion = comp.value || undefined));
        const npc = h("input", { type: "checkbox", checked: !!cur.npc });
        npc.addEventListener("change", () => (cur.npc = npc.checked || undefined));
        body.replaceChildren(
          h("label", null, "Nazwa", name),
          h("label", null, "Obiekt z animacjami", objSel),
          h("div", { class: "xy" }, h("label", null, "Szerokość", ww), h("label", null, "Wysokość", hh)),
          h(
            "div",
            { class: "anim-map" },
            animSel("idle", "Stoi"),
            animSel("walk", "Idzie"),
            animSel("jump", "Skacze"),
            animSel("fall", "Spada"),
            animSel("climb", "Wspina się"),
            animSel("dead", "Ginie"),
            animSel("up", "Patrzy w górę", true),
            animSel("down", "Kuca", true),
          ),
          h("label", null, "Towarzysz (biegnie za graczem i powtarza ruchy)", comp),
          h("label", { class: "check" }, npc, h("span", null, "Tylko towarzysz / NPC (nie do wyboru w menu)")),
        );
      };
      render();
      const close = modal(c ? "Postać: " + c.name : "Nowa postać", body, [
        ...(c
          ? [
              {
                label: "Usuń",
                kind: "danger",
                onClick: async () => {
                  if (!(await ask(`Usunąć postać ${c.name}?`, "Usuń", "Anuluj", true))) return;
                  remember();
                  w.characters = w.characters.filter((x) => x.id !== c.id);
                  close();
                  renderAll();
                },
              },
            ]
          : []),
        {
          label: "Zapisz",
          kind: "primary",
          onClick: () => {
            remember();
            const idx = w.characters.findIndex((x) => x.id === cur.id);
            if (idx >= 0) w.characters[idx] = cur;
            else w.characters.push(cur);
            close();
            renderAll();
          },
        },
      ]);
    }

    // ---------- skrypty ----------
    function addScript(type: "lua" | "blocks" = "lua") {
      remember();
      const s: WorldScript = {
        id: newId2d(),
        name: (type === "lua" ? "Skrypt " : "Bloczki ") + (data.scripts.length + 1),
        type,
        source:
          type === "lua"
            ? '-- Przykład: gdy gracz dotknie obiektu "Meta"\nonTouch("Meta", function(player)\n  say(playerName(player) .. " dotarł do mety!")\nend)\n'
            : "",
        // bloczki: gotowy przykład na start (gdy gracz dotknie Mety - napis dla wszystkich)
        blocks:
          type === "blocks"
            ? {
                blocks: {
                  languageVersion: 0,
                  blocks: [
                    {
                      type: "d2_on_touch",
                      x: 40,
                      y: 40,
                      fields: { OBJ: "Meta" },
                      inputs: { DO: { block: { type: "p_say", inputs: { TEXT: { shadow: { type: "text", fields: { TEXT: "Ktoś dotarł do mety!" } } } } } } },
                    },
                  ],
                },
              }
            : undefined,
        enabled: true,
      };
      data.scripts.push(s);
      renderScripts();
      editScript(s);
    }
    function editScript(s: WorldScript) {
      openScriptEditor(
        s,
        (res) => {
          remember();
          Object.assign(s, res);
          renderScripts();
        },
        LUA_HELP_2D,
        "2d",
      );
    }

    // ---------- GUI ----------
    // ---------- asystent AI ----------
    let closeAi: (() => void) | null = null;
    function openAi() {
      if (closeAi) return closeAi();
      const key = src.worldId ? "w" + src.worldId : "f:" + meta.name;
      const tools = tools2d(
        {
          data,
          level: () => level,
          openLevel: (l) => switchLevel(l),
          visible: () => {
            const { W, H } = size();
            const s = cam.scale || 1;
            return { x: cam.x - W / 2 / s, y: cam.y - H / 2 / s, w: W / s, h: H / s };
          },
          selection: () => sel(),
          select: (list) => {
            setSelection(list);
            const first = list[0];
            if (first) {
              cam.x = first.x + first.w / 2;
              cam.y = first.y + first.h / 2;
            }
            view.invalidate();
          },
          assetsAdded: (list) => list.forEach((a) => void assets.add(a)),
          refresh: () => {
            if (!w.levels.includes(level)) level = w.levels.find((l) => l.id === level.id) ?? w.levels[0];
            selected = selected && level.instances.includes(selected) ? selected : null;
            multi = multi.filter((m) => level.instances.includes(m));
            if (editObj && !w.objects.includes(editObj)) editObj = null;
            view.refreshObjects();
            view.setLevel(level);
            renderAll();
          },
        },
        chatFor(key).att,
      );
      aiBtn.classList.add("active");
      closeAi = openAssistant(
        el,
        { mode: "2d", key, run: tools.run, context: tools.context, begin: () => remember(), end: () => changed() },
        () => {
          closeAi = null;
          aiBtn.classList.remove("active");
        },
      );
    }
    cleanups.push(() => closeAi?.());

    function openGuis() {
      data.guis ??= [];
      openGuiEditor({
        guis: data.guis,
        mode: "2d",
        wheres: w.levels.map((l): [string, string] => [l.id, (l.menu ? "🪟 " : "🗺 ") + l.name]),
        levels: w.levels.map((l) => l.name),
        onChange: () => changed(),
      });
    }

    // ---------- ustawienia gry ----------
    function openGameSettings() {
      const name = h("input", { value: meta.name, maxLength: 40 });
      const desc = h("textarea", { value: meta.description, maxLength: 500, rows: 3 });
      const maxP = h("input", { type: "number", min: "1", max: String(MAX_PLAYERS_LIMIT), value: String(meta.maxPlayers) });
      const pub = h("input", { type: "checkbox", checked: src.published });
      const ownMenu = h("input", { type: "checkbox", checked: !!w.ownMenu });
      const phys = w.physics;
      const pf: [keyof typeof phys, string][] = [
        ["maxSpeed", "Prędkość biegu"],
        ["acceleration", "Przyspieszanie"],
        ["deceleration", "Hamowanie"],
        ["jumpSpeed", "Siła skoku"],
        ["jumpSustain", "Przytrzymanie skoku (s)"],
        ["gravity", "Grawitacja"],
        ["maxFallSpeed", "Maks. spadanie"],
        ["ladderSpeed", "Wspinanie"],
      ];
      const physIn = pf.map(([k, label]) => {
        const i = h("input", { type: "number", value: String(phys[k]), step: k === "jumpSustain" ? "0.05" : "10" });
        return { k, i, el: h("label", null, label, i) };
      });
      const soundKeys: [keyof World2D["sounds"], string][] = [
        ["jump", "Skok"],
        ["coin", "Moneta"],
        ["hurt", "Śmierć"],
        ["checkpoint", "Checkpoint"],
        ["gate", "Otwarcie bramy"],
      ];
      const soundSel = soundKeys.map(([k, label]) => {
        const s = h("select", null, h("option", { value: "" }, "(brak)"), w.assets.filter((a) => a.type === "sound").map((a) => h("option", { value: a.id, selected: w.sounds[k] === a.id }, a.name)));
        return { k, s, el: h("label", null, label, s) };
      });
      const badges = badgeEditor(data.badges);
      const products = productEditor(data.products);
      const genreSel = genreSelect(data.genre);
      const close = modal(
        "Ustawienia gry",
        h(
          "div",
          { class: "form" },
          h("label", null, "Nazwa", name),
          h("label", null, "Opis", desc),
          h("label", null, "Kategoria (gracze znajdą grę w Hitach i wyszukiwarce)", genreSel),
          h("label", null, `Maks. graczy na serwer (1–${MAX_PLAYERS_LIMIT})`, maxP),
          h("label", { class: "check" }, ownMenu, h("span", null, "Własne menu gry (GUI): w menu ☰ Predatora nie ma wyboru postaci i poziomów")),
          h("div", { class: "prop-group" }, "Fizyka postaci (piksele na sekundę)"),
          h("div", { class: "grid2" }, physIn.map((p) => p.el)),
          h("div", { class: "prop-group" }, "Dźwięki"),
          h("div", { class: "grid2" }, soundSel.map((s) => s.el)),
          badges.el,
          products.el,
          src.online
            ? h("label", { class: "check" }, pub, h("span", null, "Opublikowana - inni mogą w nią grać"))
            : h("p", { class: "muted", style: "font-size:13px;margin:0" }, "Gra z pliku - żeby ją opublikować, wyślij ją na serwer (Plik → Wyślij na serwer)."),
        ),
        [
          { label: "Anuluj", onClick: () => close() },
          {
            label: "Zapisz",
            kind: "primary",
            onClick: async () => {
              remember();
              meta.name = name.value.trim().slice(0, 40) || meta.name;
              meta.description = desc.value.slice(0, 500);
              meta.maxPlayers = Math.min(MAX_PLAYERS_LIMIT, Math.max(1, Math.round(Number(maxP.value) || 30)));
              for (const p of physIn) {
                const v = Number(p.i.value);
                if (Number.isFinite(v) && v >= 0) phys[p.k] = v;
              }
              for (const s of soundSel) {
                if (s.s.value) w.sounds[s.k] = s.s.value;
                else delete w.sounds[s.k];
              }
              src.published = pub.checked;
              if (ownMenu.checked) w.ownMenu = true;
              else delete w.ownMenu;
              data.badges = badges.read();
              if (genreSel.value) data.genre = genreSel.value;
              else delete data.genre;
              const prod = products.read();
              if (prod.length) data.products = prod;
              else delete data.products;
              close();
              if (src.online) {
                if (await save(true)) toast("Zapisano ustawienia", "good");
              }
            },
          },
        ],
      );
    }

    // ---------- plansza: rysowanie ----------
    function size() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      return { W, H, dpr };
    }
    function centerOnLevel() {
      const { W, H } = size();
      zoom = 1;
      cam.scale = fitScale(W, H, level.zoom);
      const sp = level.instances.find((i) => objById(i.obj)?.role === "spawn") ?? level.instances.find((i) => i.layer === "main");
      cam.x = sp ? sp.x + sp.w / 2 : 320;
      cam.y = sp ? sp.y : 180;
    }
    function screenRect(i: Inst2D) {
      const { W, H } = size();
      const c = view.camFor(i, cam, W, H);
      const x = (i.x - c.x) * c.scale + W / 2;
      const y = (i.y - c.y) * c.scale + H / 2;
      return { x, y, w: i.w * c.scale, h: i.h * c.scale, c };
    }
    let raf = 0;
    const t0 = performance.now();
    function frame() {
      raf = requestAnimationFrame(frame);
      const { W, H, dpr } = size();
      if (!W || !H) return;
      view.background = level.background;
      view.draw(ctx, W, H, cam, (performance.now() - t0) / 1000, [], { editor: true });
      const zoomText = Math.round((cam.scale / dpr) * 100) + "%";
      if (stZoom.textContent !== zoomText) stZoom.textContent = zoomText;
      // siatka (gdy kratki nie są za drobne)
      const step = grid * cam.scale;
      if (showGrid && grid > 1 && step >= 6 * dpr) {
        ctx.save();
        ctx.lineWidth = 1;
        const x0 = cam.x - W / 2 / cam.scale, y0 = cam.y - H / 2 / cam.scale;
        const gx = Math.floor(x0 / grid), gy = Math.floor(y0 / grid);
        ctx.beginPath();
        for (let k = gx; k * grid < x0 + W / cam.scale; k++) {
          const sx = Math.round((k * grid - cam.x) * cam.scale + W / 2) + 0.5;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, H);
        }
        for (let k = gy; k * grid < y0 + H / cam.scale; k++) {
          const sy = Math.round((k * grid - cam.y) * cam.scale + H / 2) + 0.5;
          ctx.moveTo(0, sy);
          ctx.lineTo(W, sy);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.stroke();
        // osie świata (x = 0, y = 0)
        ctx.beginPath();
        const ax = Math.round(-cam.x * cam.scale + W / 2) + 0.5, ay = Math.round(-cam.y * cam.scale + H / 2) + 0.5;
        ctx.moveTo(ax, 0);
        ctx.lineTo(ax, H);
        ctx.moveTo(0, ay);
        ctx.lineTo(W, ay);
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.stroke();
        ctx.restore();
      }
      // linie śmierci i kamery
      const lineY = (y: number, color: string) => {
        const sy = (y - cam.y) * cam.scale + H / 2;
        if (sy < 0 || sy > H) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.setLineDash([10 * dpr, 6 * dpr]);
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(W, sy);
        ctx.stroke();
        ctx.restore();
      };
      if (level.killY !== null) lineY(level.killY, "#ff3b3b");
      if (level.cameraBottom !== null) lineY(level.cameraBottom, "#3a86ff");
      // światła i strefy w edytorze
      for (const i of view.instances()) {
        const o = objById(i.obj);
        if (!o) continue;
        if (o.kind === "light") {
          const r = screenRect(i);
          ctx.strokeStyle = "#ffd24a";
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.arc(r.x, r.y, (o.radius ?? 100) * r.c.scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#ffd24a";
          ctx.fillRect(r.x - 4 * dpr, r.y - 4 * dpr, 8 * dpr, 8 * dpr);
        } else if (o.role === "spawn" || o.role === "respawn") {
          const r = screenRect(i);
          ctx.strokeStyle = o.role === "spawn" ? "#2ecc71" : "#3a86ff";
          ctx.lineWidth = 2 * dpr;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.font = `${12 * dpr}px system-ui`;
          ctx.fillText(o.role === "spawn" ? "START" : "ODRODZENIE", r.x + 2, r.y - 4);
        }
      }
      if (selected) {
        const r = screenRect(selected);
        ctx.strokeStyle = "#3a86ff";
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        const o = objById(selected.obj);
        if (o && (o.solid !== "none" || o.role !== "none" || o.kind === "sprite")) {
          const b = instBox(selected, o);
          ctx.strokeStyle = "#2ecc71";
          ctx.lineWidth = dpr;
          ctx.strokeRect((b.x - r.c.x) * r.c.scale + W / 2, (b.y - r.c.y) * r.c.scale + H / 2, b.w * r.c.scale, b.h * r.c.scale);
        }
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#3a86ff";
        for (const [hx, hy] of multi.length > 1 ? [] : handles(r)) {
          ctx.fillRect(hx - HANDLE * dpr, hy - HANDLE * dpr, HANDLE * 2 * dpr, HANDLE * 2 * dpr);
          ctx.strokeRect(hx - HANDLE * dpr, hy - HANDLE * dpr, HANDLE * 2 * dpr, HANDLE * 2 * dpr);
        }
      }
      // pozostałe zaznaczone (kilka naraz)
      if (multi.length > 1) {
        ctx.strokeStyle = "#3a86ff";
        ctx.lineWidth = 2 * dpr;
        for (const i of multi) {
          if (i === selected) continue;
          const r = screenRect(i);
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
      }
      // obiekt pod kursorem
      if (!drag && !brush && hoverScreen) {
        const hv = hitTest(hoverScreen.x, hoverScreen.y);
        if (hv && !isSel(hv)) {
          const r = screenRect(hv);
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = dpr;
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.setLineDash([]);
        }
      }
      // ramka zaznaczania
      if (drag?.kind === "box") {
        const x = Math.min(drag.sx, drag.ex) * dpr, y = Math.min(drag.sy, drag.ey) * dpr;
        const bw = Math.abs(drag.ex - drag.sx) * dpr, bh = Math.abs(drag.ey - drag.sy) * dpr;
        ctx.fillStyle = "rgba(58,134,255,0.15)";
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = "#3a86ff";
        ctx.lineWidth = dpr;
        ctx.setLineDash([5 * dpr, 3 * dpr]);
        ctx.strokeRect(x, y, bw, bh);
        ctx.setLineDash([]);
      }
      drawEditors(W, H, dpr);
      // podgląd stawianego obiektu
      if (brush && hover) {
        const p = snapPt(hover.wx, hover.wy);
        const i: Inst2D = { id: "ghost", obj: brush.id, x: p.x, y: p.y, w: brush.w, h: brush.h, z: 0, layer: "main" };
        const r = screenRect(i);
        ctx.strokeStyle = "#ffd24a";
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
      }
    }
    /** inni twórcy na tym poziomie: kropka z nickiem i ramka wokół tego, co zaznaczyli */
    let lastFrame = performance.now();
    function drawEditors(W: number, H: number, dpr: number) {
      if (!collab) return;
      const now = performance.now();
      collab.animate((now - lastFrame) / 1000);
      lastFrame = now;
      for (const r of collab.remotes.values()) {
        if (!r.seen || r.level !== level.id) continue;
        if (r.sel) {
          const i = level.instances.find((x) => x.id === r.sel);
          if (i) {
            const b = screenRect(i);
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 2 * dpr;
            ctx.setLineDash([5 * dpr, 3 * dpr]);
            ctx.strokeRect(b.x - 2 * dpr, b.y - 2 * dpr, b.w + 4 * dpr, b.h + 4 * dpr);
            ctx.setLineDash([]);
          }
        }
        const x = (r.dx - cam.x) * cam.scale + W / 2;
        const y = (r.dy - cam.y) * cam.scale + H / 2;
        if (x < -50 * dpr || y < -50 * dpr || x > W + 50 * dpr || y > H + 50 * dpr) continue;
        ctx.fillStyle = r.color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 7 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = `bold ${12 * dpr}px system-ui`;
        const tw = ctx.measureText(r.username).width;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath();
        ctx.roundRect(x + 10 * dpr, y - 22 * dpr, tw + 12 * dpr, 18 * dpr, 9 * dpr);
        ctx.fill();
        ctx.fillStyle = r.color;
        ctx.fillText(r.username, x + 16 * dpr, y - 9 * dpr);
      }
    }
    // uchwyty rozmiaru większe pod palec
    const HANDLE = isTouch() ? 9 : 5;
    const handles = (r: { x: number; y: number; w: number; h: number }): [number, number][] => [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ];

    // ---------- plansza: mysz i dotyk ----------
    const snap = (v: number) => (grid > 1 ? Math.round(v / grid) * grid : Math.round(v));
    const snapPt = (x: number, y: number) => ({ x: snap(x), y: snap(y) });
    let hover: { wx: number; wy: number } | null = null;
    let hoverScreen: { x: number; y: number } | null = null;
    type Drag =
      | { kind: "pan"; sx: number; sy: number; cx: number; cy: number }
      | { kind: "move"; inst: Inst2D; items: { inst: Inst2D; ox: number; oy: number }[]; ox: number; oy: number; wx: number; wy: number; moved: boolean }
      | { kind: "box"; sx: number; sy: number; ex: number; ey: number; add: Inst2D[] }
      | { kind: "paint"; obj: Obj2D; x0: number; y0: number; done: Set<string> }
      | { kind: "resize"; inst: Inst2D; corner: number; start: Inst2D; wx: number; wy: number };
    let drag: Drag | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; scale: number } | null = null;

    const toWorld = (sx: number, sy: number, c: Camera2D = cam) => {
      const { W, H, dpr } = size();
      return { x: (sx * dpr - W / 2) / c.scale + c.x, y: (sy * dpr - H / 2) / c.scale + c.y };
    };
    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    function hitTest(sx: number, sy: number): Inst2D | null {
      const { dpr } = size();
      const list = view.instances();
      for (let k = list.length - 1; k >= 0; k--) {
        const i = list[k];
        if (i.locked) continue;
        const r = screenRect(i);
        const o = objById(i.obj);
        const rr = o?.kind === "light" ? { x: r.x - 12, y: r.y - 12, w: 24, h: 24 } : r;
        let px = sx * dpr, py = sy * dpr;
        // obrócony obiekt: punkt kliknięcia obracamy z powrotem wokół środka (jak przy rysowaniu)
        if (i.angle) {
          const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
          const a = (-i.angle * Math.PI) / 180;
          const dx = px - cx, dy = py - cy;
          px = cx + dx * Math.cos(a) - dy * Math.sin(a);
          py = cy + dx * Math.sin(a) + dy * Math.cos(a);
        }
        if (px >= rr.x && px <= rr.x + rr.w && py >= rr.y && py <= rr.y + rr.h) return i;
      }
      return null;
    }

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: cam.scale };
        drag = { kind: "pan", sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, cx: cam.x, cy: cam.y };
        return;
      }
      if (e.button === 1 || e.button === 2) {
        drag = { kind: "pan", sx: p.x, sy: p.y, cx: cam.x, cy: cam.y };
        return;
      }
      const { dpr } = size();
      // uchwyty zmiany rozmiaru
      if (selected && multi.length < 2 && !e.shiftKey) {
        const r = screenRect(selected);
        const hs = handles(r);
        for (let k = 0; k < 4; k++) {
          if (Math.abs(p.x * dpr - hs[k][0]) <= (HANDLE + 5) * dpr && Math.abs(p.y * dpr - hs[k][1]) <= (HANDLE + 5) * dpr) {
            const wp = toWorld(p.x, p.y, r.c);
            remember();
            drag = { kind: "resize", inst: selected, corner: k, start: { ...selected }, wx: wp.x, wy: wp.y };
            return;
          }
        }
      }
      if (brush) {
        const wp = toWorld(p.x, p.y);
        const pos = snapPt(wp.x, wp.y);
        remember();
        const inst = placeBrush(brush, pos.x, pos.y);
        selectOnly(inst);
        // przeciąganie z obiektem = malowanie (np. kafelki ziemi jeden obok drugiego)
        drag = { kind: "paint", obj: brush, x0: pos.x, y0: pos.y, done: new Set(["0,0"]) };
        renderLevels();
        renderProps();
        return;
      }
      const hit = hitTest(p.x, p.y);
      if (e.shiftKey && hit) {
        // Shift + klik: dodaj / usuń z zaznaczenia
        const list = sel();
        setSelection(list.includes(hit) ? list.filter((i) => i !== hit) : [...list, hit]);
        return;
      }
      if (e.shiftKey || (!hit && (e.altKey || boxMode))) {
        // Shift + przeciąganie po pustym = ramka zaznaczenia
        drag = { kind: "box", sx: p.x, sy: p.y, ex: p.x, ey: p.y, add: e.shiftKey ? sel() : [] };
        return;
      }
      if (hit) {
        if (!isSel(hit)) {
          selectOnly(hit);
          editObj = objById(hit.obj) ?? null;
        } else selected = hit;
        const r = screenRect(hit);
        const wp = toWorld(p.x, p.y, r.c);
        drag = { kind: "move", inst: hit, items: sel().map((i) => ({ inst: i, ox: i.x, oy: i.y })), ox: hit.x, oy: hit.y, wx: wp.x, wy: wp.y, moved: false };
        renderProps();
        renderObjects();
      } else {
        if (sel().length) {
          selectOnly(null);
          renderProps();
        }
        drag = { kind: "pan", sx: p.x, sy: p.y, cx: cam.x, cy: cam.y };
      }
    });
    function placeBrush(o: Obj2D, x: number, y: number): Inst2D {
      const maxZ = level.instances.reduce((m, i) => Math.max(m, i.z), 0);
      const inst: Inst2D = { id: newId2d(), obj: o.id, x, y, w: o.w, h: o.h, z: maxZ + 1, layer: "main" };
      // przycisk i brama od razu połączone (klucz 1) - można zmienić we właściwościach
      if (o.role === "button" || o.role === "gate") inst.key = 1;
      level.instances.push(inst);
      view.invalidate();
      return inst;
    }
    canvas.addEventListener("pointermove", (e) => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      const wp = toWorld(p.x, p.y);
      hover = { wx: wp.x, wy: wp.y };
      hoverScreen = p;
      updateStatus();
      if (!drag) return;
      const { dpr } = size();
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        cam.scale = Math.min(20, Math.max(0.05, pinch.scale * (d / pinch.d)));
        if (drag.kind === "pan") {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          cam.x = drag.cx - ((mx - drag.sx) * dpr) / cam.scale;
          cam.y = drag.cy - ((my - drag.sy) * dpr) / cam.scale;
        }
        return;
      }
      if (drag.kind === "pan") {
        cam.x = drag.cx - ((p.x - drag.sx) * dpr) / cam.scale;
        cam.y = drag.cy - ((p.y - drag.sy) * dpr) / cam.scale;
      } else if (drag.kind === "move") {
        const c = view.camFor(drag.inst, cam, canvas.width, canvas.height);
        const wpp = toWorld(p.x, p.y, c);
        const nx = snap(drag.ox + wpp.x - drag.wx), ny = snap(drag.oy + wpp.y - drag.wy);
        if (!drag.moved && (nx !== drag.inst.x || ny !== drag.inst.y)) {
          remember();
          drag.moved = true;
        }
        // cała grupa przesuwa się o tyle samo, co chwycony obiekt
        const dx = nx - drag.ox, dy = ny - drag.oy;
        for (const it of drag.items) {
          it.inst.x = it.ox + dx;
          it.inst.y = it.oy + dy;
        }
      } else if (drag.kind === "box") {
        drag.ex = p.x;
        drag.ey = p.y;
      } else if (drag.kind === "paint") {
        const o = drag.obj;
        const pos = snapPt(wp.x, wp.y);
        const cx = Math.round((pos.x - drag.x0) / o.w), cy = Math.round((pos.y - drag.y0) / o.h);
        const key = cx + "," + cy;
        if (!drag.done.has(key)) {
          drag.done.add(key);
          selectOnly(placeBrush(o, drag.x0 + cx * o.w, drag.y0 + cy * o.h));
        }
      } else if (drag.kind === "resize") {
        const c = view.camFor(drag.inst, cam, canvas.width, canvas.height);
        const wpp = toWorld(p.x, p.y, c);
        const dx = wpp.x - drag.wx, dy = wpp.y - drag.wy;
        const s = drag.start, i = drag.inst;
        const left = drag.corner === 0 || drag.corner === 2, top = drag.corner === 0 || drag.corner === 1;
        if (left) {
          const nx = snap(s.x + dx);
          i.w = Math.max(1, s.x + s.w - nx);
          i.x = s.x + s.w - i.w;
        } else i.w = Math.max(1, snap(s.x + s.w + dx) - s.x);
        if (top) {
          const ny = snap(s.y + dy);
          i.h = Math.max(1, s.y + s.h - ny);
          i.y = s.y + s.h - i.h;
        } else i.h = Math.max(1, snap(s.y + s.h + dy) - s.y);
      }
    });
    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (drag?.kind === "box") {
          const { dpr } = size();
          const x0 = Math.min(drag.sx, drag.ex) * dpr, x1 = Math.max(drag.sx, drag.ex) * dpr;
          const y0 = Math.min(drag.sy, drag.ey) * dpr, y1 = Math.max(drag.sy, drag.ey) * dpr;
          const inside = view.instances().filter((i) => {
            if (i.locked || !objById(i.obj)) return false;
            const r = screenRect(i);
            return r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0;
          });
          setSelection([...new Set([...drag.add, ...inside])]);
        }
        if (drag && (drag.kind === "move" || drag.kind === "resize" || drag.kind === "paint")) {
          view.invalidate();
          renderLevels();
          renderProps();
        }
        drag = null;
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", () => ((hover = null), (hoverScreen = null)));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const p = local(e);
        const before = toWorld(p.x, p.y);
        cam.scale = Math.min(20, Math.max(0.05, cam.scale * Math.pow(1.0015, -e.deltaY)));
        const after = toWorld(p.x, p.y);
        cam.x += before.x - after.x;
        cam.y += before.y - after.y;
      },
      { passive: false },
    );

    // ---------- operacje ----------
    /** po zmianie zaznaczenia / obiektów */
    function afterEdit() {
      view.invalidate();
      renderLevels();
      renderProps();
    }
    function setSelection(list: Inst2D[]) {
      selected = list.at(-1) ?? null;
      multi = list.length > 1 ? list : [];
      if (selected) editObj = objById(selected.obj) ?? editObj;
      renderProps();
      renderObjects();
    }
    function duplicate() {
      const list = sel();
      if (!list.length) return;
      remember();
      const maxZ = level.instances.reduce((m, i) => Math.max(m, i.z), 0);
      const copies = list.map((i, k): Inst2D => ({ ...structuredClone(i), id: newId2d(), x: i.x + Math.max(grid, 16), y: i.y, z: maxZ + 1 + k }));
      level.instances.push(...copies);
      setSelection(copies);
      afterEdit();
    }
    function removeSelected() {
      const list = sel();
      if (!list.length) return;
      remember();
      const ids = new Set(list.map((i) => i.id));
      level.instances = level.instances.filter((i) => !ids.has(i.id));
      selectOnly(null);
      afterEdit();
    }
    function zOrder(dir: number) {
      const list = sel();
      if (!list.length) return;
      remember();
      for (const s of [...list].sort((a, b) => (a.z - b.z) * dir)) {
        const zs = level.instances.filter((i) => i.layer === s.layer && i !== s).map((i) => i.z);
        s.z = dir > 0 ? Math.max(s.z, ...zs) + 1 : Math.min(s.z, ...zs) - 1;
      }
      view.invalidate();
    }
    function copySel(cut = false) {
      const list = sel();
      if (!list.length) return;
      clipboard = structuredClone(list);
      toast(cut ? `Wycięto: ${list.length}` : `Skopiowano: ${list.length} - Ctrl+V wkleja (też na innym poziomie)`);
      if (cut) removeSelected();
    }
    function paste() {
      if (!clipboard.length) return toast("Najpierw skopiuj coś (Ctrl+C)");
      const known = clipboard.filter((i) => objById(i.obj));
      if (!known.length) return;
      remember();
      // wklejamy w miejscu kursora (lewy górny róg skopiowanych), bez kursora - obok oryginału
      const x0 = Math.min(...known.map((i) => i.x)), y0 = Math.min(...known.map((i) => i.y));
      const at = hover ? snapPt(hover.wx, hover.wy) : { x: x0 + Math.max(grid, 16), y: y0 + Math.max(grid, 16) };
      const maxZ = level.instances.reduce((m, i) => Math.max(m, i.z), 0);
      const pasted = known.map((i, k): Inst2D => ({ ...structuredClone(i), id: newId2d(), x: i.x - x0 + at.x, y: i.y - y0 + at.y, z: maxZ + 1 + k }));
      level.instances.push(...pasted);
      setSelection(pasted);
      afterEdit();
    }
    function selectAll() {
      setSelection(level.instances.filter((i) => !i.locked));
      view.invalidate();
    }
    function rotateSel(deg: number) {
      const list = sel();
      if (!list.length) return;
      remember();
      for (const i of list) i.angle = ((((i.angle ?? 0) + deg) % 360) + 360) % 360 || undefined;
      afterEdit();
    }
    function flipSel() {
      const list = sel();
      if (!list.length) return;
      remember();
      for (const i of list) i.flip = !i.flip || undefined;
      afterEdit();
    }
    function lockSel() {
      const list = sel();
      if (!list.length) return;
      remember();
      for (const i of list) i.locked = true;
      selectOnly(null);
      toast(`Zablokowano: ${list.length}. Odblokujesz w ustawieniach poziomu.`);
      afterEdit();
    }
    /** widok na cały poziom */
    function fitLevel() {
      const list = level.instances.filter((i) => i.layer === "main");
      if (!list.length) return centerOnLevel();
      const x0 = Math.min(...list.map((i) => i.x)), x1 = Math.max(...list.map((i) => i.x + i.w));
      const y0 = Math.min(...list.map((i) => i.y)), y1 = Math.max(...list.map((i) => i.y + i.h));
      const { W, H } = size();
      cam.x = (x0 + x1) / 2;
      cam.y = (y0 + y1) / 2;
      cam.scale = Math.min(20, Math.max(0.02, Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0)) * 0.9));
    }
    function zoomBy(k: number) {
      cam.scale = Math.min(20, Math.max(0.02, cam.scale * k));
    }

    // ---------- klawiatura ----------
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || document.querySelector(".modal-bg, .script-editor, .gui-editor")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        doUndo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      } else if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (ctrl && e.key.toLowerCase() === "c") copySel();
      else if (ctrl && e.key.toLowerCase() === "x") copySel(true);
      else if (ctrl && e.key.toLowerCase() === "v") {
        e.preventDefault();
        paste();
      } else if (ctrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        showLeftTab("objects");
        leftPanel.classList.add("open");
        objSearch.focus();
        objSearch.select();
      } else if (ctrl && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (ctrl) return;
      else if (e.key === "Delete" || e.key === "Backspace") removeSelected();
      else if (e.key === "Escape") {
        setBrush(null);
        selectOnly(null);
        renderProps();
      } else if (e.key.toLowerCase() === "r") rotateSel(e.shiftKey ? -90 : 90);
      else if (e.key.toLowerCase() === "f") flipSel();
      else if (e.key.toLowerCase() === "l") lockSel();
      else if (e.key.toLowerCase() === "g") {
        showGrid = !showGrid;
        updateStatus();
      } else if (e.key === "Home") centerOnLevel();
      else if (e.key === "0") fitLevel();
      else if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-") zoomBy(0.8);
      else if (e.key === "?") openShortcuts();
      else if (sel().length && e.key.startsWith("Arrow")) {
        e.preventDefault();
        remember();
        const s = e.shiftKey ? 1 : Math.max(1, grid);
        for (const i of sel()) {
          if (e.key === "ArrowLeft") i.x -= s;
          if (e.key === "ArrowRight") i.x += s;
          if (e.key === "ArrowUp") i.y -= s;
          if (e.key === "ArrowDown") i.y += s;
        }
        view.invalidate();
        renderProps();
      }
    };
    window.addEventListener("keydown", onKey);
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    cleanups.push(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBefore);
      cancelAnimationFrame(raf);
    });

    // ---------- współpraca: inni twórcy tej gry na żywo ----------
    function applyRemote(c: Change2D) {
      for (const a of c.assets) assets.add(a);
      const found = w.levels.find((l) => l.id === level.id);
      if (!found) {
        switchLevel(w.levels.find((l) => l.id === w.startLevel) ?? w.levels[0]);
      } else {
        if (selected && !level.instances.includes(selected)) selected = level.instances.find((i) => i.id === selected!.id) ?? null;
        multi = multi.map((m) => level.instances.find((i) => i.id === m.id)).filter((m): m is Inst2D => !!m);
        if (drag && (drag.kind === "move" || drag.kind === "resize") && !level.instances.includes(drag.inst)) drag = null;
      }
      if (editObj && !w.objects.includes(editObj)) editObj = objById(editObj.id) ?? null;
      if (brush && !w.objects.includes(brush)) setBrush(objById(brush.id) ?? null);
      view.refreshObjects();
      view.invalidate();
      renderLevels();
      renderObjects();
      renderCharacters();
      renderSounds();
      renderScripts();
      // nie odświeżamy pól, w których ktoś właśnie pisze
      if (!props.contains(document.activeElement)) renderProps();
      updateFab();
    }
    let collab: Collab2D | null = null;
    function renderEditors(list: Editor[]) {
      editorsBtn.replaceChildren(
        ...list.slice(0, 5).map((e) => h("span", { class: "ed-dot", style: `background:${e.color}`, title: e.username }, e.username.slice(0, 1).toUpperCase())),
        h("span", null, list.length ? `${list.length + 1} w Studiu` : "Współpraca"),
      );
    }
    renderEditors([]);
    if (src.online && src.worldId && session.user) {
      collab = new Collab2D({
        worldId: src.worldId,
        data,
        cursor: () => ({ x: hover ? hover.wx : cam.x, y: hover ? hover.wy : cam.y, level: level.id, sel: selected?.id ?? null }),
        onRemote: applyRemote,
        onEditors: renderEditors,
      });
      cleanups.push(() => collab?.dispose());
    }
    if (localStorage.getItem("predator.debug"))
      (window as unknown as { __studio2d: unknown }).__studio2d = { data, w, level: () => level, collab: () => collab, cam };

    renderKit();
    renderAll();
    showLeftTab(w.objects.length > 8 ? "objects" : "kit");
    leftPanel.classList.remove("open");
    syncMobileTabs();
    if (startDirty) changed();
    if (shouldShowGuide("2d")) setTimeout(() => openGuide("2d"), 600);
    assets.ready.then(() => {
      if (disposed) return;
      centerOnLevel();
      frame();
    });
  }

  return () => {
    disposed = true;
    cleanups.forEach((f) => f());
    el.remove();
  };
}
