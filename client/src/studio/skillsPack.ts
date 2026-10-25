// Paczka skilli dla AI (Claude Code, opencode, Codex): pliki SKILL.md z folderu skills/ w repozytorium,
// wbudowane w aplikację, żeby dało się je zainstalować jednym kliknięciem także bez serwera.
const raw = import.meta.glob("../../../skills/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export interface SkillFile {
  /** np. predator-3d-building/SKILL.md */
  path: string;
  content: string;
}
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
}

export function skillFiles(): SkillFile[] {
  return Object.entries(raw)
    .map(([p, content]) => ({ path: p.replace(/^.*\/skills\//, ""), content }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** nazwy i opisy skilli z nagłówków SKILL.md */
export function skillList(): SkillInfo[] {
  return skillFiles()
    .filter((f) => f.path.endsWith("/SKILL.md"))
    .map((f) => {
      const fm = /^---\n([\s\S]*?)\n---/.exec(f.content)?.[1] ?? "";
      const get = (k: string) => new RegExp(`^${k}:\\s*(.*)$`, "m").exec(fm)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
      return { id: f.path.split("/")[0], name: get("name") || f.path.split("/")[0], description: get("description") };
    });
}
