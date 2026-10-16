// Apex: pora dnia i pogoda. Paleta nieba płynnie zmienia się z godziną (0-24), pogoda przyciemnia i szarzeje niebo.
import type { WeatherId } from "../../../shared/types.ts";

type C3 = [number, number, number];
interface Key { h: number; top: C3; hor: C3; bot: C3; tint: C3; light: number; cloud: C3 }

const KEYS: Key[] = [
  { h: 0, top: [0.015, 0.025, 0.09], hor: [0.04, 0.06, 0.15], bot: [0.03, 0.04, 0.09], tint: [0.45, 0.55, 0.95], light: 0.3, cloud: [0.12, 0.14, 0.22] },
  { h: 4.5, top: [0.03, 0.05, 0.16], hor: [0.18, 0.16, 0.3], bot: [0.05, 0.06, 0.12], tint: [0.5, 0.55, 0.9], light: 0.34, cloud: [0.2, 0.2, 0.32] },
  { h: 6, top: [0.2, 0.28, 0.58], hor: [1.0, 0.55, 0.32], bot: [0.45, 0.35, 0.4], tint: [1, 0.68, 0.45], light: 0.62, cloud: [1, 0.7, 0.55] },
  { h: 8, top: [0.24, 0.5, 0.88], hor: [0.78, 0.82, 0.95], bot: [0.7, 0.78, 0.9], tint: [1, 0.94, 0.84], light: 0.95, cloud: [1, 0.97, 0.94] },
  { h: 12, top: [0.2, 0.48, 0.88], hor: [0.73, 0.88, 1], bot: [0.85, 0.92, 1], tint: [1, 1, 0.97], light: 1, cloud: [1, 1, 1] },
  { h: 16, top: [0.22, 0.5, 0.88], hor: [0.75, 0.86, 1], bot: [0.82, 0.9, 1], tint: [1, 0.97, 0.9], light: 0.98, cloud: [1, 0.98, 0.95] },
  { h: 18, top: [0.3, 0.34, 0.66], hor: [1.0, 0.5, 0.26], bot: [0.5, 0.36, 0.38], tint: [1, 0.62, 0.38], light: 0.7, cloud: [1, 0.62, 0.45] },
  { h: 19.5, top: [0.1, 0.1, 0.28], hor: [0.62, 0.26, 0.3], bot: [0.2, 0.15, 0.22], tint: [0.8, 0.5, 0.6], light: 0.45, cloud: [0.55, 0.32, 0.4] },
  { h: 21, top: [0.025, 0.035, 0.11], hor: [0.08, 0.09, 0.2], bot: [0.04, 0.05, 0.1], tint: [0.5, 0.58, 0.95], light: 0.32, cloud: [0.14, 0.16, 0.26] },
  { h: 24, top: [0.015, 0.025, 0.09], hor: [0.04, 0.06, 0.15], bot: [0.03, 0.04, 0.09], tint: [0.45, 0.55, 0.95], light: 0.3, cloud: [0.12, 0.14, 0.22] },
];

export interface SkyState {
  top: number[]; hor: number[]; bot: number[]; fog: number[]; tint: number[]; ground: number[];
  stars: number; clouds: number[]; sunDisc: number[]; sunDir: number[]; light: number;
}

const mix3 = (a: C3, b: C3, t: number): number[] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const norm = (v: number[]) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** jak mocno pogoda zasłania niebo (0 = czyste) */
export const OVERCAST: Record<WeatherId, number> = { clear: 0, rain: 0.6, snow: 0.5, storm: 0.88 };

/** niebo o danej godzinie i pogodzie; `cover` to płynnie zmieniane zachmurzenie (0-1) */
export function skyAt(hour: number, cover: number): SkyState {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smooth(0, 1, (h - a.h) / (b.h - a.h));
  let top = mix3(a.top as C3, b.top as C3, t);
  let hor = mix3(a.hor as C3, b.hor as C3, t);
  let bot = mix3(a.bot as C3, b.bot as C3, t);
  let tint = mix3(a.tint as C3, b.tint as C3, t);
  let cloud = mix3(a.cloud as C3, b.cloud as C3, t);
  let light = a.light + (b.light - a.light) * t;

  // słońce w dzień, księżyc w nocy (jedno „światło kierunkowe”, żeby cienie miały sens)
  const day = (h - 6) / 12;
  const sunUp = day >= 0 && day <= 1;
  let dir: number[];
  const disc: number[] = [1, 0.97, 0.8, 0];
  if (sunUp) {
    const ang = day * Math.PI;
    dir = norm([Math.cos(ang) * 0.85, Math.max(0.1, Math.sin(ang)), 0.45]);
    const low = 1 - smooth(0.05, 0.4, Math.sin(ang));
    disc[0] = 1; disc[1] = 0.95 - 0.35 * low; disc[2] = 0.78 - 0.5 * low;
    disc[3] = smooth(0.0, 0.12, Math.sin(ang));
  } else {
    const n = ((h + 6) % 24) / 12;
    const ang = n * Math.PI;
    dir = norm([Math.cos(ang) * 0.8, Math.max(0.12, Math.sin(ang)), -0.5]);
    disc[0] = 0.82; disc[1] = 0.88; disc[2] = 1;
    disc[3] = smooth(0.0, 0.12, Math.sin(ang)) * 0.9;
  }
  const night = 1 - smooth(4.5, 6.5, h) * (1 - smooth(19.5, 21.5, h));
  let stars = night * (1 - cover);

  // pogoda: niebo szarzeje i ciemnieje
  if (cover > 0) {
    const grey = (c: number[], k: number): number[] => {
      const l = (c[0] + c[1] + c[2]) / 3;
      const g = Math.min(0.62, l * 0.9 + 0.1);
      return [c[0] + (g - c[0]) * k, c[1] + (g * 1.02 - c[1]) * k, c[2] + (g * 1.06 - c[2]) * k];
    };
    top = grey(top, cover * 0.85) as C3;
    hor = grey(hor, cover * 0.9) as C3;
    bot = grey(bot, cover * 0.7) as C3;
    cloud = grey(cloud, cover * 0.9).map((v) => v * (1 - 0.35 * cover)) as C3;
    tint = grey(tint, cover * 0.6) as C3;
    light *= 1 - 0.38 * cover;
    disc[3] *= 1 - cover;
    stars *= 0;
  }
  const fog = [hor[0] * 0.95, hor[1] * 0.95, hor[2] * 0.97];
  return {
    top, hor, bot, fog, tint,
    ground: [0.5 * (0.4 + 0.6 * light), 0.5 * (0.4 + 0.6 * light), 0.56 * (0.4 + 0.6 * light)],
    stars,
    clouds: [cloud[0], cloud[1], cloud[2], 0.55 + 0.45 * cover],
    sunDisc: disc,
    sunDir: dir,
    light,
  };
}
