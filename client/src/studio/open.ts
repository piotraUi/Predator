// Otwiera Studio 2D albo 3D - zależnie od gry (edytor 2D nie wczytuje silnika 3D).
import type { WorldData, WorldInfo } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { h, toast } from "../ui/dom.ts";
import type { StudioFile } from "./studio.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

export function studioOpenScreen(root: HTMLElement, params: { worldId?: number; file?: StudioFile }, go: Go) {
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Wczytywanie Studia…");
  root.append(loading);
  let disposed = false;
  let inner: (() => void) | null = null;
  const mount = async (mode: WorldData["mode"], loaded?: { info: WorldInfo; data: WorldData }) => {
    try {
      const screen =
        mode === "html"
          ? (await import("../studioHtml/studioHtml.ts")).studioHtmlScreen
          : mode === "2d"
            ? (await import("../studio2d/studio2d.ts")).studio2dScreen
            : (await import("./studio.ts")).studioScreen;
      if (disposed) return;
      loading.remove();
      inner = screen(root, { ...params, loaded }, go);
    } catch (e) {
      toast("Nie udało się wczytać Studia: " + (e as Error).message, "error");
      go("home", { tab: "create" });
    }
  };
  if (params.file) mount(params.file.data.mode);
  else
    api
      .getWorld(params.worldId!)
      .then((r) => {
        if (!disposed) mount(r.data.mode, r);
      })
      .catch((e) => {
        toast(e.message, "error");
        go(params.worldId ? "home" : "offline", { tab: "create" });
      });
  return () => {
    disposed = true;
    inner?.();
    loading.remove();
  };
}
