// Animacje z edytora animacji: liczenie pozy w danej chwili i gotowe szablony.
import type { AnimDef, AnimKeyframe, Joint, JointRot, Pose } from "./types.ts";
import { JOINTS } from "./types.ts";
import { newId } from "./world.ts";

export const JOINT_LABELS: Record<Joint, string> = {
  head: "Głowa",
  torso: "Tułów (całe ciało)",
  leftArm: "Lewa ręka",
  rightArm: "Prawa ręka",
  leftLeg: "Lewa noga",
  rightLeg: "Prawa noga",
};

const ZERO: JointRot = [0, 0, 0];
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export function emptyPose(): Pose {
  return { joints: {}, y: 0 };
}

export function clonePose(p: Pose): Pose {
  const joints: Pose["joints"] = {};
  for (const j of JOINTS) if (p.joints[j]) joints[j] = [...p.joints[j]!] as JointRot;
  return { joints, y: p.y ?? 0 };
}

function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const joints: Pose["joints"] = {};
  for (const j of JOINTS) {
    const ra = a.joints[j] ?? ZERO;
    const rb = b.joints[j] ?? ZERO;
    joints[j] = [ra[0] + (rb[0] - ra[0]) * k, ra[1] + (rb[1] - ra[1]) * k, ra[2] + (rb[2] - ra[2]) * k];
  }
  return { joints, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * k };
}

/** Poza animacji w chwili t (sekundy). Zapętlona animacja przechodzi płynnie z ostatniej klatki do pierwszej. */
export function samplePose(anim: AnimDef, t: number): Pose {
  const ks: AnimKeyframe[] = anim.keyframes;
  if (ks.length === 0) return emptyPose();
  if (ks.length === 1) return clonePose(ks[0].pose);
  const d = anim.duration;
  const time = anim.loop ? ((t % d) + d) % d : Math.min(Math.max(t, 0), d);
  let a: AnimKeyframe;
  let b: AnimKeyframe;
  let span: number;
  let local: number;
  const first = ks[0];
  const last = ks[ks.length - 1];
  if (time < first.t) {
    if (!anim.loop) return clonePose(first.pose);
    a = last;
    b = first;
    span = d - last.t + first.t;
    local = d - last.t + time;
  } else if (time >= last.t) {
    if (!anim.loop) return clonePose(last.pose);
    a = last;
    b = first;
    span = d - last.t + first.t;
    local = time - last.t;
  } else {
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1].t <= time) i++;
    a = ks[i];
    b = ks[i + 1];
    span = b.t - a.t;
    local = time - a.t;
  }
  let k = span > 0 ? local / span : 0;
  if (anim.smooth) k = smoothstep(k);
  return lerpPose(a.pose, b.pose, k);
}

const pose = (joints: Pose["joints"], y = 0): Pose => ({ joints, y });

/** Gotowe animacje na start w edytorze */
export function animTemplates(): Omit<AnimDef, "id">[] {
  return [
    { name: "Nowa animacja", duration: 1, loop: true, smooth: true, emote: false, keyframes: [{ t: 0, pose: emptyPose() }] },
    {
      name: "Machanie",
      duration: 1.2,
      loop: true,
      smooth: true,
      emote: true,
      keyframes: [
        { t: 0, pose: pose({ rightArm: [170, 0, -20], head: [0, -10, 0] }) },
        { t: 0.3, pose: pose({ rightArm: [170, 0, -50], head: [0, -10, 0] }) },
        { t: 0.6, pose: pose({ rightArm: [170, 0, -20], head: [0, -10, 0] }) },
        { t: 0.9, pose: pose({ rightArm: [170, 0, -50], head: [0, -10, 0] }) },
      ],
    },
    {
      name: "Skok radości",
      duration: 0.8,
      loop: true,
      smooth: true,
      emote: true,
      keyframes: [
        { t: 0, pose: pose({ leftArm: [20, 0, 10], rightArm: [20, 0, -10], leftLeg: [10, 0, 0], rightLeg: [10, 0, 0] }, 0) },
        { t: 0.4, pose: pose({ leftArm: [170, 0, 30], rightArm: [170, 0, -30], leftLeg: [-20, 0, 10], rightLeg: [-20, 0, -10] }, 1.5) },
      ],
    },
    {
      name: "Disco",
      duration: 1.6,
      loop: true,
      smooth: true,
      emote: true,
      keyframes: [
        { t: 0, pose: pose({ torso: [0, 20, 0], rightArm: [160, 0, -30], leftArm: [10, 0, 10], head: [0, 15, 0] }, 0.2) },
        { t: 0.4, pose: pose({ torso: [0, 0, 0], rightArm: [30, 0, 60], leftArm: [30, 0, -60], leftLeg: [20, 0, 0] }, 0) },
        { t: 0.8, pose: pose({ torso: [0, -20, 0], leftArm: [160, 0, 30], rightArm: [10, 0, -10], head: [0, -15, 0] }, 0.2) },
        { t: 1.2, pose: pose({ torso: [0, 0, 0], rightArm: [30, 0, 60], leftArm: [30, 0, -60], rightLeg: [20, 0, 0] }, 0) },
      ],
    },
    {
      name: "Ukłon",
      duration: 1.4,
      loop: false,
      smooth: true,
      emote: true,
      keyframes: [
        { t: 0, pose: emptyPose() },
        { t: 0.5, pose: pose({ torso: [35, 0, 0], head: [15, 0, 0], rightArm: [30, 0, 0] }, -0.3) },
        { t: 1.0, pose: pose({ torso: [35, 0, 0], head: [15, 0, 0], rightArm: [30, 0, 0] }, -0.3) },
        { t: 1.4, pose: emptyPose() },
      ],
    },
    {
      name: "Siedzenie",
      duration: 1,
      loop: true,
      smooth: false,
      emote: false,
      keyframes: [{ t: 0, pose: pose({ leftLeg: [90, 0, 0], rightLeg: [90, 0, 0], leftArm: [30, 0, 0], rightArm: [30, 0, 0] }, -1.6) }],
    },
  ];
}

export function makeAnim(templateName: string): AnimDef {
  const t = animTemplates().find((x) => x.name === templateName) ?? animTemplates()[0];
  return { ...structuredClone(t), id: newId() };
}
