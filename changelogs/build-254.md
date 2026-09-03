# 1.1.1 (build 254)

Everything in 1.1.0, which was approved but never released, plus a P0 fix for
people who were being sent through setup a second time.

## What's New (App Store)

Setup remembers where you left off
- If you close Unfold partway through setting up, you now pick up exactly where
  you stopped, with everything you told us still there. Before, closing the app
  before the very last screen meant starting over from your name.
- Coming back never replays the intro, and never asks a question twice.
- If you were partway through when you left, reopening takes you straight back
  in rather than to the first-run welcome screen.
- If you had already started a subscription, Unfold now remembers that instead
  of asking you to restore it.

Subscribing
- The subscription screen now has an "I'll decide later" option, so it is no
  longer a dead end. Your first devotional and your answers are kept either way.
- Subscribing from the special-offer sheet now completes properly. Before, the
  purchase went through but the screen stayed put.

Reliability
- Unfold now stores its data in a way that survives being opened while your
  phone is still locked. If it ever cannot open your library, it says so plainly
  and tells you your reading is safe, instead of looking like a fresh install.

## Engineering notes

Diagnosis, evidence and the fix plan: `plans/08-p0-onboarding-restart.md`.

- Onboarding answers persist to an MMKV draft from the name step onward, on a
  300ms debounce with a 1.5s ceiling, plus a synchronous flush on background.
- `resolveOnboardingResumeStep` decides re-entry: never a cutscene, payoff or
  marketing beat; holds at or after the reading step once a devotional exists;
  skips the paywall for someone who already purchased.
- The onboarding sample-job pointer survives delivery, so a resumed session
  shows the same devotional instead of generating a second one.
- Keychain items migrate to `AFTER_FIRST_UNLOCK` under `-v2` key names, read
  v2-then-v1 and copy forward. A Keychain throw is unproven absence and can no
  longer mint a replacement identity. A storage-locked session renders a
  recovery screen above the whole tree, so no hook reads an empty store.

Verified on the simulator by hard-killing the process at the name step and at
the paywall; both resume correctly with answers intact.
