# PR #42 — E2E Verification Brief

Handoff for a Claude Code session running **on the Mac** (this cannot be done
from a cloud session — it needs a simulator). Branch:
`claude/unfold-app-work-clg8db`.

Read `docs/DEVICE-VERIFICATION.md` first for the FlowDeck command surface. This
document is the test plan.

---

## What you are verifying

19 commits across five areas. Everything below has passed typecheck, lint, and
1,218 unit tests in CI — **none of it has ever run on a device.** Neither have
the Maestro flows or the FlowDeck sequences in this brief; they were written
from source, so expect a step or two to need adjusting. Adjusting them is part
of the job.

Highest risk first: the two data-loss fixes. If nothing else gets done, do §1.

## Ground rules

- Drive Apple tooling **only through FlowDeck** — never `xcodebuild`, `xcrun`,
  or `simctl` directly.
- Target elements with `--by-id` (React Native `testID` becomes the
  accessibility identifier). Fall back to label matching only when no testID
  exists; if you need one, add it to the component rather than matching copy.
- Capture state after every meaningful action (`flowdeck ui simulator screen`)
  rather than assuming an action landed.
- **Fix flows and selectors freely. Do not change app behaviour to make a test
  pass** — if the app is wrong, report it as a BUG and stop there unless the fix
  is unambiguous and small.
- If a check is blocked (needs a purchase, needs a backend state you can't
  reach), say so explicitly. Do not report an untested item as passing.

## Setup

```bash
cd ~/clawd/work/unfold/app/mobile
git fetch origin
git checkout claude/unfold-app-work-clg8db
bun install
```

`bun install` should report ~1393 packages. If it reports a few hundred, the
tree is stale — `rm -rf node_modules && bun install`, or Reanimated's
`validate-worklets-version.js` will fail on a missing `semver`.

```bash
cd ios && pod install && cd ..
flowdeck simulator list --available-only
flowdeck run -w ios/Unfold.xcworkspace -s Unfold -S "<simulator>" --log
```

Then, **before any note testing**: Home → tap avatar → You → gear → Settings →
**Dev Tools → Grant Premium (QA)**. Without it every note surface is locked and
most of §1–§2 is untestable. (No `.env` is needed: the backend URL falls back to
production and Debug builds enable QA tools.)

Sanity-check the static guards too:

```bash
node scripts/verify-maestro-selectors.mjs
bun run test:e2e
```

`test:e2e` runs all Maestro flows except the `reset`-tagged onboarding one.

---

## §1 Data loss — the reason this PR exists

### 1.1 Verse-note autosave on swipe-dismiss
Was: typing into a verse note and dismissing the sheet by swiping down silently
discarded the edit.

```bash
flowdeck ui simulator tap --by-id "bottom-tab-bible"
flowdeck ui simulator assert visible --by-id "bible-reader-screen"
flowdeck ui simulator tap --by-id "reader-chapter-title"
flowdeck ui simulator tap --by-id "bible-navigator-search"
flowdeck ui simulator type "Genesis 1"
flowdeck ui simulator tap --by-id "bible-navigator-goto"
flowdeck ui simulator tap --by-id "bible-verse-1"
flowdeck ui simulator tap --by-id "bible-verse-action-note"
```
Compose a note, then dismiss with `flowdeck ui simulator swipe down`, reopen the
same verse's note, and assert the text is present.
`maestro test .maestro/verse-note-autosave.yml` encodes this.
**Also check the backdrop-tap and Android-back paths commit the same way.**

### 1.2 Verse-note keyboard avoidance
With the note sheet open and the keyboard up, the text input and Save button must
both remain visible. Previously the sheet was pinned to `bottom: 0` with no
avoidance and sat under the keyboard.

### 1.3 Journal autosave across force-quit
Open a devotional → journal → type a reflection → force-quit from the app
switcher (not backgrounding) → reopen. The text must be there. Repeat for a SOAP
field and a prayer request. Was an ad-hoc 1s debounce with no background flush.

### 1.4 Companion streaming-status reconciliation
Send a companion message and force-quit **while it is still streaming**. On
reopen, that reply must be a retryable error row, not a permanently blank bubble.

---

## §2 Notes

### 2.1 Always-editable editor
Open an existing note. Expected:
- No keyboard on open; the note scrolls freely.
- Tapping the body puts the caret **where you tapped** and raises the keyboard.
- Toolbar sits directly above the keyboard (check on a device with a home
  indicator — this is the riskiest layout change).
- Undo/redo/minimize/Done appear only while the keyboard is up; the ⋯ menu is
  always present.
- Done dismisses the keyboard and persists.
- Typing then immediately going back shows the latest text in the list.
- A new note focuses the title.
- A new note left empty, then back → **no ghost note** in the list.
- Task-list checkbox taps now persist (intended change).

### 2.2 Minimize returns to the originating tab
Open a note from the Journal tab → minimize → the draft dock appears → restore.
Content intact, and you land back where you came from. It previously dumped you
in the Bible tab regardless of origin.

### 2.3 Notes ↔ Bible bridge
- Notebook search surfaces Bible verse notes as distinct rows; tapping one deep
  links to the chapter.
- The Bible reader shows a notes badge when Notebook notes are anchored to the
  open chapter; tapping it opens a sheet linking to those notes.

### 2.4 Reading-font typography
Changing the reading font changes the note **title** font. **Expected gap:** on
iOS the note *body* will not change — the native Swift editor exposes no
font-family prop. Do not file this as a bug.

---

## §3 Navigation & IA

### 3.1 Reader header
Bible reader: a **gear** icon top-left opens reader preferences; the old "BSB"
pill and the top-right `Aa` button are both gone; the book/chapter title is still
visually centered.

### 3.2 Settings screen
Home avatar → You → gear → Settings. Verify every section round-trips:
theme flips live, accent colors apply, locked fonts open the premium sheet,
font size applies, the daily-reminder toggle schedules and cancels, writing-style
grids persist, and support rows open. Then: midday check-in row →
check-in schedule → back must land on **Settings**, not You.

### 3.3 Cross-tab back from reader sheets
Bible reader → gear → sheet → **All settings** → Settings opens → back must
return to the **Bible** tab. Repeat from the devotional reader's `Aa` sheet →
back must return to **Today**.

### 3.4 Back behaviour
In the devotional reader, press back repeatedly — it must pop, never stack Home
on itself. Also confirm the deep-link case (open a devotional from a
notification, press back) doesn't dead-end.

### 3.5 Naming and dead links
The archive reads "Past Devotionals" everywhere (Home bento, You menu, screen
title). Then sweep every tab for links to the 24 deleted screens — nothing
should 404 or dead-end. Pay attention to My Library, past devotionals, and
series detail, which have alias routes.

---

## §4 Companion

### 4.1 Smooth streaming
Send a message and watch the reply. It should read as continuous word-by-word
flow, not ~30 discrete chunk-pops per second. This is the perceptual check —
record a screen capture if you can, and flag it for human review either way.

### 4.2 Reduced motion
Enable Settings → Accessibility → Reduce Motion on the simulator, send another
message: text should appear immediately with no reveal animation.

### 4.3 Stream lifecycle
- **Switch conversations mid-stream** (open the drawer, pick another): the old
  request aborts, and its suggestion chips / errors do not appear on the new
  conversation.
- **New chat mid-stream**: same.
- **Airplane mode mid-stream**: partial text is kept with an error banner — not
  a blank row, and not a second answer that overwrites the first.
- **Error on the very first message of a fresh session**: the error banner must
  appear. This was silently swallowed before (the conversation-created event
  wiped it).
- **Stalled connection**: should surface an error rather than hanging on
  "thinking" forever.

### 4.4 Smaller companion fixes
The "looking something up" indicator appears during tool use (was dead code);
denying microphone permission exits voice mode with a message and re-tapping
retries (was a permanent dead end); the daily-quota banner is accurate on a
fresh day.

---

## §5 Performance

- **Cold start** should feel faster — splash-blocking fonts cut from ~9.7 MB to
  2.6 MB. Time it if you can.
- **Font switching**: picking a non-default reading font may briefly show Source
  Serif before swapping in. **Expected** — the other families now load on demand.
- **Psalm 119** (176 verses): scrolls without jank; verse selection is
  responsive; scroll-to-verse from a deep link still lands correctly.
- **My Library**: Journal / Saved / Bookmarks tabs scroll smoothly, filter chips
  work, empty states render, and `?tab=` deep links land on the right tab.
- **Devotional reader**: swiping between days doesn't flash or reload the body.

---

## Known-expected, not bugs

- Note body font unchanged on iOS when switching reading fonts (§2.4).
- Brief Source Serif before a lazy-loaded font swaps in (§5).
- Every note surface locked until Dev Tools → Grant Premium (QA) is enabled.
- `.maestro/onboarding.yml` is excluded from `test:e2e` — it clears app state and
  wipes the Bible DB. Run it deliberately and alone.
- Purchases/paywall cannot be exercised without RevenueCat keys.

## Reporting

```
BUG #N
Screen:     <route / screen name>
Steps:      <numbered, from app launch>
Expected:   <what should happen>
Actual:     <what happened>
Severity:   Critical | Major | Minor | Polish
Screenshot: /tmp/<name>.png
```

Finish with a summary: which sections passed, which failed, which were blocked
and why, and any flow/selector edits you made. Push flow fixes to the branch;
leave app-behaviour fixes for review unless they're unambiguous.
