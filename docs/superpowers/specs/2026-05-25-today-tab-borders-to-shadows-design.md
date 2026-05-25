# Today Tab: Borders → Shadows / Elevation System (v2)

Spec date: 2026-05-25
Branch: `mina/today-tab-shadows` (off `origin/mina/today-tab-design-audit` at `b163516`)
Author: Yuki (Claude) for Nick
Supersedes v1 (`90b4aa1`, never merged) after Codex adversarial review.

## Problem

The Today tab uses thin accent-tinted strokes around every visible card — the `TodayCardStack` (which renders Daily Thread / midday companion / evening / bridge / resume as stack items), the `StreakBox` (Daily Rhythm), and the `BentoGrid` (My Devotionals / My Library). On the near-black canvas the strokes read as visual noise rather than structure. The "1/N" counter on the top card adds chrome the stacked back-card silhouettes already communicate visually. Nick wants the cards defined by elevation, not by line.

## What changed since v1

Codex (https://github.com/openai/codex) ran an adversarial review of v1 and found 10 issues. The key corrections in this v2:

- **Branch base corrected.** v1 was written against `origin/main`, but `TodayCardStack`/`TodayCompanionBubble` do not exist on main. v2 is based on `origin/mina/today-tab-design-audit` (head `b163516`), the same branch line that produced internal TestFlight build 205 (source `d4c13da`) and build 206 (source `390fdec`). `b163516` is two commits ahead of the build-205 source on the same branch — close enough that what Nick screenshotted maps cleanly to the components we're modifying.
- **Scope narrowed.** The "companion chat area" and "bridge text" in Nick's prompt are both *stack items inside `TodayCardStack`*, not the legacy `TodayCompanionBubble`. v2 leaves `TodayCompanionBubble` / `DailyBridgeCard` / `BridgeShimmer` / `NotificationCard` / `ContextSlot` untouched — they are dormant in the production Today tab render (verified: no `<ContextSlot>` JSX in `src/app/(tabs)/(today)/index.tsx`).
- **`overflow: 'hidden'` + iOS shadow conflict acknowledged.** All three Phase 1 surfaces have `overflow: 'hidden'` for `BlurView` clipping. iOS legacy shadow props do not render through an overflow-hidden boundary. v2 mandates an outer/inner wrapper pattern so shadow lives on an outer un-clipped wrapper and the BlurView + content live on an inner clipped View.
- **Accent shadow honesty.** On the near-black canvas (`#0A0A0A`), `colors.accent` (`#C8A55C`) at 10% opacity with radius 16 blends to roughly `#1D1A12` peak before falloff — close to invisible. v2 frames the shadow as a *brand bloom*, not the primary depth cue. The structural work in dark mode is done by elevation-by-blur (already in place via `BlurView`) + the inner top highlight. The shadow is layered for cohesion and survives once we ship to Phase 2/3 surfaces that lack a BlurView.
- **Layout reflow avoided.** v1 said "no `borderWidth` emitted → no reflow." That's wrong — Yoga uses border width in box sizing. v2 keeps the existing `borderWidth` (1.5 on `topCard`, 1 on `backCard` / StreakBox / BentoGrid) and sets `borderColor: 'transparent'`. Padding untouched.
- **Accessibility simplified.** Visible "1/N" goes away. The outer stack wrapper (`styles.outer`, `testID="today-card-stack"`) keeps the constant label `"Today card stack"` — no count. Per-card identity is owned by `TopCardBody`'s existing accessible `View` or `TouchableOpacity`. No multi-card "card 1 of N" announcement; sighted users have the stack peek, VoiceOver users navigate sequentially. (Optional alternative if Nick wants count preserved: add `accessibilityValue: { text: 'Card 1 of N' }` on `TopCardBody`'s accessible element rather than a hint suffix — per Apple HIG, position is closer to value than hint. Test all three `TopCardBody` branches if pursued.)
- **`radiusFor()` dropped.** No Phase 1 surface needs it; deferred.
- **`shadows.ts` callsites inventoried** — see "Coexistence" section below.

## Approach (Nick-approved 2026-05-25)

Phase 1 (this PR): elevation token system + apply to `TodayCardStack`, `StreakBox`, `BentoGrid`. Phase 2/3 (separate PRs): Reader/Notebook/Bible, then Settings/sheets. The "1/N" counter is removed in Phase 1.

## Non-goals

- No TestFlight build, App Review submission, external beta promotion, subscription/RevenueCat mutation, or production deploy in this PR.
- No motion/animation tuning. No copy changes. No spacing changes — borderWidth retained with transparent color to preserve Yoga layout.
- No deliberate touch/press shadow choreography. However: putting shadow on the outer `TouchableOpacity` in `StreakBox` and `BentoGrid` means the existing `activeOpacity` will naturally fade the new shadow on press (per `TouchableOpacity.js:95,302`, which wraps style in an `Animated.View` and applies opacity to the same node). This is acceptable subtle press feedback; not a goal, not a bug.
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

Note: `TodayCardStack:429`'s `...Shadow.md` already does nothing because the parent has `overflow: 'hidden'` (RN maps this to iOS `clipsToBounds`, which suppresses same-layer shadows). The `shadowColor: colors.accent` at line 353 is *not* a separate shadow — it only colors the suppressed `...Shadow.md`. Net: TodayCardStack top card currently has no rendered shadow. Confirmed Codex's "we're shipping a no-op" framing for the current state.

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
<Animated.View style={[styles.outer, { borderRadius: Radius.xl }, elevation.raised.shadow]}>
  <View style={[styles.inner, { overflow: 'hidden', borderRadius: Radius.xl }]}>
    <BlurView ... />
    <View pointerEvents="none" style={elevation.raised.highlight} />
    {content}
  </View>
</Animated.View>
```

- **Outer wrapper:** shadow + matching `borderRadius`. `overflow` is the default (`visible`). The `borderRadius` is harmless and useful for Phase 2/3 surfaces with a solid background. For Phase 1's glass cards (no solid outer bg), iOS will fall back to a pixel-derived shadow path because RN only computes a rounded shadow path when background alpha > 0.999 (`RCTView.m:882` / `RCTViewComponentView.mm:904`). A YGShadowEfficiency warning may appear in dev — accept it for Phase 1 rather than adding a solid underlay that would defeat the BlurView.
- **Inner wrapper:** owns `overflow: 'hidden'`, `borderRadius`, padding, `backgroundColor`, `borderWidth`+transparent `borderColor`. Houses `BlurView`, the highlight overlay, and content.
- **Highlight overlay:** `position: 'absolute'`, `top: 0`, `left: 0`, `right: 0`, `height: 1`, `backgroundColor: rgba(255,255,255,0.06)` in dark / `'transparent'` in light, `pointerEvents="none"`. **Z-order: render AFTER `BlurView`, BEFORE the content View.** First-child wins lowest z, so `BlurView` must come first; the highlight goes second so its 1px line is on top of the blurred edge.
- Because the highlight lives inside the clipped inner View, the rounded corners crop it cleanly.

## Per-card changes (Phase 1)

### 1. `TodayCardStack.tsx`

**Top card — explicit prop ownership** (the current single `Animated.View` at line 343 splits into outer + inner):

| Prop | Stays on outer (new `Animated.View`) | Moves to inner (new plain `View`) |
|---|---|---|
| `onLayout={handleTopCardLayout}` | ✓ | |
| `testID={topCard.testID ?? 'today-card-stack-top-card'}` | ✓ | |
| `topCardAnimatedStyle` (swipe `translateX` + `rotateZ`) | ✓ — entire card swipes/rotates as one | |
| `zIndex: model.totalCount + 1` | ✓ | |
| `elevation.raised.shadow` | ✓ | |
| `borderRadius: Radius.xl` | ✓ (for rounded shadow path) | ✓ (for content clipping) |
| `accessibilityLabel`, `accessible` | — (NOT marked accessible; see a11y note below) | |
| `backgroundColor` (existing alpha blend at lines 349-351) | | ✓ |
| `borderWidth: 1.5`, `borderColor: 'transparent'` (was `alpha(colors.accent, …)`) | | ✓ |
| `paddingHorizontal/Vertical` (from `styles.topCard`) | | ✓ |
| `overflow: 'hidden'` | | ✓ |
| `BlurView` child | | ✓ (first inner child) |
| `elevation.raised.highlight` overlay child | | ✓ (second inner child, after BlurView, before content) |
| `TopCardBody` + `StackDismissButton` | | ✓ (third+ inner children) |

- Drop `...Shadow.md` and the dangling `shadowColor: colors.accent` from the inline style entirely (lines 353-354 and the `styles.topCard` Shadow.md spread at line 429). Replace with `elevation.raised.shadow` on the outer wrapper.
- Drop `borderColor: alpha(colors.accent, isDark ? 0.28 : 0.24)` from the inline style (line 352). Inner keeps `borderWidth: 1.5` with `borderColor: 'transparent'`.
- The `GestureDetector` at line 404-406 wraps the OUTER wrapper, so the swipe gesture continues to drive `topCardAnimatedStyle` on the outer (and the shadow swipes with it).

**Back silhouettes (`BackCardSilhouette`):**
- Drop `borderColor: alpha(colors.accent, borderOpacity)` from the inline style (line 237). Keep `borderWidth: 1` in `styles.backCard` (line 438) but set `borderColor: 'transparent'`. The visible silhouette is carried by `backgroundColor: alpha(accent, fillOpacity)` (line 236), which stays.
- No shadow on back cards — they live behind the top card and would compete.
- `borderOpacity` local var becomes unused — delete the computation at line 208.
- See `today-motion-regression.test.ts:146` test update below.

**"1/N" counter removal:**
- Delete `topUtilityRow` View and `countText` Text entirely (lines 369-375).
- Delete `styles.topUtilityRow` and `styles.countText` from the StyleSheet block.
- Delete `showCount` local at line 339.
- **Drop the `accessibilityLabel` on the existing `styles.outer` `Animated.View` (line 388) entirely.** Replace with `accessibilityLabel="Today card stack"` (constant; no count). Do NOT add `accessible={true}` here, and do NOT move the label to the new top-card wrapper.
- **Do not mark the new top-card outer wrapper accessible.** `TopCardBody` already owns the card's accessibility identity: for cards with `onPress` it returns a `TouchableOpacity` (auto-accessible, line 164), and for non-press cards it returns `<View accessible accessibilityRole="text" accessibilityLabel={card.accessibilityLabel} accessibilityHint={card.accessibilityHint}>` (line 158). Either way the card is its own a11y element with the correct per-card label/hint. A parent `accessible` wrapper would group/steal focus from these and replace per-card labels with a generic stack label — regression. The corrected v2.1 claim that "TopCardBody is just a View, no touchable" was wrong; it is one of those two accessible elements depending on `card.onPress`.
- **Count info dropped from a11y entirely.** Match the visual removal: sighted users have the stack peek; VoiceOver users navigate sequentially via per-card actions and dismiss buttons. Multi-card count is not surfaced. (Alternative if Nick wants it preserved for VoiceOver: augment `TopCardBody`'s existing `accessibilityHint` with a "Card 1 of N" suffix when `model.totalCount > 1`, plumbed via a new prop on `TopCardBody`. Default decision is drop; flag for spec review.)

**Test updates:**

`src/components/home/__tests__/today-card-stack.test.tsx`:
- Line 232 asserts `findAll(testID === 'today-card-stack-count')).toHaveLength(0)` for single-card case — still valid (no count element will exist at all).
- Line 250 asserts `'1/3'` text exists — rewrite to: `expect(tree.root.findAll((node: any) => node.props.testID === 'today-card-stack-count')).toHaveLength(0)`. Drop the `findByProps({ testID: 'today-card-stack-count' })` lookup. Then assert the existing `styles.outer` View's accessibilityLabel is the constant `'Today card stack'`: `expect(tree.root.findByProps({ testID: 'today-card-stack' }).props.accessibilityLabel).toBe('Today card stack')`. (The `testID="today-card-stack"` stays on `styles.outer` per `styles.outer` ownership in section 1 above.)
- **Line 368** asserts a literal source string match across `TopCardBody` and `StackDismissButton` JSX with specific indentation. Wrapping content into an outer/inner View will change indentation. Update the assertion to use a regex tolerant of leading whitespace (e.g., `expect(source).toMatch(/<TopCardBody\s+card=\{topCard\}\s+colors=\{colors\}\s*\/>\s*<StackDismissButton\s+card=\{topCard\}\s+colors=\{colors\}\s*\/>/)`).

`src/lib/__tests__/today-motion-regression.test.ts:146`:
- Asserts `todayCardStackSource).toContain('borderColor: alpha(colors.accent, borderOpacity)')`. We're removing this inline `borderColor` from `BackCardSilhouette`. Update the assertion to verify the back-card opacity/fill behavior is preserved (`backgroundColor: alpha(colors.accent, fillOpacity)` at line 145 stays) and drop the borderColor line. The motion guarantee being tested is that back cards visually remain after our changes, not that they have a border.

`src/components/home/__tests__/dismissible-surfaces.test.tsx`:
- No changes expected. Test exercises dismiss behavior, not chrome. Verify on first Jest run; if anything snapshots styles, snapshot updates are accepted as the visual-design diff we expect.

Per-card unit tests added: only for the new `useElevation()` hook (see Implementation plan step 1). No new per-card behavior tests in Phase 1 — visual changes are validated by simulator screenshots.

### 2. `StreakBox.tsx`

The card is currently a `TouchableOpacity` (line 78-89 wrapping into an inner-styled card). Re-shape into:

- **Outer wrapper** = `TouchableOpacity` (keeps existing `onPress`, `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, plus new `elevation.raised.shadow` and `borderRadius: Radius.lg`).
- **Inner wrapper** = plain `View` with `borderRadius: Radius.lg`, `overflow: 'hidden'`, `borderWidth: 1`, `borderColor: 'transparent'`, padding (moved from existing `styles.card`).
- Drop `borderColor: alpha(accent, 0.25)` from line 82.
- Insert `BlurView` (already present at line 87) as first inner child.
- Insert `elevation.raised.highlight` overlay as second inner child (after BlurView, before content).
- **Per-day chip border at line 129** (`day.isToday ? alpha(accent, 0.55) : 'transparent'`) — **keep**. Per-day affordance, not card chrome.
- **Inner ring at line 217** — **keep**. Chip indicator role.

### 3. `BentoGrid.tsx`

Each box is currently a `TouchableOpacity` (line 42-61) with `flex: 1`, `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, press handler, and the visual styling (`styles.box`) all on the same element. Re-shape into:

- **Outer wrapper** = `TouchableOpacity` (keeps `flex: 1`, `onPress`, all `accessibility*` props, plus new `elevation.raised.shadow` and `borderRadius: Radius.lg`). The pressable + flex sizing MUST stay on the outer so the row geometry and hit area are unchanged.
- **Inner wrapper** = plain `View` with `borderRadius: Radius.lg`, `overflow: 'hidden'`, `borderWidth: 1`, `borderColor: 'transparent'`, `minHeight`, padding, the `flexDirection: 'row'` + `alignItems` + `justifyContent` + `gap` from existing `styles.box`.
- Drop `borderColor: alpha(accent, 0.25)` from line 58.
- Insert `BlurView` (already present at line 62-68) as first inner child.
- Insert `elevation.raised.highlight` overlay as second inner child (after BlurView, before content).
- Label `Text` + `CaretRightIcon` stay as third+ inner children.

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
- `src/components/notebook/MoveFolderSheet.tsx:672` — Shadow.sheet
- `src/components/AudioPlayerSheet.tsx:256` — Shadow.sheet
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
5. **Mandatory test changes:** `today-card-stack.test.tsx:232` (still valid), `today-card-stack.test.tsx:250` (rewrite assertion), `today-card-stack.test.tsx:368` (regex-relax source string), `today-motion-regression.test.ts:146` (drop back-card border assertion). See "Test updates" section above for exact rewrites.
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
4. **a11y label becomes constant `"Today card stack"` and the count is dropped from a11y entirely.** Override by saying "preserve position via `accessibilityValue` on TopCardBody." Recommendation: drop. Not a HIG/WCAG violation (per Apple VoiceOver criteria + WCAG 1.3.2 / 4.1.2); back cards aren't independently actionable.
5. **`shadows.ts` not deleted in Phase 1.** Override only by adding Phase 2/3 work to this PR. Don't.
