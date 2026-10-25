// Paczka skilli dla AI (Claude Code, opencode, Codex): serwer wystawia ją publicznie jako archiwum .tar.gz,
// które rozpakowuje się prosto do folderu skilli programu (jedno polecenie curl | tar).
import express from "express";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const skillsRouter = express.Router();

const ROOT = path.resolve(import.meta.dirname, "..", "..", "skills");

interface SkillFile {
  path: string;
  data: Buffer;
  mtime: number;
}

function collect(dir: string, rel = ""): SkillFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + "/" + e.name : e.name;
    return e.isDirectory() ? collect(abs, r) : e.name.endsWith(".md") ? [{ path: r, data: fs.readFileSync(abs), mtime: Math.floor(fs.statSync(abs).mtimeMs / 1000) }] : [];
  });
}

const octal = (n: number, len: number) => n.toString(8).padStart(len - 1, "0") + "\0";

/** archiwum tar (ustar): nagłówek 512 B + dane dopełnione do 512 B */
export function makeTar(files: { path: string; data: Buffer; mtime?: number }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const name = Buffer.from(f.path, "utf8");
    if (name.length > 99) throw new Error("Za długa ścieżka w paczce: " + f.path);
    const h = Buffer.alloc(512);
    name.copy(h, 0);
    h.write(octal(0o644, 8), 100, "ascii");
    h.write(octal(0, 8), 108, "ascii");
    h.write(octal(0, 8), 116, "ascii");
    h.write(octal(f.data.length, 12), 124, "ascii");
    h.write(octal(f.mtime ?? 0, 12), 136, "ascii");
    h.write("        ", 148, "ascii");
    h.write("0", 156, "ascii");
    h.write("ustar\0" + "00", 257, "ascii");
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
    blocks.push(h, f.data, Buffer.alloc((512 - (f.data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

let cache: { stamp: string; tgz: Buffer; json: string } | null = null;
function pack() {
  const files = collect(ROOT);
  const stamp = files.map((f) => f.path + f.data.length + f.mtime).join("|");
  if (cache?.stamp === stamp) return cache;
  cache = {
    stamp,
    tgz: zlib.gzipSync(makeTar(files), { level: 9 }),
    json: JSON.stringify({ files: files.map((f) => ({ path: f.path, content: f.data.toString("utf8") })) }),
  };
  return cache;
}

skillsRouter.get("/predator-skills.tar.gz", (_req, res) => {
  const p = pack();
  if (!p.tgz.length || !p.stamp) return void res.status(404).json({ error: "Brak paczki skilli na tym serwerze" });
  res.set({ "content-type": "application/gzip", "content-disposition": 'attachment; filename="predator-skills.tar.gz"', "cache-control": "no-cache" }).send(p.tgz);
});

/** te same pliki jako JSON (dla aplikacji i skryptów, które nie mają tar) */
skillsRouter.get("/pack.json", (_req, res) => {
  const p = pack();
  res.set({ "content-type": "application/json", "cache-control": "no-cache" }).send(p.json);
});
