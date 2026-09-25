// Edytor rysowania obrazków do gier 2D: pixel art albo zwykłe rysowanie.
// Ołówek, pędzel, gumka, wiadro, pipeta, linia, prostokąt, koło, przesuwanie, lustro, cofanie,
// zdjęcie jako podkład. Wynik: obrazek PNG (data URL).
import { pickFiles } from "../files.ts";
import { h, modal, toast } from "../ui/dom.ts";

export interface PaintResult {
  data: string;
  w: number;
  h: number;
  pixel: boolean;
}

type Tool = "pencil" | "brush" | "eraser" | "fill" | "picker" | "line" | "rect" | "ellipse" | "move";

const TOOLS: { id: Tool; icon: string; name: string; key: string; pixel?: boolean; normal?: boolean }[] = [
  { id: "pencil", icon: "✏️", name: "Ołówek", key: "B" },
  { id: "brush", icon: "🖌️", name: "Pędzel (miękki)", key: "P", normal: true },
  { id: "eraser", icon: "🧽", name: "Gumka", key: "E" },
  { id: "fill", icon: "🪣", name: "Wiadro - wypełnij kolorem", key: "G" },
  { id: "picker", icon: "💧", name: "Pipeta - weź kolor z obrazka", key: "I" },
  { id: "line", icon: "📏", name: "Linia", key: "L" },
  { id: "rect", icon: "⬛", name: "Prostokąt", key: "R" },
  { id: "ellipse", icon: "⚪", name: "Koło / elipsa", key: "O" },
  { id: "move", icon: "✥", name: "Przesuń cały rysunek", key: "M" },
];

/** paleta: kolory jak w małych konsolach do pixel artu + kilka dodatkowych */
const PALETTE = [
  "#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
  "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa",
  "#ffffff", "#8b5a2b", "#4caf50", "#2e7d32", "#f5cd30", "#0d69ac", "#e63946", "#9b59b6",
  "#6d4c41", "#bdbdbd", "#424242", "#90caf9", "#ffe0b2", "#f48fb1", "#80deea", "#c5e1a5",
];

const hexToRgba = (hex: string, a = 255): [number, number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const rgbaToHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** Okno wyboru: narysuj pixel art, narysuj zwykły obrazek albo wybierz plik (może być kilka - klatki animacji) */
export function chooseImageSource(title: string, multiple: boolean): Promise<{ drawn: PaintResult } | { files: File[] } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { drawn: PaintResult } | { files: File[] } | null) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    const draw = async (pixel: boolean, size: number) => {
      done = true;
      close();
      resolve(await paintEditor({ title, pixel, w: size, h: size }).then((r) => (r ? { drawn: r } : null)));
    };
    const opt = (icon: string, label: string, desc: string, fn: () => void) =>
      h("button", { class: "template", onClick: fn }, h("span", { class: "template-icon" }, icon), h("b", null, label), h("span", { class: "muted" }, desc));
    const sizeBtns = (pixel: boolean, sizes: number[]) =>
      h("div", { class: "paint-sizes" }, sizes.map((s) => h("button", { class: "btn small", onClick: () => draw(pixel, s) }, `${s}×${s}`)));
    const close = modal(
      title,
      h(
        "div",
        { class: "paint-choose" },
        h("div", { class: "paint-choice" }, opt("🟩", "Narysuj pixel art", "Kwadratowe piksele - jak w starych grach. Wybierz rozmiar:", () => draw(true, 32)), sizeBtns(true, [16, 24, 32, 48, 64])),
        h("div", { class: "paint-choice" }, opt("🖌️", "Narysuj zwykły obrazek", "Gładkie linie, pędzel, przezroczystość. Wybierz rozmiar:", () => draw(false, 256)), sizeBtns(false, [128, 256, 512])),
        h(
          "div",
          { class: "paint-choice" },
          opt("🖼️", multiple ? "Wybierz obrazki z pliku" : "Wybierz obrazek z pliku", multiple ? "PNG, JPG, GIF... Kilka plików = klatki animacji" : "PNG, JPG, GIF, zdjęcie z telefonu", async () => {
            const files = await pickFiles(["image/png", "image/jpeg", "image/gif", "image/webp"], multiple);
            finish(files.length ? { files } : null);
          }),
        ),
      ),
      [{ label: "Anuluj", onClick: () => finish(null) }],
    );
  });
}

/** Edytor rysowania. image = obrazek do poprawienia (data URL); bez niego - puste płótno w×h */
export function paintEditor(opts: { title?: string; image?: string; pixel?: boolean; w?: number; h?: number }): Promise<PaintResult | null> {
  return new Promise((resolve) => {
    const pixel = opts.pixel ?? true;
    let W = opts.w ?? 32;
    let H = opts.h ?? 32;
    // obrazek w prawdziwym rozmiarze
    const img = document.createElement("canvas");
    img.width = W;
    img.height = H;
    let ictx = img.getContext("2d", { willReadFrequently: true })!;
    // widok powiększony
    const view = h("canvas", { class: "paint-view" }) as HTMLCanvasElement;
    const vctx = view.getContext("2d")!;
    let zoom = 1;
    let tool: Tool = "pencil";
    let color = "#000000";
    let size = pixel ? 1 : 8;
    let opacity = 1;
    let fillShapes = false;
    let mirror = false;
    let grid = pixel;
    const recent: string[] = [];
    const undo: ImageData[] = [];
    const redo: ImageData[] = [];

    const fitZoom = () => {
      const maxW = Math.min(innerWidth - (innerWidth < 760 ? 24 : 360), 900);
      const maxH = innerHeight - (innerWidth < 760 ? 330 : 170);
      zoom = Math.max(1, Math.floor(Math.min(maxW / W, maxH / H)));
      if (!pixel) zoom = Math.max(0.25, Math.min(maxW / W, maxH / H, 4));
    };

    // ---------- rysowanie widoku ----------
    function render() {
      const vw = Math.round(W * zoom), vh = Math.round(H * zoom);
      if (view.width !== vw || view.height !== vh) {
        view.width = vw;
        view.height = vh;
      }
      vctx.imageSmoothingEnabled = !pixel && zoom < 1;
      vctx.clearRect(0, 0, vw, vh);
      vctx.drawImage(img, 0, 0, vw, vh);
      if (grid && pixel && zoom >= 6) {
        vctx.strokeStyle = "rgba(0,0,0,.18)";
        vctx.lineWidth = 1;
        vctx.beginPath();
        for (let x = 1; x < W; x++) (vctx.moveTo(x * zoom + 0.5, 0), vctx.lineTo(x * zoom + 0.5, vh));
        for (let y = 1; y < H; y++) (vctx.moveTo(0, y * zoom + 0.5), vctx.lineTo(vw, y * zoom + 0.5));
        vctx.stroke();
      }
      if (mirror) {
        vctx.strokeStyle = "rgba(230,57,70,.7)";
        vctx.setLineDash([6, 4]);
        vctx.beginPath();
        vctx.moveTo(vw / 2 + 0.5, 0);
        vctx.lineTo(vw / 2 + 0.5, vh);
        vctx.stroke();
        vctx.setLineDash([]);
      }
      sizeLabel.textContent = `${W}×${H} · ${Math.round(zoom * 100)}%`;
    }

    // ---------- cofanie ----------
    const snapshot = () => ictx.getImageData(0, 0, W, H);
    function pushUndo() {
      undo.push(snapshot());
      if (undo.length > 50) undo.shift();
      redo.length = 0;
    }
    function doUndo() {
      const s = undo.pop();
      if (!s) return;
      redo.push(snapshot());
      restoreData(s);
    }
    function doRedo() {
      const s = redo.pop();
      if (!s) return;
      undo.push(snapshot());
      restoreData(s);
    }
    function restoreData(d: ImageData) {
      if (d.width !== W || d.height !== H) {
        W = img.width = d.width;
        H = img.height = d.height;
        ictx = img.getContext("2d", { willReadFrequently: true })!;
      }
      ictx.putImageData(d, 0, 0);
      render();
    }

    // ---------- narzędzia ----------
    const mirrorX = (x: number) => W - 1 - x;
    function stamp(x: number, y: number, erase: boolean) {
      // pixel art: kwadratowy pędzel o rozmiarze size
      const s = Math.max(1, Math.round(size));
      const o = Math.floor(s / 2);
      const put = (px: number) => {
        if (erase) ictx.clearRect(px - o, y - o, s, s);
        else ictx.fillRect(px - o, y - o, s, s);
      };
      put(x);
      if (mirror) put(mirrorX(x));
    }
    function plotLine(x0: number, y0: number, x1: number, y1: number, erase: boolean) {
      // Bresenham - równe piksele bez rozmycia
      x0 = Math.floor(x0);
      y0 = Math.floor(y0);
      x1 = Math.floor(x1);
      y1 = Math.floor(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        stamp(x0, y0, erase);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) (err += dy), (x0 += sx);
        if (e2 <= dx) (err += dx), (y0 += sy);
      }
    }
    function smoothLine(x0: number, y0: number, x1: number, y1: number, erase: boolean, soft: boolean) {
      const seg = (ax: number, bx: number) => {
        ictx.save();
        ictx.globalCompositeOperation = erase ? "destination-out" : "source-over";
        ictx.globalAlpha = erase ? 1 : opacity;
        ictx.strokeStyle = color;
        ictx.lineWidth = size;
        ictx.lineCap = "round";
        ictx.lineJoin = "round";
        if (soft && !erase) {
          ictx.shadowColor = color;
          ictx.shadowBlur = size * 0.6;
        }
        ictx.beginPath();
        ictx.moveTo(ax, y0);
        ictx.lineTo(bx, y1);
        ictx.stroke();
        ictx.restore();
      };
      seg(x0, x1);
      if (mirror) seg(W - x0, W - x1);
    }
    function paintSegment(x0: number, y0: number, x1: number, y1: number) {
      const erase = tool === "eraser";
      ictx.fillStyle = color;
      if (pixel) plotLine(x0, y0, x1, y1, erase);
      else smoothLine(x0, y0, x1, y1, erase, tool === "brush");
    }
    function floodFill(x: number, y: number) {
      x = Math.floor(x);
      y = Math.floor(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const d = ictx.getImageData(0, 0, W, H);
      const p = d.data;
      const i0 = (y * W + x) * 4;
      const target = [p[i0], p[i0 + 1], p[i0 + 2], p[i0 + 3]];
      const fill = hexToRgba(color, Math.round(255 * (pixel ? 1 : opacity)));
      const tol = pixel ? 0 : 40;
      // zwykłe rysowanie: brzegi linii są półprzezroczyste - wiadro wchodzi pod nie (bez jasnej obwódki)
      const soft = !pixel && target[3] < 250;
      const same = (i: number) =>
        (Math.abs(p[i] - target[0]) <= tol && Math.abs(p[i + 1] - target[1]) <= tol && Math.abs(p[i + 2] - target[2]) <= tol && Math.abs(p[i + 3] - target[3]) <= tol) ||
        (soft && p[i + 3] < 250);
      if (fill.every((v, k) => v === target[k])) return;
      const seen = new Uint8Array(W * H);
      const stack = [x, y];
      while (stack.length) {
        const cy = stack.pop()!, cx = stack.pop()!;
        let lx = cx;
        while (lx >= 0 && !seen[cy * W + lx] && same((cy * W + lx) * 4)) lx--;
        lx++;
        let up = false, down = false;
        for (let xx = lx; xx < W && !seen[cy * W + xx] && same((cy * W + xx) * 4); xx++) {
          const i = (cy * W + xx) * 4;
          seen[cy * W + xx] = 1;
          // to, co już jest (np. brzeg linii), zostaje na wierzchu wypełnienia
          const ea = soft ? p[i + 3] / 255 : 0;
          p[i] = Math.round(p[i] * ea + fill[0] * (1 - ea));
          p[i + 1] = Math.round(p[i + 1] * ea + fill[1] * (1 - ea));
          p[i + 2] = Math.round(p[i + 2] * ea + fill[2] * (1 - ea));
          p[i + 3] = Math.max(p[i + 3] * (soft ? 1 : 0), fill[3]);
          if (cy > 0) {
            const u = !seen[(cy - 1) * W + xx] && same(((cy - 1) * W + xx) * 4);
            if (u && !up) stack.push(xx, cy - 1);
            up = u;
          }
          if (cy < H - 1) {
            const dn = !seen[(cy + 1) * W + xx] && same(((cy + 1) * W + xx) * 4);
            if (dn && !down) stack.push(xx, cy + 1);
            down = dn;
          }
        }
      }
      ictx.putImageData(d, 0, 0);
    }
    function pick(x: number, y: number) {
      const [r, g, b, a] = ictx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      if (a === 0) return toast("Tu jest przezroczyste tło");
      setColor(rgbaToHex(r, g, b));
      setTool("pencil");
    }
    function shape(kind: "line" | "rect" | "ellipse", x0: number, y0: number, x1: number, y1: number) {
      const draw = (ax0: number, ax1: number) => {
        if (kind === "line") {
          if (pixel) plotLine(ax0, y0, ax1, y1, false);
          else smoothLine(ax0, y0, ax1, y1, false, false);
          return;
        }
        const lx = Math.min(ax0, ax1), rx = Math.max(ax0, ax1), ty = Math.min(y0, y1), by = Math.max(y0, y1);
        if (pixel) {
          const L = Math.floor(lx), R = Math.floor(rx), T = Math.floor(ty), B = Math.floor(by);
          if (kind === "rect") {
            if (fillShapes) ictx.fillRect(L, T, R - L + 1, B - T + 1);
            else for (const [a, b, c, d] of [[L, T, R, T], [R, T, R, B], [R, B, L, B], [L, B, L, T]]) plotLineNoMirror(a, b, c, d);
          } else {
            const cx = (L + R) / 2, cy = (T + B) / 2, rx2 = (R - L) / 2 + 0.5, ry2 = (B - T) / 2 + 0.5;
            for (let yy = T; yy <= B; yy++)
              for (let xx = L; xx <= R; xx++) {
                const v = ((xx - cx) / rx2) ** 2 + ((yy - cy) / ry2) ** 2;
                const edge = Math.abs(1 - v) < 1.6 / Math.max(2, Math.min(rx2, ry2) * 2) + 0.12;
                if (fillShapes ? v <= 1 : v <= 1 && edge) ictx.fillRect(xx, yy, 1, 1);
              }
          }
          return;
        }
        ictx.save();
        ictx.globalAlpha = opacity;
        ictx.strokeStyle = ictx.fillStyle = color;
        ictx.lineWidth = size;
        ictx.lineJoin = "round";
        ictx.beginPath();
        if (kind === "rect") ictx.rect(lx, ty, rx - lx, by - ty);
        else ictx.ellipse((lx + rx) / 2, (ty + by) / 2, Math.max(0.5, (rx - lx) / 2), Math.max(0.5, (by - ty) / 2), 0, 0, Math.PI * 2);
        if (fillShapes) ictx.fill();
        else ictx.stroke();
        ictx.restore();
      };
      ictx.fillStyle = color;
      draw(x0, x1);
      if (mirror) draw(pixel ? mirrorX(x0) : W - x0, pixel ? mirrorX(x1) : W - x1);
    }
    function plotLineNoMirror(a: number, b: number, c: number, d: number) {
      const m = mirror;
      mirror = false;
      plotLine(a, b, c, d, false);
      mirror = m;
    }

    // ---------- mysz / palec ----------
    let drawing: { x: number; y: number; sx: number; sy: number; base: ImageData } | null = null;
    const pos = (e: PointerEvent) => {
      const r = view.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    view.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      view.setPointerCapture(e.pointerId);
      const p = pos(e);
      if (tool === "picker") return pick(p.x, p.y);
      pushUndo();
      if (tool === "fill") {
        floodFill(p.x, p.y);
        addRecent(color);
        return render();
      }
      drawing = { x: p.x, y: p.y, sx: p.x, sy: p.y, base: snapshot() };
      if (tool === "pencil" || tool === "brush" || tool === "eraser") {
        paintSegment(p.x, p.y, p.x, p.y);
        render();
      }
    });
    view.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const p = pos(e);
      if (tool === "pencil" || tool === "brush" || tool === "eraser") {
        paintSegment(drawing.x, drawing.y, p.x, p.y);
        drawing.x = p.x;
        drawing.y = p.y;
      } else if (tool === "line" || tool === "rect" || tool === "ellipse") {
        ictx.putImageData(drawing.base, 0, 0);
        let { x, y } = p;
        // Shift = kwadrat / koło / prosta linia co 45°
        if (e.shiftKey) {
          const dx = x - drawing.sx, dy = y - drawing.sy;
          if (tool === "line") {
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
            const l = Math.hypot(dx, dy);
            x = drawing.sx + Math.cos(a) * l;
            y = drawing.sy + Math.sin(a) * l;
          } else {
            const m = Math.max(Math.abs(dx), Math.abs(dy));
            x = drawing.sx + Math.sign(dx || 1) * m;
            y = drawing.sy + Math.sign(dy || 1) * m;
          }
        }
        shape(tool, drawing.sx, drawing.sy, x, y);
      } else if (tool === "move") {
        const tmp = document.createElement("canvas");
        tmp.width = W;
        tmp.height = H;
        tmp.getContext("2d")!.putImageData(drawing.base, 0, 0);
        ictx.clearRect(0, 0, W, H);
        const dx = pixel ? Math.round(p.x - drawing.sx) : p.x - drawing.sx;
        const dy = pixel ? Math.round(p.y - drawing.sy) : p.y - drawing.sy;
        ictx.drawImage(tmp, dx, dy);
      }
      render();
    });
    const end = () => {
      if (drawing && tool !== "move" && tool !== "eraser") addRecent(color);
      drawing = null;
    };
    view.addEventListener("pointerup", end);
    view.addEventListener("pointercancel", end);

    // ---------- panel ----------
    function setZoom(dir: number) {
      if (pixel) zoom = Math.max(1, Math.min(64, dir > 0 ? zoom + Math.max(1, Math.round(zoom * 0.25)) : zoom - Math.max(1, Math.round(zoom * 0.2))));
      else zoom = Math.max(0.25, Math.min(8, dir > 0 ? zoom * 1.25 : zoom / 1.25));
      render();
    }
    function setTool(t: Tool) {
      tool = t;
      for (const b of toolsBox.querySelectorAll<HTMLElement>("[data-tool]")) b.classList.toggle("on", b.dataset.tool === t);
      view.style.cursor = t === "picker" ? "copy" : t === "move" ? "move" : t === "fill" ? "cell" : "crosshair";
    }
    function setColor(c: string) {
      color = c;
      colorIn.value = c;
      for (const b of paletteBox.querySelectorAll<HTMLElement>("[data-c]")) b.classList.toggle("on", b.dataset.c === c);
    }
    function addRecent(c: string) {
      const i = recent.indexOf(c);
      if (i >= 0) recent.splice(i, 1);
      recent.unshift(c);
      recent.length = Math.min(recent.length, 10);
      recentBox.replaceChildren(...recent.map((rc) => h("button", { class: "paint-sw", title: rc, style: `background:${rc}`, onClick: () => setColor(rc) })));
    }

    const toolsBox = h(
      "div",
      { class: "paint-tools" },
      TOOLS.filter((t) => !(pixel && t.normal)).map((t) =>
        h("button", { class: "paint-tool", "data-tool": t.id, title: `${t.name} (${t.key})`, onClick: () => setTool(t.id) }, t.icon),
      ),
    );
    const colorIn = h("input", { type: "color", value: color, class: "paint-color", onInput: (e: Event) => setColor((e.target as HTMLInputElement).value) }) as HTMLInputElement;
    const paletteBox = h("div", { class: "paint-palette" }, PALETTE.map((c) => h("button", { class: "paint-sw", "data-c": c, title: c, style: `background:${c}`, onClick: () => setColor(c) })));
    const recentBox = h("div", { class: "paint-palette recent" });
    const sizeIn = h("input", {
      type: "range",
      min: "1",
      max: pixel ? "8" : "80",
      value: String(size),
      onInput: (e: Event) => ((size = Number((e.target as HTMLInputElement).value)), (sizeVal.textContent = String(size))),
    });
    const sizeVal = h("b", null, String(size));
    const opIn = h("input", { type: "range", min: "5", max: "100", value: "100", onInput: (e: Event) => (opacity = Number((e.target as HTMLInputElement).value) / 100) });
    const fillIn = h("input", { type: "checkbox", onChange: (e: Event) => (fillShapes = (e.target as HTMLInputElement).checked) });
    const side = h(
      "div",
      { class: "paint-side" },
      h("div", { class: "paint-row" }, colorIn, h("span", { class: "muted small" }, "Kolor")),
      paletteBox,
      h("div", { class: "muted small" }, "Ostatnie kolory"),
      recentBox,
      h("label", { class: "paint-label" }, h("span", null, "Grubość ", sizeVal), sizeIn),
      pixel ? "" : h("label", { class: "paint-label" }, h("span", null, "Krycie"), opIn),
      h("label", { class: "paint-check" }, fillIn, "Wypełnione kształty"),
      h("p", { class: "muted small paint-help" }, "Shift przy kształtach = kwadrat / koło / prosta linia. Ctrl+Z cofnij, Ctrl+Y ponów. Kółko myszy + Ctrl = powiększenie."),
    );

    const sizeLabel = h("span", { class: "muted small" });
    const toggleBtn = (icon: string, title: string, get: () => boolean, set: (v: boolean) => void) => {
      const b = h("button", { class: "tb-btn" + (get() ? " active" : ""), title, onClick: () => (set(!get()), b.classList.toggle("active", get()), render()) }, icon);
      return b;
    };
    const flip = (horizontal: boolean) => {
      pushUndo();
      const tmp = document.createElement("canvas");
      tmp.width = W;
      tmp.height = H;
      tmp.getContext("2d")!.drawImage(img, 0, 0);
      ictx.save();
      ictx.clearRect(0, 0, W, H);
      ictx.translate(horizontal ? W : 0, horizontal ? 0 : H);
      ictx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      ictx.drawImage(tmp, 0, 0);
      ictx.restore();
      render();
    };
    const importPhoto = async () => {
      const [f] = await pickFiles(["image/png", "image/jpeg", "image/gif", "image/webp"], false);
      if (!f) return;
      const url = URL.createObjectURL(f);
      const im = new Image();
      im.src = url;
      try {
        await im.decode();
      } catch {
        return toast("Nie udało się wczytać obrazka", "error");
      }
      pushUndo();
      // zdjęcie wpasowane w płótno (w pixel arcie od razu robi się z niego pikselowy obrazek)
      const k = Math.min(W / im.naturalWidth, H / im.naturalHeight);
      const dw = im.naturalWidth * k, dh = im.naturalHeight * k;
      ictx.imageSmoothingEnabled = true;
      ictx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
      URL.revokeObjectURL(url);
      render();
    };
    const resize = () => {
      const wIn = h("input", { type: "number", min: "1", max: "2048", value: String(W) }) as HTMLInputElement;
      const hIn = h("input", { type: "number", min: "1", max: "2048", value: String(H) }) as HTMLInputElement;
      const scaleIn = h("input", { type: "checkbox" }) as HTMLInputElement;
      const close = modal(
        "Rozmiar płótna",
        h("div", { class: "form" }, h("div", { class: "xy" }, h("label", null, "Szerokość", wIn), h("label", null, "Wysokość", hIn)), h("label", { class: "check" }, scaleIn, h("span", null, "Przeskaluj rysunek (inaczej zostaje w lewym górnym rogu)"))),
        [
          { label: "Anuluj", onClick: () => close() },
          {
            label: "Zmień",
            kind: "primary",
            onClick: () => {
              const nw = Math.max(1, Math.min(2048, Math.round(Number(wIn.value) || W)));
              const nh = Math.max(1, Math.min(2048, Math.round(Number(hIn.value) || H)));
              pushUndo();
              const tmp = document.createElement("canvas");
              tmp.width = W;
              tmp.height = H;
              tmp.getContext("2d")!.drawImage(img, 0, 0);
              W = img.width = nw;
              H = img.height = nh;
              ictx = img.getContext("2d", { willReadFrequently: true })!;
              ictx.imageSmoothingEnabled = !pixel;
              if (scaleIn.checked) ictx.drawImage(tmp, 0, 0, nw, nh);
              else ictx.drawImage(tmp, 0, 0);
              fitZoom();
              render();
              close();
            },
          },
        ],
      );
    };
    const clearAll = () => {
      pushUndo();
      ictx.clearRect(0, 0, W, H);
      render();
    };

    const stage = h("div", { class: "paint-stage" + (pixel ? " pixel" : "") }, view);
    // Ctrl + kółko myszy = powiększenie (samo kółko przewija)
    stage.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        setZoom(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    const top = h(
      "div",
      { class: "paint-top" },
      h("b", { class: "paint-title" }, (opts.title ?? "Rysowanie") + (pixel ? " · pixel art" : "")),
      sizeLabel,
      h("span", { class: "spacer" }),
      h("button", { class: "tb-btn", title: "Cofnij (Ctrl+Z)", onClick: doUndo }, "↶"),
      h("button", { class: "tb-btn", title: "Ponów (Ctrl+Y)", onClick: doRedo }, "↷"),
      h("button", { class: "tb-btn", title: "Pomniejsz", onClick: () => setZoom(-1) }, "➖"),
      h("button", { class: "tb-btn", title: "Powiększ", onClick: () => setZoom(1) }, "➕"),
      pixel ? toggleBtn("▦", "Siatka pikseli", () => grid, (v) => (grid = v)) : "",
      toggleBtn("🪞", "Lustro - rysuje też po drugiej stronie (symetria)", () => mirror, (v) => (mirror = v)),
      h("button", { class: "tb-btn", title: "Odbij w poziomie", onClick: () => flip(true) }, "⇆"),
      h("button", { class: "tb-btn", title: "Odbij w pionie", onClick: () => flip(false) }, "⇅"),
      h("button", { class: "tb-btn", title: "Wstaw zdjęcie / obrazek jako podkład", onClick: importPhoto }, "📷"),
      h("button", { class: "tb-btn", title: "Rozmiar płótna", onClick: resize }, "📐"),
      h("button", { class: "tb-btn", title: "Wyczyść wszystko", onClick: clearAll }, "🗑"),
      h("button", { class: "btn", onClick: () => finish(false) }, "Anuluj"),
      h("button", { class: "btn primary", onClick: () => finish(true) }, "✓ Gotowe"),
    );
    const overlay = h("div", { class: "paint" }, top, h("div", { class: "paint-body" }, toolsBox, stage, side));
    document.body.append(overlay);

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z") (e.preventDefault(), e.shiftKey ? doRedo() : doUndo());
      else if (ctrl && e.key.toLowerCase() === "y") (e.preventDefault(), doRedo());
      else if (e.key === "+" || e.key === "=") setZoom(1);
      else if (e.key === "-") setZoom(-1);
      else if (e.key === "Escape") finish(false);
      else if (!ctrl) {
        const t = TOOLS.find((x) => x.key === e.key.toUpperCase() && !(pixel && x.normal));
        if (t) setTool(t.id);
      }
    };
    window.addEventListener("keydown", onKey, true);

    let closed = false;
    function finish(ok: boolean) {
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(ok ? { data: img.toDataURL("image/png"), w: W, h: H, pixel } : null);
    }

    // obrazek do poprawienia
    const init = async () => {
      if (opts.image) {
        const im = new Image();
        im.src = opts.image;
        try {
          await im.decode();
          W = img.width = im.naturalWidth || W;
          H = img.height = im.naturalHeight || H;
          ictx = img.getContext("2d", { willReadFrequently: true })!;
          ictx.drawImage(im, 0, 0);
        } catch {
          toast("Nie udało się wczytać obrazka", "error");
        }
      }
      fitZoom();
      setTool("pencil");
      setColor(color);
      render();
    };
    void init();
  });
}
