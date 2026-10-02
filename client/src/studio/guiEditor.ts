// Edytor GUI (Studio 2D i 3D): okienka, napisy, przyciski i obrazki na ekranie gracza.
// Podgląd ekranu 16:9 - elementy przeciąga się myszką / palcem, róg zmienia rozmiar.
import { guiTemplate, MAX_GUI_ELEMENTS, MAX_GUI_IMAGE, MAX_GUIS, newGuiId, type GuiActionType, type GuiDef, type GuiEl } from "../../../shared/gui.ts";
import { pickFiles } from "../files.ts";
import { guiScale, renderGuiEl } from "../ui/guiOverlay.ts";
import { ask, h, toast } from "../ui/dom.ts";

export interface GuiEditorOpts {
  /** lista GUI gry (zmieniana w miejscu) */
  guis: GuiDef[];
  /** "2d" - przyciski przenoszą na poziomy, "3d" - do miejsc */
  mode: "2d" | "3d";
  /** gdzie GUI może być widoczne: poziomy 2D albo miejsca 3D [id, nazwa] */
  wheres: [string, string][];
  /** cele przycisków: nazwy poziomów (2D) albo [id, nazwa] miejsc (3D) */
  levels?: string[];
  places?: [string, string][];
  /** coś się zmieniło (zapis gry, współpraca) */
  onChange: () => void;
  onClose?: () => void;
}

const KIND_LABELS: Record<GuiEl["type"], string> = { text: "🔤 Napis", button: "🔘 Przycisk", frame: "▭ Ramka", image: "🖼 Obrazek" };

/** obrazek z dysku jako data URL (zmniejszony, żeby zmieścił się w grze) */
async function pickGuiImage(): Promise<string | null> {
  const [f] = await pickFiles(["image/png", "image/jpeg", "image/gif", "image/webp"], false);
  if (!f) return null;
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const max of [640, 420, 280]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      for (const data of [c.toDataURL("image/png"), c.toDataURL("image/webp", 0.85)]) if (data.length <= MAX_GUI_IMAGE) return data;
    }
    toast("Obrazek jest za duży", "error");
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openGuiEditor(o: GuiEditorOpts) {
  let gui: GuiDef | null = o.guis[0] ?? null;
  let sel: GuiEl | null = null;
  const changed = () => o.onChange();

  const list = h("div", { class: "ge-list" });
  const guiProps = h("div", { class: "ge-guiprops" });
  const stage = h("div", { class: "ge-stage" });
  const stageWrap = h("div", { class: "ge-stage-wrap" }, stage);
  const elProps = h("div", { class: "ge-props" });
  const addBar = h("div", { class: "ge-addbar" });

  const close = () => {
    window.removeEventListener("keydown", onKey, true);
    ro.disconnect();
    root.remove();
    o.onClose?.();
  };
  const root = h(
    "div",
    { class: "gui-editor" },
    h(
      "div",
      { class: "script-top" },
      h("b", null, "🪟 Edytor GUI"),
      h("span", { class: "muted ge-tip" }, "Przeciągnij element, róg zmienia rozmiar. Skrypty: showGui, hideGui, setGuiText, onGuiClick."),
      h("button", { class: "btn primary", style: "margin-left:auto", onClick: close }, "Gotowe"),
    ),
    h("div", { class: "ge-body" }, h("aside", { class: "ge-left" }, list, guiProps), h("div", { class: "ge-center" }, addBar, stageWrap), h("aside", { class: "ge-right" }, elProps)),
  );
  document.body.append(root);

  // skala napisów jak w grze (wzorzec 1280x720)
  const ro = new ResizeObserver(() => fitStage());
  ro.observe(stageWrap);
  function fitStage() {
    const r = stageWrap.getBoundingClientRect();
    const w = Math.max(160, Math.min(r.width - 24, ((r.height - 24) * 16) / 9));
    stage.style.width = w + "px";
    stage.style.height = (w * 9) / 16 + "px";
    stage.style.setProperty("--gs", guiScale(w, (w * 9) / 16) + "px");
  }

  // ---------- lista GUI ----------
  function renderList() {
    list.replaceChildren(
      h("div", { class: "panel-title" }, "GUI w grze", h("span", { class: "panel-actions" }, h("button", { class: "btn small", onClick: newGuiDialog }, "+ Nowe"))),
      ...(o.guis.length
        ? o.guis.map((g) =>
            h(
              "button",
              { class: "tree-item " + (g === gui ? "active" : ""), onClick: () => ((gui = g), (sel = null), renderAll()) },
              h("span", { class: "tree-icon" }, g.modal ? "🪟" : "▭"),
              g.name,
              g.open ? h("span", { class: "tree-kind" }, "od startu") : "",
            ),
          )
        : [h("p", { class: "panel-hint" }, "Nie ma jeszcze GUI. Kliknij „+ Nowe” i wybierz szablon - np. menu z przyciskiem Graj.")]),
    );
  }

  function newGuiDialog() {
    if (o.guis.length >= MAX_GUIS) return toast(`Maksymalnie ${MAX_GUIS} GUI`, "error");
    const pick = (kind: Parameters<typeof guiTemplate>[0], name: string) => {
      let n = name;
      let k = 2;
      while (o.guis.some((g) => g.name === n)) n = `${name} ${k++}`;
      const g = guiTemplate(kind, n);
      o.guis.push(g);
      gui = g;
      sel = null;
      changed();
      renderAll();
      dlg.remove();
    };
    const opt = (icon: string, title: string, desc: string, fn: () => void) =>
      h("button", { class: "ge-template", onClick: fn }, h("span", { class: "ge-tic" }, icon), h("b", null, title), h("span", null, desc));
    const dlg = h(
      "div",
      { class: "modal-bg", onClick: (e: Event) => e.target === dlg && dlg.remove() },
      h(
        "div",
        { class: "modal" },
        h("div", { class: "modal-head" }, h("h2", null, "Nowe GUI"), h("button", { class: "icon-btn", onClick: () => dlg.remove() }, "✕")),
        h(
          "div",
          { class: "modal-body ge-templates" },
          opt("🎮", "Menu gry", "Tytuł i przycisk Graj - widoczne od startu", () => pick("menu", "Menu")),
          opt("🪟", "Okienko", "Tytuł, tekst i przycisk OK (pokazujesz skryptem)", () => pick("window", "Okienko")),
          opt("⭐", "Licznik w rogu", "Napis zmieniany skryptem (setGuiText)", () => pick("counter", "Licznik")),
          opt("▭", "Puste", "Sam ułożysz elementy", () => pick("empty", "GUI")),
        ),
      ),
    );
    document.body.append(dlg);
  }

  function renderGuiProps() {
    if (!gui) return guiProps.replaceChildren();
    const g = gui;
    const field = (label: string, input: HTMLElement, hint?: string) => h("label", { class: "prop" }, label, input, hint ? h("span", { class: "hint" }, hint) : null);
    const name = h("input", { value: g.name, maxLength: 40 });
    name.addEventListener("change", () => {
      g.name = name.value.trim() || g.name;
      changed();
      renderList();
    });
    const where = h(
      "select",
      null,
      [["", o.mode === "2d" ? "Na każdym poziomie" : "W każdym miejscu"], ...o.wheres].map(([v, l]) => h("option", { value: v, selected: (g.where ?? "") === v }, l)),
    );
    where.addEventListener("change", () => {
      g.where = where.value || undefined;
      changed();
    });
    const check = (label: string, value: boolean, set: (v: boolean) => void) => {
      const i = h("input", { type: "checkbox", checked: value });
      i.addEventListener("change", () => (set(i.checked), changed(), renderList()));
      return h("label", { class: "prop check" }, i, label);
    };
    guiProps.replaceChildren(
      h("div", { class: "prop-group" }, "To GUI"),
      field("Nazwa (dla skryptów)", name),
      check("Widoczne od startu", g.open, (v) => (g.open = v)),
      check("Przyciemnia grę (menu, okienko)", !!g.modal, (v) => (g.modal = v || undefined)),
      field(o.mode === "2d" ? "Gdzie" : "Gdzie", where, o.mode === "2d" ? "Np. tylko na poziomie menu" : "Np. tylko w miejscu menu"),
      h(
        "div",
        { class: "row wrap" },
        h(
          "button",
          {
            class: "btn small",
            onClick: () => {
              if (o.guis.length >= MAX_GUIS) return;
              const copy: GuiDef = { ...structuredClone(g), id: newGuiId(), name: g.name + " kopia", elements: g.elements.map((e) => ({ ...structuredClone(e), id: newGuiId() })) };
              o.guis.push(copy);
              gui = copy;
              changed();
              renderAll();
            },
          },
          "⧉ Kopia",
        ),
        h(
          "button",
          {
            class: "btn small danger",
            onClick: async () => {
              if (!(await ask(`Usunąć GUI „${g.name}”?`, "Usuń", "Anuluj", true))) return;
              o.guis.splice(o.guis.indexOf(g), 1);
              gui = o.guis[0] ?? null;
              sel = null;
              changed();
              renderAll();
            },
          },
          "🗑 Usuń GUI",
        ),
      ),
    );
  }

  // ---------- podgląd i przeciąganie ----------
  function renderAddBar() {
    const add = (type: GuiEl["type"]) => async () => {
      if (!gui) return toast("Najpierw dodaj GUI („+ Nowe”)", "info");
      if (gui.elements.length >= MAX_GUI_ELEMENTS) return toast(`Maksymalnie ${MAX_GUI_ELEMENTS} elementów`, "error");
      let image: string | undefined;
      if (type === "image") {
        image = (await pickGuiImage()) ?? undefined;
        if (!image) return;
      }
      const n = gui.elements.filter((e) => e.type === type).length + 1;
      const base = { text: "Napis", button: "Przycisk", frame: "Ramka", image: "Obrazek" }[type];
      const el: GuiEl = {
        id: newGuiId(),
        name: n > 1 ? `${base} ${n}` : base,
        type,
        x: 40,
        y: 40,
        w: type === "frame" ? 30 : 20,
        h: type === "frame" ? 30 : type === "image" ? 20 : 9,
        ...(type === "text" ? { text: "Napis", fontSize: 32, bold: true, color: "#ffffff" } : {}),
        ...(type === "button" ? { text: "Przycisk", fontSize: 28, bold: true, color: "#ffffff", bg: "#3a86ff", radius: 14 } : {}),
        ...(type === "frame" ? { bg: "#000000", bgOpacity: 0.6, radius: 16 } : {}),
        ...(image ? { image } : {}),
      };
      gui.elements.push(el);
      sel = el;
      changed();
      renderStage();
      renderProps();
    };
    addBar.replaceChildren(
      ...(["text", "button", "frame", "image"] as const).map((t) => h("button", { class: "btn small", onClick: add(t) }, "＋ " + KIND_LABELS[t])),
      h("span", { class: "ge-sep" }),
      h("button", { class: "btn small", title: "Pokaż GUI w grze, żeby sprawdzić, jak wygląda", onClick: () => stage.classList.toggle("ge-dark") }, "🌓 Tło podglądu"),
    );
  }

  let drag: { el: GuiEl; mode: "move" | "size"; sx: number; sy: number; x: number; y: number; w: number; h: number; id: number } | null = null;
  const snap = (v: number) => Math.round(v * 2) / 2;
  function renderStage() {
    stage.replaceChildren();
    if (!gui) {
      stage.append(h("div", { class: "ge-empty" }, "Wybierz GUI z listy albo dodaj nowe"));
      return;
    }
    const g = gui;
    const layer = h("div", { class: "gui-root" + (g.modal ? " gui-modal" : "") });
    for (const e of g.elements) {
      const node = renderGuiEl(e, undefined, true);
      node.classList.add("ge-el");
      if (e === sel) {
        node.classList.add("ge-sel");
        const handle = h("div", { class: "ge-handle" });
        handle.addEventListener("pointerdown", (ev) => startDrag(ev, e, "size"));
        node.append(handle);
      }
      node.addEventListener("pointerdown", (ev) => startDrag(ev, e, "move"));
      layer.append(node);
    }
    stage.append(layer);
  }
  function startDrag(ev: PointerEvent, el: GuiEl, mode: "move" | "size") {
    ev.stopPropagation();
    ev.preventDefault();
    if (sel !== el) {
      sel = el;
      renderStage();
      renderProps();
    }
    drag = { el, mode, sx: ev.clientX, sy: ev.clientY, x: el.x, y: el.y, w: el.w, h: el.h, id: ev.pointerId };
  }
  const onMove = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const r = stage.getBoundingClientRect();
    const dx = ((ev.clientX - drag.sx) / r.width) * 100;
    const dy = ((ev.clientY - drag.sy) / r.height) * 100;
    if (drag.mode === "move") {
      drag.el.x = snap(Math.min(100 - 1, Math.max(-drag.el.w + 1, drag.x + dx)));
      drag.el.y = snap(Math.min(100 - 1, Math.max(-drag.el.h + 1, drag.y + dy)));
    } else {
      drag.el.w = snap(Math.max(1, drag.w + dx));
      drag.el.h = snap(Math.max(1, drag.h + dy));
    }
    renderStage();
  };
  const onUp = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.id) return;
    drag = null;
    changed();
    renderProps();
  };
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);
  stage.addEventListener("pointerdown", () => {
    if (!sel) return;
    sel = null;
    renderStage();
    renderProps();
  });

  // ---------- cechy elementu ----------
  function renderProps() {
    if (!gui || !sel) {
      elProps.replaceChildren(h("div", { class: "prop-group" }, "Element"), h("p", { class: "panel-hint" }, "Kliknij element na podglądzie, żeby zmienić jego napis, kolory i działanie."));
      return;
    }
    const g = gui;
    const e = sel;
    const upd = (fn: () => void, full = false) => {
      fn();
      changed();
      renderStage();
      if (full) renderProps();
    };
    const field = (label: string, input: HTMLElement) => h("label", { class: "prop" }, label, input);
    const text = (value: string, set: (v: string) => void, multiline = false) => {
      const i = multiline ? h("textarea", { rows: 3 }) : h("input", { value });
      if (multiline) (i as HTMLTextAreaElement).value = value;
      i.addEventListener("input", () => upd(() => set((i as HTMLInputElement).value)));
      return i;
    };
    const num = (value: number, set: (v: number) => void, step = 1) => {
      const i = h("input", { type: "number", value: String(value), step: String(step) });
      i.addEventListener("change", () => {
        const v = Number(i.value);
        if (Number.isFinite(v)) upd(() => set(v));
      });
      return i;
    };
    const color = (value: string | undefined, def: string, set: (v: string | undefined) => void) => {
      const i = h("input", { type: "color", value: value ?? def });
      i.addEventListener("input", () => upd(() => set(i.value)));
      return i;
    };
    const select = <T extends string>(value: T, opts: [T, string][], set: (v: T) => void) => {
      const s = h("select", null, opts.map(([v, l]) => h("option", { value: v, selected: v === value }, l)));
      s.addEventListener("change", () => upd(() => set(s.value as T), true));
      return s;
    };
    const check = (label: string, value: boolean, set: (v: boolean) => void) => {
      const i = h("input", { type: "checkbox", checked: value });
      i.addEventListener("change", () => upd(() => set(i.checked), true));
      return h("label", { class: "prop check" }, i, label);
    };
    const pair = (a: HTMLElement, b: HTMLElement) => h("div", { class: "xy" }, a, b);
    const actionType = e.action?.type ?? "none";
    const ACTIONS: [GuiActionType, string][] = [
      ["none", "Nic (tylko skrypt onGuiClick)"],
      ["close", "Zamknij to GUI"],
      ["open", "Otwórz inne GUI"],
      ...(o.mode === "2d" ? [["level", "Idź na poziom"] as [GuiActionType, string]] : [["place", "Idź do miejsca"] as [GuiActionType, string]]),
    ];
    const targets: [string, string][] =
      actionType === "open"
        ? o.guis.filter((x) => x !== g).map((x) => [x.id, x.name])
        : actionType === "level"
          ? (o.levels ?? []).map((n) => [n, n])
          : actionType === "place"
            ? (o.places ?? [])
            : [];
    elProps.replaceChildren(
      h("div", { class: "prop-group" }, KIND_LABELS[e.type]),
      field("Nazwa (dla skryptów)", text(e.name, (v) => (e.name = v.trim().slice(0, 40) || e.name))),
      e.type !== "image" && e.type !== "frame" ? field("Napis", text(e.text ?? "", (v) => (e.text = v.slice(0, 300)), true)) : "",
      e.type === "image"
        ? h("button", { class: "btn small", onClick: async () => { const img = await pickGuiImage(); if (img) upd(() => (e.image = img)); } }, "🖼 Zmień obrazek")
        : "",
      e.type !== "image" && e.type !== "frame"
        ? h(
            "div",
            null,
            field("Wielkość napisu", num(e.fontSize ?? 24, (v) => (e.fontSize = Math.min(200, Math.max(6, v))))),
            field("Kolor napisu", color(e.color, "#ffffff", (v) => (e.color = v))),
            field("Wyrównanie", select(e.align ?? "center", [["left", "Do lewej"], ["center", "Na środku"], ["right", "Do prawej"]], (v) => (e.align = v))),
            check("Pogrubiony", !!e.bold, (v) => (e.bold = v || undefined)),
          )
        : "",
      e.type !== "image" ? field("Kolor tła", color(e.bg, e.type === "button" ? "#3a86ff" : "#000000", (v) => (e.bg = v))) : "",
      e.type !== "image"
        ? h(
            "div",
            { class: "row" },
            check("Bez tła", !e.bg && e.type !== "button", (v) => (v ? delete e.bg : (e.bg = e.bg ?? "#000000"))),
          )
        : "",
      field("Krycie tła (0 - 1)", num(e.bgOpacity ?? 1, (v) => (e.bgOpacity = Math.min(1, Math.max(0, v))), 0.1)),
      field("Zaokrąglenie rogów", num(e.radius ?? 0, (v) => (e.radius = Math.max(0, v)))),
      field("Obramowanie", h("div", { class: "row" }, color(e.border, "#ffffff", (v) => (e.border = v)), h("button", { class: "btn small", onClick: () => upd(() => delete e.border, true) }, "brak"))),
      h("div", { class: "prop-group" }, "Położenie (% ekranu)"),
      field("X / Y", pair(num(e.x, (v) => (e.x = v), 0.5), num(e.y, (v) => (e.y = v), 0.5))),
      field("Szerokość / wysokość", pair(num(e.w, (v) => (e.w = Math.max(0.5, v)), 0.5), num(e.h, (v) => (e.h = Math.max(0.5, v)), 0.5))),
      h(
        "div",
        { class: "row wrap" },
        h("button", { class: "btn small", title: "Na środek ekranu w poziomie", onClick: () => upd(() => (e.x = snap(50 - e.w / 2)), true) }, "↔ Środek"),
        h("button", { class: "btn small", title: "Na środek ekranu w pionie", onClick: () => upd(() => (e.y = snap(50 - e.h / 2)), true) }, "↕ Środek"),
      ),
      e.type === "button"
        ? h(
            "div",
            null,
            h("div", { class: "prop-group" }, "Po kliknięciu"),
            field("Akcja", select(actionType, ACTIONS, (v) => (e.action = v === "none" ? undefined : { type: v, ...(e.action?.target ? { target: e.action.target } : {}) }))),
            actionType !== "none" && actionType !== "close"
              ? field(
                  actionType === "open" ? "Które GUI" : actionType === "level" ? "Który poziom" : "Które miejsce",
                  select(e.action?.target ?? "", [["", "(wybierz)"], ...targets], (v) => e.action && (e.action.target = v || undefined)),
                )
              : "",
            h("p", { class: "hint" }, `Skrypt dostaje też onGuiClick(player, "${g.name}", "${e.name}").`),
          )
        : "",
      h(
        "div",
        { class: "row wrap" },
        h("button", { class: "btn small", title: "Na wierzch", onClick: () => upd(() => (g.elements.splice(g.elements.indexOf(e), 1), g.elements.push(e))) }, "⬆ Na wierzch"),
        h("button", { class: "btn small", title: "Pod spód", onClick: () => upd(() => (g.elements.splice(g.elements.indexOf(e), 1), g.elements.unshift(e))) }, "⬇ Pod spód"),
        h(
          "button",
          {
            class: "btn small",
            onClick: () => {
              if (g.elements.length >= MAX_GUI_ELEMENTS) return;
              const c = { ...structuredClone(e), id: newGuiId(), name: e.name + " 2", x: e.x + 2, y: e.y + 2 };
              g.elements.push(c);
              sel = c;
              upd(() => {}, true);
            },
          },
          "⧉ Kopia",
        ),
        h("button", { class: "btn small danger", onClick: () => removeSel() }, "🗑 Usuń"),
      ),
    );
  }
  function removeSel() {
    if (!gui || !sel) return;
    gui.elements.splice(gui.elements.indexOf(sel), 1);
    sel = null;
    changed();
    renderStage();
    renderProps();
  }
  const onKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || document.querySelector(".modal-bg")) return;
    if (!sel) return;
    if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      removeSel();
    } else if (ev.key.startsWith("Arrow")) {
      ev.preventDefault();
      const s = ev.shiftKey ? 2 : 0.5;
      if (ev.key === "ArrowLeft") sel.x -= s;
      if (ev.key === "ArrowRight") sel.x += s;
      if (ev.key === "ArrowUp") sel.y -= s;
      if (ev.key === "ArrowDown") sel.y += s;
      changed();
      renderStage();
    } else if (ev.key === "Escape") close();
    ev.stopPropagation();
  };
  window.addEventListener("keydown", onKey, true);

  function renderAll() {
    renderList();
    renderGuiProps();
    renderAddBar();
    renderStage();
    renderProps();
  }
  renderAll();
  fitStage();
  if (!o.guis.length) newGuiDialog();
}
