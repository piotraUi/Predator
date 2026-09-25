import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

/** Ustawienia serwera - można zmienić zmiennymi środowiskowymi. */
export const config = {
  /** główny folder projektu */
  root,
  port: Number(process.env.PORT ?? 2567),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(root, "data")),
  clientDist: path.join(root, "client", "dist"),
  /** Pliki dołączone do serwera (np. miniaturki przykładowych gier) */
  assetsDir: path.join(root, "server", "assets"),
  /** konta z dostępem do panelu admina */
  admins: ["piotrek53_3", "Predator"],
  /** gry .pgame dołączone do serwera */
  gamesDir: path.join(root, "games"),
  /** Monety za każdą minutę grania */
  coinsPerMinute: 2,
  /** Maksymalnie monet z grania na dzień */
  dailyEarnCap: 200,
  /** Codzienny bonus za zalogowanie */
  dailyBonus: 25,
  /** Monety dla twórcy za każde wejście innego gracza do jego gry */
  creatorCoinsPerVisit: 1,
};
