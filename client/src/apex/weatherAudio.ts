// Apex: dźwięki pogody (szum deszczu, wiatr, grzmoty) syntezowane w przeglądarce - bez plików dźwiękowych.
import type { WeatherId } from "../../../shared/types.ts";

export class WeatherAudio {
  private ctx: AudioContext | null = null;
  private rain: GainNode | null = null;
  private wind: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly resume = () => void this.ctx?.resume().catch(() => {});

  constructor() {
    window.addEventListener("pointerdown", this.resume);
    window.addEventListener("keydown", this.resume);
  }

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = (this.ctx = new AC());
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b = b * 0.97 + w * 0.03; // lekko „brązowy” szum
        d[i] = w * 0.6 + b * 6;
      }
      this.noise = buf;
      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(ctx.destination);
      const loop = (hp: number, lp: number) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f1 = ctx.createBiquadFilter();
        f1.type = "highpass";
        f1.frequency.value = hp;
        const f2 = ctx.createBiquadFilter();
        f2.type = "lowpass";
        f2.frequency.value = lp;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(f1).connect(f2).connect(g).connect(this.master!);
        src.start();
        return { g, f2 };
      };
      this.rain = loop(900, 7000).g;
      const w = loop(80, 600);
      this.wind = w.g;
      this.windFilter = w.f2;
    } catch {
      this.ctx = null;
    }
  }

  /** wywołuj co klatkę: poziomy zależą od pogody, wiatru i tego, czy gracz stoi pod dachem */
  update(weather: WeatherId, wind: number, indoor: number) {
    if (weather === "clear" && wind < 0.05 && !this.ctx) return;
    this.init();
    const ctx = this.ctx;
    if (!ctx || !this.rain || !this.wind) return;
    const wet = weather === "rain" ? 0.35 : weather === "storm" ? 0.6 : 0;
    const muffle = 1 - indoor * 0.8;
    const t = ctx.currentTime;
    this.rain.gain.setTargetAtTime(wet * muffle, t, 0.4);
    const w = (wind * 0.22 + (weather === "storm" ? 0.18 : weather === "snow" ? 0.06 : 0)) * (1 - indoor * 0.7);
    this.wind.gain.setTargetAtTime(w, t, 0.5);
    this.windFilter?.frequency.setTargetAtTime(350 + wind * 700, t, 0.5);
  }

  /** grzmot: głuchy łoskot, który trwa kilka sekund (indoor wycisza) */
  thunder(indoor: number) {
    this.init();
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const delay = 0.2 + Math.random() * 1.8;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    const k = 0.9 * (1 - indoor * 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(k, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 3.4);
  }

  dispose() {
    window.removeEventListener("pointerdown", this.resume);
    window.removeEventListener("keydown", this.resume);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
