// Studio - edytor świata: stawianie, przesuwanie i skalowanie klocków, skrypty i ustawienia gry.
import {
  ArcRotateCamera,
  CreateScreenshotUsingRenderTargetAsync,
  GizmoManager,
  PointerEventTypes,
  Quaternion,
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
import { ask, h, isCompact, isTouch, logo, modal, toast } from "../ui/dom.ts";
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
import { terrainTool } from "./terrainTool.ts";
import { Collab, type Editor, type RemoteChange } from "./collab.ts";
import { TerrainGrid } from "../../../shared/terrain.ts";
import { genreSelect, productEditor } from "./productEditor.ts";
import { soundsLightEditor } from "./soundsEditor.ts";
import { SKYBOXES } from "../../../shared/skybox.ts";
import { skyPreview } from "../engine/skybox.ts";
import {
  behaviorIdOf,
  behaviorsOf,
  behaviorScript,
  BEHAVIORS,
  MODEL_BEHAVIOR,
  openGuide,
  renameInBehaviors,
  shouldShowGuide,
  TOOLBOX,
  TOOLBOX_CATS,
  type Behavior,
  type ToolboxModel,
} from "./toolbox.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;
type Tool = "select" | "move" | "scale" | "rotate";

/** szybkie kolory w panelu Właściwości */
const QUICK_COLORS = [
  "#f5f5f5", "#a3a2a5", "#1b1b1b", "#e53935", "#ff7043", "#ffb300", "#fdd835", "#7cb342",
  "#2e7d32", "#29b6f6", "#1e88e5", "#3949ab", "#8e24aa", "#ff66cc", "#8d6e63", "#5d4037",
];

const SHAPE_ICONS: Record<PartShape, string> = { box: "⬛", sphere: "⚪", cylinder: "🛢", wedge: "📐" };
const KIND_LABELS: Record<PartKind, string> = {
  normal: "Zwykły",
  spawn: "Spawn (start)",
  kill: "Zabija (lawa)",
  bounce: "Trampolina",
  pickup: "Narzędzie do podniesienia",
  npc: "Postać (NPC)",
  water: "Woda (pływanie)",
  seat: "Siedzenie / pojazd",
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
  /** gra na serwerze - wspólna edycja z innymi twórcami */
  worldId?: number;
  /** jestem twórcą gry (nie współtwórcą) */
  owner?: boolean;
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
          worldId,
          owner: info.ownerId === session.user?.id,
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

    const view = new WorldView(scene, { shadows: false, skyColor: data.skyColor, skybox: data.skybox });
    view.setTools(data.tools);
    view.setCharacters(data.characters, data.animations);
    view.load(data.parts);
    view.setTerrain(TerrainGrid.decode(data.terrain));

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
      // mysz w prawo = obrót w prawo, mysz w górę = patrzymy w górę (jak w Roblox Studio)
      camera.alpha -= e.movementX * k;
      camera.beta = Math.min(Math.PI - 0.05, Math.max(0.05, camera.beta - e.movementY * k * (settings.invertY ? -1 : 1)));
      // punkt, na który patrzymy, przesuwa się tak, żeby kamera została w miejscu
      camera.target = eye.subtract(dir(camera.alpha, camera.beta).scale(r));
    };
    const onLookUp = (e: PointerEvent) => {
      if (looking === e.pointerId) looking = null;
    };
    // prędkość lotu kamerą (WASD) - nie zależy od przybliżenia; prawy przycisk + kółko ją zmienia (jak w Roblox Studio)
    let flySpeed = 50;
    const speedTip = h("div", { class: "studio-speed hidden" });
    let speedTipTimer = 0;
    const onWheelCapture = (e: WheelEvent) => {
      if (looking === null) return; // bez prawego przycisku kółko przybliża
      e.preventDefault();
      e.stopImmediatePropagation();
      flySpeed = Math.min(800, Math.max(5, flySpeed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      speedTip.textContent = `🏃 Prędkość kamery: ${Math.round(flySpeed)}`;
      speedTip.classList.remove("hidden");
      clearTimeout(speedTipTimer);
      speedTipTimer = window.setTimeout(() => speedTip.classList.add("hidden"), 1200);
    };
    canvas.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });
    cleanups.push(() => canvas.removeEventListener("wheel", onWheelCapture, { capture: true }));
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
    gizmos.rotationGizmoEnabled = true;
    gizmos.boundingBoxGizmoEnabled = false;
    const pg = gizmos.gizmos.positionGizmo!;
    const sg = gizmos.gizmos.scaleGizmo!;
    const rg = gizmos.gizmos.rotationGizmo!;
    pg.scaleRatio = sg.scaleRatio = rg.scaleRatio = matchMedia("(pointer: coarse)").matches ? 1.6 : 1.1;
    // obrót w osiach świata (łatwiej zrozumieć niż osie klocka) i o stały krok
    rg.updateGizmoRotationToMatchAttachedMesh = false;
    let rotStep = 15;
    // skalowanie o stały krok siatki (1 → 2 → 3), a nie mnożenie rozmiaru - inaczej jeden krok
    // w dół przy siatce 1 dawał rozmiar 0 i klocek od razu robił się płaski
    sg.incrementalSnap = true;
    sg.sensitivity = 1.5;
    const applySnap = () => {
      pg.snapDistance = gridStep;
      sg.snapDistance = gridStep;
      rg.snapDistance = (rotStep * Math.PI) / 180;
    };
    // klocek nigdy nie jest cieńszy niż krok siatki (albo 0.2)
    sg.onDragObservable.add(() => {
      if (!selected) return;
      const mesh = view.meshes.get(selected.id);
      if (!mesh) return;
      const min = Math.max(0.2, Math.min(gridStep, 1));
      mesh.scaling.set(Math.max(min, Math.abs(mesh.scaling.x)), Math.max(min, Math.abs(mesh.scaling.y)), Math.max(min, Math.abs(mesh.scaling.z)));
    });
    applySnap();
    gizmos.positionGizmoEnabled = false;
    gizmos.scaleGizmoEnabled = false;
    gizmos.rotationGizmoEnabled = false;

    // obracanie gizmem: model obraca się cały wokół zaznaczonego klocka
    const eulerDeg = (q: Quaternion) => {
      const e = q.toEulerAngles();
      const d = (r: number) => Math.round(((((r * 180) / Math.PI) % 360) + 360) % 360 * 100) / 100 % 360;
      return { rx: d(e.x), ry: d(e.y), rz: d(e.z) };
    };
    const partQuat = (p: Part) => Quaternion.FromEulerAngles(((p.rx ?? 0) * Math.PI) / 180, (p.ry * Math.PI) / 180, ((p.rz ?? 0) * Math.PI) / 180);
    let rotStart: { q0: Quaternion; pivot: Vector3; members: { p: Part; pos: Vector3; q: Quaternion }[] } | null = null;
    rg.onDragStartObservable.add(() => {
      if (!selected) return (rotStart = null);
      rotStart = {
        q0: partQuat(selected),
        pivot: new Vector3(selected.x, selected.y, selected.z),
        members: groupOf(selected).map((p) => ({ p, pos: new Vector3(p.x, p.y, p.z), q: partQuat(p) })),
      };
    });
    const rotDelta = () => {
      const mesh = selected && view.meshes.get(selected.id);
      if (!mesh || !rotStart) return null;
      const q = mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation);
      return q.multiply(Quaternion.Inverse(rotStart.q0));
    };
    rg.onDragObservable.add(() => {
      const dq = rotDelta();
      if (!dq || !rotStart || rotStart.members.length < 2) return;
      for (const m of rotStart.members) {
        if (m.p === selected) continue;
        const mesh = view.meshes.get(m.p.id);
        if (!mesh) continue;
        mesh.position.copyFrom(rotStart.pivot.add(m.pos.subtract(rotStart.pivot).applyRotationQuaternion(dq)));
        mesh.rotationQuaternion = dq.multiply(m.q);
      }
    });
    rg.onDragEndObservable.add(() => {
      const dq = rotDelta();
      if (!dq || !rotStart || !selected) return;
      pushUndo();
      for (const m of rotStart.members) {
        const pos = rotStart.pivot.add(m.pos.subtract(rotStart.pivot).applyRotationQuaternion(dq));
        Object.assign(m.p, { x: round(pos.x), y: round(pos.y), z: round(pos.z) }, eulerDeg(dq.multiply(m.q)));
        if (!m.p.rx) delete m.p.rx;
        if (!m.p.rz) delete m.p.rz;
        view.apply(m.p);
      }
      rotStart = null;
      gizmos.attachToMesh(view.meshes.get(selected.id) ?? null);
      changed();
      renderProps();
    });

    // model: pozostałe części jadą razem z przeciąganą
    let dragStart: { x: number; y: number; z: number } | null = null;
    pg.onDragStartObservable.add(() => {
      dragStart = selected ? { x: selected.x, y: selected.y, z: selected.z } : null;
    });
    pg.onDragObservable.add(() => {
      if (!selected || !dragStart || !selected.group) return;
      const mesh = view.meshes.get(selected.id);
      if (!mesh) return;
      const dx = mesh.position.x - dragStart.x;
      const dy = mesh.position.y - dragStart.y;
      const dz = mesh.position.z - dragStart.z;
      for (const o of groupOf(selected)) {
        if (o === selected) continue;
        const m = view.meshes.get(o.id);
        if (m) m.position.set(o.x + dx, o.y + dy, o.z + dz);
      }
    });
    const onGizmoEnd = () => {
      if (!selected) return;
      const mesh = view.meshes.get(selected.id);
      if (!mesh) return;
      pushUndo();
      if (dragStart && selected.group) {
        const dx = round(mesh.position.x - dragStart.x);
        const dy = round(mesh.position.y - dragStart.y);
        const dz = round(mesh.position.z - dragStart.z);
        for (const o of groupOf(selected)) {
          if (o === selected) continue;
          o.x = round(o.x + dx);
          o.y = round(o.y + dy);
          o.z = round(o.z + dz);
          view.apply(o);
        }
      }
      dragStart = null;
      selected.x = round(mesh.position.x);
      selected.y = round(mesh.position.y);
      selected.z = round(mesh.position.z);
      // rozmiar do 0.01 (bez śmieci po przecinku z macierzy gizma)
      const size = (v: number) => Math.round(Math.max(0.2, Math.abs(v)) * 100) / 100;
      selected.sx = size(mesh.scaling.x);
      selected.sy = size(mesh.scaling.y);
      selected.sz = size(mesh.scaling.z);
      view.apply(selected);
      changed();
      renderProps();
    };
    pg.onDragEndObservable.add(onGizmoEnd);
    sg.onDragEndObservable.add(onGizmoEnd);
    if (localStorage.getItem("predator.debug"))
      (window as unknown as { __studio: unknown }).__studio = { scene, camera, sg, view, data, select: (name: string) => select(data.parts.find((p) => p.name === name) ?? null) };

    // ---------- wybieranie ----------
    scene.onPointerObservable.add((pi) => {
      if (pi.type !== PointerEventTypes.POINTERTAP || pi.event.button !== 0) return;
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m: AbstractMesh) => !!m.metadata?.partId);
      const id = pick?.pickedMesh?.metadata?.partId as string | undefined;
      select(id ? (data.parts.find((p) => p.id === id) ?? null) : null);
    });

    /** części modelu (albo sam klocek) */
    function groupOf(p: Part) {
      return p.group ? data.parts.filter((x) => x.group === p.group) : [p];
    }

    // przebudowana siatka zaznaczonego klocka: gizmo i ramka na nową siatkę
    view.onMeshRebuilt = (id) => {
      if (selected?.id !== id) return;
      const m = view.meshes.get(id);
      if (m) m.showBoundingBox = true;
      gizmos.attachToMesh(m ?? null);
    };

    function select(p: Part | null) {
      selected = p;
      const mesh = p ? view.meshes.get(p.id) : null;
      for (const m of view.meshes.values()) m.showBoundingBox = false;
      if (p) for (const o of groupOf(p)) {
        const m = view.meshes.get(o.id);
        if (m) m.showBoundingBox = true;
      }
      gizmos.attachToMesh(mesh ?? null);
      setTool(tool);
      renderProps();
      renderExplorer();
    }

    /** podpowiedź na dole widoku - co teraz można zrobić */
    function updateHint() {
      const k = (key: string, text: string) => [h("kbd", null, key), " " + text];
      const touch = isTouch();
      const parts: (string | Node)[][] = touch
        ? !selected
          ? [["👆 Stuknij klocek albo ", h("b", null, "＋"), " dodaj model"], ["☝ 1 palec: obrót"], ["✌ 2 palce: przesuń i zoom"]]
          : tool === "scale"
            ? [["⤡ Ciągnij kwadraciki, żeby zmienić rozmiar"]]
            : tool === "move"
              ? [["✥ Ciągnij kolorowe strzałki"]]
              : [["👆 Wybrano: ", h("b", null, selected.name)]]
        : !selected
        ? [
            ["👆 Kliknij klocek, żeby go wybrać, albo ", h("b", null, "＋ Dodaj"), " gotowy model"],
            k("Prawy przycisk", "rozglądanie"),
            k("WASD", "lot"),
            k("Kółko", "zoom"),
            k("Prawy + kółko", "prędkość"),
          ]
        : tool === "move"
          ? [[selected.group ? "📦 Model - ciągnij strzałki, przesuwa się cały" : "✥ Ciągnij kolorowe strzałki, żeby przesunąć"], k("R", "obróć"), k("Ctrl+D", "kopia"), k("F", "pokaż"), k("Del", "usuń")]
          : tool === "scale"
            ? [["⤡ Ciągnij kwadraciki, żeby zmienić rozmiar"], k("2", "przesuwanie"), k("Ctrl+Z", "cofnij")]
            : [["👆 Wybrano: ", h("b", null, selected.name)], k("2", "przesuń"), k("3", "skaluj"), k("R", "obróć")];
      hintBar.replaceChildren(...parts.map((x) => h("span", null, ...x)));
      updateFab();
    }

    function setTool(t: Tool) {
      tool = t;
      gizmos.positionGizmoEnabled = !!selected && t === "move";
      gizmos.scaleGizmoEnabled = !!selected && t === "scale";
      gizmos.rotationGizmoEnabled = !!selected && t === "rotate";
      if (selected) gizmos.attachToMesh(view.meshes.get(selected.id) ?? null);
      applySnap();
      for (const b of toolbar.querySelectorAll<HTMLElement>("[data-tool]")) b.classList.toggle("active", b.dataset.tool === t);
      updateHint();
    }

    // ---------- zmiany i cofanie ----------
    // cofanie obejmuje klocki i teren
    const snapshot = () => JSON.stringify({ parts: data.parts, terrain: data.terrain ?? null });
    function pushUndo() {
      undo.push(snapshot());
      if (undo.length > 60) undo.shift();
      redo.length = 0;
    }
    function restore(json: string) {
      const selId = selected?.id;
      const snap = JSON.parse(json) as { parts: Part[]; terrain: WorldData["terrain"] | null };
      data.parts = snap.parts;
      const terrainChanged = JSON.stringify(snap.terrain ?? null) !== JSON.stringify(data.terrain ?? null);
      if (snap.terrain) data.terrain = snap.terrain;
      else delete data.terrain;
      if (terrainChanged) terrainPanel.reload();
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
    let collab: Collab | null = null;
    function changed() {
      collab?.changed();
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

    /** wolna nazwa: "Samochód", "Samochód 2", ... - zachowania działają po nazwie, więc każdy wstawiony model ma własną */
    function uniqueName(base: string) {
      const root = base.replace(/ \d+$/, "");
      if (!data.parts.some((p) => p.name === root)) return root;
      let n = 2;
      while (data.parts.some((p) => p.name === `${root} ${n}`)) n++;
      return `${root} ${n}`;
    }

    /** miejsce na model: przed kamerą, ale nie na innych rzeczach (np. na spawnie) */
    function freeSpot(defs: Partial<Part>[], cx: number, cz: number) {
      const ext = (d: Partial<Part>) => {
        const sx = d.sx ?? 4;
        const sz = d.sz ?? 2;
        const [hx, hz] = (d.ry ?? 0) % 180 ? [sz / 2, sx / 2] : [sx / 2, sz / 2];
        return { x0: (d.x ?? 0) - hx, x1: (d.x ?? 0) + hx, z0: (d.z ?? 0) - hz, z1: (d.z ?? 0) + hz };
      };
      const box = defs.map(ext).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) }));
      // podłogi i duże płaskie klocki nie przeszkadzają - na nich się stawia
      const blockers = data.parts.filter((p) => p.kind === "spawn" || !(p.sy <= 1.2 && p.sx * p.sz > 150));
      const hits = (x: number, z: number) =>
        blockers.some((p) => {
          const e = ext(p);
          // ext() liczy już od środka klocka (p.x, p.z)
          return x + box.x0 < e.x1 + 1 && x + box.x1 > e.x0 - 1 && z + box.z0 < e.z1 + 1 && z + box.z1 > e.z0 - 1;
        });
      const step = Math.max(4, Math.ceil(Math.max(box.x1 - box.x0, box.z1 - box.z0)) + 2);
      for (let ring = 0; ring <= 8; ring++)
        for (let a = 0; a < (ring ? 8 : 1); a++) {
          const x = snap(cx + Math.round(Math.cos((a * Math.PI) / 4)) * ring * step, 1);
          const z = snap(cz + Math.round(Math.sin((a * Math.PI) / 4)) * ring * step, 1);
          if (!hits(x, z)) return { x, z };
        }
      return { x: snap(cx, 1), z: snap(cz, 1) };
    }

    /** gotowy model z Zestawu (kilka klocków naraz) przed kamerą, postawiony na tym, co jest pod spodem */
    function addModel(m: ToolboxModel) {
      const defs = m.parts();
      if (data.parts.length + defs.length > MAX_PARTS) return toast(`Maksymalnie ${MAX_PARTS} klocków`, "error");
      pushUndo();
      const { x: ox, z: oz } = freeSpot(defs, camera.target.x, camera.target.z);
      const hit = scene.pickWithRay(new Ray(new Vector3(ox, 1000, oz), new Vector3(0, -1, 0), 2000), (mm: AbstractMesh) => !!mm.metadata?.partId);
      const base = hit?.pickedPoint ? hit.pickedPoint.y : 0;
      // wszystkie części modelu mają jedną nazwę - zachowanie (np. jazda) działa na cały model
      const name = uniqueName(defs.length > 1 ? m.name : (defs[0].name ?? m.name));
      const group = defs.length > 1 ? newId() : undefined;
      const made = defs.map((d) => {
        const sy = d.sy ?? 1;
        const p = makePart({ ...d, name, ...(group ? { group } : {}), x: round(ox + (d.x ?? 0)), y: round(base + (d.y ?? sy / 2)), z: round(oz + (d.z ?? 0)) });
        data.parts.push(p);
        view.add(p);
        return p;
      });
      changed();
      select(made[0]);
      const behaviorId = MODEL_BEHAVIOR[m.id];
      const b = behaviorId ? BEHAVIORS.find((x) => x.id === behaviorId) : undefined;
      if (b) applyBehavior(b, made[0], false);
      toast(`Wstawiono: ${m.icon} ${name}` + (b ? ` (${b.icon} ${b.label})` : ""), "good");
    }

    function renderToolbox() {
      const clip = readClip();
      toolboxBody.replaceChildren(
        h("button", { class: "btn small lib-open", onClick: () => openLibrary() }, "📚 Biblioteka modeli"),
        clip
          ? h(
              "button",
              { class: "btn small clip-paste", title: "Ctrl+V", onClick: () => (paste(), isCompact() && closePanels()) },
              `📥 Wklej: ${clip.name}`,
              clip.from && clip.from !== meta.name ? h("span", { class: "muted" }, ` (z „${clip.from}”)`) : "",
            )
          : "",
        ...TOOLBOX_CATS.flatMap((cat) => [
          h("div", { class: "tbx-cat" }, cat),
          h(
            "div",
            { class: "tbx-grid" },
            TOOLBOX.filter((m) => m.cat === cat).map((m) =>
              h("button", { class: "tbx-item", title: m.name, onClick: () => (addModel(m), isCompact() && closePanels()) }, h("span", { class: "tbx-ic" }, m.icon), h("span", { class: "tbx-name" }, m.name)),
            ),
            cat === "Podstawowe"
              ? h("button", { class: "tbx-item", title: "Złote pole z bronią albo narzędziem", onClick: () => (addPickup(), isCompact() && closePanels()) }, h("span", { class: "tbx-ic" }, "🗡️"), h("span", { class: "tbx-name" }, "Broń do podniesienia"))
              : "",
          ),
        ]),
      );
    }

    /** zachowanie: zmiana typu klocka albo gotowy skrypt Lua */
    function applyBehavior(b: Behavior, p: Part, announce = true) {
      if (b.kind) {
        pushUndo();
        p.kind = b.kind;
        if (b.kind === "water") p.collide = false;
        view.apply(p);
        changed();
        renderProps();
        renderExplorer();
        if (announce) toast(`${b.icon} ${p.name}: ${b.label}`, "good");
        return;
      }
      if (behaviorsOf(data.scripts, p.name).some((s) => behaviorIdOf(s) === b.id)) return toast("Ten klocek już to ma", "info");
      let target: string | undefined;
      if (b.id === "teleport") {
        // cel teleportu - nowy klocek obok
        target = p.name + " cel";
        if (!data.parts.some((x) => x.name === target)) {
          const tp = makePart({ name: target, shape: p.shape, x: round(p.x + 20), y: p.y, z: p.z, sx: p.sx, sy: p.sy, sz: p.sz, color: "#b388ff", material: "neon" });
          data.parts.push(tp);
          view.add(tp);
        }
      }
      data.scripts.push(behaviorScript(b, p.name, target));
      changed();
      renderScripts();
      renderProps();
      renderExplorer();
      if (announce) toast(`${b.icon} ${b.label} - gotowe! Sprawdź przyciskiem Testuj`, "good");
    }

    function duplicate() {
      if (!selected) return;
      pushUndo();
      const old = selected;
      const members = groupOf(old);
      const name = uniqueName(old.name);
      // model kopiujemy obok, pojedynczy klocek - nad oryginałem
      const width = Math.max(...members.map((m) => m.x + m.sx / 2)) - Math.min(...members.map((m) => m.x - m.sx / 2));
      const group = old.group ? newId() : undefined;
      const copies = members.map((m) => ({
        ...m,
        id: newId(),
        name,
        ...(group ? { group, x: round(m.x + width + 2) } : { y: round(m.y + m.sy) }),
      }));
      for (const c of copies) {
        data.parts.push(c);
        view.add(c);
      }
      // kopia dostaje te same zachowania (własne skrypty)
      for (const sc of behaviorsOf(data.scripts, old.name)) {
        const b = BEHAVIORS.find((x) => x.id === behaviorIdOf(sc));
        if (b?.lua) data.scripts.push(behaviorScript(b, name, b.id === "teleport" ? old.name + " cel" : undefined));
      }
      renderScripts();
      changed();
      select(copies[members.indexOf(old)] ?? copies[0]);
    }

    // ---------- schowek: kopiowanie klocków i modeli między grami ----------
    const CLIP_KEY = "predator.clipboard";
    interface Clip {
      v: 1;
      from: string;
      name: string;
      parts: Part[];
      behaviors: string[];
      tools: ToolDef[];
      characters: CharacterDef[];
      animations: AnimDef[];
    }
    const readClip = (): Clip | null => {
      try {
        const c = JSON.parse(localStorage.getItem(CLIP_KEY) ?? "null") as Clip | null;
        return c && c.v === 1 && Array.isArray(c.parts) && c.parts.length ? c : null;
      } catch {
        return null;
      }
    };
    /** kopiuje zaznaczony klocek / model razem z narzędziami, postaciami, animacjami i zachowaniami */
    function copySelection() {
      if (!selected) return toast("Najpierw zaznacz klocek albo model", "info");
      const members = groupOf(selected);
      const toolIds = new Set(members.map((m) => m.toolId).filter(Boolean));
      const charIds = new Set(members.map((m) => m.characterId).filter(Boolean));
      const animIds = new Set(members.map((m) => m.animId).filter(Boolean));
      const clip: Clip = {
        v: 1,
        from: meta.name,
        name: selected.name,
        parts: structuredClone(members),
        behaviors: behaviorsOf(data.scripts, selected.name).map((sc) => behaviorIdOf(sc)).filter((x): x is string => !!x),
        tools: data.tools.filter((t) => toolIds.has(t.id)),
        characters: data.characters.filter((c) => charIds.has(c.id)),
        animations: data.animations.filter((a) => animIds.has(a.id)),
      };
      try {
        localStorage.setItem(CLIP_KEY, JSON.stringify(clip));
      } catch {
        return toast("Za duży model, żeby go skopiować", "error");
      }
      renderToolbox();
      toast(`📋 Skopiowano: ${selected.name}${members.length > 1 ? ` (${members.length} klocków)` : ""}. Wklej w dowolnej grze: Ctrl+V`, "good");
    }
    /** wkleja ze schowka przed kamerą (także model skopiowany w innej grze albo z Biblioteki) */
    function paste(fromLibrary?: Clip) {
      const clip = fromLibrary ?? readClip();
      if (!clip) return toast("Schowek jest pusty - skopiuj coś (Ctrl+C)", "info");
      if (data.parts.length + clip.parts.length > MAX_PARTS) return toast(`Maksymalnie ${MAX_PARTS} klocków`, "error");
      pushUndo();
      // środek modelu -> punkt przed kamerą, na tym, co jest pod spodem
      const cx = clip.parts.reduce((a, p) => a + p.x, 0) / clip.parts.length;
      const cz = clip.parts.reduce((a, p) => a + p.z, 0) / clip.parts.length;
      const minY = Math.min(...clip.parts.map((p) => p.y - p.sy / 2));
      const defs = clip.parts.map((p) => ({ ...p, x: p.x - cx, z: p.z - cz }));
      const { x: ox, z: oz } = freeSpot(defs, camera.target.x, camera.target.z);
      const hit = scene.pickWithRay(new Ray(new Vector3(ox, 1000, oz), new Vector3(0, -1, 0), 2000), (mm: AbstractMesh) => !!mm.metadata?.partId);
      const base = hit?.pickedPoint ? hit.pickedPoint.y : 0;
      const name = uniqueName(clip.name);
      const group = clip.parts.length > 1 ? newId() : undefined;
      // narzędzia, postacie i animacje, których ta gra jeszcze nie ma
      for (const t of clip.tools) if (!data.tools.some((x) => x.id === t.id)) data.tools.push(t);
      for (const c of clip.characters) if (!data.characters.some((x) => x.id === c.id)) data.characters.push(c);
      for (const a of clip.animations) if (!data.animations.some((x) => x.id === a.id)) data.animations.push(a);
      const made = defs.map((d) => {
        const p: Part = { ...d, id: newId(), name, x: round(ox + d.x), y: round(base + (d.y - minY)), z: round(oz + d.z) };
        if (group) p.group = group;
        else delete p.group;
        data.parts.push(p);
        view.add(p);
        return p;
      });
      for (const id of clip.behaviors) {
        const b = BEHAVIORS.find((x) => x.id === id);
        if (b?.lua) data.scripts.push(behaviorScript(b, name));
      }
      view.setTools(data.tools);
      view.setCharacters(data.characters, data.animations);
      renderScripts();
      renderTools();
      renderCharacters();
      renderAnimations();
      changed();
      select(made[0]);
      toast(`📥 Wklejono: ${name}${clip.from && clip.from !== meta.name ? ` (z gry „${clip.from}”)` : ""}`, "good");
    }

    // ---------- biblioteka modeli (wspólna dla wszystkich twórców) ----------
    const LIB_ICONS = ["📦", "🏠", "🌳", "🚗", "🪑", "🏰", "🗼", "⛲", "🚀", "🐉", "🎡", "🍕", "⚔️", "💎", "🧱", "🌋"];
    function shareModel() {
      if (!selected) return toast("Najpierw zaznacz klocek albo model", "info");
      if (!session.user) return toast("Zaloguj się na serwerze, żeby udostępnić model", "error");
      const members = groupOf(selected);
      const name = h("input", { value: selected.name, maxLength: 40 });
      let icon = members.some((m) => m.vehicle) ? "🚗" : members.some((m) => m.kind === "seat") ? "🪑" : "📦";
      const icons = h("div", { class: "lib-icons" });
      const drawIcons = () =>
        icons.replaceChildren(...LIB_ICONS.map((e) => h("button", { class: "lib-icon" + (e === icon ? " active" : ""), onClick: () => ((icon = e), drawIcons()) }, e)));
      drawIcons();
      const close = modal(
        "📤 Udostępnij w Bibliotece",
        h(
          "div",
          { class: "form" },
          h("p", { class: "muted", style: "margin:0;font-size:13px" }, `Każdy twórca będzie mógł wstawić ten model (${members.length} ${members.length === 1 ? "klocek" : "klocków"}) do swojej gry - razem z narzędziami, postaciami i zachowaniami.`),
          h("label", null, "Nazwa", name),
          h("div", null, "Ikonka", icons),
        ),
        [
          { label: "Anuluj", onClick: () => close() },
          {
            label: "Udostępnij",
            kind: "primary",
            onClick: async () => {
              const toolIds = new Set(members.map((m) => m.toolId).filter(Boolean));
              const charIds = new Set(members.map((m) => m.characterId).filter(Boolean));
              const animIds = new Set(members.map((m) => m.animId).filter(Boolean));
              try {
                await api.shareModel(name.value.trim() || selected!.name, icon, {
                  parts: members,
                  tools: data.tools.filter((t) => toolIds.has(t.id)),
                  characters: data.characters.filter((c) => charIds.has(c.id)),
                  animations: data.animations.filter((a) => animIds.has(a.id)),
                  behaviors: behaviorsOf(data.scripts, selected!.name).map((sc) => behaviorIdOf(sc)).filter(Boolean),
                });
                close();
                toast("📚 Model jest w Bibliotece - inni twórcy mogą go wstawić", "good");
              } catch (e) {
                toast((e as Error).message, "error");
              }
            },
          },
        ],
      );
    }
    function openLibrary() {
      if (!session.user) return toast("Biblioteka działa po zalogowaniu na serwerze", "error");
      const search = h("input", { type: "search", placeholder: "🔍 Szukaj modeli (dom, drzewo, auto…)" });
      let mine = false;
      const tabs = h("div", { class: "pv-chips" });
      const list = h("div", { class: "lib-grid" }, h("div", { class: "muted" }, "Ładowanie…"));
      let seq = 0;
      const load = async () => {
        const my = ++seq;
        tabs.replaceChildren(
          h("button", { class: "pv-chip" + (!mine ? " active" : ""), onClick: () => ((mine = false), load()) }, "Wszystkie"),
          h("button", { class: "pv-chip" + (mine ? " active" : ""), onClick: () => ((mine = true), load()) }, "Moje"),
        );
        try {
          const items = await api.models(search.value.trim(), mine);
          if (my !== seq) return;
          list.replaceChildren(
            ...(items.length
              ? items.map((m) =>
                  h(
                    "div",
                    { class: "lib-card" },
                    h("div", { class: "lib-card-ic" }, m.icon),
                    h("b", null, m.name),
                    h("div", { class: "muted small" }, `${m.ownerName} · ${m.parts} kl. · użyto ${m.uses}×`),
                    h(
                      "div",
                      { class: "lib-card-actions" },
                      h(
                        "button",
                        {
                          class: "btn small primary",
                          onClick: async () => {
                            try {
                              const d = await api.model(m.id);
                              close();
                              paste({ v: 1, from: `Biblioteka: ${m.ownerName}`, name: d.name, parts: d.parts, behaviors: d.behaviors, tools: d.tools, characters: d.characters, animations: d.animations });
                            } catch (e) {
                              toast((e as Error).message, "error");
                            }
                          },
                        },
                        "Wstaw",
                      ),
                      m.mine
                        ? h(
                            "button",
                            {
                              class: "btn small danger",
                              title: "Usuń z Biblioteki",
                              onClick: async () => {
                                if (!(await ask(`Usunąć „${m.name}” z Biblioteki?`, "Usuń", "Anuluj", true))) return;
                                await api.deleteModel(m.id).catch(() => {});
                                load();
                              },
                            },
                            "🗑",
                          )
                        : "",
                    ),
                  ),
                )
              : [h("div", { class: "muted" }, mine ? "Nie udostępniłeś jeszcze żadnego modelu. Zaznacz model i kliknij „📤 Udostępnij”." : "Nic nie znaleziono.")]),
          );
        } catch (e) {
          if (my === seq) list.replaceChildren(h("div", { class: "form-error" }, (e as Error).message));
        }
      };
      let t = 0;
      search.addEventListener("input", () => (clearTimeout(t), (t = window.setTimeout(load, 300))));
      const close = modal("📚 Biblioteka modeli", h("div", { class: "lib" }, search, tabs, list));
      load();
    }

    function remove() {
      if (!selected) return;
      pushUndo();
      const ids = new Set(groupOf(selected).map((p) => p.id));
      data.parts = data.parts.filter((p) => !ids.has(p.id));
      for (const id of ids) view.remove(id);
      changed();
      select(null);
    }

    function rotate() {
      if (!selected) return;
      pushUndo();
      const members = groupOf(selected);
      // model obraca się wokół swojego środka (tak jak obraca się klocek: x' = z, z' = -x)
      const cx = members.reduce((a, m) => a + m.x, 0) / members.length;
      const cz = members.reduce((a, m) => a + m.z, 0) / members.length;
      for (const m of members) {
        if (members.length > 1) {
          const dx = m.x - cx;
          const dz = m.z - cz;
          m.x = round(cx + dz);
          m.z = round(cz - dx);
        }
        m.ry = (m.ry + 90) % 360;
        view.apply(m);
      }
      select(selected);
      changed();
      renderProps();
    }

    /** rozdziela model na osobne klocki */
    function ungroup(p: Part) {
      pushUndo();
      for (const m of groupOf(p)) delete m.group;
      changed();
      select(p);
      toast("Model rozdzielony - każdy klocek przesuwasz osobno", "good");
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
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), openSettings()) }, "🎚 Ustawienia (kamera, czułość)"),
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
    const gridSel = h(
      "select",
      { class: "tb-select", title: "Krok siatki", onChange: (e: Event) => ((gridStep = Number((e.target as HTMLSelectElement).value)), applySnap()) },
      [0.25, 0.5, 1, 2, 4].map((v) => h("option", { value: String(v), selected: v === 1 }, `Siatka ${v}`)),
    );
    const rotSel = h(
      "select",
      { class: "tb-select", title: "Krok obracania", onChange: (e: Event) => ((rotStep = Number((e.target as HTMLSelectElement).value)), applySnap()) },
      [
        [1, "Obrót 1°"],
        [5, "Obrót 5°"],
        [15, "Obrót 15°"],
        [45, "Obrót 45°"],
        [90, "Obrót 90°"],
      ].map(([v, l]) => h("option", { value: String(v), selected: v === 15 }, String(l))),
    );
    /** kto jeszcze edytuje + zarządzanie współtwórcami */
    const editorsBtn = h("button", { class: "tb-btn editors-btn", title: "Współpraca - kto edytuje i kto może edytować", onClick: () => openEditors() });
    async function openEditors() {
      if (!src.worldId) return;
      const body = h("div", { class: "form" }, h("div", { class: "muted" }, "Ładowanie…"));
      const close = modal("👥 Współpraca w Studiu", body);
      const draw = async () => {
        try {
          const r = await api.worldEditors(src.worldId!);
          const input = h("input", { placeholder: "Nick znajomego" });
          body.replaceChildren(
            h("p", { class: "muted", style: "margin:0;font-size:13px" }, "Współtwórcy edytują grę razem z tobą na żywo - widzisz ich jako kolorowe kulki. Zmiany zapisują się same co kilka sekund."),
            h("div", null, h("b", null, "Twórca: "), r.owner),
            h(
              "div",
              { class: "ed-list" },
              r.editors.length
                ? r.editors.map((e) =>
                    h(
                      "div",
                      { class: "ed-row" },
                      h("span", null, "🛠️ " + e.username),
                      src.owner || e.id === session.user?.id
                        ? h(
                            "button",
                            {
                              class: "btn small danger",
                              onClick: async () => {
                                await api.removeWorldEditor(src.worldId!, e.id).catch((x: Error) => toast(x.message, "error"));
                                if (e.id === session.user?.id) (close(), exitScreen());
                                else draw();
                              },
                            },
                            e.id === session.user?.id ? "Zrezygnuj" : "Usuń",
                          )
                        : "",
                    ),
                  )
                : h("div", { class: "muted" }, "Nikt jeszcze nie może edytować tej gry oprócz twórcy."),
            ),
            src.owner
              ? h(
                  "div",
                  { class: "row" },
                  input,
                  h(
                    "button",
                    {
                      class: "btn primary small",
                      onClick: async () => {
                        try {
                          await api.addWorldEditor(src.worldId!, input.value.trim());
                          toast("Dodano współtwórcę", "good");
                          draw();
                        } catch (x) {
                          toast((x as Error).message, "error");
                        }
                      },
                    },
                    "Dodaj",
                  ),
                )
              : "",
            src.owner ? h("p", { class: "hint" }, "Dodać można tylko znajomego. Publikować grę może tylko twórca.") : "",
          );
        } catch (x) {
          body.replaceChildren(h("div", { class: "form-error" }, (x as Error).message));
        }
      };
      draw();
    }
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
      h("button", { class: "tb-btn", "data-tool": "rotate", onClick: () => setTool("rotate"), title: "Obracaj o dowolny kąt (4) · R = szybki obrót o 90°" }, "⟳", h("span", null, "Obróć")),
      rotSel,
      gridSel,
      h("div", { class: "tb-sep" }),
      h(
        "div",
        { class: "dd-wrap" },
        h(
          "button",
          {
            class: "tb-btn accent",
            title: "Gotowe modele i klocki",
            onClick: () => showLeftTab("toolbox"),
          },
          "＋",
          h("span", null, "Dodaj"),
        ),
      ),
      h("button", { class: "tb-btn", onClick: duplicate, title: "Duplikuj (Ctrl+D)" }, "⧉", h("span", null, "Duplikuj")),
      h("button", { class: "tb-btn", onClick: remove, title: "Usuń (Delete)" }, "🗑", h("span", null, "Usuń")),
      h("button", { class: "tb-btn", onClick: doUndo, title: "Cofnij (Ctrl+Z)" }, "↶"),
      h("button", { class: "tb-btn", onClick: doRedo, title: "Ponów (Ctrl+Y)" }, "↷"),
      h("div", { class: "tb-sep" }),
      h("button", { class: "tb-btn", onClick: () => openGameSettings(), title: "Nazwa, opis, niebo, odznaki, publikacja" }, "⚙", h("span", null, "Gra")),
      h("button", { class: "tb-btn", onClick: () => openGuide("3d"), title: "Jak zrobić grę - przewodnik i skróty" }, "❓", h("span", null, "Pomoc")),
    );

    // ---------- panele ----------
    const explorer = h("div", { class: "panel-body" });
    const props = h("div", { class: "panel-body" });
    const scriptsList = h("div", { class: "panel-body" });
    const toolsList = h("div", { class: "panel-body" });
    const charsList = h("div", { class: "panel-body" });
    const animsList = h("div", { class: "panel-body" });
    const toolboxBody = h("div", { class: "panel-body toolbox" });
    const explorerSearch = h("input", { type: "search", class: "explorer-search", placeholder: "🔍 Szukaj obiektu…" });
    explorerSearch.addEventListener("input", () => renderExplorer());
    const panelSection = (title: string, actions: Node | null, body: HTMLElement, hint?: string) =>
      h("div", { class: "ltab-page" }, h("div", { class: "panel-title" }, title, actions ?? ""), hint ? h("p", { class: "panel-hint" }, hint) : "", body);
    // teren malowany pędzlem
    const terrainPanel = terrainTool({ scene, canvas, camera, view, data, pushUndo, changed });
    cleanups.push(() => terrainPanel.dispose());
    const LEFT_TABS: { id: string; icon: string; label: string; page: HTMLElement }[] = [
      { id: "toolbox", icon: "🧱", label: "Zestaw", page: panelSection("Zestaw - kliknij, żeby wstawić", null, toolboxBody) },
      { id: "objects", icon: "📋", label: "Obiekty", page: h("div", { class: "ltab-page" }, h("div", { class: "panel-title" }, "Obiekty w grze"), explorerSearch, explorer) },
      { id: "terrain", icon: "🏔", label: "Teren", page: terrainPanel.page },
      {
        id: "scripts",
        icon: "📜",
        label: "Skrypty",
        page: panelSection(
          "Skrypty",
          h(
            "span",
            { class: "panel-actions" },
            h("button", { class: "btn small", onClick: () => addScript("lua") }, "+ Lua"),
            h("button", { class: "btn small", onClick: () => addScript("blocks") }, "+ Bloczki"),
          ),
          scriptsList,
          "Najłatwiej: wybierz klocek i kliknij Zachowanie po prawej. Bloczki są jak w Scratchu.",
        ),
      },
      {
        id: "tools",
        icon: "🗡️",
        label: "Bronie",
        page: panelSection("Narzędzia i bronie", h("span", { class: "panel-actions" }, h("button", { class: "btn small", onClick: () => editTool(null) }, "+ Nowe")), toolsList),
      },
      {
        id: "chars",
        icon: "🧍",
        label: "Postacie",
        page: h(
          "div",
          { class: "ltab-page" },
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
          h("div", { class: "panel-title" }, "Animacje", h("span", { class: "panel-actions" }, h("button", { class: "btn small", onClick: () => newAnimation() }, "+ Nowa"))),
          animsList,
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
      if (t.id !== "terrain") terrainPanel.deactivate();
      leftPages.replaceChildren(t.page);
      for (const b of leftTabs.querySelectorAll<HTMLElement>(".ltab")) b.classList.toggle("active", b.dataset.ltab === t.id);
      // na telefonie panel jest wysuwany
      if (isCompact()) {
        rightPanel.classList.remove("open");
        leftPanel.classList.add("open");
        syncMobileTabs();
      }
    }
    const closeBtn = () => h("button", { class: "panel-close", title: "Zamknij", onClick: () => closePanels() }, "✕");
    leftTabs.append(closeBtn());
    const rightPanel = h("aside", { class: "studio-panel right" }, h("div", { class: "panel-title" }, "Właściwości", closeBtn()), props);

    // przełącznik paneli na telefonie
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
    // stuknięcie w widok zamyka wysunięty panel
    canvas.addEventListener("pointerdown", () => isCompact() && closePanels());

    // pływający pasek pod palec (telefon): najważniejsze akcje zawsze pod ręką
    const fabBtn = (icon: string, label: string, onClick: () => void, cls = "") =>
      h("button", { class: cls, title: label, onClick: (e: Event) => (e.stopPropagation(), onClick()) }, icon, h("small", null, label));
    const fab = {
      add: fabBtn("＋", "Dodaj", () => showLeftTab("toolbox"), "accent"),
      move: fabBtn("✥", "Przesuń", () => setTool("move")),
      scale: fabBtn("⤡", "Rozmiar", () => setTool("scale")),
      rotate: fabBtn("⟳", "Obróć", () => rotate()),
      dup: fabBtn("⧉", "Kopia", () => duplicate()),
      del: fabBtn("🗑", "Usuń", () => remove()),
      props: fabBtn("🔧", "Cechy", () => togglePanel(rightPanel)),
      focus: fabBtn("🎯", "Pokaż", () => focus()),
      undo: fabBtn("↶", "Cofnij", () => doUndo()),
    };
    const fabBar = h(
      "div",
      { class: "studio-fab" },
      fab.add,
      h("div", { class: "fab-sep" }),
      fab.move,
      fab.scale,
      fab.rotate,
      fab.dup,
      fab.del,
      fab.props,
      fab.focus,
      h("div", { class: "fab-sep" }),
      fab.undo,
    );
    function updateFab() {
      for (const b of [fab.move, fab.scale, fab.rotate, fab.dup, fab.del, fab.focus]) (b as HTMLButtonElement).disabled = !selected;
      fab.move.classList.toggle("on", !!selected && tool === "move");
      fab.scale.classList.toggle("on", !!selected && tool === "scale");
    }

    const hintBar = h("div", { class: "studio-hint" });
    viewport.append(hintBar, fabBar, speedTip);
    el.append(toolbar, h("div", { class: "studio-main" }, leftPanel, viewport, rightPanel), mobileTabs);
    engine.resize();

    function renderExplorer() {
      const q = explorerSearch.value.trim().toLowerCase();
      const list = q ? data.parts.filter((p) => p.name.toLowerCase().includes(q)) : data.parts;
      explorer.replaceChildren(
        h("div", { class: "explorer-count" }, `${list.length} z ${data.parts.length} obiektów`),
        ...list.filter((p) => !p.group || list.find((x) => x.group === p.group) === p).map((p) =>
          h(
            "button",
            {
              class: "tree-item " + (selected && (selected.id === p.id || (p.group && selected.group === p.group)) ? "active" : ""),
              onClick: () => {
                select(p);
                focus();
              },
            },
            h("span", { class: "tree-icon", style: `color:${p.color}` }, p.group ? "📦" : SHAPE_ICONS[p.shape]),
            p.name,
            p.group ? h("span", { class: "tree-count" }, `(${groupOf(p).length})`) : "",
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
      /** kąt w stopniach (dowolny) - pole puste / 0 usuwa obrót */
      const angleInput = (key: "rx" | "ry" | "rz") =>
        h("input", {
          type: "number",
          step: "15",
          value: String(p[key] ?? 0),
          onChange: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (!Number.isFinite(v)) return;
            const a = Math.round((((v % 360) + 360) % 360) * 100) / 100;
            upd(() => {
              if (key === "ry") p.ry = a;
              else if (a) p[key] = a;
              else delete p[key];
            });
          },
        });
      const select_ = <T extends string>(value: T, options: [T, string][], onPick: (v: T) => void) =>
        h(
          "select",
          { onChange: (e: Event) => onPick((e.target as HTMLSelectElement).value as T) },
          options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)),
        );
      const members = groupOf(p);
      props.replaceChildren(
        members.length > 1
          ? h(
              "div",
              { class: "model-banner" },
              h("b", null, `📦 Model: ${p.name}`),
              h("span", null, `${members.length} części - przesuwają się, obracają i kopiują razem`),
              h("button", { class: "btn small", onClick: () => ungroup(p) }, "Rozdziel na klocki"),
            )
          : "",
        h(
          "div",
          { class: "prop-actions" },
          h("button", { class: "btn small", title: "Ctrl+C - potem wklej w tej albo innej grze (Ctrl+V)", onClick: () => copySelection() }, "📋 Kopiuj"),
          readClip() ? h("button", { class: "btn small", title: "Ctrl+V", onClick: () => paste() }, "📥 Wklej") : "",
          h("button", { class: "btn small", title: "Inni twórcy będą mogli wstawić ten model", onClick: () => shareModel() }, "📤 Udostępnij"),
        ),
        field(
          members.length > 1 ? "Nazwa modelu" : "Nazwa",
          h("input", {
            value: p.name,
            maxLength: 40,
            onChange: (e: Event) =>
              upd(() => {
                const old = p.name;
                p.name = (e.target as HTMLInputElement).value.trim() || "Klocek";
                for (const m of groupOf(p)) m.name = p.name;
                // zachowania idą za nową nazwą (jeśli nie ma już innych klocków o starej nazwie)
                if (old !== p.name && !data.parts.some((x) => x.name === old)) {
                  renameInBehaviors(data.scripts, old, p.name);
                  renderScripts();
                }
              }),
            onBlur: () => (renderExplorer(), renderProps()),
          }),
        ),
        h("p", { class: "hint" }, "Skrypty wskazują klocki po nazwie."),
        field(
          "Kolor",
          h("input", { type: "color", value: p.color, onInput: (e: Event) => ((p.color = (e.target as HTMLInputElement).value), view.apply(p), changed()) }),
        ),
        h(
          "div",
          { class: "quick-colors" },
          QUICK_COLORS.map((c) =>
            h("button", {
              class: "qc" + (p.color.toLowerCase() === c ? " on" : ""),
              style: `background:${c}`,
              title: c,
              onClick: () => (upd(() => (p.color = c)), renderProps()),
            }),
          ),
        ),
        behaviorsBox(p, upd),
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
              if (v === "water") p.collide = false;
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
        p.kind === "seat"
          ? field(
              "Pojazd (cały model jedzie z graczem)",
              select_(p.vehicle ?? "", [["", "— zwykłe siedzenie —"], ["car", "🚗 Samochód"], ["boat", "🚤 Łódka (tylko po wodzie)"], ["skate", "🛹 Deskorolka"]] as [string, string][], (v) =>
                upd(() => (p.vehicle = (v || undefined) as Part["vehicle"])),
              ),
            )
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
        h("div", { class: "prop-group" }, "Obrót (stopnie)"),
        h("div", { class: "xyz" }, field("X", angleInput("rx")), field("Y", angleInput("ry")), field("Z", angleInput("rz"))),
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
        h(
          "label",
          { class: "prop check" },
          h("input", { type: "checkbox", checked: !!p.spin, onChange: (e: Event) => upd(() => ((e.target as HTMLInputElement).checked ? (p.spin = true) : delete p.spin)) }),
          h("span", null, "🔄 Kręci się (np. moneta)"),
        ),
      );
    }

    /** "Zachowania" - gotowe skrypty jednym kliknięciem */
    function behaviorsBox(p: Part, upd: (fn: () => void) => void) {
      const active = behaviorsOf(data.scripts, p.name);
      const activeIds = new Set(active.map(behaviorIdOf));
      const kindB = BEHAVIORS.find((b) => b.kind && b.kind === p.kind);
      return h(
        "div",
        { class: "behaviors" },
        h("div", { class: "prop-group" }, "⚡ Zachowania"),
        active.length || kindB
          ? h(
              "div",
              { class: "beh-active" },
              kindB ? h("span", { class: "beh-chip" }, kindB.icon + " " + kindB.label, h("button", { title: "Zwykły klocek", onClick: () => (upd(() => (p.kind = "normal")), renderProps(), renderExplorer()) }, "✕")) : "",
              active.map((sc) => {
                const b = BEHAVIORS.find((x) => x.id === behaviorIdOf(sc));
                return h(
                  "span",
                  { class: "beh-chip" },
                  h("button", { class: "beh-open", title: "Zobacz / zmień kod", onClick: () => editScript(sc) }, (b?.icon ?? "📜") + " " + (b?.label ?? sc.name)),
                  h(
                    "button",
                    {
                      title: "Usuń zachowanie",
                      onClick: () => {
                        data.scripts = data.scripts.filter((x) => x !== sc);
                        changed();
                        renderScripts();
                        renderProps();
                      },
                    },
                    "✕",
                  ),
                );
              }),
            )
          : h("p", { class: "hint" }, "Kliknij, co ma robić ten klocek:"),
        h(
          "div",
          { class: "beh-grid" },
          BEHAVIORS.filter((b) => !activeIds.has(b.id) && b.kind !== p.kind).map((b) =>
            h("button", { class: "beh-btn", title: b.desc, onClick: () => applyBehavior(b, p) }, h("span", null, b.icon), b.label),
          ),
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
      // gotowe niebo: kafelki z podglądem, pierwszy = zwykły kolor
      let skybox = data.skybox ?? "";
      const skyGrid = h("div", { class: "sky-grid" });
      const renderSkyGrid = () =>
        skyGrid.replaceChildren(
          h(
            "button",
            { type: "button", class: "sky-tile" + (!skybox ? " on" : ""), onClick: () => ((skybox = ""), renderSkyGrid(), view.setSky(sky.value)) },
            h("span", { class: "sky-plain", style: `background:${sky.value}` }),
            h("span", null, "🎨 Kolor"),
          ),
          ...SKYBOXES.map((s) =>
            h(
              "button",
              { type: "button", class: "sky-tile" + (skybox === s.id ? " on" : ""), title: s.name, onClick: () => ((skybox = s.id), renderSkyGrid(), view.setSkybox(s.id)) },
              skyPreview(s, 120, 60),
              h("span", null, s.icon + " " + s.name),
            ),
          ),
        );
      renderSkyGrid();
      sky.addEventListener("input", () => {
        if (!skybox) view.setSky(sky.value);
        renderSkyGrid();
      });
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
      const products = productEditor(data.products);
      const genreSel = genreSelect(data.genre);
      const audioLight = soundsLightEditor(data);
      const close = modal(
        "Ustawienia gry",
        h(
          "div",
          { class: "form" },
          h("label", null, "Nazwa", name),
          h("label", null, "Opis", desc),
          h("label", null, "Kategoria (gracze znajdą grę w Hitach i wyszukiwarce)", genreSel),
          h("label", null, `Maks. graczy na serwer (1–${MAX_PLAYERS_LIMIT})`, maxP),
          h("div", { class: "prop" }, h("span", null, "Niebo (podgląd od razu w Studio)"), skyGrid),
          h("label", null, "Kolor nieba (gdy wybrane „Kolor”)", sky),
          h("label", null, "Grawitacja (normalnie 196)", grav),
          h("label", null, "Wygląd graczy", playerChar),
          h("label", { class: "check" }, pvp, h("span", null, "PvP - gracze mogą się ranić broniami")),
          audioLight.el,
          badges.el,
          products.el,
          src.online
            ? h("label", { class: "check" }, pub, h("span", null, "Opublikowana - inni mogą w nią grać"))
            : h("p", { class: "muted", style: "font-size:13px;margin:0" }, "Gra z pliku - żeby ją opublikować, wyślij ją na serwer (Plik → Wyślij na serwer)."),
        ),
        [
          { label: "Anuluj", onClick: () => (close(), data.skybox ? view.setSkybox(data.skybox) : view.setSky(data.skyColor)) },
          {
            label: "Zapisz",
            kind: "primary",
            onClick: async () => {
              data.skyColor = sky.value;
              if (skybox) data.skybox = skybox;
              else delete data.skybox;
              data.gravity = Math.min(500, Math.max(10, Number(grav.value) || 196.2));
              data.pvp = pvp.checked;
              const al = audioLight.read();
              for (const k of ["sounds", "music", "light"] as const) delete data[k];
              Object.assign(data, JSON.parse(JSON.stringify(al)));
              data.badges = badges.read();
              if (genreSel.value) data.genre = genreSel.value;
              else delete data.genre;
              const prod = products.read();
              if (prod.length) data.products = prod;
              else delete data.products;
              data.playerCharacter = playerChar.value || undefined;
              renderCharacters();
              if (data.skybox) view.setSkybox(data.skybox);
              else view.setSky(data.skyColor);
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
      else if (ctrl && e.key === "c") (e.preventDefault(), copySelection());
      else if (ctrl && e.key === "v") (e.preventDefault(), paste());
      else if (e.key === "Delete" || e.key === "Backspace") remove();
      else if (e.key === "1") setTool("select");
      else if (e.key === "2") setTool("move");
      else if (e.key === "3") setTool("scale");
      else if (e.key === "4") setTool("rotate");
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

    // WASD przesuwa kamerę (W = do przodu, tam gdzie patrzysz), Q/E w dół/górę
    scene.onBeforeRenderObservable.add(() => {
      if (keys.size === 0) return;
      const dt = engine.getDeltaTime() / 1000;
      const speed = flySpeed * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.5 : 1) * dt;
      // W/S lecą dokładnie tam, gdzie patrzy kamera (też w górę i w dół), jak w Roblox Studio
      const f = camera.target.subtract(camera.position).normalize();
      const l = Math.hypot(f.x, f.z) || 1;
      const r = new Vector3(f.z / l, 0, -f.x / l);
      const move = Vector3.Zero();
      if (keys.has("KeyW")) move.addInPlace(f);
      if (keys.has("KeyS")) move.subtractInPlace(f);
      if (keys.has("KeyD")) move.addInPlace(r);
      if (keys.has("KeyA")) move.subtractInPlace(r);
      if (keys.has("KeyE")) move.y += 1;
      if (keys.has("KeyQ")) move.y -= 1;
      camera.target.addInPlace(move.scale(speed));
    });

    renderToolbox();
    showLeftTab(data.parts.length > 3 ? "objects" : "toolbox");
    leftPanel.classList.remove("open");
    renderExplorer();
    renderProps();
    renderScripts();
    renderTools();
    renderCharacters();
    renderAnimations();
    setTool("move");
    if (startDirty) changed();
    if (shouldShowGuide("3d")) setTimeout(() => !disposed && openGuide("3d"), 600);

    // ---------- współpraca: inni twórcy tej gry na żywo ----------
    /** zmiany od innych twórców - widok i panele */
    function applyRemote(c: RemoteChange) {
      for (const p of c.parts) {
        if (view.meshes.has(p.id)) view.apply(p);
        else view.add(p);
      }
      for (const id of c.del) view.remove(id);
      const f = new Set(c.fields);
      if (f.has("tools")) view.setTools(data.tools), renderTools();
      if (f.has("characters") || f.has("animations")) view.setCharacters(data.characters, data.animations), renderCharacters(), renderAnimations();
      if (f.has("scripts")) renderScripts();
      if (f.has("skybox") || f.has("skyColor")) data.skybox ? view.setSkybox(data.skybox) : view.setSky(data.skyColor);
      if (f.has("terrain")) terrainPanel.reload();
      if (selected && c.del.includes(selected.id)) select(null);
      else if (selected && c.parts.includes(selected)) {
        gizmos.attachToMesh(view.meshes.get(selected.id) ?? null);
        // nie odświeżamy pól, w których ktoś właśnie pisze
        if (!props.contains(document.activeElement)) renderProps();
      }
      renderExplorer();
      collab?.refreshFrames();
    }
    if (src.online && src.worldId && session.user) {
      collab = new Collab({
        worldId: src.worldId,
        data,
        scene,
        camera,
        selectedId: () => selected?.id ?? null,
        onRemote: applyRemote,
        onEditors: (list) => renderEditors(list),
        onState: (srv) => {
          // ktoś edytował wcześniej - stan z serwera jest aktualny
          const keep = new Set(srv.parts.map((p) => p.id));
          const del = data.parts.filter((p) => !keep.has(p.id)).map((p) => p.id);
          const fields = (["scripts", "tools", "characters", "animations", "skyColor", "skybox", "gravity", "pvp", "playerCharacter", "badges", "products", "sounds", "music", "light", "genre", "terrain"] as const).filter(
            (k) => JSON.stringify(srv[k] ?? null) !== JSON.stringify(data[k] ?? null),
          );
          for (const k of fields) {
            if (srv[k] === undefined) delete data[k];
            else (data as unknown as Record<string, unknown>)[k] = srv[k];
          }
          const byId = new Map(data.parts.map((p) => [p.id, p]));
          const parts = srv.parts.map((p) => {
            const cur = byId.get(p.id);
            if (!cur) return p;
            for (const k of Object.keys(cur)) if (!(k in p)) delete (cur as unknown as Record<string, unknown>)[k];
            return Object.assign(cur, p);
          });
          data.parts = parts;
          applyRemote({ parts, del, fields });
        },
      });
      cleanups.push(() => collab?.dispose());
    }
    function renderEditors(list: Editor[]) {
      editorsBtn.replaceChildren(
        ...list.slice(0, 5).map((e) => h("span", { class: "ed-dot", style: `background:${e.color}`, title: e.username }, e.username.slice(0, 1).toUpperCase())),
        h("span", null, list.length ? `${list.length + 1} w Studiu` : "Współpraca"),
      );
    }
    renderEditors([]);
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
