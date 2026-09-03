# 1.1.0 (build 253)

First release since 1.0 (build 251). Ninety commits, almost entirely
JavaScript — no native code changed except the version itself.

## What's New (App Store)

Journal and reflections
- Your journal now keeps one entry per day, and both of your devices agree on which entry that is. Entries that were split across devices are merged back together.
- Reflection questions save against the question you answered, so your responses stay attached to the right prompt.
- The reflections row and badge on the home screen now point at the day you are actually reflecting on.
- Entries restored from sync open normally instead of failing.

Notes
- Search now matches the words you wrote instead of the formatting behind them.
- Notes you were still typing save correctly when you leave the app or switch screens.
- Restoring a note with Undo removes it from Recently Deleted.
- Notes edited on two devices resolve to the newer version, and an open note refreshes to match.
- Moving a note out of a folder, or a folder to the top level, now syncs.
- Older notes with special characters display correctly.

Ask and AI
- When you reach the daily AI limit, Unfold now tells you plainly and says roughly when it frees up, instead of showing a generic error.
- Verse references in replies render cleanly, with no stray asterisks or broken spacing.
- A reply that was interrupted looks the same on every device.
- The searching indicator clears as soon as the answer starts.

Reading
- Scrolling in the reader is smoother, and changing text size or theme no longer reloads the page.
- The "not ready yet" screen counts only the days that can actually be opened.
- Progress updates while a devotional is being written arrive faster.

Today and evening
- The evening wind-down uses today's midday check-in.
- The wind-down spinner now says what it is waiting for.

Streaks and subscription
- Streak freezes are earned reliably, including when the app cannot reach the subscription service at launch.
- If a subscription lapses, premium theme accents revert correctly.
- Subscription prices are never shown as placeholder amounts while they are still loading, and the subscribe button is visibly dimmed while it cannot be tapped.

Privacy and data
- "Reset all data" now asks Unfold's servers to delete your synced data as well as wiping the device, and it removes what it missed before: your profile photo, exported workbook PDFs, saved share cards, cached audio, widget data and every scheduled reminder.

Reliability
- If the app crashes on launch repeatedly, it now offers a way out instead of crashing again.
- Links opened into Unfold from outside the app are validated before they open anything.
- Onboarding numbers are no longer clipped at the top.
- Faster launch and a smaller download.

## What to Test

- [ ] Settings shows "Version 1.1.0". This is the whole point of the build; 252 said 1.0.0.
- [ ] Long-press the home screen, add each of the three widgets, confirm all render.
- [ ] Journal on two devices on the same day, confirm one merged entry.
- [ ] Answer a reflection question, force quit, reopen, confirm the answer is attached to the right prompt.
- [ ] Search notes for a word inside bold or a heading.
- [ ] Start typing a note, switch apps, come back, confirm nothing was lost.
- [ ] Delete a note, undo, confirm it is not in Recently Deleted.
- [ ] Open the paywall. The billed amount must be the most prominent price, with Terms and Privacy both reachable.
- [ ] Let a devotional generate and watch the progress update.
- [ ] Reset all data, then confirm synced data is gone after reinstalling.
- [ ] Confirm no QA tools, debug screens or "Continue for QA" button appear anywhere.

## Release engineering note

app.json's `version` does not reach this binary. `ios/` is committed, so EAS
skips prebuild. The marketing version lives in `ios/Unfold/Info.plist`,
`ios/ExpoWidgetsTarget/Info.plist` and the four `MARKETING_VERSION` entries in
`project.pbxproj`, and all six must move together — the widget extension's
version has to equal the app's or the upload is rejected. Build numbers stay
with EAS via `appVersionSource: remote`.
