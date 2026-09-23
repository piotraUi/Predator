// Ustawienia kamery jak w Robloxie: FOV 70°, bez bezwładności, obrót prawym przyciskiem myszy.
import type { ArcRotateCamera, ArcRotateCameraPointersInput } from "@babylonjs/core";

/** Roblox: FieldOfView = 70° (pionowo) */
export const ROBLOX_FOV = (70 * Math.PI) / 180;

/** Stopnie obrotu na piksel ruchu myszy / palca */
const MOUSE_DEG_PER_PX = 0.32;
const TOUCH_DEG_PER_PX = 0.45;

type MapEntry = { source: "pointer"; button: number; interaction: "rotate" | "pan" } | { source: "wheel"; interaction: "zoom" };

/** Gra: prawy przycisk obraca, kółko przybliża (lewy przycisk myszy jest wyłączony w pointerButtons, palec obraca) */
export const GAME_INPUTS: MapEntry[] = [
  { source: "pointer", button: 2, interaction: "rotate" },
  { source: "pointer", button: 0, interaction: "rotate" },
  { source: "wheel", interaction: "zoom" },
];
/** Studio: środkowy przesuwa, palec obraca (prawy przycisk obsługujemy osobno - rozglądanie w miejscu) */
export const STUDIO_INPUTS: MapEntry[] = [
  { source: "pointer", button: 1, interaction: "pan" },
  { source: "pointer", button: 0, interaction: "rotate" },
  { source: "wheel", interaction: "zoom" },
];

export function robloxCamera(camera: ArcRotateCamera, inputs: MapEntry[]) {
  // Babylon 9 domyślnie ma prawy przycisk = przesuwanie; ustawiamy własną mapę
  (camera.movement.input as unknown as { inputMap: MapEntry[] }).inputMap = inputs;
  camera.fov = ROBLOX_FOV;
  // bez "ślizgania się" kamery po puszczeniu myszy
  camera.inertia = 0;
  camera.panningInertia = 0;
  // przy inertia = 0 obrót to dokładnie przesunięcie / czułość
  camera.angularSensibilityX = camera.angularSensibilityY = 180 / Math.PI / MOUSE_DEG_PER_PX;
  camera.wheelDeltaPercentage = 0.1;
  camera.pinchDeltaPercentage = 0.02;
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
}

/**
 * Mysz i dotyk potrzebują innych przycisków: na myszce obracamy prawym (lewy jest do klikania),
 * a palec zawsze ma "button 0". Przełączamy to przy każdym dotknięciu ekranu.
 */
export function pointerButtons(
  camera: ArcRotateCamera,
  canvas: HTMLCanvasElement,
  mouseButtons: number[],
): () => void {
  const ptr = camera.inputs.attached.pointers as ArcRotateCameraPointersInput | undefined;
  const onDown = (e: PointerEvent) => {
    if (!ptr) return;
    const mouse = e.pointerType === "mouse";
    ptr.buttons = mouse ? mouseButtons : [0];
    const deg = mouse ? MOUSE_DEG_PER_PX : TOUCH_DEG_PER_PX;
    camera.angularSensibilityX = camera.angularSensibilityY = 180 / Math.PI / deg;
  };
  const noMenu = (e: Event) => e.preventDefault();
  // capture - musi zadziałać zanim kamera Babylona obsłuży kliknięcie
  canvas.addEventListener("pointerdown", onDown, true);
  canvas.addEventListener("contextmenu", noMenu);
  if (ptr) ptr.buttons = mouseButtons;
  return () => {
    canvas.removeEventListener("pointerdown", onDown, true);
    canvas.removeEventListener("contextmenu", noMenu);
  };
}
