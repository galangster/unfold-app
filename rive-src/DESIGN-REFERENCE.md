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
