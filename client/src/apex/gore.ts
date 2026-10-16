// Apex: ślady na świecie w stylu kreskówki - dziury po kulach (z „gwiazdką” pęknięć) i plamy krwi (czerwone, bez makabry),
// które rosną w kałużę pod pokonanym graczem. Tekstury rysowane na płótnie, naklejki trzyma Renderer.
import type { Renderer } from "./renderer.ts";
import type { V3 } from "./math.ts";

function canvas(draw: (g: CanvasRenderingContext2D, s: number) => void, s = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = s;
  draw(c.getContext("2d")!, s);
  return c;
}

/** nieregularna plama: kilka nachodzących na siebie kół i kropli */
function blob(g: CanvasRenderingContext2D, s: number, seed: number, color: string, edge: string) {
  let r = seed;
  const R = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.translate(s / 2, s / 2);
  for (const [col, k] of [[edge, 1], [color, 0.82]] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(0, 0, s * 0.27 * k, 0, 7);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + R() * 0.5;
      const d = s * (0.18 + R() * 0.16) * k;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, s * (0.07 + R() * 0.1) * k, 0, 7);
      g.fill();
    }
  }
  // drobne kropelki wokół
  g.fillStyle = edge;
  for (let i = 0; i < 8; i++) {
    const a = R() * Math.PI * 2, d = s * (0.34 + R() * 0.12);
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, s * (0.015 + R() * 0.03), 0, 7);
    g.fill();
  }
  // połysk
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath();
  g.ellipse(-s * 0.08, -s * 0.09, s * 0.07, s * 0.035, -0.6, 0, 7);
  g.fill();
}

export class Gore {
  private holes: HTMLCanvasElement[];
  private splats: HTMLCanvasElement[];
  private puddle: HTMLCanvasElement;
  private cache = new Map<HTMLCanvasElement, WebGLTexture>();

  constructor(private r: Renderer) {
    this.holes = [0, 1].map((v) =>
      canvas((g, s) => {
        g.translate(s / 2, s / 2);
        // pęknięcia
        g.strokeStyle = "rgba(20,20,24,0.85)";
        g.lineCap = "round";
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + v * 0.4;
          g.lineWidth = s * 0.028;
          g.beginPath();
          g.moveTo(Math.cos(a) * s * 0.1, Math.sin(a) * s * 0.1);
          g.lineTo(Math.cos(a) * s * (0.3 + (i % 3) * 0.06), Math.sin(a) * s * (0.3 + (i % 3) * 0.06));
          g.stroke();
        }
        g.fillStyle = "rgba(60,60,66,0.55)";
        g.beginPath();
        g.arc(0, 0, s * 0.19, 0, 7);
        g.fill();
        g.fillStyle = "#111114";
        g.beginPath();
        g.arc(0, 0, s * 0.1, 0, 7);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.5)";
        g.beginPath();
        g.arc(-s * 0.035, -s * 0.035, s * 0.025, 0, 7);
        g.fill();
      }),
    );
    this.splats = [11, 22, 33].map((seed) => canvas((g, s) => blob(g, s, seed, "#d3202a", "#8f1018")));
    this.puddle = canvas((g, s) => {
      g.translate(s / 2, s / 2);
      g.fillStyle = "#8f1018";
      g.beginPath();
      g.ellipse(0, 0, s * 0.44, s * 0.4, 0.3, 0, 7);
      g.fill();
      g.fillStyle = "#c91c26";
      g.beginPath();
      g.ellipse(0, 0, s * 0.37, s * 0.33, 0.3, 0, 7);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.beginPath();
      g.ellipse(-s * 0.1, -s * 0.1, s * 0.12, s * 0.05, -0.5, 0, 7);
      g.fill();
    });
  }

  private tex(c: HTMLCanvasElement) {
    let t = this.cache.get(c);
    if (!t) this.cache.set(c, (t = this.r.makeTexture(c)));
    return t;
  }

  /** dziura po kuli w miejscu trafienia (normalna powierzchni = kierunek wyjścia z powierzchni) */
  bullet(pos: V3, normal: V3) {
    this.r.addWorldDecal(this.tex(this.holes[Math.floor(Math.random() * this.holes.length)]), pos, normal, 0.9 + Math.random() * 0.5, Math.random() * 6.28, 45);
  }

  /** plama krwi na powierzchni (np. na ziemi pod trafionym graczem) */
  splat(pos: V3, normal: V3 = [0, 1, 0], size = 2.2) {
    this.r.addWorldDecal(this.tex(this.splats[Math.floor(Math.random() * this.splats.length)]), pos, normal, size * (0.7 + Math.random() * 0.6), Math.random() * 6.28, 40);
  }

  /** kałuża rosnąca pod pokonanym graczem */
  pool(pos: V3) {
    this.r.addWorldDecal(this.tex(this.puddle), pos, [0, 1, 0], 6.5, Math.random() * 6.28, 30, 2.5);
  }
}

/** normalna powierzchni trafionej półprostej: dla klocka najbliższa ściana, dla terenu pionowo (z lekkim nachyleniem) */
export function surfaceNormal(part: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number }, hit: V3, dir: V3, terrain: boolean, slope?: [number, number]): V3 {
  if (terrain) {
    const n: V3 = [-(slope?.[0] ?? 0), 1, -(slope?.[1] ?? 0)];
    const l = Math.hypot(n[0], n[1], n[2]);
    return [n[0] / l, n[1] / l, n[2] / l];
  }
  // do układu klocka (obrót wokół Y), najsilniejsza oś względem połowy rozmiaru
  const a = (-part.ry * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = hit[0] - part.x, dy = hit[1] - part.y, dz = hit[2] - part.z;
  const lx = (dx * c - dz * s) / (part.sx / 2 || 1), ly = dy / (part.sy / 2 || 1), lz = (dx * s + dz * c) / (part.sz / 2 || 1);
  const ax = Math.abs(lx), ay = Math.abs(ly), az = Math.abs(lz);
  let n: V3;
  if (ax >= ay && ax >= az) n = [Math.sign(lx), 0, 0];
  else if (ay >= az) n = [0, Math.sign(ly), 0];
  else n = [0, 0, Math.sign(lz)];
  // z powrotem do świata
  const b = (part.ry * Math.PI) / 180, bc = Math.cos(b), bs = Math.sin(b);
  const w: V3 = [n[0] * bc - n[2] * bs, n[1], n[0] * bs + n[2] * bc];
  // powierzchnia musi być zwrócona w stronę strzelającego
  return w[0] * dir[0] + w[1] * dir[1] + w[2] * dir[2] > 0 ? [-w[0], -w[1], -w[2]] : w;
}
