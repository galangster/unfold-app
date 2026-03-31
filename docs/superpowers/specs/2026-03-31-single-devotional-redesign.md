# Single Devotional Redesign

## Summary

Simplify the devotional experience to one active series at a time. Remove the carousel, redesign the home card for a single expanded layout, add swipe-to-delete on My Studies, and handle all edge cases around empty/preparing/complete states.

## Core Constraint

**One active devotional at a time.** Users can delete their current series and start a new one, but they cannot stack multiple in-progress devotionals.

---

## 1. Home Screen — Single Devotional Card

### What changes
- Remove `DevotionalCardStack` horizontal FlatList, snap offsets, dot pagination indicators, and multi-card opacity interpolation.
- Render a single `DevotionalCard` component directly — no wrapping stack.
- Card expands to use more vertical space (meaningful use, not just bigger).

### Card State Machine (revised)

| State | Visual | Button | Notes |
|---|---|---|---|
| **Empty (first-time)** | Existing "Unfold" character reveal animation, italic subtitle | "Begin Your First Devotional" | Brand introduction moment |
| **Empty (returning)** | Pulsing glow gradient + ember particles (same treatment as Preparing) | "Start a New Study" | Warm line: "Ready for your next study?" |
| **Preparing** (edge case) | Pulsing glow gradient, ember particles rising, large Instrument Serif single-line text with shimmer animation, progress bar synced to generation status | None — progress bar is the interaction | Only shows when cron missed and on-demand generation is in flight |
| **Unread** | Day title, scripture reference, series progress ("Day 5 of 14") | "Today's Reading" | The draw-in moment |
| **Complete-today** | `quotableLine` displayed as recall summary, muted text below: "Your next reading will be ready tomorrow morning." | "Return to Reading" | Sit-with-it state. No generation triggered. |
| **Tomorrow-locked** | Same as complete-today visually | "Return to Reading" | Internal distinction only — prevents advancing |
| **Journey-complete** | Celebration moment | "Ready for a new one?" CTA to creation flow | Prompted transition, not automatic |

**Merged states:** `in-progress` merges into `unread` — both mean "you have a day to read." The card shows progress ("Day 5 of 14") either way.

### Preparing State — Visual Details
- **Background:** Inner pulsing glow gradient within the card bounds
- **Particles:** Ember particles rising (same system used elsewhere in the app)
- **Text:** Large Instrument Serif font, single line, with AI-style shimmer/thinking animation (research needed — similar to shimmer text in AI chat apps like ChatGPT/Claude that indicate background processing)
- **Progress bar:** Synced to actual job status. Maps generation stages to percentages:
  - 0-10%: Queued (job submitted)
  - 10-70%: Generating (AI processing)
  - 70-90%: Persisting (writing to DB)
  - 90-100%: Ready (transitioning to unread state)
- Client polls job endpoint (already exists) and maps status to progress

### Complete-today State — Visual Details
- `quotableLine` from the day's content displayed prominently as a summary/recall aid
- Below the quote: "Your next reading will be ready tomorrow morning." in muted, smaller text
- "Return to Reading" button takes them back into the devotional content

---

## 2. New Series Creation — Guard

### Current behavior
"New Series" button is always visible on the home card. Tapping it goes straight to onboarding.

### New behavior
- If no active series: goes to onboarding (no change).
- If active series exists: shows native alert — "Starting a new series will end your current one. Continue?"
  - **Confirm:** Current series moves to Completed tab (see section 3 for visual treatment). User enters onboarding.
  - **Cancel:** Nothing happens.

### Series that are ended early
- Move to Completed tab in My Studies.
- **No progress bar**, no "incomplete" label, no "Day 3 of 14" guilt text.
- Shows title and date range only — same visual treatment as naturally completed series.
- The days that were generated remain accessible if they tap into the study.

---

## 3. My Studies Tab

### Swipe-to-delete
- Swipe left on a study card reveals red trash icon (same icon and pattern as journal entry deletion).
- Tap the trash icon triggers a native alert: "Delete this study?"
- Confirm deletes the study permanently.
- Three deliberate steps: swipe, tap icon, confirm alert.
- **Remove** the existing long-press delete behavior — swipe-to-delete replaces it.

### Tab behavior
- **In Progress tab:** Shows at most one item (enforced by single-devotional model). Empty state if none.
- **Completed tab:** All past studies — both finished and ended-early. Visually identical treatment.

### Visual treatment for all studies
- Title, date range, created date.
- No progress bars on completed/ended-early studies.
- Download/export button remains.

---

## 4. Edge Cases & Backend Behavior

### App opens, cron missed (no content ready)
1. Card shows **Preparing** state (shimmer, progress bar, glow).
2. App fires `generate-day` request behind the scenes (existing polling behavior).
3. Same-day guard on the on-demand endpoint stays as-is — this scenario only triggers when no generation happened today, so the guard won't block.
4. When job completes, card transitions from Preparing → Unread.

### User finishes day, same calendar day
- Card shows **Complete-today** state with `quotableLine` summary.
- "Return to Reading" button.
- "Your next reading will be ready tomorrow morning."
- No generation triggered. Pacing is intentional — one day per calendar day.

### User deletes their only series
- Home card shows **Empty (returning)** state: glow gradient + embers + "Ready for your next study?" + "Start a New Study" CTA.

### User opens onboarding while series is in progress
- Confirmation dialog first.
- Old series silently moves to Completed.
- Onboarding flow starts fresh.

### Brand new user, first time
- Home card shows **Empty (first-time)** state: existing "Unfold" character reveal animation.

---

## 5. Components Affected

| Component | Change |
|---|---|
| `DevotionalCardStack.tsx` | Remove entirely — replace with single card render |
| `DevotionalCard.tsx` | Update state machine, add complete-today summary, add returning-user empty state, enhance preparing state visuals |
| `compute-devotional-state.ts` | Merge `in-progress` into `unread`, add returning-user detection |
| `past-devotionals.tsx` (My Studies) | Add swipe-to-delete with Reanimated/Gesture Handler, remove long-press delete |
| Home screen (Today tab) | Remove carousel rendering, render single DevotionalCard directly |
| Onboarding entry points | Add confirmation dialog when active series exists |
| Zustand store | Add logic to move series to completed on replacement, enforce single-active constraint |

---

## 6. What's NOT Changing

- Onboarding flow steps and content
- Backend generation pipeline (cron fix already shipped)
- Same-day guard on the on-demand endpoint
- Devotional reading experience (the actual day content screen)
- Bible tab, Companion tab, Journal tab
- Push notifications
- Server sync behavior
