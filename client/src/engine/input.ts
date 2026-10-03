// Sterowanie: klawiatura (WASD / strzałki / spacja), joystick i przycisk skoku na ekranie dotykowym
// oraz pady Xbox / PlayStation (lewa gałka i krzyżak = ruch, A / ✕ = skok, B / ○ = w dół).
import { h, isTouch } from "../ui/dom.ts";
import { Gamepads, type PadKind } from "./gamepad.ts";

export class Input {
  /** kierunek ruchu: x = prawo, y = przód (od -1 do 1) */
  moveX = 0;
  moveY = 0;
  jump = false;
  /** w dół (pływanie): C albo Ctrl */
  down = false;
  enabled = true;
  private keys = new Set<string>();
  private joy = { x: 0, y: 0 };
  /** joystick na ekranie działa jak krzyżak: liczy się tylko mocniejszy kierunek (gry 2D, jak w GDevelopie) */
  joyFourWay = false;
  /** krzyżak pada rusza postacią (2D); w 3D krzyżak ma inne zadania (przybliżenie, narzędzia) */
  padDpadMoves = true;
  private cleanup: (() => void)[] = [];
  readonly touchUi: HTMLElement | null = null;
  /** pad - stan z tej klatki (update) */
  readonly pads: Gamepads;

  constructor(container: HTMLElement, padHint?: (kind: PadKind) => string) {
    this.pads = new Gamepads(padHint);
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || (e.target as HTMLElement)?.tagName === "INPUT") return;
      this.keys.add(e.code);
      if (e.code === "Space") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    this.cleanup.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    });

    if (isTouch()) {
      const knob = h("div", { class: "joy-knob" });
      const joy = h("div", { class: "joy" }, knob);
      const jumpBtn = h("div", { class: "jump-btn" }, "⤒");
      this.touchUi = h("div", { class: "touch-ui" }, joy, jumpBtn);
      container.append(this.touchUi);

      let joyId: number | null = null;
      const R = 50;
      const moveJoy = (e: PointerEvent) => {
        const r = joy.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2);
        let dy = e.clientY - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy.x = dx / R;
        this.joy.y = -dy / R;
      };
      joy.addEventListener("pointerdown", (e) => {
        joyId = e.pointerId;
        joy.setPointerCapture(e.pointerId);
        moveJoy(e);
        e.preventDefault();
        e.stopPropagation();
      });
      joy.addEventListener("pointermove", (e) => {
        if (e.pointerId === joyId) moveJoy(e);
      });
      const endJoy = (e: PointerEvent) => {
        if (e.pointerId !== joyId) return;
        joyId = null;
        this.joy.x = this.joy.y = 0;
        knob.style.transform = "";
      };
      joy.addEventListener("pointerup", endJoy);
      joy.addEventListener("pointercancel", endJoy);

      jumpBtn.addEventListener("pointerdown", (e) => {
        this.keys.add("TouchJump");
        jumpBtn.classList.add("active");
        e.preventDefault();
        e.stopPropagation();
      });
      const endJump = () => {
        this.keys.delete("TouchJump");
        jumpBtn.classList.remove("active");
      };
      jumpBtn.addEventListener("pointerup", endJump);
      jumpBtn.addEventListener("pointercancel", endJump);
      jumpBtn.addEventListener("pointerleave", endJump);
    }
  }

  /** stan pada odczytany w update() */
  get pad() {
    return this.pads.state;
  }

  update() {
    const pad = this.pads.poll();
    if (!this.enabled) {
      this.moveX = this.moveY = 0;
      this.jump = false;
      this.down = false;
      return;
    }
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let jx = this.joy.x, jy = this.joy.y;
    if (this.joyFourWay) {
      if (Math.abs(jy) > Math.abs(jx)) jx = 0;
      else jy = 0;
    }
    // pad: lewa gałka i krzyżak (gałka w górę = do przodu)
    const dp = this.padDpadMoves;
    let px = pad.lx + (dp && pad.down.right ? 1 : 0) - (dp && pad.down.left ? 1 : 0);
    let py = -pad.ly + (dp && pad.down.up ? 1 : 0) - (dp && pad.down.down ? 1 : 0);
    if (this.joyFourWay && (px || py)) {
      if (Math.abs(py) > Math.abs(px)) px = 0;
      else py = 0;
    }
    x += jx + px;
    y += jy + py;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = x;
    this.moveY = y;
    this.jump = k.has("Space") || k.has("TouchJump") || pad.down.a;
    this.down = k.has("KeyC") || k.has("ControlLeft") || pad.down.b;
  }

  dispose() {
    this.pads.dispose();
    this.cleanup.forEach((f) => f());
    this.touchUi?.remove();
  }
}
