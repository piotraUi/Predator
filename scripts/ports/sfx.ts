// Proste efekty dźwiękowe robione z kodu (jak w oryginale Tunnel Escape, który tworzył je Web Audio).
// Wynik: plik WAV jako data URL.

const RATE = 22050;

type Wave = "sine" | "saw" | "square" | "noise";

interface Tone {
  wave: Wave;
  /** częstotliwość na początku i na końcu (Hz) */
  from: number;
  to: number;
  /** sekundy */
  dur: number;
  /** głośność 0-1 */
  vol: number;
  /** start (s) */
  at?: number;
}

function sample(wave: Wave, phase: number) {
  switch (wave) {
    case "sine":
      return Math.sin(phase * Math.PI * 2);
    case "saw":
      return 2 * (phase - Math.floor(phase + 0.5));
    case "square":
      return phase % 1 < 0.5 ? 1 : -1;
    default:
      return Math.random() * 2 - 1;
  }
}

/** miesza kilka tonów w jeden dźwięk */
export function synth(tones: Tone[]): string {
  const total = Math.max(...tones.map((t) => (t.at ?? 0) + t.dur));
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  for (const t of tones) {
    const start = Math.floor((t.at ?? 0) * RATE);
    const len = Math.floor(t.dur * RATE);
    let phase = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const k = i / len;
      const f = t.from * Math.pow(t.to / t.from, k);
      phase += f / RATE;
      // szybki atak i wybrzmienie
      const env = Math.min(1, i / (RATE * 0.01)) * Math.pow(1 - k, 1.5);
      out[start + i] += sample(t.wave, phase) * env * t.vol;
    }
  }
  return wav(out);
}

/** zapis próbek jako WAV (data URL) */
function wav(out: Float32Array): string {
  const n = out.length;
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(36 + n * 2, 4);
  pcm.write("WAVE", 8);
  pcm.write("fmt ", 12);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(RATE, 24);
  pcm.writeUInt32LE(RATE * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32000), 44 + i * 2);
  return "data:audio/wav;base64," + pcm.toString("base64");
}

export const SFX = {
  /** warczenie potwora */
  growl: () => synth([
    { wave: "saw", from: 110, to: 70, dur: 0.7, vol: 0.5 },
    { wave: "saw", from: 83, to: 55, dur: 0.7, vol: 0.4 },
    { wave: "noise", from: 1, to: 1, dur: 0.5, vol: 0.12 },
  ]),
  /** krzyk przy nagłym spotkaniu */
  scream: () => synth([
    { wave: "saw", from: 900, to: 200, dur: 0.45, vol: 0.5 },
    { wave: "square", from: 1100, to: 260, dur: 0.45, vol: 0.2 },
  ]),
  /** podniesienie klucza */
  key: () => synth([
    { wave: "sine", from: 880, to: 880, dur: 0.15, vol: 0.5 },
    { wave: "sine", from: 1320, to: 1320, dur: 0.3, vol: 0.5, at: 0.12 },
  ]),
  /** amunicja */
  ammo: () => synth([
    { wave: "square", from: 300, to: 200, dur: 0.06, vol: 0.4 },
    { wave: "square", from: 500, to: 400, dur: 0.08, vol: 0.35, at: 0.08 },
  ]),
  /** strzał */
  shot: () => synth([
    { wave: "noise", from: 1, to: 1, dur: 0.25, vol: 0.8 },
    { wave: "square", from: 160, to: 40, dur: 0.2, vol: 0.5 },
  ]),
  /** trafienie potwora */
  hit: () => synth([
    { wave: "saw", from: 400, to: 120, dur: 0.3, vol: 0.5 },
  ]),
  /** wyjście otwarte / wygrana */
  win: () => synth([
    { wave: "square", from: 523, to: 523, dur: 0.15, vol: 0.3 },
    { wave: "square", from: 659, to: 659, dur: 0.15, vol: 0.3, at: 0.15 },
    { wave: "square", from: 784, to: 784, dur: 0.15, vol: 0.3, at: 0.3 },
    { wave: "square", from: 1046, to: 1046, dur: 0.4, vol: 0.3, at: 0.45 },
  ]),
  /** dobra odpowiedź */
  ding: () => synth([
    { wave: "sine", from: 1046, to: 1046, dur: 0.2, vol: 0.5 },
    { wave: "sine", from: 1568, to: 1568, dur: 0.35, vol: 0.4, at: 0.1 },
  ]),
  /** zła odpowiedź */
  buzz: () => synth([
    { wave: "square", from: 140, to: 110, dur: 0.45, vol: 0.35 },
    { wave: "saw", from: 147, to: 116, dur: 0.45, vol: 0.25 },
  ]),
};

// ---------- dźwięki do horroru (Tunnel Escape) ----------

/** własny dźwięk z funkcji próbki (t = sekundy) */
function custom(dur: number, f: (t: number, rnd: () => number) => number): string {
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) out[i] = f(i / RATE, rnd);
  return wav(out);
}
/** filtr dolnoprzepustowy do szumu (miękki, "daleki" dźwięk) */
function lowNoise(k: number) {
  let y = 0;
  return (rnd: () => number) => (y += (rnd() * 2 - 1 - y) * k);
}
const thump = (t: number, at: number, f: number, len: number) => {
  const d = t - at;
  if (d < 0 || d > len) return 0;
  return Math.sin(d * f * Math.PI * 2) * Math.exp(-d * 9) * Math.min(1, d * 200);
};

export const HORROR = {
  /** bicie serca: lub-dub */
  heartbeat: (fast = false) => {
    const gap = fast ? 0.42 : 0.62;
    return custom(fast ? 0.9 : 1.2, (t) => (thump(t, 0, 55, 0.35) + 0.8 * thump(t, 0.18, 48, 0.35) + (fast ? thump(t, gap, 55, 0.35) + 0.8 * thump(t, gap + 0.18, 48, 0.35) : 0)) * 0.9);
  },
  /** szept - szum, który "mówi" (drgająca głośność) */
  whisper: () => {
    const hiss = lowNoise(0.55);
    return custom(2.2, (t, rnd) => {
      const syll = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 4.3) * Math.sin(t * Math.PI * 2 * 1.1);
      const env = Math.sin(Math.min(1, t / 2.2) * Math.PI);
      return hiss(rnd) * syll * env * 0.45;
    });
  },
  /** kroki gdzieś w tunelu */
  steps: () => {
    const n = lowNoise(0.08);
    return custom(2.4, (t, rnd) => {
      let v = 0;
      for (let k = 0; k < 5; k++) {
        const d = t - k * 0.46;
        if (d >= 0 && d < 0.18) v += Math.exp(-d * 30) * (0.6 + 0.4 * Math.sin(d * 90 * Math.PI * 2));
      }
      return n(rnd) * v * 1.4;
    });
  },
  /** łomot metalu w oddali */
  bang: () => {
    const n = lowNoise(0.2);
    return custom(1.6, (t, rnd) => {
      const e = Math.exp(-t * 4);
      return (n(rnd) * 0.8 + Math.sin(t * 97 * Math.PI * 2) * 0.3 + Math.sin(t * 143 * Math.PI * 2) * 0.2) * e * Math.min(1, t * 300);
    });
  },
  /** skrzypienie (jak stare drzwi) */
  creak: () =>
    custom(1.8, (t) => {
      const f = 180 + 60 * Math.sin(t * 3) + 25 * Math.sin(t * 37);
      const e = Math.sin(Math.min(1, t / 1.8) * Math.PI);
      const saw = 2 * ((t * f) % 1) - 1;
      return saw * e * 0.22 * (0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 23));
    }),
  /** niski, narastający dźwięk przy zgaszeniu światła */
  drone: () =>
    custom(3, (t) => {
      const e = Math.min(1, t / 0.4) * Math.max(0, 1 - (t - 2.2) / 0.8);
      return (Math.sin(t * 41 * Math.PI * 2) * 0.5 + Math.sin(t * 43.5 * Math.PI * 2) * 0.5 + Math.sin(t * 82 * Math.PI * 2) * 0.2) * e * 0.5;
    }),
};
