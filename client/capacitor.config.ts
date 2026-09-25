import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.predator.game",
  appName: "Predator",
  webDir: "dist",
  server: {
    // serwer gry działa na Twojej maszynie po http - pozwalamy na takie połączenia
    cleartext: true,
  },
  plugins: {
    // aplikacja omija wcięcia ekranu (kamera, paski) - odstępy robi CSS
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
