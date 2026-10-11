// Dźwięki świata z bloków: szum i tony (bez plików) - wspólne dla silników Babylon i Apex.
import { block } from "../../../shared/voxel.ts";

export class Sfx {
  private ac: AudioContext | null = null;
  private ctx() {
    if (!this.ac) {
      try {
        this.ac = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ac.state === "suspended") void this.ac.resume();
    return this.ac;
  }
  noise(dur: number, freq: number, vol: number, q = 1) {
    const ac = this.ctx();
    if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }
  tone(freq: number, dur: number, vol: number, type: OscillatorType = "square") {
    const ac = this.ctx();
    if (!ac) return;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  }
  dig(id: number) {
    const def = block(id);
    const stone = def?.pick;
    this.noise(0.12, stone ? 1800 : id === 7 ? 3000 : 700, 0.35, stone ? 3 : 1);
  }
  play(name: string) {
    if (name === "place") this.noise(0.09, 500, 0.4);
    else if (name === "craft") (this.tone(660, 0.08, 0.06), setTimeout(() => this.tone(880, 0.1, 0.06), 70));
    else if (name === "fire") this.noise(0.4, 400, 0.25, 0.5);
    else if (name === "eat") for (let i = 0; i < 3; i++) setTimeout(() => this.noise(0.08, 1200, 0.3, 2), i * 120);
    else if (name === "boom") (this.noise(1.2, 120, 1.2, 0.4), this.noise(0.5, 600, 0.5, 0.5));
    else if (name === "hiss") this.noise(1.5, 4000, 0.15, 0.3);
    else if (name === "hit") this.noise(0.1, 900, 0.5, 2);
    else if (name === "hurt") this.tone(180, 0.15, 0.08, "sawtooth");
  }
}
