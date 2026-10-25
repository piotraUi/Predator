// Ustawienia asystenta AI (zębatka w oknie asystenta): własny klucz API (Claude, Gemini, ChatGPT, OpenRouter),
// a w aplikacji na komputer także MCP (sterowanie Studio z Claude Code, Codex, opencode) i paczka skilli dla AI.
import { getServerUrl } from "../api.ts";
import { h, modal, toast } from "../ui/dom.ts";
import { activeByok, ByokError, listModels, loadByok, PROVIDERS, providerInfo, saveByok, type ProviderId } from "./aiProviders.ts";
import { skillFiles, skillList } from "./skillsPack.ts";

interface McpState {
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  token: string;
  bridge: string;
  studio: { mode: "3d" | "2d"; name: string } | null;
  lastCall: number;
  tools: number;
  apps: Record<string, { label: string; path: string; installed: boolean; manual: string }>;
}
interface DesktopMcpApi {
  state(): Promise<McpState>;
  setEnabled(on: boolean): Promise<McpState>;
  installApp(app: string, on: boolean): Promise<McpState>;
  skillsState(): Promise<Record<string, { dir: string; installed: number }>>;
  installSkills(app: string, files: { path: string; content: string }[], on: boolean): Promise<boolean>;
}
const desktopMcp = (): DesktopMcpApi | undefined => (window as unknown as { predator?: { mcp?: DesktopMcpApi } }).predator?.mcp;
/** zakładki MCP i skille tylko w aplikacji na komputer */
export const isDesktopApp = () => !!desktopMcp();

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast("Skopiowano", "good");
  } catch {
    toast("Nie udało się skopiować - zaznacz tekst ręcznie", "error");
  }
};
const codeBox = (text: string) => h("div", { class: "ai-code" }, h("pre", null, text), h("button", { class: "btn tiny", onClick: () => void copy(text) }, "📋 Kopiuj"));
const toggle = (on: boolean, onChange: (v: boolean) => void | Promise<void>, label: string, hint?: string) => {
  const box = h("input", { type: "checkbox" }) as HTMLInputElement;
  box.checked = on;
  box.addEventListener("change", async () => {
    box.disabled = true;
    try {
      await onChange(box.checked);
    } catch (e) {
      box.checked = !box.checked;
      toast((e as Error).message, "error");
    }
    box.disabled = false;
  });
  return h("label", { class: "check ai-switch" }, box, h("span", null, h("b", null, label), hint ? h("small", { class: "muted" }, hint) : null));
};

// ---------- zakładka: model AI ----------
function modelTab(onChange: () => void): HTMLElement {
  const st = loadByok();
  const root = h("div", { class: "form" });
  const render = () => {
    root.replaceChildren(
      h("p", { class: "muted", style: "margin:0" }, "Wybierz, kto ma być mózgiem asystenta. Z własnym kluczem asystent nie zużywa dziennego limitu kroków Predatora, a klucz zostaje tylko na tym urządzeniu (idzie wprost do dostawcy)."),
      h(
        "label",
        { class: "check" },
        h("input", { type: "radio", name: "prov", checked: st.active === null, onChange: () => ((st.active = null), saveByok(st), onChange(), render()) }),
        h("span", null, h("b", null, "Asystent Predatora"), h("small", { class: "muted" }, " Gemini na serwerze, z dziennym limitem kroków")),
      ),
      ...PROVIDERS.map((p) => {
        const sel = st.active === p.id;
        const key = h("input", { type: "password", value: st.keys[p.id] ?? "", placeholder: p.keyHint, autocomplete: "off", spellcheck: false }) as HTMLInputElement;
        const model = h("input", { value: st.models[p.id] ?? "", placeholder: p.models[0], spellcheck: false }) as HTMLInputElement;
        // "list" w DOM jest tylko do odczytu - ustawiamy go jako atrybut
        model.setAttribute("list", "ai-models-" + p.id);
        const dl = h("datalist", { id: "ai-models-" + p.id }, ...p.models.map((m) => h("option", { value: m })));
        const save = () => {
          st.keys[p.id] = key.value.trim();
          st.models[p.id] = model.value.trim();
          saveByok(st);
          onChange();
        };
        key.addEventListener("change", save);
        model.addEventListener("change", save);
        const fetchBtn = h("button", { class: "btn small", type: "button" }, "⟳ Pobierz modele") as HTMLButtonElement;
        fetchBtn.addEventListener("click", async () => {
          save();
          if (!key.value.trim()) return toast("Wklej najpierw klucz API", "error");
          fetchBtn.disabled = true;
          try {
            const ids = await listModels(p.id, key.value.trim());
            dl.replaceChildren(...ids.map((m) => h("option", { value: m })));
            toast(`Klucz działa - modeli: ${ids.length}. Kliknij pole „Model”, żeby wybrać.`, "good");
          } catch (e) {
            toast(e instanceof ByokError ? e.message : (e as Error).message, "error");
          }
          fetchBtn.disabled = false;
        });
        return h(
          "div",
          { class: "ai-prov" + (sel ? " sel" : "") },
          h(
            "label",
            { class: "check" },
            h("input", {
              type: "radio",
              name: "prov",
              checked: sel,
              onChange: () => {
                save();
                if (!key.value.trim()) toast("Wklej klucz API tego dostawcy - bez klucza działa asystent Predatora", "error");
                st.active = p.id;
                saveByok(st);
                onChange();
                render();
              },
            }),
            h("span", null, h("b", null, p.label)),
          ),
          h("label", null, h("span", null, "Klucz API ", h("a", { href: p.keyUrl, target: "_blank", rel: "noreferrer" }, "(gdzie go wziąć)")), key),
          h("label", null, h("span", null, "Model"), model, dl),
          h("div", { class: "row" }, fetchBtn),
        );
      }),
      h("p", { class: "muted", style: "font-size:12px;margin:0" }, "Generowanie obrazków i filmów (🖼 🎬) nadal idzie przez serwer Predatora i monety. Mocniejszy model = lepsze mapy i skrypty, ale płacisz u dostawcy za zużyte tokeny."),
    );
  };
  render();
  return root;
}

// ---------- zakładka: MCP ----------
function mcpTab(api: DesktopMcpApi): HTMLElement {
  const root = h("div", { class: "form" }, h("p", { class: "muted" }, "Ładuję…"));
  let state: McpState;
  const render = async () => {
    state = await api.state();
    const studio = state.studio ? `otwarte: ${state.studio.name} (${state.studio.mode === "3d" ? "gra 3D" : "gra 2D"})` : "żadna gra nie jest otwarta w Studio";
    root.replaceChildren(
      h(
        "p",
        { class: "muted", style: "margin:0" },
        "MCP pozwala programom z AI (Claude Code, Codex, opencode, Claude Desktop) sterować tym Studio: budować mapy, pisać skrypty, robić GUI, testować i czytać dowolne dane gry. Działa tylko na tym komputerze (127.0.0.1) i z tajnym tokenem, a każdą zmianę cofniesz Ctrl+Z.",
      ),
      toggle(state.enabled, async (v) => ((state = await api.setEnabled(v)), await render()), "Włącz serwer MCP", state.running ? `działa na ${state.url} · ${state.tools} narzędzi · ${studio}` : "wyłączony"),
      h("div", { class: "prop-group" }, "Włącz w programach (zapisuje ich plik konfiguracji, kopia zapasowa obok)"),
      ...Object.entries(state.apps).map(([id, a]) =>
        h(
          "div",
          { class: "ai-app" },
          toggle(a.installed, async (v) => ((state = await api.installApp(id, v)), await render()), a.label, a.path),
          h("details", null, h("summary", { class: "muted" }, "Pokaż konfigurację do wklejenia ręcznie"), codeBox(a.manual)),
        ),
      ),
      h("p", { class: "muted", style: "font-size:12px;margin:0" }, "Po włączeniu uruchom program ponownie. Codex i Claude Desktop łączą się przez mały most z Node.js (polecenie `node`). Aplikacja Predatora musi być włączona, a w Studio otwarta gra - to ona wykonuje polecenia."),
      h("div", { class: "prop-group" }, "Token (hasło do serwera MCP)"),
      codeBox(state.token),
    );
  };
  void render().catch((e) => root.replaceChildren(h("p", { class: "error" }, (e as Error).message)));
  return root;
}

// ---------- zakładka: skille ----------
const SKILL_APPS: { id: string; label: string; dir: (win: boolean) => string }[] = [
  { id: "claude", label: "Claude Code (CLI i aplikacja)", dir: (w) => (w ? "$HOME\\.claude\\skills" : "~/.claude/skills") },
  { id: "opencode", label: "opencode", dir: (w) => (w ? "$HOME\\.config\\opencode\\skill" : "~/.config/opencode/skill") },
  { id: "codex", label: "Codex", dir: (w) => (w ? "$HOME\\.codex\\skills" : "~/.codex/skills") },
];

function skillsTab(api: DesktopMcpApi): HTMLElement {
  const list = skillList();
  const server = getServerUrl();
  const root = h("div", { class: "form" });
  const render = async () => {
    const st = await api.skillsState().catch(() => ({}) as Record<string, { dir: string; installed: number }>);
    const isWin = /Windows/i.test(navigator.userAgent);
    root.replaceChildren(
      h("p", { class: "muted", style: "margin:0" }, `Paczka ${list.length} skilli, które uczą AI pisać dobre mapy, skrypty Lua i GUI w Predatorze oraz sterować Studio przez MCP. Zainstaluj je jednym kliknięciem albo poleceniem w terminalu.`),
      h("div", { class: "prop-group" }, "Zainstaluj w programie"),
      ...SKILL_APPS.map((a) =>
        toggle(
          (st[a.id]?.installed ?? 0) >= list.length,
          async (v) => {
            await api.installSkills(a.id, v ? skillFiles() : [], v);
            toast(v ? "Skille zainstalowane - uruchom program ponownie" : "Skille usunięte", "good");
            await render();
          },
          a.label,
          (st[a.id]?.dir ?? a.dir(isWin)) + (st[a.id]?.installed ? ` · zainstalowane: ${st[a.id].installed}/${list.length}` : ""),
        ),
      ),
      h("div", { class: "prop-group" }, "Albo wklej polecenie w terminalu"),
      h("p", { class: "muted", style: "font-size:12px;margin:0" }, server ? "Pobiera paczkę z twojego serwera Predatora i rozpakowuje ją do folderu skilli:" : "Polecenia pojawią się po połączeniu z serwerem Predatora. Do tego czasu użyj przycisków powyżej."),
      ...(server
        ? SKILL_APPS.map((a) =>
            h(
              "div",
              { class: "ai-app" },
              h("b", null, a.label),
              codeBox(
                isWin
                  ? `New-Item -ItemType Directory -Force "${a.dir(true)}" | Out-Null; curl.exe -fsSL ${server}/skills/predator-skills.tar.gz | tar -xz -C "${a.dir(true)}"`
                  : `mkdir -p ${a.dir(false)} && curl -fsSL ${server}/skills/predator-skills.tar.gz | tar -xz -C ${a.dir(false)}`,
              ),
              isWin ? null : h("small", { class: "muted" }, "Windows (PowerShell):"),
              isWin ? null : codeBox(`New-Item -ItemType Directory -Force "${a.dir(true)}" | Out-Null; curl.exe -fsSL ${server}/skills/predator-skills.tar.gz | tar -xz -C "${a.dir(true)}"`),
            ),
          )
        : []),
      h("div", { class: "prop-group" }, "Co jest w paczce"),
      h("ul", { class: "ai-skills" }, ...list.map((s) => h("li", null, h("b", null, s.name), h("br"), h("span", { class: "muted" }, s.description)))),
    );
  };
  void render();
  return root;
}

/** okno ustawień asystenta; onChange - po zmianie dostawcy / modelu (odświeżenie nagłówka okna asystenta) */
export function openAiSettings(onChange: () => void, tab: "model" | "mcp" | "skills" = "model") {
  const desktop = desktopMcp();
  const body = h("div", { class: "ai-settings" });
  const tabs: { id: typeof tab; label: string; make: () => HTMLElement }[] = [{ id: "model", label: "🧠 Model AI", make: () => modelTab(onChange) }];
  if (desktop) {
    tabs.push({ id: "mcp", label: "🔌 MCP", make: () => mcpTab(desktop) }, { id: "skills", label: "🧰 Skille dla AI", make: () => skillsTab(desktop) });
  }
  const bar = h("div", { class: "ai-tabs" });
  const show = (id: typeof tab) => {
    const t = tabs.find((x) => x.id === id) ?? tabs[0];
    bar.replaceChildren(...tabs.map((x) => h("button", { class: "tab" + (x.id === t.id ? " active" : ""), onClick: () => show(x.id) }, x.label)));
    body.replaceChildren(t.make());
  };
  show(tab);
  modal("⚙ Ustawienia asystenta AI", h("div", null, bar, body), [{ label: "Gotowe", kind: "primary", onClick: () => document.querySelector<HTMLElement>(".modal-bg .modal-head .icon-btn")?.click() }]);
}

/** krótki opis aktywnego modelu do nagłówka okna asystenta */
export function byokLabel(): string | null {
  const b = activeByok();
  return b ? `${providerInfo(b.provider as ProviderId).label.split(" ")[0]} · ${b.model}` : null;
}
