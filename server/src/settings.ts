// Ustawienia serwera zmieniane w panelu admina (klucze AI, włączniki) - tabela settings w bazie.
import { db } from "./db.ts";

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export const settings = {
  get: (key: string) => (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value,
  set: (key: string, value: string | null) =>
    value === null
      ? db.prepare("DELETE FROM settings WHERE key = ?").run(key)
      : db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value),
};
