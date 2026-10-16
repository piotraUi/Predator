// Współpraca w Studiu 3D: zmiany wysyłane na żywo do innych twórców tej gry, a inni twórcy
// widoczni jako kolorowe kulki (tam, gdzie mają kamerę) z nickiem; ich zaznaczony klocek ma ramkę w ich kolorze.
import { Client, type Room } from "colyseus.js";
import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type ArcRotateCamera,
  type Scene,
} from "@babylonjs/core";
import type { Part, WorldData } from "../../../shared/types.ts";
import { getToken, wsUrl } from "../api.ts";

const FIELDS = [
  "scripts", "tools", "characters", "animations", "skyColor", "skybox", "gravity", "pvp", "playerCharacter",
  "badges", "products", "sounds", "music", "light", "atmosphere", "genre", "terrain", "guis", "places", "startPlace", "blocks",
] as const;
type Field = (typeof FIELDS)[number];

export interface Editor {
  sid: string;
  userId: number;
  username: string;
  color: string;
}

interface Remote extends Editor {
  ball: Mesh;
  label: Mesh;
  frame: Mesh | null;
  target: Vector3;
  sel: string | null;
}

export interface RemoteChange {
  parts: Part[];
  del: string[];
  fields: Field[];
}

export interface CollabOpts {
  worldId: number;
  data: WorldData;
  scene: Scene;
  camera: ArcRotateCamera;
  /** klocek zmieniony / dodany / usunięty przez kogoś innego - Studio odświeża widok i panele */
  onRemote: (c: RemoteChange) => void;
  /** lista twórców się zmieniła */
  onEditors: (list: Editor[]) => void;
  /** zaznaczony klocek (wysyłany innym) */
  selectedId: () => string | null;
  /** połączono pierwszy raz: stan gry z serwera (gdy ktoś już edytował, może być nowszy) */
  onState: (data: WorldData) => void;
}

export class Collab {
  private room: Room | null = null;
  private remotes = new Map<string, Remote>();
  /** ostatnio wysłany stan (JSON każdego klocka i pól) - wysyłamy tylko różnice */
  private sentParts = new Map<string, string>();
  private sentFields = new Map<string, string>();
  private me = "";
  private timer = 0;
  private cursorTimer = 0;
  private lastCursor = "";
  private disposed = false;
  connected = false;

  constructor(private o: CollabOpts) {
    this.baseline();
    this.connect();
    this.cursorTimer = window.setInterval(() => this.sendCursor(), 120);
    o.scene.onBeforeRenderObservable.add(this.animate);
  }

  private async connect() {
    try {
      const room = await new Client(wsUrl()).joinOrCreate("studio", { worldId: this.o.worldId, token: getToken() });
      if (this.disposed) return room.leave();
      this.room = room;
      room.onMessage("state", (m: { you: string; data: WorldData; editors: Editor[] }) => {
        this.me = m.you;
        // stan z serwera (ktoś mógł edytować) + moje zmiany, których serwer jeszcze nie ma
        // (np. po zerwaniu połączenia) - inaczej świeżo zrobiony teren albo klocki by zniknęły
        const srv = m.data;
        const pend = this.pendingChanges();
        const merged: WorldData = { ...srv, parts: srv.parts.filter((p) => !pend.del.has(p.id)) };
        const byId = new Map(merged.parts.map((p, i) => [p.id, i]));
        for (const p of pend.parts) {
          const i = byId.get(p.id);
          if (i === undefined) merged.parts.push(p);
          else merged.parts[i] = p;
        }
        const rec = merged as unknown as Record<string, unknown>;
        for (const f of pend.fields) {
          if (this.o.data[f] === undefined) delete rec[f];
          else rec[f] = this.o.data[f];
        }
        if (JSON.stringify(merged.parts) !== JSON.stringify(this.o.data.parts) || FIELDS.some((f) => JSON.stringify(merged[f] ?? null) !== JSON.stringify(this.o.data[f] ?? null)))
          this.o.onState(merged);
        // uzgodnione = to, co ma serwer; różnice (moje zmiany) zaraz pójdą
        this.sentParts = new Map(srv.parts.map((p) => [p.id, JSON.stringify(p)]));
        this.sentFields = new Map(FIELDS.map((f) => [f, JSON.stringify(srv[f] ?? null)]));
        this.connected = true;
        this.flush();
        for (const e of m.editors) if (e.sid !== this.me) this.addRemote(e);
        this.emitEditors(m.editors);
      });
      room.onMessage("joined", (e: Editor) => {
        this.addRemote(e);
        this.emitEditors();
      });
      room.onMessage("left", (sid: string) => {
        this.removeRemote(sid);
        this.emitEditors();
      });
      room.onMessage("ops", (m: { parts?: Part[]; del?: string[]; fields?: Record<string, unknown> }) => this.applyRemote(m));
      room.onMessage("cursor", (m: { sid: string; p: number[]; t: number[]; sel: string | null }) => this.onCursor(m));
      room.onLeave(() => {
        this.connected = false;
        for (const sid of [...this.remotes.keys()]) this.removeRemote(sid);
        this.emitEditors([]);
        // połączenie zerwane - próbujemy ponownie
        if (!this.disposed) setTimeout(() => this.connect(), 3000);
      });
    } catch {
      if (!this.disposed) setTimeout(() => this.connect(), 5000);
    }
  }

  private emitEditors(list?: Editor[]) {
    const all = list ?? [...this.remotes.values()];
    this.o.onEditors(all.filter((e) => e.sid !== this.me).map(({ sid, userId, username, color }) => ({ sid, userId, username, color })));
  }

  /** aktualny stan gry = "już wysłany" */
  private baseline() {
    this.sentParts = new Map(this.o.data.parts.map((p) => [p.id, JSON.stringify(p)]));
    this.sentFields = new Map(FIELDS.map((f) => [f, JSON.stringify(this.o.data[f] ?? null)]));
  }

  /** moje zmiany, których serwer jeszcze nie dostał */
  private pendingChanges() {
    const parts: Part[] = [];
    const seen = new Set<string>();
    for (const p of this.o.data.parts) {
      seen.add(p.id);
      if (this.sentParts.get(p.id) !== JSON.stringify(p)) parts.push(p);
    }
    const del = new Set([...this.sentParts.keys()].filter((id) => !seen.has(id)));
    const fields = FIELDS.filter((f) => this.sentFields.get(f) !== JSON.stringify(this.o.data[f] ?? null));
    return { parts, del, fields };
  }

  /** coś się zmieniło w Studiu - wysyłamy różnice (z małym opóźnieniem, żeby łączyć serie zmian) */
  changed() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 60);
  }

  private flush() {
    if (!this.room || !this.connected) return;
    const parts: Part[] = [];
    const seen = new Set<string>();
    for (const p of this.o.data.parts) {
      seen.add(p.id);
      const j = JSON.stringify(p);
      if (this.sentParts.get(p.id) !== j) {
        parts.push(p);
        this.sentParts.set(p.id, j);
      }
    }
    const del: string[] = [];
    for (const id of this.sentParts.keys())
      if (!seen.has(id)) {
        del.push(id);
        this.sentParts.delete(id);
      }
    const fields: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const j = JSON.stringify(this.o.data[f] ?? null);
      if (this.sentFields.get(f) !== j) {
        fields[f] = this.o.data[f] ?? null;
        this.sentFields.set(f, j);
      }
    }
    if (!parts.length && !del.length && !Object.keys(fields).length) return;
    this.room.send("ops", { ...(parts.length ? { parts } : {}), ...(del.length ? { del } : {}), ...(Object.keys(fields).length ? { fields } : {}) });
  }

  private applyRemote(m: { parts?: Part[]; del?: string[]; fields?: Record<string, unknown> }) {
    const d = this.o.data;
    const change: RemoteChange = { parts: [], del: [], fields: [] };
    if (m.parts) {
      const byId = new Map(d.parts.map((p) => [p.id, p]));
      for (const p of m.parts) {
        const cur = byId.get(p.id);
        if (cur) {
          // podmieniamy zawartość (ten sam obiekt - Studio trzyma do niego odwołania)
          for (const k of Object.keys(cur)) if (!(k in p)) delete (cur as unknown as Record<string, unknown>)[k];
          Object.assign(cur, p);
          change.parts.push(cur);
        } else {
          d.parts.push(p);
          change.parts.push(p);
        }
        this.sentParts.set(p.id, JSON.stringify(p));
      }
    }
    if (m.del) {
      const del = new Set(m.del);
      d.parts = d.parts.filter((p) => !del.has(p.id));
      for (const id of del) this.sentParts.delete(id);
      change.del = [...del];
    }
    if (m.fields)
      for (const [k, v] of Object.entries(m.fields)) {
        if (!(FIELDS as readonly string[]).includes(k)) continue;
        const rec = d as unknown as Record<string, unknown>;
        if (v === null) delete rec[k];
        else rec[k] = v;
        this.sentFields.set(k, JSON.stringify(v ?? null));
        change.fields.push(k as Field);
      }
    this.o.onRemote(change);
  }

  // ---------- kulki innych twórców ----------

  private addRemote(e: Editor) {
    if (this.remotes.has(e.sid) || e.sid === this.me) return;
    const scene = this.o.scene;
    const c = Color3.FromHexString(e.color);
    const ball = MeshBuilder.CreateSphere("editor-" + e.sid, { diameter: 1.6, segments: 16 }, scene);
    const mat = new StandardMaterial("editor-" + e.sid, scene);
    mat.diffuseColor = c;
    mat.emissiveColor = c.scale(0.6);
    mat.specularColor = new Color3(0.6, 0.6, 0.6);
    ball.material = mat;
    ball.isPickable = false;
    // nick nad kulką
    const tex = new DynamicTexture("editor-name-" + e.sid, { width: 512, height: 128 }, scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.min(500, ctx.measureText(e.username).width + 48);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(256 - w / 2, 20, w, 88, 40);
    ctx.fill();
    ctx.fillStyle = e.color;
    ctx.fillText(e.username, 256, 66);
    tex.update();
    const label = MeshBuilder.CreatePlane("editor-label-" + e.sid, { width: 4, height: 1 }, scene);
    const lm = new StandardMaterial("editor-label-" + e.sid, scene);
    lm.diffuseTexture = tex;
    lm.emissiveColor = Color3.White();
    lm.disableLighting = true;
    lm.useAlphaFromDiffuseTexture = true;
    label.material = lm;
    label.billboardMode = Mesh.BILLBOARDMODE_ALL;
    label.parent = ball;
    label.position.y = 1.8;
    label.isPickable = false;
    ball.setEnabled(false);
    this.remotes.set(e.sid, { ...e, ball, label, frame: null, target: new Vector3(), sel: null });
  }

  private removeRemote(sid: string) {
    const r = this.remotes.get(sid);
    if (!r) return;
    r.frame?.dispose();
    r.label.material?.dispose();
    r.label.dispose();
    r.ball.material?.dispose();
    r.ball.dispose();
    this.remotes.delete(sid);
  }

  private onCursor(m: { sid: string; p: number[]; t: number[]; sel: string | null }) {
    const r = this.remotes.get(m.sid);
    if (!r) return;
    r.target.set(m.p[0], m.p[1], m.p[2]);
    if (!r.ball.isEnabled()) {
      r.ball.position.copyFrom(r.target);
      r.ball.setEnabled(true);
    }
    if (m.sel !== r.sel) {
      r.sel = m.sel;
      this.updateFrame(r);
    }
  }

  /** ramka w kolorze twórcy wokół klocka, który zaznaczył */
  updateFrame(r: Remote) {
    r.frame?.dispose();
    r.frame = null;
    const p = r.sel ? this.o.data.parts.find((x) => x.id === r.sel) : undefined;
    if (!p) return;
    const box = MeshBuilder.CreateBox("editor-sel-" + r.sid, { size: 1 }, this.o.scene);
    const mat = new StandardMaterial("editor-sel-" + r.sid, this.o.scene);
    mat.wireframe = true;
    mat.emissiveColor = Color3.FromHexString(r.color);
    mat.disableLighting = true;
    box.material = mat;
    box.isPickable = false;
    box.position.set(p.x, p.y, p.z);
    box.scaling.set(p.sx + 0.3, p.sy + 0.3, p.sz + 0.3);
    box.rotation.set(((p.rx ?? 0) * Math.PI) / 180, (p.ry * Math.PI) / 180, ((p.rz ?? 0) * Math.PI) / 180);
    r.frame = box;
  }

  /** klocek zmienił się (np. inny twórca go przesunął) - ramki za nim */
  refreshFrames() {
    for (const r of this.remotes.values()) if (r.sel) this.updateFrame(r);
  }

  private animate = () => {
    const dt = Math.min(0.1, this.o.scene.getEngine().getDeltaTime() / 1000);
    for (const r of this.remotes.values()) {
      if (!r.ball.isEnabled()) continue;
      r.ball.position.addInPlace(r.target.subtract(r.ball.position).scale(Math.min(1, dt * 10)));
    }
  };

  private sendCursor() {
    if (!this.room || !this.connected) return;
    const c = this.o.camera;
    const p = c.position;
    const t = c.target;
    const sel = this.o.selectedId();
    const r = (v: number) => Math.round(v * 10) / 10;
    const msg = { p: [r(p.x), r(p.y), r(p.z)], t: [r(t.x), r(t.y), r(t.z)], sel };
    const j = JSON.stringify(msg);
    if (j === this.lastCursor) return;
    this.lastCursor = j;
    this.room.send("cursor", msg);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    clearInterval(this.cursorTimer);
    this.flush();
    this.o.scene.onBeforeRenderObservable.removeCallback(this.animate);
    for (const sid of [...this.remotes.keys()]) this.removeRemote(sid);
    this.room?.leave();
  }
}
