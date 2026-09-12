# Build 281 (1.1.10)

This release includes the support and navigation fixes merged after build 280.

## Changed

- Devotional has its own series, reader, day selector, and saved-content routes.
- Today returns to the daily overview with one tap.
- Profile contains settings directly, with Support near the top.
- Reader completion, day switching, and the iOS leading-edge gesture return to the correct tab.
- Evening reflections have working exits. An unread or missing day opens the current reading or its recovery controls.
- Notification retries survive incomplete writes. Companion cards retain their full text.
- Cancelled bug reports send nothing. Rate Unfold uses the correct App Store listing.
- Explicit archive and resume choices sync across devices while reading history remains available.
- Back from new-series setup returns to Today instead of reopening earlier onboarding steps.
- The schedule editor uses the scheduler's shared weekday keys.
- The native background modes match the app configuration. No unused fetch mode is declared.

## What to test

- [ ] Open Devotional. Read a day, change days, and return to the series with Back and an edge swipe.
- [ ] Complete a reading. Confirm the series progress updates.
- [ ] Archive the current series while offline. Reconnect and pull. Confirm it stays in history and does not resume itself.
- [ ] Open a saved or historical reading. Confirm Today retains the selected current series.
- [ ] Leave a Today reader in its stack, open Bible, and tap Today once. Confirm the overview appears.
- [ ] Open Profile from a normal tab. Confirm Support and preferences are available without opening another settings screen.
- [ ] Use the largest system text size. Confirm settings rows wrap and scroll on a compact iPhone.
- [ ] Open the evening reminder. Confirm Back and closing the final thought return to Today.
- [ ] Open evening reflection before reading, including when the current day is missing. Confirm its reading action opens the correct day or recovery controls.
- [ ] Change reminder preferences and interrupt a scheduling write. Confirm a later successful update repairs the queue.
- [ ] Cancel Report a bug. Confirm nothing is sent. Check Copy Support ID and Rate Unfold.

## Release scope

The signed device credential from build 280 remains included.
Feature switches retain their production settings. This release does not authorize a separate switch activation.
