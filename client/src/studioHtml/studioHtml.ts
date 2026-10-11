// Studio gier HTML: kod strony po lewej, podgląd w odizolowanej ramce po prawej. Gra HTML to jeden plik
// (CSS, JS i obrazki w środku), który Predator pokazuje w ramce zamiast silnika gier - to nie jest gra Predatora.
// Przed publikacją kod sprawdza moderacja AI (teksty, obrazki, dźwięki i sam kod).
import { fileNameFor, GAME_EXT, makeGameFile, parseGameFile, type GameMeta } from "../../../shared/gamefile.ts";
import { htmlLint, HTML_STARTER } from "../../../shared/htmlGame.ts";
import type { WorldData, WorldInfo } from "../../../shared/types.ts";
import { MAX_PLAYERS_LIMIT } from "../../../shared/types.ts";
import { MAX_HTML_CHARS } from "../../../shared/world.ts";
import { api } from "../api.ts";
import { htmlFrame } from "../game/htmlPlay.ts";
import { desktop, pickDataUrl, pickFile, saveTextFile } from "../files.ts";
import { session } from "../state.ts";
import { docTab, themeButton, useStudioTheme } from "../studioTheme.ts";
import { genreSelect } from "../studio/productEditor.ts";
import type { StudioFile } from "../studio/studio.ts";
import { ask, h, logo, modal, toast } from "../ui/dom.ts";

type Go = (screen: string, params?: Record<string, unknown>) => void;

class SaveCancelled extends Error {}

interface Source {
  online: boolean;
  worldId?: number;
  owner?: boolean;
  published: boolean;
  save(meta: GameMeta, data: WorldData, published: boolean, thumbnail?: string): Promise<void>;
}

/** obrazek z dysku -> miniaturka 640x360 (JPEG), żeby zmieściła się w limicie serwera */
async function toThumbnail(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Nie udało się wczytać obrazka"));
    i.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext("2d")!;
  const k = Math.max(640 / img.width, 360 / img.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 640, 360);
  ctx.drawImage(img, (640 - img.width * k) / 2, (360 - img.height * k) / 2, img.width * k, img.height * k);
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const out = c.toDataURL("image/jpeg", q);
    if (out.length < 390_000) return out;
  }
  throw new Error("Obrazek jest za duży na miniaturkę");
}

export function studioHtmlScreen(
  root: HTMLElement,
  params: { worldId?: number; file?: StudioFile; loaded?: { info: WorldInfo; data: WorldData } },
  go: Go,
) {
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Wczytywanie Studia HTML…");
  root.append(loading);
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const exitScreen = () => (session.user ? go("home", { tab: "create" }) : go("offline"));

  const file = params.file;
  if (file) {
    let path = file.path;
    const src: Source = {
      online: false,
      published: false,
      async save(meta, data) {
        const saved = await saveTextFile(file.fileName ?? fileNameFor(meta.name, GAME_EXT), makeGameFile(meta, data), GAME_EXT, path);
        if (!saved) throw new SaveCancelled();
        if (desktop) path = saved;
        file.path = path;
      },
    };
    queueMicrotask(() => start({ ...file.meta }, file.data, src, file.dirty ?? false));
  } else {
    const worldId = params.worldId!;
    (params.loaded ? Promise.resolve(params.loaded) : api.getWorld(worldId))
      .then(({ info, data }) => {
        if (disposed) return;
        const src: Source = {
          online: true,
          worldId,
          owner: info.ownerId === session.user?.id,
          published: info.published,
          async save(meta, d, published, thumbnail) {
            const res = await api.saveWorld(worldId, { ...meta, published, data: d, ...(thumbnail ? { thumbnail } : {}) });
            // gra czeka na sprawdzenie przez moderację (serwer publikuje ją sam, gdy wszystko jest dobrze)
            if (res.moderation) toast(res.moderation);
            src.published = res.published;
          },
        };
        start({ name: info.name, description: info.description, maxPlayers: info.maxPlayers }, data, src, false);
      })
      .catch((e: Error) => {
        toast(e.message, "error");
        exitScreen();
      });
  }

  function start(meta: GameMeta, data: WorldData, src: Source, startDirty: boolean) {
    if (disposed) return;
    loading.remove();
    data.mode = "html";
    let dirty = startDirty;
    let thumb: string | undefined;
    let thumbPreview: string | undefined;

    const el = h("div", { class: "studio html-studio" });
    el.dataset.view = "code";
    root.append(el);
    cleanups.push(() => el.remove());

    // ---------- kod i podgląd ----------
    const code = h("textarea", { class: "html-code", spellcheck: false, autocapitalize: "off", autocomplete: "off", wrap: "off" }) as HTMLTextAreaElement;
    code.value = data.html ?? "";
    const lint = h("div", { class: "html-lint" });
    const previewBox = h("div", { style: "flex:1;min-height:0;display:flex" });
    let auto = true;
    let timer = 0;
    const runPreview = () => {
      previewBox.replaceChildren(htmlFrame(data.html ?? ""));
    };
    const updateLint = () => {
      const w = htmlLint(data.html ?? "");
      lint.classList.toggle("ok", w.length === 0);
      lint.replaceChildren(...(w.length ? w.map((t) => h("div", null, "⚠ " + t)) : [h("div", null, "✔ Kod wygląda dobrze. Moderacja AI sprawdzi go przed publikacją.")]));
    };
    const markDirty = () => {
      dirty = true;
      desktop?.setDirty(true);
      saveBtn.classList.add("unsaved");
      doc.update();
    };
    code.addEventListener("input", () => {
      data.html = code.value.slice(0, MAX_HTML_CHARS);
      markDirty();
      updateLint();
      if (auto) {
        clearTimeout(timer);
        timer = window.setTimeout(runPreview, 900);
      }
    });
    code.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        // Tab wstawia wcięcie zamiast przenosić fokus
        e.preventDefault();
        const a = code.selectionStart, b = code.selectionEnd;
        code.setRangeText("  ", a, b, "end");
        code.dispatchEvent(new Event("input"));
      }
    });
    cleanups.push(() => clearTimeout(timer));
    const setCode = (html: string) => {
      code.value = html;
      data.html = html.slice(0, MAX_HTML_CHARS);
      markDirty();
      updateLint();
      runPreview();
    };

    // ---------- zapis ----------
    async function save(quiet = false) {
      try {
        await src.save(meta, data, src.published, thumb);
        thumb = undefined;
        dirty = false;
        desktop?.setDirty(false);
        saveBtn.classList.remove("unsaved");
        doc.update();
        if (!quiet) toast(src.online ? "Zapisano na serwerze ✔" : "Zapisano plik ✔", "good");
        return true;
      } catch (e) {
        if (!(e instanceof SaveCancelled)) toast((e as Error).message, "error");
        return false;
      }
    }
    async function confirmLeave() {
      if (!dirty) return true;
      if (await ask("Zapisać zmiany?", "Zapisz", "Nie zapisuj")) return save(true);
      return true;
    }
    const leave = async () => {
      if (await confirmLeave()) {
        desktop?.setDirty(false);
        exitScreen();
      }
    };
    const fileState = (): StudioFile => ({ meta, data, path: file?.path, fileName: file?.fileName, dirty });

    /** pełny ekran jak u gracza (z paskiem i ostrzeżeniem) */
    async function test() {
      if (src.online && !(await save(true))) return;
      go("htmlplay", { offline: { name: meta.name, html: data.html ?? "" }, back: { screen: "studio", params: file ? { file: fileState() } : { worldId: params.worldId } } });
    }

    // ---------- pliki ----------
    async function loadHtmlFile() {
      const f = await pickFile([".html", ".htm"], "Strona HTML");
      if (!f) return;
      if (f.text.length > MAX_HTML_CHARS) return toast(`Plik jest za duży (maks. ${(MAX_HTML_CHARS / 1_000_000).toFixed(0)} MB)`, "error");
      if (data.html?.trim() && data.html.trim() !== HTML_STARTER.trim() && !(await ask("Zastąpić obecny kod plikiem " + f.name + "?", "Zastąp", "Anuluj"))) return;
      setCode(f.text);
      toast("Wczytano " + f.name, "good");
    }
    async function downloadHtml() {
      const saved = await saveTextFile(fileNameFor(meta.name, ".html"), data.html ?? "", ".html");
      if (saved) toast("Zapisano plik " + saved.split(/[\\/]/).pop(), "good");
    }
    async function exportFile() {
      const saved = await saveTextFile(fileNameFor(meta.name, GAME_EXT), makeGameFile(meta, data), GAME_EXT);
      if (saved) toast("Zapisano plik " + saved.split(/[\\/]/).pop(), "good");
    }
    async function openFile() {
      if (!(await confirmLeave())) return;
      const f = await pickFile([GAME_EXT], "Gra Predator");
      if (!f) return;
      try {
        const { data: d, ...m } = parseGameFile(f.text);
        go("studio", { file: { meta: m, data: d, path: f.path, fileName: f.name } });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    async function upload() {
      if (!session.user) return toast("Zaloguj się na serwerze, żeby wysłać grę", "error");
      try {
        const w = await api.createWorld(meta.name, "html");
        await api.saveWorld(w.id, { ...meta, data, ...(thumb ? { thumbnail: thumb } : {}) });
        toast("Gra wysłana na serwer ✔", "good");
        dirty = false;
        desktop?.setDirty(false);
        go("studio", { worldId: w.id });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }

    // ---------- ustawienia gry ----------
    function openGameSettings() {
      const name = h("input", { value: meta.name, maxLength: 40 });
      const desc = h("textarea", { value: meta.description, maxLength: 500, rows: 3 });
      const genre = genreSelect(data.genre);
      const pub = h("input", { type: "checkbox", checked: src.published });
      const preview = h("img", { alt: "", src: thumbPreview ?? (src.worldId ? `/api/worlds/${src.worldId}/thumbnail?v=${Date.now()}` : "") }) as HTMLImageElement;
      preview.onerror = () => (preview.style.visibility = "hidden");
      preview.onload = () => (preview.style.visibility = "visible");
      const pickThumb = async () => {
        const f = await pickDataUrl([".png", ".jpg", ".jpeg", ".webp"]);
        if (!f) return;
        try {
          thumb = await toThumbnail(f.dataUrl);
          thumbPreview = thumb;
          preview.src = thumb;
          preview.style.visibility = "visible";
        } catch (e) {
          toast((e as Error).message, "error");
        }
      };
      const close = modal(
        "Ustawienia gry HTML",
        h(
          "div",
          { class: "form" },
          h("label", null, "Nazwa", name),
          h("label", null, "Opis", desc),
          h("label", null, "Kategoria", genre),
          h("div", { class: "prop" }, h("span", null, "Miniaturka (obrazek na karcie gry)"), h("div", { class: "html-thumb-pick" }, preview, h("button", { type: "button", class: "btn small", onClick: pickThumb }, "🖼 Wybierz obrazek"))),
          src.online
            ? h("label", { class: "check" }, pub, h("span", null, "Opublikowana - inni mogą w nią grać"))
            : h("p", { class: "muted", style: "font-size:13px;margin:0" }, "Gra z pliku - żeby ją opublikować, wyślij ją na serwer (Plik → Wyślij na serwer)."),
          h("p", { class: "muted small", style: "margin:0" }, "🛡️ Moderacja AI sprawdza opublikowane gry HTML: napisy, obrazki, dźwięki i sam kod. Gra z problemem jest ukrywana, a ty dostajesz powiadomienie z powodem. Gracze zobaczą ją z oznaczeniem „🌐 Gra HTML”."),
        ),
        [
          { label: "Anuluj", onClick: () => close() },
          {
            label: "Zapisz",
            kind: "primary",
            onClick: async () => {
              meta.name = name.value.trim().slice(0, 40) || meta.name;
              meta.description = desc.value.slice(0, 500);
              meta.maxPlayers = Math.min(MAX_PLAYERS_LIMIT, Math.max(1, meta.maxPlayers || 30));
              if (genre.value) data.genre = genre.value;
              else delete data.genre;
              src.published = pub.checked;
              close();
              markDirty();
              if (src.online) {
                if (await save(true)) toast("Zapisano ustawienia", "good");
              }
            },
          },
        ],
      );
    }

    // ---------- pasek narzędzi ----------
    const saveBtn = h("button", { class: "tb-btn" + (dirty ? " unsaved" : ""), onClick: () => save(), title: "Zapisz (Ctrl+S)" }, "💾", h("span", null, "Zapisz"));
    const fileMenu = h(
      "div",
      { class: "dropdown hidden" },
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), loadHtmlFile()) }, "📂 Wczytaj plik .html"),
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), downloadHtml()) }, "⬇ Pobierz grę jako .html"),
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), exportFile()) }, "💾 Zapisz jako plik .pgame"),
      h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), openFile()) }, "📂 Otwórz plik .pgame"),
      !src.online ? h("button", { class: "dd-item", onClick: () => (fileMenu.classList.add("hidden"), upload()) }, "☁ Wyślij na serwer") : null,
      h(
        "button",
        {
          class: "dd-item",
          onClick: async () => {
            fileMenu.classList.add("hidden");
            if (await ask("Zastąpić kod przykładową grą?", "Zastąp", "Anuluj")) setCode(HTML_STARTER);
          },
        },
        "🧩 Przykładowa gra (zacznij od nowa)",
      ),
    );
    function toggleMenu(menu: HTMLElement, e: Event) {
      menu.classList.toggle("hidden");
      if (menu.classList.contains("hidden")) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + "px";
      menu.style.top = r.bottom + 4 + "px";
    }
    const toolbar = h(
      "div",
      { class: "studio-toolbar" },
      logo(true, "tb-logo"),
      h("button", { class: "tb-btn", onClick: () => void leave() }, "←", h("span", null, "Wyjdź")),
      saveBtn,
      h("button", { class: "tb-btn play", onClick: () => void test(), title: "Zagraj tak jak gracz (pełny ekran)" }, "▶", h("span", null, "Testuj")),
      h("button", { class: "tb-btn", onClick: runPreview, title: "Uruchom grę w podglądzie od nowa" }, "↻", h("span", null, "Uruchom")),
      h("div", { class: "dd-wrap" }, h("button", { class: "tb-btn", onClick: (e: Event) => toggleMenu(fileMenu, e) }, "📁", h("span", null, "Plik")), fileMenu),
      h("span", { class: "tb-mode " + (src.online ? "on" : ""), title: src.online ? "Gra na serwerze" : "Gra z pliku - bez serwera" }, src.online ? "☁ serwer" : "📄 plik"),
      h("span", { class: "html-tag", title: "To jest gra HTML - strona w ramce, nie gra Predatora" }, "🌐 Gra HTML"),
      h("div", { class: "tb-sep" }),
      h("button", { class: "tb-btn", onClick: () => void loadHtmlFile(), title: "Wczytaj gotowy plik .html" }, "📂", h("span", null, "Wczytaj")),
      h("button", { class: "tb-btn", onClick: openGameSettings, title: "Nazwa, opis, miniaturka, publikacja" }, "⚙", h("span", null, "Gra")),
      themeButton(),
    );
    const doc = docTab(() => meta.name, () => dirty, () => void leave());
    cleanups.push(useStudioTheme());

    const autoBox = h("input", { type: "checkbox", checked: true }) as HTMLInputElement;
    autoBox.addEventListener("change", () => (auto = autoBox.checked));
    const preview = h(
      "div",
      { class: "html-preview" },
      h("div", { class: "html-preview-head" }, h("b", null, "Podgląd"), h("label", { class: "check", style: "margin:0;gap:4px" }, autoBox, h("span", null, "Odświeżaj sam")), h("span", { class: "muted small" }, "Ramka jest odizolowana od Predatora")),
      previewBox,
    );
    const codePanel = h("div", { class: "html-code-panel" }, h("div", { class: "panel-title" }, "Kod HTML (jeden plik: strona, CSS i JS)"), code, lint);
    const mtabs = h(
      "div",
      { class: "studio-mtabs", style: "display:none" },
      h("button", { onClick: () => ((el.dataset.view = "code"), sync()) }, "📝 Kod"),
      h("button", { onClick: () => ((el.dataset.view = "preview"), sync()) }, "▶ Podgląd"),
    );
    const sync = () => [...mtabs.children].forEach((b, i) => b.classList.toggle("on", (i === 0) === (el.dataset.view === "code")));
    const compact = matchMedia("(max-width: 760px), (max-height: 520px)");
    const showTabs = () => (mtabs.style.display = compact.matches ? "flex" : "none");
    compact.addEventListener("change", showTabs);
    cleanups.push(() => compact.removeEventListener("change", showTabs));
    showTabs();
    sync();

    el.append(toolbar, doc.el, h("div", { class: "studio-main" }, codePanel, preview), mtabs);
    updateLint();
    runPreview();

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") (e.preventDefault(), void save());
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));
    const closeMenus = (e: Event) => {
      if (!(e.target as HTMLElement).closest(".dd-wrap, .dropdown")) fileMenu.classList.add("hidden");
    };
    window.addEventListener("pointerdown", closeMenus);
    cleanups.push(() => window.removeEventListener("pointerdown", closeMenus));
  }

  return () => {
    disposed = true;
    cleanups.forEach((f) => f());
    loading.remove();
  };
}
