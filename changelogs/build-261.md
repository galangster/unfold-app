# Build 261 (1.1.4) - launch crash fix, Jordan's feedback, and everything since 1.1.1

**Read first:** builds 255 through 260 shipped with **no JavaScript bundle** and crashed on launch on every device. App Review rejected 1.1.3 (build 259) for exactly that (Guideline 2.1, crash on an iPad Air). Nothing listed in the changelogs for 257, 258, 259 or 260 was ever run on a device. Build 261 is the first build since 1.1.1 (254) that starts. Please test it as if it were all of them.

## Fixed

- **App starts.** The iOS bundle step handed Sentry's wrapper `/bin/sh` instead of the React Native script, so it bundled nothing and the build still "succeeded". The wrapper call is corrected, a build-time guard now fails any Release build that lacks `main.jsbundle`, and a unit test pins the wrapper line.
- **Key people** - several people per relationship; tapping a chip again adds a row; remove with the row's x; up to five.
- **"We heard you." screen** - no faint hard-edged band under the spinner.
- **Paywall** - the phone mockup fits the page, including through a full downward drag.
- **After Start Free Trial** the app advances on its own; no Restore tap. A slow entitlement shows "Finishing up" and self-advances within about ten seconds.
- **"Go home - we'll keep writing"** really leaves for Today, which shows a preparing card and lands the series when ready.
- **Long generations never fail by the clock.** "Still writing" replaces "Something went wrong". Backend (live): 30-day plans no longer truncate; they take three to four minutes.
- **"Notify me when it's ready"** - a push arrives if the series fails; denied permission shows Open Settings; failed registration keeps the link.
- **After finishing a day**, the write-in-place reflect field appears on Today.

## Also in this build, never device-tested before (from 257-260)

- Companion reply actions: Try another reply, Save to journal, "What was off?" chips (260).
- Tool-using companion replies finish instead of stopping after one sentence (260, backend).
- Tomorrow's reading is pre-generated overnight for everyone (260, backend).
- Daily-loop fixes (257), usability sweeps (258, 259), App Store review prompt after the first onboarding devotional.

## What to Test

- [ ] Cold launch on an iPhone AND an iPad: the app opens to the welcome or Today screen. No crash.
- [ ] Key people: tap Friend twice, name both; both names appear in the devotional.
- [ ] "We heard you." shows no band under the verse card.
- [ ] Paywall screen 1: drag the mockup fully down; no flat cut.
- [ ] Sandbox Apple ID, never trialed: Start Free Trial advances with no Restore. Force-quit within two seconds; the resume never shows the paywall. "Unlock Premium" never appears after a purchase.
- [ ] Physical iPhone: "Notify me when it's ready" - deny shows Open Settings; allow delivers a notification when the job finishes or fails.
- [ ] During generation tap "Go home": Today shows preparing; the series lands without the ripple.
- [ ] A 30-day plan completes; no "Something went wrong" from time alone.
- [ ] Complete day 1: the reflect field is on Today. First onboarding devotional: the review sheet appears once.
- [ ] Companion: arrows re-stream a different reply; thumbs-down shows the four chips; pencil saves to today's journal entry, no duplicate on a second tap.
- [ ] Run the 257 and 258 checklists (`changelogs/build-257.md`, `build-258.md`).
