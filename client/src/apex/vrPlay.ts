// Sterowanie i interfejs w VR: ruch lewą gałką, obrót prawą, promienie z kontrolerów, menu, GUI gry i zegarek na nadgarstku.
import type { GuiDef } from "../../../shared/gui.ts";
import { lookRot } from "./math.ts";
import type { V3 } from "./math.ts";
import { MAT, type Renderer } from "./renderer.ts";
import { VR_SCALE, type VrFrame, type VrHand, type VrSession } from "./vr.ts";
import { paintButtons, paintGuis, VrPanel } from "./vrPanel.ts";

export interface VrHost {
  rend: Renderer;
  gameName: string;
  gui(): { guis: GuiDef[]; text: Record<string, string> };
  fireGui(gui: string, el: string): void;
  status(): { hp: number; maxHp: number; coins: number; tool: string | null; name: string };
  chat(): string[];
  resume(): void;
  reset(): void;
  leaveGame(): void;
  exitVr(): void;
  toggleSit(): void;
  cycleTool(dir: 1 | -1): void;
  /** użycie narzędzia: promień z kontrolera */
  useTool(origin: V3, dir: V3): void;
  /** narysuj trzymane narzędzie w dłoni (obrót, pozycja) */
  drawHeld(rot: number[], pos: V3): void;
}

export interface VrMove { moveX: number; moveY: number; jump: boolean; down: boolean }

const KEY_TURN = "vrTurn", KEY_MOVE = "vrMoveRel";
const load = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* brak zapisu */
  }
};

const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);

export class VrController {
  turn: "snap" | "smooth" = load(KEY_TURN, "snap") === "smooth" ? "smooth" : "snap";
  moveRel: "head" | "hand" = load(KEY_MOVE, "head") === "hand" ? "hand" : "head";
  readonly menu = new VrPanel(1024, 640, 1.3);
  readonly gui = new VrPanel(1280, 720, 1.8);
  readonly watch = new VrPanel(320, 200, 0.17);
  menuOpen = false;
  private latch = false;
  private guiShown = false;
  private guiYaw = 0;
  private lastWatch = 0;
  private lastMenu = 0;
  private hovers = new Map<VrPanel, number>();
  /** ostatnio widziane stany do przemalowania */
  private guiKey = "";
  private head: V3 = [0, 0, 0];
  private hits = new Map<string, number | undefined>();

  constructor(private host: VrHost) {
    this.menu.visible = false;
    this.gui.visible = false;
    this.watch.visible = true;
    this.layoutMenu();
  }

  private layoutMenu() {
    const m = this.menu;
    const w = 440, h = 78, x1 = 50, x2 = 534;
    const rows = [92, 188, 284];
    m.buttons = [
      { x: x1, y: rows[0], w, h, label: "▶ Wróć do gry", click: () => this.toggleMenu(false) },
      { x: x2, y: rows[0], w, h, label: "🔄 Zresetuj postać", click: () => (this.host.reset(), this.toggleMenu(false)) },
      { x: x1, y: rows[1], w, h, label: "Obrót: " + (this.turn === "snap" ? "skokowy" : "płynny"), click: () => (this.turn = this.turn === "snap" ? "smooth" : "snap", save(KEY_TURN, this.turn), this.layoutMenu()) },
      { x: x2, y: rows[1], w, h, label: "Chodzenie: " + (this.moveRel === "head" ? "za głową" : "za ręką"), click: () => (this.moveRel = this.moveRel === "head" ? "hand" : "head", save(KEY_MOVE, this.moveRel), this.layoutMenu()) },
      { x: x1, y: rows[2], w, h, label: "🎯 Wyśrodkuj widok", click: () => this.recenter?.() },
      { x: x2, y: rows[2], w, h, label: "🪑 Usiądź / wstań", click: () => (this.host.toggleSit(), this.toggleMenu(false)) },
      { x: x1, y: 380, w, h, label: "🥽 Wyjdź z VR", click: () => this.host.exitVr() },
      { x: x2, y: 380, w, h, label: "🚪 Wyjdź z gry", danger: true, click: () => this.host.leaveGame() },
    ];
    this.repaintMenu();
  }

  recenter: (() => void) | null = null;

  private repaintMenu() {
    paintButtons(this.menu, this.host.gameName, this.host.chat());
  }

  toggleMenu(open = !this.menuOpen) {
    if (open === this.menuOpen) return;
    this.menuOpen = open;
    this.menu.visible = open;
    if (open) {
      const d = this.flat(this.headDir);
      this.menu.placeFacing(this.head, [this.head[0] + d[0] * 1.15 * VR_SCALE, this.head[1] - 0.12 * VR_SCALE, this.head[2] + d[2] * 1.15 * VR_SCALE]);
      this.layoutMenu();
    }
  }

  private headDir: V3 = [0, 0, -1];
  private flat(d: V3): V3 {
    const l = Math.hypot(d[0], d[2]) || 1;
    return [d[0] / l, 0, d[2] / l];
  }

  /** wejścia z kontrolerów; wywoływane raz na klatkę przed krokiem gry */
  update(vr: VrSession, f: VrFrame, dt: number): VrMove {
    this.head = f.head;
    this.headDir = f.headDir;
    this.recenter = () => vr.recenter();
    const { left, right } = f.hands;
    const out: VrMove = { moveX: 0, moveY: 0, jump: false, down: false };

    // --- ruch ---
    if (left) {
      const rgt = dead(left.stick[0]), fwd = -dead(left.stick[1]);
      let sx = rgt, sy = fwd;
      if (this.moveRel === "hand" && (rgt || fwd)) {
        // wektor ruchu w układzie ręki -> w układzie głowy (gra liczy ruch względem kamery)
        const h = this.flat(f.headDir), q = this.flat(left.aimDir);
        const wx = q[2] * rgt + q[0] * fwd, wz = -q[0] * rgt + q[2] * fwd;
        sx = wx * h[2] - wz * h[0];
        sy = wx * h[0] + wz * h[2];
      }
      const l = Math.hypot(sx, sy);
      if (l > 1) {
        sx /= l;
        sy /= l;
      }
      out.moveX = sx;
      out.moveY = sy;
    }
    // --- obrót ---
    if (right) {
      const x = dead(right.stick[0]);
      if (this.turn === "smooth") vr.yaw -= x * dt * 2.2;
      else if (Math.abs(right.stick[0]) > 0.7) {
        if (!this.latch) {
          this.latch = true;
          vr.yaw -= Math.sign(right.stick[0]) * (Math.PI / 6);
        }
      } else if (Math.abs(right.stick[0]) < 0.4) this.latch = false;
      out.jump = right.b.a;
      out.down = right.b.b;
      if (right.b.pStick) vr.recenter();
      if (right.b.pSqueeze) this.host.cycleTool(1);
    }
    if (left) {
      if (left.b.pSqueeze) this.host.cycleTool(-1);
      if (left.b.pA) this.host.toggleSit();
      if (left.b.pB) this.toggleMenu();
    }

    // --- GUI gry w panelu przed twarzą ---
    const snap = this.host.gui();
    const showGui = snap.guis.length > 0;
    if (showGui !== this.guiShown) {
      this.guiShown = showGui;
      this.gui.visible = showGui;
      if (showGui) {
        const d = this.flat(f.headDir);
        this.guiYaw = Math.atan2(d[0], d[2]);
        this.placeGui();
      }
    }
    if (showGui) {
      // panel leniwie podąża za spojrzeniem
      const d = this.flat(f.headDir);
      let diff = Math.atan2(d[0], d[2]) - this.guiYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 0.65) this.guiYaw += Math.sign(diff) * (Math.abs(diff) - 0.65) * Math.min(1, dt * 4);
      this.placeGui();
      const key = JSON.stringify([snap.guis.map((g) => g.id), snap.text, this.gui.hover]);
      if (key !== this.guiKey) {
        this.guiKey = key;
        paintGuis(this.gui, snap.guis, snap.text);
      }
    }

    // --- promienie z kontrolerów: najpierw panele, potem narzędzie ---
    const panels = [this.menu, this.gui].filter((p) => p.visible);
    const usedPanel = new Set<VrHand>();
    const hoverNow = new Map<VrPanel, number>();
    for (const hand of [right, left]) {
      if (!hand) continue;
      let best: { p: VrPanel; px: number; py: number; dist: number } | null = null;
      for (const p of panels) {
        const hit = p.hit(hand.aim, hand.aimDir);
        if (hit && (!best || hit.dist < best.dist)) best = { p, px: hit.px, py: hit.py, dist: hit.dist };
      }
      this.hits.set(hand.hand, best?.dist);
      if (!best) continue;
      usedPanel.add(hand);
      const i = best.p.buttonAt(best.px, best.py);
      hoverNow.set(best.p, i);
      if (hand.b.pTrigger && i >= 0) {
        const b = best.p.buttons[i];
        hand.pulse(0.45, 40);
        if (b.gui && b.el) this.host.fireGui(b.gui, b.el);
        else b.click();
      }
    }
    for (const p of panels) {
      const i = hoverNow.get(p) ?? -1;
      if (i !== p.hover) {
        p.hover = i;
        if (p === this.menu) this.repaintMenu();
        else this.guiKey = "";
      }
    }
    if (right && !usedPanel.has(right) && right.b.trigger && !this.menuOpen) {
      this.host.useTool(right.aim, right.aimDir);
      if (right.b.pTrigger) right.pulse(0.3, 30);
    }

    // zegarek: zdrowie, monety, narzędzie
    const now = performance.now();
    if (now - this.lastWatch > 250) {
      this.lastWatch = now;
      const st = this.host.status();
      const g = this.watch.ctx;
      g.clearRect(0, 0, 320, 200);
      g.fillStyle = "rgba(15,17,26,0.9)";
      g.fillRect(0, 0, 320, 200);
      g.strokeStyle = "#5865f2";
      g.lineWidth = 6;
      g.strokeRect(3, 3, 314, 194);
      g.fillStyle = "#333";
      g.fillRect(16, 20, 288, 26);
      const k = Math.max(0, Math.min(1, st.hp / st.maxHp));
      g.fillStyle = k > 0.5 ? "#2ecc71" : k > 0.25 ? "#f1c40f" : "#e74c3c";
      g.fillRect(16, 20, 288 * k, 26);
      g.fillStyle = "#fff";
      g.font = "bold 34px system-ui, sans-serif";
      g.textBaseline = "middle";
      g.textAlign = "left";
      g.fillText("❤ " + Math.round(st.hp), 16, 82);
      g.fillText("🪙 " + st.coins, 16, 124);
      g.font = "24px system-ui, sans-serif";
      g.fillStyle = "#c8cbe0";
      g.fillText(st.tool ? "🗡 " + st.tool : st.name, 16, 168, 288);
      this.watch.invalidate();
    }
    if (this.menuOpen && now - this.lastMenu > 1000) {
      this.lastMenu = now;
      this.repaintMenu();
    }
    return out;
  }

  private placeGui() {
    const d: V3 = [Math.sin(this.guiYaw), 0, Math.cos(this.guiYaw)];
    const dist = 1.7 * VR_SCALE;
    this.gui.placeFacing(this.head, [this.head[0] + d[0] * dist, this.head[1] - 0.05 * VR_SCALE, this.head[2] + d[2] * dist]);
  }

  /** dłonie, laser, zegarek i panele w tej klatce */
  draw(f: VrFrame) {
    const r = this.host.rend;
    const S = VR_SCALE;
    for (const hand of [f.hands.left, f.hands.right]) {
      if (!hand) continue;
      const col: [number, number, number] = hand.hand === "left" ? [0.25, 0.5, 1] : [1, 0.55, 0.15];
      // uchwyt kontrolera i świecąca końcówka
      const back: V3 = [hand.rot[2], hand.rot[5], hand.rot[8]];
      const c: V3 = [hand.pos[0] + back[0] * 0.02 * S, hand.pos[1] + back[1] * 0.02 * S, hand.pos[2] + back[2] * 0.02 * S];
      r.drawBox("box", hand.rot, c, [0.026 * S, 0.032 * S, 0.1 * S], [0.2, 0.21, 0.27], 1, MAT.plastic);
      r.drawBox("sphere", hand.rot, [hand.aim[0], hand.aim[1], hand.aim[2]], [0.018 * S, 0.018 * S, 0.018 * S], col, 1, MAT.neon);
      // laser: do panelu albo krótki wskaźnik
      const hd = this.hits.get(hand.hand);
      const len = hd !== undefined ? hd : this.menuOpen || this.guiShown ? 6 * S : 1.6 * S;
      const mid: V3 = [hand.aim[0] + hand.aimDir[0] * len / 2, hand.aim[1] + hand.aimDir[1] * len / 2, hand.aim[2] + hand.aimDir[2] * len / 2];
      r.drawBox("box", lookRot(hand.aimDir), mid, [0.006 * S, 0.006 * S, len], col, 0.75, MAT.neon);
      if (hd !== undefined) {
        const tip: V3 = [hand.aim[0] + hand.aimDir[0] * hd, hand.aim[1] + hand.aimDir[1] * hd, hand.aim[2] + hand.aimDir[2] * hd];
        r.drawBox("sphere", hand.rot, tip, [0.02 * S, 0.02 * S, 0.02 * S], [1, 1, 1], 1, MAT.neon);
      }
      if (hand.hand === "right") this.host.drawHeld(hand.rot, hand.pos);
      if (hand.hand === "left") {
        // zegarek nad nadgarstkiem, ekranem do twarzy
        const up: V3 = [hand.rot[1], hand.rot[4], hand.rot[7]];
        const p: V3 = [hand.pos[0] + up[0] * 0.09 * S, hand.pos[1] + up[1] * 0.09 * S, hand.pos[2] + up[2] * 0.09 * S];
        this.watch.placeFacing(f.head, p);
        this.watch.draw(r);
      }
    }
    this.menu.draw(r);
    this.gui.draw(r);
  }

  dispose() {
    for (const p of [this.menu, this.gui, this.watch]) p.dispose(this.host.rend);
  }
}
