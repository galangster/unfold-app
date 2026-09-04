# Build 259 (1.1.3) - usability sweep

Same content as build 258, re-cut as marketing version 1.1.3 for App Store review. Everything in build 257, plus 65 findings from an eight-surface usability review, fixed across three lanes and a design-engineering review pass. Full report: the "Unfold Usability Sweep" artifact.

## Fixed

### Built, then never wired in
- **Bible home is reachable** - the tab jumps into the reader only on the very first open. After that it shows the book grid, a Continue card, and search.
- **Bible search lands on the verse** - tapping a result scrolls to and flashes the verse instead of dropping you at verse 1.
- **Companion starters know today's reading** - "Walk me through today's reading" style chips now appear when a series is active.
- **Drawer edge-swipe** - swiping from the left edge opens the conversation drawer.
- **Onboarding progress bar** - a thin bar shows how far along you are; hidden on the paywall and celebration.
- **Share on a note** - Share is in the note's "..." menu and available to VoiceOver.

### Gesture is no longer the only door
- Reveal has a "Reveal" button and a VoiceOver action. The series recap exposes next and previous actions.
- Past series have a visible delete button; deleting the series on your Today tab says so.
- Subfolder chevrons are their own tap target. Note rows expose open, share, move and delete actions.
- Chapter swipe peeks its edge arrow once on the first chapter load.

### The app answers instead of staying silent
- Swiping past the locked day shows "Tomorrow's reading unlocks after midnight". Tapping a locked day pulses and names when it unlocks.
- SOAP journaling shows Saving / Saved from the real save, not a static caption.
- The generation error screen shows a real icon. A failed recap share shows an alert. The "Go home" link stays during the notification nudge.
- The "not ready yet" screen leads with Check for Day N; Prepare Remaining Readings appears only after a check.
- Check-ins have a back button. The card stack shows "+N more". Companion shows the free quota before it is spent.

### Rules you feel are now explained
- Freeze copy is honest for free readers. The weekly grace day has its own row. Writing Style says it applies from now on.
- The streak strip draws real read days when it has them.

### Large text and accessibility
- The devotional body follows system Dynamic Type (capped at 1.6x). Pills and segmented controls no longer clip.
- Roles and states added to chips, mood picker, verses, toggles, tabs, progress bars, collapsibles, You-tab rows, series day rows, scripture references, the celebration overlay, and the companion orb.
- Muted text no longer stacks extra opacity in evening wind-down and the day picker.

## What to Test

- [ ] Open the Bible tab twice: first open lands in the reader, second shows the home. Search "shepherd", tap a result, confirm the verse flashes.
- [ ] Complete a reading, swipe forward: toast appears. Open the day picker, tap a locked day: caption pulses.
- [ ] Onboarding: progress bar visible on question steps, hidden on paywall. Tap during the "42%" reflection wait: text fast-forwards.
- [ ] VoiceOver: reveal screen "Reveal" button, recap next/previous actions, note row actions, past-series delete action.
- [ ] Settings: Writing Style caption; midday/evening toggles announce as switches. You tab "Daily Reminders" scrolls Settings to that section.
- [ ] iOS Larger Text at 150%: devotional body scales; folder chips and journal segment do not clip.
- [ ] Companion with a free profile: "5 free messages today" shows before the first message.
