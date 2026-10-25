---
name: predator-gui-design
description: Designing on-screen GUIs for Predator games (menus, HUD, shops, dialogs, end screens) with the save_gui tool and Lua: percent-based layout for phones and PCs, element types, actions, scripting GUIs, polished visual styles and ready layouts. Use when making or fixing any menu, HUD, counter, shop window or button in a Predator game.
---

# GUI design for Predator

A GUI is a named screen layer with **elements** (`frame`, `text`, `button`, `image`). Positions and sizes are **percent of the screen** (0-100) so the same GUI works on phones and PCs. Max 40 GUIs per game, 60 elements each. Elements draw in order (first = bottom).

## Element fields (save_gui)

`name` (unique inside the GUI; scripts use it), `type`, `x y w h` (%, top-left origin), `text`, `color` (text), `bg`, `bgOpacity` 0-1, `radius` (px at 1280×720), `fontSize` (px at 1280×720, default 24), `bold`, `align` left|center|right, `border` color, `image_attachment`, `action {type, target}`.
GUI-level: `open` (visible from start), `modal` (dims and pauses game underneath - menus/shops), `where` (only on this 2D level / 3D place).

**Button actions without scripts**: `close` (closes this GUI), `open` (target = other GUI name), `level` (2D: go to level), `place` (3D: teleport to place), plus any button always triggers `onGuiClick(player, gui, button)` in scripts.

## Script control

```lua
showGui(player, "HUD")
hideGui(player, "Menu")
toggleGui(player, "Sklep")            -- player = nil → everyone
setGuiText(player, "HUD", "Monety", "🪙 12")
local otwarte = isGuiOpen(player, "Menu")
onGuiClick(function(player, gui, button)
  if gui == "Menu" and button == "Graj" then hideGui(player, "Menu") end
end)
```
You cannot move/resize elements from Lua; to "move" something, swap between GUIs or toggle elements' text/visibility via separate GUIs.

## Layout rules (make it look professional)

- **Buttons ≥ 6% tall** and ≥ 14% wide; text inside readable: fontSize 26-40 for buttons, 20-24 for body, 48-72 titles.
- **Safe margins**: keep 2-3% from the screen edges; HUD counters in corners (top-left coins, top-right timer), menus centered.
- **Contrast**: dark panel `#1b1d2a` at `bgOpacity 0.92` with light text `#ffffff`; accent color for primary action (green `#2ecc71` for Play, red `#e74c3c` for danger, blue `#3a86ff` neutral).
- **Rounded corners** `radius 12-24` and a thin `border` in a lighter shade give the "app" look.
- **One primary action per screen**; secondary buttons smaller/grey.
- **Hierarchy**: title (big, bold) → subtitle (muted `#b8b8d0`) → content → buttons at the bottom.
- Text must fit: short labels, emojis as icons (🪙 ⭐ ❤ ⏱ 🛒 ▶ ✖). Long text → smaller font and bigger frame.
- Mobile: don't put important buttons within the bottom-left (joystick) or bottom-right (jump button) corners.
- Order matters: put background frame first, then decorations, then text, then buttons.

## Ready layouts

**HUD (always on)** - GUI `HUD`, `open: true`: coin chip top-left `frame x2 y2 w16 h7 bg #000 op .55 radius 20` + `text Monety x2 y2 w16 h7 "🪙 0"`; timer chip top-center; optional objective text under it.

**Title menu** - GUI `Menu`, `open: true`, `modal: true`: full-screen dim frame (`x0 y0 w100 h100 bg #0b0c14 op .85`), title text `x10 y12 w80 h16 fontSize 72 bold`, buttons `Graj` (x32 y45 w36 h12 green), `Sklep`, `Wyjdź` (action none → script `exitGame`). Script: `onGuiClick` → `hideGui(player,"Menu")`.

**Shop window** - modal panel `x20 y12 w60 h76` with item rows (name left, price right, `Kup` button each), a close `✖` button top-right. Handle purchases in `onGuiClick`, check coins in your own saved variable or use `promptPurchase` for Predator-coin products.

**Game over / win screen** - modal panel with result text (setGuiText to show score), buttons `Jeszcze raz` and `Menu`.

**Dialog / quest text** - bottom panel `x10 y70 w80 h24` with NPC name (small) + message (24px) + `Dalej` button.

**Progress bar** - back frame `x30 y3 w40 h3 bg #333` and a front frame whose width you change by *swapping GUIs* (e.g. `Pasek_0`..`Pasek_10`) or by using text blocks "████░░░░░░" via `setGuiText` (works great and is free).

## Checklist

- [ ] Every button has a unique `name`; script compares exact names.
- [ ] Menus `modal: true`; HUD not modal.
- [ ] Initial state right: menu `open: true`, others `open: false`.
- [ ] Layout checked at 16:9 *and* narrow (phone) - nothing at the very edge, text not clipped.
- [ ] Polish copy, consistent style (colors/radius/font sizes) across GUIs.
- [ ] `run_test` with `gui_click` actions to confirm flow.
