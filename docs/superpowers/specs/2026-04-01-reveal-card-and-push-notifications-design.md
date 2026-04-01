# Reveal Teaser Card + Personalized Push Notifications

## Problem

Two issues with the current daily devotional experience:

1. **Broken reveal gate.** The reveal screen uses `lastRevealShownDate` (a per-calendar-day flag) to prevent re-showing. When a user catches up on yesterday's reading and advances to today's content on the same calendar day, the reveal never fires for the new day — the gate was already tripped.

2. **Generic push notifications.** The morning notification always shows the current day's title and quotable line, regardless of whether the user is behind. A user who missed yesterday gets a notification about content they haven't reached yet.

## Solution

Replace the auto-redirect reveal with a **teaser card state** in the devotional card state machine, and make push notifications **reading-state-aware**.

---

## Design

### 1. State Machine: New `reveal-ready` State

**Updated priority order** (first match wins):
```
1. empty           — no devotional
2. preparing       — content generating / no data
3. journey-complete — all days read
4. tomorrow-locked — today's reading done, next day preview
5. complete-today  — current day read, can re-read
6. reveal-ready    — NEW: content available, not yet revealed
7. unread          — content available, revealed, not yet read
```

**`reveal-ready` triggers when:**
- `currentDayData` exists
- `!currentDayData.isRead`
- `!currentDayData.isRevealed`
- `currentDayData.dayNumber > 1` (Day 1 uses its own generating flow)

**State shape:**
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

**What gets removed:**
- `lastRevealShownDate` store field and `setLastRevealShownDate` action
- The auto-redirect `useEffect` in `index.tsx` (lines 245-272) that called `router.push('/reveal')`

**What stays:**
- `reveal.tsx` screen — unchanged, navigated to from teaser card tap instead of auto-redirect

### 2. Teaser Card UI

Renders inside `DevotionalCard.tsx` when state is `reveal-ready`. Left-aligned text, minimal, builds anticipation.

```
┌──────────────────────────────────┐
│                                  │
│ Seasons Turn · Day 3 of 7        │
│                                  │
│ Your new reading is ready.       │
│                                  │
│ [ Reveal Today's Devotional ]    │
│                                  │
└──────────────────────────────────┘
```

**Styling:**
- Glassmorphism card (BlurView + semi-transparent), same as all other states
- Series title + day counter in `textMuted` at top
- "Your new reading is ready." in `FontFamily.body`, left-aligned
- CTA button: accent color with AccentGlow, same style as "Return to Reading"
- No day title, no scripture, no quotable line — saved for the reveal
- Critically-damped spring entrance (no bounce)

**Yesterday variant** (when `dayLabel === 'Yesterday'`):
- Copy: "You have an unread devotional."
- CTA: "Catch Up on Yesterday's Reading"

**Tap behavior:**
- CTA navigates to `/reveal` with params: `devotionalId`, `dayNumber`, `seriesTitle`, `dayTitle`, `totalDays`
- On reveal completion (swipe-up), `reveal.tsx` calls `markDayAsRevealed(devotionalId, dayNumber)`
- State machine re-evaluates: `isRevealed` now true, `reveal-ready` no longer matches, falls through to `unread`

### 3. Store Changes

**New field on `DevotionalDay`:**
```typescript
isRevealed?: boolean;  // defaults to undefined (treated as false)
```

**New store action:**
```typescript
markDayAsRevealed: (devotionalId: string, dayNumber: number) => void;
```
Sets `isRevealed = true` on the matching day. Same pattern as `markDayAsRead`.

**Store migration v31 to v32:**
- All existing read days: set `isRevealed = true` (already seen)
- Day 1 of any active devotional: set `isRevealed = true` (Day 1 bypasses reveal)
- Unread days: leave as `undefined` (will get new reveal flow)

**Removed from store:**
- `lastRevealShownDate: string | null`
- `setLastRevealShownDate` action

**`reveal.tsx` changes:**
- Replace `setLastRevealShownDate(today)` with `markDayAsRevealed(devotionalId, dayNumber)`
- Move the call from the mount `useEffect` to the swipe-up completion handler (when curtain is fully raised). This ensures force-quitting during the reveal leaves `isRevealed = false`, so the teaser card shows again on next open.

### 4. Push Notification Personalization

Replace `getTodayTeaser()` + `generateNotificationTitle/Body` with a single `getNotificationContent()` function that checks reading state:

| User state at notification time | Title | Body |
|---|---|---|
| On schedule, today's reading ready | Day title (e.g., "When Your Strength Runs Out") | Quotable line from today's content |
| Yesterday's reading unfinished | "Pick up where you left off" | "Day {N} of {series} is waiting for you." |
| Content still generating | "Your reading is being prepared" | "Check back soon — it'll be ready." |
| No active devotional | "Ready for something new?" | "Start your next study when you're ready." |

**Implementation:** `getNotificationContent()` reads from the store, checks `generatedAt` vs today's date (same pattern as the `isCatchUp` detection), and returns the appropriate title/body.

**Plugs into:**
- `scheduleDailyReminder()` — uses `getNotificationContent()` instead of old teaser functions
- `refreshDailyReminder()` — already re-schedules on day advance, now picks up right copy
- `sendTestNotification()` — same function for consistency

**No backend changes needed.** Notifications are local (expo-notifications), logic reads from the store.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/home/compute-devotional-state.ts` | Add `reveal-ready` state type, insert in priority order |
| `src/components/home/DevotionalCard.tsx` | New `RevealReadyState` component, render in main switch |
| `src/app/(tabs)/(today)/index.tsx` | Remove auto-redirect useEffect, add `onReveal` callback, pass to state machine |
| `src/lib/store.ts` | Add `isRevealed` to DevotionalDay, `markDayAsRevealed` action, migration v32, remove `lastRevealShownDate` |
| `src/app/reveal.tsx` | Replace `setLastRevealShownDate` with `markDayAsRevealed` |
| `src/lib/notifications.ts` | Replace `getTodayTeaser` + helpers with `getNotificationContent()` |
| `src/components/home/__tests__/compute-devotional-state.test.ts` | Add tests for `reveal-ready` state |

## Edge Cases

| Case | Behavior |
|---|---|
| Day 1 (first ever) | `isRevealed` auto-set to true, bypasses teaser card, uses generating screen flow |
| User force-quits during reveal swipe | `isRevealed` still false, teaser card shows again next open |
| Catching up on 2+ missed days | Each day shows teaser → reveal → unread → read → advance → next teaser |
| Content arrives while app is open | State machine re-evaluates (reactive), teaser card appears |
| Offline / no content yet | `preparing` state takes priority (step 2 in priority order) |
