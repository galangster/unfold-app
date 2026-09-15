# Unfold Today ambience: design reference

Written 2026-09-11 from deterministic filmstrips of the six shipped scenes
(`rive-src/reference/*.png`, 8 frames at 0.5/1/2/3/5/8/12/20 s, app theme
colors applied through `ViewModel1`). Every new scene is audited against this
before it ships. Regenerate strips with `rive-src/harness/` (see README).

## What the shipped scenes have in common

1. **One hero subject, upper half, right of center.** Campfire tendrils,
   waterfall, tree, doors, canopy rays: each is a single motif, about 25 to 45%
   of the canvas width, centered around x = 55 to 65%, living between y = 8%
   and y = 55%. Everything else is negative space. Never tile the canvas.
2. **A bottom glow in every scene.** The lower 40% is a soft vertical
   gradient from transparent to `glow_color`, feathered, no hard edge. It is
   the atmosphere the card text sits over. In light mode it reads as a warm
   tan wash. A scene without it looks like a different app.
3. **Hairline, stroke only.** Line weight is roughly 0.75 to 1.25 px on a
   390 pt canvas. No filled silhouettes. Forms are built from many thin lines:
   the waterfall is about a dozen parallel falling strokes, the tree is outlined
   leaves on hairline branches, the campfire is two or three sine tendrils.
4. **Depth through opacity tiers, not through weight.** Hero lines near full
   accent, a second layer at roughly 40 to 50%, a far layer at 15 to 25%.
   The tree has faint duplicate branches behind the bright ones. The canopy
   rays fade along their length.
5. **Glow is a halo, never neon.** A feathered copy of a stroke sits behind
   the crisp one at low intensity. The crisp line stays thin. If the line
   looks like a lit tube, the feather is too strong or the crisp stroke too
   thick.
6. **Motion is organic flow, along curves, with per-element phase.** Smoke
   rises on sine paths, water falls, leaves ride curved wind trails, rays
   sweep. Speeds are slow: on the order of 20 to 40 pt/s. Nothing translates
   in a straight line at constant speed, and no two elements share a phase.
7. **There is always a secondary particle layer.** Sparks above the fire,
   motes in the doorway, seeds around the tree, dashes in the wind. 15 to 40
   tiny marks (1 to 3 pt), each with its own spawn, drift, and fade lifecycle.
   This is most of what makes the scenes feel alive in a still frame.
8. **The loop is invisible.** Long cycles (20 s and up), elements re-enter
   where they left, fades hide any seam.
9. **Same art in both modes.** Light mode swaps only the colors. The line
   weight and opacity tiers that read on near-black must also read on paper,
   so do not rely on glow for legibility.

## Audit rubric (pass or fail, per scene, before it ships)

| # | Check | Evidence |
|---|---|---|
| 1 | Hero occupies upper 55%, right of center, <= 45% width | frame 0 and frame at 8 s |
| 2 | Bottom glow present, feathered, bound to `glow_color` | dark and light strips |
| 3 | Crisp strokes <= 1.25 px, no filled shapes | zoom of one frame |
| 4 | At least three opacity tiers visible | dark strip |
| 5 | Halo subtle: crisp line still reads as a line | zoom of one frame |
| 6 | Primary motion follows a curve or flow, not a linear slide | frames 1 s vs 3 s vs 8 s |
| 7 | Particle layer present with fade lifecycle | any three consecutive frames |
| 8 | Frames at 0.5 s and 20 s differ; no visible pop across the loop | strip |
| 9 | Light strip legible without the glow | light strip |
| 10 | Contract slots bound, magenta probe recolors only the art | `--data` probes |

## Where the first clouds draft failed (2026-09-10)

Failed 1, 2, 3, 4, 6, 7. Six identical filled cartoon silhouettes tiled over
the whole upper half, uniform 1.6 px stroke with a neon halo, straight
constant-speed horizontal drift, no particles, no bottom glow. It passed only
the mechanical checks (loop, slots, light mode). The lesson: verify against
the reference strips, not against the text contract.

## Owner feedback log

- 2026-09-11, Nick: "single lines at varying thicknesses look good", "make sure any new art feels right at home with the current art". Applied to clouds v3: closed silhouettes replaced by one open calligraphic line per cloud, weight varied by stacking trimmed heavier strokes on the same path.

- 2026-09-15, Nick: "this cloud scene should not be in the app, i never approved it." PR #95 had wired `clouds-rive` into the completion rotation; removed the same day. Rule: no in-house scene enters `TODAY_COMPLETION_AMBIENCE_OPTIONS` or `assets/rive/` before Nick approves its clips.

## Scene set for review (2026-09-11)

Built with `rive-src/lib/unfold_rml.py` and `rive-src/build-all.sh`. Not wired into the app until Nick QAs the videos.

| Scene | Idea | Reference it borrows from | Audit rounds |
|---|---|---|---|
| clouds | three tapered single-line clouds, wisps, motes | Nick's "single lines at varying thickness" | 5 |
| orbit | concentric hairline orbits with planets, faint bokeh | Endel Spatial Orbit | 3 |
| ripples | staggered expanding rings from a pulsing drop, still water lines | Endel Relax rings | 4 |
| breath | nine stacked wave lines swaying out of phase, hero line tapered | Endel Relax card | 2 |
| moon | tapered crescent with halo, twinkling stars, rare shooting star | shipped campfire glow | 2 |
| mountains | three ridge lines in opacity tiers, drifting mist, low sun | shipped tree tiers | 2 |
| constellation | nearest-neighbour star chain, breathing group, rare streak | Endel Focus grid dots | 2 |
| grass | eleven single-arc blades in one wind, drifting seeds | shipped wind-leaves | 5 |

Lessons logged during the rounds: a cycle's end keyframe must sit one frame before the next cycle's start or the runtime drops one and the element sticks; rare events use `burst`, not a short `lifecycle`; cubic handle angles on open paths are the usual cause of kinks, so prefer two-vertex arcs.

## Round two lesson (2026-09-11)

Nick on the first set: "none of these feel cohesive, like actual art pieces... they really weren't animated." The rubric measured composition, not life. What changed for moon and mountains v2, and what every future scene does:

- **Life comes from scripts, not keyframes.** A `ScriptedDrawable` (Luau `Node` protocol) spawns, moves, and kills elements every frame: bands that cross and die, stars that breathe, a flock that passes. Keyframed sway over a two-minute loop reads as still.
- **Detail is engraving.** Fine clipped hatching, cross-hatch, and slope strokes give a drawn hero the density of an illustration while staying hairline and stroke-only. `ClippingShape` clips a hatch field to a silhouette; feathered fills do not render, so glows are radial gradients with a transparent outer stop.
- **Judge motion on a one-second contact sheet of the clip** (`ffmpeg select+tile`), never on the 8-frame strip alone.
- Scripts read the accent through a `ScriptInputColor` bound to `accentColor`; light and dark still work with no app change.

## Designer SVG scenes (2026-09-15): moon-stars and mountain-river

Nick's designer delivered two backgrounds as Illustrator SVGs (`svg-moon-stars.svg`,
`svg-mountains.svg`). They are the composition; the job was conversion plus life.

- **Conversion is exact.** Every line in the files is an outlined stroke (a 1 px filled
  sliver), the moon hatching is hollow stripe rings, the river is four clip-path shapes.
  `lib/svg_rml.py` parses the SVG (paths, polygons, rotated rects, circles, gradients with
  `gradientTransform`, clip-paths) and emits the same geometry as filled `PointsPath`
  shapes with cubic handles, plus fades as local-space `LinearGradient`s. Map with scale
  390/768, top anchored. `fill_shape(weight=0.3)` emboldens hero slivers with a same-paint
  stroke so they sit nearer the shipped 0.75 to 1.25 px weight. Source SVG lives beside
  `gen.py` as `art.svg`.
- **Keyframes only, no Luau.** `rive whoami` is signed out and unsigned scripts are rejected
  by production runtimes, so scripted life (the moon/mountains v2 candidates) cannot ship.
  `lib/life_rml.py` gives keyframed life instead: irregular per-star `shimmer`, `glint`
  (a bright TrimPath window travelling a line, one keyed `TrimPath.offset` in a
  `GroupEffect` driving the crisp stroke and its feathered halo), `streak` (shooting
  star), `flock` (two-arc birds with wing beats in bouts). Rare events use `envelope` +
  `travel` on cycle lengths that divide 7200.
- **Loop seams are measured, not assumed.** Two seam bugs surfaced: `sway()` ended a
  phased wave at `v0` instead of its frame-0 value, and a 4800-frame period (which does
  not divide 7200) popped the moon. Both helpers now assert `DUR % period == 0`. The check
  is PSNR between frames 7200 and 7201 versus frames 600 and 601 (both about 65 dB), plus
  a script that compares every keyed property's frame-0 and frame-7200 values (zero
  mismatches).
- **Authored attributes equal frame 0.** `Scene.register` writes every keyed property's
  frame-0 value into the element's own attributes (`rest_pose`), so the un-advanced artboard
  (the runtime's first paint, and `--advance=0`) is frame 0 of the loop and nothing flashes.
- **Verified in the app runtime.** `src/app/qa-rive-ambience.tsx` (dev-only, allowlisted
  with a `scene` param) renders any bundled scene through `TodayCompletionRive`. Both
  scenes played on the iPhone simulator on 2026-09-15 with TrimPath, Feather,
  GroupEffect + TargetEffect, RadialGradient and data binding all working on
  `@rive-app/react-native` 0.4.6.
- **Where the art departs from the rubric by design:** the massif spans about 70 percent
  of the width and the lower constellation sits under the text mask. Both come from the
  designer's composition and read as intended: the lower art fades into the glow the way
  the tree's roots do.
