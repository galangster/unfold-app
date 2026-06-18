# Rive accent contract — animator spec (all Today ambient `.riv` files)

**Audience:** the Rive animator re-exporting the Today ambient animations.
**Goal:** make the animation's artwork (leaves, branch-lines, particles, rays, dust)
follow the user's **selected accent color**, while the app keeps the background dark
(or paper in light mode) with a neutral text-protection mask.

This was written from empirical testing of the shipped files on-device, so it
reflects exactly how the app drives Rive today.

---

## TL;DR (what to change)

1. **Stop hard-coding the artwork color in the script.** Today the leaves/lines are
   painted from a baked color inside the script. The app **cannot** change a baked
   script color at runtime — we proved this (setting `accentR/G/B` as data, as numbers,
   and as state-machine inputs all do nothing).
2. **Expose ONE ViewModel color property named `accent_color`** on `ViewModel1` and
   **bind every element that should take the accent** (leaf fills, branch/line strokes,
   particles, rays, dust) to it.
3. Keep the background and the text-mask as **separate, bindable** ViewModel color
   properties so the app can keep the background transparent and the mask neutral.
4. Do the **same contract for every Today `.riv` file**, so one app code path themes
   them all.

If you only do step 2, the accent will already work — the rest is polish.

---

## Why baked color can't be themed (context)

A Rive **script** that draws a shape with a literal color (or with script-local
variables like `accentR/G/B` that are never bound to a ViewModel) produces a color
that is fixed at export time. The runtime has no handle to it. The only values the app
can change at runtime are **ViewModel properties** that are actually bound to what gets
drawn. So the accent color must flow through a **bound ViewModel color property**.

---

## The contract — `ViewModel1` properties

Every Today `.riv` must have a ViewModel named **`ViewModel1`** with these **color**
properties. The app sets them every frame; any property a file doesn't expose is just
skipped, so it's safe to omit the optional ones.

| Property (color)       | Bind it to…                                                   | App sets it to…                                              |
|------------------------|---------------------------------------------------------------|-------------------------------------------------------------|
| **`accent_color`** ⭐  | **Every accent element**: leaf fills, branch/stem/line strokes, particles, rays, dust. | The user's selected accent (opaque).                          |
| `background__color`    | The full-canvas background rectangle (if you have one).        | **Transparent** `#00000000` — the app's own dark/paper bg shows through. Never fill it. |
| `mask_gradient_start`  | The **start** stop of a soft gradient placed **behind the top hero text** (so artwork never clashes with copy). | A neutral surface tint that follows light/dark (NOT the accent), low alpha. |
| `mask_gradient_end`    | The **end** stop of that same text-mask gradient.             | Transparent `#00000000` (so the mask fades out).             |
| `glow_color` *(opt.)*  | An optional ambient glow layer.                               | Off (transparent) by default. Keep only if it reads well.    |
| `artwork_color` *(opt.)* | An optional diffuse haze layer.                             | Off (transparent) by default.                                |

### Optional finer control
If you want the leaves and the lines to take the accent at **different intensities**,
you may additionally expose `leaf_color` and `line_color` (both color). The app sets
all three (`accent_color`, `leaf_color`, `line_color`) to the same accent, so:
- bind everything to `accent_color` for the simple case, **or**
- bind leaves to `leaf_color` and lines to `line_color` for separate control.
Control relative brightness with **opacity inside the file**, not by changing the hue.

### Do NOT
- Do **not** bind leaves/lines to `background__color`, `mask_gradient_*`, `glow_color`,
  or `artwork_color`. Those are the "atmosphere" the app deliberately keeps neutral —
  binding the artwork to them is what produced the rejected full-screen color **wash**.
- Do **not** rely on `accentR` / `accentG` / `accentB` script variables. They are not a
  binding surface; the app does not (cannot) drive them. Use the `accent_color` color
  property instead.

---

## Light vs dark — the app handles it

You author **one** file. The app passes the correct accent and neutral surface for the
current theme, so:
- **Dark mode:** background transparent → near-black; mask = subtle dark veil; accent
  art pops on dark.
- **Light mode:** background transparent → cream/paper; mask = subtle light veil; the
  accent art must stay **legible on paper**. Author the accent art at a weight that
  survives on a light background (the current baked gold nearly disappears on cream —
  that's the bug we're fixing). Accent hues (ocean/forest/slate/etc.) have more contrast
  on paper than gold, but keep strokes/opacity strong enough to read.

The app does the light/dark mixing; you only ensure the artwork is bound to
`accent_color` and is visible at full-accent in both a dark and a light preview.

---

## Per-file status (what each currently exposes)

| File                        | ViewModel | Accent art bound? | Needs                                                            |
|-----------------------------|-----------|-------------------|-----------------------------------------------------------------|
| `today-wind-leaves.riv`     | `ViewModel1` (5 color props: `background__color`, `glow_color`, `artwork_color`, `mask_gradient_start/end`) | **No** — leaves/lines baked gold | Add `accent_color`; bind leaf fills + line strokes to it. |
| `today-wind-particles.riv`  | `ViewModel1` (`gradient/Gradient`, `centerMask*`) | **No** | Add `accent_color`; bind particles to it. Map the center-mask to `mask_gradient_*` if it sits behind text. |
| `today-rain-particles.riv`  | `ViewModel1` (`gradient/Gradient`, `centerMask*`) | **No** | Same as wind-particles. |
| `today-light-rays.riv`      | **none** (state machine only) | **No** | Add a `ViewModel1` with `accent_color`; bind the rays to it. |

Unify all four to the **same `ViewModel1` + `accent_color`** contract so the app themes
them identically.

---

## How to verify before handing back

1. In the Rive editor, set `ViewModel1.accent_color` to a vivid test color (e.g. pure
   magenta `#FF00FF`). The leaves/lines/particles/rays should turn magenta. The
   background should stay empty/transparent.
2. Set `background__color` to magenta → only the canvas background fills (not the art).
   Then set it back to transparent for delivery.
3. Re-export `.riv` (same artboard name, state machine `State Machine 1`, ViewModel
   `ViewModel1`). Hand back the `.riv`.

When the new files land, the app needs **zero changes** — it already drives this
contract. (`assets/rive/README.md` documents the app side.)
