// Konto "Predator" - zawsze istnieje, ma swój wygląd, wszystkie przedmioty, monety i jest adminem.
// Hasło zapisuje się w pliku w folderze danych (albo ustawiasz je zmienną PREDATOR_PASSWORD).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CATALOG, DEFAULT_AVATAR } from "../../shared/catalog.ts";
import type { Avatar } from "../../shared/types.ts";
import { hashPassword } from "./auth.ts";
import { config } from "./config.ts";
import { DEMO_OWNER } from "./creators.ts";
import { users, type UserRow } from "./db.ts";

/** Wygląd konta Predator */
export const PREDATOR_SKIN: Avatar = {
  ...DEFAULT_AVATAR,
  head: "#f5cd30",
  arms: "#f5cd30",
  torso: "#111111",
  legs: "#1f1f1f",
  hat: "predatorcrown",
  face: "cool",
  shirt: "predator-shirt",
  pants: "black-pants",
  back: "predator-wings",
  neck: "necklace",
};

const PASSWORD_FILE = () => path.join(config.dataDir, "konto-predator.txt");

/** czytelne hasło bez mylących znaków */
function newPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(14), (b) => abc[b % abc.length]).join("");
}

export function setupPredatorAccount(): UserRow {
  let user = users.byName(DEMO_OWNER);
  const envPass = process.env.PREDATOR_PASSWORD;
  const file = PASSWORD_FILE();
  let password: string | null = null;
  if (envPass && envPass.length >= 6) password = envPass;
  else if (!fs.existsSync(file)) password = newPassword();
  if (!user) {
    const { hash, salt } = hashPassword(password ?? newPassword());
    user = users.create(DEMO_OWNER, hash, salt);
  } else if (password) {
    const { hash, salt } = hashPassword(password);
    users.setPassword(user.id, hash, salt);
  }
  if (password && !envPass) {
    fs.writeFileSync(
      file,
      `Konto administratora gry Predator\n\nNick:  ${DEMO_OWNER}\nHasło: ${password}\n\n` +
        `Zmień hasło, ustawiając zmienną PREDATOR_PASSWORD przed uruchomieniem serwera,\n` +
        `albo usuń ten plik - przy następnym starcie serwer wymyśli nowe hasło.\n`,
    );
    console.log(`  🔑 Konto ${DEMO_OWNER}: hasło zapisane w ${file}`);
  }
  // za każdym razem: wygląd, wszystkie przedmioty i dużo monet
  users.setAvatar(user.id, PREDATOR_SKIN);
  users.setInventory(user.id, CATALOG.map((i) => i.id));
  if (user.coins < 1_000_000) users.setCoins(user.id, 1_000_000);
  users.setBanned(user.id, false);
  return users.byId(user.id)!;
}
