# Unfold — Screenshots + App Preview Checklist

## Goal
Capture assets that make the app legible to App Review and App Store visitors.

Use the current release candidate state:
- Latest valid uploaded iOS build in App Store Connect: **1.0.0 (146)**
- If current local backend/mobile authority hardening is included, capture assets from the next processed build produced from this source, not from an older uploaded build.
- backend: Railway production URL configured in the production EAS profile
- no QA/debug UI should be visible in production-profile captures

Prioritize the real habit loop:
1. onboarding
2. personalized setup
3. generating
4. today/reading
5. journal
6. Bible
7. companion

---

## Screenshot set recommendation
Aim for **5–8 strong screenshots** for the App Store listing.

### 1) Personalized onboarding / setup
**Why:** shows that the app is tailored, not generic.

Capture a clean screen from onboarding that shows:
- a thoughtful question
- elegant typography
- strong visual polish
- no awkward placeholder text
- no keyboard if possible

Best candidates:
- theme/discovery question
- current situation prompt
- spiritual seeking prompt

Avoid:
- sparse unfinished-looking states
- obvious debug/dev content
- multiline typing states with messy partial text

### 2) Premium/paywall screen
**Why:** makes pricing/subscription model clear and reduces reviewer confusion.

Capture a paywall screen that clearly shows:
- premium framing
- pricing/billing cadence
- visual polish
- Restore Purchases / legal area if visible and not cluttered
- current 3-day trial copy if the user is eligible and the UI displays it

Best candidate:
- strongest final `ThreeStepPaywall` screen

### 3) Generating screen
**Why:** explains the app’s personalized devotional generation flow.

Capture a screen that visibly communicates:
- devotional is being generated for the user
- calm premium/spiritual aesthetic
- not just a spinner on a blank screen

### 4) Today screen
**Why:** this is the home habit loop surface.

Capture Today with:
- current devotional visible
- streak/progress context if available
- polished card layout
- no coach overlays

### 5) Reading screen
**Why:** proves the core devotional experience.

Capture reading with:
- scripture + devotional content visible
- good hierarchy/spacing
- no transitional skeleton states
- if possible, a screen that feels emotionally strong and readable

### 6) Journal / notebook screen
**Why:** shows reflection/journaling as a real product pillar.

Best options:
- Journal list with meaningful content
- Notebook list with a saved note
- Note detail/read mode if especially polished

Avoid:
- empty states unless they look exceptionally polished
- editor with keyboard up unless it looks intentional and beautiful

### 7) Bible reader
**Why:** reinforces full scripture-reading functionality.

Capture:
- reader with passage content visible
- navigation/header visible enough to read as Bible context
- clean typography and spacing

Important current check:
- Bible DB download should be verified on the intended submission build because build 136 still used the custom API domain for this asset.

### 8) Companion
**Why:** shows the supportive conversational side of the app.

Capture:
- a tasteful, safe, spiritually reflective conversation state
- no strange half-loaded messages
- avoid anything that could look like therapy/medical claims

---

## Suggested final App Store screenshot order
If you want a simple ordering, use:
1. Onboarding/discovery prompt
2. Paywall/premium screen
3. Generating screen
4. Today screen
5. Reading screen
6. Journal/notebook screen
7. Bible screen
8. Companion screen

That order tells the product story clearly.

---

## Screenshot capture rules
For every screenshot:
- [ ] Use the intended App Store submission build (at least build 146; newer if current local hardening changes are included), not build 136/137-era captures
- [ ] No debug/dev controls visible
- [ ] No system alerts covering the UI
- [ ] No keyboard unless intentionally part of the story
- [ ] No partially typed messy text
- [ ] No loading skeletons / bundling / refresh states
- [ ] No coaching overlays
- [ ] No stale placeholder content that feels fake or broken
- [ ] Text is readable at thumbnail size
- [ ] Pricing is current on any paywall shot
- [ ] Overall color/contrast feels consistent with the brand

---

## App preview / screen recording recommendation
A short app preview is **recommended**, even if not strictly required.

### Best preview structure (20–30 seconds)
Use a simple narrative:

#### Segment 1 — onboarding (3–5s)
Show:
- one beautiful onboarding/discovery screen
- one moment of personalization

#### Segment 2 — paywall / premium (3–4s)
Show:
- premium step briefly
- enough to make the subscription model understandable

#### Segment 3 — generating (3–4s)
Show:
- devotional generation in progress

#### Segment 4 — reading (5–7s)
Show:
- reveal/today/reading surface
- devotional content on screen
- ideally a gentle scroll

#### Segment 5 — journal + Bible + companion (6–10s)
Quickly show:
- journal/notebook
- Bible reader
- companion

End on the most emotionally resonant screen, usually:
- reading
- or Today

---

## App preview recording rules
- [ ] Use the real app on a clean simulator/device state
- [ ] No dev launcher / Metro / bundling UI visible
- [ ] No accidental taps, notifications, or permission popups mid-recording
- [ ] Use short, deliberate interactions only
- [ ] Avoid long typing segments
- [ ] Avoid showing anything that implies therapy/crisis/medical support
- [ ] Keep transitions smooth and easy to follow
- [ ] Make the first 5 seconds immediately understandable

---

## Best surfaces for reviewer confusion reduction
If you only optimize a few captures, optimize these:
- paywall
- generating
- today/reading
- one journal screen

Those are the screens most likely to help Apple quickly understand what Unfold actually does.

---

## Internal practical capture plan
Recommended capture session order:
1. clear simulator/device state
2. install/launch the intended App Store submission build
3. capture onboarding shot
4. capture paywall shot
5. capture generating shot
6. capture Today shot
7. capture Reading shot
8. capture Journal shot
9. capture Bible shot, including successful Bible DB/content load
10. capture Companion shot
11. if making preview video, record in the same order

This minimizes reset thrash and keeps the story coherent.
