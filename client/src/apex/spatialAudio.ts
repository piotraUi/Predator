// Apex: dźwięk 3D. Dźwięki z pozycją (playSoundAt) są ściszane z odległością, panoramowane (HRTF) i przycinane filtrem,
// gdy między źródłem a słuchaczem stoi ściana; pogłos zależy od wielkości pomieszczenia, w którym stoi gracz (promienie
// we wszystkie strony: małe zamknięte pokoje = krótki pogłos, hale i tunele = długi, otwarty teren = prawie bez).
import type { WorldSound } from "../../../shared/types.ts";
import { assetUrl } from "../game/audio3d.ts";
import type { V3 } from "./math.ts";
import { estimateRoom, type RoomInfo } from "./roomAcoustics.ts";

export class SpatialAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private sounds = new Map<string, WorldSound>();
  private decay = 0;
  private listener: { pos: V3; fwd: V3 } = { pos: [0, 0, 0], fwd: [0, 0, 1] };
  private readonly resume = () => void this.ctx?.resume().catch(() => {});
  /** (od, kierunek, dystans) -> odległość do pierwszej przeszkody; ustawia gra */
  cast: (from: V3, dir: V3, max: number) => number | null = () => null;
  room: RoomInfo = { wet: 0, decay: 0.5 };
  private nextRoom = 0;

  constructor(sounds: WorldSound[] = []) {
    for (const s of sounds) this.sounds.set(s.name, s);
    window.addEventListener("pointerdown", this.resume);
    window.addEventListener("keydown", this.resume);
  }

  private init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.reverb = ctx.createConvolver();
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0;
      this.reverb.connect(this.reverbGain).connect(ctx.destination);
      this.rebuildReverb(0.6);
      return ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  /** impuls pogłosu: stereo szum o wykładniczym zaniku */
  private rebuildReverb(decay: number) {
    const ctx = this.ctx;
    if (!ctx || !this.reverb) return;
    this.decay = decay;
    const len = Math.max(256, Math.floor(ctx.sampleRate * decay));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    this.reverb.buffer = buf;
  }

  private load(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      const s = this.sounds.get(name);
      const ctx = this.ctx;
      p = !s || !ctx
        ? Promise.resolve(null)
        : fetch(assetUrl(s.url))
            .then((r) => r.arrayBuffer())
            .then((b) => ctx.decodeAudioData(b))
            .catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }

  /** ustawia słuchacza (kamera); co 0,4 s ponownie ocenia pomieszczenie i dopasowuje pogłos */
  update(pos: V3, fwd: V3, now: number) {
    this.listener = { pos, fwd };
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos[0]; L.positionY.value = pos[1]; L.positionZ.value = pos[2];
      L.forwardX.value = fwd[0]; L.forwardY.value = fwd[1]; L.forwardZ.value = fwd[2];
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }
    if (now >= this.nextRoom) {
      this.nextRoom = now + 400;
      this.room = estimateRoom((d) => this.cast(pos, d, 60));
      this.reverbGain?.gain.setTargetAtTime(this.room.wet * 0.55, ctx.currentTime, 0.25);
      if (Math.abs(this.room.decay - this.decay) > 0.35) this.rebuildReverb(this.room.decay);
    }
  }

  /** zagraj dźwięk w punkcie świata */
  async playAt(name: string, pos: V3, volume = 1) {
    const ctx = this.init();
    if (!ctx || !this.master) return;
    const buf = await this.load(name);
    if (!buf) return;
    const def = this.sounds.get(name);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 10;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = 400;
    panner.positionX.value = pos[0]; panner.positionY.value = pos[1]; panner.positionZ.value = pos[2];
    // przesłanianie: ściana między źródłem a słuchaczem = tłumienie i odcięcie wysokich tonów
    const lp0 = this.listener.pos;
    const dx = pos[0] - lp0[0], dy = pos[1] - lp0[1], dz = pos[2] - lp0[2];
    const dist = Math.hypot(dx, dy, dz) || 1;
    const hit = this.cast(lp0, [dx / dist, dy / dist, dz / dist], dist);
    const blocked = hit !== null && hit < dist - 0.8;
    lp.frequency.value = blocked ? 650 : 18000;
    gain.gain.value = (def?.volume ?? 0.8) * volume * (blocked ? 0.45 : 1);
    src.connect(lp).connect(gain).connect(panner).connect(this.master);
    // część dźwięku idzie do pogłosu pomieszczenia (w którym stoi słuchacz)
    if (this.reverb) panner.connect(this.reverb);
    src.start();
  }

  dispose() {
    window.removeEventListener("pointerdown", this.resume);
    window.removeEventListener("keydown", this.resume);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
