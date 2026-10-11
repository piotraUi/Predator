// Muzyka do trailera Predatora: syntezator napisany od zera (bez próbek). 120 BPM, takty od 4.0 s co 2 s,
// uderzenia zsynchronizowane z rozdziałami filmu. Użycie: node music.mjs wyjście.wav
import fs from "node:fs";

const SR = 48000, DUR = 80.6, N = Math.floor(SR * DUR);
const T0 = 4.0, BAR = 2.0, BEAT = 0.5, S16 = 0.125;
const HITS = [4, 10, 22, 30, 44, 54, 66, 74];

// ---------- szum deterministyczny ----------
let seed = 90210;
const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 374761393) | 0; return ((seed >>> 0) % 1000003) / 1000003; };
const noise = () => rnd() * 2 - 1;

// ---------- szyny ----------
const mk = () => new Float32Array(N);
const dryL = mk(), dryR = mk(), revL = mk(), revR = mk(), dlyL = mk(), dlyR = mk();
const duck = new Float32Array(N).fill(1);

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clampi = (i) => Math.max(0, Math.min(N - 1, i));

// pan: -1..1, send: pogłos, dly: opóźnienie
function add(i, v, pan, send, dly) {
  const l = v * Math.cos(((pan + 1) * Math.PI) / 4), r = v * Math.sin(((pan + 1) * Math.PI) / 4);
  dryL[i] += l; dryR[i] += r;
  if (send) { revL[i] += l * send; revR[i] += r * send; }
  if (dly) { dlyL[i] += l * dly; dlyR[i] += r * dly; }
}

// ---------- generatory ----------
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/** głos: oscylatory (saw / square / sine / tri) z odstrojeniem, ADSR, filtr dolnoprzepustowy z obwiednią */
function tone(o) {
  const { t, dur, f, amp = 0.2, wave = "saw", det = [0], a = 0.01, d = 0.1, s = 0.7, r = 0.2, lp = 8000, lpEnd = lp, pan = 0, send = 0, dly = 0, duckAmt = 0, pw = 0.5 } = o;
  const i0 = Math.floor(t * SR), len = Math.floor((dur + r) * SR);
  const ph = det.map(() => rnd());
  const inc = det.map((c) => (f * Math.pow(2, c / 1200)) / SR);
  let y = 0;
  for (let n = 0; n < len; n++) {
    const i = i0 + n;
    if (i < 0 || i >= N) continue;
    const tt = n / SR;
    // obwiednia
    let e;
    if (tt < a) e = tt / a;
    else if (tt < a + d) e = 1 - (1 - s) * ((tt - a) / d);
    else if (tt < dur) e = s;
    else e = s * Math.max(0, 1 - (tt - dur) / r);
    if (e <= 0 && tt > dur) break;
    let v = 0;
    for (let k = 0; k < inc.length; k++) {
      let p = ph[k]; const dt = inc[k];
      let x;
      if (wave === "saw") x = 2 * p - 1 - polyblep(p, dt);
      else if (wave === "square") { x = p < pw ? 1 : -1; x += polyblep(p, dt); x -= polyblep((p + 1 - pw) % 1, dt); }
      else if (wave === "tri") x = 4 * Math.abs(p - 0.5) - 1;
      else x = Math.sin(2 * Math.PI * p);
      v += x;
      p += dt; if (p >= 1) p -= 1; ph[k] = p;
    }
    v /= inc.length;
    // filtr
    const cut = lp + (lpEnd - lp) * Math.min(1, tt / Math.max(0.001, dur));
    const g = 1 - Math.exp((-2 * Math.PI * cut) / SR);
    y += g * (v - y);
    const dk = 1 - duckAmt * (1 - duck[i]);
    add(i, y * e * amp * dk, pan, send, dly);
  }
}
function kick(t, amp = 0.9) {
  const i0 = Math.floor(t * SR), len = Math.floor(0.5 * SR);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const f = 42 + 130 * Math.exp(-tt * 28);
    ph += (2 * Math.PI * f) / SR;
    const e = Math.exp(-tt * 7.5);
    const click = Math.exp(-tt * 600) * noise() * 0.25;
    const i = i0 + n; if (i >= N) break;
    add(i, (Math.sin(ph) * e + click) * amp, 0, 0.02, 0);
  }
}
function clap(t, amp = 0.5, send = 0.35) {
  const i0 = Math.floor(t * SR), len = Math.floor(0.35 * SR);
  let lo = 0, hi = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    let e = Math.exp(-tt * 16);
    for (const off of [0, 0.011, 0.022]) if (tt > off && tt < off + 0.006) e = Math.max(e, 0.9);
    const x = noise();
    lo += 0.35 * (x - lo); hi += 0.04 * (x - hi);
    const band = lo - hi;
    const i = i0 + n; if (i >= N) break;
    add(i, band * e * amp * 3 + Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 40) * amp * 0.3, 0.05, send, 0);
  }
}
function hat(t, amp = 0.18, open = false, pan = 0.25) {
  const i0 = Math.floor(t * SR), len = Math.floor((open ? 0.22 : 0.05) * SR);
  let prev = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const x = noise();
    const hp = x - prev; prev = x * 0.4 + prev * 0.6;
    const i = i0 + n; if (i >= N) break;
    add(i, hp * Math.exp(-tt * (open ? 14 : 70)) * amp, pan, 0.08, 0);
  }
}
/** narastający szum (riser) od t0 do t1 */
function riser(t0, t1, amp = 0.35, reverse = false) {
  const i0 = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let lo = 0, lo2 = 0;
  for (let n = 0; n < len; n++) {
    const u = n / len;
    const cut = 300 + 9000 * u * u;
    const g = 1 - Math.exp((-2 * Math.PI * cut) / SR);
    const x = noise();
    lo += g * (x - lo); lo2 += g * (lo - lo2);
    const hp = lo - lo2 * 0.5;
    const env = reverse ? u * u * u : u * u;
    const i = i0 + n; if (i >= N) break;
    add(i, (lo - lo2) * 4 * env * amp + hp * 0.2 * env * amp * u, (u - 0.5) * 0.6, 0.25, 0);
  }
}
/** uderzenie filmowe: sub-boom + szum + chwila ciszy przed */
function impact(t, size = 1) {
  const i0 = Math.floor(t * SR), len = Math.floor((2.8 * size + 0.4) * SR);
  let ph = 0, lo = 0;
  for (let n = 0; n < len; n++) {
    const tt = n / SR;
    const f = 34 + 70 * Math.exp(-tt * 2.2);
    ph += (2 * Math.PI * f) / SR;
    const sub = Math.sin(ph) * Math.exp(-tt * (1.1 / size)) * 0.85 * Math.min(1, size);
    const x = noise();
    lo += (0.18 - 0.14 * Math.exp(-tt * 3)) * (x - lo);
    const crash = lo * Math.exp(-tt * (1.6 / size)) * 0.9 * size;
    const i = i0 + n; if (i >= N) break;
    add(i, sub + crash, 0, 0.5 * size, 0);
  }
}
function crashCymbal(t, amp = 0.3, len = 2.5) {
  const i0 = Math.floor(t * SR), L = Math.floor(len * SR);
  let prev = 0, prev2 = 0;
  for (let n = 0; n < L; n++) {
    const tt = n / SR;
    const x = noise();
    const hp = x - prev; prev = x; const hp2 = hp - prev2; prev2 = hp;
    const i = i0 + n; if (i >= N) break;
    add(i, hp2 * Math.exp(-tt * 2.2) * amp, 0.1, 0.45, 0);
  }
}


// ---------- plan utworu ----------
const CHORDS = {
  Dm: { root: 38, notes: [62, 65, 69, 74] },
  Bb: { root: 34, notes: [58, 62, 65, 70] },
  F: { root: 29, notes: [60, 65, 69, 72] },
  C: { root: 36, notes: [55, 60, 64, 67] },
  A: { root: 33, notes: [57, 61, 64, 69] },
  Gm: { root: 31, notes: [55, 58, 62, 67] },
  D: { root: 38, notes: [62, 66, 69, 74] },
};
const PLAN = { 0: "Dm", 1: "Bb", 2: "A", 3: "Dm", 4: "Bb", 5: "F", 6: "C", 7: "Dm", 8: "A", 9: "Bb", 10: "F", 11: "C", 12: "A", 13: "Dm", 14: "Bb", 15: "F", 16: "C", 17: "Dm", 18: "Bb", 19: "A", 20: "Dm", 21: "Bb", 22: "F", 23: "C", 24: "A", 25: "Dm", 26: "Bb", 27: "F", 28: "C", 29: "Bb", 30: "A", 31: "Bb", 32: "F", 33: "C", 34: "A", 35: "D", 36: "D", 37: "D" };
const barChord = (n) => (n < 0 ? "Dm" : PLAN[n] ?? "D");
const HOOK = {
  Dm: [74, 0, 0, 74, 0, 77, 0, 0, 76, 0, 74, 0, 69, 0, 0, 0],
  Bb: [74, 0, 0, 74, 0, 77, 0, 0, 79, 0, 77, 0, 74, 0, 0, 0],
  F: [72, 0, 0, 72, 0, 77, 0, 0, 76, 0, 72, 0, 69, 0, 0, 0],
  C: [72, 0, 0, 72, 0, 76, 0, 0, 79, 0, 76, 0, 72, 0, 0, 0],
  A: [73, 0, 76, 0, 81, 0, 76, 0, 73, 0, 76, 0, 81, 0, 85, 0],
  D: [78, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Gm: [74, 0, 0, 74, 0, 77, 0, 0, 79, 0, 77, 0, 74, 0, 0, 0],
};
// sekcje (numery taktów od 4.0 s)
const SEC = { logo: [0, 2], drop: [3, 8], avatar: [9, 12], make: [13, 19], types: [20, 24], apex: [25, 30], together: [31, 34], end: [35, 99] };
const inSec = (n, k) => n >= SEC[k][0] && n <= SEC[k][1];
const isFull = (n) => inSec(n, "drop") || inSec(n, "make") || inSec(n, "apex");
const endBars = new Set([2, 8, 12, 19, 24, 30, 34]); // takty z narastaniem przed uderzeniem

const nBars = Math.ceil((DUR - 0.0) / BAR);
const bars = [];
for (let b = -2; b < nBars; b++) bars.push({ n: b, t: T0 + b * BAR });

const kickTimes = [];
const events = [];
const kickAt = (t, a = 0.9) => { kickTimes.push(t); events.push(() => kick(t, a)); };

for (const { n, t } of bars) {
  const s = (k) => t + k * S16;
  if (n < 0) continue;
  const fill = endBars.has(n);
  if (inSec(n, "logo")) { kickAt(s(0), 0.7); if (n === 2) { kickAt(s(8), 0.6); } }
  if (inSec(n, "drop") || inSec(n, "make") || inSec(n, "apex")) {
    const amp = inSec(n, "apex") ? 1.0 : 0.95;
    if (!(fill && n !== 8 && n !== 19 && n !== 30)) for (const k of [0, 4, 8, 12]) kickAt(s(k), amp);
    events.push(() => clap(s(4), 0.65)); events.push(() => clap(s(12), 0.65));
    for (let k = 0; k < 16; k++) if (k % 2 === 0) events.push(() => hat(s(k), 0.1, false)); else if (k % 4 === 2) events.push(() => hat(s(k), 0.15, true, -0.2));
  }
  if (inSec(n, "avatar")) {
    kickAt(s(0), 0.85); kickAt(s(6), 0.6); kickAt(s(8), 0.85); kickAt(s(14), 0.6);
    events.push(() => clap(s(4), 0.5)); events.push(() => clap(s(12), 0.5));
    for (let k = 0; k < 16; k += 2) events.push(() => hat(s(k), 0.09)); 
    for (const k of [3, 7, 11, 15]) events.push(() => hat(s(k), 0.12, true, -0.3));
  }
  if (inSec(n, "types")) {
    for (const k of [0, 4, 8, 12]) kickAt(s(k), 0.9);
    events.push(() => clap(s(4), 0.55)); events.push(() => clap(s(12), 0.55));
    for (let k = 0; k < 16; k++) events.push(() => hat(s(k), k % 4 === 0 ? 0.13 : 0.07, false, ((k * 3) % 5 - 2) * 0.2));
  }
  if (inSec(n, "together")) {
    kickAt(s(0), 0.75); kickAt(s(8), 0.7);
    events.push(() => clap(s(4), 0.4, 0.45)); events.push(() => clap(s(12), 0.4, 0.45));
    for (let k = 0; k < 16; k += 2) events.push(() => hat(s(k), 0.07));
  }
  if (fill) for (let k = 8; k < 16; k++) { const v = 0.18 + ((k - 8) / 7) * 0.55; events.push(() => clap(s(k), v, 0.25)); }
  if (n === 35) { kickAt(s(0), 1.0); kickAt(s(8), 0.8); }
}
// intro: puls przed pierwszym uderzeniem
for (const [tk, a] of [[1.2, 0.3], [1.7, 0.35], [2.2, 0.4], [2.6, 0.45], [2.95, 0.5], [3.25, 0.55], [3.5, 0.6], [3.72, 0.7]]) kickAt(tk, a);
for (const h of HITS) kickAt(h, 1.0);

for (const tk of kickTimes) {
  const i0 = Math.floor(tk * SR);
  for (let n = 0; n < 0.3 * SR; n++) { const i = i0 + n; if (i >= N) break; const d = 1 - 0.85 * Math.exp(-n / (0.07 * SR)); if (d < duck[i]) duck[i] = d; }
}
for (const e of events) e();

const impSizes = [1.5, 1.1, 1.0, 1.1, 1.0, 1.2, 1.1, 1.8];
HITS.forEach((h, i) => impact(h, impSizes[i]));
riser(0.4, 4.0, 0.3);
for (const [a, b] of [[8, 10], [20, 22], [28, 30], [42, 44], [52, 54], [64, 66], [72, 74]]) riser(a, b - 0.02, 0.42);
for (const h of [4, 10, 22, 30, 44, 54, 66, 74]) crashCymbal(h, h === 74 ? 0.42 : 0.28, h === 74 ? 4.5 : 2.4);

// ---------- melodia i harmonia ----------
for (const { n, t } of bars) {
  const name = barChord(n);
  const ch = CHORDS[name];
  const full = isFull(n);
  // pad
  const padAmp = n < 0 ? 0.06 : inSec(n, "logo") ? 0.09 : full ? 0.1 : inSec(n, "together") ? 0.12 : 0.09;
  const padLp = n < 3 ? 1400 : full ? 3500 : 2600;
  for (const m of ch.notes.slice(0, 3)) tone({ t: t - 0.02, dur: BAR + 0.1, f: mtof(m - (n < 3 ? 12 : 0)), amp: padAmp / 1.5, wave: "saw", det: [-13, -4, 5, 14], a: 0.5, d: 0.5, s: 0.8, r: 1.2, lp: padLp * 0.6, lpEnd: padLp, pan: (m % 3 - 1) * 0.35, send: 0.5, duckAmt: full ? 0.8 : 0.4 });
  if (n < 0) continue;
  // bas
  const eighth = (n >= 3 && n <= 8) || inSec(n, "avatar") || inSec(n, "make") || inSec(n, "types") || inSec(n, "apex");
  if (eighth) {
    for (let k = 0; k < 8; k++) tone({ t: t + k * 0.25, dur: 0.2, f: mtof(ch.root + (k === 6 ? 12 : 0)), amp: full ? 0.38 : 0.24, wave: "saw", det: [0, 7], a: 0.004, d: 0.1, s: 0.55, r: 0.08, lp: 240, lpEnd: 520, duckAmt: 0.9 });
  } else {
    tone({ t, dur: BAR - 0.05, f: mtof(ch.root), amp: 0.3, wave: "sine", det: [0], a: 0.05, s: 0.9, r: 0.4, duckAmt: 0.5 });
    tone({ t, dur: BAR - 0.05, f: mtof(ch.root + 12), amp: 0.08, wave: "saw", det: [0, 5], a: 0.05, s: 0.9, r: 0.4, lp: 300, lpEnd: 500, duckAmt: 0.5 });
  }
  // arpeggio
  if (n <= 34) {
    const step = inSec(n, "together") || inSec(n, "avatar") ? 2 * S16 : S16;
    const count = Math.round(BAR / step);
    const lvl = inSec(n, "logo") ? 0.06 : full ? 0.095 : inSec(n, "types") ? 0.075 : 0.07;
    const pattern = [0, 1, 2, 3, 2, 1, 2, 1];
    const oct = inSec(n, "apex") ? 12 : 0;
    for (let k = 0; k < count; k++) {
      const m = ch.notes[pattern[k % pattern.length]] + 12 + oct;
      tone({ t: t + k * step, dur: step * 0.8, f: mtof(m), amp: lvl * (k % 4 === 0 ? 1.25 : 1), wave: "square", pw: 0.35, det: [-6, 6], a: 0.003, d: 0.07, s: 0.3, r: 0.05, lp: 2200, lpEnd: 1000, pan: ((k % 7) - 3) * 0.12, send: 0.28, dly: 0.35, duckAmt: 0.5 });
    }
  }
  // stab akordowy w mocnych częściach
  if (full || inSec(n, "types")) for (const k of [0, 6, 10]) for (const m of ch.notes.slice(0, 3)) tone({ t: t + k * S16, dur: 0.22, f: mtof(m + 12), amp: 0.055, wave: "saw", det: [-14, -5, 5, 14], a: 0.004, d: 0.1, s: 0.2, r: 0.12, lp: 3800, lpEnd: 1400, pan: (m % 5 - 2) * 0.3, send: 0.3, duckAmt: 0.6 });
  // melodia prowadząca
  if (full || n === 35) {
    const hook = HOOK[name];
    hook.forEach((m, k) => {
      if (!m) return;
      const len = n === 35 ? 3.4 : inSec(n, "apex") ? 2.6 * S16 : 2 * S16;
      tone({ t: t + k * S16, dur: len, f: mtof(m), amp: 0.27, wave: "saw", det: [-9, 0, 9], a: 0.006, d: 0.1, s: 0.6, r: n === 35 ? 2.5 : 0.18, lp: 5200, lpEnd: 2600, pan: 0.1, send: 0.35, dly: 0.4, duckAmt: 0.4 });
      if (inSec(n, "apex") || n === 35) tone({ t: t + k * S16, dur: len, f: mtof(m + 12), amp: 0.09, wave: "square", pw: 0.3, det: [-7, 7], a: 0.006, d: 0.1, s: 0.5, r: n === 35 ? 2.5 : 0.15, lp: 6000, lpEnd: 3000, pan: -0.15, send: 0.4, dly: 0.4, duckAmt: 0.4 });
    });
  }
  // sekcja awatarów: skoczne pluki
  if (inSec(n, "avatar")) {
    const seq = [0, 2, 1, 3, 2, 3, 1, 2];
    for (let k = 0; k < 8; k++) tone({ t: t + k * 0.25, dur: 0.18, f: mtof(ch.notes[seq[k]] + 24), amp: 0.13, wave: "tri", det: [0, 4], a: 0.002, d: 0.2, s: 0.05, r: 0.4, lp: 6000, lpEnd: 2500, send: 0.45, dly: 0.4, pan: ((k * 5) % 7 - 3) * 0.14 });
  }
  // "razem": dzwonki
  if (inSec(n, "together")) {
    const bell = [ch.notes[2] + 12, ch.notes[3] + 12, ch.notes[1] + 24, ch.notes[2] + 24];
    for (let k = 0; k < 4; k++) tone({ t: t + k * BEAT + 0.0, dur: 0.6, f: mtof(bell[k]), amp: 0.13, wave: "sine", a: 0.004, d: 0.5, s: 0.1, r: 0.9, lp: 6000, send: 0.65, dly: 0.5, pan: k % 2 ? 0.4 : -0.4 });
  }
  // finał
  if (n >= 35 && n <= 36) {
    [50, 57, 62, 66, 69, 74, 78].forEach((m, k) => tone({ t: t + 0.01 * k, dur: n === 35 ? 3.9 : 1.6, f: mtof(m), amp: 0.14, wave: "saw", det: [-12, -3, 4, 13], a: n === 35 ? 0.03 : 0.5, d: 0.6, s: 0.55, r: 2.4, lp: 6000, lpEnd: 1500, pan: (k - 3) * 0.2, send: 0.7, duckAmt: 0.3 }));
    if (n === 35) tone({ t, dur: 3.6, f: mtof(26), amp: 0.5, wave: "sine", a: 0.01, s: 0.9, r: 1.4 });
  }
}
// intro: pad niski + dzwonki
tone({ t: 0.1, dur: 3.9, f: mtof(26), amp: 0.38, wave: "sine", a: 2.2, s: 0.9, r: 0.2, send: 0.3 });
tone({ t: 0.1, dur: 3.9, f: mtof(38), amp: 0.13, wave: "saw", det: [-8, 8], a: 2.4, s: 0.9, r: 0.2, lp: 200, lpEnd: 1400, send: 0.5 });
for (const [tt, m] of [[0.9, 74], [1.6, 77], [2.3, 81], [3.0, 77], [3.5, 79]]) tone({ t: tt, dur: 0.5, f: mtof(m), amp: 0.13, wave: "tri", a: 0.003, d: 0.4, s: 0.05, r: 1.1, send: 0.75, dly: 0.5, pan: (tt % 1 - 0.5) * 0.8 });

// ---------- pogłos ----------
function reverb(inL, inR, outL, outR, gain) {
  const combsL = [1557, 1617, 1491, 1422, 1277, 1188], combsR = combsL.map((d) => d + 23);
  const run = (inp, out, delays) => {
    const bufs = delays.map((d) => new Float32Array(Math.floor((d * SR) / 44100)));
    const idx = delays.map(() => 0), lpv = delays.map(() => 0);
    for (let i = 0; i < N; i++) {
      let acc = 0;
      const x = inp[i];
      for (let k = 0; k < bufs.length; k++) {
        const b = bufs[k];
        let y = b[idx[k]];
        lpv[k] += 0.42 * (y - lpv[k]);
        y = lpv[k];
        b[idx[k]] = x + y * 0.855;
        idx[k] = (idx[k] + 1) % b.length;
        acc += y;
      }
      out[i] = acc * 0.16;
    }
    // dwa all-passy
    for (const d of [556, 441]) {
      const b = new Float32Array(Math.floor((d * SR) / 44100)); let j = 0;
      for (let i = 0; i < N; i++) { const bo = b[j]; const v = out[i] + bo * 0.5; b[j] = v; out[i] = bo - v * 0.5; j = (j + 1) % b.length; }
    }
  };
  run(inL, outL, combsL); run(inR, outR, combsR);
  for (let i = 0; i < N; i++) { outL[i] *= gain; outR[i] *= gain; }
}
const wetL = mk(), wetR = mk();
reverb(revL, revR, wetL, wetR, 1.0);

// ---------- ping-pong delay ----------
const dOutL = mk(), dOutR = mk();
{
  const dl = Math.floor(0.375 * SR), fb = 0.38;
  for (let i = 0; i < N; i++) {
    const fromL = i >= dl ? dOutL[i - dl] : 0, fromR = i >= dl ? dOutR[i - dl] : 0;
    dOutR[i] = dlyL[i] + fromL * fb;
    dOutL[i] = dlyR[i] + fromR * fb;
  }
}

// ---------- miks końcowy ----------
const outL = mk(), outR = mk();
let hpL = 0, hpR = 0, pL = 0, pR = 0;
for (let i = 0; i < N; i++) {
  let l = dryL[i] + wetL[i] * 0.9 + dOutL[i] * 0.55;
  let r = dryR[i] + wetR[i] * 0.9 + dOutR[i] * 0.55;
  // filtr DC
  hpL += 0.0013 * (l - hpL); l -= hpL; hpR += 0.0013 * (r - hpR); r -= hpR;
  const t = i / SR;
  const fade = Math.min(1, t / 0.25) * (t > DUR - 2.4 ? Math.max(0, 1 - (t - (DUR - 2.4)) / 2.2) : 1);
  l = Math.tanh(l * 0.95) * fade; r = Math.tanh(r * 0.95) * fade;
  outL[i] = l; outR[i] = r; pL = Math.max(pL, Math.abs(l)); pR = Math.max(pR, Math.abs(r));
}
const norm = 0.85 / Math.max(pL, pR, 1e-6);
const buf = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(outL[i] * norm * 32767))), i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(outR[i] * norm * 32767))), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + buf.length, 4); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(buf.length, 40);
fs.writeFileSync(process.argv[2] ?? "apex-music.wav", Buffer.concat([hdr, buf]));
console.log("zapisano", process.argv[2], (DUR).toFixed(1) + " s, peak przed normalizacją", Math.max(pL, pR).toFixed(2));
