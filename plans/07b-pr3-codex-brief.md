# PR 3 wave 2+ — Codex implementation brief (Direction A eyebrow migration)

**Repo:** `/Users/galangster/clawd/work/unfold/app/mobile` · **Branch:** `feat/ui-deslop-pr3-eyebrows` (work directly on it; base commit `58c0ae2` = wave 1, home components, already migrated — study it as the pattern reference: `git show 58c0ae2`).
**Authority:** `plans/07-ui-deslop-brief.md` §1 Direction A (CHOSEN). This brief is the digested, binding version for the remaining files.

## The rule set (Direction A)

1. The tracked-caps eyebrow (`textTransform: 'uppercase'` + letterSpacing ≥1 + small font, usually paired with accent color and/or a short rule `View`) is **deleted as a layer**. Hierarchy = size + weight + whitespace.
2. **True section headers** (text that labels a content group on a screen) → `...Typography.sectionHeader` (already in `src/constants/typography.ts`), `colors.text` full contrast, **sentence case**, copy rewritten as a phrase with a verb or possessive. Known rewrites (binding): `DAILY RHYTHM` → `Your daily rhythm`; `UP NEXT` → `Up next`; `COMPANION NOTE` → `A note from your companion`; `TOMORROW` → `Tomorrow`. For others, derive the sentence-case phrase from the existing words — do NOT invent new creative copy; if a plain de-caps reads wrong, keep the literal words sentence-cased and add the site to the `COPY-REVIEW` list in your final report.
3. **In-card category/type/meta info** (day counts, method names, status words, card-type kickers) → `...Typography.cardMeta`, `colors.textMuted` (or `textSubtle` if it already was), demoted BELOW the title when it sat above as an eyebrow; sentence case. Pattern examples in wave 1: `TodayCardStack.tsx` (eyebrow → meta below title), `DevotionalCard.tsx` (`heroDayMetaDayText`, `heroMethodText`).
4. **Pure-redundancy kickers** (a kicker whose info the adjacent title/subtitle already states) → delete the element and its paired rule/accent-bar `View`, prune the dead styles. Wave-1 examples: `RecommendedSeriesCard`, `DevotionalCard` returning/preparing/journeyComplete kickers.
5. **Scripture-reference eyebrows** (e.g. `PSALM 46:10` over reader/sheet content) → keep the element and position, drop caps/tracking: `...Typography.cardMeta` (or keep existing non-caps token if larger), reference text stays as-is (`Psalm 46:10` canonical form is already enforced upstream).
6. **Badges/pills**: `SAVE {n}%` and the `PREMIUM` comparison-column header in the paywalls migrate to sentence case (`Save {n}%`, `Premium`) keeping their pill/badge styling minus `textTransform`/tracking>0.3. Note the test contract below.
7. **Buttons/CTAs**: if a button label style carries `textTransform: 'uppercase'`, remove the transform and sentence-case the literal. Do not change button styling otherwise.
8. After the sweep: `Typography.label` must have **zero consumers** — convert its 3 remaining consumers per rules above, then **delete the `label` entry** from `src/constants/typography.ts` (and its comment).
9. The short gold rule may survive only as ONE page-level brand mark per screen, detached from text. Default: delete every rule paired with an eyebrow. If you believe a specific rule qualifies as the single page-level mark, keep it and list it under `COPY-REVIEW`.

## Scope — files with `textTransform: 'uppercase'` remaining (verify with grep; count per file)

src/app/onboarding.tsx (7) · src/components/reading/DevotionalContent.tsx (4) · src/app/(tabs)/(today)/journal-detail.tsx (4) · src/components/ScriptureExplainSheet.tsx (3) · src/app/generating.tsx (3) · src/components/onboarding/ThreeStepPaywall.tsx (2) · src/app/reveal.tsx (2) · src/app/(tabs)/(you)/series-detail.tsx (2) · src/app/(tabs)/(you)/index.tsx (2) · src/app/(tabs)/(today)/reading.tsx (2) · src/app/(tabs)/(today)/journal.tsx (2) · src/app/(tabs)/(today)/evening-wind-down.tsx (2) · src/app/(tabs)/(today)/day-menu.tsx (2) · src/app/(tabs)/(bible)/index.tsx (2) · singles: src/components/StreakBox.tsx, src/components/reading/InlineReflectionJournal.tsx, src/components/PremiumNudgeCard.tsx, src/components/onboarding/GrowthGraph.tsx, src/components/onboarding/FeatureSummaryCarousel.tsx, src/components/notebook/ScriptureSearchSheet.tsx, src/components/bible/BookChapterNavigator.tsx, src/app/streak-settings.tsx, src/app/showcase.tsx, src/app/debug-light-mode.tsx, src/app/(tabs)/(you)/past-devotionals.tsx, src/app/(tabs)/(you)/checkin-schedule.tsx, src/app/(tabs)/(today)/highlights.tsx, src/app/(tabs)/(journal)/my-responses.tsx, src/app/__dev__/unfold-editor-test.tsx · plus `Typography.label` consumers (grep `Typography.label`).

Also sweep `.toUpperCase()` calls that feed rendered `<Text>` copy (NOT data/code identifiers) — same dispositions.

## Hard invariants (violating any = rejected diff)

- **Gupter display serif untouched** — never move serif into labels; never add serif italics.
- **Accent discipline**: any color you touch must come from `colors.*` (theme) — never a hardcoded hex.
- **No layout/visual changes beyond the eyebrow layer** — don't "improve" spacing, shadows, animations, or unrelated styles. Exception: removing an eyebrow may need a small margin adjustment on the now-first element to preserve breathing room (≤ existing spacing tokens only).
- **Cinematic onboarding open is protected**: in `onboarding.tsx`, for sites that are part of the opening cinematic sequence (pre-name-input screens, founder signature, Psalm reveal, "Tap anywhere"), restyle typography ONLY if the site is a tracked-caps eyebrow; never change copy, structure, or timing there. When unsure, list under `COPY-REVIEW` instead of editing.
- **Dev/QA-only screens** (`showcase.tsx`, `debug-light-mode.tsx`, `__dev__/unfold-editor-test.tsx`, `component-catalog`): migrate mechanically, zero copy creativity.
- Do not touch: ember/glow components, `CompletionCelebration` visual params, `PrivacyInfo.xcprivacy`, anything under `ios/`.

## Known test contracts (handle in the same diff)

- `src/lib/__tests__/paywall-a11y-contract.test.ts` greps `paywall.tsx` source for `'SAVE {savingsPercent}%'` (badge anchor, line ~58-63). If you sentence-case the badge, update the test's anchor strings in the same diff (keep the test's INTENT: badge uses solid accent bg + background ink + a11y hidden).
- `src/lib/__tests__/onboarding-name-commit.test.ts` slices `onboarding.tsx` between `'<TextInput'` and `'<VoiceInputBar'` — keep that ordering intact.
- `src/lib/__tests__/reading-swipe-navigation-source.test.ts` source-greps `reading.tsx` — run it after touching reading.tsx.
- `src/components/home/__tests__/dismissible-surfaces.test.tsx` source-greps `(today)/index.tsx` for exact substrings — run after touching it.
- Run any `__tests__` that greps a file you changed (search by filename string in `src/**/__tests__`).

## Verification gates (run yourself before reporting; all must pass)

1. `npm run typecheck`
2. `npm run lint -- --quiet`
3. `npx jest --runInBand --silent` (full suite; baseline 903 passing + wave-1 — expect ≥903)
4. `grep -rn "textTransform: 'uppercase'" src/ --include='*.tsx' --include='*.ts' | grep -v __tests__` → must return ONLY sites you explicitly justified (target: zero)
5. `grep -rn "Typography.label" src/` → zero consumers, token deleted
6. `git diff --check` (no whitespace errors)

## Report format (your final message)

1. Per-file one-liner: what kind(s), disposition applied.
2. `COPY-REVIEW` list: every site where copy/judgment was non-obvious (file:line, what you did, alternative).
3. Gate outputs (the 6 above, verbatim summary lines).
4. Anything you intentionally did NOT migrate, with reason.
