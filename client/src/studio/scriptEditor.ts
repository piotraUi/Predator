// Okno edycji skryptu: Lua (tekst) albo bloczki.
import type { WorldScript } from "../../../shared/types.ts";
import { ask, h, toast } from "../ui/dom.ts";

export { LUA_HELP, LUA_HELP_2D } from "../../../shared/luaHelp.ts";
import { LUA_HELP } from "../../../shared/luaHelp.ts";

export function openScriptEditor(script: WorldScript, onSave: (s: WorldScript) => void, helpList: [string, string][] = LUA_HELP, mode: "3d" | "2d" = "3d") {
  const nameInput = h("input", { class: "script-name", value: script.name, maxLength: 40 });
  let dirty = false;
  const markDirty = () => (dirty = true);
  nameInput.addEventListener("input", markDirty);

  const body = h("div", { class: "script-body" });
  const overlay = h("div", { class: "script-editor" });
  let getResult: () => WorldScript;
  let cleanup = () => {};

  const close = async (save: boolean) => {
    if (save) onSave(getResult());
    else if (dirty && !(await ask("Masz niezapisane zmiany w skrypcie. Zamknąć bez zapisywania?", "Zamknij", "Wróć", true))) return;
    cleanup();
    overlay.remove();
    window.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      close(true);
    }
  };
  window.addEventListener("keydown", onKey, true);

  overlay.append(
    h(
      "div",
      { class: "script-top" },
      h("span", { class: "badge" }, script.type === "lua" ? "Lua" : "Bloczki"),
      nameInput,
      h("div", { class: "spacer" }),
      h("button", { class: "btn", onClick: () => close(false) }, "Anuluj"),
      h("button", { class: "btn primary", onClick: () => close(true) }, "✔ Gotowe"),
    ),
    body,
  );
  document.body.append(overlay);

  if (script.type === "lua") {
    const area = h("textarea", { class: "code", spellcheck: false, value: script.source });
    area.addEventListener("input", markDirty);
    area.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = area.selectionStart;
        area.setRangeText("  ", s, area.selectionEnd, "end");
        markDirty();
      }
    });
    const help = h(
      "div",
      { class: "help" },
      h("h3", null, "Co można użyć"),
      h("p", { class: "muted" }, "Kliknij, żeby wstawić do kodu. Klocki wskazujesz po nazwie z panelu Właściwości."),
      helpList.map(([code, desc]) =>
        h(
          "button",
          {
            class: "help-item",
            onClick: () => {
              area.setRangeText(code, area.selectionStart, area.selectionEnd, "end");
              area.focus();
              markDirty();
            },
          },
          h("code", null, code),
          h("span", null, desc),
        ),
      ),
    );
    body.append(area, help);
    area.focus();
    getResult = () => ({ ...script, name: nameInput.value.trim() || script.name, source: area.value });
  } else {
    const wsDiv = h("div", { class: "blockly" });
    const preview = h("pre", { class: "lua-preview hidden" });
    const toggle = h(
      "button",
      { class: "btn small preview-toggle", onClick: () => preview.classList.toggle("hidden") },
      "Pokaż kod Lua",
    );
    body.append(wsDiv, preview, toggle);
    const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Ładowanie bloczków…");
    wsDiv.append(loading);
    let editor: import("./blocks.ts").BlocksEditor | null = null;
    getResult = () =>
      editor
        ? { ...script, name: nameInput.value.trim() || script.name, blocks: editor.getState(), source: editor.getLua() }
        : { ...script, name: nameInput.value.trim() || script.name };
    import("./blocks.ts")
      .then(({ createBlocksEditor }) => {
        loading.remove();
        editor = createBlocksEditor(wsDiv, script.blocks, mode);
        const upd = () => (preview.textContent = editor!.getLua());
        upd();
        editor.onChange(() => {
          markDirty();
          upd();
        });
        const onResize = () => editor?.resize();
        window.addEventListener("resize", onResize);
        cleanup = () => {
          window.removeEventListener("resize", onResize);
          editor?.dispose();
        };
      })
      .catch((e) => toast("Nie udało się wczytać bloczków: " + e.message, "error"));
  }
}
