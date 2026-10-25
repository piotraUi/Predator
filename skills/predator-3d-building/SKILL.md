---
name: predator-3d-building
description: How to build beautiful, correct 3D structures in Predator from parts (boxes, spheres, cylinders, wedges): coordinates, scale, walls with door/window openings, roofs, vehicles, trees, furniture, streets and whole villages/cities, using the verified example library (list_examples / get_example) and create_parts with origin. Use for any request to build or decorate something in a 3D Predator game.
---

# Building well in Predator 3D

Everything is made of **parts**: `shape` box | sphere | cylinder | wedge, with center position `x,y,z`, size `sx,sy,sz`, rotation `rx,ry,rz` (degrees), `color #rrggbb`, `material` plastic | neon | glass | metal, `transparency` 0-1, `texture` (brick, planks, stone, cobble, grass, sand, dirt, checker, tiles, metal, concrete, hazard), `emitter` (fire, smoke, sparks, magic, dust, splash), `kind` (normal, spawn, kill, bounce, water, seat, npc, pickup), `collide`, `spin`, `label`, `vehicle` (car | boat | skate on seats). All parts are anchored (they never fall).

## Scale & physics (memorize)

- **Y is up.** Floor `Podłoże` is 512×1×512 with its **top at y = 0**.
- A part's `x,y,z` is its **center**. A block standing on the ground has `y = sy / 2`. Stacking: `next.y = prev.y + prev.sy/2 + next.sy/2`.
- Player: 5.2 tall, 2 wide, walks 16/s, jumps ~6 up and ~8 across. Door ≈ 4.5 × 7.5, window ≈ 3.4 × 3.6 starting 3.4 above the floor, storey height 10, wall thickness 1, floor 0.6, stairs rise ≤ 1.2 per step (step depth 2).
- Nothing floats, nothing sinks under the floor, touching parts must not overlap by accident (z-fighting flickers). Overlap deliberately only to hide seams (e.g. roof overlaps walls by 0.2).

## The workflow

1. `get_overview` → note the camera focus point; build there unless asked otherwise.
2. `list_examples` (once), then `get_example` for the 1-3 closest ids. **Read them like a teacher's solution**: proportions, wall pieces around openings, glass panes, roof construction, trim, color palette, details.
3. Design your OWN version (different size, shape, palette, details) at the same quality.
4. Build in **local coordinates** (center x=0,z=0, ground y=0, **front/door facing -Z**) and let `create_parts.origin = {x, z, yaw, y}` place it: positions are moved, rotated and lifted for you. To make a building face point P from (x,z): `yaw = atan2(Px - x, Pz - z)` in degrees **+ 180**.
5. Give parts shared clear names (`Ściana`, `Dach`, `Szyba`, `Drzwi`) and group a whole object with `model_name` so it moves/copies together.
6. Verify with `find_parts` (near the build) + `show_to_user`; fix floating/overlapping/missing pieces.

Catalog of verified examples: [examples-catalog.md](examples-catalog.md).

## Techniques from the verified examples

**Walls with openings (never a solid wall with a hole painted on).** Build the wall from several boxes around each opening. House front (z = +5.5), floor top at 0.6, wall height 10, door 3.6 wide in the center, two windows 3.4 wide at x=±3.5:
```
Ściana  x=-6.6  y=5.6 sz=1 sx=8.8 sy=10      (left of the windows)
Ściana  x=-3.5  y=2.3 sx=3.4 sy=3.4          (under window)
Ściana  x=-3.5  y=9.1 sx=3.4 sy=3.0          (above window)
Ściana  x= 0    y=5.6 sx=3.6 sy=10           (door column - door itself is a gap)
Szyba   x=-3.5  y=5.8 sx=3.4 sy=3.6 sz=0.25  material glass, #9fd6f5
```
**Gable roof** = two long thin boxes tilted `rx = -35.9` and `rx = -144.1` meeting at the ridge, plus **wedge gables** (`shape wedge`) closing the triangle at each end, plus a chimney (`tex brick`), porch slab, posts, small canopy.
**Trees** = cylinder trunk + 3 stacked cylinders/spheres of leaves, tapering (pine: radii 7.1, 5.3, 3.4). Vary color and size between instances.
**Cars** = body box (metal) + cabin box + glass + 4 cylinders `rz=90` for wheels with smaller rim cylinders, headlights `mat=neon`; seat part `kind=seat, vehicle=car` so players can drive.
**Round things**: cylinder / sphere. **Slopes and ramps**: wedge. **Neon** only for lights, signs, magic; it glows.
**Palette**: 1 wall color + 1 roof color + 1 accent + neutral trim. Brick/stone/planks textures tinted by `color` add richness cheaply.
**Detail beats size**: add trim strips, lamps, steps, fences, windows frames, flower beds. 20 well-chosen small parts make a house feel built.

## Large scenes

- **Street**: straight road with sidewalks; buildings on both sides **facing the road** (use `yaw` 90 / 270), 3-6 units between buildings, different building kinds, trees/lamps in gaps. Build each unique building once, then repeat with different `origin` (and slightly different colors/sizes).
- **Village/city blocks**: grid of streets; spacing = road width + 2 × deepest building + 10. Mix heights (skyscrapers downtown, houses outside), add a park/plaza.
- **Terrain/lake**: use `kind: water` parts for ponds, big flattened cylinders/boxes for hills, or the Studio terrain tool.
- **Interiors**: hollow rooms (floor, 4 walls with a door gap, ceiling), furniture from examples (`sofa`, `bed`, `bench`), lights with neon parts.
- **Performance**: thousands of parts are fine (instanced rendering), but avoid hundreds of transparent/glass parts in one spot. Keep one-off tiny details count reasonable (< 60 per building).

## Gameplay parts

- `kind: spawn` = where players appear (at least one, on solid ground). `kill` = lava/spikes (red/orange neon). `bounce` = trampoline. `water` = swimmable volume. `seat` = chair/bench/vehicle seat. `npc` + `character` = a character standing there. `pickup` + `tool` = tool lying to grab.
- Trigger zones: transparent (`transparency 1`, `collide false`) parts named for `onTouch("Nazwa", ...)`; make them bigger than they look.
- Moving things: `tweenPart` / `tweenMove` from scripts (lifts, doors, platforms); spinning decoration: `spin: true`.
- Labels: `label: "Kup: 50 💰"` floats text above a part (tycoon buttons, signs).

## Quality checklist (run it before saying "done")

- [ ] Everything sits on y=0 or on something; no part below the floor.
- [ ] Walls have real openings, windows have glass, doors have a gap or a part named `Drzwi`.
- [ ] Roofs close properly (gables), no gaps between roof and walls.
- [ ] Consistent palette, a few textures/materials, small details present.
- [ ] Names set, `model_name` set, no test leftovers.
- [ ] A player can actually walk in/around it (door ≥ 4.5 wide × 7.5 tall, stairs ≤ 1.2 per step).
