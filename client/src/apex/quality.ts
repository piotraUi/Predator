// Apex: jakość grafiki. Cztery poziomy (niska / średnia / wysoka / ultra) i tryb automatyczny, który dobiera poziom do urządzenia
// (telefon, słaba karta, komputer) i w trakcie gry schodzi niżej, gdy klatek jest za mało (oraz wraca wyżej, gdy jest zapas).
export type TierId = "low" | "medium" | "high" | "ultra";
export type QualityId = "auto" | TierId;

export interface QualityTier {
  id: TierId;
  label: string;
  /** mnożnik rozdzielczości (1 = natywna) */
  renderScale: number;
  /** maks. gęstość pikseli ekranu (devicePixelRatio) */
  dprCap: number;
  shadows: boolean;
  shadowSize: number;
  /** próbki MSAA sceny HDR (0 = brak) */
  msaa: number;
  bloom: boolean;
  /** ukrywanie obiektów poza kadrem i bardzo małych z daleka */
  cull: boolean;
  /** dalej niż tyle jednostek kule i walce rysujemy uproszczoną siatką */
  lodDist: number;
  /** maks. odległość rysowania małych obiektów */
  drawDist: number;
}

export const TIERS: Record<TierId, QualityTier> = {
  low: { id: "low", label: "Niska", renderScale: 0.75, dprCap: 1, shadows: true, shadowSize: 1024, msaa: 0, bloom: false, cull: true, lodDist: 70, drawDist: 420 },
  medium: { id: "medium", label: "Średnia", renderScale: 1, dprCap: 1.5, shadows: true, shadowSize: 2048, msaa: 0, bloom: true, cull: true, lodDist: 110, drawDist: 700 },
  high: { id: "high", label: "Wysoka", renderScale: 1, dprCap: 2, shadows: true, shadowSize: 2048, msaa: 4, bloom: true, cull: true, lodDist: 170, drawDist: 1200 },
  ultra: { id: "ultra", label: "Ultra", renderScale: 1, dprCap: 2.5, shadows: true, shadowSize: 4096, msaa: 4, bloom: true, cull: true, lodDist: 260, drawDist: 2000 },
};
export const TIER_ORDER: TierId[] = ["low", "medium", "high", "ultra"];
export const QUALITY_LABELS: Record<QualityId, string> = { auto: "Automatyczna (zalecana)", low: "Niska", medium: "Średnia", high: "Wysoka", ultra: "Ultra" };

export const isMobile = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** poziom na start trybu automatycznego: po nazwie karty graficznej, pamięci i rdzeniach */
export function detectTier(gl: WebGL2RenderingContext): { start: TierId; max: TierId } {
  let gpu = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
  } catch {
    /* brak informacji */
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return { start: "low", max: "medium" };
  if (isMobile()) {
    if (mem <= 3 || cores <= 4 || /mali-(4|t6|t7)|adreno \(?(3|4|5)\d\d|powervr/.test(gpu)) return { start: "low", max: "medium" };
    return { start: "medium", max: "high" };
  }
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|apple gpu/.test(gpu)) return { start: "high", max: "ultra" };
  if (/intel/.test(gpu) || mem <= 4) return { start: "medium", max: "high" };
  return { start: "high", max: "ultra" };
}

/** pilnuje płynności: schodzi o poziom niżej, gdy jest za wolno, i wraca wyżej, gdy długo jest zapas */
export class QualityGovernor {
  tier: TierId;
  readonly level: QualityId;
  private max: TierId;
  private fixed: boolean;
  private acc = 0;
  private n = 0;
  private slow = 0;
  private fast = 0;
  private sinceChange = 0;
  /** poziomy, które okazały się za ciężkie (nie próbujemy ich ponownie w tej sesji) */
  private bad = new Set<TierId>();
  private probing: TierId | null = null;

  constructor(level: QualityId, detected: { start: TierId; max: TierId }) {
    this.level = level;
    this.fixed = level !== "auto";
    this.tier = level === "auto" ? detected.start : level;
    this.max = detected.max;
  }

  /** wywołuj co klatkę z dt w sekundach; zwraca nowy poziom albo null */
  sample(dt: number): TierId | null {
    if (this.fixed) return null;
    if (dt > 0.25) return null; // zakładka w tle / ładowanie - nie liczymy
    this.acc += dt;
    this.n++;
    this.sinceChange += dt;
    if (this.acc < 1.5) return null;
    const fps = this.n / this.acc;
    this.acc = this.n = 0;
    const i = TIER_ORDER.indexOf(this.tier);
    if (fps < 40) {
      this.slow++;
      this.fast = 0;
      // ostatnio podniesiony poziom od razu się nie sprawdził
      if (this.probing === this.tier && this.sinceChange < 8) {
        this.bad.add(this.tier);
        this.probing = null;
        return this.change(i - 1);
      }
      if (this.slow >= 2 && i > 0) return this.change(i - 1);
    } else {
      this.slow = 0;
      if (fps >= 56 && i < TIER_ORDER.indexOf(this.max)) {
        this.fast++;
        const next = TIER_ORDER[i + 1];
        if (this.fast >= 8 && this.sinceChange > 20 && !this.bad.has(next)) {
          this.probing = next;
          return this.change(i + 1);
        }
      } else this.fast = 0;
      if (this.probing && this.sinceChange > 8) this.probing = null;
    }
    return null;
  }

  private change(i: number): TierId | null {
    const t = TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, i))];
    if (t === this.tier) return null;
    this.tier = t;
    this.sinceChange = 0;
    this.slow = this.fast = 0;
    return t;
  }
}
