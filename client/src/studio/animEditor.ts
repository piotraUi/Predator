// Edytor animacji: postać na środku, suwaki obrotu stawów, oś czasu z klatkami kluczowymi.
import { ArcRotateCamera, Color4, HemisphericLight, MeshBuilder, PointerEventTypes, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { clonePose, JOINT_LABELS, samplePose } from "../../../shared/anim.ts";
import { DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import type { AnimDef, CharacterDef, Joint, JointRot, Pose } from "../../../shared/types.ts";
import { JOINTS } from "../../../shared/types.ts";
import { MAX_KEYFRAMES } from "../../../shared/world.ts";
import { AvatarModel } from "../engine/avatar.ts";
import { hexColor } from "../engine/color.ts";
import { createEngine } from "../engine/world.ts";
import { ask, h, toast } from "../ui/dom.ts";

const round = (v: number, d = 100) => Math.round(v * d) / d;

export function openAnimEditor(original: AnimDef, characters: CharacterDef[], onSave: (a: AnimDef) => void) {
  const a: AnimDef = structuredClone(original);
  let dirty = false;
  let time = 0;
  let playing = false;
  let selKey: number | null = a.keyframes.length ? 0 : null;
  let joint: Joint | "y" = "rightArm";
  let clipboard: Pose | null = null;

  // ---------- podgląd 3D ----------
  const canvas = h("canvas", { class: "char-canvas" });
  const { engine, dispose } = createEngine(canvas);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.12, 0.13, 0.16, 1);
  const cam = new ArcRotateCamera("c", -Math.PI / 2 - 0.5, 1.2, 15, new Vector3(0, 2.8, 0), scene);
  cam.attachControl(true);
  cam.lowerRadiusLimit = 5;
  cam.upperRadiusLimit = 40;
  cam.wheelDeltaPercentage = 0.05;
  new HemisphericLight("l", new Vector3(0.3, 1, -0.6), scene).intensity = 1.1;
  const floor = MeshBuilder.CreateDisc("floor", { radius: 5, tessellation: 40 }, scene);
  floor.rotation.x = Math.PI / 2;
  const floorMat = new StandardMaterial("floor", scene);
  floorMat.diffuseColor = hexColor("#2a2d35");
  floor.material = floorMat;
  floor.isPickable = false;
  const model = new AvatarModel(scene, DEFAULT_AVATAR, null, true);

  // kliknięcie w część ciała wybiera staw
  scene.onPointerObservable.add((pi) => {
    if (pi.type !== PointerEventTypes.POINTERTAP) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY);
    const mesh = pick?.pickedMesh;
    if (!mesh) return;
    for (const j of JOINTS) {
      let m: typeof mesh | null = mesh;
      while (m) {
        if (m === model.jointMesh(j)) {
          selectJoint(j);
          return;
        }
        m = m.parent as typeof mesh | null;
      }
    }
  });

  const currentPose = (): Pose => (selKey !== null && !playing ? a.keyframes[selKey].pose : samplePose(a, time));

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (playing) {
      time += dt;
      if (time >= a.duration) {
        if (a.loop) time %= a.duration;
        else {
          time = a.duration;
          playing = false;
          renderControls();
        }
      }
      renderPlayhead();
    }
    model.previewPose = currentPose();
    model.update(dt);
    scene.render();
  });

  // ---------- górny pasek ----------
  const name = h("input", { class: "script-name", value: a.name, maxLength: 30 });
  name.addEventListener("input", () => ((a.name = name.value.trim() || "Animacja"), (dirty = true)));
  const check = (label: string, get: () => boolean, set: (v: boolean) => void, title: string) => {
    const c = h("input", { type: "checkbox", checked: get() });
    c.addEventListener("change", () => {
      set(c.checked);
      dirty = true;
    });
    return h("label", { class: "top-check", title }, c, h("span", null, label));
  };
  const duration = h("input", { type: "number", min: "0.1", max: "60", step: "0.1", value: String(a.duration), class: "dur" });
  duration.addEventListener("change", () => {
    const d = Math.min(60, Math.max(0.1, Number(duration.value) || 1));
    a.duration = d;
    for (const k of a.keyframes) k.t = Math.min(k.t, d);
    time = Math.min(time, d);
    dirty = true;
    renderTimeline();
  });
  const charSel = h(
    "select",
    { title: "Na jakiej postaci pokazać animację" },
    h("option", { value: "" }, "Postać: domyślna"),
    characters.map((c) => h("option", { value: c.id }, "Postać: " + c.name)),
  );
  charSel.addEventListener("change", () => model.setLook(DEFAULT_AVATAR, characters.find((c) => c.id === charSel.value) ?? null));

  // ---------- stawy i suwaki ----------
  const jointList = h("div", { class: "joint-list" });
  const sliders = h("div", { class: "joint-sliders" });
  function selectJoint(j: Joint | "y") {
    joint = j;
    renderJoints();
  }
  function editPose(fn: (p: Pose) => void) {
    // edycja poza klatką tworzy nową klatkę w tym miejscu osi czasu
    if (selKey === null || Math.abs(a.keyframes[selKey].t - time) > 0.001) {
      if (a.keyframes.length >= MAX_KEYFRAMES) return toast(`Maksymalnie ${MAX_KEYFRAMES} klatek`, "error");
      const p = clonePose(samplePose(a, time));
      a.keyframes.push({ t: round(time), pose: p });
      a.keyframes.sort((x, y) => x.t - y.t);
      selKey = a.keyframes.findIndex((k) => k.pose === p);
      renderTimeline();
    }
    fn(a.keyframes[selKey!].pose);
    dirty = true;
  }
  function renderJoints() {
    jointList.replaceChildren(
      ...JOINTS.map((j) =>
        h("button", { class: "seg-btn " + (joint === j ? "active" : ""), onClick: () => selectJoint(j) }, JOINT_LABELS[j]),
      ),
      h("button", { class: "seg-btn " + (joint === "y" ? "active" : ""), onClick: () => selectJoint("y") }, "Wysokość ciała"),
    );
    const pose = currentPose();
    if (joint === "y") {
      const v = pose.y ?? 0;
      const val = h("b", null, v.toFixed(2));
      const r = h("input", { type: "range", min: "-4", max: "4", step: "0.05", value: String(v) });
      r.addEventListener("input", () => {
        editPose((p) => (p.y = Number(r.value)));
        val.textContent = Number(r.value).toFixed(2);
      });
      sliders.replaceChildren(h("label", { class: "prop" }, h("span", null, "Góra / dół: ", val), r));
      return;
    }
    const j = joint;
    const rot: JointRot = pose.joints[j] ?? [0, 0, 0];
    const axisNames = ["X (przód / tył)", "Y (obrót w bok)", "Z (na boki)"];
    sliders.replaceChildren(
      ...[0, 1, 2].map((i) => {
        const val = h("input", { type: "number", class: "deg", step: "1", value: String(Math.round(rot[i])) });
        const r = h("input", { type: "range", min: "-180", max: "180", step: "1", value: String(rot[i]) });
        const set = (v: number) =>
          editPose((p) => {
            const cur: JointRot = [...(p.joints[j] ?? [0, 0, 0])] as JointRot;
            cur[i] = v;
            p.joints[j] = cur;
          });
        r.addEventListener("input", () => {
          set(Number(r.value));
          val.value = r.value;
        });
        val.addEventListener("change", () => {
          const v = Math.max(-360, Math.min(360, Number(val.value) || 0));
          set(v);
          r.value = String(v);
        });
        return h("label", { class: "prop" }, h("span", null, axisNames[i]), h("div", { class: "row" }, r, val));
      }),
      h(
        "button",
        {
          class: "btn small",
          onClick: () => {
            editPose((p) => delete p.joints[j]);
            renderJoints();
          },
        },
        "Wyzeruj " + JOINT_LABELS[j].toLowerCase(),
      ),
    );
  }

  // ---------- oś czasu ----------
  const track = h("div", { class: "tl-track" });
  const playhead = h("div", { class: "tl-head" });
  const timeLabel = h("span", { class: "tl-time" });
  const keyTime = h("input", { type: "number", class: "dur", step: "0.05", min: "0" });
  keyTime.addEventListener("change", () => {
    if (selKey === null) return;
    const k = a.keyframes[selKey];
    k.t = Math.min(a.duration, Math.max(0, Number(keyTime.value) || 0));
    a.keyframes.sort((x, y) => x.t - y.t);
    selKey = a.keyframes.indexOf(k);
    time = k.t;
    dirty = true;
    renderTimeline();
  });
  track.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).classList.contains("tl-key")) return;
    const r = track.getBoundingClientRect();
    time = round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration);
    selKey = a.keyframes.findIndex((k) => Math.abs(k.t - time) < a.duration / 100);
    if (selKey < 0) selKey = null;
    playing = false;
    renderTimeline();
  });
  function renderPlayhead() {
    playhead.style.left = (time / a.duration) * 100 + "%";
    timeLabel.textContent = time.toFixed(2) + " s / " + a.duration.toFixed(2) + " s";
  }
  function renderTimeline() {
    const ticks: HTMLElement[] = [];
    const step = a.duration <= 2 ? 0.25 : a.duration <= 6 ? 1 : 2;
    for (let t = 0; t <= a.duration + 1e-6; t += step)
      ticks.push(h("span", { class: "tl-tick", style: `left:${(t / a.duration) * 100}%` }, t.toFixed(step < 1 ? 2 : 0)));
    track.replaceChildren(
      ...ticks,
      ...a.keyframes.map((k, i) =>
        h("div", {
          class: "tl-key" + (i === selKey ? " active" : ""),
          style: `left:${(k.t / a.duration) * 100}%`,
          title: `Klatka ${i + 1} (${k.t.toFixed(2)} s)`,
          onPointerdown: (e: Event) => {
            e.stopPropagation();
            selKey = i;
            time = k.t;
            playing = false;
            renderTimeline();
          },
        }),
      ),
      playhead,
    );
    keyTime.disabled = selKey === null;
    keyTime.value = selKey === null ? "" : String(a.keyframes[selKey].t);
    renderPlayhead();
    renderJoints();
    renderControls();
  }
  const playBtn = h("button", { class: "btn small" });
  function renderControls() {
    playBtn.textContent = playing ? "⏸ Pauza" : "▶ Odtwórz";
  }
  playBtn.addEventListener("click", () => {
    playing = !playing;
    if (playing) {
      selKey = null;
      if (time >= a.duration) time = 0;
    }
    renderTimeline();
  });

  // ---------- okno ----------
  const overlay = h("div", { class: "script-editor anim-editor" });
  const close = async (save: boolean) => {
    if (save) {
      if (a.keyframes.length === 0) return toast("Dodaj co najmniej jedną klatkę", "error");
      onSave(a);
    } else if (dirty && !(await ask("Zamknąć bez zapisywania animacji?", "Zamknij", "Wróć", true))) return;
    engine.stopRenderLoop();
    scene.dispose();
    dispose();
    overlay.remove();
  };
  overlay.append(
    h(
      "div",
      { class: "script-top" },
      h("span", { class: "badge" }, "Animacja"),
      name,
      h("label", { class: "top-check", title: "Długość animacji w sekundach" }, h("span", null, "Długość"), duration, h("span", null, "s")),
      check("Pętla", () => a.loop, (v) => (a.loop = v), "Animacja powtarza się w kółko"),
      check("Płynnie", () => a.smooth, (v) => (a.smooth = v), "Łagodne przejścia między klatkami"),
      check("Emotka", () => a.emote, (v) => (a.emote = v), "Gracze mogą ją włączyć z menu 😀 w grze"),
      h("div", { class: "spacer" }),
      h("button", { class: "btn", onClick: () => close(false) }, "Anuluj"),
      h("button", { class: "btn primary", onClick: () => close(true) }, "✔ Gotowe"),
    ),
    h(
      "div",
      { class: "script-body" },
      h(
        "div",
        { class: "char-preview" },
        canvas,
        h("div", { class: "char-anim" }, charSel, h("span", { class: "muted" }, "Kliknij część ciała, żeby ją wybrać")),
      ),
      h("div", { class: "char-panel" }, h("h3", null, "Staw"), jointList, sliders),
    ),
    h(
      "div",
      { class: "timeline" },
      h(
        "div",
        { class: "tl-controls" },
        playBtn,
        h("button", { class: "btn small", onClick: () => ((time = 0), (playing = false), (selKey = a.keyframes.findIndex((k) => k.t === 0)), selKey < 0 && (selKey = null), renderTimeline()) }, "⏮"),
        h(
          "button",
          {
            class: "btn small primary",
            onClick: () => {
              if (a.keyframes.some((k) => Math.abs(k.t - time) < 0.001)) return toast("Tu już jest klatka", "info");
              editPose(() => {});
              renderTimeline();
            },
          },
          "+ Klatka",
        ),
        h(
          "button",
          {
            class: "btn small",
            onClick: () => {
              if (selKey === null) return toast("Wybierz klatkę na osi czasu", "info");
              a.keyframes.splice(selKey, 1);
              selKey = null;
              dirty = true;
              renderTimeline();
            },
          },
          "🗑 Usuń klatkę",
        ),
        h("button", { class: "btn small", onClick: () => ((clipboard = clonePose(currentPose())), toast("Skopiowano pozę", "good")) }, "Kopiuj pozę"),
        h(
          "button",
          {
            class: "btn small",
            onClick: () => {
              if (!clipboard) return toast("Najpierw skopiuj pozę", "info");
              const c = clonePose(clipboard);
              editPose((p) => ((p.joints = c.joints), (p.y = c.y)));
              renderTimeline();
            },
          },
          "Wklej pozę",
        ),
        h("label", { class: "top-check" }, h("span", null, "Czas klatki"), keyTime),
        timeLabel,
      ),
      track,
    ),
  );
  document.body.append(overlay);
  engine.resize();
  renderTimeline();
}
