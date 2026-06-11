# Visual verification notes — PR 2 (EmberSystem unification)

Branch: `feat/ui-deslop-pr2-embersystem`. This worktree session had no
simulator access; every surface below needs a screenshot pass before merge.
Spec: `plans/07-ui-deslop-brief.md` §2.

Check each surface in **dark + light**, with **Reduce Motion off + on**
(Settings → Accessibility → Motion), and at least one non-gold accent
(Settings → Accent Colors → Ocean: every ember/glow must turn blue).

## 1. Day/series completion (reading.tsx → CompletionCelebration) — THE CANON

- **Dark, RM off: must be pixel-equivalent to build 218.** Field of 22 rising
  embers, sizes 3.5–7, bottom glow, 18 luminous motes drifting up from the
  title block. The params were copied verbatim, but this is the surface where
  any mistake matters most. Compare against the previous build side by side.
- Light, RM off: INTENTIONALLY changed — 13 larger embers with soft radial
  halos, opacity capped at 0.5. Should read as warm glowing sparks, not
  "olive-brown dirt specks". No per-view shadows.
- RM on (NEW designed state): sparse static ring of 12 embers around the
  title/subtitle block, glow one step brighter (0.28/400), single ~400ms
  fade-in. Previously RM showed nothing. Ring must not collide with the
  left-aligned title or the "Tap anywhere to continue" hint.
- Onboarding first-devotional celebration (OnboardingCelebration) is the same
  component — spot-check once.

## 2. Today home, post-completion (dark + light)

- Embers only after completing today (complete-today / tomorrow-locked /
  journey-complete states).
- The duplicate screen-level bottom gradient was DELETED; EmberSystem's
  internal glow is the only light source now. Check the bottom of the screen
  still has a visible hearth glow (tier-scaled by streak) and there is no
  "double glow" band.
- Opacity floor raised to 0.5 — home should no longer feel weaker than the
  celebration at low streaks.
- Exclusion zone `{x:0.04, y:0.18, w:0.92, h:0.38}` (normalized) dims embers
  over the hero card stack. **Zone was estimated, not measured** — verify
  embers fade behind the hero card text and the zone doesn't visibly "punch a
  hole" in the field (40px feather should make edges soft). Tune rect if the
  card stack sits lower/higher on small/large devices.
- Low Power Mode: now shows the static still (was: nothing). Confirm no
  animation runs.
- Leave/return to tab, background/foreground the app: field must stop/restart
  cleanly (gating is now inside EmberSystem).

## 3. Paywall route (paywall.tsx)

- Embers now fall natively from the top (scaleY:-1 wrapper removed); glow
  anchors at the TOP for the falling field — confirm this matches the old
  flipped look.
- Quieter by design: ~8 embers at 0.6 opacity scale (count 14 × intensity
  0.6) vs the old 16. If it reads as dead, the preset to revisit is
  `count={14} intensity={0.6}` in paywall.tsx.
- Hard exclusion over the lower half (`y:0.52–1.0`) keeps embers off the
  pricing cards, CTA, and renewal disclosure. **Estimated zone** — verify
  price/disclosure text never has an ember over it while scrolled to top.
- Note: the page scrolls; zones are fixed to the viewport, so embers stay out
  of the lower half regardless of scroll position. Confirm acceptable.

## 4. Welcome (src/app/index.tsx)

- Most-changed surface (old EmberParticles had shadow-dot sprites, 320px
  travel, loop snap). New: 20 embers, 60/40 up/down split, full-screen travel,
  no loop snap, no shadows.
- The extra `accent20/accent40` 350px bottom gradient was REMOVED. EmberSystem
  glow for count 20 is tier 0.22/340 — verify the bottom of the welcome screen
  still feels warm; if too dim vs build 218, this is the first place to add
  brightness back (raise count to 22 → same tier, or revisit).
- RM on: 6 static embers + glow (was: blank).

## 5. Onboarding (purchaseConfirmation + mirrorBack ×2)

- purchaseConfirmation ("Welcome to Unfold Premium"): redundant screen
  gradient removed (glow has one owner now). 11 embers (16 × 0.7), exclusion
  over the centered typewriter block `{0.06, 0.32, 0.88, 0.4}` — **estimated**;
  verify the text stays clean while it types and "Tap anywhere" stays legible.
- mirrorBack loading + content: embers now live inside the ~380px content
  container (component measures itself via onLayout). 7 embers, both
  directions. Verify: particles are visible (not spawning off-container),
  verse block (left gold border) has no embers over it (zone
  `{0, 0.3, 1, 0.4}` — estimated), and the field doesn't bleed outside the
  card area.
- The brief also asks for exclusion over the founder signature — that step has
  NO ember mount today, so nothing was added there. Confirm no regression.

## 6. ThreeStepPaywall (onboarding paywall)

- Count drops 18 → 14 per spec; still mounted once across all three pages
  (embers continue across page transitions — verify no restart on Continue).
- Exclusion zones (both **estimated**): benefit copy band `{0.08, 0.3, 0.84,
  0.34}` and stacked-card dots `{0.25, 0.66, 0.5, 0.06}` — the dots zone
  exists to kill the "ember reads as a third pagination dot" collision.
  Verify on the reviews page (where StackDots shows) that no ember lingers
  beside the dots; adjust the y-band if the carousel sits elsewhere.
- Lottie bell / CTA glow RM behavior unchanged (not part of this PR).

## 7. Series detail (You tab) — RM leak fix

- Locked-row bottom glow: RM off = same slow pulse as before; RM on = glow
  frozen at its midpoint (opacity ~0.29), no animation. This was the "embers
  keep drifting under RM" leak.

## 8. Unfolded year-in-review finale

- The closing card burst now uses the shared SparkleBurst: 32 four-point
  sparkle shapes (gold/cream/cream) radiating from ~40% height, no shadow
  glow, slight gravity arc. The old version was 40 round dots with heavy
  shadow. **This is a sanctioned visual change** (brief §2 item 4) — confirm
  it still lands emotionally; if the sparkle shape feels wrong for this
  surface, the palette/style props are in place to tune.
- RM on: no burst (unchanged).

## 9. Accent sweep (accent-token discipline)

- Switch accent to Ocean and re-check surfaces 1–6: every ember, halo, mote,
  and glow must follow the accent. There is no hardcoded gold anywhere in the
  new system (GlowBackground's `DEFAULT_GOLD` died with the file).
- unfolded.tsx keeps its fixed cinematic palette by design (it is on the
  Tier-1 leak-audit triage list owned by PR 1, not this PR).

## Known estimation risks (highest first)

1. All exclusion-zone rects are normalized estimates made without a
   simulator. The feather is 40px, so being ~5% off is soft, not jarring —
   but each zone needs eyes.
2. Welcome + purchaseConfirmation lost their strong screen gradients in favor
   of tier glow — largest plausible "feels dimmer" regression.
3. Paywall preset multiplies count by intensity (spec reads "scalar on
   count+opacity") → 8 embers. If the design intent was 14 visible embers,
   drop `intensity` to opacity-only by raising count.
4. mirrorBack container-relative field is new behavior (old sprites were
   container-relative too, but travel math differs) — check on a small device
   (SE) where the container may be shorter.
5. Celebration RM ring geometry (radii 0.36W/0.2H, wobble ±12%) was designed
   on paper — check it frames, not crowds, the hero text at large Dynamic
   Type sizes.
