// Pliki do pobrania i trailer startowy: trailer Predatora (pokazywany raz nowym graczom i po aktualizacji),
// APK na Androida i instalator na Windows. Admin wgrywa je w panelu (zakładka "Aplikacje"); leżą w data/downloads.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { config } from "./config.ts";

type Kind = "trailer" | "apk" | "setup";
const FILES: Record<Kind, { file: string; label: string; mime: string; ext: RegExp; max: number }> = {
  trailer: { file: "trailer.mp4", label: "Trailer", mime: "video/mp4", ext: /\.mp4$/i, max: 400 * 1024 * 1024 },
  apk: { file: "predator.apk", label: "Android (.apk)", mime: "application/vnd.android.package-archive", ext: /\.apk$/i, max: 600 * 1024 * 1024 },
  setup: { file: "predator-setup.exe", label: "Windows (instalator .exe)", mime: "application/vnd.microsoft.portable-executable", ext: /\.exe$/i, max: 800 * 1024 * 1024 },
};
const dir = path.join(config.dataDir, "downloads");
const isKind = (k: string): k is Kind => k in FILES;

/** ścieżka pliku: wgrany przez admina, a dla trailera - domyślny z repozytorium */
function locate(kind: Kind): string | null {
  const own = path.join(dir, FILES[kind].file);
  if (fs.existsSync(own)) return own;
  if (kind === "trailer") {
    const def = path.join(config.assetsDir, "trailer.mp4");
    if (fs.existsSync(def)) return def;
  }
  return null;
}

function describe(kind: Kind) {
  const p = locate(kind);
  if (!p) return null;
  const st = fs.statSync(p);
  return { size: st.size, at: st.mtimeMs, id: `${Math.round(st.mtimeMs)}-${st.size}`, custom: p.startsWith(dir) };
}

/** publiczne: informacje i pliki */
export function downloadsRouter() {
  const r = express.Router();
  r.get("/api/app-info", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.json({ trailer: describe("trailer"), apk: describe("apk"), setup: describe("setup") });
  });
  // sendFile obsługuje Range, więc film można przewijać i zaczyna grać przed pobraniem całości
  r.get("/media/trailer.mp4", (_req, res) => {
    const p = locate("trailer");
    if (!p) return void res.status(404).end();
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(p);
  });
  for (const kind of ["apk", "setup"] as const)
    r.get("/download/" + FILES[kind].file, (_req, res) => {
      const p = locate(kind);
      if (!p) return void res.status(404).send("Ten plik nie został jeszcze wgrany.");
      res.setHeader("Content-Type", FILES[kind].mime);
      res.download(p, FILES[kind].file);
    });
  return r;
}

/** panel admina: wgrywanie (strumieniowo do pliku, bez trzymania w pamięci) i usuwanie */
export function mountMediaAdmin(admin: express.Router, log: (req: express.Request, action: string, target?: string, details?: string) => void) {
  admin.get("/media", (_req, res) => res.json({ trailer: describe("trailer"), apk: describe("apk"), setup: describe("setup") }));
  admin.put("/media/:kind", async (req, res) => {
    const kind = req.params.kind;
    if (!isKind(kind)) return void res.status(404).json({ error: "Nieznany rodzaj pliku" });
    const spec = FILES[kind];
    const name = decodeURIComponent(String(req.headers["x-file-name"] ?? ""));
    if (!spec.ext.test(name)) return void res.status(400).json({ error: `Ten plik musi mieć rozszerzenie ${spec.ext.source.replace(/\\|\$/g, "")}` });
    const len = Number(req.headers["content-length"] ?? 0);
    if (len > spec.max) return void res.status(413).json({ error: "Plik jest za duży" });
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, spec.file + ".part");
    let bytes = 0;
    req.on("data", (c: Buffer) => {
      bytes += c.length;
      if (bytes > spec.max) req.destroy();
    });
    try {
      await pipeline(req, fs.createWriteStream(tmp));
      if (bytes < 1000) throw new Error("Pusty plik");
      fs.renameSync(tmp, path.join(dir, spec.file));
      log(req, "Wgrano plik: " + spec.label, "", `${(bytes / 1048576).toFixed(1)} MB`);
      res.json({ ok: true, [kind]: describe(kind) });
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      if (!res.headersSent) res.status(400).json({ error: "Nie udało się zapisać pliku: " + (e as Error).message });
    }
  });
  admin.delete("/media/:kind", (req, res) => {
    const kind = req.params.kind;
    if (!isKind(kind)) return void res.status(404).json({ error: "Nieznany rodzaj pliku" });
    fs.rmSync(path.join(dir, FILES[kind].file), { force: true });
    log(req, "Usunięto plik: " + FILES[kind].label);
    res.json({ ok: true });
  });
}
