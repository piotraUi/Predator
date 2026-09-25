// Zestaw gotowych obiektów do gier 2D (jak Zestaw w Studio 3D): jeden klik = obiekt z obrazkiem
// i zachowaniem (zbieranie, zabija, drabina, meta...). Obrazki to mały pixel art w SVG.
import type { Asset2D, Obj2D } from "../../../shared/types2d.ts";
import { newId2d } from "../../../shared/world2d.ts";

export interface Kit2D {
  name: string;
  icon: string;
  cat: string;
  make(): { assets: Asset2D[]; obj: Obj2D };
}

const svg = (w: number, h: number, body: string) =>
  "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`);
const asset = (name: string, w: number, h: number, body: string): Asset2D => ({ id: newId2d(), name, type: "image", data: svg(w, h, body), w, h, pixel: true });
const rect = (x: number, y: number, w: number, h: number, c: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;

/** obiekt z jedną lub kilkoma klatkami */
function obj(name: string, kind: Obj2D["kind"], frames: Asset2D[], w: number, h: number, extra: Partial<Obj2D> = {}, frameTime = 0.2): { assets: Asset2D[]; obj: Obj2D } {
  return {
    assets: frames,
    obj: {
      id: newId2d(), name, kind, anims: [{ name: kind === "tiled" ? "Obraz" : "Idle", frames: frames.map((f) => f.id), frameTime, loop: true }],
      w, h, hitbox: [0, 0, 1, 1], solid: "none", role: "none", ...extra,
    },
  };
}

export const KIT_CATS = ["Świat", "Do zebrania", "Niebezpieczne", "Gra", "Napisy i światło"];

export const KIT_2D: Kit2D[] = [
  // ---------- świat ----------
  {
    name: "Ziemia z trawą", icon: "🟫", cat: "Świat",
    make: () => obj("Ziemia", "tiled", [asset("ziemia", 32, 32, rect(0, 0, 32, 32, "#8b5a2b") + rect(0, 0, 32, 7, "#4caf50") + rect(0, 7, 32, 2, "#357a38") + rect(6, 16, 4, 4, "#7a4a20") + rect(20, 22, 4, 4, "#7a4a20") + rect(14, 12, 3, 3, "#a06a36"))], 320, 32, { solid: "solid" }),
  },
  {
    name: "Kamień", icon: "🪨", cat: "Świat",
    make: () => obj("Kamień", "tiled", [asset("kamien", 32, 32, rect(0, 0, 32, 32, "#7d7d85") + rect(0, 0, 16, 16, "#8a8a92") + rect(16, 16, 16, 16, "#8a8a92") + rect(0, 15, 32, 2, "#5f5f66") + rect(15, 0, 2, 32, "#5f5f66") + rect(4, 4, 3, 2, "#a3a3ab") + rect(22, 20, 3, 2, "#a3a3ab"))], 128, 32, { solid: "solid" }),
  },
  {
    name: "Platforma (przeskakujesz od dołu)", icon: "🪵", cat: "Świat",
    make: () => obj("Platforma", "tiled", [asset("platforma", 32, 12, rect(0, 0, 32, 12, "#a0672e") + rect(0, 0, 32, 3, "#c98a45") + rect(0, 10, 32, 2, "#6e4520") + rect(15, 3, 2, 7, "#6e4520"))], 96, 12, { solid: "jumpthru" }),
  },
  {
    name: "Lód", icon: "🧊", cat: "Świat",
    make: () => obj("Lód", "tiled", [asset("lod", 32, 16, rect(0, 0, 32, 16, "#a8e4ff") + rect(0, 0, 32, 3, "#e3f7ff") + rect(5, 6, 8, 2, "#ffffff") + rect(20, 10, 6, 2, "#ffffff"))], 128, 16, { solid: "solid" }),
  },
  {
    name: "Skrzynia", icon: "📦", cat: "Świat",
    make: () => obj("Skrzynia", "sprite", [asset("skrzynia", 16, 16, rect(0, 0, 16, 16, "#b07a3c") + rect(0, 0, 16, 2, "#6e4520") + rect(0, 14, 16, 2, "#6e4520") + rect(0, 0, 2, 16, "#6e4520") + rect(14, 0, 2, 16, "#6e4520") + `<path d="M2 3 L13 14 M3 2 L14 13" stroke="#6e4520" stroke-width="2"/>`)], 32, 32, { solid: "solid" }),
  },
  {
    name: "Drabina", icon: "🪜", cat: "Świat",
    make: () => obj("Drabina", "tiled", [asset("drabina", 16, 16, rect(1, 0, 3, 16, "#8b5a2b") + rect(12, 0, 3, 16, "#8b5a2b") + rect(1, 3, 14, 2, "#c98a45") + rect(1, 11, 14, 2, "#c98a45"))], 32, 128, { solid: "ladder" }),
  },
  {
    name: "Chmurka (przenikalna)", icon: "☁️", cat: "Świat",
    make: () => obj("Chmurka", "sprite", [asset("chmurka", 32, 12, rect(4, 4, 24, 8, "#ffffff") + rect(8, 1, 10, 4, "#ffffff") + rect(18, 2, 8, 3, "#ffffff") + rect(4, 10, 24, 2, "#d7e6f5"))], 96, 36, { solid: "jumpthru", hitbox: [0, 0, 1, 0.5] }),
  },
  // ---------- do zebrania ----------
  {
    name: "Moneta", icon: "🪙", cat: "Do zebrania",
    make: () => obj("Moneta", "sprite", [
      asset("moneta1", 12, 12, rect(3, 0, 6, 12, "#f5b400") + rect(1, 2, 10, 8, "#f5b400") + rect(5, 2, 2, 8, "#ffe27a")),
      asset("moneta2", 12, 12, rect(4, 0, 4, 12, "#f5b400") + rect(3, 2, 6, 8, "#f5b400") + rect(5, 2, 2, 8, "#ffe27a")),
      asset("moneta3", 12, 12, rect(5, 0, 2, 12, "#d99a00")),
      asset("moneta4", 12, 12, rect(4, 0, 4, 12, "#f5b400") + rect(3, 2, 6, 8, "#f5b400") + rect(6, 2, 1, 8, "#ffe27a")),
    ], 16, 16, { role: "pickup", coin: true, perPlayer: true }, 0.12),
  },
  {
    name: "Diament", icon: "💎", cat: "Do zebrania",
    make: () => obj("Diament", "sprite", [asset("diament", 12, 12, `<path d="M2 4 L4 1 L8 1 L10 4 L6 11 Z" fill="#29adff"/><path d="M4 1 L6 4 L8 1 M2 4 L10 4" stroke="#b9ecff" stroke-width="1" fill="none"/>`)], 20, 20, { role: "pickup", coin: true, perPlayer: true }),
  },
  {
    name: "Serce", icon: "❤️", cat: "Do zebrania",
    make: () => obj("Serce", "sprite", [asset("serce", 12, 11, rect(1, 1, 4, 3, "#ff004d") + rect(7, 1, 4, 3, "#ff004d") + rect(0, 2, 12, 4, "#ff004d") + rect(1, 6, 10, 2, "#ff004d") + rect(3, 8, 6, 2, "#ff004d") + rect(5, 10, 2, 1, "#ff004d") + rect(2, 2, 2, 2, "#ff9fb9"))], 20, 18, { role: "pickup", perPlayer: true }),
  },
  {
    name: "Klucz", icon: "🔑", cat: "Do zebrania",
    make: () => obj("Klucz", "sprite", [asset("klucz", 14, 8, rect(0, 1, 6, 6, "#ffd000") + rect(2, 3, 2, 2, "#00000000") + rect(6, 3, 8, 2, "#ffd000") + rect(10, 5, 2, 3, "#ffd000") + rect(13, 5, 1, 2, "#ffd000"))], 28, 16, { role: "pickup" }),
  },
  // ---------- niebezpieczne ----------
  {
    name: "Kolce", icon: "🔺", cat: "Niebezpieczne",
    make: () => obj("Kolce", "sprite", [asset("kolce", 16, 8, `<path d="M0 8 L2 1 L4 8 L6 1 L8 8 L10 1 L12 8 L14 1 L16 8Z" fill="#9aa3ad"/><path d="M2 1 L2 5 M6 1 L6 5 M10 1 L10 5 M14 1 L14 5" stroke="#d6dde3" stroke-width="1"/>`)], 32, 16, { role: "hazard", hitbox: [0, 0.4, 1, 0.6] }),
  },
  {
    name: "Lawa", icon: "🌋", cat: "Niebezpieczne",
    make: () => obj("Lawa", "tiled", [
      asset("lawa1", 16, 16, rect(0, 0, 16, 16, "#e63900") + rect(0, 0, 16, 3, "#ff8a00") + rect(3, 6, 3, 2, "#ffd000") + rect(10, 10, 3, 2, "#ffd000")),
    ], 128, 32, { role: "hazard", hitbox: [0, 0.2, 1, 0.8] }),
  },
  {
    name: "Potwór (chodzi w kółko)", icon: "👾", cat: "Niebezpieczne",
    make: () => {
      const body = (legs: string) => rect(2, 2, 12, 10, "#8e24aa") + rect(4, 0, 2, 3, "#8e24aa") + rect(10, 0, 2, 3, "#8e24aa") + rect(4, 4, 3, 3, "#ffffff") + rect(9, 4, 3, 3, "#ffffff") + rect(5, 5, 1, 1, "#000") + rect(10, 5, 1, 1, "#000") + rect(5, 9, 6, 1, "#4a0f5c") + legs;
      return obj("Potwór", "sprite", [
        asset("potwor1", 16, 16, body(rect(3, 12, 3, 4, "#6a1b9a") + rect(10, 12, 3, 4, "#6a1b9a"))),
        asset("potwor2", 16, 16, body(rect(1, 12, 3, 4, "#6a1b9a") + rect(12, 12, 3, 4, "#6a1b9a"))),
      ], 32, 32, { role: "enemy", speed: 80, jump: 350, hitbox: [0.1, 0.1, 0.8, 0.9] }, 0.25);
    },
  },
  {
    name: "Piła", icon: "⚙️", cat: "Niebezpieczne",
    make: () => obj("Piła", "sprite", [
      asset("pila1", 16, 16, `<circle cx="8" cy="8" r="6" fill="#b0b8c0"/><circle cx="8" cy="8" r="2" fill="#555"/><path d="M8 0 L10 3 L6 3Z M16 8 L13 10 L13 6Z M8 16 L6 13 L10 13Z M0 8 L3 6 L3 10Z" fill="#b0b8c0"/>`),
      asset("pila2", 16, 16, `<circle cx="8" cy="8" r="6" fill="#b0b8c0"/><circle cx="8" cy="8" r="2" fill="#555"/><path d="M14 2 L13 6 L10 3Z M14 14 L10 13 L13 10Z M2 14 L3 10 L6 13Z M2 2 L6 3 L3 6Z" fill="#b0b8c0"/>`),
    ], 32, 32, { role: "hazard", hitbox: [0.15, 0.15, 0.7, 0.7] }, 0.06),
  },
  // ---------- gra ----------
  {
    name: "Start graczy", icon: "🚩", cat: "Gra",
    make: () => obj("Start", "sprite", [], 32, 48, { role: "spawn", hidden: true }),
  },
  {
    name: "Checkpoint", icon: "🏁", cat: "Gra",
    make: () => obj("Checkpoint", "sprite", [asset("checkpoint", 12, 24, rect(1, 0, 2, 24, "#555") + rect(3, 1, 8, 6, "#2ecc71") + rect(3, 1, 4, 3, "#27ae60") + rect(7, 4, 4, 3, "#27ae60"))], 24, 48, { role: "checkpoint" }),
  },
  {
    name: "Meta (następny poziom)", icon: "🏆", cat: "Gra",
    make: () => obj("Meta", "sprite", [asset("meta", 16, 32, rect(2, 0, 2, 32, "#555") + `<path d="M4 2 L15 7 L4 12Z" fill="#e63946"/>`)], 16, 32, { role: "goal" }),
  },
  {
    name: "Trampolina / strefa skoku", icon: "🦘", cat: "Gra",
    make: () => obj("Trampolina", "sprite", [asset("trampolina", 16, 8, rect(0, 0, 16, 3, "#e63946") + rect(2, 3, 2, 5, "#555") + rect(12, 3, 2, 5, "#555") + `<path d="M4 5 L7 3 L9 5 L12 3" stroke="#aaa" fill="none"/>`)], 32, 16, { role: "jumpzone" }),
  },
  {
    name: "Przycisk (otwiera bramę)", icon: "🔘", cat: "Gra",
    make: () => obj("Przycisk", "sprite", [asset("przycisk", 16, 8, rect(0, 5, 16, 3, "#555") + rect(3, 1, 10, 4, "#e63946") + rect(4, 1, 5, 1, "#ff8a8a"))], 32, 16, { role: "button" }),
  },
  {
    name: "Brama", icon: "🚧", cat: "Gra",
    make: () => {
      const closed = asset("brama", 16, 32, rect(0, 0, 16, 32, "#4a4f5c") + rect(2, 0, 2, 32, "#8a8f9c") + rect(7, 0, 2, 32, "#8a8f9c") + rect(12, 0, 2, 32, "#8a8f9c") + rect(0, 14, 16, 3, "#ffd000"));
      const open = asset("brama-otwarta", 16, 32, rect(0, 28, 16, 4, "#4a4f5c"));
      const r = obj("Brama", "sprite", [closed], 32, 64, { role: "gate", solid: "solid" });
      r.assets.push(open);
      r.obj.anims = [
        { name: "Zamknięta", frames: [closed.id], frameTime: 1, loop: false },
        { name: "Otwarta", frames: [open.id], frameTime: 1, loop: false },
      ];
      return r;
    },
  },
  {
    name: "Niewidzialna strefa (do skryptów)", icon: "▢", cat: "Gra",
    make: () => obj("Strefa", "sprite", [], 64, 64, { hidden: true }),
  },
  // ---------- napisy i światło ----------
  {
    name: "Licznik monet", icon: "🔢", cat: "Napisy i światło",
    make: () => obj("Licznik monet", "text", [], 300, 30, { text: "Monety: {coins}", color: "#ffffff", fontSize: 28 }),
  },
  {
    name: "Zegar", icon: "⏱️", cat: "Napisy i światło",
    make: () => obj("Zegar", "text", [], 200, 30, { text: "Czas: {time}", color: "#ffffff", fontSize: 28 }),
  },
  {
    name: "Napis", icon: "🔤", cat: "Napisy i światło",
    make: () => obj("Napis", "text", [], 240, 30, { text: "Witaj w mojej grze!", color: "#ffffff", fontSize: 24 }),
  },
  {
    name: "Światło (na noc)", icon: "💡", cat: "Napisy i światło",
    make: () => obj("Światło", "light", [], 32, 32, { radius: 120, color: "#fff2c0" }),
  },
];
