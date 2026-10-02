// Gotowe szablony narzędzi i broni oraz ich ikony.
import type { ToolDef, ToolModel, ToolType } from "./types.ts";

export const TOOL_TYPE_LABELS: Record<ToolType, string> = {
  melee: "Broń wręcz",
  ranged: "Broń strzelająca",
  heal: "Leczenie",
  boost: "Przyspieszenie",
  custom: "Własne (dla skryptów)",
};

export const TOOL_MODELS: Record<ToolModel, { label: string; icon: string }> = {
  sword: { label: "Miecz", icon: "🗡️" },
  axe: { label: "Topór", icon: "🪓" },
  hammer: { label: "Młot", icon: "🔨" },
  pistol: { label: "Pistolet", icon: "🔫" },
  rifle: { label: "Karabin", icon: "🎯" },
  blaster: { label: "Blaster", icon: "⚡" },
  wand: { label: "Różdżka", icon: "🪄" },
  medkit: { label: "Apteczka", icon: "🩹" },
  potion: { label: "Mikstura", icon: "🧪" },
  coffee: { label: "Kawa", icon: "☕" },
  phone: { label: "Telefon", icon: "📱" },
};

type Template = Omit<ToolDef, "id">;

export const TOOL_TEMPLATES: Template[] = [
  { name: "Miecz", type: "melee", model: "sword", color: "#c9d1d9", damage: 25, range: 7, cooldown: 0.6, heal: 0, boost: 0, starter: false },
  { name: "Topór", type: "melee", model: "axe", color: "#8b8f96", damage: 35, range: 6, cooldown: 1, heal: 0, boost: 0, starter: false },
  { name: "Młot", type: "melee", model: "hammer", color: "#6b6f76", damage: 45, range: 6, cooldown: 1.5, heal: 0, boost: 0, starter: false },
  { name: "Pistolet", type: "ranged", model: "pistol", color: "#2b2d31", damage: 15, range: 120, cooldown: 0.4, heal: 0, boost: 0, starter: false },
  { name: "Karabin", type: "ranged", model: "rifle", color: "#3d4a2f", damage: 20, range: 250, cooldown: 0.25, heal: 0, boost: 0, starter: false },
  { name: "Blaster", type: "ranged", model: "blaster", color: "#00d4ff", damage: 30, range: 150, cooldown: 0.8, heal: 0, boost: 0, starter: false },
  { name: "Różdżka", type: "ranged", model: "wand", color: "#b388ff", damage: 20, range: 90, cooldown: 0.5, heal: 0, boost: 0, starter: false },
  { name: "Apteczka", type: "heal", model: "medkit", color: "#ffffff", damage: 0, range: 0, cooldown: 5, heal: 40, boost: 0, starter: false },
  { name: "Mikstura", type: "heal", model: "potion", color: "#ff3b6b", damage: 0, range: 0, cooldown: 8, heal: 100, boost: 0, starter: false },
  { name: "Kawa", type: "boost", model: "coffee", color: "#6f4e37", damage: 0, range: 0, cooldown: 12, heal: 0, boost: 6, starter: false },
];

export const toolIcon = (t: Pick<ToolDef, "model">) => TOOL_MODELS[t.model]?.icon ?? "🔧";
