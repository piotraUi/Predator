// Okno "Współpraca" w Studiu (3D i 2D): kto może edytować grę, dodawanie i usuwanie współtwórców.
import { api } from "../api.ts";
import { session } from "../state.ts";
import { h, modal, toast } from "../ui/dom.ts";

export function openEditorsDialog(worldId: number, owner: boolean, exitScreen: () => void, how: string) {
  const body = h("div", { class: "form" }, h("div", { class: "muted" }, "Ładowanie…"));
  const close = modal("👥 Współpraca w Studiu", body);
  const draw = async () => {
    try {
      const r = await api.worldEditors(worldId);
      const input = h("input", { placeholder: "Nick znajomego" });
      body.replaceChildren(
        h("p", { class: "muted", style: "margin:0;font-size:13px" }, `Współtwórcy edytują grę razem z tobą na żywo - widzisz ich jako ${how}. Zmiany zapisują się same co kilka sekund.`),
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
                  owner || e.id === session.user?.id
                    ? h(
                        "button",
                        {
                          class: "btn small danger",
                          onClick: async () => {
                            await api.removeWorldEditor(worldId, e.id).catch((x: Error) => toast(x.message, "error"));
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
        owner
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
                      await api.addWorldEditor(worldId, input.value.trim());
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
        owner ? h("p", { class: "hint" }, "Dodać można tylko znajomego. Publikować grę może tylko twórca.") : "",
      );
    } catch (x) {
      body.replaceChildren(h("div", { class: "form-error" }, (x as Error).message));
    }
  };
  draw();
}
