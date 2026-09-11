# Build 278 (1.1.8) - Felt-tip in the reader

Everything in build 277, plus the reader ink and reminder-title work below.

## New

- **Today, lighter** - The hero on Today no longer sits in a box. Every state (reading, tomorrow locked, series complete, paused, preparing, failed) shares one left-aligned layout on a feathered ground that keeps the ambient art visible. Every other Today card is one frosted-glass surface (blur, low tint, hairline border); the companion bubble keeps its speech tail.
- **Saved echo stroke** - The Today "A line worth carrying" quote now draws the saved highlight as the reader's felt-tip stroke, one band per measured line.
- **Generating screen in light mode** - Surfaces and text follow the theme. The "You don't have to wait" note and the confirmed nudge are rows, not boxes. Controls align left. The sample card is glass.
- **Felt-tip highlights in the Bible reader** - Saved highlights now draw as the felt-tip stroke: one gradient band per measured line, fitted to the letters of the active reading font, in light and dark. The text colour stays unchanged. Selection still paints over the mark. The old flat per-line rectangles and the dark-mode coloured-text path are gone.
- **One ink everywhere** - The same ink source now feeds the devotional, the scripture block, the Today "A line worth carrying" band, and the reader.
- **Notification titles that name the open** - Midday now says "Your midday check-in is ready". Evening now says "Your evening prayer is ready". Morning stays "Day N is ready". Bodies and tap routing are unchanged.

## Fixed

- The series-complete reflection no longer truncates mid-word.
- Extra top padding above the first onboarding devotional title.
- Repairs to the churned win-back offer. It stays dormant behind a flag that is off.

## What to test

- [ ] Open a Bible passage with a saved highlight. Confirm each line is a felt-tip gradient band fitted to the letters, not a flat rectangle.
- [ ] Toggle light and dark. Confirm the stroke remains and the text colour does not change.
- [ ] Select text over a saved highlight. Confirm the selection paint still covers the mark.
- [ ] Highlight a verse in a devotional scripture block. Confirm the same ink appears on that verse in the reader.
- [ ] Highlight a line in a devotional. Confirm the stroke matches the reader, and that Today "A line worth carrying" can show a Bible highlight with the same band.
- [ ] With midday notifications on, confirm the title is "Your midday check-in is ready" and the body and tap target are unchanged.
- [ ] With evening notifications on, confirm the title is "Your evening prayer is ready" and the body and tap target are unchanged.
- [ ] Confirm the morning title is still "Day N is ready".
- [ ] Finish a series and write a long last reflection. Confirm words wrap instead of truncating mid-word.
- [ ] Fresh onboarding: confirm extra space above the first devotional title.
- [ ] Today, dark and light: the hero has no box, text is left-aligned, and the ambient art stays visible after a completed day. Every card reads as frosted glass. The companion bubble has its tail.
- [ ] Today "A line worth carrying": the quote carries the felt-tip stroke per line, not a flat band.
- [ ] Generating screen in light mode: cream ground, readable muted text, note and nudge as rows, controls left-aligned, glass sample card.

## Behind a server switch (off by default)

- **Auto trial series** (`autoTrialSeries.enabled` in `app_config`, default off): a first-run purchase of a trial of 7 days or less skips the setup questions and generates a series sized to the trial on the existing generating screen; Day 2 responds to the Day 1 check-in; the trial-ending notice fires on Day 3. Audited by Fable 5.1 before merge. Switch-on waits for App Review and one real sandbox purchase.
