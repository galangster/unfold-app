# Today Tab: Borders → Shadows / Elevation System (v2)

Spec date: 2026-05-25
Branch: `mina/today-tab-shadows` (off `origin/mina/today-tab-design-audit` at `b163516`)
Author: Yuki (Claude) for Nick
Supersedes v1 (`90b4aa1`, never merged) after Codex adversarial review.

## Problem

The Today tab uses thin accent-tinted strokes around every visible card — the `TodayCardStack` (which renders Daily Thread / midday companion / evening / bridge / resume as stack items), the `StreakBox` (Daily Rhythm), and the `BentoGrid` (My Devotionals / My Library). On the near-black canvas the strokes read as visual noise rather than structure. The "1/N" counter on the top card adds chrome the stacked back-card silhouettes already communicate visually. Nick wants the cards defined by elevation, not by line.

## What changed since v1

Codex (https://github.com/openai/codex) ran an adversarial review of v1 and found 10 issues. The key corrections in this v2:

- **Branch base corrected.** v1 was written against `origin/main`, but `TodayCardStack`/`TodayCompanionBubble` do not exist on main. v2 is based on `origin/mina/today-tab-design-audit` (b163516), which is what TestFlight build 205 ships and what Nick screenshotted.
- **Scope narrowed.** The "companion chat area" and "bridge text" in Nick's prompt are both *stack items inside `TodayCardStack`*, not the legacy `TodayCompanionBubble`. v2 leaves `TodayCompanionBubble` / `DailyBridgeCard` / `BridgeShimmer` / `NotificationCard` / `ContextSlot` untouched — they are dormant in the production Today tab render (verified: no `<ContextSlot>` JSX in `src/app/(tabs)/(today)/index.tsx`).
- **`overflow: 'hidden'` + iOS shadow conflict acknowledged.** All three Phase 1 surfaces have `overflow: 'hidden'` for `BlurView` clipping. iOS legacy shadow props do not render through an overflow-hidden boundary. v2 mandates an outer/inner wrapper pattern so shadow lives on an outer un-clipped wrapper and the BlurView + content live on an inner clipped View.
- **Accent shadow honesty.** On the near-black canvas (`#0A0A0A`), `colors.accent` (`#C8A55C`) at 10% opacity with radius 16 blends to roughly `#1D1A12` peak before falloff — close to invisible. v2 frames the shadow as a *brand bloom*, not the primary depth cue. The structural work in dark mode is done by elevation-by-blur (already in place via `BlurView`) + the inner top highlight. The shadow is layered for cohesion and survives once we ship to Phase 2/3 surfaces that lack a BlurView.
- **Layout reflow avoided.** v1 said "no `borderWidth` emitted → no reflow." That's wrong — Yoga uses border width in box sizing. v2 keeps the existing `borderWidth` (1.5 on `topCard`, 1 on `backCard` / StreakBox / BentoGrid) and sets `borderColor: 'transparent'`. Padding untouched.
- **Accessibility kept.** Visible "1/N" goes away; the outer `Animated.View`'s `accessibilityLabel` stays multi-card-aware (e.g., `Today card stack, ${model.totalCount} cards`).
- **`radiusFor()` dropped.** No Phase 1 surface needs it; deferred.
- **`shadows.ts` callsites inventoried** — see "Coexistence" section below.

## Approach (Nick-approved 2026-05-25)

Phase 1 (this PR): elevation token system + apply to `TodayCardStack`, `StreakBox`, `BentoGrid`. Phase 2/3 (separate PRs): Reader/Notebook/Bible, then Settings/sheets. The "1/N" counter is removed in Phase 1.

## Non-goals

- No TestFlight build, App Review submission, external beta promotion, subscription/RevenueCat mutation, or production deploy in this PR.
- No motion/animation tuning. No copy changes. No spacing changes — borderWidth retained with transparent color to preserve Yoga layout.
- No app-wide sweep in this PR.
- No changes to Today tab content, ordering, or business logic.
- No changes to dormant legacy components (`TodayCompanionBubble`, `DailyBridgeCard`, `BridgeShimmer`, `NotificationCard`, `ContextSlot`, `RememberThisCard`).

## Phase 1 inventory (verified on `b163516`)

| Card | File | Current border | Current overflow | Current Shadow | BlurView? |
|---|---|---|---|---|---|
| Top card (Daily Thread + all stack items) | `src/components/home/TodayCardStack.tsx:347-358, 420-430` | `borderColor: alpha(accent, 0.28/0.24)` + `borderWidth: 1.5` | `hidden` | `...Shadow.md` *(currently suppressed by overflow:hidden — a no-op)* | yes (`intensity` 44/28) |
| Back silhouettes | `src/components/home/TodayCardStack.tsx:233-242, 435-441` | `borderColor: alpha(accent, borderOpacity)` + `borderWidth: 1` | (none) | (none) | no |
| Visible "1/N" counter | `src/components/home/TodayCardStack.tsx:369-375, 388` | n/a | n/a | n/a | n/a |
| StreakBox card | `src/components/StreakBox.tsx:78-91, 146-153` | `borderColor: alpha(accent, 0.25)` + `borderWidth: 1` | `hidden` | (none) | yes |
| StreakBox per-day chip border (`isToday`) | `src/components/StreakBox.tsx:124-130, 213-218` | `alpha(accent, 0.55)` | — | — | — |
| BentoGrid box | `src/components/home/BentoGrid.tsx:52-68, 92-104` | `borderColor: alpha(accent, 0.25)` + `borderWidth: 1` | `hidden` | (none) | yes (`intensity` 28/18) |

Note: `TodayCardStack:429`'s `...Shadow.md` already does nothing because the parent has `overflow: 'hidden'`. The visible shadow Nick sees on those cards is actually `shadowColor: colors.accent` (line 353) leaking via the OS — but iOS clipping behavior is inconsistent and the value barely renders. Confirmed Codex's "we're shipping a no-op" framing for the current state.

## Elevation token system

New file: `src/constants/elevation.ts`. Exposes a hook `useElevation()` that returns three tiers, each with three sub-objects so the consumer can place each style appropriately around an `overflow: 'hidden'` boundary.

```ts
// src/constants/elevation.ts
export interface ElevationTier {
  shadow: ViewStyle;    // shadowColor/Offset/Opacity/Radius + Android elevation
                        // → apply to OUTER (un-clipped) wrapper
  surface: ViewStyle;   // backgroundColor lift (no shadow, no border, no radius)
                        // → optional; consumers using BlurView typically skip this
  highlight: ViewStyle; // absolute-positioned top-edge 1px overlay style
                        // → render as a child <View> at top of clipped content
}

export interface ElevationSet {
  flat: ElevationTier;
  raised: ElevationTier;
  floating: ElevationTier;
}

export function useElevation(): ElevationSet;
```

### Recipes

The implementation plan will pin exact values. Design intent:

| Tier | Use | shadow (dark / light) | surface lift (dark / light) | highlight (dark / light) |
|---|---|---|---|---|
| `flat` | secondary surfaces inside a raised card; inline state | no shadow | +0% / +0% | none |
| `raised` | **Phase 1 cards + Phase 2/3 reusables** | accent, y4 r16 op .10 / accent y2 r10 op .08 | +7% white / `colors.backgroundElevated` (#FFFFFF) | `rgba(255,255,255,0.06)` 1px / **none in light mode** |
| `floating` | Phase 3 sheets, modals | accent y6 r24 op .16 / accent y4 r14 op .12 | +11% white / #FFFFFF | same as raised / none |

Honest framing on each technique:

1. **Elevation-by-blur** (already present via `BlurView`) — does the bulk of the visual lift in dark mode for Phase 1 cards. We don't add `surface` lift to these; the blur lifts already.
2. **Inner top highlight** — the actual structural definer in dark mode. 1px line of `rgba(255,255,255,0.06)` along the top edge implies light from above; survives screenshot compression.
3. **Accent-tinted shadow** — brand bloom, near-invisible on the near-black canvas. Layered for cohesion and because Phase 2/3 surfaces without a BlurView will rely on it more visibly.

Light mode: no inner highlight (would be invisible over `#FFFFFF`). Lift comes from `colors.backgroundElevated` being white over the off-white canvas. Shadow at low accent opacity is the bloom.

### Outer / inner wrapper pattern (MANDATORY for cards with `overflow: 'hidden'`)

```tsx
const elevation = useElevation();
<Animated.View style={[styles.outer, elevation.raised.shadow]}>
  <View style={[styles.inner, { overflow: 'hidden', borderRadius: Radius.xl }]}>
    <BlurView ... />
    <View pointerEvents="none" style={elevation.raised.highlight} />
    {content}
  </View>
</Animated.View>
```

- Outer wrapper: shadow only. `overflow` defaults to `visible`. No `borderRadius`, no clipping.
- Inner wrapper: existing `overflow: 'hidden'`, `borderRadius`, padding. Houses `BlurView`, highlight overlay, and content.
- Highlight overlay: `position: 'absolute'`, `top: 0`, `left: 0`, `right: 0`, `height: 1`, `backgroundColor: rgba(255,255,255,0.06)` in dark / `'transparent'` in light. Because it lives inside the clipped inner View, the rounded corners crop it cleanly.

## Per-card changes (Phase 1)

### 1. `TodayCardStack.tsx`

**Top card:**
- Add an outer wrapper around `topCardContent` (`Animated.View` at line 343). The shadow lives here.
- Move the existing inner content (`BlurView`, `topUtilityRow`, `TopCardBody`, `StackDismissButton`) into the inner clipped wrapper.
- Replace `...Shadow.md` and `shadowColor: colors.accent` on the current inline style with `elevation.raised.shadow`. Drop the `shadowColor: colors.accent` from the inner style block (line 353) — it's the wrong layer.
- Set `borderColor: 'transparent'` (keep `borderWidth: 1.5` from `styles.topCard` line 422). Layout preserved.
- Insert the `elevation.raised.highlight` overlay child as the first child inside the clipped inner View, above `BlurView`.

**Back silhouettes (`BackCardSilhouette`):**
- Drop `borderColor: alpha(colors.accent, borderOpacity)` from the inline style (line 237). Keep `borderWidth: 1` in `styles.backCard` (line 438) but set `borderColor: 'transparent'`. The visible silhouette is carried by `backgroundColor: alpha(accent, fillOpacity)` (line 236), which stays.
- No shadow on back cards — they live behind the top card and would compete.
- `borderOpacity` local var becomes unused — delete the computation at line 208.

**"1/N" counter removal:**
- Delete `topUtilityRow` View and `countText` Text entirely (lines 369-375).
- Delete `styles.topUtilityRow` and `styles.countText` from the StyleSheet block.
- Delete `showCount` local at line 339.
- Update `accessibilityLabel` on the outer wrapper Animated.View (line 388):
  - Was: `showCount ? 'Today card stack, card 1 of N' : 'Today card stack'`
  - New: `model.totalCount > 1 ? 'Today card stack, ${model.totalCount} cards' : 'Today card stack'`

**Test updates (`src/components/home/__tests__/today-card-stack.test.tsx`):**
- Line 232 asserts `findAll(testID === 'today-card-stack-count')).toHaveLength(0)` for single-card case — still valid (no count element will exist at all).
- Line 250 asserts `'1/3'` text exists — change to assert the outer `accessibilityLabel` contains `'3 cards'`. The `testID === 'today-card-stack-count'` lookup will return undefined; the test should assert that explicitly (`expect(... .findAll(testID === 'today-card-stack-count')).toHaveLength(0)`).
- No new tests added.

### 2. `StreakBox.tsx`

- Add outer wrapper around the card. Inner wrapper keeps `borderRadius`, `overflow: 'hidden'`, `borderWidth: 1`, `borderColor: 'transparent'`.
- Drop `borderColor: alpha(accent, 0.25)` from line 82.
- Insert `elevation.raised.highlight` overlay as first clipped-inner child.
- Apply `elevation.raised.shadow` to the new outer wrapper.
- **Per-day chip border at line 129** (`day.isToday ? alpha(accent, 0.55) : 'transparent'`) — **keep**. Per-day affordance, not card chrome.
- **Inner ring at line 217** — **keep**. Chip indicator role.

### 3. `BentoGrid.tsx`

- Each of the two boxes wraps in its own outer wrapper. Inner keeps `borderRadius: Radius.lg`, `overflow: 'hidden'`, `borderWidth: 1`, `borderColor: 'transparent'`.
- Drop `borderColor: alpha(accent, 0.25)` from line 58.
- Insert `elevation.raised.highlight` overlay child.
- Apply `elevation.raised.shadow` to outer wrapper.

### 4. Out of scope but explicitly named for clarity

- `TodayCompanionBubble.tsx` — dormant in production render. Untouched.
- `DailyBridgeCard.tsx`, `BridgeShimmer.tsx`, `NotificationCard.tsx`, `ContextSlot.tsx` — only reached via dormant code paths. Untouched.

## Coexistence with `src/constants/shadows.ts`

`Shadow.sm/md/lg/sheet` callsites in this branch (Phase 1 leaves all untouched except the TodayCardStack one that gets replaced):

- `src/app/(tabs)/(journal)/index.tsx:1367,1552` — Shadow.sm
- `src/app/(tabs)/(you)/index.tsx:720` — Shadow.sm
- `src/app/(tabs)/(bible)/reader.tsx:1331` — Shadow.sheet
- `src/app/(tabs)/(today)/reading.tsx:2476` — Shadow.md
- `src/components/AudioPlayerPill.tsx:184` — Shadow.lg
- `src/components/AudioPlayerBar.tsx:154` — Shadow.lg
- `src/components/ui/Card.tsx:69,88,95` — Shadow.sm/lg/sm
- `src/components/HomeOnboardingTooltips.tsx:483` — Shadow.lg
- `src/components/home/ContextSlot.tsx:265` — Shadow.md (dormant render)
- `src/components/home/TodayCardStack.tsx:429` — Shadow.md (**replaced in Phase 1**)
- `src/components/notebook/CreateFolderSheet.tsx:318` — Shadow.sheet
- `src/components/notebook/NoteCard.tsx:195` — Shadow.sm
- `src/components/notebook/ScriptureSearchSheet.tsx:468` — Shadow.sheet
- `src/components/ui/Sheet.tsx:202` (importing line 37) — Shadow.sheet

Phase 2 migrates: `ui/Card.tsx`, `ContextSlot.tsx` (if revived), notebook/NoteCard, today/reading.tsx, bible/reader.tsx, journal+you index Shadow.sm cards.
Phase 3 migrates: `ui/Sheet.tsx`, `CreateFolderSheet.tsx`, `ScriptureSearchSheet.tsx`, `AudioPlayerBar/Pill.tsx`, `HomeOnboardingTooltips.tsx`.

`shadows.ts` deletion is deferred to Phase 3 close-out (after all callsites migrate). Phase 1 may leave one TodayCardStack callsite removed; the rest remain.

## Verification gates

Before sending screenshots to Nick:
- `git diff --check`
- `npm run typecheck`
- `npm run lint --quiet`
- Focused Jest: `today-card-stack`, plus a smoke run on `home/`
- `npm run verify:changed`
- FlowDeck simulator boot + take 4 screenshots:
  - Today tab with stack + dark mode
  - Today tab with stack + light mode
  - Detail of StreakBox + BentoGrid + dark
  - Detail of StreakBox + BentoGrid + light

Before merging Phase 1 (separate gate, after Nick approves screenshots):
- Full Jest `--runInBand`
- `npm run verify:profiles`
- `EXPO_PUBLIC_BACKEND_URL=https://api.unfoldapp.co npm run verify:release`

No production IPA inspection, ASC upload, or TestFlight in Phase 1 without Nick's explicit OK.

## Risks (acknowledged)

1. **Accent shadow on near-black canvas is functionally near-invisible.** Verified by blend math. Highlight + blur carry the work. Spec is honest about this. If the bloom doesn't land in screenshots, Phase 1.5 tunes opacity up or drops shadow from dark mode entirely.
2. **Android elevation is monochromatic.** RN's Android `elevation:` is OS-rendered black; tint is not honored. Cosmetic divergence between platforms accepted in Phase 1.
3. **Companion bubble bounding-box artifact** — *not a Phase 1 issue anymore*, since `TodayCompanionBubble` is out of scope.
4. **Highlight overlay z-order vs BlurView.** Must render *after* `BlurView` but *before* text content, with `pointerEvents="none"` and `position: 'absolute'`, top: 0, left: 0, right: 0. Test in simulator before committing the visual.
5. **Test rewrite at line 250 is the only mandatory test change.** Other tests are stable.
6. **Existing `Shadow.md` on TodayCardStack:429 is currently a no-op due to overflow:hidden.** Replacing it changes behavior from invisible to visible — that's the entire point. But it means the baseline "before" screenshot will look slightly different from any test that mocked shadow rendering. None do — verified.

## Out of scope (will NOT do in this PR)

- Reader, Notebook, Bible, Settings borders
- Sheet/modal elevation
- Touch/press state shadow changes
- Image-outline rule (Krehel)
- Concentric border radius helper (`radiusFor()`)
- Any change to `TodayCompanionBubble`, `DailyBridgeCard`, `BridgeShimmer`, `NotificationCard`, `ContextSlot`
- Animation tuning
- Light-mode visual identity changes beyond the elevation recipe described

## Implementation plan

Authored next via `superpowers:writing-plans`. Will produce:
1. `src/constants/elevation.ts` + Jest unit tests for the hook (light/dark, all three tiers)
2. TodayCardStack: outer/inner wrapper + transparent borderColor + highlight + "1/N" removal + a11y label update + test updates
3. StreakBox: outer/inner wrapper + transparent borderColor + highlight
4. BentoGrid: per-box outer/inner wrapper + transparent borderColor + highlight
5. FlowDeck simulator screenshot pass (4 captures: light+dark × top of Today + Rhythm/Bento region)
6. Verification gates
7. Push branch, attach screenshots, await Nick approval

## Open questions for Nick before implementation plan

None blocking. Each design call below was made above and can be overridden in spec review:

1. **TodayCompanionBubble out of scope.** Override only by saying "include the dormant legacy paths." Recommendation: don't.
2. **Accent shadow stays, even if functionally invisible on dark canvas.** Override by saying "drop shadow entirely in dark mode" or "use black shadow in dark mode." Recommendation: keep accent and accept the bloom is subtle; let screenshots prove or disprove it.
3. **`borderColor: 'transparent'` instead of removing `borderWidth`.** Override by saying "adjust padding to compensate for reflow." Recommendation: transparent border is cheaper and safer.
4. **a11y label becomes "Today card stack, N cards" (drops the "card 1 of N" specificity).** Override by saying "keep card 1 of N." Recommendation: drop the position cue since we no longer expose it visually either.
5. **`shadows.ts` not deleted in Phase 1.** Override only by adding Phase 2/3 work to this PR. Don't.
