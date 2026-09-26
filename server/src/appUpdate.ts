// Aktualizacja aplikacji (exe / APK / iOS) bez instalowania nowej wersji: serwer udostępnia grę
// zbudowaną w trybie aplikacji (client/dist-app), a aplikacja pobiera ją, gdy jej wersja jest starsza.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { config } from "./config.ts";

const DIR = path.join(config.root, "client", "dist-app");

function listFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}

let cache: { stamp: number; files: string[]; zip: Buffer } | null = null;

/** lista plików i paczka zip (liczone raz, po zbudowaniu gry na nowo - od nowa) */
function bundle() {
  const index = path.join(DIR, "index.html");
  if (!fs.existsSync(index)) return null;
  const stamp = fs.statSync(index).mtimeMs;
  if (cache?.stamp === stamp) return cache;
  const files = listFiles(DIR);
  const entries: Record<string, Uint8Array> = {};
  // obrazki i dźwięki są już skompresowane - nie kompresujemy ich drugi raz
  for (const f of files) entries[f] = fs.readFileSync(path.join(DIR, f));
  const zip = Buffer.from(zipSync(entries, { level: 6 }));
  cache = { stamp, files, zip };
  return cache;
}

export function appUpdateRouter(hash: string) {
  const r = express.Router();
  r.get("/manifest.json", (_req, res) => {
    const b = bundle();
    if (!b) return res.status(404).json({ error: "Brak wersji dla aplikacji - zbuduj grę: npm run build" });
    res.setHeader("Cache-Control", "no-store");
    res.json({ hash, files: b.files, zip: "bundle.zip", size: b.zip.length });
  });
  r.get("/bundle.zip", (_req, res) => {
    const b = bundle();
    if (!b) return res.status(404).end();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Cache-Control", "no-store");
    res.end(b.zip);
  });
  r.use("/files", express.static(DIR, { fallthrough: false, maxAge: 0 }));
  return r;
}
