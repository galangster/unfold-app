# Build 47 — Notification Cleanup + Day Label Fix

## New
- Server push notifications now include series title, day title, and total days in payload
- Notification tap opens reveal screen with full context (no more generic/empty reveal)
- Push notification title says "Day N is ready" instead of generic "Your devotional is ready"

## Fixed
- **Day label shows "Today" instead of "Tomorrow"** after completing daily reading (was showing "Tomorrow" because old logic assumed currentDay advanced immediately)
- **Removed duplicate local notifications** — no more 3 notifications for 1 event. Server push handles delivery, local notifications removed from generating screen.
- **seriesStartDate set in generating screen** — the progressive generation flow was missing this, causing the calendar cap to be skipped entirely

## What to Test
- [ ] Start a new devotional series and complete day 1
- [ ] After completing, verify the pill says "Today · Day 1/N" (not "Tomorrow")
- [ ] Verify day 2 does NOT appear
- [ ] Background the app during generation — should get exactly 1 push notification
- [ ] Tap the push notification — should open reveal screen with series title and day title
- [ ] Next morning: verify day 2 appears via the cron
