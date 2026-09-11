# Build 279 (1.1.8) - Sweep fixes on 278

Everything in build 278 (felt-tip reader highlights, one ink everywhere, reminder titles, the lighter Today, the light-mode generating screen), plus the fixes below. Build 278 stays on TestFlight for comparison; 279 is the App Store candidate.

## Fixed

- **Series deletion syncs as a tombstone** - Deleting a series now writes a tombstone the server keeps, and a pulled tombstone applies only when it is newer than the local row (last-write-wins). Deleted series no longer come back after a sync.
- **Stale async guards** - Ten screens and hooks now ignore results that arrive after the view moved on: scripture explain, scripture tap, scripture search, book and chapter navigation, devotional content, the audio player, the check-in sheet, voice input, the voice check-in sheet, and the story progress bar.
- **Trial purchase waits for config** - A purchase that lands while the server config is still loading waits up to three seconds for it before deciding the setup flow. A timeout still decides the ordinary flow.
- **Sample never resurrects beside a trial series** - A sync that carries both a new trial series and a stale onboarding sample keeps the sample retired.
- **Per-day check-in resume** - When Day 3 suppresses the generic check-in on a per-day schedule, the resume fires at that weekday's own time.
- **Onboarding funnel as Sentry logs** - Onboarding started, resumed, and completed now go to Sentry Logs (scrubbed to event names) instead of rendering as error-level messages; the abandoned milestone stays a warning. No change to what reaches Sentry beyond the log stream.

## What to test

- [ ] Delete a series, then sync on another device or after a reinstall. Confirm it stays deleted.
- [ ] Open a scripture explain, then leave the sheet before it answers. Confirm no stale text appears when you return.
- [ ] Navigate quickly between Bible chapters. Confirm the reader shows the chapter you landed on.
- [ ] Play audio, switch readings mid-load. Confirm the player follows the current reading.
- [ ] Everything on the build 278 list still holds: felt-tip highlights, reminder titles, Today's lighter look, the light-mode generating screen.

## Behind a server switch (off by default)

- **Auto trial series** (`autoTrialSeries.enabled`, default off). The backend now requires a RevenueCat-written entitlement before it generates a trial series, keeps the trial marker through any sync shape, and picks the finale series by the shared active rule. Switch-on waits for App Review and one real sandbox purchase.
