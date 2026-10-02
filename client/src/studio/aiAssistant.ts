// Asystent AI w Studio (2D i 3D): okno czatu i pętla agenta.
// Twórca pisze prośbę, model (Gemini na serwerze) odpowiada wywołaniami narzędzi, Studio je wykonuje
// na otwartej grze i odsyła wyniki - aż model skończy. Cała prośba to jeden krok cofania (Ctrl+Z).
import { aiApi, ApiError, type AiContent, type AiPart } from "../api.ts";
import { MAX_ASSISTANT_STEPS } from "../../../shared/ai/assistantTools.ts";
import { ToolError, type AiAttachments, type Args } from "./aiCommon.ts";
import { h, toast } from "../ui/dom.ts";

export interface AiHost {
  mode: "3d" | "2d";
  /** rozmowa zostaje po zamknięciu okna (osobno dla każdej gry) */
  key: string;
  run(name: string, args: Args): Promise<unknown>;
  context(): string;
  /** przed pierwszą zmianą w prośbie (punkt cofania) */
  begin(): void;
  /** po każdej zmianie (zapis, współpraca, panele) */
  end(): void;
}

interface Chat {
  contents: AiContent[];
  att: AiAttachments;
  /** to, co widać w oknie */
  log: { kind: "user" | "ai" | "step" | "error"; text: string; ok?: boolean; images?: string[] }[];
}
const chats = new Map<string, Chat>();
export const chatFor = (key: string): Chat => {
  let c = chats.get(key);
  if (!c) chats.set(key, (c = { contents: [], att: { images: [] }, log: [] }));
  return c;
};

const READ_ONLY = new Set(["get_overview", "find_parts", "find_instances", "read_script", "get_gui", "run_test", "show_to_user"]);
const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const q = (v: unknown) => `„${String(v ?? "")}”`;
const LABELS: Record<string, (a: Args) => string> = {
  get_overview: () => "Oglądam grę",
  find_parts: () => "Szukam klocków",
  find_instances: () => "Szukam obiektów na poziomie",
  create_parts: (a) => `Buduję: ${len(a.parts)} klocków` + (a.model_name ? ` (${a.model_name})` : ""),
  update_parts: (a) => `Zmieniam klocki (${len(a.changes)})`,
  delete_parts: () => "Usuwam klocki",
  game_settings: () => "Zmieniam ustawienia gry",
  manage_place: (a) => ({ create: "Nowe miejsce", update: "Zmieniam miejsce", delete: "Usuwam miejsce", open_in_editor: "Otwieram miejsce" })[String(a.action)] + " " + q(a.name),
  save_tool: (a) => `Narzędzie ${q(a.name)}`,
  save_badge: (a) => `Odznaka ${q(a.name)}`,
  read_script: (a) => `Czytam skrypt ${q(a.name)}`,
  write_script: (a) => `Piszę skrypt ${q(a.name)}`,
  delete_script: (a) => `Usuwam skrypt ${q(a.name)}`,
  get_gui: (a) => `Czytam GUI ${q(a.name)}`,
  save_gui: (a) => `Robię GUI ${q(a.name)}`,
  delete_gui: (a) => `Usuwam GUI ${q(a.name)}`,
  run_test: (a) => `Testuję grę (${a.seconds ?? 10} s)`,
  show_to_user: () => "Pokazuję ci to",
  save_objects: (a) => `Obiekty: ${(Array.isArray(a.objects) ? (a.objects as Args[]) : []).map((o) => o.name).join(", ")}`,
  delete_objects: () => "Usuwam obiekty",
  place_instances: (a) => `Stawiam ${len(a.items)} obiektów`,
  update_instances: (a) => `Przesuwam / zmieniam (${len(a.changes)})`,
  delete_instances: () => "Usuwam z planszy",
  manage_level: (a) => ({ create: "Nowy poziom", update: "Zmieniam poziom", delete: "Usuwam poziom", open_in_editor: "Otwieram poziom", set_start: "Poziom startowy" })[String(a.action)] + " " + q(a.name),
  physics: () => "Zmieniam fizykę",
};

/** krótki opis wyniku narzędzia w oknie */
function resultNote(name: string, res: unknown): { ok: boolean; note: string } {
  const r = (res ?? {}) as Record<string, unknown>;
  if (r.error) return { ok: false, note: String(r.error).slice(0, 140) };
  if (name === "write_script" && r.syntax_error) return { ok: false, note: "błąd w kodzie - poprawiam: " + String(r.syntax_error).slice(0, 100) };
  if (name === "run_test") {
    const errs = (r.errors as string[] | undefined)?.length ?? 0;
    return { ok: errs === 0, note: errs ? `błędy w skryptach: ${errs}` : "bez błędów" };
  }
  return { ok: true, note: "" };
}

const SUGGEST: Record<"3d" | "2d", string[]> = {
  "3d": [
    "Zrób tor przeszkód z lawą, 10 skokami i metą",
    "Dodaj monety do zbierania i licznik monet na ekranie",
    "Zrób menu startowe z przyciskiem Graj",
    "Postaw mały dom z drzwiami, które się otwierają",
    "Sprawdź moje skrypty i napraw błędy",
  ],
  "2d": [
    "Zrób nowy poziom platformówki z monetami, kolcami i metą",
    "Dodaj potwory, które chodzą po platformach",
    "Zrób menu startowe gry z przyciskiem Graj",
    "Dodaj licznik czasu i ranking najszybszych",
    "Sprawdź moje skrypty i napraw błędy",
  ],
};

/** obrazek z dysku -> PNG/JPEG do 768 px (mały, żeby szybko szedł do AI) */
async function loadImage(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("To nie jest obrazek"));
      i.src = url;
    });
    const k = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = k < 1;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const png = c.toDataURL("image/png");
    return png.length < 1_200_000 ? png : c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** bezpieczny, prosty markdown: **pogrubienie**, `kod`, listy i nowe linie */
function md(text: string): HTMLElement {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = esc
    .replace(/```(?:lua)?\n?([\s\S]*?)```/g, (_m, c: string) => `<pre>${c}</pre>`)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/^\s*[-*] /gm, "• ")
    .replace(/\n/g, "<br>");
  const d = h("div", { class: "ai-text" });
  d.innerHTML = html;
  return d;
}

/**
 * Otwiera okno asystenta nad Studiem. Zwraca funkcję zamykającą.
 */
export function openAssistant(parent: HTMLElement, host: AiHost, onClose: () => void): () => void {
  const chat = chatFor(host.key);
  const msgs = h("div", { class: "ai-msgs" });
  const status = h("span", { class: "muted small" }, "");
  const input = h("textarea", { class: "ai-input", rows: 2, placeholder: "Napisz, co mam zrobić w grze… (Enter = wyślij)" }) as HTMLTextAreaElement;
  const pending: string[] = [];
  const thumbs = h("div", { class: "ai-thumbs" });
  const fileIn = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", multiple: true, class: "hidden" }) as HTMLInputElement;
  const sendBtn = h("button", { class: "btn primary small", title: "Wyślij" }, "➤");
  const stopBtn = h("button", { class: "btn small danger hidden", title: "Zatrzymaj" }, "⏹ Stop");
  let ctrl: AbortController | null = null;
  let busy = false;

  const panel = h(
    "div",
    { class: "ai-panel" },
    h(
      "div",
      { class: "ai-head" },
      h("b", null, "🤖 Asystent AI"),
      status,
      h("span", { class: "spacer" }),
      h("button", { class: "icon-btn", title: "Nowa rozmowa", onClick: () => newChat() }, "🗑"),
      h("button", { class: "icon-btn", title: "Zamknij", onClick: () => close() }, "✕"),
    ),
    msgs,
    thumbs,
    h(
      "div",
      { class: "ai-inputrow" },
      fileIn,
      h("button", { class: "icon-btn", title: "Dołącz obrazek (np. szkic mapy albo grafika do gry)", onClick: () => fileIn.click() }, "📎"),
      input,
      sendBtn,
      stopBtn,
    ),
  );
  parent.append(panel);
  // klawisze Studia (Delete, WASD...) nie działają, gdy piszemy w oknie asystenta
  panel.addEventListener("keydown", (e) => e.stopPropagation());

  const scroll = () => (msgs.scrollTop = msgs.scrollHeight);
  function renderItem(it: Chat["log"][number]): HTMLElement {
    if (it.kind === "step") return h("div", { class: "ai-step" + (it.ok === false ? " bad" : "") }, (it.ok === undefined ? "⏳ " : it.ok ? "✔ " : "⚠ ") + it.text);
    if (it.kind === "error") return h("div", { class: "ai-msg error" }, "❌ " + it.text);
    const el = h("div", { class: "ai-msg " + it.kind });
    if (it.images?.length) el.append(h("div", { class: "ai-imgs" }, ...it.images.map((src) => h("img", { src, alt: "" }))));
    el.append(it.kind === "ai" ? md(it.text) : h("div", { class: "ai-text" }, it.text));
    return el;
  }
  function add(it: Chat["log"][number]) {
    chat.log.push(it);
    const el = renderItem(it);
    msgs.append(el);
    scroll();
    return { it, el };
  }
  function renderAll() {
    msgs.replaceChildren();
    if (!chat.log.length) {
      msgs.append(
        h(
          "div",
          { class: "ai-empty" },
          h("p", null, "Cześć! Jestem asystentem Predatora. Powiedz, co zbudować albo zmienić w tej grze - zrobię to sam: mapę, obiekty, skrypty i GUI. Każdą moją zmianę cofniesz Ctrl+Z."),
          ...SUGGEST[host.mode].map((t) => h("button", { class: "ai-chip", onClick: () => ((input.value = t), send()) }, t)),
        ),
      );
    } else for (const it of chat.log) msgs.append(renderItem(it));
    scroll();
  }
  function newChat() {
    if (busy) return;
    chat.contents = [];
    chat.att.images = [];
    chat.log = [];
    renderAll();
  }
  const renderThumbs = () =>
    thumbs.replaceChildren(
      ...pending.map((src, i) => h("div", { class: "ai-thumb" }, h("img", { src, alt: "" }), h("button", { class: "icon-btn", onClick: () => (pending.splice(i, 1), renderThumbs()) }, "✕"))),
    );
  fileIn.addEventListener("change", async () => {
    for (const f of [...(fileIn.files ?? [])].slice(0, 4)) {
      try {
        pending.push(await loadImage(f));
      } catch (e) {
        toast((e as Error).message, "error");
      }
    }
    fileIn.value = "";
    renderThumbs();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener("click", () => send());
  stopBtn.addEventListener("click", () => ctrl?.abort());

  const setBusy = (b: boolean) => {
    busy = b;
    sendBtn.classList.toggle("hidden", b);
    stopBtn.classList.toggle("hidden", !b);
    input.disabled = b;
  };
  const showUsage = (used: number, limit: number | null) => (status.textContent = limit === null ? "" : `· ${used}/${limit} kroków dziś`);
  aiApi
    .status()
    .then((s) => {
      if (!s.enabled) add({ kind: "error", text: "Asystent AI jest wyłączony na tym serwerze. Admin musi wgrać klucz Gemini (Panel admina → AI)." });
      showUsage(s.used, s.limit);
    })
    .catch(() => {});

  /** rozmowa nie może rosnąć bez końca - stare kroki wypadają (od pełnej wiadomości twórcy) */
  function trim() {
    const MAX = MAX_ASSISTANT_STEPS * 2 + 20;
    while (chat.contents.length > MAX) {
      const next = chat.contents.findIndex((c, i) => i > 0 && c.role === "user" && c.parts.some((p) => p.text !== undefined && !p.functionResponse));
      if (next <= 0) break;
      chat.contents = chat.contents.slice(next);
    }
  }

  async function send() {
    const text = input.value.trim();
    if (busy || (!text && !pending.length)) return;
    input.value = "";
    const images = pending.splice(0);
    renderThumbs();
    if (!chat.log.length) msgs.replaceChildren();
    add({ kind: "user", text: text || "(obrazek)", images });
    const parts: AiPart[] = [];
    for (const src of images) {
      chat.att.images.push(src);
      const m = /^data:([^;]+);base64,(.*)$/.exec(src)!;
      parts.push({ text: `[Attached image #${chat.att.images.length}]` }, { inlineData: { mimeType: m[1] === "image/gif" ? "image/png" : m[1], data: m[2] } });
    }
    parts.push({ text: (text || "Look at the attached image.") + "\n\n" + host.context() });
    // ostatnia wiadomość jest od twórcy (np. po przerwaniu) - dopisujemy do niej
    const last = chat.contents.at(-1);
    if (last?.role === "user") last.parts.push(...parts);
    else chat.contents.push({ role: "user", parts });
    await agent();
  }

  async function agent() {
    setBusy(true);
    ctrl = new AbortController();
    let began = false;
    const thinking = h("div", { class: "ai-step thinking" }, "⏳ Myślę…");
    try {
      for (let step = 0; step < MAX_ASSISTANT_STEPS; step++) {
        trim();
        msgs.append(thinking);
        scroll();
        const res = await aiApi.step(host.mode, chat.contents, ctrl.signal).finally(() => thinking.remove());
        showUsage(res.used, res.limit);
        const content = res.content;
        chat.contents.push(content);
        const said = content.parts
          .filter((p) => p.text && !p.thought)
          .map((p) => p.text)
          .join("")
          .trim();
        if (said) add({ kind: "ai", text: said });
        const calls = content.parts.filter((p) => p.functionCall);
        if (!calls.length) {
          if (!said) add({ kind: "ai", text: res.finish === "MAX_TOKENS" ? "Odpowiedź była za długa - napisz „dalej”, a dokończę." : "Gotowe." });
          break;
        }
        const responses: AiPart[] = [];
        for (const p of calls) {
          const fc = p.functionCall!;
          const args = (fc.args ?? {}) as Args;
          const label = (LABELS[fc.name]?.(args) ?? fc.name).slice(0, 120);
          const line = add({ kind: "step", text: label });
          let result: unknown;
          if (ctrl.signal.aborted) result = { error: "Stopped by the user" };
          else
            try {
              if (!READ_ONLY.has(fc.name) && !began) {
                host.begin();
                began = true;
              }
              result = { result: await host.run(fc.name, args) };
              if (!READ_ONLY.has(fc.name)) host.end();
            } catch (e) {
              result = { error: e instanceof ToolError ? e.message : "Tool crashed: " + (e as Error).message };
              if (!(e instanceof ToolError)) console.error(e);
            }
          // za duży wynik zjada limit rozmowy - przycinamy
          let json = JSON.stringify(result);
          if (json.length > 40_000) result = { result: json.slice(0, 40_000) + "… (cut)" };
          json = "";
          const inner = (result as { result?: unknown }).result ?? result;
          const r = resultNote(fc.name, (result as { error?: unknown }).error ? result : inner);
          line.it.ok = r.ok;
          line.it.text = label + (r.note ? " - " + r.note : "");
          line.el.replaceWith((line.el = renderItem(line.it)));
          responses.push({ functionResponse: { name: fc.name, response: result as object, ...(fc.id ? { id: fc.id } : {}) } });
        }
        chat.contents.push({ role: "user", parts: responses });
        if (ctrl.signal.aborted) break;
        if (step === MAX_ASSISTANT_STEPS - 1) add({ kind: "ai", text: "Zrobiłem dużo kroków naraz - napisz „dalej”, jeśli mam kontynuować." });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      if (!ctrl.signal.aborted) add({ kind: "error", text: msg });
    } finally {
      // model czekał na wyniki narzędzi, a przerwaliśmy - odpowiadamy "zatrzymane", żeby rozmowa była poprawna
      const last = chat.contents.at(-1);
      if (last?.role === "model" && last.parts.some((p) => p.functionCall))
        chat.contents.push({ role: "user", parts: last.parts.filter((p) => p.functionCall).map((p) => ({ functionResponse: { name: p.functionCall!.name, response: { error: "Stopped by the user" }, ...(p.functionCall!.id ? { id: p.functionCall!.id } : {}) } })) });
      if (ctrl.signal.aborted) add({ kind: "step", text: "Zatrzymano", ok: false });
      thinking.remove();
      setBusy(false);
      ctrl = null;
      input.focus();
    }
  }

  function close() {
    ctrl?.abort();
    panel.remove();
    onClose();
  }
  renderAll();
  setTimeout(() => input.focus(), 50);
  return close;
}
