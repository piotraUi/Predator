// Studio - edytor świata: stawianie, przesuwanie i skalowanie klocków, skrypty i ustawienia gry.
import {
  ArcRotateCamera,
  CreateScreenshotUsingRenderTargetAsync,
  GizmoManager,
  PointerEventTypes,
  Ray,
  Scene,
  Vector3,
  type AbstractMesh,
} from "@babylonjs/core";
import { toolIcon, TOOL_TYPE_LABELS } from "../../../shared/tools.ts";
import type { AnimDef, CharacterDef, Part, PartKind, PartShape, ToolDef, WorldData, WorldInfo, WorldScript } from "../../../shared/types.ts";
import { MAX_PLAYERS_LIMIT } from "../../../shared/types.ts";
import { makePart, MAX_PARTS, newId } from "../../../shared/world.ts";
import { api } from "../api.ts";
import { desktop, pickDataUrl, pickFile, saveTextFile } from "../files.ts";
import { session } from "../state.ts";
import { fileNameFor, GAME_EXT, makeGameFile, parseGameFile, type GameMeta } from "../../../shared/gamefile.ts";
import { createEngine, WorldView } from "../engine/world.ts";
import { ask, h, logo, modal, toast } from "../ui/dom.ts";
import { openScriptEditor } from "./scriptEditor.ts";
import { openToolEditor } from "./toolEditor.ts";
import { openCharacterEditor } from "./characterEditor.ts";
import { openAnimEditor } from "./animEditor.ts";
import { animTemplates, makeAnim } from "../../../shared/anim.ts";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { CHAR_EXT, parseCharacterFile } from "../../../shared/gamefile.ts";
import { MAX_ANIMATIONS, MAX_CHARACTERS, MAX_MODEL_CHARS } from "../../../shared/world.ts";
import { STUDIO_INPUTS, lookRadPerPx, pointerButtons, robloxCamera } from "../engine/camera.ts";
import { openSettings, settings } from "../settings.ts";
import { badgeEditor } from "./badgeEditor.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;
type Tool = "select" | "move" | "scale";

const PRESETS: { label: string; icon: string; part: Partial<Part> }[] = [
  { label: "Klocek", icon: "⬛", part: { name: "Klocek", shape: "box", sx: 4, sy: 1, sz: 2 } },
  { label: "Kula", icon: "⚪", part: { name: "Kula", shape: "sphere", sx: 3, sy: 3, sz: 3 } },
  { label: "Walec", icon: "🛢", part: { name: "Walec", shape: "cylinder", sx: 2, sy: 4, sz: 2 } },
  { label: "Klin", icon: "📐", part: { name: "Klin", shape: "wedge", sx: 4, sy: 2, sz: 4 } },
  { label: "Spawn", icon: "🏁", part: { name: "Spawn", kind: "spawn", sx: 6, sy: 1, sz: 6, color: "#6e6e78" } },
  { label: "Lawa", icon: "🔥", part: { name: "Lawa", kind: "kill", sx: 8, sy: 1, sz: 8, color: "#ff4d00", material: "neon" } },
  { label: "Trampolina", icon: "🟣", part: { name: "Trampolina", kind: "bounce", sx: 6, sy: 1, sz: 6, color: "#ff66cc" } },
  { label: "Postać (NPC)", icon: "🧍", part: { name: "NPC", kind: "npc", sx: 2, sy: 5.2, sz: 1, color: "#7fb8ff" } },
];

const SHAPE_ICONS: Record<PartShape, string> = { box: "⬛", sphere: "⚪", cylinder: "🛢", wedge: "📐" };
const KIND_LABELS: Record<PartKind, string> = {
  normal: "Zwykły",
  spawn: "Spawn (start)",
  kill: "Zabija (lawa)",
  bounce: "Trampolina",
  pickup: "Narzędzie do podniesienia",
  npc: "Postać (NPC)",
};

const snap = (v: number, step: number) => Math.round(v / step) * step;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Gra otwarta z pliku .pgame (bez serwera) */
export interface StudioFile {
  meta: GameMeta;
  data: WorldData;
  /** ścieżka pliku na dysku (aplikacja .exe) */
  path?: string;
  fileName?: string;
  dirty?: boolean;
}

/** Skąd pochodzi gra i gdzie ją zapisać */
interface Source {
  online: boolean;
  published: boolean;
  save(meta: GameMeta, data: WorldData, published: boolean, thumbnail?: string): Promise<void>;
}

class SaveCancelled extends Error {}

export function studioScreen(
  root: HTMLElement,
  params: { worldId?: number; file?: StudioFile; loaded?: { info: WorldInfo; data: WorldData } },
  go: Go,
) {
  const canvas = h("canvas", { class: "studio-canvas" });
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Wczytywanie gry…");
  const viewport = h("div", { class: "studio-viewport" }, canvas, loading);
  const el = h("div", { class: "studio" }, viewport);
  root.append(el);

  const { engine, dispose: disposeEngine } = createEngine(canvas);
  const scene = new Scene(engine);
  let disposed = false;
  const cleanups: (() => void)[] = [];

  const file = params.file;
  const exitScreen = () => (session.user ? go("home", { tab: "create" }) : go("offline"));
  if (file) {
    // gra z pliku - działa bez serwera
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
    let dirty = false;
    let selected: Part | null = null;
    let tool: Tool = "move";
    let gridStep = 1;
    const undo: string[] = [];
    const redo: string[] = [];

    const view = new WorldView(scene, { shadows: false, skyColor: data.skyColor });
    view.setTools(data.tools);
    view.setCharacters(data.characters, data.animations);
    view.load(data.parts);

    // ---------- kamera ----------
    const camera = new ArcRotateCamera("cam", -Math.PI / 2 + 0.6, 1.0, 60, new Vector3(0, 0, 0), scene);
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 600;
    camera.minZ = 0.3;
    camera.maxZ = 3000;
    robloxCamera(camera, STUDIO_INPUTS);
    // środkowy przycisk myszy = przesuwanie widoku, na dotyku dwa palce
    camera.attachControl(true, false, 1);
    (camera.inputs.attached.pointers as unknown as { multiTouchPanning: boolean }).multiTouchPanning = true;
    // myszką kamera Babylona obsługuje tylko przesuwanie; obrót prawym przyciskiem robimy sami niżej
    cleanups.push(pointerButtons(camera, canvas, [1]));

    // prawy przycisk: rozglądanie się w miejscu (jak w Roblox Studio) - kamera stoi, obraca się widok
    let looking: number | null = null;
    const onLookDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 2) return;
      looking = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
    };
    const onLookMove = (e: PointerEvent) => {
      if (looking !== e.pointerId) return;
      const r = camera.radius;
      const dir = (a: number, b: number) => new Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b));
      const eye = camera.target.add(dir(camera.alpha, camera.beta).scale(r));
      const k = lookRadPerPx();
      camera.alpha += e.movementX * k;
      camera.beta = Math.min(Math.PI - 0.05, Math.max(0.05, camera.beta + e.movementY * k * (settings.invertY ? -1 : 1)));
      // punkt, na który patrzymy, przesuwa się tak, żeby kamera została w miejscu
      camera.target = eye.subtract(dir(camera.alpha, camera.beta).scale(r));
    };
    const onLookUp = (e: PointerEvent) => {
      if (looking === e.pointerId) looking = null;
    };
    canvas.addEventListener("pointerdown", onLookDown);
    canvas.addEventListener("pointermove", onLookMove);
    canvas.addEventListener("pointerup", onLookUp);
    canvas.addEventListener("pointercancel", onLookUp);
    cleanups.push(() => {
      canvas.removeEventListener("pointerdown", onLookDown);
      canvas.removeEventListener("pointermove", onLookMove);
      canvas.removeEventListener("pointerup", onLookUp);
      canvas.removeEventListener("pointercancel", onLookUp);
    });
    // przesuwanie środkowym przyciskiem "chwyta" świat - prędkość zależna od odległości
    scene.onBeforeRenderObservable.add(() => {
      const worldPerPx = (2 * camera.radius * Math.tan(camera.fov / 2)) / Math.max(1, canvas.clientHeight);
      camera.panningSensibility = 1 / worldPerPx;
    });

    // ---------- gizmo ----------
    const gizmos = new GizmoManager(scene);
    gizmos.usePointerToAttachGizmos = false;
    gizmos.positionGizmoEnabled = true;
    gizmos.scaleGizmoEnabled = true;
    gizmos.boundingBoxGizmoEnabled = false;
    const pg = gizmos.gizmos.positionGizmo!;
    const sg = gizmos.gizmos.scaleGizmo!;
    pg.scaleRatio = sg.scaleRatio = matchMedia("(pointer: coarse)").matches ? 1.6 : 1.1;
    sg.sensitivity = 3;
    const applySnap = () => {
      pg.snapDistance = gridStep;
      sg.snapDistance = gridStep;
    };
    applySnap();
    gizmos.positionGizmoEnabled = false;
    gizmos.scaleGizmoEnabled = false;

    const onGizmoEnd = () => {
      if (!selected) return;
      const mesh = view.meshes.get(selected.id);
      if (!mesh) return;
      pushUndo();
      selected.x = round(mesh.position.x);
      selected.y = round(mesh.position.y);
      selected.z = round(mesh.position.z);
      selected.sx = round(Math.max(0.2, Math.abs(mesh.scaling.x)));
      selected.sy = round(Math.max(0.2, Math.abs(mesh.scaling.y)));
      selected.sz = round(Math.max(0.2, Math.abs(mesh.scaling.z)));
      view.apply(selected);
      changed();
      renderProps();
    };
    pg.onDragEndObservable.add(onGizmoEnd);
    sg.onDragEndObservable.add(onGizmoEnd);

    // ---------- wybieranie ----------
    scene.onPointerObservable.add((pi) => {
      if (pi.type !== PointerEventTypes.POINTERTAP || pi.event.button !== 0) return;
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m: AbstractMesh) => !!m.metadata?.partId);
      const id = pick?.pickedMesh?.metadata?.partId as string | undefined;
      select(id ? (data.parts.find((p) => p.id === id) ?? null) : null);
    });

    function select(p: Part | null) {
      selected = p;
      const mesh = p ? view.meshes.get(p.id) : null;
      for (const m of view.meshes.values()) m.showBoundingBox = false;
      if (mesh) mesh.showBoundingBox = true;
      gizmos.attachToMesh(mesh ?? null);
      setTool(tool);
      renderProps();
      renderExplorer();
    }

    function setTool(t: Tool) {
      tool = t;
      gizmos.positionGizmoEnabled = !!selected && t === "move";
      gizmos.scaleGizmoEnabled = !!selected && t === "scale";
      if (selected) gizmos.attachToMesh(view.meshes.get(selected.id) ?? null);
      applySnap();
      for (const b of toolbar.querySelectorAll<HTMLElement>("[data-tool]")) b.classList.toggle("active", b.dataset.tool === t);
    }

    // ---------- zmiany i cofanie ----------
    const snapshot = () => JSON.stringify(data.parts);
    function pushUndo() {
      undo.push(snapshot());
      if (undo.length > 60) undo.shift();
      redo.length = 0;
    }
    function restore(json: string) {
      const selId = selected?.id;
      data.parts = JSON.parse(json);
      view.clear();
      view.load(data.parts);
      select(data.parts.find((p) => p.id === selId) ?? null);
      changed();
    }
    const doUndo = () => {
      const s = undo.pop();
      if (!s) return;
      redo.push(snapshot());
      restore(s);
    };
    const doRedo = () => {
      const s = redo.pop();
      if (!s) return;
      undo.push(snapshot());
      restore(s);
    };
    function changed() {
      dirty = true;
      desktop?.setDirty(true);
      saveBtn.classList.add("unsaved");
    }

    // ---------- operacje na klockach ----------
    function addPart(preset: Partial<Part>) {
      if (data.parts.length >= MAX_PARTS) return toast(`Maksymalnie ${MAX_PARTS} klocków`, "error");
      pushUndo();
      const t = camera.target;
      const sy = preset.sy ?? 1;
      const p = makePart({ ...preset, x: snap(t.x, 1), y: sy / 2, z: snap(t.z, 1) });
      // postaw na klocku pod spodem, jeśli jest
      const hit = scene.pickWithRay(
        new Ray(new Vector3(p.x, 1000, p.z), new Vector3(0, -1, 0), 2000),
        (m: AbstractMesh) => !!m.metadata?.partId,
      );
      if (hit?.pickedPoint) p.y = round(hit.pickedPoint.y + sy / 2);
      data.parts.push(p);
      view.add(p);
      changed();
      select(p);
    }

    function duplicate() {
      if (!selected) return;
      pushUndo();
      const p: Part = { ...selected, id: newId(), y: round(selected.y + selected.sy) };
      data.parts.push(p);
      view.add(p);
      changed();
      select(p);
    }

    function remove() {
      if (!selected) return;
      pushUndo();
      const id = selected.id;
      data.parts = data.parts.filter((p) => p.id !== id);
      view.remove(id);
      changed();
      select(null);
    }

    function rotate() {
      if (!selected) return;
      pushUndo();
      selected.ry = (selected.ry + 90) % 360;
      view.apply(selected);
      changed();
      renderProps();
    }

    function focus() {
      if (!selected) return;
      camera.setTarget(new Vector3(selected.x, selected.y, selected.z));
      camera.radius = Math.max(12, Math.max(selected.sx, selected.sy, selected.sz) * 2.5);
    }

    // ---------- zapisywanie ----------
    /** Miniaturka gry do menu - to, co twórca widzi w edytorze (bez zaznaczenia) */
    async function captureThumbnail(): Promise<string | undefined> {
      const boxes = [...view.meshes.values()].filter((m) => m.showBoundingBox);
      try {
        boxes.forEach((m) => (m.showBoundingBox = false));
        const url = await CreateScreenshotUsingRenderTargetAsync(engine, camera, { width: 640, height: 360 }, "image/jpeg", 1, true);
        return url.length < 390_000 ? url : undefined;
      } catch {
        return undefined; // bez miniaturki też da się zapisać
      } finally {
        boxes.forEach((m) => (m.showBoundingBox = true));
      }
    }

    async function save(quiet = false) {
      try {
        await src.save(meta, data, src.published, src.online ? await captureThumbnail() : undefined);
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

    /** Stan do przekazania, gdy wychodzimy z edytora pliku (np. na test) i wracamy */
    const fileState = (): StudioFile => ({ meta, data, path: file?.path, fileName: file?.fileName, dirty });

    function testOffline() {
      go("play", {
        offline: { name: meta.name, data },
        back: { screen: "studio", params: file ? { file: fileState() } : { worldId: params.worldId } },
      });
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

    const fileMenu = h(
      "div",
      { class: "dropdown hidden" },
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), exportFile()) }, "💾 Zapisz jako plik .pgame"),
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), openFile()) }, "📂 Otwórz plik .pgame"),
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), testOffline()) }, "🎮 Testuj bez serwera"),
      !src.online
        ? h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), upload()) }, "☁ Wyślij na serwer")
        : null,
    );

    async function exportFile() {
      const saved = await saveTextFile(fileNameFor(meta.name, GAME_EXT), makeGameFile(meta, data), GAME_EXT);
      if (saved) toast("Zapisano plik " + saved.split(/[\\/]/).pop(), "good");
    }

    async function openFile() {
      if (!(await confirmLeave())) return;
      const f = await pickFile([GAME_EXT], "Gra Predator");
      if (!f) return;
      try {
        const parsed = parseGameFile(f.text);
        const { data: d, ...m } = parsed;
        go("studio", { file: { meta: m, data: d, path: f.path, fileName: f.name } });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }

    /** Gra z pliku trafia na serwer jako nowa gra (tylko po zalogowaniu) */
    async function upload() {
      if (!session.user) return toast("Zaloguj się na serwerze, żeby wysłać grę", "error");
      try {
        const w = await api.createWorld(meta.name);
        await api.saveWorld(w.id, { ...meta, data });
        toast("Gra wysłana na serwer ✔", "good");
        dirty = false;
        desktop?.setDirty(false);
        go("studio", { worldId: w.id });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }

    // ---------- pasek narzędzi ----------
    /** menu pod przyciskiem, ale zawsze w granicach ekranu (pasek na telefonie się przewija) */
    function toggleMenu(menu: HTMLElement, e: Event) {
      for (const m of el.querySelectorAll(".dropdown")) if (m !== menu) m.classList.add("hidden");
      menu.classList.toggle("hidden");
      if (menu.classList.contains("hidden")) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + "px";
      menu.style.top = r.bottom + 4 + "px";
    }
    const saveBtn = h("button", { class: "tb-btn", onClick: () => save(), title: "Zapisz (Ctrl+S)" }, "💾", h("span", null, "Zapisz"));
    const addMenu = h(
      "div",
      { class: "dropdown hidden" },
      PRESETS.map((pr) =>
        h("button", { class: "dd-item", onClick: () => (addMenu.classList.add("hidden"), addPart(pr.part)) }, pr.icon + " " + pr.label),
      ),
      h("button", { class: "dd-item", onClick: () => (addMenu.classList.add("hidden"), addPickup()) }, "🗡️ Narzędzie do podniesienia"),
    );
    const gridSel = h(
      "select",
      { class: "tb-select", title: "Krok siatki", onChange: (e: Event) => ((gridStep = Number((e.target as HTMLSelectElement).value)), applySnap()) },
      [0.25, 0.5, 1, 2, 4].map((v) => h("option", { value: String(v), selected: v === 1 }, `Siatka ${v}`)),
    );
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
      h(
        "button",
        { class: "tb-btn play", onClick: () => test(), title: src.online ? "Zapisz i zagraj na serwerze" : "Zagraj bez serwera" },
        "▶",
        h("span", null, "Testuj"),
      ),
      h(
        "div",
        { class: "dd-wrap" },
        h("button", { class: "tb-btn", onClick: (e: Event) => toggleMenu(fileMenu, e) }, "📁", h("span", null, "Plik")),
        fileMenu,
      ),
      h("span", { class: "tb-mode " + (src.online ? "on" : "") , title: src.online ? "Gra na serwerze" : "Gra z pliku - bez serwera" }, src.online ? "☁ serwer" : "📄 plik"),
      h("div", { class: "tb-sep" }),
      h("button", { class: "tb-btn", "data-tool": "select", onClick: () => setTool("select"), title: "Wybierz (1)" }, "👆", h("span", null, "Wybierz")),
      h("button", { class: "tb-btn", "data-tool": "move", onClick: () => setTool("move"), title: "Przesuń (2)" }, "✥", h("span", null, "Przesuń")),
      h("button", { class: "tb-btn", "data-tool": "scale", onClick: () => setTool("scale"), title: "Skaluj (3)" }, "⤡", h("span", null, "Skaluj")),
      h("button", { class: "tb-btn", onClick: rotate, title: "Obróć o 90° (R)" }, "⟳", h("span", null, "Obróć")),
      gridSel,
      h("div", { class: "tb-sep" }),
      h(
        "div",
        { class: "dd-wrap" },
        h(
          "button",
          {
            class: "tb-btn accent",
            onClick: (e: Event) => toggleMenu(addMenu, e),
          },
          "＋",
          h("span", null, "Dodaj"),
        ),
        addMenu,
      ),
      h("button", { class: "tb-btn", onClick: duplicate, title: "Duplikuj (Ctrl+D)" }, "⧉", h("span", null, "Duplikuj")),
      h("button", { class: "tb-btn", onClick: remove, title: "Usuń (Delete)" }, "🗑", h("span", null, "Usuń")),
      h("button", { class: "tb-btn", onClick: doUndo, title: "Cofnij (Ctrl+Z)" }, "↶"),
      h("button", { class: "tb-btn", onClick: doRedo, title: "Ponów (Ctrl+Y)" }, "↷"),
      h("div", { class: "tb-sep" }),
      h("button", { class: "tb-btn", onClick: () => openGameSettings() }, "⚙", h("span", null, "Ustawienia gry")),
      h("button", { class: "tb-btn", onClick: () => openSettings(), title: "Czułość kamery i inne" }, "🎚", h("span", null, "Ustawienia")),
    );

    // ---------- panele ----------
    const explorer = h("div", { class: "panel-body" });
    const props = h("div", { class: "panel-body" });
    const scriptsList = h("div", { class: "panel-body" });
    const toolsList = h("div", { class: "panel-body" });
    const charsList = h("div", { class: "panel-body" });
    const animsList = h("div", { class: "panel-body" });
    const leftPanel = h(
      "aside",
      { class: "studio-panel left" },
      h("div", { class: "panel-title" }, "Obiekty"),
      explorer,
      h(
        "div",
        { class: "panel-title" },
        "Skrypty",
        h(
          "span",
          { class: "panel-actions" },
          h("button", { class: "btn small", onClick: () => addScript("lua") }, "+ Lua"),
          h("button", { class: "btn small", onClick: () => addScript("blocks") }, "+ Bloczki"),
        ),
      ),
      scriptsList,
      h(
        "div",
        { class: "panel-title" },
        "Narzędzia i bronie",
        h("span", { class: "panel-actions" }, h("button", { class: "btn small", onClick: () => editTool(null) }, "+ Nowe")),
      ),
      toolsList,
      h(
        "div",
        { class: "panel-title" },
        "Postacie",
        h(
          "span",
          { class: "panel-actions" },
          h("button", { class: "btn small", onClick: () => importCharacter(), title: "Plik .pchar albo model .glb" }, "📥"),
          h("button", { class: "btn small", onClick: () => newCharacter() }, "+ Nowa"),
        ),
      ),
      charsList,
      h(
        "div",
        { class: "panel-title" },
        "Animacje",
        h("span", { class: "panel-actions" }, h("button", { class: "btn small", onClick: () => newAnimation() }, "+ Nowa")),
      ),
      animsList,
    );
    const rightPanel = h("aside", { class: "studio-panel right" }, h("div", { class: "panel-title" }, "Właściwości"), props);

    // przełącznik paneli na telefonie
    const mobileTabs = h(
      "div",
      { class: "studio-mtabs" },
      h("button", { onClick: () => togglePanel(leftPanel) }, "📋 Obiekty i skrypty"),
      h("button", { onClick: () => togglePanel(rightPanel) }, "🔧 Właściwości"),
    );
    function togglePanel(p: HTMLElement) {
      const open = !p.classList.contains("open");
      leftPanel.classList.remove("open");
      rightPanel.classList.remove("open");
      if (open) p.classList.add("open");
    }

    el.append(toolbar, h("div", { class: "studio-main" }, leftPanel, viewport, rightPanel), mobileTabs);
    engine.resize();

    function renderExplorer() {
      explorer.replaceChildren(
        ...data.parts.map((p) =>
          h(
            "button",
            {
              class: "tree-item " + (selected?.id === p.id ? "active" : ""),
              onClick: () => {
                select(p);
                focus();
              },
            },
            h("span", { class: "tree-icon", style: `color:${p.color}` }, SHAPE_ICONS[p.shape]),
            p.name,
            p.kind !== "normal" ? h("span", { class: "tree-kind" }, KIND_LABELS[p.kind]) : null,
          ),
        ),
      );
      explorer.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    }

    function field(label: string, input: HTMLElement) {
      return h("label", { class: "prop" }, h("span", null, label), input);
    }

    function renderProps() {
      const p = selected;
      if (!p) {
        props.replaceChildren(h("p", { class: "muted" }, "Kliknij klocek, żeby go wybrać, albo dodaj nowy przyciskiem „Dodaj”."));
        return;
      }
      const upd = (fn: () => void) => {
        pushUndo();
        fn();
        view.apply(p);
        if (selected === p) gizmos.attachToMesh(view.meshes.get(p.id) ?? null);
        changed();
      };
      const numInput = (key: "x" | "y" | "z" | "sx" | "sy" | "sz", min = -5000) =>
        h("input", {
          type: "number",
          step: "0.5",
          value: String(p[key]),
          onChange: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) upd(() => (p[key] = Math.max(min, v)));
          },
        });
      const select_ = <T extends string>(value: T, options: [T, string][], onPick: (v: T) => void) =>
        h(
          "select",
          { onChange: (e: Event) => onPick((e.target as HTMLSelectElement).value as T) },
          options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)),
        );
      props.replaceChildren(
        field(
          "Nazwa",
          h("input", {
            value: p.name,
            maxLength: 40,
            onChange: (e: Event) => upd(() => (p.name = (e.target as HTMLInputElement).value.trim() || "Klocek")),
            onBlur: () => renderExplorer(),
          }),
        ),
        h("p", { class: "hint" }, "Skrypty wskazują klocki po nazwie."),
        field(
          "Kolor",
          h("input", { type: "color", value: p.color, onInput: (e: Event) => ((p.color = (e.target as HTMLInputElement).value), view.apply(p), changed()) }),
        ),
        field("Kształt", select_(p.shape, [["box", "Klocek"], ["sphere", "Kula"], ["cylinder", "Walec"], ["wedge", "Klin"]], (v) => {
          pushUndo();
          p.shape = v;
          view.add(p);
          select(p);
          changed();
        })),
        field(
          "Typ",
          select_(p.kind, Object.entries(KIND_LABELS) as [PartKind, string][], (v) => {
            upd(() => {
              p.kind = v;
              if (v === "pickup") {
                p.collide = false;
                p.toolId ??= data.tools[0]?.id;
              }
            });
            renderProps();
          }),
        ),
        p.kind === "pickup"
          ? data.tools.length
            ? field(
                "Narzędzie na tym polu",
                select_(p.toolId ?? "", data.tools.map((t) => [t.id, `${toolIcon(t)} ${t.name}`] as [string, string]), (v) =>
                  upd(() => (p.toolId = v)),
                ),
              )
            : h("p", { class: "hint" }, "Najpierw zrób narzędzie w panelu „Narzędzia i bronie”.")
          : "",
        p.kind === "npc"
          ? h(
              "div",
              null,
              field(
                "Postać",
                select_(p.characterId ?? "", [["", "Domyślna (żółta)"], ...data.characters.map((c) => [c.id, "🧍 " + c.name] as [string, string])], (v) =>
                  upd(() => (p.characterId = v || undefined)),
                ),
              ),
              field(
                "Animacja (w pętli)",
                select_(p.animId ?? "", [["", "— stoi —"], ...data.animations.map((a) => [a.id, "🎞 " + a.name] as [string, string])], (v) =>
                  upd(() => (p.animId = v || undefined)),
                ),
              ),
              h("p", { class: "hint" }, "Postać stoi stopami na dole klocka. Nazwa klocka to nazwa NPC dla skryptów (np. npcAnimation)."),
            )
          : "",
        field(
          "Materiał",
          select_(p.material ?? "plastic", [["plastic", "Plastik"], ["neon", "Neon (świeci)"], ["glass", "Szkło"], ["metal", "Metal"]], (v) =>
            upd(() => (p.material = v)),
          ),
        ),
        h("div", { class: "prop-group" }, "Pozycja"),
        h("div", { class: "xyz" }, field("X", numInput("x")), field("Y", numInput("y")), field("Z", numInput("z"))),
        h("div", { class: "prop-group" }, "Rozmiar"),
        h("div", { class: "xyz" }, field("X", numInput("sx", 0.2)), field("Y", numInput("sy", 0.2)), field("Z", numInput("sz", 0.2))),
        field("Obrót", select_(String(p.ry), [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]], (v) => upd(() => (p.ry = Number(v))))),
        field(
          "Przezroczystość",
          h("input", {
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            value: String(p.transparency),
            onChange: (e: Event) => upd(() => (p.transparency = Number((e.target as HTMLInputElement).value))),
          }),
        ),
        h(
          "label",
          { class: "prop check" },
          h("input", { type: "checkbox", checked: p.collide, onChange: (e: Event) => upd(() => (p.collide = (e.target as HTMLInputElement).checked)) }),
          h("span", null, "Kolizja (nie można przez niego przejść)"),
        ),
      );
    }

    // ---------- skrypty ----------
    function renderScripts() {
      scriptsList.replaceChildren(
        ...(data.scripts.length
          ? data.scripts.map((s) =>
              h(
                "div",
                { class: "script-item" },
                h("button", { class: "script-open", onClick: () => editScript(s) }, s.type === "lua" ? "📜 " : "🧩 ", s.name),
                h("input", {
                  type: "checkbox",
                  title: "Włączony",
                  checked: s.enabled,
                  onChange: (e: Event) => ((s.enabled = (e.target as HTMLInputElement).checked), changed()),
                }),
                h(
                  "button",
                  {
                    class: "icon-btn",
                    title: "Usuń skrypt",
                    onClick: async () => {
                      if (!(await ask(`Usunąć skrypt „${s.name}”?`, "Usuń", "Anuluj", true))) return;
                      data.scripts = data.scripts.filter((x) => x !== s);
                      changed();
                      renderScripts();
                    },
                  },
                  "🗑",
                ),
              ),
            )
          : [h("p", { class: "muted" }, "Brak skryptów. Dodaj skrypt Lua albo z bloczków.")]),
      );
    }
    function addScript(type: "lua" | "blocks") {
      const s: WorldScript = {
        id: newId(),
        name: type === "lua" ? "Skrypt" : "Bloczki",
        type,
        enabled: true,
        source: type === "lua" ? '-- Twój skrypt Lua\nonPlayerJoin(function(player)\n  say("Cześć " .. playerName(player) .. "!")\nend)\n' : "",
        blocks: undefined,
      };
      data.scripts.push(s);
      changed();
      renderScripts();
      editScript(s);
    }
    function editScript(s: WorldScript) {
      openScriptEditor(s, (res) => {
        Object.assign(s, res);
        changed();
        renderScripts();
      });
    }

    // ---------- narzędzia ----------
    function renderTools() {
      toolsList.replaceChildren(
        ...(data.tools.length
          ? data.tools.map((t) =>
              h(
                "div",
                { class: "script-item" },
                h(
                  "button",
                  { class: "script-open", onClick: () => editTool(t), title: TOOL_TYPE_LABELS[t.type] },
                  toolIcon(t) + " ",
                  t.name,
                  t.starter ? h("span", { class: "tree-kind" }, " od startu") : null,
                ),
                h(
                  "button",
                  {
                    class: "icon-btn",
                    title: "Usuń narzędzie",
                    onClick: async () => {
                      if (!(await ask(`Usunąć „${t.name}”?`, "Usuń", "Anuluj", true))) return;
                      data.tools = data.tools.filter((x) => x !== t);
                      view.setTools(data.tools);
    view.setCharacters(data.characters, data.animations);
                      changed();
                      renderTools();
                      renderProps();
                    },
                  },
                  "🗑",
                ),
              ),
            )
          : [h("p", { class: "muted" }, "Brak narzędzi. Zrób miecz, pistolet albo apteczkę!")]),
      );
    }
    function editTool(t: ToolDef | null, then?: (t: ToolDef) => void) {
      if (!t && data.tools.length >= 30) return toast("Maksymalnie 30 narzędzi", "error");
      openToolEditor(t, (res) => {
        const i = data.tools.findIndex((x) => x.id === res.id);
        if (i >= 0) data.tools[i] = res;
        else data.tools.push(res);
        view.setTools(data.tools);
    view.setCharacters(data.characters, data.animations);
        changed();
        renderTools();
        renderProps();
        then?.(res);
      });
    }
    function addPickup() {
      const place = (tool: ToolDef) =>
        addPart({ name: "Narzędzie " + tool.name, kind: "pickup", toolId: tool.id, sx: 3, sy: 0.4, sz: 3, color: "#ffd24a", material: "neon", collide: false });
      if (data.tools.length) place(data.tools[0]);
      else editTool(null, place);
    }

    // ---------- postacie ----------
    const itemRow = (icon: string, label: string, extra: string, onOpen: () => void, onDelete: () => void) =>
      h(
        "div",
        { class: "script-item" },
        h("button", { class: "script-open", onClick: onOpen }, icon + " ", label, extra ? h("span", { class: "tree-kind" }, " " + extra) : null),
        h("button", { class: "icon-btn", title: "Usuń", onClick: onDelete }, "🗑"),
      );
    function renderCharacters() {
      charsList.replaceChildren(
        ...(data.characters.length
          ? data.characters.map((c) =>
              itemRow("🧍", c.name, data.playerCharacter === c.id ? "gracze" : c.model ? "model 3D" : "", () => editCharacter(c), async () => {
                if (!(await ask(`Usunąć postać „${c.name}”?`, "Usuń", "Anuluj", true))) return;
                data.characters = data.characters.filter((x) => x !== c);
                if (data.playerCharacter === c.id) data.playerCharacter = undefined;
                afterCharsChanged();
              }),
            )
          : [h("p", { class: "muted" }, "Brak postaci. Zrób NPC albo wygląd graczy, albo zaimportuj model .glb.")]),
      );
    }
    function afterCharsChanged() {
      view.setCharacters(data.characters, data.animations);
      changed();
      renderCharacters();
      renderAnimations();
      renderProps();
    }
    function saveCharacter(c: CharacterDef) {
      const i = data.characters.findIndex((x) => x.id === c.id);
      if (i >= 0) data.characters[i] = c;
      else data.characters.push(c);
      afterCharsChanged();
    }
    function editCharacter(c: CharacterDef, opts?: { fitModel?: boolean }) {
      openCharacterEditor(c, data.animations, saveCharacter, opts);
    }
    function newCharacter() {
      if (data.characters.length >= MAX_CHARACTERS) return toast(`Maksymalnie ${MAX_CHARACTERS} postaci`, "error");
      editCharacter({ id: newId(), name: "Nowa postać", look: { ...DEFAULT_AVATAR }, scale: 1, accessories: [] });
    }
    async function importCharacter() {
      if (data.characters.length >= MAX_CHARACTERS) return toast(`Maksymalnie ${MAX_CHARACTERS} postaci`, "error");
      const f = await pickDataUrl([CHAR_EXT, ".glb", ".gltf"]);
      if (!f) return;
      const lower = f.name.toLowerCase();
      if (lower.endsWith(CHAR_EXT)) {
        try {
          const text = new TextDecoder().decode(Uint8Array.from(atob(f.dataUrl.split(",")[1] ?? ""), (ch) => ch.charCodeAt(0)));
          const c = parseCharacterFile(text);
          saveCharacter(c);
          toast(`Zaimportowano postać „${c.name}”`, "good");
          editCharacter(c);
        } catch (e) {
          toast((e as Error).message, "error");
        }
        return;
      }
      const mime = lower.endsWith(".gltf") ? "data:model/gltf+json;base64," : "data:model/gltf-binary;base64,";
      const data64 = f.dataUrl.replace(/^data:[^;]*;base64,/, mime);
      if (data64.length > MAX_MODEL_CHARS) return toast("Model jest za duży (maks. ok. 5 MB)", "error");
      const c: CharacterDef = {
        id: newId(),
        name: f.name.replace(/\.(glb|gltf)$/i, "").slice(0, 30) || "Model",
        look: { ...DEFAULT_AVATAR },
        scale: 1,
        accessories: [],
        model: { data: data64, scale: 1, x: 0, y: 0, z: 0, ry: 0, hideBody: true },
      };
      toast("Zaimportowano model - dopasowuję rozmiar…", "good");
      editCharacter(c, { fitModel: true });
    }

    // ---------- animacje ----------
    function renderAnimations() {
      animsList.replaceChildren(
        ...(data.animations.length
          ? data.animations.map((a) =>
              itemRow("🎞", a.name, a.emote ? "emotka" : a.loop ? "pętla" : "", () => openAnimEditor(a, data.characters, saveAnimation), async () => {
                if (!(await ask(`Usunąć animację „${a.name}”?`, "Usuń", "Anuluj", true))) return;
                data.animations = data.animations.filter((x) => x !== a);
                afterCharsChanged();
              }),
            )
          : [h("p", { class: "muted" }, "Brak animacji. Zrób taniec, machanie albo animację dla NPC.")]),
      );
    }
    function saveAnimation(a: AnimDef) {
      const i = data.animations.findIndex((x) => x.id === a.id);
      if (i >= 0) data.animations[i] = a;
      else data.animations.push(a);
      afterCharsChanged();
    }
    function newAnimation() {
      if (data.animations.length >= MAX_ANIMATIONS) return toast(`Maksymalnie ${MAX_ANIMATIONS} animacji`, "error");
      const close = modal(
        "Nowa animacja",
        h(
          "div",
          { class: "templates-grid" },
          animTemplates().map((t) =>
            h(
              "button",
              {
                class: "template",
                onClick: () => {
                  close();
                  openAnimEditor(makeAnim(t.name), data.characters, saveAnimation);
                },
              },
              h("b", null, t.name),
              h("span", { class: "muted" }, `${t.keyframes.length} klatek · ${t.duration} s${t.loop ? " · pętla" : ""}`),
            ),
          ),
        ),
      );
    }

    // ---------- ustawienia gry ----------
    function openGameSettings() {
      const name = h("input", { value: meta.name, maxLength: 40 });
      const desc = h("textarea", { value: meta.description, maxLength: 500, rows: 3 });
      const maxP = h("input", { type: "number", min: "1", max: String(MAX_PLAYERS_LIMIT), value: String(meta.maxPlayers) });
      const sky = h("input", { type: "color", value: data.skyColor });
      const grav = h("input", { type: "number", min: "10", max: "500", step: "1", value: String(data.gravity) });
      const pub = h("input", { type: "checkbox", checked: src.published });
      const pvp = h("input", { type: "checkbox", checked: data.pvp });
      const playerChar = h(
        "select",
        null,
        h("option", { value: "" }, "Własny awatar gracza"),
        data.characters.map((c) => h("option", { value: c.id, selected: data.playerCharacter === c.id }, "🧍 " + c.name)),
      );
      const badges = badgeEditor(data.badges);
      const close = modal(
        "Ustawienia gry",
        h(
          "div",
          { class: "form" },
          h("label", null, "Nazwa", name),
          h("label", null, "Opis", desc),
          h("label", null, `Maks. graczy na serwer (1–${MAX_PLAYERS_LIMIT})`, maxP),
          h("label", null, "Kolor nieba", sky),
          h("label", null, "Grawitacja (normalnie 196)", grav),
          h("label", null, "Wygląd graczy", playerChar),
          h("label", { class: "check" }, pvp, h("span", null, "PvP - gracze mogą się ranić broniami")),
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
              data.skyColor = sky.value;
              data.gravity = Math.min(500, Math.max(10, Number(grav.value) || 196.2));
              data.pvp = pvp.checked;
              data.badges = badges.read();
              data.playerCharacter = playerChar.value || undefined;
              renderCharacters();
              view.setSky(data.skyColor);
              meta.name = name.value.trim().slice(0, 40) || meta.name;
              meta.description = desc.value.slice(0, 500);
              meta.maxPlayers = Math.min(MAX_PLAYERS_LIMIT, Math.max(1, Math.round(Number(maxP.value) || 30)));
              src.published = pub.checked;
              close();
              if (src.online) {
                if (await save(true)) toast("Zapisano ustawienia", "good");
              } else changed();
            },
          },
        ],
      );
    }

    // ---------- klawiatura ----------
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "s") (e.preventDefault(), save());
      else if (ctrl && e.key === "z") (e.preventDefault(), doUndo());
      else if (ctrl && e.key === "y") (e.preventDefault(), doRedo());
      else if (ctrl && e.key === "d") (e.preventDefault(), duplicate());
      else if (e.key === "Delete" || e.key === "Backspace") remove();
      else if (e.key === "1") setTool("select");
      else if (e.key === "2") setTool("move");
      else if (e.key === "3") setTool("scale");
      else if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "f" || e.key === "F") focus();
      else keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    cleanups.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("beforeunload", onBeforeUnload);
      gizmos.dispose();
    });

    // WASD przesuwa kamerę, Q/E w dół/górę
    scene.onBeforeRenderObservable.add(() => {
      if (keys.size === 0) return;
      const dt = engine.getDeltaTime() / 1000;
      const speed = Math.max(20, camera.radius) * dt;
      const fx = camera.target.x - camera.position.x;
      const fz = camera.target.z - camera.position.z;
      const l = Math.hypot(fx, fz) || 1;
      const f = new Vector3(fx / l, 0, fz / l);
      const r = new Vector3(f.z, 0, -f.x);
      const move = Vector3.Zero();
      if (keys.has("KeyW")) move.addInPlace(f);
      if (keys.has("KeyS")) move.subtractInPlace(f);
      if (keys.has("KeyD")) move.addInPlace(r);
      if (keys.has("KeyA")) move.subtractInPlace(r);
      if (keys.has("KeyE")) move.y += 1;
      if (keys.has("KeyQ")) move.y -= 1;
      camera.target.addInPlace(move.scale(speed));
    });

    renderExplorer();
    renderProps();
    renderScripts();
    renderTools();
    renderCharacters();
    renderAnimations();
    setTool("move");
    if (startDirty) changed();
  }

  engine.runRenderLoop(() => scene.activeCamera && scene.render());

  return () => {
    disposed = true;
    cleanups.forEach((f) => f());
    scene.dispose();
    disposeEngine();
    el.remove();
  };
}
