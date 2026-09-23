// Kopiuje zbudowaną grę (client/dist w trybie aplikacji) do desktop/app
const fs = require("node:fs");
const path = require("node:path");
const src = path.join(__dirname, "..", "client", "dist");
const dst = path.join(__dirname, "app");
if (!fs.existsSync(path.join(src, "index.html"))) {
  console.error("Brak client/dist - najpierw: npm run build:app -w client");
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log("Skopiowano grę do desktop/app");
