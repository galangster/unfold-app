# Personal Study Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Unfold's existing bookmarks, highlights, study methods, and past series into a coherent "Personal Study Library" with proper wayfinding, a Saved screen, resurfacing cards, and study method tooltips.

**Architecture:** Three-layer approach — Layer 1 fixes inline reading actions (debug highlights, add study method sheet, improve bookmark feedback), Layer 2 builds a sectioned Saved screen in the You tab, Layer 3 adds resurfacing via a "Remember This?" card and series visibility on the Home tab. All data already persists in Zustand + MMKV. No new dependencies.

**Tech Stack:** Expo SDK 55, React Native 0.83, Expo Router v7, Zustand, MMKV, react-native-reanimated v3, @gorhom/bottom-sheet, phosphor-react-native, NativeWind + Tailwind v3

**Spec:** `docs/superpowers/specs/2026-03-22-personal-study-library-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/reading/StudyMethodSheet.tsx` | Bottom sheet explaining a study method (name, description, difficulty, what to expect) |
| `src/app/(tabs)/(you)/saved.tsx` | Sectioned Saved screen (highlights, bookmarks, completed series) |
| `src/components/home/RememberThisCard.tsx` | Single "Remember This?" highlight card for Home tab |
| `src/components/home/YourSeriesSection.tsx` | Compact in-progress + completed series section for Home tab |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/reading/DevotionalContent.tsx` | Replace static method badge with tappable row + chevron |
| `src/components/reading/DevotionalWebView.tsx` | Debug/fix iOS text selection conflict with highlight toolbar |
| `src/app/(tabs)/(today)/reading.tsx` | Wire StudyMethodSheet, add bookmark toast confirmation |
| `src/app/(tabs)/(today)/index.tsx` | Add RememberThisCard and YourSeriesSection to Home tab |
| `src/app/(tabs)/(you)/index.tsx` | Add navigation to new Saved screen |
| `src/app/(tabs)/(you)/past-devotionals.tsx` | Add In Progress / Completed segment tabs |
| `src/lib/store.ts` | Add `getRandomHighlight()` selector |

---

## Task 1: Debug Highlighting on Device

**Files:**
- Modify: `src/components/reading/DevotionalWebView.tsx`

The #1 priority. iOS native text selection menu likely conflicts with the custom highlight toolbar. This is almost certainly why users reported highlighting as "broken."

- [ ] **Step 1: Read the WebView highlight implementation**

Read `src/components/reading/DevotionalWebView.tsx` — focus on:
- The injected JavaScript that handles `touchend` / selection change
- The `highlight-toolbar` HTML div and its show/hide logic
- How rangy.js is loaded and initialized
- The `QUOTE_SELECTED` message sent to React Native

- [ ] **Step 2: Test highlighting on the iOS Simulator**

Run the app on the simulator. Navigate to a devotional reading. Long-press text to select it. Document:
- Does the native iOS copy/paste menu appear?
- Does the custom 5-color toolbar appear?
- Do they conflict/overlap?
- Does tapping a color button work?
- Does the highlight persist after navigating away and back?

```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim_highlight_test.png && sips -Z 1000 /tmp/sim_highlight_test.png
```

- [ ] **Step 3: Fix the selection conflict**

Common fixes for iOS WebView text selection conflict:
- Add `-webkit-touch-callout: none` to the WebView's body CSS to suppress the native callout
- Add `document.addEventListener('selectionchange', ...)` instead of relying on `touchend`
- Ensure the custom toolbar uses `e.preventDefault()` on touchend to stop the native menu
- Set `webView.allowsLinkPreview = false` if link previews are interfering

Apply the minimal fix that resolves the conflict without breaking text selection.

- [ ] **Step 4: Verify highlights persist**

After highlighting text:
1. Navigate away from reading screen
2. Navigate back
3. Verify highlight is visually restored via rangy deserialization
4. Force-quit the app (stop Metro), relaunch
5. Navigate to the same reading
6. Verify highlight is still present

- [ ] **Step 5: Commit**

```bash
git add src/components/reading/DevotionalWebView.tsx
git commit -m "fix: resolve iOS text selection conflict with highlight toolbar"
```

---

## Task 2: Bookmark Toast Confirmation

**Files:**
- Modify: `src/app/(tabs)/(today)/reading.tsx`
- Modify: `src/components/reading/DevotionalContent.tsx`

- [ ] **Step 1: Read the bookmark toggle implementation**

Read `src/components/reading/DevotionalContent.tsx` lines 170-184 and the `handleToggleBookmark` function in `reading.tsx`. Understand:
- How `isCurrentDayBookmarked` is computed
- How `addBookmark()` / `removeBookmark()` are called
- What haptic feedback fires

- [ ] **Step 2: Add toast on bookmark save**

In `reading.tsx`, after `addBookmark()` succeeds, show a brief toast: "Saved to your library" with a "View" link.

Use the existing toast pattern in the app (search for `Toast` or `showToast` in the codebase). If no toast system exists, use a simple `Animated.View` that fades in at the bottom of the screen for 2.5 seconds.

The toast should include:
- Bookmark icon (filled, gold)
- Text: "Saved to your library"
- "View" link that navigates to the Saved screen: `router.push('/(tabs)/(you)/saved')`

Toast should NOT show on bookmark removal — only on save.

- [ ] **Step 2b: Fix double haptic bug**

There are currently TWO haptic calls — one in `DevotionalContent.tsx` line 97 (`handleBookmarkPress`) and one in `reading.tsx` line 472 (`handleToggleBookmark`). Remove the haptic from `reading.tsx`'s `handleToggleBookmark` (delete the `Haptics.impactAsync` line ~472). The single haptic in DevotionalContent is the correct location since it fires on the press, not the state change.

- [ ] **Step 3: Add bookmark icon spring animation**

In `DevotionalContent.tsx`, wrap the BookmarkSimpleIcon in an `Animated.View`. On bookmark toggle:
- Scale spring: 0.8 → 1.0, critically-damped (~200ms)
- Use `withSpring(1, { damping: 20, stiffness: 300 })` in reanimated
- Add `withSpring` to the existing reanimated import: `import { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing } from 'react-native-reanimated'`
- Change existing haptic from `Haptics.ImpactFeedbackStyle.Light` to `Haptics.ImpactFeedbackStyle.Medium` to match spec

```typescript
const bookmarkScale = useSharedValue(1);

const handleBookmarkPress = () => {
  bookmarkScale.value = 0.8;
  bookmarkScale.value = withSpring(1, { damping: 20, stiffness: 300 });
  onToggleBookmark();
};

const bookmarkAnimStyle = useAnimatedStyle(() => ({
  transform: [{ scale: bookmarkScale.value }],
}));
```

- [ ] **Step 4: Verify visually**

Take screenshot after tapping bookmark icon. Verify:
- Icon fills to gold
- Spring animation plays (no bounce)
- Toast appears briefly
- Toast disappears after ~2.5s

- [ ] **Step 5: Commit**

```bash
git add src/app/(tabs)/(today)/reading.tsx src/components/reading/DevotionalContent.tsx
git commit -m "feat: add bookmark toast confirmation and spring animation"
```

---

## Task 3: Study Method Sheet

**Files:**
- Create: `src/components/reading/StudyMethodSheet.tsx`
- Modify: `src/components/reading/DevotionalContent.tsx`
- Modify: `src/app/(tabs)/(today)/reading.tsx`

- [ ] **Step 1: Read the study methods data**

Read `src/constants/bible-study-methods.ts`. Note the shape:
```typescript
{
  id: string,
  name: string,
  description: string,        // 1-sentence summary
  emotionalTexture: string,   // emotional feel
  promptModifier: string,     // AI prompt (don't show to user)
  idealGenres: string[],
  difficulty: 'accessible' | 'intermediate' | 'advanced'
}
```

- [ ] **Step 2: Create StudyMethodSheet component**

Create `src/components/reading/StudyMethodSheet.tsx`:

```typescript
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useTheme } from '@/lib/theme';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';

interface Props {
  methodId: string | undefined;
  sheetRef: React.RefObject<BottomSheet>;
}

export function StudyMethodSheet({ methodId, sheetRef }: Props) {
  const { colors } = useTheme();
  const method = methodId ? BIBLE_STUDY_METHODS[methodId] : null;
  const snapPoints = useMemo(() => ['40%'], []);

  if (!method) return null;

  const difficultyDots = method.difficulty === 'accessible' ? 1
    : method.difficulty === 'intermediate' ? 2 : 3;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
    >
      <BottomSheetView style={styles.content}>
        <Text style={[styles.name, { color: colors.text, fontFamily: FontFamily.display }]}>
          {method.name}
        </Text>
        <View style={styles.difficulty}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, {
              backgroundColor: i <= difficultyDots ? colors.accent : colors.textDim
            }]} />
          ))}
        </View>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {method.description} {method.emotionalTexture}
        </Text>
        <Text style={[styles.sectionLabel, { color: colors.accent }]}>
          WHAT TO EXPECT
        </Text>
        <View style={styles.bulletList}>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>
            • {method.difficulty === 'accessible'
              ? '5-10 minutes — gentle and approachable'
              : method.difficulty === 'intermediate'
              ? '10-20 minutes of focused reflection'
              : '20-30 minutes of intensive study'}
          </Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>
            • Best with {method.idealGenres?.slice(0, 2).join(' and ')} passages
          </Text>
          <Text style={[styles.bullet, { color: colors.textMuted }]}>
            • {method.emotionalTexture}
          </Text>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
```

Adapt to match existing component patterns in the codebase (check how other bottom sheets are styled — look at `PremiumFeatureSheet.tsx`, `CreateFolderSheet.tsx`).

- [ ] **Step 3: Replace badge with tappable row in DevotionalContent**

In `src/components/reading/DevotionalContent.tsx`, find the study method badge (lines ~137-143). Replace with:

```typescript
<TouchableOpacity
  style={styles.methodRow}
  onPress={() => onStudyMethodPress?.(day.studyMethod)}
  activeOpacity={0.6}
>
  <Text style={styles.methodName}>
    {BIBLE_STUDY_METHODS[day.studyMethod]?.name}
  </Text>
  <CaretRightIcon size={14} color={colors.textMuted} weight="light" />
</TouchableOpacity>
```

Style the row: `flexDirection: 'row'`, `alignItems: 'center'`, `justifyContent: 'space-between'`, subtle background `rgba(255,255,255,0.03)`, `borderRadius: 8`, `padding: 10 12`.

- [ ] **Step 4: Wire the sheet in reading.tsx**

In `reading.tsx`:
1. Import `StudyMethodSheet`
2. Create a ref: `const studyMethodRef = useRef<BottomSheet>(null)`
3. Add state for selected method: `const [selectedMethod, setSelectedMethod] = useState<string>()`
4. Pass `onStudyMethodPress` callback to DevotionalContent that sets the method and opens the sheet
5. Render `<StudyMethodSheet methodId={selectedMethod} sheetRef={studyMethodRef} />` at the bottom of the screen
6. Enforce one-sheet-at-a-time: before expanding `studyMethodRef`, close the audio player sheet by calling `audioPlayerRef.current?.close()` (find the existing audio player sheet ref in reading.tsx). Example:
   ```typescript
   const handleStudyMethodPress = (methodId: string) => {
     audioPlayerRef.current?.close(); // dismiss audio player first
     setSelectedMethod(methodId);
     studyMethodRef.current?.expand();
   };
   ```

- [ ] **Step 5: Verify visually**

Navigate to a devotional reading. Verify:
- Method row shows below the title with a chevron
- Tapping opens the bottom sheet at 40%
- Sheet shows method name, difficulty dots, description
- Swipe down dismisses
- Tap outside dismisses

- [ ] **Step 6: Commit**

```bash
git add src/components/reading/StudyMethodSheet.tsx src/components/reading/DevotionalContent.tsx src/app/(tabs)/(today)/reading.tsx
git commit -m "feat: add study method tooltip sheet with tappable row"
```

---

## Task 4: Saved Screen

**Files:**
- Create: `src/app/(tabs)/(you)/saved.tsx`
- Modify: `src/app/(tabs)/(you)/index.tsx`

- [ ] **Step 1: Read existing screens for patterns**

Read these files to understand the existing patterns:
- `src/app/(tabs)/(you)/saved-passages.tsx` — how bookmarks are displayed
- `src/app/(tabs)/(today)/highlights.tsx` — how highlights are displayed
- `src/app/(tabs)/(you)/past-devotionals.tsx` — how series are displayed
- `src/app/(tabs)/(you)/index.tsx` — how navigation links are rendered

- [ ] **Step 2: Create the Saved screen**

Create `src/app/(tabs)/(you)/saved.tsx` with three sections:

**Section 1: Highlights**
- Section header: "HIGHLIGHTS" (small uppercase label)
- Show most recent 3 highlights
- Each: 4px color bar (left edge) + highlighted text (serif italic) + source/date caption
- "See All ›" link → navigates to existing highlights screen

**Section 2: Bookmarked Passages**
- Section header: "BOOKMARKED PASSAGES"
- Show most recent 2 bookmarks
- Each: scripture reference (serif, prominent) + source devotional caption
- "See All ›" link → navigates to existing saved-passages screen

**Section 3: Completed Series**
- Section header: "COMPLETED SERIES"
- Show most recent 2 completed series
- Each: title + progress bar + "X of Y" + completion percentage
- "See All ›" link → navigates to past-devotionals screen

Use `ScrollView` (not FlatList — sections have different shapes). Use `useSafeAreaInsets` for bottom padding. Match the app's dark theme with gold accents.

**Staggered fade-in animation (first load only):**

Use reanimated's `FadeIn` entering animation with staggered delays. This avoids hooks-in-loop issues:

```typescript
import Animated, { FadeIn } from 'react-native-reanimated';

const hasAnimated = useRef(false);

// In render, wrap each section item:
<Animated.View
  entering={hasAnimated.current ? undefined : FadeIn.delay(index * 30).duration(300)}
>
  {/* section content */}
</Animated.View>

// After first render:
useEffect(() => { hasAnimated.current = true; }, []);
```

The `entering` prop only fires on mount. Setting `hasAnimated` after first render ensures revisits skip animation. `index` is the item's position across all sections (0, 1, 2... for highlights, then continuing for bookmarks, then series).

**Empty states:** If a section has zero items, show the instructional empty state from the spec (e.g., "Your highlighted passages will appear here. Try long-pressing any passage while reading.").

- [ ] **Step 3: Add navigation from You tab**

In `src/app/(tabs)/(you)/index.tsx`, add a navigation link to the Saved screen. Look for existing links like "Past Series" and follow the same pattern. Place "Saved" prominently — above or alongside "Past Series."

- [ ] **Step 4: Implement jump-to-source**

When a user taps a highlight or bookmark on the Saved screen:
1. Call `setCurrentDevotional(item.devotionalId)` on the store
2. Navigate: `router.push('/(tabs)/(today)/reading')`
3. Pass the day number and highlight ID as params if needed

For the highlight pulse on arrival (spec requirement — Motion Principle #7):
1. Pass `focusHighlightId` as a search param: `router.push({ pathname: '/(tabs)/(today)/reading', params: { focusHighlightId: item.id } })`
2. In `reading.tsx`, read the param: `const { focusHighlightId } = useLocalSearchParams()`
3. After WebView loads, inject JS to pulse the highlight:
   ```javascript
   const highlightEl = document.querySelector(`[data-highlight-id="${focusHighlightId}"]`);
   if (highlightEl) {
     highlightEl.style.transition = 'opacity 300ms';
     highlightEl.style.opacity = '0.5';
     setTimeout(() => { highlightEl.style.opacity = '1'; }, 50);
   }
   ```
4. If rangy doesn't use `data-highlight-id`, adapt the selector to match the actual highlight DOM structure (inspect via Safari Web Inspector on device).

Implement basic navigation first, then add the pulse. If the WebView highlight DOM structure makes the pulse impractical, note it as a follow-up.

- [ ] **Step 5: Verify visually**

Navigate to You tab → Saved. Verify:
- All three sections render with correct data
- Empty states show for sections with no data
- "See All" links navigate to correct screens
- Tapping a highlight navigates to the reading screen for that day
- Staggered fade-in animation on first load (30ms delay, 300ms duration)
- Back button returns to Saved

- [ ] **Step 6: Commit**

```bash
git add src/app/(tabs)/(you)/saved.tsx src/app/(tabs)/(you)/index.tsx
git commit -m "feat: add sectioned Saved screen with highlights, bookmarks, series"
```

---

## Task 5: "Remember This?" Card

**Files:**
- Create: `src/components/home/RememberThisCard.tsx`
- Modify: `src/app/(tabs)/(today)/index.tsx`
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Add getRandomHighlight selector to store**

In `src/lib/store.ts`, add a selector that returns a random highlight. Use a daily seed so the same highlight shows all day:

```typescript
getRandomHighlight: () => {
  const highlights = get().highlights;
  if (highlights.length === 0) return null;
  // Use date as seed for consistent daily selection
  const today = new Date().toISOString().split('T')[0];
  const seed = today.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const index = seed % highlights.length;
  return highlights[index];
},
```

- [ ] **Step 2: Create RememberThisCard component**

Create `src/components/home/RememberThisCard.tsx`:

- Only renders if `getRandomHighlight()` returns non-null
- Card with gold border (`borderColor: colors.accent + '40'`)
- "REMEMBER THIS?" label (10px uppercase, gold)
- Highlighted text in serif italic with the highlight's color as a 3px left border
- Source: "From Day X · Series Title · Xd ago"
- On tap: jump-to-source (setCurrentDevotional → navigate to reading)
- Fade-in animation: opacity 0 → 1 with `withTiming(1, { duration: 400 })` — no spring needed for opacity-only

- [ ] **Step 3: Add to Home tab**

In `src/app/(tabs)/(today)/index.tsx`, import and render `<RememberThisCard />` after the Daily Bridge text section and before the Notification Cards (check-in/evening prompts). This positions the reflective card between the greeting and the action prompts. It self-hides when no highlights exist.

- [ ] **Step 4: Verify visually**

Navigate to Home tab. If highlights exist, verify:
- Card renders with correct highlight text
- Gold border, "REMEMBER THIS?" label, serif italic text
- Highlight color shows as left border on the text
- Fade-in animation plays on tab load (no translate, no scale)
- Tapping navigates to the source reading

If no highlights exist, verify nothing renders (no empty state for this card).

- [ ] **Step 5: Commit**

```bash
git add src/components/home/RememberThisCard.tsx src/app/(tabs)/(today)/index.tsx src/lib/store.ts
git commit -m "feat: add Remember This? resurfacing card on Home tab"
```

---

## Task 6: Your Series on Home + Past Series Tabs

**Files:**
- Create: `src/components/home/YourSeriesSection.tsx`
- Modify: `src/app/(tabs)/(today)/index.tsx`
- Modify: `src/app/(tabs)/(you)/past-devotionals.tsx`

- [ ] **Step 1: Create YourSeriesSection component**

Create `src/components/home/YourSeriesSection.tsx`:

- Shows 1-2 most recent series (sorted by `createdAt` descending)
- Each card: title (serif), "Day X of Y", progress bar (gold fill)
- "See All Series ›" link → navigates to past-devotionals
- Only renders if user has ≥1 devotional
- Compact design — cards should be small, not dominating the home screen

- [ ] **Step 2: Add to Home tab**

In `src/app/(tabs)/(today)/index.tsx`, render `<YourSeriesSection />` below the main devotional card, above the "New Series" button area.

- [ ] **Step 3: Add In Progress / Completed tabs to past-devotionals**

In `src/app/(tabs)/(you)/past-devotionals.tsx`:
1. Add a segment control at the top: "In Progress" | "Completed"
2. State: `const [tab, setTab] = useState<'progress' | 'completed'>('progress')`
3. Filter devotionals: "Completed" = `item.days.filter(d => d.isRead).length >= item.totalDays`, "In Progress" = everything else. Use `days.filter(d => d.isRead).length` (not `currentDay`) because users may skip days.
4. Use the same segment control pattern as the Journal tab (Reflections | Notebook) — check `src/app/(tabs)/(journal)/index.tsx` for the component

- [ ] **Step 4: Verify visually**

Home tab: Verify series section shows with correct data and progress.
Past devotionals: Verify segment control filters between in-progress and completed.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/YourSeriesSection.tsx src/app/(tabs)/(today)/index.tsx src/app/(tabs)/(you)/past-devotionals.tsx
git commit -m "feat: add Your Series section on Home and In Progress/Completed tabs"
```

---

## Task 7: Build Verification & TestFlight Prep

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Expected: 19 (pre-existing). No new errors.

- [ ] **Step 2: Build the app**

```bash
npx expo run:ios --device "iPhone 17 Pro"
```

Expected: Build Succeeded, 0 errors.

- [ ] **Step 3: Full visual walkthrough**

Screenshot each screen:
1. Home tab — verify "Remember This?" card and "Your Series" section
2. Reading screen — verify tappable study method row
3. Tap method row — verify StudyMethodSheet opens at 40%
4. Tap bookmark — verify toast + spring animation
5. Long-press text — verify highlight toolbar (if debug fix applied)
6. You tab — verify "Saved" navigation link
7. Saved screen — verify all three sections with data
8. Past devotionals — verify In Progress / Completed tabs

```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim_final_verify.png && sips -Z 1000 /tmp/sim_final_verify.png
```

- [ ] **Step 4: Commit all changes**

Stage specific files (not `git add -A`). Create a summary commit if any loose changes remain.

- [ ] **Step 5: Note TestFlight build number**

The next TestFlight build should include all Personal Study Library changes. Note the build number for the "What to Test" changelog.
