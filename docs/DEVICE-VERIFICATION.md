# Device Verification Runbook

How to verify app changes on the iOS Simulator. Nothing in CI checks the UI, and
the Playwright/web path does not work for this app (Rive, Skia, `react-native-webview`,
and the native Swift editor all lack web implementations — Home white-screens on the
Rive import). **The simulator is the only real visual verification.**

Apple tooling on this machine goes through **FlowDeck**. Never call `xcodebuild`,
`xcrun`, or `simctl` directly.

Reference simulator: **iPhone 17 Pro `E292C8E3-EF98-4FF4-A19F-AD4B91877AB6`**

---

## 1. Setup

```bash
git fetch origin && git checkout <branch> && bun install
```

Copy `.env` and `.env.production` from the machine that has them — both are
gitignored, so a fresh clone cannot reach the backend without them. Anything that
exercises the companion, streaming, or devotional generation needs them.

## 2. Pick the loop

**Fast path — JS/TS-only changes with a dev build already installed.** Most PRs.
Metro serves the new bundle; just reload the app.

```bash
npx expo start          # then reload the app in the simulator
lsof -i :8081           # check whether Metro is already running first
```

Confirm a PR is JS-only with:

```bash
git diff --name-only origin/main..HEAD | grep -E '^(ios|android|modules)/'
```

No output means no native rebuild is required.

**Full path — native/editor files changed, or no usable build installed.**

```bash
SIM=E292C8E3-EF98-4FF4-A19F-AD4B91877AB6

flowdeck build \
  --workspace ios/Unfold.xcworkspace --scheme Unfold --configuration Debug \
  --simulator $SIM --derived-data-path /tmp/unfold-verify --json

flowdeck uninstall --simulator $SIM com.unfoldapp.ios   # ok if "not installed"

flowdeck run \
  --workspace ios/Unfold.xcworkspace --scheme Unfold --configuration Debug \
  --simulator $SIM --derived-data-path /tmp/unfold-verify --json
```

Uninstall first when testing anything storage-related, so a stale container can't
mask the result.

## 3. Screenshots

```bash
flowdeck ui simulator screen --output /tmp/<name>.png
sips -Z 1000 /tmp/<name>.png        # downscale before attaching
```

Screenshot after each meaningful action rather than trusting recall.

## 4. Scripted flows (Maestro)

Some of the manual checklist below is automated in `.maestro/`. With a booted
simulator and the app installed:

```bash
bun run test:e2e            # maestro test .maestro/
maestro test .maestro/verse-note-autosave.yml   # single flow
```

Requires the Maestro CLI and a Java runtime; both are macOS-side. Flows drive the
app by `testID`, so they are only as good as the selectors they reference.

**A dead selector does not fail a flow — it makes the step a silent no-op.** That
is exactly how this suite rotted before: it referenced five testIDs that never
existed and wrapped nearly every assertion in `optional: true`, so it passed while
testing nothing. Two guards now exist:

- `node scripts/verify-maestro-selectors.mjs` cross-checks every `id:` in every
  flow against the testIDs actually present in `src/`. It runs in CI on Linux with
  no simulator, so dead selectors are caught the moment they appear.
- `optional: true` is reserved for genuinely conditional UI (a premium sheet that
  may or may not appear). Never put it on the assertion that is the point of the
  test — an assertion that cannot fail is not a test.

When you add a flow, add the testID to the component rather than reaching for a
text match; copy changes far more often than testIDs do.

## 5. Cross-cutting matrix

Run the surfaces you touched through: **dark + light**, **Reduce Motion on + off**,
and at least one **non-gold accent** (Ocean) to catch hardcoded gold.

## 6. Reporting bugs

```
BUG #N
Screen:     <route / screen name>
Steps:      <numbered, from app launch>
Expected:   <what should happen>
Actual:     <what happened>
Severity:   Critical | Major | Minor | Polish
Screenshot: /tmp/<name>.png
```

---

## Appendix — PR #42 checklist (IA / notes / performance / companion)

This PR changed **no native files**, so the fast path applies. Ordered by risk:
data-loss paths first.

### Data loss (highest priority — these were live bugs)

1. **Verse-note autosave.** Bible → tap a verse → Note → type → **swipe the sheet
   down to dismiss**. Reopen the note: the text must be there. Previously discarded
   silently. Also confirm the keyboard never covers the input or Save button.
2. **Journal autosave.** Type a reflection → force-quit from the app switcher →
   reopen. Text must be present.

### Notes

3. **Always-editable editor.** Open an existing note: no keyboard, scrolls freely.
   Tap the body: caret lands where you tapped, toolbar sits above the keyboard.
   Done dismisses and persists. Back mid-typing → the list shows the latest text.
   A new note focuses the title. An empty new note + back creates **no** ghost note.
   Minimize → draft dock → restore keeps content and returns you to the tab you came
   from (it used to dump you in the Bible tab).
4. **Notes ↔ Bible bridge.** Notebook search surfaces Bible verse notes; the reader
   shows a badge when Notebook notes are anchored to the open chapter.
   *Known gap:* the reading-font preference applies to the title and the WebView
   editor path only. On iOS the native editor exposes no font-family prop, so the
   note body font will not change. Expected, not a bug.

### Navigation

5. **Reader header.** Bible reader: gear icon top-left opens reader settings; the
   `Aa` button is gone; the book/chapter title is still centered.
6. **Settings.** You → gear → Settings. Every section round-trips: theme flips live,
   locked fonts open the premium sheet, the reminder toggle schedules/cancels, and
   the midday row → check-in schedule → back lands on **Settings** (not You).
   From the Bible reader's settings sheet → "All settings" → back must return to the
   **reader's** tab.
7. **Back behavior + labels.** Reader back pops the stack (pressing back repeatedly
   must not stack Home on itself). The archive reads "Past Devotionals" everywhere.

### Companion

8. **Streaming.** Replies should read as continuous flow, not ~30 discrete pops per
   second. Toggle Reduce Motion → text appears instantly instead.
9. **Stream lifecycle.** Switch conversations mid-stream: the old request aborts and
   its suggestions/errors don't leak onto the new conversation. Airplane-mode
   mid-stream: partial text is kept with an error banner, not a blank row. Trigger an
   error on the **first** message of a fresh session — the banner must appear (it was
   previously swallowed).

### Performance

10. **Cold start** should feel faster (splash-blocking fonts cut ~73%). Switching
    reading font may briefly show Source Serif before swapping in — expected, the
    other families now load on demand.
11. **Psalm 119** scrolls without jank; verse selection is responsive.
12. **My Library** Journal/Saved/Bookmarks tabs scroll smoothly, filter chips work,
    empty states render, and `?tab=` deep links land on the right tab.
