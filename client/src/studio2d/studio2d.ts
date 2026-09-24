// Predator Studio 2D: poziomy, obiekty (obrazki, animacje, kafelki, napisy, światła, strefy),
// stawianie i przesuwanie na planszy, zachowania bez kodu, postacie, dźwięki, skrypty Lua,
// test bez serwera i zapis na serwer albo do pliku .pgame. Działa też na telefonie.
import { fileNameFor, GAME_EXT, makeGameFile, parseGameFile, type GameMeta } from "../../../shared/gamefile.ts";
import { importGDevelop } from "../../../shared/import/gdevelop.ts";
import type { WorldData, WorldInfo, WorldScript } from "../../../shared/types.ts";
import { MAX_PLAYERS_LIMIT } from "../../../shared/types.ts";
import type { Anim2D, Asset2D, Character2D, Inst2D, Level2D, Obj2D, Role2D, Solid2D, World2D } from "../../../shared/types2d.ts";
import { emptyLevel, instBox, MAX_ASSET_CHARS, newId2d, sanitizeWorld2D } from "../../../shared/world2d.ts";
import { api } from "../api.ts";
import { desktop, pickFile, pickFiles, saveTextFile } from "../files.ts";
import { AssetStore, unlockAudio } from "../game2d/assets.ts";
import { fitScale, LevelView, type Camera2D } from "../game2d/render.ts";
import { session } from "../state.ts";
import { openSettings } from "../settings.ts";
import { LUA_HELP_2D, openScriptEditor } from "../studio/scriptEditor.ts";
import type { StudioFile } from "../studio/studio.ts";
import { ask, h, logo, modal, toast } from "../ui/dom.ts";
import { badgeEditor } from "../studio/badgeEditor.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

interface Source {
  online: boolean;
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
          published: info.published,
          async save(meta, d, published, thumbnail) {
            const res = await api.saveWorld(worldId, { ...meta, published, data: d, thumbnail });
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
    let grid = 8;
    let dirty = false;
    const undo: string[] = [];
    const redo: string[] = [];
    const cam: Camera2D = { x: 0, y: 0, scale: 1 };
    let zoom = 1;
    const objById = (id: string) => w.objects.find((o) => o.id === id);

    // ---------- cofanie ----------
    const snapshot = () => JSON.stringify({ levels: w.levels, objects: w.objects, characters: w.characters, startLevel: w.startLevel, scripts: data.scripts });
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
      level = w.levels.find((l) => l.id === level.id) ?? w.levels[0];
      selected = selected ? (level.instances.find((i) => i.id === selected!.id) ?? null) : null;
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
    async function test() {
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
      !src.online ? item("☁ Wyślij na serwer", upload) : null,
    );
    const saveBtn = h("button", { class: "tb-btn", onClick: () => save(), title: "Zapisz (Ctrl+S)" }, "💾", h("span", null, "Zapisz"));
    const gridSel = h(
      "select",
      { class: "tb-select", title: "Siatka", onChange: (e: Event) => (grid = Number((e.target as HTMLSelectElement).value)) },
      [1, 4, 8, 16, 32].map((v) => h("option", { value: String(v), selected: v === grid }, v === 1 ? "Bez siatki" : `Siatka ${v}`)),
    );
    const brushInfo = h("span", { class: "tb-mode hidden" });
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
      h("button", { class: "tb-btn play", onClick: () => test(), title: src.online ? "Zapisz i zagraj na serwerze" : "Zagraj bez serwera" }, "▶", h("span", null, "Testuj")),
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
      h("button", { class: "tb-btn", onClick: () => openGameSettings() }, "⚙", h("span", null, "Ustawienia gry")),
      h("button", { class: "tb-btn", onClick: () => openSettings() }, "🎚", h("span", null, "Ustawienia")),
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
    const leftPanel = h(
      "aside",
      { class: "studio-panel left" },
      title("Poziomy", small("+ Nowy", () => addLevel())),
      levelsList,
      title("Obiekty", small("+ Nowy", () => newObject())),
      h("div", { class: "hint pad" }, "Kliknij obiekt, a potem planszę, żeby go postawić."),
      objectsList,
      title("Postacie", small("+ Nowa", () => editCharacter(null))),
      charsList,
      title("Dźwięki", small("+ Dodaj", () => addSounds())),
      soundsList,
      title("Skrypty Lua", small("+ Lua", () => addScript())),
      scriptsList,
    );
    const rightPanel = h("aside", { class: "studio-panel right" }, h("div", { class: "panel-title" }, "Właściwości"), props);
    const mobileTabs = h(
      "div",
      { class: "studio-mtabs" },
      h("button", { onClick: () => togglePanel(leftPanel) }, "📋 Poziomy i obiekty"),
      h("button", { onClick: () => togglePanel(rightPanel) }, "🔧 Właściwości"),
    );
    function togglePanel(p: HTMLElement) {
      const open = !p.classList.contains("open");
      leftPanel.classList.remove("open");
      rightPanel.classList.remove("open");
      if (open) p.classList.add("open");
    }
    el.append(toolbar, h("div", { class: "studio-main" }, leftPanel, viewport, rightPanel), mobileTabs);

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
            h("span", { class: "tree-icon" }, l.id === w.startLevel ? "⭐" : "🗺"),
            l.name,
            h("span", { class: "tree-kind" }, String(l.instances.length)),
          ),
        ),
      );
    }
    function renderObjects() {
      objectsList.replaceChildren(
        ...w.objects.map((o) =>
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
                  selected = null;
                  editObj = o;
                  renderAll();
                },
              },
              thumbOf(o),
              h("span", { class: "obj-name" }, o.name),
              o.role !== "none" ? h("span", { class: "tree-kind" }, ROLE_LABELS[o.role].split(" ")[0]) : null,
            ),
            h("button", { class: "icon-btn", title: "Edytuj obiekt", onClick: () => ((editObj = o), (selected = null), setBrush(null), renderAll()) }, "✎"),
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
            h("button", { class: "script-open", onClick: () => editScript(s) }, "📜 " + s.name),
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
    }

    function switchLevel(l: Level2D) {
      level = l;
      selected = null;
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
      if (selected) return renderInstProps(selected);
      if (editObj) return renderObjProps(editObj);
      renderLevelProps();
    }

    function renderLevelProps() {
      const l = level;
      props.replaceChildren(
        h("div", { class: "prop-group" }, "Poziom"),
        field("Nazwa", textIn(l.name, (v) => (l.name = v.trim().slice(0, 40) || l.name))),
        field("Kolor tła", colorIn(l.background, (v) => (l.background = v))),
        field("Przybliżenie widoku", numIn(l.zoom, (v) => (l.zoom = Math.min(10, Math.max(0.2, v))), 0.1), "2 = piksele 2x większe (jak w GDevelop: zoom kamery)"),
        field("Śmierć poniżej Y", h("div", { class: "xy" }, numIn(l.killY ?? 0, (v) => (l.killY = v)), h("button", { class: "btn small", onClick: () => (remember(), (l.killY = null), renderProps()) }, "brak")), l.killY === null ? "Brak - spadanie nie zabija" : "Czerwona linia na planszy"),
        field("Kamera nie niżej niż Y", h("div", { class: "xy" }, numIn(l.cameraBottom ?? 0, (v) => (l.cameraBottom = v)), h("button", { class: "btn small", onClick: () => (remember(), (l.cameraBottom = null), renderProps()) }, "brak")), l.cameraBottom === null ? "Brak ograniczenia" : "Niebieska linia na planszy"),
        checkIn("Noc / ciemność (światła rozjaśniają)", !!l.ambient, (v) => (l.ambient = v ? "#606080" : undefined)),
        l.ambient ? field("Kolor ciemności", colorIn(l.ambient, (v) => (l.ambient = v))) : "",
        checkIn("Śmierć bez checkpointu = poziom od nowa", !!l.restartOnDeath, (v) => (l.restartOnDeath = v || undefined)),
        checkIn("Gracze mogą stawać sobie na głowach", !!l.stackPlayers, (v) => (l.stackPlayers = v || undefined)),
        checkIn("Do wyboru z menu gry", !!l.selectable, (v) => (l.selectable = v || undefined)),
        checkIn("Poziom startowy", w.startLevel === l.id, (v) => v && (w.startLevel = l.id)),
        field(
          "Postać na tym poziomie",
          selectIn([["", "Wybrana przez gracza"], ...w.characters.map((c): [string, string] => [c.id, c.name])], l.character ?? "", (v) => (l.character = v || undefined)),
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
        h("p", { class: "hint" }, "Przesuwanie widoku: prawy / środkowy przycisk myszy albo przeciągnij puste miejsce. Kółko = przybliżenie. Na telefonie dwa palce."),
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
        i.layer === "bg" ? field("Przesuwanie tła (0 = stoi, 1 = jak świat)", numIn(i.parallax ?? 0, (v) => (i.parallax = Math.min(1, Math.max(0, v))), 0.1)) : "",
        checkIn("Odbity w poziomie", !!i.flip, (v) => (i.flip = v || undefined)),
        animNames.length > 1 ? field("Animacja", selectIn(animNames, i.anim ?? o.anims[0].name, (v) => (i.anim = v === o.anims[0].name ? undefined : v))) : "",
        o.role === "button" || o.role === "gate" ? field("Klucz (przycisk otwiera bramy z tym samym)", numIn(i.key ?? 0, (v) => (i.key = Math.round(v)))) : "",
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn small", onClick: () => ((editObj = o), (selected = null), renderAll()) }, "✎ Edytuj obiekt"),
          h("button", { class: "btn small", onClick: () => resetSize(i, o) }, "Rozmiar obrazka"),
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

    function animEditor(o: Obj2D) {
      const box = h("div", { class: "anims" });
      const addFrames = async (a: Anim2D) => {
        const files = await pickFiles(["image/png", "image/jpeg", "image/gif", "image/webp"], true);
        if (!files.length) return;
        try {
          const list = await Promise.all(files.sort((p, q) => p.name.localeCompare(q.name, undefined, { numeric: true })).map(imageAsset));
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
              { class: "frame" },
              as ? h("img", { src: as.data, alt: "" }) : "?",
              h("button", { class: "frame-x", title: "Usuń klatkę", onClick: () => (remember(), a.frames.splice(idx, 1), renderProps()) }, "×"),
            );
          }),
          h("button", { class: "frame add", title: o.kind === "tiled" ? "Wybierz obrazek" : "Dodaj klatki (można kilka plików naraz)", onClick: () => (o.kind === "tiled" && (a.frames = []), addFrames(a)) }, "+"),
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
          const files = await pickFiles(["image/png", "image/jpeg", "image/gif", "image/webp"], kind === "sprite");
          if (!files.length) return;
          let list: Asset2D[];
          try {
            list = await Promise.all(files.sort((p, q) => p.name.localeCompare(q.name, undefined, { numeric: true })).map(imageAsset));
          } catch (e) {
            return toast((e as Error).message, "error");
          }
          for (const a of list) {
            w.assets.push(a);
            await assets.add(a);
          }
          const name = files[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]?\d+$/, "") || "Obiekt";
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
        selected = null;
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
    function addScript() {
      remember();
      const s: WorldScript = {
        id: newId2d(),
        name: "Skrypt " + (data.scripts.length + 1),
        type: "lua",
        source: '-- Przykład: gdy gracz dotknie obiektu "Meta"\nonTouch("Meta", function(player)\n  say(playerName(player) .. " dotarł do mety!")\nend)\n',
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
      );
    }

    // ---------- ustawienia gry ----------
    function openGameSettings() {
      const name = h("input", { value: meta.name, maxLength: 40 });
      const desc = h("textarea", { value: meta.description, maxLength: 500, rows: 3 });
      const maxP = h("input", { type: "number", min: "1", max: String(MAX_PLAYERS_LIMIT), value: String(meta.maxPlayers) });
      const pub = h("input", { type: "checkbox", checked: src.published });
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
      const close = modal(
        "Ustawienia gry",
        h(
          "div",
          { class: "form" },
          h("label", null, "Nazwa", name),
          h("label", null, "Opis", desc),
          h("label", null, `Maks. graczy na serwer (1–${MAX_PLAYERS_LIMIT})`, maxP),
          h("div", { class: "prop-group" }, "Fizyka postaci (piksele na sekundę)"),
          h("div", { class: "grid2" }, physIn.map((p) => p.el)),
          h("div", { class: "prop-group" }, "Dźwięki"),
          h("div", { class: "grid2" }, soundSel.map((s) => s.el)),
          badges.el,
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
              data.badges = badges.read();
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
        for (const [hx, hy] of handles(r)) {
          ctx.fillRect(hx - HANDLE * dpr, hy - HANDLE * dpr, HANDLE * 2 * dpr, HANDLE * 2 * dpr);
          ctx.strokeRect(hx - HANDLE * dpr, hy - HANDLE * dpr, HANDLE * 2 * dpr, HANDLE * 2 * dpr);
        }
      }
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
    const HANDLE = 5;
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
    type Drag =
      | { kind: "pan"; sx: number; sy: number; cx: number; cy: number }
      | { kind: "move"; inst: Inst2D; ox: number; oy: number; wx: number; wy: number; moved: boolean }
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
        const r = screenRect(i);
        const o = objById(i.obj);
        const rr = o?.kind === "light" ? { x: r.x - 12, y: r.y - 12, w: 24, h: 24 } : r;
        const px = sx * dpr, py = sy * dpr;
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
      if (selected) {
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
        const maxZ = level.instances.reduce((m, i) => Math.max(m, i.z), 0);
        const inst: Inst2D = { id: newId2d(), obj: brush.id, x: pos.x, y: pos.y, w: brush.w, h: brush.h, z: maxZ + 1, layer: "main" };
        level.instances.push(inst);
        view.invalidate();
        selected = inst;
        renderLevels();
        renderProps();
        return;
      }
      const hit = hitTest(p.x, p.y);
      if (hit) {
        selected = hit;
        editObj = objById(hit.obj) ?? null;
        const r = screenRect(hit);
        const wp = toWorld(p.x, p.y, r.c);
        drag = { kind: "move", inst: hit, ox: hit.x, oy: hit.y, wx: wp.x, wy: wp.y, moved: false };
        renderProps();
        renderObjects();
      } else {
        if (selected) {
          selected = null;
          renderProps();
        }
        drag = { kind: "pan", sx: p.x, sy: p.y, cx: cam.x, cy: cam.y };
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      const wp = toWorld(p.x, p.y);
      hover = { wx: wp.x, wy: wp.y };
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
        drag.inst.x = nx;
        drag.inst.y = ny;
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
        if (drag && (drag.kind === "move" || drag.kind === "resize")) {
          view.invalidate();
          renderProps();
        }
        drag = null;
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", () => (hover = null));
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
    function duplicate() {
      if (!selected) return;
      remember();
      const copy: Inst2D = { ...structuredClone(selected), id: newId2d(), x: selected.x + Math.max(grid, 16), y: selected.y };
      level.instances.push(copy);
      selected = copy;
      view.invalidate();
      renderLevels();
      renderProps();
    }
    function removeSelected() {
      if (!selected) return;
      remember();
      const id = selected.id;
      level.instances = level.instances.filter((i) => i.id !== id);
      selected = null;
      view.invalidate();
      renderLevels();
      renderProps();
    }
    function zOrder(dir: number) {
      if (!selected) return;
      remember();
      const zs = level.instances.filter((i) => i.layer === selected!.layer).map((i) => i.z);
      selected.z = dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
      view.invalidate();
    }

    // ---------- klawiatura ----------
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || document.querySelector(".modal-bg, .script-editor")) return;
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
      } else if (e.key === "Delete" || e.key === "Backspace") removeSelected();
      else if (e.key === "Escape") {
        setBrush(null);
        selected = null;
        renderProps();
      } else if (selected && e.key.startsWith("Arrow")) {
        e.preventDefault();
        remember();
        const s = e.shiftKey ? 1 : Math.max(1, grid);
        if (e.key === "ArrowLeft") selected.x -= s;
        if (e.key === "ArrowRight") selected.x += s;
        if (e.key === "ArrowUp") selected.y -= s;
        if (e.key === "ArrowDown") selected.y += s;
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

    renderAll();
    if (startDirty) changed();
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
