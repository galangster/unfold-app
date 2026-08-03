Build 243 fixes the bug where tapping the next day in a series opened the previous day's reading instead.

What changed:
- Tapping Day 2 (or any next day) no longer silently opens the day before it. The app was losing track of the date a series started, which made it fall back to "you already read today's" and send you back a day, even when the next reading was ready and you were entitled to it.
- A day that genuinely is not available yet now reads "Tomorrow" and is not tappable, instead of being labeled "Current" and doing nothing useful when tapped. If a day is missing for any other reason, it is not mislabeled as Tomorrow.
- Series you already have are repaired automatically the first time you open this build. You do not need to start a new series or reinstall.

What to test:
1. Open a series you are partway through. Read the current day, then tap the next day in the list. It must either open that day or show it as Tomorrow and refuse the tap. It must never open a day you have already read.
2. If you are behind by a day or more, confirm the next reading opens instead of sending you backwards.
3. In My Devotionals, open a series and check the day list. Read days show a date, the day you can read now is marked Current, and a day that is not ready yet reads Tomorrow.
4. After updating, confirm the series you were reading is still there and still on the right day.
5. Read a day, complete it, and confirm the next day becomes available the following calendar day rather than immediately.
