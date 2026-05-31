Build 216 fixes devotional series-boundary handling for internal TestFlight QA.

What changed since build 215:
- Today and the devotional reader now stop preparing/showing days past a completed server-owned series arc.
- Sync metadata, pulled devotional content, and local storage now clamp progressive series to the canonical series boundary.
- User devotional length is treated as a new-series preference, not permission to stretch an existing server-owned progressive series.
- Added regression coverage for repaired server parent totals with no seriesArc and for stale local totalDays not dropping valid server-pulled days.

What to test:
- On the repaired "Becoming: The Self God Sees" devotional, confirm Today shows the completed journey after Day 14 and does not prepare Day 15 or Day 16.
- Open the Day 14 reader, complete/reopen it, and confirm the app does not generate or navigate into Day 15.
- Restart/sync the app and confirm over-boundary Day 15/16 content does not reappear while completed Day 14 remains readable.
- Smoke the build 215 onboarding companion-name keyboard fix: the field stays visible above the iOS keyboard and Done dismisses it.
- Smoke devotional reader preferences, Bible reader settings, saved highlights, note detail/editor, Companion drawer, Today, paywall/products, notifications, and widgets.

Source branch: mina/reader-preferences-apple-books for internal TestFlight only; not merged to main.

App Review build attachment is intentionally unchanged.