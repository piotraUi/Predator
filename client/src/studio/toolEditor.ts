// Okno tworzenia / edycji narzędzia albo broni w Studio.
import { TOOL_MODELS, TOOL_TEMPLATES, TOOL_TYPE_LABELS } from "../../../shared/tools.ts";
import type { ToolDef, ToolModel, ToolType } from "../../../shared/types.ts";
import { newId } from "../../../shared/world.ts";
import { h, modal } from "../ui/dom.ts";

export function openToolEditor(existing: ToolDef | null, onSave: (t: ToolDef) => void) {
  const t: ToolDef = existing ? { ...existing } : { ...TOOL_TEMPLATES[0], id: newId() };

  const name = h("input", { maxLength: 30 });
  const type = h(
    "select",
    null,
    (Object.entries(TOOL_TYPE_LABELS) as [ToolType, string][]).map(([v, l]) => h("option", { value: v }, l)),
  );
  const model = h(
    "select",
    null,
    (Object.entries(TOOL_MODELS) as [ToolModel, { label: string; icon: string }][]).map(([v, m]) =>
      h("option", { value: v }, `${m.icon} ${m.label}`),
    ),
  );
  const color = h("input", { type: "color" });
  const numInput = (min: number, max: number, step: number) =>
    h("input", { type: "number", min: String(min), max: String(max), step: String(step) });
  const damage = numInput(0, 100, 1);
  const range = numInput(1, 500, 1);
  const cooldown = numInput(0.1, 30, 0.1);
  const heal = numInput(0, 100, 1);
  const boost = numInput(0, 30, 1);
  const starter = h("input", { type: "checkbox" });

  const rows = {
    damage: h("label", null, "Obrażenia (0–100, gracz ma 100 zdrowia)", damage),
    range: h("label", null, "Zasięg (miecz ok. 7, pistolet ok. 120)", range),
    heal: h("label", null, "Ile zdrowia leczy", heal),
    boost: h("label", null, "Ile sekund trwa przyspieszenie", boost),
  };

  const fill = (d: ToolDef) => {
    name.value = d.name;
    type.value = d.type;
    model.value = d.model;
    color.value = d.color;
    damage.value = String(d.damage);
    range.value = String(d.range);
    cooldown.value = String(d.cooldown);
    heal.value = String(d.heal);
    boost.value = String(d.boost);
    starter.checked = d.starter;
    updateRows();
  };
  const updateRows = () => {
    const ty = type.value as ToolType;
    rows.damage.style.display = ty === "melee" || ty === "ranged" ? "" : "none";
    rows.range.style.display = ty === "melee" || ty === "ranged" ? "" : "none";
    rows.heal.style.display = ty === "heal" ? "" : "none";
    rows.boost.style.display = ty === "boost" ? "" : "none";
  };
  type.addEventListener("change", updateRows);

  const templates = existing
    ? null
    : h(
        "div",
        null,
        h("div", { class: "muted", style: "font-size:13px;margin-bottom:6px" }, "Zacznij od gotowego:"),
        h(
          "div",
          { class: "templates" },
          TOOL_TEMPLATES.map((tpl) =>
            h(
              "button",
              {
                class: "btn small",
                type: "button",
                onClick: () => fill({ ...tpl, id: t.id, starter: starter.checked }),
              },
              `${TOOL_MODELS[tpl.model].icon} ${tpl.name}`,
            ),
          ),
        ),
      );

  const num = (el: HTMLInputElement, def: number) => (Number.isFinite(Number(el.value)) && el.value !== "" ? Number(el.value) : def);
  const close = modal(
    existing ? "Edytuj narzędzie" : "Nowe narzędzie",
    h(
      "div",
      { class: "form" },
      templates,
      h("label", null, "Nazwa (skrypty używają jej w giveTool)", name),
      h("label", null, "Rodzaj", type),
      h("label", null, "Wygląd", model),
      h("label", null, "Kolor", color),
      rows.damage,
      rows.range,
      h("label", null, "Czas odnowienia w sekundach", cooldown),
      rows.heal,
      rows.boost,
      h("label", { class: "check" }, starter, h("span", null, "Gracze mają je od startu (w ekwipunku)")),
      h(
        "p",
        { class: "muted", style: "font-size:13px;margin:0" },
        "Żeby narzędzie można było podnieść, dodaj w świecie „Narzędzie do podniesienia” (przycisk Dodaj).",
      ),
    ),
    [
      { label: "Anuluj", onClick: () => close() },
      {
        label: "Zapisz",
        kind: "primary",
        onClick: () => {
          onSave({
            id: t.id,
            name: name.value.trim().slice(0, 30) || "Narzędzie",
            type: type.value as ToolType,
            model: model.value as ToolModel,
            color: color.value,
            damage: Math.min(100, Math.max(0, num(damage, 10))),
            range: Math.min(500, Math.max(1, num(range, 8))),
            cooldown: Math.min(30, Math.max(0.1, num(cooldown, 1))),
            heal: Math.min(100, Math.max(0, num(heal, 0))),
            boost: Math.min(30, Math.max(0, num(boost, 0))),
            starter: starter.checked,
          });
          close();
        },
      },
    ],
  );
  fill(t);
}
