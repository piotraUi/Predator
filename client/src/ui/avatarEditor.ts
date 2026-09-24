// Edytor awatara z podglądem 3D - osobny moduł, żeby menu nie musiało wczytywać Babylona.
import { ArcRotateCamera, Color4, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import type { CatalogItem } from "../../../shared/catalog.ts";
import type { Avatar } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { AvatarModel } from "../engine/avatar.ts";
import { createEngine } from "../engine/world.ts";
import { session } from "../state.ts";
import { h, toast } from "./dom.ts";
import { icon } from "./icons.ts";

const PALETTE = [
  "#f5cd30", "#f8d9b4", "#d6a47a", "#a0694b", "#6b4430", "#3b2418",
  "#ffffff", "#a3a2a5", "#636363", "#1b1b1b", "#c4281c", "#e63946",
  "#ff8c00", "#ffd700", "#a4bd47", "#2ecc71", "#1e8449", "#0d69ac",
  "#3498db", "#6ad2ff", "#8e44ad", "#ff66cc", "#ff9ecf", "#7f5539",
];

export function avatarEditor(el: HTMLElement): () => void {
  const user = session.user!;
  const avatar: Avatar = { ...user.avatar };
  let saveTimer = 0;

  const canvas = h("canvas", { class: "avatar-canvas" });
  const { engine, dispose } = createEngine(canvas);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  const cam = new ArcRotateCamera("c", -Math.PI / 2, 1.35, 13, new Vector3(0, 2.8, 0), scene);
  cam.attachControl(true);
  cam.lowerRadiusLimit = 7;
  cam.upperRadiusLimit = 20;
  cam.panningSensibility = 0;
  new HemisphericLight("l", new Vector3(0.3, 1, -0.6), scene).intensity = 1.1;
  const model = new AvatarModel(scene, avatar);
  scene.onBeforeRenderObservable.add(() => {
    model.root.rotation.y += engine.getDeltaTime() / 3000;
    model.update(engine.getDeltaTime() / 1000);
  });
  engine.runRenderLoop(() => scene.render());

  const save = () => {
    model.setAvatar(avatar);
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      try {
        session.set((await api.saveAvatar(avatar)).user);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }, 400);
  };

  const parts: [keyof Avatar, string][] = [
    ["head", "Głowa"],
    ["torso", "Tułów"],
    ["arms", "Ręce"],
    ["legs", "Nogi"],
  ];
  let partSel: keyof Avatar = "torso";
  const swatches = h("div", { class: "swatches" });
  const partBtns = h("div", { class: "seg" });
  const renderColors = () => {
    partBtns.replaceChildren(
      ...parts.map(([k, label]) =>
        h("button", { class: "seg-btn " + (k === partSel ? "active" : ""), onClick: () => ((partSel = k), renderColors()) }, label),
      ),
    );
    swatches.replaceChildren(
      ...PALETTE.map((c) =>
        h("button", {
          class: "swatch " + (avatar[partSel] === c ? "active" : ""),
          style: `background:${c}`,
          title: c,
          onClick: () => {
            avatar[partSel] = c;
            save();
            renderColors();
          },
        }),
      ),
      h("input", {
        type: "color",
        class: "swatch-picker",
        value: avatar[partSel],
        onInput: (e: Event) => {
          avatar[partSel] = (e.target as HTMLInputElement).value;
          save();
        },
      }),
    );
  };
  renderColors();

  const shop = h("div", { class: "shop" });
  const renderShop = (catalog: CatalogItem[]) => {
    const u = session.user!;
    const section = (type: "hat" | "face", title: string) =>
      h(
        "div",
        null,
        h("h3", null, title),
        h(
          "div",
          { class: "items" },
          catalog
            .filter((i) => i.type === type)
            .map((item) => {
              const owned = u.inventory.includes(item.id);
              const worn = avatar[type] === item.id;
              return h(
                "button",
                {
                  class: "item " + (worn ? "worn" : "") + (owned ? " owned" : ""),
                  onClick: async () => {
                    if (!owned) {
                      if (u.coins < item.price) return toast("Za mało monet - graj, żeby zdobyć więcej!", "error");
                      try {
                        session.set((await api.buy(item.id)).user);
                        toast(`Kupiono: ${item.name}`, "good");
                      } catch (e) {
                        return toast((e as Error).message, "error");
                      }
                    }
                    avatar[type] = item.id;
                    save();
                    renderShop(catalog);
                  },
                },
                h("div", { class: "item-name" }, item.name),
                h("div", { class: "item-price" }, owned ? (worn ? "Założone" : "Załóż") : [icon("coin", 16), String(item.price)]),
              );
            }),
        ),
      );
    shop.replaceChildren(section("hat", "Czapki"), section("face", "Twarze"));
  };
  api.catalog().then(renderShop).catch((e) => toast(e.message, "error"));

  el.append(
    h(
      "div",
      { class: "avatar-layout" },
      h("div", { class: "avatar-preview" }, canvas),
      h("div", { class: "avatar-edit" }, h("h3", null, "Kolory"), partBtns, swatches, shop),
    ),
  );
  engine.resize();
  return () => {
    clearTimeout(saveTimer);
    scene.dispose();
    dispose();
  };
}
