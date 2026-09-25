// Tylko dla Node (vite.config i serwer): "odcisk" kodu gry. Aplikacja ma w sobie odcisk z chwili budowania,
// a serwer liczy go ze swoich plików - jeśli się różnią, na serwerze jest inna (nowsza) wersja gry.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SKIP = /\.test\.ts$/;

function walk(dir: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|css|html)$/.test(e.name) && !SKIP.test(e.name)) out.push(p);
  }
}

/** root = główny folder projektu (z client/ i shared/) */
export function sourceHash(root: string): string {
  const files: string[] = [];
  walk(path.join(root, "client", "src"), files);
  walk(path.join(root, "shared"), files);
  const index = path.join(root, "client", "index.html");
  if (fs.existsSync(index)) files.push(index);
  const h = crypto.createHash("sha1");
  for (const f of files.map((x) => path.relative(root, x).split(path.sep).join("/")).sort()) {
    h.update(f + "\n");
    // końce linii jak w repozytorium (Windows potrafi je zmienić)
    h.update(fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 12);
}
