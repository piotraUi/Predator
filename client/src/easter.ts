// Ukryte niespodzianki (easter eggi). Włączają się same, bez żadnych ustawień - trzeba wiedzieć jak:
//  - kod Konami: ↑ ↑ ↓ ↓ ← → ← → B A  => tryb disco
//  - 7 szybkich kliknięć w logo Predatora  => ryk dinozaura
//  - wpisanie słowa (poza polami tekstowymi): pizza, kebab, tort, dino, predator, roll
//  - w konsoli przeglądarki (F12): rawr()
import { toast } from "./ui/dom.ts";

const KONAMI = "ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a";
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** krótki dźwięk z syntezatora (bez plików); cicho, gdy przeglądarka nie pozwala na audio */
function tone(freqs: number[], dur = 0.12, type: OscillatorType = "square", vol = 0.05) {
  try {
    const ac = new AudioContext();
    freqs.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * dur + dur);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + i * dur);
      o.stop(ac.currentTime + i * dur + dur);
    });
    setTimeout(() => ac.close().catch(() => {}), (freqs.length * dur + 0.3) * 1000);
  } catch {
    /* brak audio */
  }
}

function roar() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(260, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(55, ac.currentTime + 0.9);
    g.gain.setValueAtTime(0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 1);
    setTimeout(() => ac.close().catch(() => {}), 1300);
  } catch {
    /* brak audio */
  }
}

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
    .egg-rain{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:100000}
    .egg-rain span{position:absolute;top:-8vh;animation:egg-fall linear forwards;will-change:transform}
    @keyframes egg-fall{to{transform:translateY(115vh) rotate(var(--r,360deg))}}`;
  document.head.append(s);
}

/** deszcz z emoji */
function rain(emoji: string[], n = 45) {
  if (reduced()) return;
  ensureStyle();
  const box = document.createElement("div");
  box.className = "egg-rain";
  for (let i = 0; i < n; i++) {
    const sp = document.createElement("span");
    sp.textContent = emoji[i % emoji.length];
    sp.style.left = Math.random() * 100 + "vw";
    sp.style.fontSize = 22 + Math.random() * 30 + "px";
    sp.style.animationDuration = 2.4 + Math.random() * 2.4 + "s";
    sp.style.animationDelay = Math.random() * 1.2 + "s";
    sp.style.setProperty("--r", (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 540) + "deg");
    box.append(sp);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 6500);
}

function disco() {
  toast("🪩 Tryb disco! (kod Konami)", "good");
  tone([523, 659, 784, 1047, 784, 1047], 0.1, "square");
  if (reduced()) return;
  document.documentElement.animate([{ filter: "hue-rotate(0deg)" }, { filter: "hue-rotate(360deg)" }], { duration: 1400, iterations: 6 });
  rain(["🪩", "🎶", "✨", "💃", "🕺"], 36);
}

function dino() {
  roar();
  if (!reduced()) {
    document.body.animate(
      [{ transform: "translate(0,0)" }, { transform: "translate(-8px,5px)" }, { transform: "translate(8px,-5px)" }, { transform: "translate(-6px,-4px)" }, { transform: "translate(0,0)" }],
      { duration: 280, iterations: 4 },
    );
  }
  toast("🦖 RAAAWR! Predator zaatakował!", "good");
  rain(["🦖", "🦕", "🍖"], 24);
}

/** słowa wpisywane z klawiatury poza polami tekstowymi */
const WORDS: Record<string, () => void> = {
  pizza: () => (toast("🍕 Pizza party!", "good"), tone([392, 523, 659], 0.1), rain(["🍕"])),
  kebab: () => (toast("🥙 Jeden kebab poproszę!", "good"), tone([330, 392, 330, 262], 0.1), rain(["🥙", "🌯"])),
  tort: () => (toast("🎂 Sto lat, sto lat!", "good"), tone([392, 392, 440, 392, 523, 494], 0.16, "triangle"), rain(["🎂", "🎉", "🎈", "🍰"])),
  dino: dino,
  predator: dino,
  roll: () => {
    toast("🌀 Do a barrel roll!", "good");
    tone([300, 400, 500, 700], 0.07, "sine");
    if (!reduced()) document.getElementById("app")?.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 1100, easing: "ease-in-out" });
  },
};
const LONGEST = Math.max(...Object.keys(WORDS).map((w) => w.length));

export function initEasterEggs() {
  let keys: string[] = [];
  let text = "";
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (typing) {
      keys = [];
      text = "";
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys = [...keys, k].slice(-10);
    if (keys.join(",") === KONAMI) {
      keys = [];
      disco();
      return;
    }
    if (e.key.length === 1) {
      text = (text + k).slice(-LONGEST);
      for (const [w, fn] of Object.entries(WORDS)) {
        if (text.endsWith(w)) {
          text = "";
          fn();
          break;
        }
      }
    }
  });

  // 7 szybkich kliknięć w logo
  let clicks: number[] = [];
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement | null)?.closest?.(".pv-logo, .logo-img")) return;
    const now = Date.now();
    clicks = [...clicks.filter((t) => now - t < 3000), now];
    if (clicks.length >= 7) {
      clicks = [];
      dino();
    }
  });

  // konsola przeglądarki
  // uwaga: w aplikacji desktopowej window.predator to most do Electrona (tylko do odczytu), więc używamy innej nazwy
  (window as unknown as Record<string, unknown>).rawr = () => {
    console.log("%c🦖 PREDATOR", "font:900 28px system-ui;color:#e8472b");
    console.log("Sekrety: kod Konami, 7 kliknięć w logo, słowa: pizza, kebab, tort, dino, roll. Powodzenia!");
    dino();
    return "RAAAWR";
  };
  console.log("%c🦖 Psst... wpisz rawr() i naciśnij Enter", "color:#e8472b;font-weight:bold");
}
