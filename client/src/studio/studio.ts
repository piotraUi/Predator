// Studio - edytor świata: stawianie, przesuwanie i skalowanie klocków, skrypty i ustawienia gry.
import {
  ArcRotateCamera,
  GizmoManager,
  PointerEventTypes,
  Ray,
  Scene,
  Vector3,
  type AbstractMesh,
} from "@babylonjs/core";
import type { Part, PartKind, PartShape, WorldData, WorldInfo, WorldScript } from "../../../shared/types.ts";
import { MAX_PLAYERS_LIMIT } from "../../../shared/types.ts";
import { makePart, MAX_PARTS, newId } from "../../../shared/world.ts";
import { api } from "../api.ts";
import { createEngine, WorldView } from "../engine/world.ts";
import { h, modal, toast } from "../ui/dom.ts";
import { openScriptEditor } from "./scriptEditor.ts";

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
];

const SHAPE_ICONS: Record<PartShape, string> = { box: "⬛", sphere: "⚪", cylinder: "🛢", wedge: "📐" };
const KIND_LABELS: Record<PartKind, string> = { normal: "Zwykły", spawn: "Spawn (start)", kill: "Zabija (lawa)", bounce: "Trampolina" };

const snap = (v: number, step: number) => Math.round(v / step) * step;
const round = (v: number) => Math.round(v * 1000) / 1000;

export function studioScreen(root: HTMLElement, params: { worldId: number }, go: Go) {
  const canvas = h("canvas", { class: "studio-canvas" });
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Wczytywanie gry…");
  const viewport = h("div", { class: "studio-viewport" }, canvas, loading);
  const el = h("div", { class: "studio" }, viewport);
  root.append(el);

  const { engine, dispose: disposeEngine } = createEngine(canvas);
  const scene = new Scene(engine);
  let disposed = false;
  const cleanups: (() => void)[] = [];

  api
    .getWorld(params.worldId)
    .then(({ info, data }) => !disposed && start(info, data))
    .catch((e) => {
      toast(e.message, "error");
      go("home", { tab: "create" });
    });

  function start(info: WorldInfo, data: WorldData) {
    loading.remove();
    let dirty = false;
    let selected: Part | null = null;
    let tool: Tool = "move";
    let gridStep = 1;
    const undo: string[] = [];
    const redo: string[] = [];

    const view = new WorldView(scene, { shadows: false, skyColor: data.skyColor });
    view.load(data.parts);

    // ---------- kamera ----------
    const camera = new ArcRotateCamera("cam", -Math.PI / 2 + 0.6, 1.0, 60, new Vector3(0, 0, 0), scene);
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 600;
    camera.wheelDeltaPercentage = 0.03;
    camera.pinchDeltaPercentage = 0.006;
    camera.panningSensibility = 60;
    camera.panningAxis = new Vector3(1, 0, 1);
    camera.minZ = 0.3;
    camera.maxZ = 3000;
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.attachControl(true, false, 2); // prawy przycisk = przesuwanie widoku
    // na dotyku: dwa palce przesuwają widok
    (camera.inputs.attached.pointers as unknown as { multiTouchPanning: boolean }).multiTouchPanning = true;

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
    async function save(quiet = false) {
      try {
        await api.saveWorld(info.id, { data });
        dirty = false;
        saveBtn.classList.remove("unsaved");
        if (!quiet) toast("Zapisano ✔", "good");
        return true;
      } catch (e) {
        toast((e as Error).message, "error");
        return false;
      }
    }

    // ---------- pasek narzędzi ----------
    const saveBtn = h("button", { class: "tb-btn", onClick: () => save(), title: "Zapisz (Ctrl+S)" }, "💾", h("span", null, "Zapisz"));
    const addMenu = h(
      "div",
      { class: "dropdown hidden" },
      PRESETS.map((pr) =>
        h("button", { class: "dd-item", onClick: () => (addMenu.classList.add("hidden"), addPart(pr.part)) }, pr.icon + " " + pr.label),
      ),
    );
    const gridSel = h(
      "select",
      { class: "tb-select", title: "Krok siatki", onChange: (e: Event) => ((gridStep = Number((e.target as HTMLSelectElement).value)), applySnap()) },
      [0.25, 0.5, 1, 2, 4].map((v) => h("option", { value: String(v), selected: v === 1 }, `Siatka ${v}`)),
    );
    const toolbar = h(
      "div",
      { class: "studio-toolbar" },
      h(
        "button",
        {
          class: "tb-btn",
          onClick: async () => {
            if (dirty && confirm("Zapisać zmiany przed wyjściem?")) await save(true);
            go("home", { tab: "create" });
          },
        },
        "←",
        h("span", null, "Wyjdź"),
      ),
      saveBtn,
      h(
        "button",
        { class: "tb-btn play", onClick: async () => (await save(true)) && go("play", { worldId: info.id }), title: "Zapisz i zagraj" },
        "▶",
        h("span", null, "Testuj"),
      ),
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
        h("button", { class: "tb-btn accent", onClick: () => addMenu.classList.toggle("hidden") }, "＋", h("span", null, "Dodaj")),
        addMenu,
      ),
      h("button", { class: "tb-btn", onClick: duplicate, title: "Duplikuj (Ctrl+D)" }, "⧉", h("span", null, "Duplikuj")),
      h("button", { class: "tb-btn", onClick: remove, title: "Usuń (Delete)" }, "🗑", h("span", null, "Usuń")),
      h("button", { class: "tb-btn", onClick: doUndo, title: "Cofnij (Ctrl+Z)" }, "↶"),
      h("button", { class: "tb-btn", onClick: doRedo, title: "Ponów (Ctrl+Y)" }, "↷"),
      h("div", { class: "tb-sep" }),
      h("button", { class: "tb-btn", onClick: () => openSettings() }, "⚙", h("span", null, "Ustawienia gry")),
    );

    // ---------- panele ----------
    const explorer = h("div", { class: "panel-body" });
    const props = h("div", { class: "panel-body" });
    const scriptsList = h("div", { class: "panel-body" });
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
        field("Typ", select_(p.kind, Object.entries(KIND_LABELS) as [PartKind, string][], (v) => upd(() => (p.kind = v)))),
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
                    onClick: () => {
                      if (!confirm(`Usunąć skrypt „${s.name}”?`)) return;
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

    // ---------- ustawienia gry ----------
    function openSettings() {
      const name = h("input", { value: info.name, maxLength: 40 });
      const desc = h("textarea", { value: info.description, maxLength: 500, rows: 3 });
      const maxP = h("input", { type: "number", min: "1", max: String(MAX_PLAYERS_LIMIT), value: String(info.maxPlayers) });
      const sky = h("input", { type: "color", value: data.skyColor });
      const grav = h("input", { type: "number", min: "10", max: "500", step: "1", value: String(data.gravity) });
      const pub = h("input", { type: "checkbox", checked: info.published });
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
          h("label", { class: "check" }, pub, h("span", null, "Opublikowana - inni mogą w nią grać")),
        ),
        [
          { label: "Anuluj", onClick: () => close() },
          {
            label: "Zapisz",
            kind: "primary",
            onClick: async () => {
              data.skyColor = sky.value;
              data.gravity = Math.min(500, Math.max(10, Number(grav.value) || 196.2));
              view.setSky(data.skyColor);
              try {
                info = await api.saveWorld(info.id, {
                  name: name.value,
                  description: desc.value,
                  maxPlayers: Math.min(MAX_PLAYERS_LIMIT, Math.max(1, Number(maxP.value) || 30)),
                  published: pub.checked,
                  data,
                });
                dirty = false;
                saveBtn.classList.remove("unsaved");
                toast("Zapisano ustawienia", "good");
                close();
              } catch (e) {
                toast((e as Error).message, "error");
              }
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
    setTool("move");
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
