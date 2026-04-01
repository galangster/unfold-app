# Reveal Teaser Card + Personalized Push Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken auto-redirect reveal with a teaser card in the devotional card state machine, and make morning push notifications reading-state-aware.

**Architecture:** New `reveal-ready` state in `computeDevotionalState` renders a minimal teaser card. Tapping it navigates to the existing `reveal.tsx` swipe-up screen. `isRevealed` boolean on each `DevotionalDay` replaces the flaky `lastRevealShownDate` calendar gate. Push notifications get a `getNotificationContent()` function that checks reading state before composing copy.

**Tech Stack:** React Native, Zustand (persisted store with MMKV), expo-notifications, expo-blur, react-native-reanimated

---

### Task 1: Add `isRevealed` to DevotionalDay and store actions

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Add `isRevealed` field to `DevotionalDay` interface**

In `src/lib/store.ts`, find the `DevotionalDay` interface (line ~169) and add after `readAt`:

```typescript
  isRead: boolean;
  readAt?: string;
  isRevealed?: boolean;
```

- [ ] **Step 2: Add `markDayAsRevealed` to the `UnfoldState` interface**

In the `UnfoldState` interface (line ~498), add after `markDayAsRead`:

```typescript
  markDayAsRead: (devotionalId: string, dayNumber: number) => void;
  markDayAsRevealed: (devotionalId: string, dayNumber: number) => void;
```

- [ ] **Step 3: Implement `markDayAsRevealed` action**

Add after the `markDayAsRead` implementation (line ~882):

```typescript
      markDayAsRevealed: (devotionalId, dayNumber) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            devotionals: state.devotionals.map((d) =>
              d.id === devotionalId
                ? {
                    ...d,
                    updatedAt: now,
                    days: d.days.map((day) =>
                      day.dayNumber === dayNumber
                        ? { ...day, isRevealed: true, updatedAt: now }
                        : day
                    ),
                  }
                : d
            ),
          };
        }),
```

- [ ] **Step 4: Remove `lastRevealShownDate` and `setLastRevealShownDate`**

Remove from `UnfoldState` interface:
```typescript
  // DELETE these two lines:
  lastRevealShownDate: string | null;
  setLastRevealShownDate: (date: string) => void;
```

Remove from initial state (line ~746):
```typescript
  // DELETE this line:
  lastRevealShownDate: null as string | null,
```

Remove from actions (line ~1379):
```typescript
  // DELETE this line:
  setLastRevealShownDate: (date) => set({ lastRevealShownDate: date }),
```

- [ ] **Step 5: Add store migration v31 → v32**

Bump the version from 31 to 32 and add migration. Find the migration block and add:

```typescript
        // Migration from version 31 to 32: Add isRevealed to DevotionalDay, remove lastRevealShownDate
        if (version < 32) {
          try {
            for (const d of (state as any).devotionals ?? []) {
              for (const day of d.days ?? []) {
                // All read days and Day 1s are already "revealed"
                if (day.isRead || day.dayNumber === 1) {
                  day.isRevealed = true;
                }
                // Unread days stay undefined — will get the new reveal flow
              }
            }
            // Remove the old calendar-date gate
            delete (state as any).lastRevealShownDate;
            logger.log('[store] Migration v31→32: Added isRevealed, removed lastRevealShownDate');
          } catch (err) {
            console.error('[store] Migration v31→32 failed:', err);
          }
        }
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep -E "store\.ts" | head -10`
Expected: No errors in store.ts (there may be errors in reveal.tsx and index.tsx since we haven't updated those yet — that's fine)

- [ ] **Step 7: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat: add isRevealed to DevotionalDay, remove lastRevealShownDate

New markDayAsRevealed action replaces the flaky calendar-date reveal gate.
Migration v32 backfills isRevealed=true on all read days and Day 1s.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `reveal-ready` state to the state machine

**Files:**
- Modify: `src/components/home/compute-devotional-state.ts`
- Modify: `src/components/home/__tests__/compute-devotional-state.test.ts`

- [ ] **Step 1: Write failing tests for `reveal-ready` state**

Add to `src/components/home/__tests__/compute-devotional-state.test.ts`:

```typescript
  it('returns reveal-ready when day exists, unread, unrevealed, and dayNumber > 1', () => {
    const onReveal = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false, isRevealed: false }),
      daysCompleted: 1,
      progress: 14.3,
      onReveal,
    });
    expect(state.type).toBe('reveal-ready');
    if (state.type === 'reveal-ready') {
      expect(state.dayNumber).toBe(2);
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(state.totalDays).toBe(7);
      expect(state.onReveal).toBe(onReveal);
    }
  });

  it('returns unread (not reveal-ready) when day is already revealed', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false, isRevealed: true }),
      daysCompleted: 1,
    });
    expect(state.type).toBe('unread');
  });

  it('returns unread (not reveal-ready) for Day 1', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ dayNumber: 1, isRead: false, isRevealed: false }),
    });
    expect(state.type).toBe('unread');
  });

  it('tomorrow-locked takes priority over reveal-ready', () => {
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false, isRevealed: false }),
      daysCompleted: 1,
    });
    expect(state.type).toBe('tomorrow-locked');
  });
```

Also update `baseInput` to include `onReveal`:

```typescript
const baseInput: ComputeInput = {
  currentDevotional: makeDevotional(),
  currentDayData: makeDayData(),
  hasReadToday: false,
  isCatchUp: false,
  dayLabel: 'Today',
  isJourneyComplete: false,
  isPreparing: false,
  daysCompleted: 0,
  totalDays: 7,
  progress: 0,
  tomorrowTeaser: null,
  onContinue: noop,
  onCreateNew: noop,
  onReveal: noop,
  ctaText: 'Begin Your Journey',
};
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/clawd/work/unfold/app/mobile && npx jest src/components/home/__tests__/compute-devotional-state.test.ts --no-coverage 2>&1`
Expected: New tests fail (onReveal not in ComputeInput, reveal-ready not a valid state type)

- [ ] **Step 3: Add `reveal-ready` state type and `onReveal` to ComputeInput**

In `src/components/home/compute-devotional-state.ts`, add the new state variant to `DevotionalCardState`:

```typescript
  | {
      type: 'reveal-ready';
      dayData: DevotionalDay;
      dayLabel: DayLabel;
      seriesTitle: string;
      dayNumber: number;
      totalDays: number;
      onReveal: () => void;
    }
```

Add `onReveal` to `ComputeInput`:

```typescript
export interface ComputeInput {
  currentDevotional: Devotional | null;
  currentDayData: DevotionalDay | null;
  hasReadToday: boolean;
  isCatchUp: boolean;
  dayLabel: DayLabel;
  isJourneyComplete: boolean;
  isPreparing: boolean;
  daysCompleted: number;
  totalDays: number;
  progress: number;
  tomorrowTeaser: string | null;
  onContinue: () => void;
  onCreateNew: () => void;
  onReveal: () => void;
  ctaText: string;
}
```

- [ ] **Step 4: Add `reveal-ready` check to `computeDevotionalState`**

Add `onReveal` to the destructured input. Then insert this check BEFORE the existing `unread` return (the final return), AFTER the `complete-today` check:

```typescript
  // 6. Content available but not yet revealed — show teaser card
  //    Day 1 bypasses this (uses generating screen flow).
  if (!currentDayData.isRead && !currentDayData.isRevealed && currentDayData.dayNumber > 1) {
    return {
      type: 'reveal-ready',
      dayData: currentDayData,
      dayLabel,
      seriesTitle,
      dayNumber: currentDayData.dayNumber,
      totalDays,
      onReveal,
    };
  }

  // 7. Unread — content revealed, ready to read
```

Update the comment on the final return from "6." to "7.".

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/clawd/work/unfold/app/mobile && npx jest src/components/home/__tests__/compute-devotional-state.test.ts --no-coverage 2>&1`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/home/compute-devotional-state.ts src/components/home/__tests__/compute-devotional-state.test.ts
git commit -m "feat: add reveal-ready state to devotional card state machine

New state triggers when content exists, is unread, and has not been
revealed yet (Day 2+). Sits between complete-today and unread in
priority order. Includes tests for all reveal-ready scenarios.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Build the teaser card UI

**Files:**
- Modify: `src/components/home/DevotionalCard.tsx`

- [ ] **Step 1: Add `RevealReadyState` component**

Add a new function component inside `DevotionalCard.tsx`, after the existing `ReturningEmptyState` and before `MainCard`:

```typescript
function RevealReadyState({ state }: { state: Extract<DevotionalCardState, { type: 'reveal-ready' }> }) {
  const { colors, isDark } = useTheme();
  const { entering } = useAccessibleAnimation();
  const isYesterday = state.dayLabel === 'Yesterday';

  return (
    <Animated.View entering={entering(FadeIn.duration(400))}>
      <View style={[styles.revealCard, {
        backgroundColor: Platform.OS === 'ios'
          ? alpha(colors.backgroundElevated, 0.6)
          : alpha(colors.backgroundElevated, 0.85),
        borderColor: alpha(colors.accent, 0.12),
        overflow: 'hidden',
      }]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        )}

        <Text style={[styles.revealSeriesInfo, { color: colors.textMuted }]}>
          {state.seriesTitle} · Day {state.dayNumber} of {state.totalDays}
        </Text>

        <Text style={[styles.revealMessage, { color: colors.text }]}>
          {isYesterday ? 'You have an unread devotional.' : 'Your new reading is ready.'}
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={state.onReveal}
          accessibilityRole="button"
          accessibilityLabel={isYesterday ? "Catch up on yesterday's reading" : "Reveal today's devotional"}
        >
          <AccentGlow color={colors.accent} intensity="medium" active style={{ borderRadius: Radius.md }}>
            <View style={[styles.revealCta, { backgroundColor: colors.accent }]}>
              <Text style={[styles.revealCtaText, { color: colors.background }]}>
                {isYesterday ? "Catch Up on Yesterday's Reading" : "Reveal Today's Devotional"}
              </Text>
            </View>
          </AccentGlow>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 2: Add styles for the teaser card**

Add to the `StyleSheet.create` block at the bottom of the file:

```typescript
  revealCard: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing['5'],
  },
  revealSeriesInfo: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    marginBottom: Spacing['3'],
  },
  revealMessage: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 24,
    marginBottom: Spacing['5'],
  },
  revealCta: {
    paddingVertical: Spacing['3.5'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.md,
    alignItems: 'center' as const,
  },
  revealCtaText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    fontWeight: '600' as const,
  },
```

- [ ] **Step 3: Wire `reveal-ready` into the main render switch**

In the `DevotionalCard` export function, add before the MainCard render block:

```typescript
      {state.type === 'reveal-ready' && <RevealReadyState state={state} />}
```

So the full render becomes:
```typescript
      {state.type === 'empty' && <EmptyState onCreateNew={state.onCreateNew} isReturningUser={isReturningUser} />}
      {state.type === 'preparing' && <PreparingState progress={state.progress} />}
      {state.type === 'journey-complete' && (
        <JourneyCompleteState seriesTitle={state.seriesTitle} onCreateNew={state.onCreateNew} />
      )}
      {state.type === 'reveal-ready' && <RevealReadyState state={state} />}
      {(state.type === 'unread' ||
        state.type === 'complete-today' ||
        state.type === 'tomorrow-locked') && <MainCard state={state} />}
```

- [ ] **Step 4: Verify imports**

Ensure `DevotionalCard.tsx` already imports `Platform`, `StyleSheet`, `BlurView`, `alpha`, `AccentGlow`, `Radius`, `Spacing`, `FontFamily`, `useTheme`, `useAccessibleAnimation`, `TouchableOpacity`, `FadeIn`. Most should already be imported from existing code. Add any missing ones.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep "DevotionalCard" | head -10`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/home/DevotionalCard.tsx
git commit -m "feat: add RevealReadyState teaser card to DevotionalCard

Glassmorphism card showing series title + day counter with 'Reveal
Today's Devotional' CTA. Yesterday variant shows 'Catch Up on
Yesterday's Reading'. Left-aligned text, critically-damped spring.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire up `index.tsx` — remove auto-redirect, add `onReveal` callback

**Files:**
- Modify: `src/app/(tabs)/(today)/index.tsx`

- [ ] **Step 1: Remove the auto-redirect `useEffect`**

Delete the entire `useEffect` block (lines ~245-272) that checks `lastRevealShownDate` and calls `router.push('/reveal')`. The block starts with:
```typescript
  // Covers cold app open and in-app transitions
  useEffect(() => {
    if (!currentDevotional || currentDevotional.generationMode !== 'progressive') return;
```
and ends with:
```typescript
  }, [currentDevotional, router]);
```

Delete this entire block.

- [ ] **Step 2: Remove `lastRevealShownDate` import**

Find and remove any reference to `useUnfoldStore.getState().lastRevealShownDate` or imports of `setLastRevealShownDate` in this file.

- [ ] **Step 3: Add `markDayAsRevealed` to store subscriptions**

Near the top where other store actions are destructured, add:

```typescript
const markDayAsRevealed = useUnfoldStore((s) => s.markDayAsRevealed);
```

- [ ] **Step 4: Add `handleReveal` callback**

Add near the other handler functions (after `handleCreateNew`):

```typescript
  const handleReveal = useCallback(() => {
    if (!currentDevotional || !currentDayData) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/reveal',
      params: {
        devotionalId: currentDevotional.id,
        dayNumber: String(currentDayData.dayNumber),
        seriesTitle: currentDevotional.title,
        dayTitle: currentDayData.title,
        totalDays: String(currentDevotional.totalDays),
      },
    });
  }, [currentDevotional, currentDayData, router]);
```

- [ ] **Step 5: Pass `onReveal` to `computeDevotionalState`**

Update the `computeDevotionalState` call to include `onReveal`:

```typescript
  const devotionalState = computeDevotionalState({
    currentDevotional: currentDevotional ?? null,
    currentDayData,
    hasReadToday,
    isCatchUp,
    dayLabel: getReadingDayLabel(),
    isJourneyComplete,
    isPreparing: !hasReadToday && (isPreparingCurrentDay || (!currentDayData && !!currentDevotional)),
    daysCompleted,
    totalDays: currentDevotional?.totalDays ?? 0,
    progress: progressPercent,
    tomorrowTeaser: homeTomorrowTeaser,
    onContinue: handleContinueReading,
    onCreateNew: handleCreateNew,
    onReveal: handleReveal,
    ctaText: getCtaText(),
  });
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep "index\.tsx" | head -10`
Expected: No errors in index.tsx

- [ ] **Step 7: Commit**

```bash
git add src/app/\(tabs\)/\(today\)/index.tsx
git commit -m "feat: wire reveal-ready state into home screen

Remove auto-redirect useEffect and lastRevealShownDate gate.
Add handleReveal callback that navigates to reveal.tsx.
Pass onReveal to computeDevotionalState.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Update `reveal.tsx` to use `markDayAsRevealed`

**Files:**
- Modify: `src/app/reveal.tsx`

- [ ] **Step 1: Replace store subscription**

Replace:
```typescript
  const setLastRevealShownDate = useUnfoldStore((s) => s.setLastRevealShownDate);
```

With:
```typescript
  const markDayAsRevealed = useUnfoldStore((s) => s.markDayAsRevealed);
```

- [ ] **Step 2: Remove the on-mount `useEffect` that set `lastRevealShownDate`**

Delete:
```typescript
  // Mark today as revealed on mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setLastRevealShownDate(today);
  }, [setLastRevealShownDate]);
```

- [ ] **Step 3: Call `markDayAsRevealed` on swipe-up completion**

In the `navigateToReading` callback (line ~137), add the `markDayAsRevealed` call before navigation:

```typescript
  const navigateToReading = useCallback(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Mark this day as revealed — teaser card won't show again
    if (devotionalId && dayNumber) {
      markDayAsRevealed(devotionalId, Number(dayNumber));
    }

    if (devotionalId) {
      setCurrentDevotional(devotionalId);
      setResumeContext({
        route: 'reading',
        devotionalId,
        dayNumber: dayNumber ? Number(dayNumber) : 1,
        dayTitle: dayTitle || undefined,
        touchedAt: new Date().toISOString(),
      });
    }
    router.replace('/(tabs)/(today)');
  }, [devotionalId, dayNumber, dayTitle, router, setCurrentDevotional, setResumeContext, markDayAsRevealed]);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep "reveal" | head -10`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/reveal.tsx
git commit -m "fix: move markDayAsRevealed to swipe-up completion

Replace setLastRevealShownDate (on mount) with markDayAsRevealed
(on swipe completion). Force-quitting during reveal now correctly
leaves isRevealed=false so teaser card shows again on next open.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Personalize push notifications

**Files:**
- Modify: `src/lib/notifications.ts`

- [ ] **Step 1: Add `getNotificationContent()` function**

Add after the existing `getTodayTeaser()` function:

```typescript
// Reading-state-aware notification content
export function getNotificationContent(): { title: string; body: string } {
  const state = useUnfoldStore.getState();
  const currentDevotional = state.devotionals.find((d) => d.id === state.currentDevotionalId);

  // No active devotional
  if (!currentDevotional) {
    return {
      title: 'Ready for something new?',
      body: 'Start your next study when you\'re ready.',
    };
  }

  const currentDay = currentDevotional.days.find(
    (d) => d.dayNumber === currentDevotional.currentDay,
  );

  // Content not generated yet
  if (!currentDay) {
    return {
      title: 'Your reading is being prepared',
      body: 'Check back soon — it\'ll be ready.',
    };
  }

  // Check if content is overdue (generated before today)
  const todayStr = new Date().toDateString();
  const isOverdue =
    !currentDay.isRead &&
    currentDay.generatedAt &&
    new Date(currentDay.generatedAt).toDateString() !== todayStr;

  if (isOverdue) {
    return {
      title: 'Pick up where you left off',
      body: `Day ${currentDay.dayNumber} of ${currentDevotional.title} is waiting for you.`,
    };
  }

  // On schedule — use content-driven notification
  if (currentDay.quotableLine) {
    const body =
      currentDay.quotableLine.length > 100
        ? currentDay.quotableLine.substring(0, 97) + '...'
        : currentDay.quotableLine;
    return { title: currentDay.title, body };
  }

  if (currentDay.scriptureReference) {
    return {
      title: currentDay.title,
      body: `Today's reading: ${currentDay.scriptureReference}`,
    };
  }

  return { title: currentDay.title, body: 'Your next reading is waiting.' };
}
```

- [ ] **Step 2: Update `scheduleDailyReminder()` to use `getNotificationContent()`**

Replace the teaser-based logic in `scheduleDailyReminder`:

```typescript
export async function scheduleDailyReminder(timeString: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    logger.log('[Notifications] Not available on web');
    return null;
  }

  await cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER);

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    logger.log('[Notifications] Permission not granted');
    return null;
  }

  const { hours, minutes } = parseTimeString(timeString);
  const { title, body } = getNotificationContent();

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.DAILY_REMINDER,
      content: { title, body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      },
    });

    logger.log(`[Notifications] Daily reminder scheduled for ${timeString} (${hours}:${minutes})`);
    logger.log(`[Notifications] Content: "${title}" — "${body.substring(0, 50)}..."`);
    return identifier;
  } catch (error) {
    logger.error('[Notifications] Failed to schedule:', error);
    return null;
  }
}
```

- [ ] **Step 3: Update `sendTestNotification()` to use `getNotificationContent()`**

Replace:
```typescript
  const teaser = getTodayTeaser();
  // ...
  content: {
    title: generateNotificationTitle(teaser),
    body: generateNotificationBody(teaser),
    sound: true,
  },
```

With:
```typescript
  const { title, body } = getNotificationContent();
  // ...
  content: { title, body, sound: true },
```

And update the log line from `teaser.quotableLine` to `body`.

- [ ] **Step 4: Remove old helper functions**

Delete `generateNotificationBody()`, `generateNotificationTitle()`, and the `NotificationTeaser` interface. Keep `getTodayTeaser()` only if it's used elsewhere — check with grep first. If only used in this file, delete it too.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep "notifications" | head -10`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications.ts
git commit -m "feat: personalize push notifications based on reading state

New getNotificationContent() checks if user is behind, on schedule,
or has no active series. Overdue users get 'Pick up where you left
off' instead of content they haven't reached yet.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full integration verify + push to GitHub

**Files:**
- All modified files from Tasks 1-6

- [ ] **Step 1: Run all tests**

Run: `cd ~/clawd/work/unfold/app/mobile && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 2: Full TypeScript check**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep -v "node_modules\|e2e/\|scripts/\|playwright" | head -20`
Expected: No errors in src/ files

- [ ] **Step 3: Push to GitHub**

```bash
cd ~/clawd/work/unfold/app/mobile && git push origin main
```

- [ ] **Step 4: Verify in simulator**

Open the app in iOS Simulator. If there's an active devotional with an unread Day 2+, the teaser card should appear instead of the auto-redirect. Tap "Reveal Today's Devotional" to verify it navigates to the reveal swipe-up screen.

Take a screenshot: `xcrun simctl io booted screenshot /tmp/reveal-card.png && sips -Z 1000 /tmp/reveal-card.png`
