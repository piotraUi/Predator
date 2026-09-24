// Wspólne kawałki portów gier.
import fs from "node:fs";
import type { BadgeDef, WorldScript, WorldSound } from "../../shared/types.ts";
import { newId } from "../../shared/world.ts";

/** powtarzalne losowanie - ta sama mapa przy każdym uruchomieniu skryptu */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0xffffffff);
}

export const dataUrl = (file: string, mime: string) => `data:${mime};base64,` + fs.readFileSync(file).toString("base64");

export const script = (name: string, source: string): WorldScript => ({ id: newId(), name, type: "lua", enabled: true, source });

export const sound = (name: string, url: string, volume = 0.8): WorldSound => ({ id: newId(), name, url, volume });

export const badge = (name: string, icon: string, description: string, reward: number): BadgeDef => ({
  id: newId(),
  name,
  icon,
  description,
  trigger: "script",
  reward,
});
