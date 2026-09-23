// Edytor postaci: kolory, twarz, czapka, skala, dodatki doczepione do części ciała i zaimportowany model 3D.
import { ArcRotateCamera, Color4, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import { JOINT_LABELS } from "../../../shared/anim.ts";
import { CATALOG, DEFAULT_AVATAR } from "../../../shared/catalog.ts";
import { CHAR_EXT, fileNameFor, makeCharacterFile } from "../../../shared/gamefile.ts";
import type { Accessory, AnimDef, CharacterDef, Joint, PartShape } from "../../../shared/types.ts";
import { JOINTS } from "../../../shared/types.ts";
import { MAX_ACCESSORIES, MAX_MODEL_CHARS, newId } from "../../../shared/world.ts";
import { AvatarModel } from "../engine/avatar.ts";
import { createEngine } from "../engine/world.ts";
import { pickDataUrl, saveTextFile } from "../files.ts";
import { ask, h, toast } from "../ui/dom.ts";

const SHAPES: [PartShape, string][] = [["box", "Klocek"], ["sphere", "Kula"], ["cylinder", "Walec"], ["wedge", "Klin"]];

export function openCharacterEditor(
  original: CharacterDef,
  animations: AnimDef[],
  onSave: (c: CharacterDef) => void,
  opts: { fitModel?: boolean } = {},
) {
  const c: CharacterDef = structuredClone(original);
  let dirty = false;

  // ---------- podgląd 3D ----------
  const canvas = h("canvas", { class: "char-canvas" });
  const { engine, dispose } = createEngine(canvas);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.12, 0.13, 0.16, 1);
  const cam = new ArcRotateCamera("c", -Math.PI / 2, 1.3, 16, new Vector3(0, 2.8, 0), scene);
  cam.attachControl(true);
  cam.lowerRadiusLimit = 4;
  cam.upperRadiusLimit = 60;
  cam.wheelDeltaPercentage = 0.05;
  new HemisphericLight("l", new Vector3(0.3, 1, -0.6), scene).intensity = 1.1;
  const model = new AvatarModel(scene, DEFAULT_AVATAR);
  engine.runRenderLoop(() => {
    model.update(engine.getDeltaTime() / 1000);
    scene.render();
  });
  const refresh = () => {
    dirty = true;
    model.setLook(DEFAULT_AVATAR, c);
  };

  // ---------- pola ----------
  const name = h("input", { class: "script-name", value: c.name, maxLength: 30 });
  name.addEventListener("input", () => ((c.name = name.value.trim() || "Postać"), (dirty = true)));

  const colorField = (key: "head" | "torso" | "arms" | "legs", label: string) => {
    const inp = h("input", { type: "color", value: c.look[key] });
    inp.addEventListener("input", () => {
      c.look[key] = inp.value;
      refresh();
    });
    return h("label", { class: "prop" }, h("span", null, label), inp);
  };
  const itemSelect = (type: "hat" | "face") => {
    const sel = h(
      "select",
      null,
      CATALOG.filter((i) => i.type === type).map((i) => h("option", { value: i.id, selected: c.look[type] === i.id }, i.name)),
    );
    sel.addEventListener("change", () => {
      c.look[type] = sel.value;
      refresh();
    });
    return sel;
  };
  const scale = h("input", { type: "range", min: "0.3", max: "3", step: "0.05", value: String(c.scale) });
  const scaleVal = h("b", null, c.scale.toFixed(2) + "×");
  scale.addEventListener("input", () => {
    c.scale = Number(scale.value);
    scaleVal.textContent = c.scale.toFixed(2) + "×";
    refresh();
  });

  // ---------- dodatki ----------
  const accList = h("div", { class: "acc-list" });
  const num = (value: number, step: number, onSet: (v: number) => void) => {
    const inp = h("input", { type: "number", step: String(step), value: String(value) });
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (Number.isFinite(v)) {
        onSet(v);
        refresh();
      }
    });
    return inp;
  };
  const renderAcc = () => {
    accList.replaceChildren(
      ...c.accessories.map((a, i) => {
        const joint = h(
          "select",
          null,
          JOINTS.map((j) => h("option", { value: j, selected: a.joint === j }, JOINT_LABELS[j])),
        );
        joint.addEventListener("change", () => ((a.joint = joint.value as Joint), refresh()));
        const shape = h("select", null, SHAPES.map(([v, l]) => h("option", { value: v, selected: a.shape === v }, l)));
        shape.addEventListener("change", () => ((a.shape = shape.value as PartShape), refresh()));
        const col = h("input", { type: "color", value: a.color });
        col.addEventListener("input", () => ((a.color = col.value), refresh()));
        const neon = h("input", { type: "checkbox", checked: a.material === "neon" });
        neon.addEventListener("change", () => ((a.material = neon.checked ? "neon" : "plastic"), refresh()));
        return h(
          "div",
          { class: "acc" },
          h(
            "div",
            { class: "row between" },
            h("b", null, `Dodatek ${i + 1}`),
            h(
              "button",
              { class: "icon-btn", title: "Usuń", onClick: () => (c.accessories.splice(i, 1), renderAcc(), refresh()) },
              "🗑",
            ),
          ),
          h("div", { class: "xyz2" }, h("label", { class: "prop" }, h("span", null, "Część ciała"), joint), h("label", { class: "prop" }, h("span", null, "Kształt"), shape)),
          h("div", { class: "xyz2" }, h("label", { class: "prop" }, h("span", null, "Kolor"), col), h("label", { class: "prop check" }, neon, h("span", null, "Świeci"))),
          h("div", { class: "prop-group" }, "Pozycja"),
          h("div", { class: "xyz" }, num(a.x, 0.1, (v) => (a.x = v)), num(a.y, 0.1, (v) => (a.y = v)), num(a.z, 0.1, (v) => (a.z = v))),
          h("div", { class: "prop-group" }, "Rozmiar"),
          h("div", { class: "xyz" }, num(a.sx, 0.1, (v) => (a.sx = Math.max(0.05, v))), num(a.sy, 0.1, (v) => (a.sy = Math.max(0.05, v))), num(a.sz, 0.1, (v) => (a.sz = Math.max(0.05, v)))),
          h("div", { class: "prop-group" }, "Obrót (stopnie)"),
          h("div", { class: "xyz" }, num(a.rx, 5, (v) => (a.rx = v)), num(a.ry, 5, (v) => (a.ry = v)), num(a.rz, 5, (v) => (a.rz = v))),
        );
      }),
    );
  };
  const addAcc = () => {
    if (c.accessories.length >= MAX_ACCESSORIES) return toast(`Maksymalnie ${MAX_ACCESSORIES} dodatków`, "error");
    const a: Accessory = {
      id: newId(), joint: "head", shape: "box", color: "#e63946", material: "plastic",
      x: 0, y: 0.9, z: 0, sx: 1.4, sy: 0.4, sz: 1.4, rx: 0, ry: 0, rz: 0,
    };
    c.accessories.push(a);
    renderAcc();
    refresh();
  };

  // ---------- model 3D ----------
  const modelBox = h("div", { class: "model-box" });
  const renderModel = () => {
    const m = c.model;
    if (!m) {
      modelBox.replaceChildren(
        h("p", { class: "muted", style: "font-size:13px;margin:0 0 8px" }, "Możesz zaimportować model postaci z pliku .glb (np. z Blendera, Sketchfaba albo Mixamo). Animacje z pliku (idle / walk) zagrają same."),
        h("button", { class: "btn small", onClick: importModel }, "📥 Importuj model .glb"),
      );
      return;
    }
    const hide = h("input", { type: "checkbox", checked: m.hideBody });
    hide.addEventListener("change", () => ((m.hideBody = hide.checked), refresh()));
    modelBox.replaceChildren(
      h("div", { class: "row" }, h("span", null, "✅ Model wczytany"), h("span", { class: "muted" }, `(${Math.round(m.data.length / 1365)} KB)`)),
      h("label", { class: "prop check" }, hide, h("span", null, "Ukryj klockowe ciało")),
      h("div", { class: "prop-group" }, "Skala / wysokość (y) / obrót"),
      h("div", { class: "xyz" }, num(m.scale, 0.01, (v) => (m.scale = Math.max(0.001, v))), num(m.y, 0.1, (v) => (m.y = v)), num(m.ry, 15, (v) => (m.ry = v))),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn small", onClick: fit }, "📏 Dopasuj rozmiar"),
        h("button", { class: "btn small", onClick: importModel }, "Zmień plik"),
        h("button", { class: "btn small danger", onClick: () => ((c.model = undefined), renderModel(), refresh()) }, "Usuń model"),
      ),
      model.modelAnimations.length
        ? h("p", { class: "muted", style: "font-size:12px" }, "Animacje w pliku: " + model.modelAnimations.join(", "))
        : "",
    );
  };
  async function importModel() {
    const f = await pickDataUrl([".glb", ".gltf"]);
    if (!f) return;
    let data = f.dataUrl;
    // przeglądarki różnie nazywają typ pliku .glb - ujednolicamy
    data = data.replace(/^data:[^;]*;base64,/, f.name.toLowerCase().endsWith(".gltf") ? "data:model/gltf+json;base64," : "data:model/gltf-binary;base64,");
    if (data.length > MAX_MODEL_CHARS) return toast(`Model jest za duży (maks. ok. ${Math.round(MAX_MODEL_CHARS / 1365 / 1024)} MB)`, "error");
    c.model = { data, scale: 1, x: 0, y: 0, z: 0, ry: 0, hideBody: true };
    if (c.name === "Postać" || c.name === "Nowa postać") {
      c.name = f.name.replace(/\.(glb|gltf)$/i, "").slice(0, 30);
      name.value = c.name;
    }
    refresh();
    await model.modelReady;
    fit();
  }
  async function fit() {
    await model.modelReady;
    const r = model.fitModel();
    if (!r || !c.model) return toast("Nie udało się zmierzyć modelu", "error");
    c.model.scale = Math.round(r.scale * 1000) / 1000;
    c.model.y = Math.round(r.y * 100) / 100;
    refresh();
    renderModel();
  }

  // ---------- podgląd animacji ----------
  const animSel = h(
    "select",
    null,
    h("option", { value: "" }, "— bez animacji —"),
    animations.map((a) => h("option", { value: a.id }, a.name)),
  );
  animSel.addEventListener("change", () => model.playCustom(animations.find((a) => a.id === animSel.value) ?? null));

  // ---------- okno ----------
  const overlay = h("div", { class: "script-editor" });
  const close = async (save: boolean) => {
    if (save) onSave(c);
    else if (dirty && !(await ask("Zamknąć bez zapisywania zmian w postaci?", "Zamknij", "Wróć", true))) return;
    engine.stopRenderLoop();
    scene.dispose();
    dispose();
    overlay.remove();
  };
  overlay.append(
    h(
      "div",
      { class: "script-top" },
      h("span", { class: "badge" }, "Postać"),
      name,
      h("div", { class: "spacer" }),
      h(
        "button",
        { class: "btn", title: "Zapisz postać do pliku, żeby użyć jej w innej grze", onClick: () => saveTextFile(fileNameFor(c.name, CHAR_EXT), makeCharacterFile(c), CHAR_EXT) },
        "💾 " + CHAR_EXT,
      ),
      h("button", { class: "btn", onClick: () => close(false) }, "Anuluj"),
      h("button", { class: "btn primary", onClick: () => close(true) }, "✔ Gotowe"),
    ),
    h(
      "div",
      { class: "script-body" },
      h("div", { class: "char-preview" }, canvas, h("div", { class: "char-anim" }, h("span", null, "Podgląd animacji:"), animSel)),
      h(
        "div",
        { class: "char-panel" },
        h("h3", null, "Kolory"),
        h("div", { class: "xyz2" }, colorField("head", "Głowa"), colorField("torso", "Tułów"), colorField("arms", "Ręce"), colorField("legs", "Nogi")),
        h("div", { class: "xyz2" }, h("label", { class: "prop" }, h("span", null, "Twarz"), itemSelect("face")), h("label", { class: "prop" }, h("span", null, "Czapka"), itemSelect("hat"))),
        h("label", { class: "prop" }, h("span", null, "Skala postaci: ", scaleVal), scale),
        h("h3", null, "Model 3D"),
        modelBox,
        h("div", { class: "row between" }, h("h3", null, "Dodatki"), h("button", { class: "btn small", onClick: addAcc }, "+ Dodatek")),
        accList,
      ),
    ),
  );
  document.body.append(overlay);
  engine.resize();
  model.setLook(DEFAULT_AVATAR, c);
  renderAcc();
  renderModel();
  if (opts.fitModel) model.modelReady.then(() => fit());
  // lista animacji z pliku pojawia się dopiero po wczytaniu modelu
  model.modelReady.then(() => renderModel());
}
