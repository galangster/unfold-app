# Build 73 — Stale daily reminder notification fix

## Fixed

- **Stale 8am notifications** — the daily reminder no longer fires content for devotionals you deleted. expo-notifications' DAILY trigger freezes its title/body at schedule time; without a sync mechanism, the OS kept firing old copy forever even after you deleted the devotional. Fix: new `useDailyReminderSync` hook mounted at the root layout, subscribing to a fingerprint of every field that feeds notification content and rescheduling on change.
- **"Delete Everything" leak** — cancelling OS notifications now happens *before* wiping store state, not after, so an in-flight schedule can't race against the reset and leave a ghost notification in the OS.
- **Dual scheduling authority** — Settings > reminder time no longer schedules directly; it updates store state and lets the sync hook reschedule. Removes a race between two writers of the same OS resource.

## Internal

- Centralized notification sync adopts the one-owner-per-OS-resource pattern: every write path updates state; the hook is the sole writer to the OS.
- Post-schedule stale-check handles the case where state changes during the `await scheduleDailyReminder()` (e.g., "Delete Everything" mid-flight).
- Wall-clock day ref prevents foreground reconciliation from destructively cancelling a pending 8am notification at 7:59:59am and re-scheduling it past the fire time.
- Hydration-gated first run so the pre-hydration empty store can't overwrite a good pending payload with fallback copy.
- Passive sync never prompts for notification permission — permission prompts stay on explicit user gesture (toggle).

## What to Test

- [ ] Day-of: receive your 8am reminder and verify the title/body matches your **currently active** devotional + day
- [ ] Switch devotionals in the morning → get tomorrow's 8am reminder → verify it reflects the NEW devotional, not the old one
- [ ] Delete your active devotional → get tomorrow's 8am reminder → verify it shows the "Ready for something new?" fallback copy (or nothing if no reminder is set)
- [ ] "Delete Everything" in Settings > You → confirm → wait for the next 8am tick → verify NO notification fires (everything got cancelled)
- [ ] Change reminder time in Settings → verify next day's notification fires at the new time with current content
- [ ] Toggle notifications OFF in OS Settings while app is backgrounded → foreground the app → toggle ON → verify the hook picks up the change and the next 8am notification fires
- [ ] Force-quit the app overnight → 8am fire should still work (OS-scheduled, not JS-scheduled)
- [ ] Onboarding: fresh install → allow notifications → verify first 8am reminder fires with correct content (hydration gate)
- [ ] Premium user: everything above should still work identically — this fix isn't gated by premium
