// Ekran gry - łączy się z serwerem, steruje postacią i pokazuje innych graczy.
import { ArcRotateCamera, Scene, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import { Client, type Room } from "colyseus.js";
import type { Anim, Avatar, ChatMsg, NetPlayer, Part, WorldData } from "../../../shared/types.ts";
import { getToken, wsUrl } from "../api.ts";
import { AvatarModel } from "../engine/avatar.ts";
import { Input } from "../engine/input.ts";
import { CollisionWorld, stepBody, type Body } from "../engine/physics.ts";
import { createEngine, WorldView } from "../engine/world.ts";
import { session } from "../state.ts";
import { h, isTouch, toast } from "../ui/dom.ts";

interface Remote {
  model: AvatarModel;
  tag: Rectangle;
  username: string;
  tx: number; ty: number; tz: number; tr: number;
}

interface InitMsg {
  you: string;
  world: Omit<WorldData, "scripts">;
  info: { id: number; name: string; ownerName: string; isOwner: boolean };
  players: NetPlayer[];
  spawn: { x: number; y: number; z: number };
}

const WALK_SPEED = 16;
const JUMP_POWER = 50;
const BOUNCE_POWER = 110;
const SEND_EVERY = 1 / 15;

export function playScreen(
  root: HTMLElement,
  params: { worldId?: number; roomId?: string },
  go: (screen: string, params?: Record<string, unknown>) => void,
): () => void {
  const canvas = h("canvas", { class: "game-canvas" });
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner" }), "Łączenie z grą…");
  const wrap = h("div", { class: "play-screen" }, canvas, loading);
  root.append(wrap);

  const { engine, dispose: disposeEngine } = createEngine(canvas);
  const scene = new Scene(engine);
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
  const input = new Input(wrap);
  let room: Room | null = null;
  let leaving = false;
  let disposed = false;

  const client = new Client(wsUrl());
  const join = params.roomId
    ? client.joinById(params.roomId, { token: getToken() })
    : client.joinOrCreate("world", { worldId: params.worldId, token: getToken() });

  join
    .then((r) => {
      if (disposed) {
        r.leave();
        return;
      }
      room = r;
      r.onMessage("init", (m: InitMsg) => start(r, m));
      r.onLeave((code) => {
        if (!leaving && !disposed) {
          toast(code === 4000 ? "Wyrzucono z gry" : "Rozłączono z serwerem", "error");
          go("home");
        }
      });
      r.onError((_code, message) => toast("Błąd: " + (message ?? "?"), "error"));
    })
    .catch((e: Error) => {
      toast(e.message?.includes("full") ? "Serwer gry jest pełny" : "Nie udało się dołączyć: " + e.message, "error");
      go("home");
    });

  function start(r: Room, init: InitMsg) {
    loading.remove();
    const world = new WorldView(scene, { shadows: true, skyColor: init.world.skyColor });
    const parts = new Map<string, Part>(init.world.parts.map((p) => [p.id, p]));
    world.load(init.world.parts);
    for (const m of world.meshes.values()) {
      m.freezeWorldMatrix();
      m.doNotSyncBoundingInfo = true;
    }
    const collisions = new CollisionWorld(init.world.parts);
    const gravity = init.world.gravity;

    // ---------- kamera ----------
    const camera = new ArcRotateCamera("cam", Math.PI / 2, 1.2, 20, new Vector3(0, 5, 0), scene);
    camera.lowerRadiusLimit = 0.5;
    camera.upperRadiusLimit = 80;
    camera.lowerBetaLimit = 0.15;
    camera.upperBetaLimit = Math.PI * 0.58;
    camera.panningSensibility = 0;
    camera.wheelDeltaPercentage = 0.02;
    camera.pinchDeltaPercentage = 0.004;
    camera.angularSensibilityX = camera.angularSensibilityY = isTouch() ? 400 : 700;
    camera.minZ = 0.2;
    camera.maxZ = 2000;
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.attachControl(true);

    // ---------- gracz ----------
    const me = session.user!;
    const local = new AvatarModel(scene, me.avatar, world.shadows);
    const body: Body = { ...init.spawn, vx: 0, vy: 0, vz: 0, onGround: false };
    let ry = 0;
    let anim: Anim = "idle";
    let dead = false;
    let walkSpeed = WALK_SPEED;
    let jumpPower = JUMP_POWER;
    let sendTimer = 0;
    let touching = new Set<string>();

    const spawnPoint = () => {
      const spawns = [...parts.values()].filter((p) => p.kind === "spawn");
      const s = spawns[Math.floor(Math.random() * spawns.length)];
      return s
        ? { x: s.x + (Math.random() - 0.5) * 2, y: s.y + s.sy / 2 + 3, z: s.z + (Math.random() - 0.5) * 2 }
        : { x: 0, y: 5, z: 0 };
    };

    const die = () => {
      if (dead) return;
      dead = true;
      anim = "dead";
      setTimeout(() => {
        if (disposed) return;
        Object.assign(body, spawnPoint(), { vx: 0, vy: 0, vz: 0 });
        dead = false;
        anim = "idle";
        r.send("respawned");
      }, 3000);
    };

    // ---------- inni gracze ----------
    const remotes = new Map<string, Remote>();
    const makeTag = (text: string) => {
      const rect = new Rectangle();
      rect.adaptWidthToChildren = true;
      rect.height = "26px";
      rect.cornerRadius = 6;
      rect.thickness = 0;
      rect.background = "rgba(0,0,0,0.35)";
      const t = new TextBlock();
      t.text = text;
      t.color = "white";
      t.fontSize = 15;
      t.resizeToFit = true;
      t.paddingLeft = t.paddingRight = "8px";
      rect.addControl(t);
      gui.addControl(rect);
      return rect;
    };
    const addRemote = (p: NetPlayer) => {
      if (p.sid === init.you || remotes.has(p.sid)) return;
      const model = new AvatarModel(scene, p.avatar as Avatar, world.shadows);
      model.root.position.set(p.x, p.y, p.z);
      const tag = makeTag(p.username);
      tag.linkWithMesh(model.headNode);
      tag.linkOffsetY = -55;
      remotes.set(p.sid, {
        model, tag, username: p.username,
        tx: p.x, ty: p.y, tz: p.z, tr: p.ry,
      });
    };
    const removeRemote = (sid: string) => {
      const rm = remotes.get(sid);
      if (!rm) return;
      rm.model.dispose();
      rm.tag.dispose();
      remotes.delete(sid);
    };
    init.players.forEach(addRemote);

    /** Dymek z wiadomością nad głową gracza (znika po 6 s) */
    const showBubble = (username: string, text: string) => {
      const model =
        username === me.username ? local : [...remotes.values()].find((x) => x.username === username)?.model;
      if (!model) return;
      const rect = new Rectangle();
      rect.adaptWidthToChildren = true;
      rect.adaptHeightToChildren = true;
      rect.cornerRadius = 10;
      rect.thickness = 0;
      rect.background = "rgba(255,255,255,0.92)";
      const t = new TextBlock();
      t.text = text.length > 60 ? text.slice(0, 60) + "…" : text;
      t.color = "#111";
      t.fontSize = 15;
      t.resizeToFit = true;
      t.paddingLeft = t.paddingRight = "10px";
      t.paddingTop = t.paddingBottom = "5px";
      rect.addControl(t);
      gui.addControl(rect);
      rect.linkWithMesh(model.headNode);
      rect.linkOffsetY = -95;
      setTimeout(() => rect.dispose(), 6000);
    };

    // ---------- HUD ----------
    const coinsEl = h("span", null, String(me.coins));
    const chatLog = h("div", { class: "chat-log" });
    const chatInput = h("input", {
      class: "chat-input",
      placeholder: "Napisz wiadomość i naciśnij Enter…",
      maxLength: 200,
    });
    const chatBox = h("div", { class: "chat" }, chatLog, chatInput);
    const board = h("div", { class: "leaderboard hidden" });
    const consoleLog = h("div", { class: "console-log" });
    const consoleBox = h(
      "div",
      { class: "console hidden" },
      h("div", { class: "console-head" }, "Konsola skryptów", h("button", { class: "icon-btn", onClick: () => consoleBox.classList.add("hidden") }, "✕")),
      consoleLog,
    );
    const menu = h(
      "div",
      { class: "game-menu hidden" },
      h("h3", null, init.info.name),
      h("p", { class: "muted" }, "Twórca: " + init.info.ownerName),
      h("button", { class: "btn", onClick: () => { menu.classList.add("hidden"); die(); } }, "Zresetuj postać (R)"),
      h("button", { class: "btn", onClick: () => menu.classList.add("hidden") }, "Wróć do gry"),
      h("button", { class: "btn danger", onClick: () => leave() }, "Wyjdź z gry"),
    );
    const topbar = h(
      "div",
      { class: "hud-top" },
      h("button", { class: "hud-btn", onClick: () => menu.classList.toggle("hidden"), title: "Menu" }, "☰"),
      h("button", { class: "hud-btn", onClick: () => openChat(), title: "Czat" }, "💬"),
      init.info.isOwner
        ? h("button", { class: "hud-btn", onClick: () => consoleBox.classList.toggle("hidden"), title: "Konsola (F9)" }, "🖥")
        : null,
      h("div", { class: "hud-title" }, init.info.name),
      h("div", { class: "hud-coins" }, "🪙 ", coinsEl),
    );
    wrap.append(topbar, chatBox, board, consoleBox, menu);

    const addChat = (m: ChatMsg) => {
      const line = m.system
        ? h("div", { class: "chat-line system" }, m.text)
        : h("div", { class: "chat-line" }, h("b", null, m.from + ": "), m.text);
      chatLog.append(line);
      while (chatLog.children.length > 60) chatLog.firstChild?.remove();
      chatLog.scrollTop = chatLog.scrollHeight;
      if (!m.system) showBubble(m.from, m.text);
    };
    const openChat = () => {
      chatBox.classList.add("open");
      chatInput.focus();
    };
    chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const t = chatInput.value.trim();
        if (t) r.send("chat", t);
        chatInput.value = "";
        chatInput.blur();
      } else if (e.key === "Escape") chatInput.blur();
    });
    chatInput.addEventListener("focus", () => {
      input.enabled = false;
      chatBox.classList.add("open");
    });
    chatInput.addEventListener("blur", () => {
      input.enabled = true;
      chatBox.classList.remove("open");
    });
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === chatInput) return;
      if (e.key === "Enter" || e.key === "/") {
        e.preventDefault();
        openChat();
      } else if (e.code === "KeyR") die();
      else if (e.key === "Escape") menu.classList.toggle("hidden");
      else if (e.key === "F9" && init.info.isOwner) consoleBox.classList.toggle("hidden");
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));

    // ---------- wiadomości z serwera ----------
    r.onMessage("join", (p: NetPlayer) => addRemote(p));
    r.onMessage("leave", (sid: string) => removeRemote(sid));
    r.onMessage("chat", (m: ChatMsg) => addChat(m));
    r.onMessage("s", (snap: [string, number, number, number, number, Anim][]) => {
      for (const [sid, x, y, z, rot, a] of snap) {
        const rm = remotes.get(sid);
        if (!rm) continue;
        rm.tx = x;
        rm.ty = y;
        rm.tz = z;
        rm.tr = rot;
        rm.model.anim = a;
      }
    });
    r.onMessage("part", (changes: (Partial<Part> & { id: string })[]) => {
      for (const c of changes) {
        const p = parts.get(c.id);
        if (!p) continue;
        Object.assign(p, c);
        const mesh = world.meshes.get(p.id);
        mesh?.unfreezeWorldMatrix();
        world.apply(p);
        mesh?.freezeWorldMatrix();
        collisions.set(p);
      }
    });
    r.onMessage("kill", () => die());
    r.onMessage("tp", (t: { x: number; y: number; z: number }) => {
      Object.assign(body, t, { vx: 0, vy: 0, vz: 0 });
    });
    r.onMessage("stats", (s: { speed?: number; jump?: number }) => {
      if (typeof s.speed === "number") walkSpeed = s.speed;
      if (typeof s.jump === "number") jumpPower = s.jump;
    });
    r.onMessage("scores", (list: { name: string; score: number }[]) => {
      board.classList.toggle("hidden", list.length === 0);
      board.replaceChildren(
        h("div", { class: "lb-head" }, h("span", null, "Gracz"), h("span", null, "Punkty")),
        ...list
          .sort((a, b) => b.score - a.score)
          .map((e) => h("div", { class: "lb-row" }, h("span", null, e.name), h("span", null, String(e.score)))),
      );
    });
    r.onMessage("coins", (c: { earned: number; coins: number }) => {
      coinsEl.textContent = String(c.coins);
      if (session.user) session.set({ ...session.user, coins: c.coins });
      toast(`+${c.earned} 🪙 za granie`, "good");
    });
    r.onMessage("log", (l: { text: string; error: boolean }) => {
      consoleLog.append(h("div", { class: l.error ? "log-err" : "log-line" }, l.text));
      consoleLog.scrollTop = consoleLog.scrollHeight;
      if (l.error) consoleBox.classList.remove("hidden");
    });

    // ---------- pętla gry ----------
    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      input.update();

      // kierunek ruchu względem kamery
      const fx = camera.target.x - camera.position.x;
      const fz = camera.target.z - camera.position.z;
      const fl = Math.hypot(fx, fz) || 1;
      const fwdX = fx / fl, fwdZ = fz / fl;
      const rightX = fwdZ, rightZ = -fwdX;
      let mx = 0, mz = 0;
      if (!dead) {
        mx = rightX * input.moveX + fwdX * input.moveY;
        mz = rightZ * input.moveX + fwdZ * input.moveY;
      }
      const moving = Math.hypot(mx, mz) > 0.05;
      body.vx = mx * walkSpeed;
      body.vz = mz * walkSpeed;
      if (!dead && input.jump && body.onGround) {
        body.vy = jumpPower;
        body.onGround = false;
      }

      // fizyka w małych krokach
      const steps = Math.ceil(dt / (1 / 60));
      const newTouch = new Set<string>();
      for (let i = 0; i < steps; i++) {
        const res = stepBody(collisions, body, dt / steps, gravity);
        for (const p of res.touched) {
          newTouch.add(p.id);
          if (p.kind === "kill" && !dead) die();
        }
        if (res.landedOn?.kind === "bounce" && !dead) body.vy = BOUNCE_POWER;
      }
      for (const id of newTouch) if (!touching.has(id)) r.send("touch", id);
      touching = newTouch;
      if (body.y < -150 && !dead) die();

      // obrót postaci w stronę ruchu (w pierwszej osobie - w stronę kamery)
      const firstPerson = camera.radius < 1.5;
      if (firstPerson) ry = Math.atan2(-fwdX, -fwdZ);
      else if (moving) {
        const target = Math.atan2(-mx, -mz);
        let diff = target - ry;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ry += diff * Math.min(1, dt * 14);
      }
      if (!dead) anim = !body.onGround ? (body.vy > 0 ? "jump" : "fall") : moving ? "walk" : "idle";

      local.root.position.set(body.x, body.y, body.z);
      local.root.rotation.y = ry;
      local.anim = anim;
      local.update(dt);
      local.setVisible(!firstPerson);

      // kamera za graczem
      const head = new Vector3(body.x, body.y + 4.6, body.z);
      camera.target.addInPlace(head.subtract(camera.target).scale(Math.min(1, dt * 20)));
      world.followShadows(head);

      // inni gracze - płynne przejście do pozycji z serwera
      const k = Math.min(1, dt * 12);
      for (const rm of remotes.values()) {
        const p = rm.model.root.position;
        if (Math.abs(rm.tx - p.x) + Math.abs(rm.ty - p.y) + Math.abs(rm.tz - p.z) > 40) p.set(rm.tx, rm.ty, rm.tz);
        else p.set(p.x + (rm.tx - p.x) * k, p.y + (rm.ty - p.y) * k, p.z + (rm.tz - p.z) * k);
        let d = rm.tr - rm.model.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        rm.model.root.rotation.y += d * k;
        rm.model.update(dt);
      }

      sendTimer += dt;
      if (sendTimer >= SEND_EVERY) {
        sendTimer = 0;
        r.send("m", { x: body.x, y: body.y, z: body.z, ry, a: anim });
      }
    });
  }

  const cleanups: (() => void)[] = [];
  engine.runRenderLoop(() => scene.activeCamera && scene.render());

  function leave() {
    leaving = true;
    room?.leave();
    go("home");
  }

  return () => {
    disposed = true;
    leaving = true;
    room?.leave();
    cleanups.forEach((f) => f());
    input.dispose();
    scene.dispose();
    disposeEngine();
    wrap.remove();
  };
}
