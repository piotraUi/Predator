// Gry HTML: cała gra to jeden plik HTML (CSS, JS i obrazki w środku), który Predator pokazuje w ramce
// zamiast silnika gier. To NIE jest gra Predatora, więc ramka jest odizolowana od aplikacji:
//  - sandbox bez "allow-same-origin" (strona nie ma dostępu do konta, tokenu ani danych Predatora),
//  - CSP wewnątrz: nic nie ładuje się z internetu i nic nie jest wysyłane (cała gra musi być w pliku),
//  - kod sprawdza moderacja AI (teksty, obrazki, dźwięki, kod) przed publikacją.

/** zasady CSP ramki: tylko to, co jest w pliku (data: / blob:), bez sieci */
export const HTML_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src data: blob:",
  "worker-src blob:",
  "frame-src about:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** ramka gry: sandbox bez dostępu do Predatora, z pełnym ekranem, padem i blokadą myszy */
export const HTML_SANDBOX = "allow-scripts allow-pointer-lock allow-modals";
export const HTML_ALLOW = "fullscreen; gamepad; autoplay; accelerometer; gyroscope";

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Dokument do `iframe.srcdoc`: zewnętrzna strona z polityką CSP, a w niej wewnętrzna ramka z kodem gry
 * (ramka srcdoc dziedziczy CSP, więc kod gry nie może jej zdjąć - nawet gdy ma coś przed <head>).
 */
export function buildHtmlFrame(source: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${attr(HTML_CSP)}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox="${HTML_SANDBOX}" allow="${HTML_ALLOW}" srcdoc="${attr(source)}"></iframe></body></html>`;
}

/** przykładowa gra na start (nowa gra HTML) */
export const HTML_STARTER = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Złap kropki</title>
<style>
  html, body { margin: 0; height: 100%; background: #101820; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; touch-action: none; }
  canvas { display: block; width: 100%; height: 100%; }
  #hud { position: fixed; left: 12px; top: 10px; font-size: 20px; font-weight: 700; text-shadow: 0 2px 4px #000; pointer-events: none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">Wynik: <span id="score">0</span> · Kliknij kropki!</div>
<script>
// To jest gra HTML: cała gra w jednym pliku. Zmień kod, kliknij ▶ Podgląd i zobacz efekt.
const c = document.getElementById("c"), ctx = c.getContext("2d");
let score = 0, dots = [];
function resize() { c.width = innerWidth; c.height = innerHeight; }
addEventListener("resize", resize); resize();
function spawn() {
  dots.push({ x: Math.random() * c.width, y: -20, r: 18 + Math.random() * 18, v: 60 + Math.random() * 120, h: Math.random() * 360 });
}
function tap(x, y) {
  for (let i = dots.length - 1; i >= 0; i--) {
    const d = dots[i];
    if (Math.hypot(d.x - x, d.y - y) < d.r + 8) {
      dots.splice(i, 1);
      document.getElementById("score").textContent = ++score;
      break;
    }
  }
}
c.addEventListener("pointerdown", (e) => tap(e.clientX, e.clientY));
let last = performance.now(), acc = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  acc += dt; if (acc > 0.6) { acc = 0; spawn(); }
  ctx.clearRect(0, 0, c.width, c.height);
  for (const d of dots) {
    d.y += d.v * dt;
    ctx.fillStyle = "hsl(" + d.h + " 80% 60%)";
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  }
  dots = dots.filter((d) => d.y < c.height + 40);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body>
</html>
`;

// ---------- sprawdzanie kodu (moderacja i podpowiedzi w edytorze) ----------

export interface HtmlContent {
  /** teksty widoczne dla gracza (strona, napisy w skryptach) - do sprawdzenia filtrem treści */
  texts: string[];
  /** obrazki i dźwięki w środku pliku (data:) */
  images: string[];
  sounds: string[];
  /** kod bez obrazków i dźwięków, w kawałkach - do przeglądu przez AI */
  code: string[];
  /** pewne problemy wykryte bez AI (pole na hasło, kopanie kryptowalut, zaciemniony kod) */
  problems: string[];
}

const DATA_URL = /data:(image|audio)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=%]+/gi;

/** Wyciąga z gry HTML wszystko, co trzeba sprawdzić */
export function htmlContent(source: string): HtmlContent {
  const images: string[] = [];
  const sounds: string[] = [];
  // obrazki i dźwięki osobno (duże ciągi base64 nie nadają się do czytania przez AI)
  const stripped = source.replace(DATA_URL, (m) => {
    if (m.startsWith("data:image")) images.push(m);
    else sounds.push(m);
    return "data:…";
  });
  const texts: string[] = [];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(stripped)?.[1]?.trim();
  if (title) texts.push(title);
  const noCode = stripped.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const visible = noCode.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < visible.length; i += 1400) texts.push(visible.slice(i, i + 1400));
  // napisy z atrybutów (alt, placeholder, title) i ze skryptów
  const attrs = [...noCode.matchAll(/\b(?:alt|placeholder|title|aria-label|value)\s*=\s*"([^"]{3,200})"/gi)].map((m) => m[1]);
  if (attrs.length) texts.push(attrs.join(" | "));
  const strings: string[] = [];
  for (const sc of stripped.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of sc[1].matchAll(/"((?:[^"\\\n]|\\.){4,200})"|'((?:[^'\\\n]|\\.){4,200})'|`((?:[^`\\]|\\.){4,300})`/g)) {
      const s = m[1] ?? m[2] ?? m[3];
      // tylko to, co wygląda na zdanie (są spacje i litery) - nazwy klas i klucze nie są czytane przez graczy
      if (/\s/.test(s.trim()) && /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3}/.test(s)) strings.push(s);
    }
  }
  for (let i = 0; i < strings.length; i += 25) texts.push(strings.slice(i, i + 25).join(" | "));

  const code: string[] = [];
  const compact = stripped.replace(/\s+/g, " ");
  for (let i = 0; i < compact.length; i += 9000) code.push(compact.slice(i, i + 9000));

  const problems: string[] = [];
  if (/<input[^>]+type\s*=\s*["']?password/i.test(stripped)) problems.push("pole na hasło (gra HTML nie może prosić o hasło)");
  if (/coinhive|cryptonight|stratum\+tcp|coin-hive|minero\.cc/i.test(stripped)) problems.push("kod do kopania kryptowalut");
  if (/\b(?:eval|Function)\s*\(\s*(?:atob|unescape|decodeURIComponent)\s*\(/i.test(stripped)) problems.push("zaciemniony kod (eval z zakodowanego tekstu) - nie da się go sprawdzić");
  if (/\b(?:document\.write|\.innerHTML\s*=)\s*(?:atob|unescape)\s*\(/i.test(stripped)) problems.push("zaciemniony kod (zakodowana strona)");
  return { texts: texts.filter((t) => t.trim().length > 2), images, sounds, code, problems };
}

/** podpowiedzi dla twórcy w edytorze: rzeczy, które w ramce nie zadziałają */
export function htmlLint(source: string): string[] {
  const w: string[] = [];
  if (!source.trim()) return ["Gra jest pusta"];
  if (/<(?:script|img|source|video|audio|iframe|embed)\b[^>]*\b(?:src)\s*=\s*["']?(?:https?:)?\/\//i.test(source) || /<link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i.test(source) || /@import\s+(?:url\()?["']?(?:https?:)?\/\//i.test(source))
    w.push("Gra ładuje coś z internetu (https://...). W ramce to jest zablokowane - wszystko musi być w jednym pliku (obrazki jako data:, kod w <script>).");
  if (/\bfetch\s*\(\s*["'`]https?:|XMLHttpRequest|WebSocket\s*\(/.test(source)) w.push("Gra łączy się z internetem (fetch / WebSocket). W ramce połączenia są zablokowane, a gry HTML nie mają multiplayera z serwerem.");
  if (/<input[^>]+type\s*=\s*["']?password/i.test(source)) w.push("Pole na hasło jest niedozwolone - moderacja ukryje taką grę.");
  if (!/<canvas|<body|<div|<svg|<script/i.test(source)) w.push("Nie widać w niej strony ani skryptu (brak <body> / <canvas> / <script>).");
  return w;
}
