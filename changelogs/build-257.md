# Build 257 (1.1.2) - daily loop fixes

Pairs with backend `8a2fd93` (live on Railway since 2026-09-03 evening PT): pushed `currentDay` is clamped to the read chain, and the overnight "day ready" push is skipped when the app's own daily reminder is on.

## Fixed

- **"Being prepared…" now resolves on its own** - Today and the reader queued a day job and then never re-checked the server, so the card stayed until you left the tab and came back. Both now poll for the finished day every 15s (up to 10 minutes) while a due, in-series day is missing.
- **Morning reminder names the day** - the local reminder is baked into the OS at schedule time, when tomorrow's day is not on device yet, so it said "Your reading is being prepared" every morning. It now reads "Day N of <series> - Your next reading is waiting for you."
- **Device timezone on every sync push** - the server paces "one day per calendar day" on your calendar instead of America/Chicago.
- **Restored series keeps the right calendar anchor** - a series rebuilt from a pull took its start date from the first pulled day or the row's update time, which could lock a reader out of days they were owed. It now uses the server's start date.

## What to Test

- [ ] Complete today's reading, force-quit, reopen the next morning before the cron has run (or with the backend paused). Confirm the "preparing" card turns into the day within ~15s of the job finishing without leaving the Today tab.
- [ ] Open the reader on a missing day. Confirm the "isn't ready yet" screen flips to the day on its own.
- [ ] With the daily reminder on, complete a reading in the evening. Next morning: exactly one notification at reminder time, and it names the day.
- [ ] Turn the daily reminder off, complete a reading. Next morning: one server push "Day N is ready" at the preferred time.
- [ ] Reinstall or sign in on a second device mid-series. Confirm the day picker's "Tomorrow"/"Unlocks" labels match the first device.
- [ ] Regression: swipe between days, day picker locks, evening wind-down and midday check-in still target the right day.
