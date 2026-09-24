// Edytor awatara z podglądem 3D - osobny moduł, żeby menu nie musiało wczytywać Babylona.
import { ArcRotateCamera, Color4, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import { ITEM_TYPES, RARITY_LABELS, type CatalogItem, type ItemType, type WearType } from "../../../shared/catalog.ts";
import type { Emote } from "../../../shared/types.ts";
import { drawLeg, drawShirtFront } from "../engine/clothes.ts";
import { headshot } from "./headshot.ts";
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
  // podgląd emotki przez kilka sekund
  let previewUntil = 0;
  const previewEmote = (e: string) => {
    model.anim = e as Emote;
    previewUntil = performance.now() + 3500;
  };
  scene.onBeforeRenderObservable.add(() => {
    if (previewUntil && performance.now() > previewUntil) {
      previewUntil = 0;
      model.anim = "idle";
    }
    if (!previewUntil) model.root.rotation.y += engine.getDeltaTime() / 3000;
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
  let tab: ItemType = "hat";
  let showOwned = false;
  const tabs = h("div", { class: "shop-tabs" });
  const thumb = (item: CatalogItem): Node => {
    if (item.type === "hat" || item.type === "face" || item.type === "neck")
      return h("img", { class: "item-thumb", alt: "", src: headshot({ ...user.avatar, ...avatar, shirt: "none", [item.type]: item.id } as Avatar) });
    if (item.cloth) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d")!;
      if (item.type === "shirt") drawShirtFront(x, item.cloth, 0, 0, 64, 64);
      else {
        drawLeg(x, item.cloth, avatar.legs, 6, 0, 24, 64);
        drawLeg(x, item.cloth, avatar.legs, 34, 0, 24, 64);
      }
      c.className = "item-thumb";
      return c;
    }
    return h("span", { class: "item-thumb emoji" }, item.icon);
  };
  const renderShop = (catalog: CatalogItem[]) => {
    const u = session.user!;
    tabs.replaceChildren(
      ...ITEM_TYPES.map((t) => h("button", { class: "shop-tab" + (t.type === tab ? " active" : ""), onClick: () => ((tab = t.type), renderShop(catalog)) }, t.icon + " " + t.label)),
      h("label", { class: "shop-owned" }, h("input", { type: "checkbox", checked: showOwned, onChange: (e: Event) => ((showOwned = (e.target as HTMLInputElement).checked), renderShop(catalog)) }), "Tylko moje"),
    );
    const owns = (i: CatalogItem) => u.inventory.includes(i.id) || (i.price === 0 && !i.offsale);
    const list = catalog
      .filter((i) => i.type === tab && i.id !== "none")
      .filter((i) => (showOwned ? owns(i) : !i.offsale || owns(i)))
      .sort((p, q) => Number(owns(q)) - Number(owns(p)) || Number(!!q.limited) - Number(!!p.limited) || p.price - q.price);
    const card = (item: CatalogItem) => {
      const owned = owns(item);
      const isEmote = item.type === "emote";
      const worn = !isEmote && avatar[item.type as WearType] === item.id;
      const soldOut = !!item.limited && item.stockLeft === 0;
      return h(
        "button",
        {
          class: `item ${worn ? "worn" : ""} ${owned ? "owned" : ""} ${item.rarity ?? "common"}`,
          onClick: async () => {
            if (!owned && soldOut) return toast("Wyprzedane! Ten przedmiot zdobędziesz już tylko przez wymianę ze znajomym.", "error");
            if (!owned) {
              if (u.coins < item.price) return toast("Za mało monet - graj, żeby zdobyć więcej!", "error");
              try {
                session.set((await api.buy(item.id)).user);
                toast(`Kupiono: ${item.name} ${item.icon}`, "good");
              } catch (e) {
                return toast((e as Error).message, "error");
              }
            }
            if (isEmote) {
              previewEmote(item.id);
              if (!owned) api.catalog().then(renderShop, () => renderShop(catalog));
              else renderShop(catalog);
              return;
            }
            const slot = item.type as WearType;
            // kliknięcie założonej rzeczy ją zdejmuje (twarz zostaje)
            avatar[slot] = worn && slot !== "face" ? "none" : item.id;
            save();
            if (item.limited && !owned) api.catalog().then(renderShop, () => renderShop(catalog));
            else renderShop(catalog);
          },
        },
        item.isNew && !owned ? h("span", { class: "item-new" }, "Nowość") : null,
        thumb(item),
        h("div", { class: "item-name" }, item.name),
        item.rarity && item.rarity !== "common" ? h("div", { class: "item-rarity" }, RARITY_LABELS[item.rarity]) : null,
        item.limited
          ? h("div", { class: "item-limited" + (soldOut ? " out" : "") }, soldOut ? "Wyprzedane" : `Limitowany · ${item.stockLeft ?? item.limited}/${item.limited}`)
          : null,
        h(
          "div",
          { class: "item-price" },
          owned ? (isEmote ? "▶ Pokaż" : worn ? "✓ Założone" : "Załóż") : soldOut ? "Tylko wymiana" : [icon("coin", 16), String(item.price)],
        ),
      );
    };
    const slot = tab as WearType;
    const none =
      tab !== "face" && tab !== "emote"
        ? h(
            "button",
            { class: "item " + (avatar[slot] === "none" ? "worn" : ""), onClick: () => ((avatar[slot] = "none"), save(), renderShop(catalog)) },
            h("span", { class: "item-thumb emoji" }, "🚫"),
            h("div", { class: "item-name" }, "Brak"),
            h("div", { class: "item-price" }, avatar[slot] === "none" ? "✓" : "Zdejmij"),
          )
        : "";
    shop.replaceChildren(tabs, h("div", { class: "items" }, none, ...list.map(card)));
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
