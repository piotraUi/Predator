// Czat głosowy w grze: rozmawiasz z graczami w pobliżu (albo tylko ze znajomymi). Połączenia WebRTC
// bezpośrednio między graczami, serwer gry wybiera rozmówców i tylko przekazuje sygnały.
// Każdą osobę (albo wszystkich) można wyciszyć; w grach 3D głos cichnie z odległością.
import { h, toast } from "../ui/dom.ts";
import type { GameConnection } from "./connection.ts";

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

type Signal = { type: "offer" | "answer"; sdp: string } | { type: "ice"; candidate: RTCIceCandidateInit };

interface Peer {
  sid: string;
  username: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  muted: boolean;
  speaking: boolean;
  level?: () => number;
}

export class VoiceChat {
  private stream: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private on = false;
  private selfMuted = false;
  private audioCtx: AudioContext | null = null;
  private timer = 0;
  /** wyciszeni wszyscy inni */
  private allMuted = false;
  /** słyszą mnie tylko znajomi */
  private friendsOnly = (() => {
    try {
      return localStorage.getItem("predator.voiceFriendsOnly") === "1";
    } catch {
      return false;
    }
  })();
  /** głośność osoby zależnie od odległości (0..1) - ustawia ekran gry 3D */
  volumeFor: ((sid: string) => number) | null = null;
  /** ktoś zaczął / przestał mówić (ikonka przy nicku) */
  onSpeaking: ((sid: string, speaking: boolean) => void) | null = null;
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;

  constructor(
    private conn: GameConnection,
    private mySid: string,
  ) {
    this.button = h("button", { class: "hud-btn voice-btn", title: "Czat głosowy", onClick: () => this.togglePanel() }, "🎤");
    this.panel = h("div", { class: "voice-panel hidden" });
    conn.onMessage("voicepeers", (list: { sid: string; username: string }[]) => this.setPeers(list));
    conn.onMessage("rtc", (m: { from: string; data: Signal }) => this.onSignal(m.from, m.data));
    this.render();
  }

  static supported() {
    return typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  private togglePanel() {
    this.panel.classList.toggle("hidden");
    this.render();
  }

  private async start() {
    if (!VoiceChat.supported()) {
      toast("Czat głosowy działa w aplikacji Predator (.exe / APK) albo na stronie przez https.", "error");
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      toast("Brak dostępu do mikrofonu - zezwól na mikrofon w ustawieniach.", "error");
      return;
    }
    this.on = true;
    this.selfMuted = false;
    this.conn.send("voicemode", this.friendsOnly ? "friends" : "all");
    this.conn.send("voice", true);
    this.timer = window.setInterval(() => this.tickLevels(), 150);
    toast(this.friendsOnly ? "🎤 Głos włączony - słyszą Cię znajomi w tej grze" : "🎤 Głos włączony - słyszą Cię gracze w pobliżu", "good");
    this.render();
  }

  private stop() {
    this.on = false;
    this.conn.send("voice", false);
    for (const p of this.peers.values()) {
      this.closePeer(p);
      if (p.speaking) this.onSpeaking?.(p.sid, false);
    }
    this.peers.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    clearInterval(this.timer);
    this.render();
  }

  private toggleSelfMute() {
    this.selfMuted = !this.selfMuted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !this.selfMuted));
    this.render();
  }

  private setPeers(list: { sid: string; username: string }[]) {
    if (!this.on) return;
    const want = new Set(list.map((p) => p.sid));
    for (const [sid, p] of this.peers)
      if (!want.has(sid)) {
        this.closePeer(p);
        this.peers.delete(sid);
        if (p.speaking) this.onSpeaking?.(sid, false);
      }
    for (const p of list) {
      if (this.peers.has(p.sid)) continue;
      const peer = this.makePeer(p.sid, p.username);
      // ofertę wysyła zawsze ten z "mniejszym" identyfikatorem - nigdy obaj naraz
      if (this.mySid < p.sid) this.makeOffer(peer);
    }
    this.render();
  }

  private makePeer(sid: string, username: string): Peer {
    const pc = new RTCPeerConnection(ICE);
    const audio = new Audio();
    audio.autoplay = true;
    const peer: Peer = { sid, username, pc, audio, muted: this.allMuted, speaking: false };
    audio.muted = peer.muted;
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.onicecandidate = (e) => e.candidate && this.send(sid, { type: "ice", candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      const s = e.streams[0] ?? new MediaStream([e.track]);
      audio.srcObject = s;
      audio.play().catch(() => {});
      peer.level = this.meter(s);
    };
    pc.onconnectionstatechange = () => this.render();
    this.peers.set(sid, peer);
    return peer;
  }

  private async makeOffer(p: Peer) {
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    this.send(p.sid, { type: "offer", sdp: offer.sdp ?? "" });
  }

  private async onSignal(from: string, data: Signal) {
    if (!this.on || !data) return;
    const p = this.peers.get(from);
    if (!p) return; // serwer jeszcze nie przysłał listy - ta osoba ponowi
    try {
      if (data.type === "offer") {
        await p.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        this.send(from, { type: "answer", sdp: answer.sdp ?? "" });
      } else if (data.type === "answer") {
        await p.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      } else if (data.type === "ice") {
        await p.pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch (e) {
      console.warn("głos:", e);
    }
  }

  private send(to: string, data: Signal) {
    this.conn.send("rtc", { to, data });
  }

  private closePeer(p: Peer) {
    p.pc.close();
    p.audio.srcObject = null;
  }

  /** poziom głośności (do podświetlenia, kto mówi) */
  private meter(stream: MediaStream) {
    try {
      this.audioCtx ??= new AudioContext();
      const src = this.audioCtx.createMediaStreamSource(stream);
      const an = this.audioCtx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      return () => {
        an.getByteTimeDomainData(buf);
        let m = 0;
        for (const v of buf) m = Math.max(m, Math.abs(v - 128));
        return m;
      };
    } catch {
      return undefined;
    }
  }

  private tickLevels() {
    let changed = false;
    for (const p of this.peers.values()) {
      const speaking = !p.muted && (p.level?.() ?? 0) > 12;
      if (speaking !== p.speaking) {
        p.speaking = speaking;
        changed = true;
        this.onSpeaking?.(p.sid, speaking);
      }
      // głos cichnie z odległością (gry 3D)
      if (this.volumeFor) p.audio.volume = Math.max(0, Math.min(1, this.volumeFor(p.sid)));
    }
    if (changed) this.render();
  }

  private setAllMuted(m: boolean) {
    this.allMuted = m;
    for (const p of this.peers.values()) {
      p.muted = m;
      p.audio.muted = m;
    }
    this.render();
  }

  private setFriendsOnly(v: boolean) {
    this.friendsOnly = v;
    try {
      localStorage.setItem("predator.voiceFriendsOnly", v ? "1" : "0");
    } catch {
      /* brak */
    }
    if (this.on) this.conn.send("voicemode", v ? "friends" : "all");
    this.render();
  }

  private render() {
    this.button.classList.toggle("on", this.on);
    this.button.classList.toggle("muted", this.on && this.selfMuted);
    this.button.textContent = this.on ? (this.selfMuted ? "🔇" : "🎤") : "🎤";
    if (this.panel.classList.contains("hidden")) return;
    const rows = [...this.peers.values()].map((p) => {
      const st = p.pc.connectionState;
      return h(
        "div",
        { class: "voice-row" + (p.speaking ? " speaking" : "") },
        h("span", { class: "voice-dot " + (st === "connected" ? "ok" : "wait") }),
        h("b", null, p.username),
        h("span", { class: "spacer" }),
        h(
          "button",
          {
            class: "btn small",
            title: p.muted ? "Włącz dźwięk" : "Wycisz tę osobę",
            onClick: () => {
              p.muted = !p.muted;
              p.audio.muted = p.muted;
              this.render();
            },
          },
          p.muted ? "🔇" : "🔊",
        ),
      );
    });
    this.panel.replaceChildren(
      h("div", { class: "voice-head" }, h("b", null, "🎤 Czat głosowy"), h("button", { class: "icon-btn", onClick: () => this.togglePanel() }, "✕")),
      h(
        "p",
        { class: "voice-info" },
        this.friendsOnly ? "Rozmawiasz ze znajomymi, którzy też włączyli głos w tej grze." : "Rozmawiasz z graczami w pobliżu, którzy też włączyli głos. Im dalej, tym ciszej.",
      ),
      (() => {
        const box = h("input", { type: "checkbox", checked: this.friendsOnly });
        box.addEventListener("change", () => this.setFriendsOnly(box.checked));
        return h("label", { class: "check voice-check" }, box, h("span", null, "Tylko znajomi"));
      })(),
      this.on
        ? h(
            "div",
            { class: "voice-actions" },
            h("button", { class: "btn small", onClick: () => this.toggleSelfMute() }, this.selfMuted ? "🎙️ Włącz mikrofon" : "🔇 Wycisz mnie"),
            h("button", { class: "btn small", onClick: () => this.setAllMuted(!this.allMuted) }, this.allMuted ? "🔊 Słuchaj wszystkich" : "🔈 Wycisz wszystkich"),
            h("button", { class: "btn small danger", onClick: () => this.stop() }, "Wyłącz głos"),
          )
        : h("button", { class: "btn primary", onClick: () => this.start() }, "🎤 Włącz czat głosowy"),
      this.on
        ? rows.length
          ? h("div", { class: "voice-list" }, rows)
          : h("p", { class: "voice-info" }, this.friendsOnly ? "Nikt ze znajomych nie ma teraz włączonego głosu." : "Nikt w pobliżu nie ma teraz włączonego głosu.")
        : "",
    );
  }

  dispose() {
    if (this.on) this.stop();
    this.audioCtx?.close().catch(() => {});
    this.panel.remove();
    this.button.remove();
  }
}
