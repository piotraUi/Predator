// Miniaturki awatarów jako prawdziwy render 3D (ten sam silnik Apex co w grze): głowa i ramiona pod lekkim kątem, przezroczyste tło.
// Jeden współdzielony, ukryty renderer; gdy WebGL2 nie działa, wywołujący używa płaskiego rysunku.
import type { Avatar } from "../../../shared/types.ts";
import { ApexAvatar } from "../apex/avatar.ts";
import { TIERS } from "../apex/quality.ts";
import { ApexRenderer } from "../apex/renderer.ts";

const SIZE = 192;
let rend: ApexRenderer | null | undefined;

function renderer(): ApexRenderer | null {
  if (rend !== undefined) return rend;
  try {
    const c = document.createElement("canvas");
    const r = new ApexRenderer(c, { alpha: true });
    r.setQuality({ ...TIERS.low, shadows: false, bloom: false, msaa: 0, cull: false }, false);
    r.resize(SIZE, SIZE, 1);
    r.setSky("#bfe3ff", null);
    r.setLight(1.9, 0);
    c.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      rend = null;
    });
    rend = r;
  } catch {
    rend = null;
  }
  return rend;
}

interface View { yaw: number; pitch: number; dist: number; target: [number, number, number]; fov: number }
/** głowa i ramiona (miniatury ubrań i akcesoriów w edytorze) */
const BUST: View = { yaw: -0.45, pitch: 0.1, dist: 7.4, target: [0, 4.05, 0], fov: 0.62 };
/** zbliżenie na głowę pod kątem 3/4, jak awatary w Robloxie */
const PORTRAIT: View = { yaw: -0.6, pitch: 0.05, dist: 5.4, target: [0, 4.85, 0], fov: 0.5 };

/** pastelowe tła portretów; wybór zależy od awatara, więc ten sam gracz ma zawsze to samo tło */
const BACKGROUNDS: [string, string][] = [
  ["#f4f5f7", "#cfd4dc"], ["#fde9dc", "#f5b9a0"], ["#ece4fb", "#b9a6ee"], ["#dff5ea", "#9fd8b8"],
  ["#e1f0fd", "#9cc8ee"], ["#fff3d1", "#f2cf72"], ["#fbe3ee", "#eea5c6"], ["#e5e8ff", "#a4aef0"],
];
function hash(a: Avatar) {
  let h = 2166136261;
  for (const ch of [a.head, a.hair, a.hairColor, a.face, a.shirt, a.hat].join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % BACKGROUNDS.length;
}

/** portret w stylu Robloxa: zbliżenie na głowę, kolorowe tło (data URL PNG) albo null */
export function portrait3d(a: Avatar): string | null {
  const shot = renderView(a, PORTRAIT);
  if (!shot) return null;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const [c0, c1] = BACKGROUNDS[hash(a)];
  const g = ctx.createRadialGradient(SIZE * 0.4, SIZE * 0.3, SIZE * 0.05, SIZE / 2, SIZE / 2, SIZE * 0.75);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(shot, 0, 0);
  return c.toDataURL("image/png");
}

/** render 3D głowy i ramion (data URL PNG) albo null, gdy się nie da */
export function headshot3d(a: Avatar): string | null {
  return renderView(a, BUST)?.toDataURL("image/png") ?? null;
}

function renderView(a: Avatar, v: View): HTMLCanvasElement | null {
  const r = renderer();
  if (!r) return null;
  let av: ApexAvatar | null = null;
  try {
    av = new ApexAvatar(r, a);
    av.anim = "idle";
    for (let i = 0; i < 4; i++) av.update(0.05);
    av.x = 0; av.y = 0; av.z = 0;
    // postać patrzy w stronę -z; kamera z przodu, trochę z boku i z góry
    av.ry = 0;
    av.draw();
    const { yaw, pitch, dist, target } = v;
    const eye: [number, number, number] = [
      target[0] + Math.sin(yaw) * Math.cos(pitch) * dist,
      target[1] + Math.sin(pitch) * dist,
      target[2] - Math.cos(yaw) * Math.cos(pitch) * dist,
    ];
    r.followShadows(target);
    r.render({ eye, target, fov: v.fov, near: 0.5, far: 60 });
    return r.canvas;
  } catch {
    return null;
  } finally {
    av?.dispose();
  }
}
