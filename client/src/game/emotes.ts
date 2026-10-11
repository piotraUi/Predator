// Nazwy emotek w menu i komendy czatu (/e taniec) - wspólne dla silników Babylon i Apex.
import type { Emote } from "../../../shared/types.ts";

export const EMOTE_LABELS: Record<Emote, string> = {
  wave: "👋 Machaj",
  dance: "💃 Tańcz",
  cheer: "🙌 Wiwatuj",
  point: "👉 Wskaż",
  sit: "🪑 Usiądź",
  flip: "🤸 Salto",
  spin: "🌀 Bączek",
  clap: "👏 Oklaski",
  robotdance: "🤖 Robot",
  floss: "🕺 Floss",
  bow: "🙇 Ukłon",
  jumpjacks: "🤾 Pajacyki",
  zombie: "🧟 Zombie",
};
/** komendy czatu: /e taniec, /e dance ... */
export const EMOTE_ALIASES: Record<string, Emote> = {
  wave: "wave", machaj: "wave", hej: "wave",
  dance: "dance", taniec: "dance", tancz: "dance", "tańcz": "dance",
  cheer: "cheer", wiwat: "cheer", wiwatuj: "cheer",
  point: "point", wskaz: "point", "wskaż": "point",
  sit: "sit", siad: "sit", usiadz: "sit", "usiądź": "sit",
  flip: "flip", salto: "flip", spin: "spin", baczek: "spin", "bączek": "spin", clap: "clap", oklaski: "clap",
  robot: "robotdance", floss: "floss", bow: "bow", uklon: "bow", "ukłon": "bow", pajacyki: "jumpjacks", zombie: "zombie",
};
