# 07 — UI De-Slop Brief: De-AI-ifying Unfold

**Date:** 2026-06-11 · **Branch context:** `audit/e2e-build218-2026-06` · **Inputs:** Mobbin typography research, Mobbin ambient-effects research, code ember audit, design-critique distillation (77 findings) + impeccable-design SOP + vault motion rules.

**Thesis.** Unfold's identity (Gupter display serif + warm ground + gold accent + ember atmosphere) sits squarely inside the 2026 "AI premium spiritual" tell-cluster. It survives as *typography-led* rather than *typography-themed* only through execution depth: one casing system, one ember vocabulary, zero platform-chrome leaks, zero typesetting defects. This brief converts four research streams into a single executable plan. Work top to bottom inside each section; Sections 1–3 are independent and can be parallelized.

---

## 1. Eyebrow / section-header replacement

### The problem, precisely

The current eyebrow is `Typography.label` — Inter_500Medium, 11pt, `letterSpacing: 1.5`, `textTransform: 'uppercase'`, usually `colors.accent` gold, often paired with a short gold rule (`src/constants/typography.ts:69-75`; canonical render `src/components/home/TodayCardStack.tsx:95-101, 443-457`). It stacks **three emphasis devices** (caps + tracking + color) on the least important text on screen, and the gold caps are the *only* caps voice in the app — an orphaned dialect. This exact combo (gold tracked caps + serif display) is the 5 Minute Journal / Canva-gratitude-template recipe, the highest-frequency "premium spiritual" default. ~71 `textTransform: 'uppercase'` call sites exist across `src/app` and `src/components` (grep `textTransform: 'uppercase'`).

Mobbin corpus rules that govern every direction below:

- Spend at most **one** emphasis device on a label (case OR color OR tracking — never all three).
- Caps are legitimate only as a *complete system* (Open, Co-Star: nav+links+labels, monochrome) or as *pure data* (stoic. timestamps, Noom table-headers). Unfold has neither; we choose the data path where caps survive at all.
- Whitespace (32pt+) beats any rule/eyebrow/ornament as a section separator in this category (Calm, Headspace).
- One serif moment per screen reads premium; serif everywhere reads templated.

**Constraint from the codebase:** Gupter ships regular-only and `displayItalic` deliberately aliases the roman — Nick rejects serif italics (`src/constants/fonts.ts:7-10`). The How We Feel serif-italic lead-in direction is therefore **excluded**, not ranked.

### Direction A (CHOSEN — Nick, 2026-06-11): Sentence-case conversational headers, eyebrow deleted — Headspace/Calm model

Delete the eyebrow layer from section headers entirely. Hierarchy = size + weight + whitespace.

**Spec — add to `src/constants/typography.ts`:**

```ts
// Section header — sentence case, replaces label+rule eyebrows above content groups
sectionHeader: {
  fontFamily: FontFamily.uiSemiBold,  // Inter_600SemiBold
  fontSize: FontSize.xl,              // 20
  lineHeight: Math.round(FontSize.xl * LineHeight.tight), // 24
  letterSpacing: 0,
},
// Card metadata — category/type info demoted BELOW card titles, Calm-style
cardMeta: {
  fontFamily: FontFamily.ui,          // Inter_400Regular
  fontSize: FontSize.xs,              // 12
  lineHeight: Math.round(FontSize.xs * LineHeight.normal), // 18
  letterSpacing: 0,
},
```

- Color: `colors.text` at full contrast (NOT accent, NOT muted). Optional right-aligned "See all" at 14pt `FontFamily.ui`, `colors.textMuted` (≈55–65% effective opacity).
- Spacing: 32pt minimum above each header (36pt on Today), 10–12pt below. Remove section rules; whitespace is the separator.
- **Copy rewrite required** (this is half the effect): headers become phrases with a verb or possessive — "UP NEXT" → "Up next" or better "Continue your series"; "DAILY RHYTHM" → "Your daily rhythm"; "COMPANION NOTE" → "A note from your companion". Sentence case, never Title Case.
- Category/type info moves **below** card titles as `cardMeta` in `colors.textMuted`: "Devotional · 6 min". This replaces the in-card eyebrow's informational job.
- The short gold rule may survive **alone** (24×2pt, `colors.accent`, 8pt below it, no text attached) as a quiet brand mark above the page-level header only — one per screen, max. If in doubt, cut it.

**Why ranked #1:** safest and strongest in the corpus (Headspace, Calm, Bloom, Mindvalley all converge here); turns labels into a human voice; zero new vocabulary to maintain; directly removes the tell the SOP bans ("repeated tiny uppercase eyebrows"). Risk: it deletes what the critique called the visual signature — mitigated by Direction A's copy voice + the retained serif display + gold discipline (Section 4).

### Direction B: Caps demoted to data, lowercase serif display promoted — stoic./Noom model

Tracked caps survive but may only carry **literal data** (dates, times, counts, references), never category names, never gold.

**Spec:**

- Data caps: `FontFamily.uiMedium`, 11pt, `letterSpacing: 1.0` (≈9% — reduce from 1.5), `colors.textMuted` (never accent). Content examples: "TUESDAY, JUNE 10", "DAY 4 OF 7", "PSALM 46:10". This *absorbs* the existing scripture-reference eyebrows (reading.tsx, journal-detail.tsx) rather than deleting them — the reference IS data, so it earns its smallness.
- Page-level display voice: Gupter (`FontFamily.display`) lowercase with terminal period — "this evening." / "today." — 30–34pt (`FontSize['3xl']`/custom), `colors.text`, lineHeight tight. Page-level only; one per screen.
- In-feed section headers below page level: use Direction A's `sectionHeader` spec.
- Keep the gold rule only at page level, detached from any caps.

**Why ranked #2:** the lowercase-plus-period voice is genuinely ownable (no template ships with it) and it gives the ~20 scripture-reference eyebrow sites a principled survival path, reducing migration churn in the readers. Risk: a new voice decision Nick must actively want; if applied timidly it creates a fourth casing dialect (the exact T6 drift the critique flags).

### Direction C: Functional sentence-case category label — Waking Up model (minimal-churn drop-in)

Keep the eyebrow slot and rule geometry; change only the type and the color's *meaning*.

**Spec:**

- `FontFamily.uiMedium`, 13pt (`FontSize.sm` − 1), `letterSpacing: 0`, **sentence case** ("Up next", "Daily rhythm"), 4–6pt above the card/display title.
- Color is a fixed **category taxonomy**, not decoration: Devotional = `colors.accent` (gold keeps exactly one slot), Scripture = a desaturated sage, Companion = a muted plum, Journal = muted blue-gray — defined once in `src/constants/colors.ts` and reused identically everywhere (this is the one sanctioned exception to single-accent discipline; cap it at 4 categories).
- Delete the tracked caps and the per-eyebrow gold rule; keep at most one rule per screen as in A.
- Add the Headspace editorial move: major sections may carry a one-line 14pt `colors.textMuted` description beneath the header.

**Why ranked #3:** smallest diff (same component slots, ~71 style-object edits), keeps a labeled-slot mental model. Risk: introduces multi-color labels into a strictly single-accent app — only safe if the mapping is enforced as law; otherwise it recreates the Notebook candy-swatch problem.

### Migration mechanics (all directions)

1. Make `Typography.label` the *only* path to tracked caps; then change/retire it. First sweep the ~50 inline `textTransform: 'uppercase'` style objects (grep list in audit) into the token so the change is one-line-per-site.
2. Canonical components to convert first (they define the pattern): `src/components/home/TodayCardStack.tsx:95-101,443-457`, `src/components/home/RecommendedSeriesCard.tsx:130,154,199,284`, `src/components/home/DevotionalCard.tsx`, `src/components/home/SeriesCarousel.tsx`, `src/components/home/ContextSlot.tsx`, then app screens (`reading.tsx:2135,2190`, `journal-detail.tsx:48,166,267,325`, `(you)/index.tsx:465,678`, `onboarding.tsx:1780,1987,1990,2671,2709,2765,2805`, `paywall.tsx` + `ThreeStepPaywall.tsx` PREMIUM column / SAVE 50% badge).
3. Whichever direction ships, it ships **everywhere in one pass** — a half-migrated eyebrow system is worse than the current one (new T6 drift).
4. Bundle the casing-normalization fixes (Section 3, items 9–10) into the same PR: one reference format, sentence-cased AI chat titles.

---

## 2. Ember unification spec

### Canonical look

The day-completion celebration is the baseline — the critique calls its dark-mode ember field "the app's single best emotional beat." Canonical recipe = `GoldEmberField` at pinned `streakLevel=7` (`src/components/CompletionCelebration.tsx:286`): **count 22, size 3.5–7, maxOpacity 0.55–0.9, bottom glow 0.22 / 340px**, plus **18 one-shot LuminousMotes** (`CompletionCelebration.tsx:103-167,197-209`). Every other ember surface becomes a parameterization of this one system.

Mobbin principles encoded into the system (not left as guidance):

1. **One vocabulary, two grammars.** Same sprites, color ramp, glow blur, motion envelopes for ambient and celebration. Ambient = sparse, slow, dim; celebration = the same field briefly violating the ambient rules (density/brightness), then settling back. The burst literally decays *into* the ambient field.
2. **One light source.** All embers rise from a single bottom hearth-glow; celebration motes emit from the hero artifact (title/streak number) at that same anchor. No uniform scatter.
3. **Brightness budget + exclusion zones.** Ambient ember luminance stays below the dimmest text on the surface; rectangular exclusion masks over headline blocks, page controls, and the founder-signature/quiet layers (fixes the "dot impersonating punctuation" and onboarding-legibility findings).
4. **Reduce-motion is a poster, not a pause** — see below.

### Component: `EmberSystem`

Promote `src/components/home/GoldEmberField.tsx` → `src/components/EmberSystem.tsx`.

```ts
type EmberSystemProps = {
  variant: 'celebration' | 'ambient';
  streakLevel?: number;            // ambient only; tiers count 8→28 (GoldEmberField.tsx:155-161)
  direction?: 'up' | 'down' | 'both'; // native; replaces paywall scaleY:-1 hack
  motes?: boolean;                 // celebration layer; folds LuminousMote in from CompletionCelebration.tsx:103-167
  intensity?: number;              // 0–1 scalar on count+opacity for chrome-adjacent surfaces
  active?: boolean;
  style?: ViewStyle;
};
```

- Hoist the gating (`screenFocused && appActive && !lowPowerMode`) from `AmbientArtCanvas.tsx:70,81` into `EmberSystem` so every surface gets it for free.
- Perf budget enforced in this one file: ≤2 sharedValues/particle (already true), **no per-view shadows** (kills `EmberParticles`' shadow pass), ambient cap 28, celebration cap 22 + 18 motes.
- **Light-mode retune (required, currently the worst offender):** light theme gets fewer (×0.6 count), larger (size +1.5), warmer particles with soft radial halo via gradient sprite (not shadow), opacity ceiling 0.5, plus a low warm rising wash — fixes "olive-brown dirt specks on cream" (HIGH, Today light mode).
- **Glow has ONE owner.** Delete the screen-level duplicate gradient at `src/app/(tabs)/(today)/index.tsx:1209-1221,1377-1384`; keep `EmberSystem`'s internal gradient (matches the celebration exactly).

### Presets / per-surface params

| Surface | variant | params |
|---|---|---|
| Day/series completion (`CompletionCelebration.tsx:286`, mounted `reading.tsx:2218`; `OnboardingCelebration.tsx:28`) | `celebration` | pinned tier-7: count 22, size 3.5–7, opacity 0.55–0.9, glow 0.22/340, `motes` on (18, emit from title block). Visual baseline — no change. |
| Today home, post-completion ambience (`AmbientArtCanvas.tsx:84` ← `(today)/index.tsx:1200`) | `ambient` | `streakLevel={streakCurrent}`, opacity floor raised to ≥0.5 (closes the "home feels weaker" gap), exclusion masks over card stack text, single internal glow. |
| Paywall route (`paywall.tsx:541`, currently streakLevel=3 + `scaleY:-1` wrapper at :539-543) | `ambient` | `direction='down'`, count ≈14, `intensity≈0.6`, hard exclusion over price/body text and disclosure. Remove the scaleY hack. |
| Welcome (`src/app/index.tsx:345`, EmberParticles count=22 + extra gradient :347-351) | `ambient` | `direction='both'`, count 20. This screen is the most divergent ember surface today (shadow-dot sprites, 320px travel, loop snap) — the likely "feels different" culprit. |
| Onboarding (`onboarding.tsx:1468` count 16; `:2325`, `:2339` count 10) | `ambient` | `direction='both'`, counts 16/10/10, `intensity 0.7`, exclusion over founder signature, Psalm reveal, "Tap anywhere". |
| ThreeStepPaywall (`ThreeStepPaywall.tsx:1290`, count 18 persistent) | `ambient` | `direction='both'`, count 14, exclusion over benefit copy + page dots (kills the faux-pagination collision). |

### Designed reduce-motion state (currently every ember system returns `null` — `GoldEmberField.tsx:224`, `EmberParticles.tsx:140`; and one MEDIUM finding says embers *keep drifting* under RM on some surface — fix the leak too)

Pattern proven in-repo by `EveningCelebration.tsx:312-343` (static stars) and `GlowBackground.tsx:206-233` (static orbs). Energy lives in geometry and luminance, never frozen velocity:

- **Ambient still:** internal bottom glow gradient at the tier's glowOpacity/glowHeight + ~6 hand-placed static embers (seeded positions, biased toward the glow anchor, 2–3 size classes for depth, 0.4× maxOpacity). No animation.
- **Celebration still:** same sprites restructured **radially** around the hero text block — a sparse ring/burst arrangement (Fitbod sunburst / Brilliant sparkle-ring logic), glow intensified one step, at most **one opacity cross-fade** on entry. Text keeps its existing instant-show behavior (`CompletionCelebration.tsx:223-231`).

### Migration + deletion list

1. Create `src/components/EmberSystem.tsx` from GoldEmberField; add `direction`, `motes`, `intensity`, internal gating, light-mode retune, RM stills, exclusion-mask prop.
2. Migrate call sites per table above: `CompletionCelebration.tsx:286` · `AmbientArtCanvas.tsx:84` · `paywall.tsx:539-543` · `src/app/index.tsx:345-351` · `onboarding.tsx:1468,2325,2339` · `ThreeStepPaywall.tsx:1290` · delete duplicate glow `(today)/index.tsx:1209-1221,1377-1384`.
3. **Delete:** `src/components/EmberParticles.tsx` (shadow-cost sprites, loop-snap artifact); `src/components/GlowBackground.tsx` (disabled, `_layout.tsx:27-28,141`); `src/components/EmberAtlas.tsx` (dead; drifted tier table 18/28/40/55/70 vs live 8/12/16/22/28); `src/components/home/shaders/concentric-rings.ts` + `organic-noise.ts` (unimported); dead `TodayAmbientRive` path (`today-ambient-rive.ts:43-51` always returns 'none') + 3 `.riv` assets (product sign-off). Update `home/__tests__/ambient-art-canvas-source.test.ts:15-17` and `reduce-motion-loop-coverage.test.ts`.
4. Consolidate sparkles while in here: keep `src/components/SparkleBurst.tsx` (showcase-only), delete the duplicate local impl in `src/app/unfolded.tsx:302-390` and point `unfolded.tsx:1202` at the shared one with a `palette` prop. Dedupe the hex lighten/darken helpers (2 copies).
5. Motion-rule compliance (vault, non-negotiable): no bounce anywhere; no springs on tabs/pills/segmented controls (`withTiming(200)` or instant); springs only for sheets/cards/modals with bounce 0.

---

## 3. Anti-AI-pattern punch list (ordered by feel-per-effort)

### Tier 1 — Trivial effort, outsized feel (do in one day)

1. **Kill every blue pixel.** `selectionColor`/`cursorColor` = `colors.accent` on every TextInput (only `(journal)/note-detail.tsx:1379` does it today; sweep onboarding name/hope fields `onboarding.tsx`, Companion composer, Notebook editor — grep `TextInput`). HIGH.
2. **Rating sheet never interrupts the celebration.** Defer `StoreReview.requestReview()` until after celebration dismissal: `(today)/index.tsx:724-726`, `OnboardingCelebration.tsx:19-20`, `ReviewPromptStep.tsx:23-27`. HIGH (Top10 #1).
3. **Doubled quote marks on hero typography.** Strip/detect source punctuation before decorative quote wrapping in the reader verse renderer (reading.tsx) and the You-tab past-devotional reader (`past-devotionals.tsx`); the share/sheet path already renders correctly — copy that logic. HIGH (Top10 #2).
4. **Smart quotes everywhere**, including Companion streamed strings — typographic-quote pass in the chat renderer + Today card copy. MEDIUM.
5. **One price, one disclosure.** $5.00/mo vs $4.99/mo for the same yearly plan across `paywall.tsx` and `ThreeStepPaywall.tsx`; unify rounding + disclosure string. HIGH (Top10 #5).
6. **Single-word voice cracks:** "Overdue" → grace-led phrasing on Today; "Subscribe" → warmer verb on paywall CTA; remove 🙏 emoji from editorial paywall testimonial; "Theme" dead category chip on Today → show the value or delete. LOW×4 but pure copy edits.
7. **Sentence-case Companion drawer chat titles** (machine Title Case is a model fingerprint). LOW.
8. **Remove leaked QA chrome** ("QA: Preview reveal" pill on first-run Today). MEDIUM.
9. **One scripture-reference format.** Pick one of PSALM/Psalm (and fix the wrong plural "Psalms 46:10") across reader sheets; do alongside Section 1. MEDIUM.
10. **One time format** (h:mm AM/PM) in the You-tab Reminders card ("08:00" / "12:30 PM" / "6:00 AM" currently coexist). MEDIUM.
11. **Accent-token discipline (owner directive 2026-06-11).** "Gold" is NOT a fixed brand color — it is the user-selectable accent (`user.accentTheme` → 7 presets in `store.ts:36-44`: Gold/Ocean/Rose/Forest/Lavender/Ember/Slate, each with dark+light variants → `ThemeProvider` → `createThemedColors` → `colors.accent`). Every fix in this brief that says "gold" means `colors.accent` (or `lighten`/`darken`/alpha derivations of it) — never a hardcoded hex. The marquee components already comply (`GoldEmberField.tsx:186-200` derives its 3-tier ember palette from `colors.accent`; `CompletionCelebration.tsx:297` and `AmbientArtCanvas` take `accentColor` props), so an Ocean user already gets blue embers by design — `EmberSystem` (Section 2) must take `accentColor` as input and preserve this. LEAK AUDIT REQUIRED: ~15 non-test files carry hardcoded warm-gold hexes that will NOT follow the user's accent — confirmed: `GlowBackground.tsx:27` (`DEFAULT_GOLD = '#C8A55C'` fallback); suspects to triage: `unfolded.tsx`, `(bible)/reader.tsx`, `(today)/highlights.tsx`, `(you)/my-content.tsx`, `RippleLoader.tsx`, `Current.tsx`, `DevotionalWebView.tsx` (WebView-injected CSS — accent must be passed into the HTML), `RememberThisCard.tsx`, `ui/utils/alpha.ts`, `component-catalog.tsx`. Triage each: accent-leak (fix: derive from token) vs legitimately fixed color (annotate why). HIGH — personalization is the feature most undermined by this inconsistency.

### Tier 2 — Small effort (a few hours each)

11. **Re-theme the iOS-blue "Refreshing…" banner** on reader chrome — "the most off-brand element anywhere"; replace with the gold progress hairline treatment. HIGH (Top10 #3).
12. **Replace stock folder long-press Alert with the branded bottom sheet** — the model component (New Folder sheet) exists one surface away: `(journal)/index.tsx:862`. HIGH (Top10 #9).
13. **Fade masks at scroll boundaries:** dark-route paywall hard-clips rows mid-glyph (light already has a mask) — port it (`paywall.tsx`); Companion suggestion chips fade at bezel. HIGH + LOW.
14. **Dynamic Type boundary repairs:** settings labels letter-breaking vertically ("Th/em/e") → allow stacking at ≥XL; re-measure on trait change (hard-clipped "Toda / Bibl / Compani"); paywall benefit copy must never clamp mid-sentence on a payment screen — write-to-fit. HIGH + MEDIUM×2 (Top10 #10 bundle).
15. **No mid-clause ellipsis on authored copy:** Today card bodies ("Proverbs 3:5-6 gets…", "No pressure —…") — write-to-fit or wrap. MEDIUM.
16. **Balanced headline breaking** — no single-word widows on Today hero titles ("When the Path Is / Quiet"). MEDIUM.
17. **One advance-affordance language in onboarding** (currently 4 vocabularies; the grey top-right "Continue" reads as disabled chrome). HIGH.
18. **One selection-state vocabulary** for onboarding list controls: gold border + warm fill + gold text, everywhere. MEDIUM.
19. **Unify SAVE-50% badge dim behavior** between paywall route and ThreeStep. MEDIUM.
20. **Tab-bar leaks:** gold Complete Day pill glowing through translucent tab bar → opaque/heavier blur + hairline. LOW.
21. **Undo toast after note deletion** (currently silent). MEDIUM.

### Tier 3 — Medium effort (the structural feel work)

22. **Ember component pass** — all of Section 2. Resolves HIGH light-mode dirt-specks, paywall text collisions, RM drift violation, typography collisions, onboarding quiet-layer legibility in one system. (Top10 #6.)
23. **Eyebrow replacement** — all of Section 1. (Owner + SOP over critique.)
24. **Author the bimodal states:** Bible search empty/no-results (bare grey defaults next to a designed Companion empty state); reader loading skeleton in serif-toned blocks (blank dividers currently read as a crash); first-run Today empty state must stop marketing the app to a user already inside it.
25. **Folder color swatches** → reuse the Accent Colors picker component (off-palette candy colors today, no selected state); kill rainbow book-picker chips in Bible for single-accent-compatible coding. MEDIUM×2.
26. **Cut the 8-page icon-on-disc feature tour to 3–4 pages with real product UI** — the one generic stretch of onboarding, and the SOP-banned "identical feature-card grid". MEDIUM.
27. **De-fake the social proof:** "4.8" beside five fully-filled stars; unanchored "Trusted by thousands"; evenly-spaced 3/7/30-day persuasion graph (`GrowthGraph.tsx`) → real anchors or cut. LOW×3 but trust-critical on a payment surface.
28. **My Library duplicated taxonomy** (Highlights tab above Highlights chip) + empty-state CTA anatomy unification across Notebook/My Library. MEDIUM + LOW.

---

## 4. What NOT to touch (the ownable identity)

1. **Gupter display serif** — the voice of the app. Keep it display-only (one serif moment per screen); never introduce serif italics (`fonts.ts:7-10` is a deliberate decision, and it stays). Do not move the serif into chrome/labels.
2. **Gold accent discipline** — gold remains the only accent. Section 1 *reduces* where gold appears (off the eyebrows); it does not add competitors. No second accent, no rainbow coding, no candy swatches. The short gold rule may survive as a single page-level mark.
3. **Designed empty states that already work** — Notebook ghost-note and Companion greeting are the in-app quality bar; new states (Section 3 #24) match them, never replace them.
4. **Dark-mode completion ember field** — "the app's single best emotional beat." Section 2 makes it the canonical preset precisely so nothing changes about how it looks on dark. The pinned `streakLevel=7` intensity is intentional; it becomes the celebration preset, not a bug.
5. **Cinematic onboarding open** — "ownable — nothing in the category opens like this." Fix the quiet-layer legibility via exclusion masks; do not de-cinematize.
6. **The branded New Folder bottom sheet and the Accent Colors picker** — these are the model components other surfaces migrate *to* (Section 3 #12, #25).
7. **EveningCelebration's reduce-motion static state** (`EveningCelebration.tsx:312-343`) — the best-designed RM state in the repo; it is the template for Section 2's stills, untouched itself.
8. **Vault motion law** — no bounce, no springs on tabs/pills/segmented controls; already the standard, keep enforcing it through every change above.

---

### Sequencing recommendation

PR 1: Tier-1 punch list (one day, mostly copy/one-liners). PR 2: `EmberSystem` + migrations + deletions (Section 2). PR 3: eyebrow direction (Section 1, single-pass migration + casing normalization). PR 4: Tier-2/3 states + boundaries. Each PR is independently shippable; nothing here blocks build 219.
