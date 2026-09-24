// Dźwięki, muzyka i mowa w grach 3D (skrypty: playSound, setMusic, speak).
import type { WorldSound } from "../../../shared/types.ts";
import { getServerUrl } from "../api.ts";

/** pliki z serwera (/game-assets/...) - w aplikacji .exe / APK strona nie jest na serwerze */
export function assetUrl(url: string) {
  if (!url.startsWith("/game-assets/")) return url;
  const base = getServerUrl();
  return base ? base.replace(/\/$/, "") + url : url;
}

export class GameAudio {
  private sounds = new Map<string, WorldSound>();
  private music: HTMLAudioElement | null = null;
  private musicName = "";
  private pendingMusic = false;
  private readonly unlock = () => {
    if (this.pendingMusic) this.music?.play().then(() => (this.pendingMusic = false), () => {});
  };

  constructor(sounds: WorldSound[] = [], music?: string) {
    for (const s of sounds) this.sounds.set(s.name, s);
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
    if (music) this.setMusic(music);
  }

  play(name: string) {
    const s = this.sounds.get(name);
    if (!s) return;
    const a = new Audio(assetUrl(s.url));
    a.volume = s.volume;
    a.play().catch(() => {});
  }

  setMusic(name: string) {
    if (name === this.musicName) return;
    this.musicName = name;
    this.music?.pause();
    this.music = null;
    const s = name ? this.sounds.get(name) : undefined;
    if (!s) return;
    const a = new Audio(assetUrl(s.url));
    a.loop = true;
    a.volume = s.volume * 0.6;
    this.music = a;
    // przeglądarki grają muzykę dopiero po pierwszym kliknięciu / klawiszu
    a.play().catch(() => (this.pendingMusic = true));
  }

  speak(text: string, lang = "pl-PL") {
    if (!("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.8;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang.toLowerCase().slice(0, 2)));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  dispose() {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
    this.music?.pause();
    this.music = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
}
