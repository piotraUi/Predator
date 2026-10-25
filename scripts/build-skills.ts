// Generuje pliki referencyjne paczki skilli dla AI (skills/*/reference-*.md) z kodu gry, żeby były zawsze zgodne z silnikiem:
//  - lista funkcji Lua (3D i 2D), katalog sprawdzonych budowli, lista narzędzi MCP, nieba, tekstury
// Uruchom: npx tsx scripts/build-skills.ts
import fs from "node:fs";
import path from "node:path";
import { groupLuaHelp, LUA_HELP, LUA_HELP_2D } from "../shared/luaHelp.ts";
import { listBlueprints } from "../shared/blueprints/catalog.ts";
import { mcpTools } from "../shared/ai/mcpTools.ts";
import { SKYBOXES } from "../shared/skybox.ts";

const root = path.join(import.meta.dirname, "..", "skills");
const write = (rel: string, text: string) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text.replace(/\s+$/, "") + "\n", "utf8");
  console.log("zapisano", rel, (text.length / 1024).toFixed(1) + " KB");
};
const GEN = "<!-- Plik wygenerowany przez scripts/build-skills.ts - nie edytuj ręcznie -->\n\n";

const lua = (title: string, list: [string, string][]) =>
  `${GEN}# ${title}\n\nPełna lista funkcji dostępnych w skryptach gry. **Funkcji, których tu nie ma, nie ma w Predatorze** - nie wymyślaj ich. Opisy są po polsku, bo tak widzi je twórca w Studio.\n\n` +
  groupLuaHelp(list)
    .map(([g, items]) => `## ${g}\n\n` + items.map(([f, d]) => `- \`${f}\` — ${d}`).join("\n"))
    .join("\n\n");
write("predator-lua-scripting/reference-3d.md", lua("Funkcje Lua w grach 3D", LUA_HELP));
write("predator-2d-games/reference-lua-2d.md", lua("Funkcje Lua w grach 2D", LUA_HELP_2D));

const bps = listBlueprints();
write(
  "predator-3d-building/examples-catalog.md",
  `${GEN}# Katalog sprawdzonych budowli\n\nKażda z tych budowli ma wzorcowy zapis w Studio (narzędzia \`list_examples\` i \`get_example\` w MCP/asystencie). Studiuj je, zanim zbudujesz coś podobnego. Rozmiar to obrys w jednostkach (X × Z), liczba to klocki w jednej sztuce.\n\n| id | nazwa | obrys | klocki | opcje |\n|---|---|---|---|---|\n` +
    bps.map((b) => `| \`${b.id}\` | ${b.pl} / ${b.en} | ${b.foot[0]}×${b.foot[1]} | ${b.parts} | ${b.options ? JSON.stringify(b.options).slice(0, 120).replace(/\|/g, "/") : ""} |`).join("\n"),
);

const tools = mcpTools();
write(
  "predator-studio-mcp/tools.md",
  `${GEN}# Narzędzia MCP Studia Predatora\n\nTyle narzędzi widzisz po połączeniu z serwerem MCP aplikacji. Wspólne nazwy gier 3D i 2D (get_overview, run_test, show_to_user) działają zależnie od tego, co jest otwarte w Studio.\n\n` +
    tools
      .map((t) => {
        const props = (t.inputSchema.properties ?? {}) as Record<string, { type?: string; description?: string; enum?: string[] }>;
        const req = new Set((t.inputSchema.required as string[] | undefined) ?? []);
        const params = Object.entries(props)
          .map(([k, v]) => `  - \`${k}\`${req.has(k) ? " (wymagane)" : ""}: ${v.type ?? "obiekt"}${v.enum ? " [" + v.enum.join("|") + "]" : ""} — ${(v.description ?? "").replace(/\n/g, " ").slice(0, 200)}`)
          .join("\n");
        return `## ${t.name}\n\n${t.description}\n\n${params ? "Parametry:\n" + params : "Bez parametrów."}`;
      })
      .join("\n\n"),
);

write(
  "predator-map-design/skyboxes.md",
  `${GEN}# Niebo i klimat\n\nUstawiasz je w \`game_settings\` (pole \`skybox\`) albo w skrypcie \`setSkybox(nazwa)\`. Każde niebo ma własne światło, mgłę i kolor odcienia.\n\n| id | nazwa | światło | uwagi |\n|---|---|---|---|\n` + SKYBOXES.map((s) => `| \`${s.id}\` | ${s.name} | ${s.light} | góra ${s.top}, horyzont ${s.horizon}, mgła ${s.fog} |`).join("\n"),
);
