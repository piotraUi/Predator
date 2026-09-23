import { defineConfig } from "vite";

// "app" = budowanie dla aplikacji (exe / APK / iOS) - pliki ładowane lokalnie,
// a adres serwera gracz wpisuje przy logowaniu.
export default defineConfig(({ mode }) => ({
  base: mode === "app" ? "./" : "/",
  define: { __APP_MODE__: JSON.stringify(mode === "app") },
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 4000 },
}));
