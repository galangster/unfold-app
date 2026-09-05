# Build 261 (1.1.4) - Jordan's feedback

Everything in build 260, plus fixes for the items tester Jordan reported on 1.1.0, and the onboarding review prompt that missed build 260.

## Fixed

- **Key people** - several people per relationship. Tapping a chip again adds another row (two friends, each with a name); remove with the row's x. Up to five.
- **"We heard you." screen** - no more faint hard-edged band under the spinner.
- **Paywall** - the phone mockup fits the page, including through a full downward drag.
- **After Start Free Trial** the app advances on its own; no Restore tap. A slow entitlement shows "Finishing up" and self-advances within about ten seconds.
- **"Go home - we'll keep writing"** really leaves for Today, which shows a preparing card and lands the series when it is ready.
- **Long generations never fail by the clock.** "Still writing - taking a little longer" replaces "Something went wrong". Backend: 30-day plans no longer truncate at 7000 tokens (live once the backend deploys; a 30-day plan now takes three to four minutes).
- **"Notify me when it's ready"** - a push arrives when the series fails permanently; a denied permission shows Open Settings; a failed registration keeps the link so you can retry.
- **After finishing a day**, the write-in-place reflect field appears on Today.

## New

- **App Store review prompt** right after the first devotional in onboarding.

## What to Test

- [ ] Key people: tap Friend twice, name both. Both names appear in the devotional.
- [ ] "We heard you." shows no band under the verse card.
- [ ] Paywall screen 1: drag the mockup fully down. No flat cut.
- [ ] Sandbox Apple ID that has never trialed: Start Free Trial, then the app advances with no Restore. Force-quit within two seconds of the transition; the resume never shows the paywall. With Network Link Conditioner on "Very Bad Network": "Finishing up" appears, then it self-advances inside ten seconds. "Unlock Premium" never appears after a purchase.
- [ ] Restore on an empty account still answers in about three seconds.
- [ ] Physical iPhone: tap "Notify me when it's ready". Deny: Open Settings appears. Allow: a notification arrives when the job finishes or fails. Tapping a failure push lands on that job with Try again.
- [ ] During generation tap "Go home": Today shows preparing and the series lands without returning to the ripple.
- [ ] A 30-day plan completes. No "Something went wrong" from time alone. Background the app for fifteen minutes and return: still writing.
- [ ] Complete day 1: the reflect field is on Today.
- [ ] First devotional in onboarding: the review sheet appears once.
