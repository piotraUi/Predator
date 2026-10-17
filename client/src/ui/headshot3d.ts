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
    r.setLight(1.3, 0);
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

/** render 3D głowy i ramion (data URL PNG) albo null, gdy się nie da */
export function headshot3d(a: Avatar): string | null {
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
    const yaw = -0.45, pitch = 0.1, dist = 7.4;
    const target: [number, number, number] = [0, 4.05, 0];
    const eye: [number, number, number] = [
      target[0] + Math.sin(yaw) * Math.cos(pitch) * dist,
      target[1] + Math.sin(pitch) * dist,
      target[2] - Math.cos(yaw) * Math.cos(pitch) * dist,
    ];
    r.followShadows(target);
    r.render({ eye, target, fov: 0.62, near: 0.5, far: 60 });
    return r.canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    av?.dispose();
  }
}
