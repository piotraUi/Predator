import { Color3 } from "@babylonjs/core";

export function hexColor(hex: string) {
  return Color3.FromHexString(hex.length === 7 ? hex : "#a3a2a5");
}
