# Build 263 (1.1.5) - Bible resume, Journal improvements, and clearer support

Everything in build 262, plus the improvements below.

## What's New (App Store)

Bible reading now picks up at the verse where you stopped. The book picker uses clear, even columns with full book names and better support for larger text.

Journal and Notebook are easier to use. Formatting keeps your selection, Done closes the keyboard reliably, and archived notes are easier to find and manage.

Settings now includes a copyable Support ID when support needs it. We also refreshed the onboarding walkthrough and improved signed-out startup reliability.

## New

- **Continue from the last Bible verse** - closing and reopening Unfold returns to the saved verse.
- **Clearer Bible picker** - book buttons use consistent columns and full book names. Larger text keeps the navigator labels visible.
- **Copyable Support ID** - Settings shows the verified support identity with accessible copy feedback.
- **Refreshed onboarding walkthrough** - the paywall walkthrough video and poster match the current onboarding flow.

## Fixed

- **Journal editing** - text selection survives opening Formatting. Done closes the native editor focus and keyboard.
- **Journal archive** - archive and recently deleted states have clearer grouping and controls.
- **Signed-out startup** - a valid signed-out local state no longer enters the user-state repair path.
- **Bible layout refreshes** - delayed verse scrolling cannot use row positions from another chapter or translation.

## What to Test

- [ ] Close the Bible reader after scrolling. Relaunch and confirm Continue returns to the same verse.
- [ ] Change Bible translation. Confirm the same verse stays visible.
- [ ] Use the Bible navigator at normal and large text sizes. Confirm full names, equal columns, and unclipped tabs.
- [ ] Select words in a note, open Formatting, apply Bold, and confirm the words remain selected and intact.
- [ ] Tap Done while editing a note. Confirm the keyboard closes and the note persists after relaunch.
- [ ] Archive and restore a synthetic note. Confirm its month grouping and actions remain correct.
- [ ] Copy the Support ID from Settings. Confirm success and unavailable states use the correct accessible feedback.
- [ ] Verify the refreshed walkthrough video and poster on the paywall.

