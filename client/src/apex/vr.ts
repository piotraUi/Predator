// Tryb VR (WebXR): sesja zestawu, pozycje głowy i kontrolerów w jednostkach świata Apexa.
// Zestaw widzi świat w metrach, a postać ma ok. 4,7 jednostki wzrostu, więc 1 m = VR_SCALE jednostek.
// Głowa porusza kamerę (pochylanie się, kucanie), lewa gałka chodzi, prawa obraca (skokowo albo płynnie).
import type { XrView } from "./renderer.ts";
import { apply3, rotY } from "./math.ts";
import type { V3 } from "./math.ts";

/** jednostek świata na metr w VR: dorosły ~1,7 m = ~4,7 jednostki */
export const VR_SCALE = 2.75;

/* eslint-disable @typescript-eslint/no-explicit-any */
type XR = any;

export interface VrButtons {
  trigger: boolean; squeeze: boolean; stick: boolean; a: boolean; b: boolean;
  /** wciśnięte dopiero w tej klatce */
  pTrigger: boolean; pSqueeze: boolean; pStick: boolean; pA: boolean; pB: boolean;
}

export interface VrHand {
  hand: "left" | "right";
  /** środek dłoni (kontroler) i promień wskazujący, w świecie */
  pos: V3;
  aim: V3;
  aimDir: V3;
  /** obrót 3x3 (wiersze) kierunku wskazywania: oś Z wzdłuż promienia */
  rot: number[];
  stick: [number, number];
  b: VrButtons;
  pulse(intensity: number, ms: number): void;
}

export interface VrFrame {
  views: XrView[];
  head: V3;
  headDir: V3;
  hands: { left?: VrHand; right?: VrHand };
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** projekcja WebXR z własnymi near/far (w jednostkach świata, nie w metrach) */
function frustum(m: Float32Array, near: number, far: number, out: Float32Array) {
  const l = (m[8] - 1) / m[0], r = (m[8] + 1) / m[0];
  const b = (m[9] - 1) / m[5], t = (m[9] + 1) / m[5];
  out.fill(0);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[8] = (r + l) / (r - l);
  out[9] = (t + b) / (t - b);
  out[10] = -(far + near) / (far - near);
  out[11] = -1;
  out[14] = (-2 * far * near) / (far - near);
}

export async function vrSupported(): Promise<boolean> {
  const xr = (navigator as unknown as { xr?: XR }).xr;
  if (!xr?.isSessionSupported) return false;
  try {
    return !!(await xr.isSessionSupported("immersive-vr"));
  } catch {
    return false;
  }
}

/** dlaczego VR nie wystartuje (po polsku) albo null, gdy można próbować */
export async function vrDiagnose(): Promise<string | null> {
  if (!window.isSecureContext) return "strona działa bez HTTPS - WebXR działa tylko pod https:// albo localhost";
  const xr = (navigator as unknown as { xr?: XR }).xr;
  if (!xr) return "przeglądarka nie udostępnia WebXR (navigator.xr) - włącz rozszerzenie emulatora i odśwież stronę (F5)";
  try {
    if (!(await xr.isSessionSupported("immersive-vr"))) return "przeglądarka nie widzi gogli VR - w emulatorze włącz urządzenie (Meta Quest) i odśwież stronę";
  } catch (e) {
    return "błąd WebXR: " + ((e as Error).message || e);
  }
  return null;
}

export class VrSession {
  /** obrót platformy (rad) i punkt odniesienia w pokoju (m): ruch poza nim nie przesuwa postaci */
  yaw = 0;
  anchor: [number, number] = [0, 0];
  anchored = false;
  fbo: WebGLFramebuffer | null = null;
  private prev = { left: [0, 0, 0, 0, 0] as number[], right: [0, 0, 0, 0, 0] as number[] };
  private ended = false;
  private endCbs: (() => void)[] = [];

  private constructor(readonly session: XR, private space: XR, private layer: XR, private poseSpace: XR) {
    this.fbo = layer.framebuffer ?? null;
    session.addEventListener("end", () => {
      this.ended = true;
      for (const f of this.endCbs) f();
    });
  }

  static async enter(gl: WebGL2RenderingContext): Promise<VrSession> {
    const xr = (navigator as unknown as { xr: XR }).xr;
    const session = await xr.requestSession("immersive-vr", { requiredFeatures: ["local-floor"], optionalFeatures: ["bounded-floor", "hand-tracking"] });
    try {
      try {
        await (gl as unknown as { makeXRCompatible?: () => Promise<void> }).makeXRCompatible?.();
      } catch (e) {
        console.warn("[vr] makeXRCompatible:", e);
      }
      const W = (window as unknown as { XRWebGLLayer: new (s: XR, g: WebGL2RenderingContext, o?: object) => XR }).XRWebGLLayer;
      const layer = new W(session, gl, { antialias: true, alpha: false, depth: true, framebufferScaleFactor: 1 });
      await session.updateRenderState({ baseLayer: layer, depthNear: 0.05, depthFar: 400 });
      const space = await session.requestReferenceSpace("local-floor");
      return new VrSession(session, space, layer, space);
    } catch (e) {
      session.end().catch(() => {});
      throw e;
    }
  }

  onEnd(f: () => void) {
    this.endCbs.push(f);
  }

  get active() {
    return !this.ended;
  }

  /** następna klatka zestawu (częstotliwość odświeżania zestawu, nie ekranu) */
  raf(cb: (t: number, frame: XR) => void) {
    return this.session.requestAnimationFrame(cb);
  }

  end() {
    if (!this.ended) this.session.end().catch(() => {});
  }

  /** ustaw punkt zerowy na aktualnej pozycji głowy (środkowanie widoku) */
  recenter() {
    this.anchored = false;
  }

  /** pozycje z ramki WebXR przeliczone na świat; body = stopy postaci */
  read(frame: XR, body: V3, near: number, far: number): VrFrame | null {
    const pose = frame.getViewerPose(this.space);
    if (!pose) return null;
    const S = VR_SCALE;
    const hp = pose.transform.position;
    if (!this.anchored) {
      this.anchor = [hp.x, hp.z];
      this.anchored = true;
    }
    // wychylenie głowy w pokoju ponad ~0,9 m przesuwa punkt odniesienia (jakbyśmy podeszli)
    const dx = hp.x - this.anchor[0], dz = hp.z - this.anchor[1];
    const dl = Math.hypot(dx, dz);
    const MAXLEAN = 0.9;
    if (dl > MAXLEAN) {
      this.anchor[0] += (dx / dl) * (dl - MAXLEAN);
      this.anchor[1] += (dz / dl) * (dl - MAXLEAN);
    }
    const R = rotY(this.yaw);
    const place = (x: number, y: number, z: number): V3 => {
      const v = apply3(R, [(x - this.anchor[0]) * S, y * S, (z - this.anchor[1]) * S]);
      return [body[0] + v[0], body[1] + v[1], body[2] + v[2]];
    };
    const rotOf = (m: Float32Array): number[] => {
      // kolumny macierzy WebXR -> wiersze 3x3, potem obrót platformy
      const cols: V3[] = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
      const c = cols.map((v) => apply3(R, v));
      return [c[0][0], c[1][0], c[2][0], c[0][1], c[1][1], c[2][1], c[0][2], c[1][2], c[2][2]];
    };
    const fwdOf = (r: number[]): V3 => norm([-r[2], -r[5], -r[8]]);

    const views: XrView[] = [];
    for (const v of pose.views) {
      const m: Float32Array = v.transform.matrix;
      const p = place(m[12], m[13], m[14]);
      const r = rotOf(m);
      // kolumny obrotu = osie oka w świecie
      const c0: V3 = [r[0], r[3], r[6]], c1: V3 = [r[1], r[4], r[7]], c2: V3 = [r[2], r[5], r[8]];
      const view = new Float32Array(16);
      view[0] = c0[0]; view[1] = c1[0]; view[2] = c2[0];
      view[4] = c0[1]; view[5] = c1[1]; view[6] = c2[1];
      view[8] = c0[2]; view[9] = c1[2]; view[10] = c2[2];
      view[12] = -(c0[0] * p[0] + c0[1] * p[1] + c0[2] * p[2]);
      view[13] = -(c1[0] * p[0] + c1[1] * p[1] + c1[2] * p[2]);
      view[14] = -(c2[0] * p[0] + c2[1] * p[1] + c2[2] * p[2]);
      view[15] = 1;
      const proj = new Float32Array(16);
      frustum(v.projectionMatrix, near, far, proj);
      const vp = this.layer.getViewport(v);
      views.push({ proj, view, eye: p, x: vp.x, y: vp.y, w: vp.width, h: vp.height });
    }
    const hm = pose.transform.matrix as Float32Array;
    const head = place(hp.x, hp.y, hp.z);
    const headDir = fwdOf(rotOf(hm));

    const hands: VrFrame["hands"] = {};
    for (const src of this.session.inputSources as XR[]) {
      const side = src.handedness === "left" ? "left" : src.handedness === "right" ? "right" : null;
      if (!side || !src.targetRaySpace) continue;
      const ray = frame.getPose(src.targetRaySpace, this.space);
      if (!ray) continue;
      const grip = src.gripSpace ? frame.getPose(src.gripSpace, this.space) : null;
      const rm: Float32Array = ray.transform.matrix;
      const rot = rotOf(rm);
      const aim = place(rm[12], rm[13], rm[14]);
      const gm: Float32Array = (grip ?? ray).transform.matrix;
      const pos = place(gm[12], gm[13], gm[14]);
      const gp = src.gamepad as Gamepad | undefined;
      const ax = gp?.axes ?? [];
      const bt = (i: number) => !!gp?.buttons?.[i]?.pressed;
      const now = [bt(0), bt(1), bt(3), bt(4), bt(5)].map(Number);
      const was = this.prev[side];
      this.prev[side] = now;
      const b: VrButtons = {
        trigger: !!now[0], squeeze: !!now[1], stick: !!now[2], a: !!now[3], b: !!now[4],
        pTrigger: !!now[0] && !was[0], pSqueeze: !!now[1] && !was[1], pStick: !!now[2] && !was[2], pA: !!now[3] && !was[3], pB: !!now[4] && !was[4],
      };
      hands[side] = {
        hand: side, pos, aim, aimDir: fwdOf(rot), rot,
        stick: [ax[2] ?? ax[0] ?? 0, ax[3] ?? ax[1] ?? 0],
        b,
        pulse(intensity: number, ms: number) {
          try {
            const a = (gp as unknown as { hapticActuators?: { pulse(i: number, d: number): void }[]; vibrationActuator?: { playEffect(t: string, o: object): void } } | undefined);
            if (a?.hapticActuators?.[0]) a.hapticActuators[0].pulse(intensity, ms);
            else a?.vibrationActuator?.playEffect("dual-rumble", { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
          } catch {
            /* brak wibracji */
          }
        },
      };
    }
    return { views, head, headDir, hands };
  }
}
