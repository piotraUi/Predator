// Efekty "chaosu" (włącza go administracja gry): wstrząsy ekranu i czerwona poświata, a gdy fala dojdzie do gracza -
// glitch ekranu (paski, szum, zmiana kolorów, trzaski), po którym serwer wyrzuca go z gry.
type Conn = { onMessage(type: string, cb: (m: any) => void): unknown; onLeave?(cb: (code: number) => void): unknown };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** krótkie trzaski i szum (WebAudio), bez plików dźwiękowych */
function glitchSound(ms: number) {
  try {
    const ctx = new AudioContext();
    const end = ctx.currentTime + ms / 1000;
    const master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
    for (let t = ctx.currentTime; t < end; t += rnd(0.04, 0.16)) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = Math.random() < 0.5 ? "square" : "sawtooth";
      osc.frequency.setValueAtTime(rnd(40, 1800), t);
      osc.frequency.exponentialRampToValueAtTime(rnd(30, 2400), t + 0.06);
      g.gain.setValueAtTime(rnd(0.2, 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + rnd(0.03, 0.12));
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.15);
    }
    setTimeout(() => void ctx.close().catch(() => {}), ms + 300);
  } catch {
    /* brak dźwięku - sam obraz też działa */
  }
}

export function glitchScreen(ms: number): void {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden";
  const noise = document.createElement("canvas");
  noise.width = 160;
  noise.height = 90;
  noise.style.cssText = "position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;mix-blend-mode:difference;opacity:.8";
  const nctx = noise.getContext("2d")!;
  const strips: HTMLDivElement[] = [];
  for (let i = 0; i < 16; i++) {
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;left:0;right:0";
    strips.push(d);
    root.append(d);
  }
  const label = document.createElement("div");
  label.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font:700 clamp(18px,4vw,42px) monospace;color:#fff;text-shadow:3px 0 #f0f,-3px 0 #0ff;white-space:nowrap";
  const black = document.createElement("div");
  black.style.cssText = "position:absolute;inset:0;background:#000;opacity:0";
  root.append(noise, label, black);
  document.body.append(root);
  glitchSound(ms);

  const canvases = [...document.querySelectorAll("canvas")].filter((c) => c !== noise) as HTMLCanvasElement[];
  const saved = canvases.map((c) => [c.style.transform, c.style.filter] as const);
  const t0 = performance.now();
  const frame = () => {
    const el = performance.now() - t0;
    const k = Math.min(1, el / ms); // narasta
    for (const d of strips) {
      d.style.top = rnd(0, 100) + "%";
      d.style.height = rnd(1, 12 + 14 * k) + "%";
      d.style.transform = `translateX(${rnd(-60, 60) * (0.4 + k)}px)`;
      d.style.backdropFilter = `hue-rotate(${Math.round(rnd(0, 360))}deg) saturate(${rnd(1, 5)}) ${Math.random() < 0.3 ? "invert(1)" : ""}`;
      d.style.background = Math.random() < 0.25 ? `rgba(${Math.round(rnd(0, 255))},${Math.round(rnd(0, 255))},${Math.round(rnd(0, 255))},.35)` : "transparent";
    }
    const img = nctx.createImageData(160, 90);
    for (let i = 0; i < img.data.length; i += 4) {
      // rzadki szum: tylko część punktów świeci, reszta przezroczysta
      const on = Math.random() < 0.1;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = on ? 255 : 0;
    }
    nctx.putImageData(img, 0, 0);
    label.textContent = Math.random() < 0.6 ? `ERR_CHAOS 0x${Math.floor(rnd(0, 0xffffff)).toString(16).toUpperCase().padStart(6, "0")}` : "▓▒░ ░▒▓ █▓▒░";
    label.style.opacity = Math.random() < 0.8 ? "1" : "0";
    for (const c of canvases) {
      c.style.transform = `translate(${rnd(-14, 14) * (0.3 + k)}px, ${rnd(-8, 8) * (0.3 + k)}px) scale(${1 + rnd(0, 0.08) * k})`;
      c.style.filter = `hue-rotate(${Math.round(rnd(0, 360))}deg) contrast(${rnd(1, 2.2)}) saturate(${rnd(1, 4)})`;
    }
    black.style.opacity = el > ms - 350 ? "1" : Math.random() < 0.08 ? "0.85" : "0";
    if (el < ms) timer = window.setTimeout(frame, rnd(35, 90));
  };
  let timer = window.setTimeout(frame, 0);
  window.setTimeout(() => {
    clearTimeout(timer);
    canvases.forEach((c, i) => {
      c.style.transform = saved[i][0];
      c.style.filter = saved[i][1];
    });
    // po wyrzuceniu z gry (zwykle dzieje się to w tym czasie) nakładka znika razem z grą
  }, ms + 1200);
  window.setTimeout(() => root.remove(), ms + 1200);
}

/** Podpina chaos pod połączenie z grą. Zwraca funkcję sprzątającą. */
export function chaosFx(conn: Conn): () => void {
  let on = false;
  let shake = 0;
  let vignette: HTMLDivElement | null = null;
  let banner: HTMLDivElement | null = null;
  const stop = () => {
    on = false;
    clearInterval(shake);
    vignette?.remove();
    banner?.remove();
    vignette = banner = null;
    document.querySelectorAll("canvas").forEach((c) => {
      delete c.dataset.chaosHold;
      c.style.transform = "";
    });
  };
  conn.onMessage("chaos", (m: { on?: boolean }) => {
    if (!m?.on) return stop();
    if (on) return;
    on = true;
    vignette = document.createElement("div");
    vignette.style.cssText = "position:fixed;inset:0;z-index:9000;pointer-events:none;box-shadow:inset 0 0 160px 40px rgba(255,0,40,.55);animation:chaos-pulse 1.2s ease-in-out infinite";
    banner = document.createElement("div");
    banner.textContent = "💥 CHAOS";
    banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9001;pointer-events:none;font:800 22px system-ui;color:#fff;background:rgba(200,0,30,.85);padding:4px 16px;border-radius:999px;letter-spacing:2px";
    if (!document.getElementById("chaos-css")) {
      const st = document.createElement("style");
      st.id = "chaos-css";
      st.textContent = "@keyframes chaos-pulse{0%,100%{opacity:.5}50%{opacity:1}}";
      document.head.append(st);
    }
    document.body.append(vignette, banner);
    shake = window.setInterval(() => {
      document.querySelectorAll("canvas").forEach((c) => {
        if (!c.dataset.chaosHold) c.style.transform = `translate(${rnd(-3, 3)}px, ${rnd(-3, 3)}px)`;
      });
    }, 60);
  });
  conn.onMessage("chaosHit", (m: { ms?: number }) => {
    const ms = Math.min(6000, Math.max(800, Number(m?.ms) || 3000));
    document.querySelectorAll("canvas").forEach((c) => ((c as HTMLCanvasElement).dataset.chaosHold = "1"));
    clearInterval(shake);
    glitchScreen(ms);
  });
  conn.onLeave?.(() => stop());
  return stop;
}
