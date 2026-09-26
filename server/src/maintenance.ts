// Utrzymanie serwera: codzienne kopie zapasowe bazy i aktualizacja jednym przyciskiem (panel admina).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { db } from "./db.ts";

// ---------- kopie zapasowe ----------

export const BACKUP_DIR = path.join(config.dataDir, "backups");
/** ile kopii trzymamy (najstarsze są usuwane) */
const KEEP = 14;
const DAY = 24 * 3600 * 1000;
export const BACKUP_NAME_RE = /^predator-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(-[a-z]+)?\.db$/;

export interface BackupInfo {
  name: string;
  size: number;
  at: number;
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => BACKUP_NAME_RE.test(f))
    .map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, at: st.mtimeMs };
    })
    .sort((a, b) => b.at - a.at);
}

/** kopia całej bazy (spójna, także gdy serwer działa) */
export function backupNow(tag = ""): BackupInfo {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const name = `predator-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}${tag ? "-" + tag : ""}.db`;
  const file = path.join(BACKUP_DIR, name);
  if (fs.existsSync(file)) fs.rmSync(file);
  db.prepare("VACUUM INTO ?").run(file);
  // stare kopie usuwamy
  for (const old of listBackups().slice(KEEP)) fs.rmSync(path.join(BACKUP_DIR, old.name), { force: true });
  const st = fs.statSync(file);
  console.log(`Kopia zapasowa bazy: ${name}`);
  return { name, size: st.size, at: st.mtimeMs };
}

/** codziennie jedna kopia (przy starcie, jeśli ostatnia jest starsza niż doba) */
export function startBackups() {
  const check = () => {
    try {
      const last = listBackups()[0];
      if (!last || Date.now() - last.at > DAY) backupNow();
    } catch (e) {
      console.error("Kopia zapasowa nie udała się:", e);
    }
  };
  check();
  setInterval(check, 3600 * 1000).unref();
}

// ---------- aktualizacja serwera ----------

/** plik-znak dla skryptu startowego: "uruchom ponownie" */
export const RESTART_FLAG = path.join(config.dataDir, ".restart");
/** serwer uruchomiony przez start-server.bat / .sh (umie się sam uruchomić ponownie) */
export const supervised = process.env.PREDATOR_SUPERVISED === "1";

interface UpdateState {
  running: boolean;
  log: string[];
  error: string | null;
  done: boolean;
}
export const updateState: UpdateState = { running: false, log: [], error: null, done: false };

function run(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: config.root, shell: process.platform === "win32" });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", (e) => resolve({ code: -1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? -1, out: out.trim() }));
  });
}

export const isGitRepo = () => fs.existsSync(path.join(config.root, ".git"));

/** czy na GitHubie jest coś nowego */
export async function checkUpdates(): Promise<{ git: boolean; branch?: string; behind?: number; commits?: string[]; error?: string }> {
  if (!isGitRepo()) return { git: false };
  const fetch = await run("git", ["fetch", "--quiet"]);
  if (fetch.code !== 0) return { git: true, error: "Nie udało się połączyć z GitHubem: " + fetch.out.slice(0, 300) };
  const branch = (await run("git", ["rev-parse", "--abbrev-ref", "HEAD"])).out;
  const count = await run("git", ["rev-list", "--count", "HEAD..@{u}"]);
  if (count.code !== 0) return { git: true, branch, error: "Ta gałąź nie śledzi żadnej gałęzi na GitHubie" };
  const log = await run("git", ["log", "--format=%s", "-n", "15", "HEAD..@{u}"]);
  return { git: true, branch, behind: Number(count.out) || 0, commits: log.out ? log.out.split("\n") : [] };
}

/** kopia bazy, git pull i ponowne uruchomienie (budowanie robi skrypt startowy) */
export async function runUpdate(onRestart: () => void) {
  if (updateState.running) return;
  Object.assign(updateState, { running: true, log: [], error: null, done: false });
  const say = (t: string) => updateState.log.push(t);
  try {
    if (!isGitRepo()) throw new Error("Serwer nie jest pobrany przez „git clone” - zaktualizuj go ręcznie (pobierz nową wersję z GitHuba).");
    say("💾 Kopia zapasowa bazy…");
    say("   " + backupNow("przed-aktualizacja").name);
    say("⬇️ Pobieram nową wersję (git pull)…");
    const pull = await run("git", ["pull", "--ff-only"]);
    say(pull.out || "(brak komunikatu)");
    if (pull.code !== 0) throw new Error("git pull się nie udał - może ktoś zmieniał pliki na serwerze? Szczegóły powyżej.");
    if (!supervised) {
      say("⚠️ Serwer nie został uruchomiony przez start-server.bat / start-server.sh - uruchom go ponownie ręcznie, żeby zmiany zadziałały.");
      updateState.done = true;
      return;
    }
    say("🔁 Uruchamiam serwer ponownie (instalacja i budowanie gry potrwają chwilę)…");
    updateState.done = true;
    fs.writeFileSync(RESTART_FLAG, String(Date.now()));
    setTimeout(onRestart, 1500);
  } catch (e) {
    updateState.error = (e as Error).message;
    say("❌ " + updateState.error);
  } finally {
    updateState.running = false;
  }
}
