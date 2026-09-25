import path from "node:path";
import { defineConfig } from "vite";
import { sourceHash } from "../shared/sourceHash.ts";

// "app" = budowanie dla aplikacji (exe / APK / iOS) - pliki ładowane lokalnie,
// a adres serwera gracz wpisuje przy logowaniu.
export default defineConfig(({ mode }) => ({
  base: mode === "app" ? "./" : "/",
  define: {
    __APP_MODE__: JSON.stringify(mode === "app"),
    // odcisk kodu - aplikacja porównuje go z serwerem (nowsza wersja na serwerze = komunikat)
    __CLIENT_HASH__: JSON.stringify(sourceHash(path.resolve(import.meta.dirname, ".."))),
  },
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 4000 },
}));
