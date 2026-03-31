# Single Devotional Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify to one active devotional at a time — remove carousel, expand card with summary state, add swipe-to-delete on My Studies, handle all empty/preparing/complete edge cases.

**Architecture:** Remove DevotionalCardStack wrapper, render single DevotionalCard directly on the home screen. Merge `in-progress` state into `unread` in the compute function. Add swipe-to-delete using the existing Gesture.Pan() pattern from SwipeableNoteCard. Enforce single-active constraint in the Zustand store.

**Tech Stack:** React Native, Expo Router, Reanimated 3, Gesture Handler (Gesture.Pan API — NOT old Swipeable API which crashes on Fabric), Zustand, MMKV

**Important:** past-devotionals.tsx line 14 notes "Swipeable removed — old RNGH API crashes on Fabric." We MUST use the Gesture.Pan() approach from `SwipeableNoteCard.tsx`, not the deprecated Swipeable wrapper.

---

### Task 1: Update State Machine — Merge `in-progress` into `unread`

**Files:**
- Modify: `src/components/home/compute-devotional-state.ts:13-55` (type definition), `src/components/home/compute-devotional-state.ts:89-181` (compute function)

- [ ] **Step 1: Read current state types and compute logic**

Read `src/components/home/compute-devotional-state.ts` fully. Note:
- `in-progress` type (lines 25-35) carries: `devotional`, `dayData`, `progress`, `daysCompleted`, `totalDays`
- `unread` type (lines 16-24) carries: `devotional`, `dayData`, `progress`, `totalDays`
- The difference: `in-progress` has `daysCompleted` and is returned when `daysCompleted > 0` (line 157)

- [ ] **Step 2: Remove `in-progress` from the discriminated union type**

In the `DevotionalCardState` type definition (lines 13-55), remove the `in-progress` variant entirely. Add `daysCompleted` to the `unread` variant so it carries the same data:

```typescript
| {
    type: "unread";
    devotional: Devotional;
    dayData: DevotionalDay;
    progress: number;
    daysCompleted: number;
    totalDays: number;
  }
```

- [ ] **Step 3: Update compute function to return `unread` instead of `in-progress`**

In the compute function, find the branch that returns `{ type: "in-progress", ... }` (around line 157) and change it to return `{ type: "unread", ... }` with the same fields. The `unread` branch (around line 172) should also include `daysCompleted: 0`.

- [ ] **Step 4: Find and update all references to `in-progress` state type**

Run: `grep -r "in-progress\|in_progress\|inProgress" src/ --include="*.ts" --include="*.tsx" -l`

Update every switch case, type check, or conditional that handles `in-progress` to handle `unread` instead. Key files likely include:
- `DevotionalCard.tsx` (the switch on state.type around line 495)
- Any analytics or tracking code

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `in-progress` type

- [ ] **Step 6: Commit**

```bash
git add src/components/home/compute-devotional-state.ts src/components/home/DevotionalCard.tsx
git commit -m "refactor: merge in-progress state into unread in devotional card state machine"
```

---

### Task 2: Update Zustand Store — Single-Devotional Enforcement

**Files:**
- Modify: `src/lib/store.ts:493-496` (action types), `src/lib/store.ts:789-811` (implementations)

- [ ] **Step 1: Read store implementation**

Read `src/lib/store.ts` lines 480-870. Understand:
- `addDevotional` (lines 789-799): pushes to array, sets as current
- `removeDevotional` (lines 801-811): removes from array, cleans up associated data
- `devotionals` array can hold multiple

- [ ] **Step 2: Add `archiveCurrentDevotional` action**

Add a new action type and implementation that moves the current in-progress devotional to a "completed" state without showing progress indicators. This action:
1. Finds the current devotional by `currentDevotionalId`
2. Keeps it in the `devotionals` array (it stays in My Studies under Completed)
3. Sets `currentDevotionalId` to `null`
4. Does NOT set any "abandoned" or "incomplete" flag — it's just a devotional in the list

```typescript
// In action types (around line 493):
archiveCurrentDevotional: () => void;

// In implementation:
archiveCurrentDevotional: () => {
  set((state) => ({
    currentDevotionalId: null,
  }));
},
```

- [ ] **Step 3: Update `addDevotional` to enforce single-active**

Modify `addDevotional` so that if there's already a `currentDevotionalId`, it archives the current one first:

```typescript
addDevotional: (devotional) => {
  const { currentDevotionalId } = get();
  set((state) => ({
    devotionals: [...state.devotionals, devotional],
    currentDevotionalId: devotional.id,
  }));
},
```

Note: The archive step happens in the UI layer (confirmation dialog) before calling `addDevotional`, so the store action itself doesn't need to call archive. The store just enforces that `currentDevotionalId` switches to the new one.

- [ ] **Step 4: Add `isReturningUser` selector**

Add a derived selector to check if a user has ever had a devotional (for the empty state distinction):

```typescript
// Near other selectors in the store
isReturningUser: () => {
  const { devotionals } = get();
  return devotionals.length > 0;
},
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat: add archiveCurrentDevotional and isReturningUser to store"
```

---

### Task 3: Remove Carousel — Single Card on Home Screen

**Files:**
- Modify: `src/app/(tabs)/(today)/index.tsx:665-673` (where DevotionalCardStack is rendered)
- Delete references to: `src/components/home/DevotionalCardStack.tsx` (keep file for now, just stop using it)

- [ ] **Step 1: Read home screen rendering**

Read `src/app/(tabs)/(today)/index.tsx` lines 600-680. Understand:
- Line 610-623: `devotionalState` is computed
- Lines 665-673: `DevotionalCardStack` is rendered with props

- [ ] **Step 2: Replace DevotionalCardStack with single DevotionalCard**

In `src/app/(tabs)/(today)/index.tsx`, replace the `DevotionalCardStack` usage (lines 665-673) with a direct `DevotionalCard` render. Pass the computed `devotionalState` and callbacks directly:

```tsx
<DevotionalCard
  state={devotionalState}
  onContinueReading={handleContinueReading}
  onCreateNew={handleCreateNew}
/>
```

Update imports: remove `DevotionalCardStack`, add `DevotionalCard` if not already imported.

- [ ] **Step 3: Remove DevotionalCardStack import and any related state**

In the home screen file, remove:
- The `DevotionalCardStack` import
- Any state related to carousel (activeIndex, scrollX, etc.) if managed here
- The dot indicator related code if any exists in this file

- [ ] **Step 4: Verify the home screen renders with a single card**

Run the app in simulator. The Today tab should show a single devotional card without horizontal scrolling or dots.

- [ ] **Step 5: Commit**

```bash
git add src/app/(tabs)/(today)/index.tsx
git commit -m "feat: replace devotional carousel with single card on home screen"
```

---

### Task 4: Update DevotionalCard — Complete-Today State with Summary

**Files:**
- Modify: `src/components/home/DevotionalCard.tsx:278-477` (MainCard component)

- [ ] **Step 1: Read MainCard rendering for complete-today state**

Read `src/components/home/DevotionalCard.tsx` lines 278-477. Find:
- How `complete-today` is rendered (inside the MainCard switch/conditionals)
- Where CTA buttons are rendered (lines 358-371)
- How `dayData` is accessed from state

- [ ] **Step 2: Update complete-today rendering to show quotableLine**

In the MainCard component, when `state.type === 'complete-today'`, render:
1. The `quotableLine` from `state.dayData.quotableLine` — styled as a prominent recall summary (use the display font, slightly larger, with accent color or italic treatment)
2. Below it: "Your next reading will be ready tomorrow morning." in muted, smaller text
3. CTA button text: "Return to Reading" (replacing whatever the current text is)

```tsx
{state.type === 'complete-today' && state.dayData.quotableLine && (
  <Text style={styles.quotableLine}>
    {state.dayData.quotableLine}
  </Text>
)}
{state.type === 'complete-today' && (
  <Text style={styles.tomorrowNote}>
    Your next reading will be ready tomorrow morning.
  </Text>
)}
```

- [ ] **Step 3: Update tomorrow-locked to match complete-today visually**

The `tomorrow-locked` state should render identically to `complete-today` — same quotableLine, same "tomorrow morning" note, same "Return to Reading" button. These are visually identical states; the distinction is internal only.

- [ ] **Step 4: Update CTA button text for unread state**

Change the button text for the `unread` state to "Today's Reading" if it isn't already. Verify the existing button text strings in lines 358-371.

- [ ] **Step 5: Add styles for quotableLine and tomorrowNote**

```typescript
quotableLine: {
  fontFamily: 'InstrumentSerif-Regular', // or whatever the display font is — check existing styles
  fontSize: 20,
  fontStyle: 'italic',
  color: colors.textPrimary,
  textAlign: 'center',
  marginVertical: 16,
  paddingHorizontal: 16,
  lineHeight: 28,
},
tomorrowNote: {
  fontFamily: 'Inter-Regular',
  fontSize: 13,
  color: colors.textMuted,
  textAlign: 'center',
  marginTop: 8,
},
```

Adapt font names and colors to match existing design tokens in the codebase. Read other styles in the file to match conventions.

- [ ] **Step 6: Verify in simulator**

Open the app, read a devotional day, return to home. The card should show the quotable line and "Return to Reading" button.

- [ ] **Step 7: Commit**

```bash
git add src/components/home/DevotionalCard.tsx
git commit -m "feat: show quotableLine summary and tomorrow note on complete-today card"
```

---

### Task 5: Update DevotionalCard — Returning User Empty State

**Files:**
- Modify: `src/components/home/DevotionalCard.tsx:149-202` (EmptyState component)
- Reference: `src/components/EmberParticles.tsx` and `src/components/home/GoldEmberField.tsx` for particle system

- [ ] **Step 1: Read existing empty state and ember components**

Read:
- `DevotionalCard.tsx` lines 149-202 (current EmptyState with character reveal)
- `EmberParticles.tsx` lines 29-99 (particle component API)
- `GoldEmberField.tsx` lines 72-100 (gold ember field)

Note the props each component accepts and how they're used.

- [ ] **Step 2: Add `isReturningUser` prop to DevotionalCard**

Update the DevotionalCard component to accept and pass through `isReturningUser` boolean. This comes from the store selector added in Task 2.

- [ ] **Step 3: Create returning-user empty state variant**

In the EmptyState component (or as a new sibling component), add a branch for returning users:

```tsx
if (isReturningUser) {
  return (
    <View style={styles.emptyCardContainer}>
      {/* Pulsing glow gradient background — reuse or adapt from preparing state */}
      <GoldEmberField />
      <Text style={styles.returningPrompt}>
        Ready for your next study?
      </Text>
      <Pressable style={styles.ctaButton} onPress={onCreateNew}>
        <Text style={styles.ctaButtonText}>Start a New Study</Text>
      </Pressable>
    </View>
  );
}
```

Keep the existing character-reveal empty state for first-time users (`!isReturningUser`).

- [ ] **Step 4: Pass `isReturningUser` from home screen**

In `src/app/(tabs)/(today)/index.tsx`, get `isReturningUser` from the store and pass it to DevotionalCard:

```tsx
const isReturningUser = useDevotionalStore((s) => s.isReturningUser());
// ... pass as prop to DevotionalCard
```

- [ ] **Step 5: Verify both empty states in simulator**

Test first-time user (clear storage) and returning user (delete all devotionals). Each should show the correct empty state variant.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/DevotionalCard.tsx src/app/(tabs)/(today)/index.tsx
git commit -m "feat: add returning-user empty state with embers and 'Start a New Study' CTA"
```

---

### Task 6: New Series Confirmation Dialog

**Files:**
- Modify: `src/app/(tabs)/(today)/index.tsx:442-449` (handleCreateNew function)

- [ ] **Step 1: Read current handleCreateNew**

Read `src/app/(tabs)/(today)/index.tsx` lines 440-450. Understand how it navigates to onboarding.

- [ ] **Step 2: Add confirmation when active series exists**

Wrap the existing navigation logic in a check:

```typescript
const handleCreateNew = useCallback(() => {
  const { currentDevotionalId, archiveCurrentDevotional } = useDevotionalStore.getState();

  if (currentDevotionalId) {
    Alert.alert(
      "Start a new series?",
      "Starting a new series will end your current one.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            archiveCurrentDevotional();
            router.push("/onboarding");
          },
        },
      ]
    );
  } else {
    router.push("/onboarding");
  }
}, [router]);
```

Adapt to match existing patterns in the file (premium gating check, etc.). The premium check should happen BEFORE the archive confirmation — don't archive then block on paywall.

- [ ] **Step 3: Verify flow in simulator**

1. With active series: tap New Series → see alert → Cancel (nothing happens) → Continue (archives, opens onboarding)
2. Without active series: tap New Series → goes straight to onboarding

- [ ] **Step 4: Commit**

```bash
git add src/app/(tabs)/(today)/index.tsx
git commit -m "feat: add confirmation dialog when starting new series with active devotional"
```

---

### Task 7: My Studies — Swipe-to-Delete

**Files:**
- Modify: `src/app/(tabs)/(you)/past-devotionals.tsx:200-343` (DevotionalCard in My Studies)
- Reference: `src/components/notebook/SwipeableNoteCard.tsx` (swipe pattern to follow)

- [ ] **Step 1: Read SwipeableNoteCard pattern thoroughly**

Read `src/components/notebook/SwipeableNoteCard.tsx` fully. Note:
- `ACTION_WIDTH = 56px`, `TOTAL_ACTIONS_WIDTH` calculation
- `Gesture.Pan()` configuration: `activeOffsetX`, `failOffsetY`
- Snap logic: velocity threshold (500) and position threshold (35%)
- `useAnimatedStyle` for translateX
- How the action button (delete) is rendered behind the card
- `withSpring` config for snapping

- [ ] **Step 2: Remove existing long-press delete from past-devotionals**

In `past-devotionals.tsx`, find the long-press handler (lines 219-236) and the `onLongPress` prop. Remove it. The comment at line 14 about Swipeable crashing on Fabric can be updated — we're using the Gesture.Pan() API now.

- [ ] **Step 3: Create SwipeableStudyCard wrapper**

Create a new component (either inline in past-devotionals.tsx or as a separate file) that wraps each study card with swipe-to-delete. Follow the SwipeableNoteCard pattern exactly but with only one action (delete):

```tsx
const DELETE_ACTION_WIDTH = 56;
const SNAP_THRESHOLD = DELETE_ACTION_WIDTH * 0.35;

function SwipeableStudyCard({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((e) => {
      translateX.value = Math.min(0, Math.max(-DELETE_ACTION_WIDTH, e.translationX));
    })
    .onEnd((e) => {
      const shouldSnap = e.velocityX < -500 || translateX.value < -SNAP_THRESHOLD;
      translateX.value = withSpring(shouldSnap ? -DELETE_ACTION_WIDTH : 0, {
        damping: 20,
        stiffness: 200,
      });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View>
      {/* Delete button behind the card */}
      <View style={[styles.deleteAction, { width: DELETE_ACTION_WIDTH }]}>
        <Pressable onPress={onDelete}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
```

Adapt imports, styles, and spring config to match existing patterns. Use critically-damped spring (no bounce): `damping: 20, stiffness: 200` (verify these produce no overshoot — adjust if needed).

- [ ] **Step 4: Wire up delete with Alert confirmation**

The `onDelete` callback should show a native Alert:

```typescript
const handleDelete = useCallback((devotionalId: string) => {
  Alert.alert(
    "Delete this study?",
    "This cannot be undone.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          removeDevotional(devotionalId);
        },
      },
    ]
  );
}, [removeDevotional]);
```

- [ ] **Step 5: Wrap each FlashList item in SwipeableStudyCard**

In the `renderItem` callback (lines 479-489), wrap the existing card in `SwipeableStudyCard`:

```tsx
renderItem={({ item }) => (
  <SwipeableStudyCard onDelete={() => handleDelete(item.id)}>
    <DevotionalStudyCard devotional={item} ... />
  </SwipeableStudyCard>
)}
```

- [ ] **Step 6: Remove progress bars from completed/archived studies**

In the My Studies card rendering, check if the study is in the Completed tab. If so, hide the progress bar and "Day X of Y" text. Show only: title, date range.

- [ ] **Step 7: Verify in simulator**

1. Swipe left on a study → red trash icon appears
2. Tap trash → Alert "Delete this study?" appears
3. Confirm → study removed from list
4. Cancel → card snaps back
5. Swipe not far enough → card snaps back

- [ ] **Step 8: Commit**

```bash
git add src/app/(tabs)/(you)/past-devotionals.tsx
git commit -m "feat: add swipe-to-delete on My Studies, remove long-press delete"
```

---

### Task 8: Enhanced Preparing State — Shimmer + Progress Bar

**Files:**
- Modify: `src/components/home/DevotionalCard.tsx:206-219` (PreparingState)
- Reference: `src/components/home/GoldEmberField.tsx`, `src/components/EmberParticles.tsx`

This is the most visual task. Read these files first to understand existing animation patterns and design tokens.

- [ ] **Step 1: Read existing PreparingState and animation patterns**

Read:
- `DevotionalCard.tsx` lines 206-219 (current preparing state — likely minimal)
- `GoldEmberField.tsx` (ember particle system)
- `EmberParticles.tsx` (ember component API)
- Check what Reanimated utilities are already imported in DevotionalCard.tsx

- [ ] **Step 2: Create shimmer text animation**

Implement shimmer text using Reanimated's `useSharedValue` + `useAnimatedStyle` with a looping `withRepeat(withTiming(...))` that shifts a linear gradient (or opacity mask) across the text. Research approach:

Option A — LinearGradient mask: Use `expo-linear-gradient` with animated `start`/`end` props
Option B — Opacity shimmer: Animate opacity between 0.4-1.0 in a smooth loop
Option C — MaskedView + animated gradient (if react-native-masked-view is available)

Choose the simplest approach that works. Option B (opacity shimmer) is the fallback if gradient masking is complex. Use Instrument Serif font, large size (~28px), single line, centered.

```tsx
const shimmerProgress = useSharedValue(0);

useEffect(() => {
  shimmerProgress.value = withRepeat(
    withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
    -1,
    true
  );
}, []);

const shimmerStyle = useAnimatedStyle(() => ({
  opacity: interpolate(shimmerProgress.value, [0, 0.5, 1], [0.4, 1, 0.4]),
}));
```

- [ ] **Step 3: Add pulsing glow gradient background**

Use the existing accent color tokens. Create a pulsing opacity animation on a radial-style glow (can approximate with a large, blurred View with background color):

```tsx
const glowProgress = useSharedValue(0);

useEffect(() => {
  glowProgress.value = withRepeat(
    withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
    -1,
    true
  );
}, []);

const glowStyle = useAnimatedStyle(() => ({
  opacity: interpolate(glowProgress.value, [0, 1], [0.15, 0.35]),
}));
```

- [ ] **Step 4: Add ember particles**

Import and render `EmberParticles` or `GoldEmberField` inside the preparing card. Check which component is more appropriate for use inside a card (vs full-screen). Use `pointerEvents="none"` so particles don't block interaction.

- [ ] **Step 5: Add progress bar synced to generation status**

The progress bar maps job status to visual progress. The DevotionalCard receives the generation status from props (passed from home screen, which polls the job endpoint).

```tsx
interface PreparingStateProps {
  progress: number; // 0-1, mapped from job status
}

// Progress bar component
<View style={styles.progressBarTrack}>
  <Animated.View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
</View>
```

Styles:
```typescript
progressBarTrack: {
  height: 2,
  backgroundColor: 'rgba(255,255,255,0.1)',
  borderRadius: 1,
  marginTop: 24,
  marginHorizontal: 32,
  overflow: 'hidden',
},
progressBarFill: {
  height: '100%',
  backgroundColor: colors.accent,
  borderRadius: 1,
},
```

- [ ] **Step 6: Wire progress from home screen**

In `src/app/(tabs)/(today)/index.tsx`, when the devotional state is `preparing`, pass the generation job progress. Check the generation polling in `src/lib/generation-api.ts` — the job status object has a `status` field. Map it:

```typescript
function mapJobStatusToProgress(status: string | null): number {
  switch (status) {
    case 'pending': return 0.05;
    case 'processing': return 0.4;
    case 'complete': return 1.0;
    default: return 0;
  }
}
```

Note: This gives coarse progress (3 steps). For smoother progress, animate between these values using `withTiming`. The visual effect of the bar steadily filling (even if the actual status is coarse) makes it feel responsive.

- [ ] **Step 7: Verify in simulator**

Trigger the preparing state (can temporarily force it in compute-devotional-state for testing). Verify:
- Shimmer text animation loops smoothly
- Glow pulses subtly
- Ember particles rise
- Progress bar fills based on status

- [ ] **Step 8: Commit**

```bash
git add src/components/home/DevotionalCard.tsx src/app/(tabs)/(today)/index.tsx
git commit -m "feat: enhanced preparing state with shimmer text, glow, embers, and progress bar"
```

---

### Task 9: Cleanup — Remove DevotionalCardStack

**Files:**
- Delete: `src/components/home/DevotionalCardStack.tsx`

- [ ] **Step 1: Verify DevotionalCardStack is not imported anywhere**

Run: `grep -r "DevotionalCardStack" src/ --include="*.ts" --include="*.tsx"`

Should return zero results (we stopped importing it in Task 3). If any references remain, update them.

- [ ] **Step 2: Delete the file**

```bash
rm src/components/home/DevotionalCardStack.tsx
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused DevotionalCardStack component"
```

---

### Task 10: Full Integration Test

- [ ] **Step 1: Test single-devotional flow end-to-end**

In the simulator, walk through the complete flow:
1. Fresh app (clear storage) → see first-time empty state with "Unfold" reveal
2. Create a devotional → onboarding → generating → card shows unread
3. Read the day → card shows complete-today with quotableLine + "Return to Reading" + tomorrow note
4. Tap "Return to Reading" → goes back into the day content
5. Check My Studies → "In Progress" tab shows 1 item

- [ ] **Step 2: Test new series replacement**

1. Tap New Series → see confirmation alert
2. Cancel → nothing happens
3. Tap New Series → Continue → old series archived → onboarding opens
4. Check My Studies → old series in "Completed" tab (no progress bar, just title + date)

- [ ] **Step 3: Test swipe-to-delete**

1. Go to My Studies → swipe left on any study
2. Red trash icon appears → tap it → alert appears
3. Cancel → card snaps back
4. Swipe again → tap → Delete → study removed

- [ ] **Step 4: Test returning user empty state**

1. Delete all studies via My Studies
2. Go to Today tab → see returning empty state (embers + "Ready for your next study?" + "Start a New Study")

- [ ] **Step 5: Take screenshots and verify visually**

Capture simulator screenshots at each key state. Resize with `sips -Z 1000`.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: verify single devotional redesign end-to-end"
```
