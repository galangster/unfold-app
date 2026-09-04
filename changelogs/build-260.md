# Build 260 (1.1.4) - companion reply actions

Everything in build 259 (1.1.3), plus three actions on every companion reply, and a backend fix that had been cutting tool-using replies short.

## New

- **Try another reply** - the arrows button (or the link under a thumbs-down) rewrites the last reply in place. Free readers spend one message on it, and only when a reply arrives.
- **Save to journal** - the pencil button files the reply, with the question it answered, into today's entry of your current series. Hidden when there is no series. Saving twice does not duplicate.
- **What was off?** - a thumbs-down asks with four chips: Not what I asked, Too long, Needed more Scripture, Tone felt off. The choice is recorded, and "Try another reply" carries it to the companion.

## Fixed

- **Companion replies that look something up no longer stop after one sentence** - "Walk me through today's reading" finishes. Backend fix, live since 2026-09-04.
- **Tomorrow's reading is ready at the morning open for everyone** - readers who declined notifications were generating on demand at open (about two and a half minutes). They are now pre-generated overnight like everyone else. Backend, live.

## What to Test

- [ ] Companion: send a message, tap the arrows: the same reply slot re-streams a different answer and the old one is gone.
- [ ] Tap thumbs-down: "What was off?" chips appear. Pick one, tap "Try another reply": new reply, thumbs-down cleared.
- [ ] Tap the pencil: green check; VoiceOver says "Saved to journal". Journal tab: today's entry starts "From the companion, in reply to ..." followed by the reply. Tap the pencil again: no duplicate.
- [ ] With no active series: the pencil button is absent.
- [ ] Free profile with 0 messages left: the arrows and "Try another reply" open the paywall sheet and spend nothing.
- [ ] "Walk me through today's reading" finishes with a full reply and suggestion chips, no "Something went wrong" banner.
