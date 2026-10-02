// Studio - edytor świata: stawianie, przesuwanie i skalowanie klocków, skrypty i ustawienia gry.
import {
  ArcRotateCamera,
  Color3,
  CreateScreenshotUsingRenderTargetAsync,
  GizmoManager,
  Matrix,
  MeshBuilder,
  type LinesMesh,
  type Mesh,
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
import { baseplate, makePart, MAX_PARTS, newId, spawnPart } from "../../../shared/world.ts";
import { allPlaces, findPlace, MAIN_PLACE, MAX_PLACES, placeOf } from "../../../shared/places.ts";
import { openGuiEditor } from "./guiEditor.ts";
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
import { openEditorsDialog } from "./editorsDialog.ts";
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
    let dirty = false;
    let selected: Part | null = null;
    /** kilka zaznaczonych naraz (Shift + klik, ramka) - "selected" to główny z nich */
    let multi: Part[] = [];
    /** klocki schowane tylko w Studio (żeby dostać się do środka budynku) - nie zapisują się */
    const hiddenIds = new Set<string>();
    let showGridFloor = false;
    /** telefon: stuknięcie dodaje do zaznaczenia */
    let addMode = false;
    let tool: Tool = "move";
    /** miejsce (place) gry, które teraz edytujemy - na planszy są tylko jego klocki */
    let curPlace = MAIN_PLACE;
    const inPlace = (p: Part) => placeOf(p) === curPlace;
    /** nowy klocek stoi w edytowanym miejscu */
    const tagPlace = (p: Part) => {
      if (curPlace === MAIN_PLACE) delete p.place;
      else p.place = curPlace;
      return p;
    };
    const placeParts = () => data.parts.filter(inPlace);
    let gridStep = 1;
    const undo: string[] = [];
    const redo: string[] = [];

    const view = new WorldView(scene, { shadows: false, skyColor: data.skyColor, skybox: data.skybox });
    view.setTools(data.tools);
    view.setCharacters(data.characters, data.animations);
    view.load(data.parts.filter((p) => placeOf(p) === MAIN_PLACE));
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
        members: selParts().map((p) => ({ p, pos: new Vector3(p.x, p.y, p.z), q: partQuat(p) })),
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
      if (!selected || !dragStart || selParts().length < 2) return;
      const mesh = view.meshes.get(selected.id);
      if (!mesh) return;
      const dx = mesh.position.x - dragStart.x;
      const dy = mesh.position.y - dragStart.y;
      const dz = mesh.position.z - dragStart.z;
      for (const o of selParts()) {
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
      if (dragStart && selParts().length > 1) {
        const dx = round(mesh.position.x - dragStart.x);
        const dy = round(mesh.position.y - dragStart.y);
        const dz = round(mesh.position.z - dragStart.z);
        for (const o of selParts()) {
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
    /** klocek pod kursorem (bez zablokowanych i schowanych) */
    const pickable = (m: AbstractMesh) => {
      const id = m.metadata?.partId as string | undefined;
      if (!id || hiddenIds.has(id)) return false;
      return !data.parts.find((p) => p.id === id)?.locked;
    };
    const partAt = (x: number, y: number) => {
      const id = scene.pick(x, y, pickable)?.pickedMesh?.metadata?.partId as string | undefined;
      return id ? (data.parts.find((p) => p.id === id) ?? null) : null;
    };
    scene.onPointerObservable.add((pi) => {
      if (pi.type !== PointerEventTypes.POINTERTAP || pi.event.button !== 0) return;
      const ev = pi.event as PointerEvent;
      const p = partAt(scene.pointerX, scene.pointerY);
      const add = ev.shiftKey || ev.ctrlKey || ev.metaKey || addMode;
      if (add) {
        if (p) select(p, true);
      } else select(p);
    });

    // ramka zaznaczania: lewy przycisk przeciągnięty po pustym miejscu (jak w Roblox Studio)
    const marquee = h("div", { class: "studio-marquee hidden" });
    let box: { x0: number; y0: number; x1: number; y1: number; add: boolean; active: boolean; id: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onBoxDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ([pg, sg, rg].some((g) => g.isHovered)) return;
      const p = local(e);
      if (partAt(p.x, p.y)) return;
      box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey || e.ctrlKey || e.metaKey, active: false, id: e.pointerId };
    };
    const onBoxMove = (e: PointerEvent) => {
      if (!box || box.id !== e.pointerId) return;
      const p = local(e);
      box.x1 = p.x;
      box.y1 = p.y;
      if (!box.active && Math.hypot(box.x1 - box.x0, box.y1 - box.y0) > 10) box.active = true;
      if (!box.active) return;
      marquee.classList.remove("hidden");
      Object.assign(marquee.style, {
        left: Math.min(box.x0, box.x1) + "px",
        top: Math.min(box.y0, box.y1) + "px",
        width: Math.abs(box.x1 - box.x0) + "px",
        height: Math.abs(box.y1 - box.y0) + "px",
      });
    };
    const onBoxUp = (e: PointerEvent) => {
      if (!box || box.id !== e.pointerId) return;
      const b = box;
      box = null;
      marquee.classList.add("hidden");
      if (!b.active) return;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const rw = engine.getRenderWidth(), rh = engine.getRenderHeight();
      const k = rw / Math.max(1, canvas.clientWidth);
      const vp = camera.viewport.toGlobal(rw, rh);
      const tm = scene.getTransformMatrix();
      // zaznaczają się klocki, które w całości mieszczą się w ramce (wielka podłoga się nie łapie)
      const inside = data.parts.filter((p) => {
        if (p.locked || hiddenIds.has(p.id) || !inPlace(p)) return false;
        const b = bounds([p]);
        for (const cx of [b.x0, b.x1])
          for (const cy of [b.y0, b.y1])
            for (const cz of [b.z0, b.z1]) {
              const s2 = Vector3.Project(new Vector3(cx, cy, cz), Matrix.IdentityReadOnly, tm, vp);
              if (s2.z < 0 || s2.z > 1) return false;
              const sx = s2.x / k, sy = s2.y / k;
              if (sx < x0 || sx > x1 || sy < y0 || sy > y1) return false;
            }
        return true;
      });
      selectMany(b.add ? [...selRoots(), ...inside] : inside);
    };
    canvas.addEventListener("pointerdown", onBoxDown);
    window.addEventListener("pointermove", onBoxMove);
    window.addEventListener("pointerup", onBoxUp);
    cleanups.push(() => {
      canvas.removeEventListener("pointerdown", onBoxDown);
      window.removeEventListener("pointermove", onBoxMove);
      window.removeEventListener("pointerup", onBoxUp);
    });

    // obrys klocka pod kursorem
    let hovered: Mesh | null = null;
    scene.onPointerObservable.add((pi) => {
      if (pi.type !== PointerEventTypes.POINTERMOVE) return;
      const ev = pi.event as PointerEvent;
      let next: Mesh | null = null;
      if (ev.pointerType === "mouse" && ev.buttons === 0 && !box) {
        const p = partAt(scene.pointerX, scene.pointerY);
        if (p && !selParts().includes(p)) next = (view.meshes.get(p.id) as Mesh | undefined) ?? null;
      }
      if (next === hovered) return;
      if (hovered) hovered.renderOutline = false;
      hovered = next;
      if (hovered) {
        hovered.renderOutline = true;
        hovered.outlineColor = new Color3(1, 1, 1);
        hovered.outlineWidth = 0.04;
      }
    });

    // siatka na ziemi (y = 0) wokół miejsca, na które patrzy kamera
    let gridMesh: LinesMesh | null = null;
    let gridKey = "";
    scene.onBeforeRenderObservable.add(() => {
      if (!showGridFloor) {
        if (gridMesh) (gridMesh.dispose(), (gridMesh = null), (gridKey = ""));
        return;
      }
      const step = gridStep < 1 ? 1 : gridStep;
      const R = 60 * step;
      const cx = Math.round(camera.target.x / (step * 10)) * step * 10;
      const cz = Math.round(camera.target.z / (step * 10)) * step * 10;
      const key = `${cx},${cz},${step}`;
      if (key === gridKey) return;
      gridKey = key;
      gridMesh?.dispose();
      const lines: Vector3[][] = [];
      for (let d = -R; d <= R; d += step) {
        lines.push([new Vector3(cx + d, 0.03, cz - R), new Vector3(cx + d, 0.03, cz + R)]);
        lines.push([new Vector3(cx - R, 0.03, cz + d), new Vector3(cx + R, 0.03, cz + d)]);
      }
      gridMesh = MeshBuilder.CreateLineSystem("studio-grid", { lines }, scene);
      gridMesh.color = new Color3(1, 1, 1);
      gridMesh.alpha = 0.18;
      gridMesh.isPickable = false;
    });

    /** części modelu (albo sam klocek) */
    function groupOf(p: Part) {
      return p.group ? data.parts.filter((x) => x.group === p.group) : [p];
    }
    /** zaznaczone "korzenie" (klocek albo jedna część modelu) */
    function selRoots(): Part[] {
      return multi.length ? multi : selected ? [selected] : [];
    }
    /** wszystkie zaznaczone klocki (z całymi modelami) */
    function selParts(): Part[] {
      const out = new Set<Part>();
      for (const r of selRoots()) for (const p of groupOf(r)) out.add(p);
      return [...out];
    }

    // przebudowana siatka zaznaczonego klocka: gizmo i ramka na nową siatkę
    view.onMeshRebuilt = (id) => {
      if (selected?.id !== id) return;
      const m = view.meshes.get(id);
      if (m) m.showBoundingBox = true;
      gizmos.attachToMesh(m ?? null);
    };
    // klocki zaznaczone razem z głównym też mają ramkę po przebudowie
    const prevRebuilt = view.onMeshRebuilt;
    view.onMeshRebuilt = (id) => {
      prevRebuilt?.(id);
      const m = view.meshes.get(id);
      if (m && selParts().some((p) => p.id === id)) m.showBoundingBox = true;
      if (m && hiddenIds.has(id)) m.isVisible = false;
    };

    /** add = Shift / Ctrl + klik: dodaj albo usuń z zaznaczenia */
    function select(p: Part | null, add = false) {
      if (add && p) {
        const roots = selRoots();
        const inSel = roots.find((r) => r === p || (p.group && r.group === p.group));
        const next = inSel ? roots.filter((r) => r !== inSel) : [...roots, p];
        multi = next.length > 1 ? next : [];
        selected = next.at(-1) ?? null;
      } else {
        multi = [];
        selected = p;
      }
      showSelection();
      setTool(tool);
      renderProps();
      renderExplorer();
      updateStatus();
    }
    /** ramki zaznaczonych klocków i gizmo na głównym */
    function showSelection() {
      for (const m of view.meshes.values()) m.showBoundingBox = false;
      for (const o of selParts()) {
        const m = view.meshes.get(o.id);
        if (m) m.showBoundingBox = true;
      }
      gizmos.attachToMesh(selected ? (view.meshes.get(selected.id) ?? null) : null);
    }
    /** zaznacza listę klocków (np. po ramce albo wklejeniu) */
    function selectMany(list: Part[]) {
      const roots: Part[] = [];
      for (const p of list) if (!roots.some((r) => r === p || (p.group && r.group === p.group))) roots.push(p);
      multi = roots.length > 1 ? roots : [];
      selected = roots.at(-1) ?? null;
      showSelection();
      setTool(tool);
      renderProps();
      renderExplorer();
      updateStatus();
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
            k("Przeciągnij", "ramka"),
            k("Prawy przycisk", "rozglądanie"),
            k("WASD", "lot"),
            k("Kółko", "zoom"),
            k("Prawy + kółko", "prędkość"),
          ]
        : tool === "move"
          ? [[multi.length > 1 ? `✥ Zaznaczono ${multi.length} - ciągnij strzałki, przesuwają się wszystkie` : selected.group ? "📦 Model - ciągnij strzałki, przesuwa się cały" : "✥ Ciągnij kolorowe strzałki, żeby przesunąć"], k("R", "obróć"), k("Ctrl+D", "kopia"), k("Shift+klik", "więcej"), k("?", "skróty")]
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
      const multiIds = multi.map((p) => p.id);
      const snap = JSON.parse(json) as { parts: Part[]; terrain: WorldData["terrain"] | null };
      data.parts = snap.parts;
      const terrainChanged = JSON.stringify(snap.terrain ?? null) !== JSON.stringify(data.terrain ?? null);
      if (snap.terrain) data.terrain = snap.terrain;
      else delete data.terrain;
      if (terrainChanged) terrainPanel.reload();
      view.clear();
      view.load(placeParts());
      select(data.parts.find((p) => p.id === selId) ?? null);
      const again = multiIds.map((id) => data.parts.find((p) => p.id === id)).filter((p): p is Part => !!p);
      if (again.length > 1) selectMany(again);
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
      updateStatus();
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
      const p = tagPlace(makePart({ ...preset, x: snap(t.x, 1), y: sy / 2, z: snap(t.z, 1) }));
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
      const blockers = placeParts().filter((p) => p.kind === "spawn" || !(p.sy <= 1.2 && p.sx * p.sz > 150));
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
        const p = tagPlace(makePart({ ...d, name, ...(group ? { group } : {}), x: round(ox + (d.x ?? 0)), y: round(base + (d.y ?? sy / 2)), z: round(oz + (d.z ?? 0)) }));
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
          const tp = tagPlace(makePart({ name: target, shape: p.shape, x: round(p.x + 20), y: p.y, z: p.z, sx: p.sx, sy: p.sy, sz: p.sz, color: "#b388ff", material: "neon" }));
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

    /**
     * Kopie zaznaczonych klocków / modeli przesunięte o (dx, dy, dz). Każda kopia dostaje własną nazwę
     * i własne zachowania (jak przy zwykłym duplikowaniu).
     */
    function cloneRoots(roots: Part[], dx: number, dy: number, dz: number): Part[] {
      const made: Part[] = [];
      for (const root of roots) {
        const members = groupOf(root);
        const name = uniqueName(root.name);
        const group = root.group ? newId() : undefined;
        for (const m of members) {
          const c: Part = { ...m, id: newId(), name, x: round(m.x + dx), y: round(m.y + dy), z: round(m.z + dz) };
          if (group) c.group = group;
          data.parts.push(c);
          view.add(c);
          if (m === root) made.push(c);
        }
        for (const sc of behaviorsOf(data.scripts, root.name)) {
          const b = BEHAVIORS.find((x) => x.id === behaviorIdOf(sc));
          if (b?.lua) data.scripts.push(behaviorScript(b, name, b.id === "teleport" ? root.name + " cel" : undefined));
        }
      }
      return made;
    }
    /** zasięg zaznaczonych klocków (min / max w każdej osi) */
    function bounds(parts: Part[]) {
      const ext = (p: Part) => {
        const [hx, hz] = (p.ry ?? 0) % 180 ? [p.sz / 2, p.sx / 2] : [p.sx / 2, p.sz / 2];
        return { x0: p.x - hx, x1: p.x + hx, y0: p.y - p.sy / 2, y1: p.y + p.sy / 2, z0: p.z - hz, z1: p.z + hz };
      };
      return parts.map(ext).reduce((a, b) => ({
        x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1),
      }));
    }

    function duplicate() {
      if (!selected) return;
      if (multi.length > 1) {
        if (data.parts.length + selParts().length > MAX_PARTS) return toast(`Maksymalnie ${MAX_PARTS} klocków`, "error");
        pushUndo();
        const b = bounds(selParts());
        const made = cloneRoots(multi, round(b.x1 - b.x0 + 2), 0, 0);
        renderScripts();
        changed();
        return selectMany(made);
      }
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
      /** kilka różnych klocków / modeli: każdy zachowuje swoją nazwę (i swoje zachowania) */
      names?: Record<string, string[]>;
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
      const members = selParts();
      const many = new Set(members.map((m) => m.name)).size > 1;
      const toolIds = new Set(members.map((m) => m.toolId).filter(Boolean));
      const charIds = new Set(members.map((m) => m.characterId).filter(Boolean));
      const animIds = new Set(members.map((m) => m.animId).filter(Boolean));
      const clip: Clip = {
        v: 1,
        from: meta.name,
        name: many ? `${selRoots().length} obiektów` : selected.name,
        parts: structuredClone(members),
        behaviors: behaviorsOf(data.scripts, selected.name).map((sc) => behaviorIdOf(sc)).filter((x): x is string => !!x),
        ...(many
          ? {
              names: Object.fromEntries(
                [...new Set(members.map((m) => m.name))].map((n) => [n, behaviorsOf(data.scripts, n).map((sc) => behaviorIdOf(sc)).filter((x): x is string => !!x)]),
              ),
            }
          : {}),
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
      toast(`📋 Skopiowano: ${clip.name}${members.length > 1 ? ` (${members.length} klocków)` : ""}. Wklej w dowolnej grze: Ctrl+V`, "good");
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
      // kilka obiektów: każdy z własną (wolną) nazwą, modele dostają nowe id grup
      const newNames = new Map<string, string>();
      const newGroups = new Map<string, string>();
      // narzędzia, postacie i animacje, których ta gra jeszcze nie ma
      for (const t of clip.tools) if (!data.tools.some((x) => x.id === t.id)) data.tools.push(t);
      for (const c of clip.characters) if (!data.characters.some((x) => x.id === c.id)) data.characters.push(c);
      for (const a of clip.animations) if (!data.animations.some((x) => x.id === a.id)) data.animations.push(a);
      const made = defs.map((d) => {
        const p: Part = tagPlace({ ...d, id: newId(), name, x: round(ox + d.x), y: round(base + (d.y - minY)), z: round(oz + d.z) });
        if (clip.names) {
          if (!newNames.has(d.name)) newNames.set(d.name, uniqueName(d.name));
          p.name = newNames.get(d.name)!;
          if (d.group) {
            if (!newGroups.has(d.group)) newGroups.set(d.group, newId());
            p.group = newGroups.get(d.group)!;
          } else delete p.group;
        } else if (group) p.group = group;
        else delete p.group;
        data.parts.push(p);
        view.add(p);
        return p;
      });
      const behaviorsFor = clip.names ? [...newNames].map(([from, to]) => [to, clip.names![from] ?? []] as const) : [[name, clip.behaviors] as const];
      for (const [n, ids] of behaviorsFor)
        for (const id of ids) {
          const b = BEHAVIORS.find((x) => x.id === id);
          if (b?.lua) data.scripts.push(behaviorScript(b, n));
        }
      view.setTools(data.tools);
      view.setCharacters(data.characters, data.animations);
      renderScripts();
      renderTools();
      renderCharacters();
      renderAnimations();
      changed();
      if (clip.names) selectMany(made);
      else select(made[0]);
      toast(`📥 Wklejono: ${clip.names ? clip.name : name}${clip.from && clip.from !== meta.name ? ` (z gry „${clip.from}”)` : ""}`, "good");
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
      const ids = new Set(selParts().map((p) => p.id));
      data.parts = data.parts.filter((p) => !ids.has(p.id));
      for (const id of ids) view.remove(id);
      changed();
      select(null);
    }

    function rotate() {
      if (!selected) return;
      pushUndo();
      const members = selParts();
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
      showSelection();
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
      if (multi.length > 1) return frameParts(selParts());
      camera.setTarget(new Vector3(selected.x, selected.y, selected.z));
      camera.radius = Math.max(12, Math.max(selected.sx, selected.sy, selected.sz) * 2.5);
    }
    /** kamera pokazuje wszystkie podane klocki */
    function frameParts(parts: Part[]) {
      if (!parts.length) return;
      const b = bounds(parts);
      camera.setTarget(new Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2));
      const size = Math.max(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      camera.radius = Math.min(camera.upperRadiusLimit ?? 600, Math.max(12, size * 1.1));
    }
    /** widok z góry na to, na co patrzymy (do układania mapy) */
    function topView() {
      camera.alpha = -Math.PI / 2;
      camera.beta = 0.05;
    }

    /** po zmianie kilku klocków naraz */
    function editMany(fn: () => void) {
      pushUndo();
      fn();
      for (const p of selParts()) view.apply(p);
      showSelection();
      changed();
      renderProps();
      renderExplorer();
    }

    /** zmiana podanych klocków (np. blokada z Eksploratora) */
    function editManyParts(parts: Part[], fn: () => void) {
      pushUndo();
      fn();
      for (const p of parts) view.apply(p);
      changed();
      renderExplorer();
      renderProps();
    }

    // ---------- miejsca (places) ----------
    /** niebo edytowanego miejsca (albo całej gry) */
    function applyPlaceSky() {
      const pl = findPlace(data, curPlace);
      const sky = pl?.skyColor ?? data.skyColor;
      const box = pl?.skybox !== undefined ? pl.skybox : data.skybox;
      if (box) view.setSkybox(box);
      else view.setSky(sky);
    }
    function switchPlace(id: string) {
      if (!allPlaces(data).some((x) => x.id === id)) id = MAIN_PLACE;
      curPlace = id;
      select(null);
      hiddenIds.clear();
      view.clear();
      view.load(placeParts());
      // teren jest tylko w głównym miejscu
      view.setTerrain(id === MAIN_PLACE ? TerrainGrid.decode(data.terrain) : null);
      applyPlaceSky();
      renderPlaces();
      renderExplorer();
      updateStatus();
      if (id !== MAIN_PLACE) terrainPanel.deactivate();
      const sp = placeParts().find((p) => p.kind === "spawn");
      if (sp) camera.setTarget(new Vector3(sp.x, sp.y, sp.z));
      else frameParts(placeParts());
    }
    const placeSel = h("select", { class: "tb-select", title: "Miejsce gry, które edytujesz" });
    placeSel.addEventListener("change", () => {
      if (placeSel.value === "+") {
        placeSel.value = curPlace;
        return openPlaces(true);
      }
      switchPlace(placeSel.value);
    });
    function renderPlaces() {
      placeSel.replaceChildren(
        ...allPlaces(data).map((pl) =>
          h("option", { value: pl.id, selected: pl.id === curPlace }, (pl.gui ? "🪟 " : "🗺 ") + pl.name + ((data.startPlace ?? MAIN_PLACE) === pl.id ? " ⭐" : "")),
        ),
        h("option", { value: "+" }, "➕ Nowe miejsce…"),
      );
    }
    /** okno "Miejsca": dodawanie, nazwy, niebo, miejsce startowe, miejsce tylko na GUI */
    function openPlaces(addNew = false) {
      const body = h("div", { class: "places-dlg" });
      const render = () => {
        const list = allPlaces(data);
        body.replaceChildren(
          h("p", { class: "hint" }, "Miejsca to osobne mapy tej samej gry (np. Menu, Lobby, Arena). Gracz przechodzi skryptem teleportToPlace(player, \"Arena\"), bloczkiem albo przyciskiem GUI. Każde miejsce ma własny serwer."),
          ...list.map((pl) => {
            const main = pl.id === MAIN_PLACE;
            const name = h("input", { value: pl.name, maxLength: 40, disabled: main });
            name.addEventListener("change", () => {
              const v = name.value.trim();
              if (!v || list.some((x) => x !== pl && x.name.toLowerCase() === v.toLowerCase())) return toast("Nazwy miejsc muszą być różne", "error"), (name.value = pl.name);
              pl.name = v;
              changed();
              renderPlaces();
            });
            const count = data.parts.filter((p) => placeOf(p) === pl.id).length;
            const isStart = (data.startPlace ?? MAIN_PLACE) === pl.id;
            return h(
              "div",
              { class: "place-row" + (pl.id === curPlace ? " active" : "") },
              h("div", { class: "place-main" }, name, h("span", { class: "muted" }, `${count} klocków`)),
              h(
                "div",
                { class: "row wrap" },
                h("button", { class: "btn small", onClick: () => (close(), switchPlace(pl.id)) }, "✎ Edytuj"),
                h("button", { class: "btn small" + (isStart ? " primary" : ""), title: "Tu zaczynają nowi gracze", onClick: () => ((main ? delete data.startPlace : (data.startPlace = pl.id)), changed(), renderPlaces(), render()) }, isStart ? "⭐ Startowe" : "Ustaw jako startowe"),
                main
                  ? h("span", { class: "muted" }, "teren i niebo z ustawień gry")
                  : h(
                      "label",
                      { class: "prop check" },
                      h("input", { type: "checkbox", checked: !!pl.gui, onChange: (e: Event) => (((e.target as HTMLInputElement).checked ? (pl.gui = true) : delete pl.gui), changed(), renderPlaces()) }),
                      "🪟 Tylko GUI (menu: bez postaci gracza)",
                    ),
                main ? "" : h("input", { type: "color", title: "Kolor nieba", value: pl.skyColor ?? data.skyColor, onChange: (e: Event) => ((pl.skyColor = (e.target as HTMLInputElement).value), changed(), pl.id === curPlace && applyPlaceSky()) }),
                main
                  ? ""
                  : h(
                      "button",
                      {
                        class: "btn small danger",
                        onClick: async () => {
                          if (!(await ask(`Usunąć miejsce „${pl.name}” razem z jego ${count} klockami?`, "Usuń", "Anuluj", true))) return;
                          pushUndo();
                          data.parts = data.parts.filter((p) => placeOf(p) !== pl.id);
                          data.places = (data.places ?? []).filter((x) => x !== pl);
                          if (!data.places.length) delete data.places;
                          if (data.startPlace === pl.id) delete data.startPlace;
                          for (const sc of data.scripts) if (sc.place === pl.id) delete sc.place;
                          changed();
                          if (curPlace === pl.id) switchPlace(MAIN_PLACE);
                          renderPlaces();
                          renderScripts();
                          render();
                        },
                      },
                      "🗑",
                    ),
              ),
            );
          }),
          h("button", { class: "btn primary", onClick: () => addPlace() }, "➕ Nowe miejsce"),
        );
      };
      const addPlace = () => {
        if ((data.places?.length ?? 0) >= MAX_PLACES) return toast(`Maksymalnie ${MAX_PLACES} miejsc`, "error");
        let n = (data.places?.length ?? 0) + 1;
        let name = `Miejsce ${n}`;
        while (allPlaces(data).some((x) => x.name === name)) name = `Miejsce ${++n}`;
        const pl = { id: newId(), name };
        (data.places ??= []).push(pl);
        // nowe miejsce od razu ma podłogę i spawn
        data.parts.push({ ...baseplate(), id: newId(), place: pl.id }, { ...spawnPart(), id: newId(), place: pl.id });
        changed();
        renderPlaces();
        render();
        toast(`Dodano: ${name}. Kliknij „✎ Edytuj”, żeby je budować.`, "good");
      };
      const close = modal("🗺 Miejsca gry", body);
      render();
      if (addNew) addPlace();
    }

    /** łączy zaznaczone klocki w jeden model (przesuwają się, obracają i kopiują razem) */
    function groupSel() {
      const parts = selParts();
      if (parts.length < 2) return toast("Zaznacz kilka klocków (Shift + klik albo ramka)", "info");
      const g = newId();
      editMany(() => parts.forEach((p) => (p.group = g)));
      select(selected);
      toast(`📦 Połączono w model: ${parts.length} klocków. Rozdzielisz we właściwościach.`, "good");
    }

    function lockSel() {
      const parts = selParts();
      if (!parts.length) return;
      editMany(() => parts.forEach((p) => (p.locked = true)));
      select(null);
      toast(`🔒 Zablokowano: ${parts.length}. Nie da się ich kliknąć na planszy - odblokujesz w Eksploratorze.`, "good");
    }

    /** chowa / pokazuje klocek tylko w Studio (np. dach, żeby budować w środku) */
    function setHidden(parts: Part[], hide: boolean) {
      for (const p of parts) {
        if (hide) hiddenIds.add(p.id);
        else hiddenIds.delete(p.id);
        const m = view.meshes.get(p.id);
        if (m) m.isVisible = !hide;
      }
      if (hide && selected && parts.includes(selected)) select(null);
      renderExplorer();
      updateStatus();
    }
    function showAllHidden() {
      setHidden(data.parts.filter((p) => hiddenIds.has(p.id)), false);
    }

    /** stawia zaznaczone na tym, co jest pod spodem (klocek, teren albo ziemia y = 0) */
    function dropSel() {
      const parts = selParts();
      if (!parts.length) return;
      const ids = new Set(parts.map((p) => p.id));
      const b = bounds(parts);
      let top = -Infinity;
      const xs = [b.x0 + 0.05, (b.x0 + b.x1) / 2, b.x1 - 0.05], zs = [b.z0 + 0.05, (b.z0 + b.z1) / 2, b.z1 - 0.05];
      for (const x of xs)
        for (const z of zs) {
          const hit = scene.pickWithRay(
            new Ray(new Vector3(x, b.y0 - 0.01, z), new Vector3(0, -1, 0), 5000),
            (m: AbstractMesh) => m.isPickable && m.isVisible && !ids.has(m.metadata?.partId) && (!!m.metadata?.partId || m.name === "terrain"),
          );
          if (hit?.pickedPoint) top = Math.max(top, hit.pickedPoint.y);
        }
      if (top === -Infinity) top = 0;
      const dy = round(top - b.y0);
      if (!dy) return toast("Już stoi na ziemi", "info");
      editMany(() => parts.forEach((p) => (p.y = round(p.y + dy))));
    }

    /** powiel w rzędzie: kilka kopii, każda przesunięta o tyle samo (płot, schody, kolumny...) */
    function arrayDialog() {
      const roots = selRoots();
      if (!roots.length) return toast("Najpierw zaznacz klocek albo model", "info");
      const b = bounds(selParts());
      const count = h("input", { type: "number", min: "2", max: "50", value: "5" });
      const ox = h("input", { type: "number", step: "0.5", value: String(round(b.x1 - b.x0)) });
      const oy = h("input", { type: "number", step: "0.5", value: "0" });
      const oz = h("input", { type: "number", step: "0.5", value: "0" });
      const close = modal(
        "🔁 Powiel w rzędzie",
        h(
          "div",
          { class: "array-dlg" },
          h("label", { class: "prop" }, h("span", null, "Ile razy razem z oryginałem"), count),
          h("span", { class: "prop-label" }, "Przesunięcie każdej kopii (X / Y / Z)"),
          h("div", { class: "xyz" }, ox, oy, oz),
          h("p", { class: "hint" }, "Np. schody: X = szerokość stopnia, Y = jego wysokość. Płot: X = szerokość deski."),
        ),
        [
          { label: "Anuluj", onClick: () => close() },
          {
            label: "Powiel",
            kind: "primary",
            onClick: () => {
              const n = Math.min(50, Math.max(2, Math.round(Number(count.value) || 2)));
              const d = [Number(ox.value) || 0, Number(oy.value) || 0, Number(oz.value) || 0];
              if (data.parts.length + selParts().length * (n - 1) > MAX_PARTS) return toast(`Maksymalnie ${MAX_PARTS} klocków`, "error");
              close();
              pushUndo();
              const made: Part[] = [...roots];
              for (let k = 1; k < n; k++) made.push(...cloneRoots(roots, d[0] * k, d[1] * k, d[2] * k));
              renderScripts();
              changed();
              selectMany(made);
              toast(`🔁 Gotowe: ${n} × ${roots.length > 1 ? "zaznaczone" : roots[0].name}`, "good");
            },
          },
        ],
      );
    }

    /** wyrównanie zaznaczonych w osi (do min / środka / max całego zaznaczenia) */
    function alignSel(axis: "x" | "y" | "z", where: "min" | "mid" | "max") {
      const roots = selRoots();
      if (roots.length < 2) return;
      const all = bounds(selParts());
      const lo = all[`${axis}0`], hi = all[`${axis}1`];
      editMany(() => {
        for (const r of roots) {
          const members = groupOf(r);
          const rb = bounds(members);
          const a = rb[`${axis}0`], c = rb[`${axis}1`];
          const target = where === "min" ? lo : where === "max" ? hi - (c - a) : (lo + hi) / 2 - (c - a) / 2;
          const d = round(target - a);
          for (const m of members) m[axis] = round(m[axis] + d);
        }
      });
    }
    /** równe odstępy między zaznaczonymi w osi */
    function distributeSel(axis: "x" | "z") {
      const roots = selRoots();
      if (roots.length < 3) return toast("Zaznacz przynajmniej 3 obiekty", "info");
      const items = roots.map((r) => ({ r, b: bounds(groupOf(r)) })).sort((p, q) => p.b[`${axis}0`] - q.b[`${axis}0`]);
      const lo = items[0].b[`${axis}0`], hi = items.at(-1)!.b[`${axis}1`];
      const total = items.reduce((n, it) => n + (it.b[`${axis}1`] - it.b[`${axis}0`]), 0);
      const gap = (hi - lo - total) / (items.length - 1);
      editMany(() => {
        let pos = lo;
        for (const it of items) {
          const d = round(pos - it.b[`${axis}0`]);
          for (const m of groupOf(it.r)) m[axis] = round(m[axis] + d);
          pos += it.b[`${axis}1`] - it.b[`${axis}0`] + gap;
        }
      });
    }

    /** strzałki: przesuwanie o krok siatki w kierunku, w którym patrzy kamera */
    function nudge(key: string, fine: boolean) {
      const parts = selParts();
      if (!parts.length) return;
      const step = fine ? Math.min(0.25, gridStep) : gridStep;
      if (key === "PageUp" || key === "PageDown") {
        editMany(() => parts.forEach((p) => (p.y = round(p.y + (key === "PageUp" ? step : -step)))));
        return;
      }
      const f = camera.target.subtract(camera.position);
      // przód kamery przyciągnięty do najbliższej osi świata
      const fwd = Math.abs(f.x) > Math.abs(f.z) ? new Vector3(Math.sign(f.x), 0, 0) : new Vector3(0, 0, Math.sign(f.z));
      const right = new Vector3(fwd.z, 0, -fwd.x);
      const dir = key === "ArrowUp" ? fwd : key === "ArrowDown" ? fwd.scale(-1) : key === "ArrowRight" ? right : right.scale(-1);
      editMany(() => parts.forEach((p) => ((p.x = round(p.x + dir.x * step)), (p.z = round(p.z + dir.z * step)))));
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
        ...(curPlace !== MAIN_PLACE || data.startPlace ? { place: curPlace } : {}),
        back: { screen: "studio", params: file ? { file: fileState() } : { worldId: params.worldId } },
      });
    }

    async function test() {
      if (!src.online) return testOffline();
      // test zaczyna się w miejscu, które edytujesz
      if (await save(true)) go("play", { worldId: params.worldId, ...(curPlace !== (data.startPlace ?? MAIN_PLACE) ? { place: curPlace } : {}), back: { screen: "studio", params: { worldId: params.worldId } } });
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
    const openEditors = () => src.worldId && openEditorsDialog(src.worldId, !!src.owner, exitScreen, "kolorowe kulki");
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
      placeSel,
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
      h("button", { class: "tb-btn", onClick: () => openPlaces(), title: "Miejsca gry: osobne mapy (menu, lobby, arena...)" }, "🗺", h("span", null, "Miejsca")),
      h("button", { class: "tb-btn", onClick: () => openGuis(), title: "GUI: menu, okienka, przyciski i napisy na ekranie gracza" }, "🪟", h("span", null, "GUI")),
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
      if (t.id === "terrain" && curPlace !== MAIN_PLACE) return toast("Teren jest tylko w głównym miejscu - przełącz miejsce na pasku", "info");
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
      many: fabBtn("➕", "Wiele", () => {
        addMode = !addMode;
        updateFab();
        if (addMode) toast("Stukaj klocki, żeby zaznaczyć kilka naraz. Jeszcze raz „Wiele” = koniec", "info");
      }),
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
      fab.many,
      h("div", { class: "fab-sep" }),
      fab.undo,
    );
    function updateFab() {
      for (const b of [fab.move, fab.scale, fab.rotate, fab.dup, fab.del, fab.focus]) (b as HTMLButtonElement).disabled = !selected;
      fab.move.classList.toggle("on", !!selected && tool === "move");
      fab.many.classList.toggle("on", addMode);
      fab.scale.classList.toggle("on", !!selected && tool === "scale");
    }

    const hintBar = h("div", { class: "studio-hint" });
    // pasek stanu: liczba klocków, zaznaczenie i szybkie przyciski widoku
    const stInfo = h("span", { class: "st-info" });
    const stBtn = (label: string, title: string, fn: () => void) => h("button", { class: "st-btn", title, onClick: (e: Event) => (e.stopPropagation(), fn()) }, label);
    const gridFloorBtn = stBtn("▦", "Siatka na ziemi (G)", () => ((showGridFloor = !showGridFloor), updateStatus()));
    const unhideBtn = stBtn("👁", "Pokaż schowane klocki", () => showAllHidden());
    const statusBar = h(
      "div",
      { class: "studio-status s3d" },
      stInfo,
      h("span", { class: "st-sep" }),
      stBtn("⛶", "Pokaż całą mapę (Home)", () => frameParts(placeParts())),
      stBtn("⬇", "Widok z góry (T)", () => topView()),
      gridFloorBtn,
      unhideBtn,
      stBtn("⌨", "Skróty klawiszowe (?)", () => openShortcuts()),
    );
    function updateStatus() {
      const n = selRoots().length;
      stInfo.textContent = `${placeParts().length} klocków` + (n > 1 ? ` · zaznaczono ${n}` : "") + (hiddenIds.size ? ` · schowane ${hiddenIds.size}` : "");
      gridFloorBtn.classList.toggle("on", showGridFloor);
      unhideBtn.classList.toggle("hidden", !hiddenIds.size);
    }
    function openShortcuts() {
      const rows: [string, string][] = [
        ["Klik", "zaznacz klocek"],
        ["Shift / Ctrl + klik", "dodaj / usuń z zaznaczenia"],
        ["Przeciągnij po pustym", "zaznacz ramką kilka klocków (z Shift - dodaj)"],
        ["Ctrl + A", "zaznacz wszystko (bez zablokowanych)"],
        ["Ctrl + G", "połącz zaznaczone w model"],
        ["Ctrl + C / V", "kopiuj / wklej (także w innej grze)"],
        ["Ctrl + D", "duplikuj"],
        ["Delete", "usuń zaznaczone"],
        ["1 / 2 / 3 / 4", "wybierz / przesuń / skaluj / obracaj"],
        ["R", "obróć o 90°"],
        ["Strzałki", "przesuń o krok siatki (tam, gdzie patrzy kamera); z Shift o 0.25"],
        ["PageUp / PageDown", "w górę / w dół o krok siatki"],
        ["End", "postaw na ziemi (na tym, co pod spodem)"],
        ["L", "zablokuj (nie da się kliknąć - np. podłoga)"],
        ["H", "schowaj w Studio (np. dach); Shift + H - pokaż wszystkie"],
        ["F", "pokaż zaznaczone"],
        ["Home", "pokaż całą mapę"],
        ["T", "widok z góry"],
        ["G", "siatka na ziemi"],
        ["Prawy przycisk", "rozglądanie się"],
        ["WASD / Q E", "lot kamerą, Shift = szybciej; prawy + kółko = prędkość"],
        ["Ctrl + Z / Y", "cofnij / ponów"],
        ["Ctrl + F", "szukaj obiektu"],
        ["Ctrl + S", "zapisz"],
      ];
      modal("Skróty w Studio 3D", h("table", { class: "shortcuts" }, rows.map(([k, v]) => h("tr", null, h("td", null, h("kbd", null, k)), h("td", null, v)))));
    }
    viewport.append(hintBar, fabBar, speedTip, marquee, statusBar);
    el.append(toolbar, h("div", { class: "studio-main" }, leftPanel, viewport, rightPanel), mobileTabs);
    engine.resize();

    function renderExplorer() {
      const q = explorerSearch.value.trim().toLowerCase();
      const here = placeParts();
      const list = q ? here.filter((p) => p.name.toLowerCase().includes(q)) : here;
      explorer.replaceChildren(
        h("div", { class: "explorer-count" }, `${list.length} z ${here.length} obiektów` + (data.places?.length ? ` · ${allPlaces(data).find((x) => x.id === curPlace)?.name ?? ""}` : "")),
        ...list.filter((p) => !p.group || list.find((x) => x.group === p.group) === p).map((p) => {
          const members = groupOf(p);
          const isSel = selParts().includes(p);
          const hidden = members.every((m) => hiddenIds.has(m.id));
          const locked = members.every((m) => m.locked);
          return h(
            "div",
            { class: "exp-row" + (hidden ? " dim" : "") },
            h(
              "button",
              {
                class: "tree-item " + (isSel ? "active" : ""),
                title: "Klik = zaznacz i pokaż, Shift / Ctrl + klik = dodaj do zaznaczenia",
                onClick: (e: MouseEvent) => {
                  if (e.shiftKey || e.ctrlKey || e.metaKey) return select(p, true);
                  select(p);
                  focus();
                },
              },
              h("span", { class: "tree-icon", style: `color:${p.color}` }, p.group ? "📦" : SHAPE_ICONS[p.shape]),
              p.name,
              p.group ? h("span", { class: "tree-count" }, `(${members.length})`) : "",
              p.kind !== "normal" ? h("span", { class: "tree-kind" }, KIND_LABELS[p.kind]) : null,
            ),
            h(
              "button",
              { class: "exp-ic" + (locked ? " on" : ""), title: locked ? "Odblokuj" : "Zablokuj (nie da się kliknąć na planszy)", onClick: () => editManyParts(members, () => members.forEach((m) => (locked ? delete m.locked : (m.locked = true)))) },
              locked ? "🔒" : "🔓",
            ),
            h("button", { class: "exp-ic" + (hidden ? " on" : ""), title: hidden ? "Pokaż w Studio" : "Schowaj w Studio (w grze dalej widać)", onClick: () => setHidden(members, !hidden) }, hidden ? "🙈" : "👁"),
          );
        }),
      );
      explorer.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    }

    function field(label: string, input: HTMLElement) {
      return h("label", { class: "prop" }, h("span", null, label), input);
    }

    /** kilka zaznaczonych: wspólne cechy, wyrównanie i równe odstępy */
    function renderMultiProps() {
      const roots = selRoots();
      const parts = selParts();
      const same = <K extends keyof Part>(k: K) => parts.every((x) => x[k] === parts[0][k]);
      const al = (axis: "x" | "y" | "z") =>
        h(
          "div",
          { class: "align-row" },
          h("span", { class: "align-ax" }, axis.toUpperCase()),
          h("button", { class: "btn small", title: `Do najmniejszego ${axis.toUpperCase()}`, onClick: () => alignSel(axis, "min") }, "⇤ min"),
          h("button", { class: "btn small", title: "Środki w jednej linii", onClick: () => alignSel(axis, "mid") }, "↔ środek"),
          h("button", { class: "btn small", title: `Do największego ${axis.toUpperCase()}`, onClick: () => alignSel(axis, "max") }, "max ⇥"),
        );
      props.replaceChildren(
        h("div", { class: "model-banner" }, h("b", null, `Zaznaczono ${roots.length} obiektów`), h("span", null, `${parts.length} klocków - przesuwasz gizmem wszystkie naraz, R obraca całość`)),
        h(
          "div",
          { class: "prop-actions" },
          h("button", { class: "btn small primary", title: "Ctrl+G", onClick: () => groupSel() }, "📦 Połącz w model"),
          h("button", { class: "btn small", title: "Ctrl+D", onClick: () => duplicate() }, "⧉ Duplikuj"),
          h("button", { class: "btn small", onClick: () => arrayDialog() }, "🔁 Powiel"),
          h("button", { class: "btn small", title: "Ctrl+C", onClick: () => copySelection() }, "📋 Kopiuj"),
          h("button", { class: "btn small", title: "End", onClick: () => dropSel() }, "⬇ Na ziemię"),
          h("button", { class: "btn small", title: "L", onClick: () => lockSel() }, "🔒 Zablokuj"),
          h("button", { class: "btn small", title: "H", onClick: () => setHidden(parts, true) }, "🙈 Schowaj"),
          h("button", { class: "btn small danger", title: "Delete", onClick: () => remove() }, "🗑 Usuń"),
        ),
        h("div", { class: "prop-group" }, "Wyrównaj"),
        al("x"),
        al("y"),
        al("z"),
        h("div", { class: "prop-group" }, "Równe odstępy"),
        h(
          "div",
          { class: "prop-actions" },
          h("button", { class: "btn small", onClick: () => distributeSel("x") }, "↔ w osi X"),
          h("button", { class: "btn small", onClick: () => distributeSel("z") }, "↕ w osi Z"),
        ),
        h("div", { class: "prop-group" }, "Wszystkim zaznaczonym"),
        field("Kolor", h("input", { type: "color", value: parts[0].color, onChange: (e: Event) => editMany(() => parts.forEach((x) => (x.color = (e.target as HTMLInputElement).value))) })),
        h(
          "div",
          { class: "quick-colors" },
          QUICK_COLORS.map((c) => h("button", { class: "qc", style: `background:${c}`, title: c, onClick: () => editMany(() => parts.forEach((x) => (x.color = c))) })),
        ),
        field(
          "Materiał",
          h(
            "select",
            { onChange: (e: Event) => editMany(() => parts.forEach((x) => (x.material = (e.target as HTMLSelectElement).value as Part["material"]))) },
            [...(same("material") ? [] : [["", "(różne)"]]), ["plastic", "Plastik"], ["neon", "Neon (świeci)"], ["glass", "Szkło"], ["metal", "Metal"]].map(([v, l]) =>
              h("option", { value: v, selected: same("material") ? (parts[0].material ?? "plastic") === v : v === "" , disabled: v === "" }, l),
            ),
          ),
        ),
        field(
          "Przezroczystość",
          h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(parts[0].transparency), onChange: (e: Event) => editMany(() => parts.forEach((x) => (x.transparency = Number((e.target as HTMLInputElement).value)))) }),
        ),
        h(
          "label",
          { class: "prop check" },
          h("input", { type: "checkbox", checked: parts.every((x) => x.collide), onChange: (e: Event) => editMany(() => parts.forEach((x) => (x.collide = (e.target as HTMLInputElement).checked && x.kind !== "water"))) }),
          h("span", null, "Kolizja (nie można przez nie przejść)"),
        ),
      );
    }

    function renderProps() {
      updateFab();
      if (multi.length > 1) return renderMultiProps();
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
          h("button", { class: "btn small", title: "Kilka kopii w rzędzie (płot, schody...)", onClick: () => arrayDialog() }, "🔁 Powiel"),
          h("button", { class: "btn small", title: "Postaw na tym, co jest pod spodem (End)", onClick: () => dropSel() }, "⬇ Na ziemię"),
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
        h(
          "label",
          { class: "prop check" },
          h("input", {
            type: "checkbox",
            checked: !!p.locked,
            onChange: (e: Event) => {
              const on = (e.target as HTMLInputElement).checked;
              editManyParts(members, () => members.forEach((m) => (on ? (m.locked = true) : delete m.locked)));
            },
          }),
          h("span", null, "🔒 Zablokowany w Studio (nie da się kliknąć na planszy)"),
        ),
        field(
          "Napis nad klockiem",
          h("input", {
            value: p.label ?? "",
            maxLength: 60,
            placeholder: "np. Sklep, Start, Kup: 50 💰",
            onChange: (e: Event) => upd(() => ((e.target as HTMLInputElement).value.trim() ? (p.label = (e.target as HTMLInputElement).value.trim()) : delete p.label)),
          }),
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
                // gra z kilkoma miejscami: gdzie działa skrypt
                data.places?.length
                  ? h(
                      "select",
                      {
                        class: "script-place",
                        title: "Gdzie działa ten skrypt",
                        onChange: (e: Event) => {
                          const v = (e.target as HTMLSelectElement).value;
                          if (v === MAIN_PLACE) delete s.place;
                          else s.place = v;
                          changed();
                        },
                      },
                      [["*", "🌍 Wszędzie"], ...allPlaces(data).map((pl): [string, string] => [pl.id, pl.name])].map(([v, l]) =>
                        h("option", { value: v, selected: (s.place ?? MAIN_PLACE) === v }, l),
                      ),
                    )
                  : "",
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

    // ---------- GUI ----------
    function openGuis() {
      data.guis ??= [];
      const places = allPlaces(data).map((pl): [string, string] => [pl.id, (pl.gui ? "🪟 " : "🗺 ") + pl.name]);
      openGuiEditor({ guis: data.guis, mode: "3d", wheres: places, places, onChange: () => changed() });
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
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || document.querySelector(".gui-editor")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "s") (e.preventDefault(), save());
      else if (ctrl && e.key === "z") (e.preventDefault(), doUndo());
      else if (ctrl && e.key === "y") (e.preventDefault(), doRedo());
      else if (ctrl && e.key === "d") (e.preventDefault(), duplicate());
      else if (ctrl && e.key === "c") (e.preventDefault(), copySelection());
      else if (ctrl && e.key === "v") (e.preventDefault(), paste());
      else if (ctrl && e.key === "a") (e.preventDefault(), selectMany(placeParts().filter((p) => !p.locked && !hiddenIds.has(p.id))));
      else if (ctrl && e.key === "g") (e.preventDefault(), groupSel());
      else if (ctrl && e.key === "f") (e.preventDefault(), showLeftTab("objects"), leftPanel.classList.add("open"), explorerSearch.focus(), explorerSearch.select());
      else if (ctrl) return;
      else if (e.key === "Delete" || e.key === "Backspace") remove();
      else if (e.key.startsWith("Arrow") || e.key === "PageUp" || e.key === "PageDown") (e.preventDefault(), nudge(e.key, e.shiftKey));
      else if (e.key === "End") dropSel();
      else if (e.key === "Home") frameParts(placeParts());
      else if (e.key === "Escape") select(null);
      else if (e.key === "?") openShortcuts();
      else if (e.key === "l" || e.key === "L") lockSel();
      else if (e.key === "h" || e.key === "H") e.shiftKey ? showAllHidden() : setHidden(selParts(), true);
      else if (e.key === "t" || e.key === "T") topView();
      else if (e.key === "g" || e.key === "G") ((showGridFloor = !showGridFloor), updateStatus());
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
    renderPlaces();
    updateStatus();
    if (startDirty) changed();
    if (shouldShowGuide("3d")) setTimeout(() => !disposed && openGuide("3d"), 600);

    // ---------- współpraca: inni twórcy tej gry na żywo ----------
    /** zmiany od innych twórców - widok i panele */
    function applyRemote(c: RemoteChange) {
      const f = new Set(c.fields);
      for (const p of c.parts) {
        // klocek z innego miejsca (albo przeniesiony do innego) - nie na tej planszy
        if (!inPlace(p)) view.remove(p.id);
        else if (view.meshes.has(p.id)) view.apply(p);
        else view.add(p);
      }
      if (f.has("places") && !allPlaces(data).some((x) => x.id === curPlace)) switchPlace(MAIN_PLACE);
      else if (f.has("places")) renderPlaces();
      for (const id of c.del) view.remove(id);
      if (f.has("tools")) view.setTools(data.tools), renderTools();
      if (f.has("characters") || f.has("animations")) view.setCharacters(data.characters, data.animations), renderCharacters(), renderAnimations();
      if (f.has("scripts")) renderScripts();
      if (f.has("skybox") || f.has("skyColor") || f.has("places")) applyPlaceSky();
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
          const fields = (["scripts", "tools", "characters", "animations", "skyColor", "skybox", "gravity", "pvp", "playerCharacter", "badges", "products", "sounds", "music", "light", "genre", "terrain", "guis", "places", "startPlace"] as const).filter(
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
