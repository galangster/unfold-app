# Personal Study Library — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Scope:** Bookmarks, highlighting, study method tooltips, past series, resurfacing

---

## Problem

Unfold has bookmarks, highlighting, past series navigation, and 32 study method definitions — all fully implemented. Users reported them as "broken" or "missing" during dogfooding because they couldn't find them. The real problem is missing wayfinding, not missing features.

## Mental Model

**Your Spiritual Commonplace Book.** Everything a user saves, writes, or highlights flows into a personal collection. It resurfaces at the right moment. Not a database. Not a filing system. A living collection that grows with your faith.

## Architecture: Three Layers

### Layer 1: Inline Actions (During Reading)

Principle: **never interrupt the reading flow for more than 2 seconds.** Every action confirms visually and returns the user to their place.

#### Study Method Row
- Replace the static study method badge with a **tappable row**: icon + method name + chevron.
- Positioned below the reading title, above the devotional content.
- File: `src/components/reading/DevotionalContent.tsx` (lines 137-143)

#### Study Method Sheet
- **New component:** `StudyMethodSheet`
- Bottom sheet, 40% snap height. Informational only — no CTA button.
- Content: Method name (serif heading), difficulty indicator (1-3 dots), description paragraph (merged from `description` + `emotionalTexture`), "What to Expect" section (2-3 bullets).
- Data source: `src/constants/bible-study-methods.ts` (all 32 methods have the required fields)
- Dismissible by tap-outside or swipe-down.
- Must dismiss audio player sheet if open (one sheet at a time).

#### Bookmark Confirmation
- On tap: icon fills with critically-damped spring scale (0.8 → 1.0, ~200ms).
- Haptic: UIImpactFeedbackGenerator medium.
- Toast: "Saved to your library" with a "View" link that navigates to the Saved screen.
- File: `src/components/reading/DevotionalContent.tsx` (lines 170-184)

#### Highlighting Debug
- **Root cause investigation:** iOS native text selection menu likely conflicts with the custom 5-color toolbar in the WebView. This is the highest priority technical task.
- File: `src/components/reading/DevotionalWebView.tsx` (745 lines, rangy.js integration)
- Fix the selection conflict. Then ensure: haptic on selection start, color dots fade in simultaneously, selected color gets a ring indicator with spring scale.

### Layer 2: The Saved Screen

A **sectioned screen** in the You tab. Not a new tab (Journal serves creation; Saved serves retrieval). Not filter chips (content types have different shapes).

#### Navigation
- Accessible from the You tab (replace or augment existing "My Content" / "Saved Passages" navigation)
- Route: `/(tabs)/(you)/saved.tsx` (new, or refactor existing `my-content.tsx`)

#### Sections
1. **Highlights** — Each item: highlighted text with color bar (4px left edge, color-coded), source devotional + day number, date. "See All" → full highlights list.
2. **Bookmarked Passages** — Each item: scripture reference prominently, first line of text as preview, source devotional. "See All" → full bookmarks list.
3. **Completed Series** — Each item: series title, "X of Y completed", progress bar. "See All" → past-devotionals screen.

#### Visual Treatment
- Highlights: color bar (left edge) + serif italic text + caption source.
- Bookmarks: reference prominent + preview below.
- Series: title + progress bar + completion percentage.
- Same spacing grid, same typography scale, different layouts per type.

#### Jump to Source
Critical interaction — the core value of the Saved screen:
1. User taps highlight/bookmark in Saved screen
2. App sets the devotional + day as current via `setCurrentDevotional()`
3. Navigates to reading screen for that day
4. Reading loads with all highlights restored via rangy
5. WebView auto-scrolls to the highlighted passage
6. Tapped highlight briefly pulses (opacity 0.5 → 1.0, ~300ms)
7. Back button returns to Saved screen

### Layer 3: Resurfacing

#### "Remember This?" Card
- Single card on Home tab. One highlight per day.
- Selection: Random from user's highlights collection. Simple `Math.random()` — no spaced repetition algorithm needed for v1.
- Visual: Card with gold border, "REMEMBER THIS?" label, highlighted text in serif italic with the highlight's color as left border, source devotional + date below.
- Motion: Opacity-only fade with critically-damped spring (~400ms) on Home tab load. No translate, no scale.
- Tap: Navigates to source reading via jump-to-source flow.
- Only shows if user has ≥1 highlight. Otherwise, nothing renders (no empty state for this card).

#### "Your Series" on Home
- Compact section on Home tab showing in-progress + completed series.
- Shows 1-2 most recent series as cards with title + progress.
- "See All" → past-devotionals screen.
- Solves the "where do past series live?" discoverability issue.

#### Past Series Tabs
- Add "In Progress" / "Completed" segment control to existing `past-devotionals.tsx`.
- Follows Dwell's two-state model.

### Empty States

Empty states are Phase 1 priority — they are onboarding, not polish.

| Section | Heading | Instruction |
|---------|---------|-------------|
| Highlights | "Your highlighted passages will appear here." | "Try long-pressing any passage while reading to highlight it." |
| Bookmarks | "Passages that move you, saved for later." | "Tap the heart icon on any scripture block to bookmark it." |
| Series | "Your completed devotionals will live here." | "Finish your first series to see it appear." |

### What's Deferred (Not in v1)

| Feature | Reason |
|---------|--------|
| Subfolders (5 levels) | Research shows 2+ levels hurts mobile UX. Colors-as-categories is sufficient. Revisit if users request. |
| Search across all content | Not needed until users have 50+ items. |
| Monthly recap cards | Requires a month of data. Premium candidate for later. |
| Education tooltips | If the UI needs tooltips, the UI is wrong. Fix the UI. |
| Unified Library tab | A screen in You tab is sufficient. Don't burn a tab slot. |
| Tags/labels system | Future enhancement. Colors serve as lightweight categories for now. |

## Motion Principles

1. All springs critically damped. `dampingFraction: 1.0`. No bounce.
2. All animations under 400ms.
3. Bookmark icon: spring scale 0.8 → 1.0 (~200ms) + haptic.
4. "Remember This?" card: opacity-only fade (~400ms). No translate.
5. Saved screen list: staggered fade on first load only (30ms delay, 300ms duration). No re-animate on revisit.
6. Bottom sheets: critically-damped spring presentation. Swipe-down to dismiss.
7. Highlight pulse on jump-to-source: opacity 0.5 → 1.0 (~300ms).

## Bottom Sheet Hierarchy

One sheet at a time. Study Method Sheet dismisses Audio Player.

1. Audio Player (48% snap, persistent) — dismissed by:
2. Study Method Sheet (40% snap, modal) — dismissed by:
3. Highlight Color Picker (inline toolbar, not a sheet)

## Data Strategy

- All data persists via Zustand + MMKV (local only).
- IDs are UUIDs, timestamps are ISO 8601 — sync-ready for future CloudKit migration.
- If the bookmark "doesn't save" bug is an MMKV serialization issue, investigate root cause before patching to avoid migration headaches.

## Implementation Phases

### Phase 1: Debug & Verify (Day 1)
- Test bookmarks on real device — verify save/remove/persistence
- Test highlighting on real device — investigate iOS text selection conflict
- Fix any runtime bugs found
- Add toast confirmation on bookmark
- Haptic feedback audit
- Design and implement empty states for Saved sections

### Phase 2: Study Method Sheet (Day 1-2)
- Build `StudyMethodSheet` component
- Replace study method badge with tappable row in `DevotionalContent.tsx`
- Wire data from `bible-study-methods.ts`
- 40% snap, swipe-down dismiss, one-sheet-at-a-time enforcement

### Phase 3: Saved Screen (Day 2-3)
- Build sectioned Saved screen in You tab
- Highlights section with color bars
- Bookmarks section with references
- Completed Series section with progress bars
- "See All" drill-ins to existing list screens
- Jump-to-source navigation with highlight pulse
- Staggered fade-in animation

### Phase 4: Resurfacing (Day 3-4)
- "Remember This?" card on Home tab
- "Your Series" section on Home tab
- In Progress / Completed tabs on past-devotionals screen
- Ship TestFlight build, gather tester feedback

## Files Involved

| Purpose | File |
|---------|------|
| Store (bookmarks, highlights) | `src/lib/store.ts` |
| Reading screen | `src/app/(tabs)/(today)/reading.tsx` |
| Devotional content (method badge) | `src/components/reading/DevotionalContent.tsx` |
| WebView (highlighting) | `src/components/reading/DevotionalWebView.tsx` |
| Study methods data | `src/constants/bible-study-methods.ts` |
| Home tab | `src/app/(tabs)/(today)/index.tsx` |
| You tab | `src/app/(tabs)/(you)/index.tsx` |
| Existing highlights screen | `src/app/(tabs)/(today)/highlights.tsx` |
| Existing saved passages | `src/app/(tabs)/(you)/saved-passages.tsx` |
| Existing my-content | `src/app/(tabs)/(you)/my-content.tsx` |
| Existing past devotionals | `src/app/(tabs)/(you)/past-devotionals.tsx` |
| NEW: Study Method Sheet | `src/components/reading/StudyMethodSheet.tsx` |
| NEW: Saved screen | `src/app/(tabs)/(you)/saved.tsx` |
| NEW: Remember This card | `src/components/home/RememberThisCard.tsx` |
| NEW: Your Series section | `src/components/home/YourSeriesSection.tsx` |
