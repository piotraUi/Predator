// Rysowanie nieba (skyboxa) na płótnie: gradient, gwiazdy, słońce, księżyc, chmury, zorza, mgławica.
// To samo płótno idzie na kopułę w 3D i na miniaturki w Studio.
import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, Texture } from "@babylonjs/core";
import type { SkyboxDef } from "../../../shared/skybox.ts";

/**
 * Płótno w układzie "równoprostokątnym": x = dookoła (0..360°), y = od zenitu (góra) do nadiru (dół).
 * Horyzont jest w połowie wysokości.
 */
export function drawSky(ctx: CanvasRenderingContext2D, s: SkyboxDef, w: number, h: number, seed = 7) {
  let r = seed * 7919;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const hz = h / 2;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, s.top);
  g.addColorStop(0.3, s.top);
  g.addColorStop(0.5, s.horizon);
  g.addColorStop(0.56, s.bottom);
  g.addColorStop(1, s.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (s.nebula) {
    for (const [x, y, rad, col] of [
      [0.2, 0.25, 0.22, "#7b2cbf"],
      [0.55, 0.35, 0.18, "#1f6feb"],
      [0.8, 0.2, 0.2, "#d6336c"],
    ] as const) {
      const ng = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, rad * w);
      ng.addColorStop(0, col + "88");
      ng.addColorStop(1, col + "00");
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, w, h);
    }
  }

  if (s.stars) {
    for (let i = 0; i < s.stars; i++) {
      const y = rnd() * hz * 0.98;
      const x = rnd() * w;
      const b = 0.4 + rnd() * 0.6;
      ctx.globalAlpha = b * Math.min(1, (hz - y) / (hz * 0.25) + 0.2);
      ctx.fillStyle = rnd() < 0.15 ? "#ffe9b0" : "#ffffff";
      const sz = rnd() < 0.08 ? 2.2 : 1.2;
      ctx.fillRect(x, y, sz * (w / 1024), sz * (w / 1024));
    }
    ctx.globalAlpha = 1;
  }

  if (s.aurora) {
    for (let band = 0; band < 3; band++) {
      const baseY = hz * (0.55 + band * 0.1);
      const col = ["#39ff9f", "#2ee6d6", "#b36bff"][band];
      for (let x = 0; x < w; x += 2) {
        const y = baseY + Math.sin((x / w) * Math.PI * 6 + band) * hz * 0.08 + Math.sin((x / w) * Math.PI * 17) * hz * 0.02;
        const ag = ctx.createLinearGradient(0, y - hz * 0.18, 0, y);
        ag.addColorStop(0, col + "00");
        ag.addColorStop(1, col + "66");
        ctx.fillStyle = ag;
        ctx.fillRect(x, y - hz * 0.18, 2, hz * 0.18);
      }
    }
  }

  const sx = w * 0.3;
  if (s.sun) {
    const y = hz - s.sun.height * hz;
    const rad = s.sun.size * (w / 1024);
    const glow = ctx.createRadialGradient(sx, y, 0, sx, y, rad * 5);
    glow.addColorStop(0, s.sun.color + "cc");
    glow.addColorStop(1, s.sun.color + "00");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - rad * 5, y - rad * 5, rad * 10, rad * 10);
    ctx.fillStyle = s.sun.color;
    ctx.beginPath();
    ctx.arc(sx, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  if (s.moon) {
    const y = hz * 0.45;
    const rad = 16 * (w / 1024);
    const glow = ctx.createRadialGradient(sx, y, 0, sx, y, rad * 4);
    glow.addColorStop(0, "#dfe8ff55");
    glow.addColorStop(1, "#dfe8ff00");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - rad * 4, y - rad * 4, rad * 8, rad * 8);
    ctx.fillStyle = "#f4f1e6";
    ctx.beginPath();
    ctx.arc(sx, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8d4c4";
    for (const [dx, dy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12]]) {
      ctx.beginPath();
      ctx.arc(sx + dx * rad, y + dy * rad, cr * rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (s.planet) {
    const px = w * 0.7, py = hz * 0.55, pr = 40 * (w / 1024);
    const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, "#ffd6a5");
    pg.addColorStop(1, "#b5651d");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e8c9a0aa";
    ctx.lineWidth = 4 * (w / 1024);
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.9, pr * 0.45, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (s.clouds) {
    ctx.fillStyle = s.clouds.color;
    for (let i = 0; i < s.clouds.count; i++) {
      const cx = rnd() * w;
      // chmury nisko nad horyzontem; im bliżej horyzontu, tym mniejsze (dalej)
      const cy = hz * (0.7 + rnd() * 0.26);
      const cw = (18 + rnd() * 40) * (w / 1024) * (0.5 + (1 - cy / hz) * 3);
      ctx.globalAlpha = s.clouds.alpha * (0.6 + rnd() * 0.4);
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(cx + (k - 2) * cw * 0.35 + (rnd() - 0.5) * cw * 0.2, cy + (rnd() - 0.5) * cw * 0.12, cw * (0.3 + rnd() * 0.2), cw * (0.14 + rnd() * 0.08), 0, 0, Math.PI * 2);
        ctx.fill();
        // chmura, która przechodzi przez brzeg płótna, pojawia się też po drugiej stronie (bez szwu)
        if (cx < cw * 1.2) {
          ctx.beginPath();
          ctx.ellipse(cx + w + (k - 2) * cw * 0.35, cy, cw * 0.35, cw * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Kopuła nieba wokół kamery */
export class SkyDome {
  private mesh: Mesh;
  private tex: DynamicTexture;
  private mat: StandardMaterial;

  constructor(scene: Scene, s: SkyboxDef) {
    this.tex = new DynamicTexture("skyTex", { width: 2048, height: 1024 }, scene, true);
    this.tex.wrapU = Texture.WRAP_ADDRESSMODE;
    this.tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.mat = new StandardMaterial("skyMat", scene);
    this.mat.backFaceCulling = false;
    this.mat.disableLighting = true;
    this.mat.emissiveTexture = this.tex;
    this.mat.diffuseColor = Color3.Black();
    this.mat.specularColor = Color3.Black();
    this.mat.fogEnabled = false;
    this.mesh = MeshBuilder.CreateSphere("skyDome", { diameter: 1600, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
    this.mesh.material = this.mat;
    this.mesh.infiniteDistance = true;
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 0;
    this.mesh.applyFog = false;
    this.set(s);
  }

  set(s: SkyboxDef) {
    const ctx = this.tex.getContext() as unknown as CanvasRenderingContext2D;
    const { width, height } = this.tex.getSize();
    // kula ma teksturę "do góry nogami" względem płótna - rysujemy odwrócone w pionie
    ctx.save();
    ctx.translate(0, height);
    ctx.scale(1, -1);
    drawSky(ctx, s, width, height);
    ctx.restore();
    this.tex.update();
  }

  dispose() {
    this.mesh.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

/** Mała miniaturka nieba (np. w Studio) */
export function skyPreview(s: SkyboxDef, w = 160, h = 80): HTMLCanvasElement {
  const big = document.createElement("canvas");
  big.width = 512;
  big.height = 256;
  drawSky(big.getContext("2d")!, s, 512, 256);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // górna połowa (niebo) plus trochę horyzontu
  c.getContext("2d")!.drawImage(big, 0, 20, 256, 128 + 10, 0, 0, w, h);
  return c;
}
