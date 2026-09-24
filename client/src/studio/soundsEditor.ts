// Ustawienia gry 3D: dźwięki (dla skryptów playSound / setMusic), muzyka i światło.
import type { WorldData, WorldLight, WorldSound } from "../../../shared/types.ts";
import { DEFAULT_LIGHT } from "../../../shared/types.ts";
import { MAX_SOUND_CHARS, MAX_SOUNDS, newId } from "../../../shared/world.ts";
import { assetUrl } from "../game/audio3d.ts";
import { pickDataUrl } from "../files.ts";
import { h, toast } from "../ui/dom.ts";

export function soundsLightEditor(data: WorldData) {
  const sounds: WorldSound[] = structuredClone(data.sounds ?? []);
  let music = data.music ?? "";
  const light: WorldLight = { ...DEFAULT_LIGHT, ...(data.light ?? {}) };
  const list = h("div", { class: "snd-list" });
  const musicSel = h("select");
  let preview: HTMLAudioElement | null = null;

  const render = () => {
    musicSel.replaceChildren(
      h("option", { value: "" }, "— bez muzyki —"),
      ...sounds.map((s) => h("option", { value: s.name, selected: s.name === music }, "🎵 " + s.name)),
    );
    list.replaceChildren(
      ...(sounds.length
        ? sounds.map((s, i) => {
            const name = h("input", { value: s.name, maxLength: 40 });
            name.addEventListener("change", () => {
              const v = name.value.trim() || s.name;
              if (music === s.name) music = v;
              s.name = v;
              render();
            });
            return h(
              "div",
              { class: "snd-row" },
              h(
                "button",
                {
                  class: "btn small",
                  title: "Posłuchaj",
                  onClick: () => {
                    preview?.pause();
                    preview = new Audio(assetUrl(s.url));
                    preview.volume = s.volume;
                    preview.play().catch(() => toast("Nie da się odtworzyć tego dźwięku", "error"));
                  },
                },
                "▶",
              ),
              name,
              h("button", { class: "btn small danger", title: "Usuń", onClick: () => (sounds.splice(i, 1), render()) }, "✕"),
            );
          })
        : [h("p", { class: "muted", style: "font-size:12px;margin:0" }, "Brak dźwięków. Dodaj plik mp3, ogg albo wav (do ok. 3 MB).")]),
      h(
        "button",
        {
          class: "btn small",
          onClick: async () => {
            if (sounds.length >= MAX_SOUNDS) return toast(`Maksymalnie ${MAX_SOUNDS} dźwięków`, "error");
            const f = await pickDataUrl([".mp3", ".ogg", ".wav", ".m4a"]);
            if (!f) return;
            if (f.dataUrl.length > MAX_SOUND_CHARS) return toast("Plik jest za duży (maks. ok. 3 MB)", "error");
            const mime = f.name.toLowerCase().endsWith(".ogg") ? "audio/ogg" : f.name.toLowerCase().endsWith(".wav") ? "audio/wav" : "audio/mpeg";
            const url = f.dataUrl.replace(/^data:[^;]*;/, `data:${mime};`);
            let base = f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 30) || "dźwięk";
            while (sounds.some((s) => s.name === base)) base += "2";
            sounds.push({ id: newId(), name: base, url, volume: 0.8 });
            render();
          },
        },
        "+ Dodaj dźwięk",
      ),
    );
  };
  render();
  musicSel.addEventListener("change", () => (music = musicSel.value));

  const bright = h("input", { type: "range", min: "0.02", max: "1.5", step: "0.02", value: String(light.brightness) });
  const fog = h("input", { type: "number", min: "0", max: "2000", step: "5", value: String(light.fog) });
  const torch = h("input", { type: "checkbox", checked: light.flashlight });

  return {
    el: h(
      "div",
      null,
      h("div", { class: "prop-group" }, "Dźwięki i muzyka"),
      h("p", { class: "muted", style: "font-size:12px;margin:0 0 6px" }, 'W skryptach: playSound(player, "nazwa"), setMusic("nazwa")'),
      list,
      h("label", null, "Muzyka w tle", musicSel),
      h("div", { class: "prop-group" }, "Światło"),
      h("label", null, "Jasność (1 = zwykła, mało = ciemno jak w horrorze)", bright),
      h("label", null, "Mgła - odległość (0 = bez mgły)", fog),
      h("label", { class: "check" }, torch, h("span", null, "🔦 Gracz ma latarkę")),
    ),
    read(): Pick<WorldData, "sounds" | "music" | "light"> {
      const l: WorldLight = {
        brightness: Math.min(1.5, Math.max(0.02, Number(bright.value) || 1)),
        fog: Math.min(2000, Math.max(0, Number(fog.value) || 0)),
        flashlight: torch.checked,
      };
      preview?.pause();
      return {
        sounds: sounds.length ? sounds : undefined,
        music: music && sounds.some((s) => s.name === music) ? music : undefined,
        light: l.brightness !== 1 || l.fog || l.flashlight ? l : undefined,
      };
    },
  };
}
