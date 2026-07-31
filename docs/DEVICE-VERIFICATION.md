# Device Verification SOP

How to build, run, and verify this app on the iOS Simulator using **FlowDeck**.

The simulator is the only real visual verification for Unfold. The web target
cannot render the app — Rive, Skia, `react-native-webview`, and the native Swift
editor all lack web implementations, and Home white-screens on the Rive import.
CI covers typecheck, lint, unit tests, and e2e selector integrity; everything
visual or interactive has to happen here.

---

## 0. What FlowDeck is (and what it still needs)

FlowDeck wraps Apple's toolchain: `flowdeck build` compiles "using `xcodebuild`
underneath", and its documented prerequisites are macOS 13+ and **Xcode 15+**.
It does not replace Xcode — it replaces *opening* Xcode. You still need Xcode
installed, and `xcode-select` must point at it rather than at the Command Line
Tools.

Per repo convention, never call `xcodebuild`, `xcrun`, or `simctl` directly —
go through FlowDeck.

> The commands below are taken from FlowDeck's documentation. Flags can drift
> between versions; `flowdeck <command> --help` is the ground truth on your
> machine.

## 1. One-time machine setup

```bash
# Xcode itself (App Store), then point the toolchain at it — installing Xcode
# does NOT switch this automatically, and xcodebuild fails until you do:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -version                 # must print a version, not an error

# A simulator runtime (recent Xcode ships without one):
xcodebuild -downloadPlatform iOS

# FlowDeck CLI — single binary into ~/.local/bin
curl -sSL https://flowdeck.studio/install.sh | sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && exec zsh
flowdeck --version
```

CocoaPods is still needed for the native build: `brew install cocoapods`.

## 2. Configure the project

```bash
cd ~/clawd/work/unfold/app/mobile     # wherever your clone lives
flowdeck -i                            # interactive TUI: trial activation + project detection
```

`flowdeck -i` detects the workspace and asks for a scheme. To set it
non-interactively instead:

```bash
flowdeck config set -w ios/Unfold.xcworkspace -s Unfold -S "iPhone 17 Pro"
flowdeck config get
flowdeck simulator list                # confirm the simulator name exists
```

## 3. Build and run

```bash
git fetch origin && git checkout <branch> && bun install
cd ios && pod install && cd ..

flowdeck build                         # add --json for structured errors
flowdeck run --log                     # build + install + launch, streaming logs
```

Useful around this loop:

```bash
flowdeck simulator boot "iPhone 17 Pro"
flowdeck ui simulator clear-state com.unfoldapp.ios     # wipe app data
flowdeck logs com.unfoldapp.ios                          # this app's logs only
flowdeck stop --all
```

**JS/TS-only changes don't need a rebuild.** Confirm with:

```bash
git diff --name-only origin/main..HEAD | grep -E '^(ios|android|modules)/'
```

No output means Metro alone is enough — `npx expo start`, then reload the app.

## 4. Driving the UI

FlowDeck automates the simulator through the accessibility tree, with no
XCUITest target required. **React Native `testID` becomes the accessibility
identifier**, so `--by-id` targets the same selectors our Maestro flows use.

```bash
flowdeck ui simulator screen --json          # screenshot + accessibility tree
flowdeck ui simulator find --by-id "bottom-tab-bible"
flowdeck ui simulator tap --by-id "bottom-tab-bible"
flowdeck ui simulator type "some text"
flowdeck ui simulator swipe down
flowdeck ui simulator assert visible --by-id "settings-screen"
flowdeck ui simulator open-url "unfold://(tabs)/(today)"
```

Targeting modes are mutually exclusive: default is an exact label match, plus
`--by-id` (accessibility identifier), `--by-role` (`button`, `textField`),
`--contains` (substring), or `--point x,y`. Common flags: `-S/--simulator`,
`--json`, `--no-screen` (skip the post-action tree when you don't need it).

For long runs, `flowdeck ui simulator session start` captures screen + tree
roughly every 500ms so you read state from disk instead of paying for a capture
after every action.

Prefer `--by-id` over label matching — copy changes far more often than testIDs.
When you need a new hook, add a `testID` in the component rather than reaching
for a text match.

## 5. Letting an agent drive it

FlowDeck ships a skill pack rather than an MCP server:

```bash
flowdeck ai install-skill --agent claude --mode project   # → .claude/skills/flowdeck/
```

Use `--mode global` for `~/.claude/skills/flowdeck/`. **Restart the agent
afterwards** or it won't pick the skills up. Then a Claude Code session running
*on this Mac* can build, run, drive the simulator, and read back the
accessibility tree — the implement-and-prove loop. A cloud session cannot: it
has no simulator and no access to this machine.

## 6. Maestro flows

`.maestro/` holds scripted regression flows covering the same paths. FlowDeck
automation and Maestro overlap deliberately:

- **Maestro** — deterministic regression runs, checked into the repo, good for
  "did this break?" Requires `brew install maestro openjdk`.
- **FlowDeck UI automation** — exploratory and agent-driven, good for "what does
  this actually look like / why did it fail?"

```bash
bun run test:e2e                                 # all flows except tag: reset
maestro test .maestro/verse-note-autosave.yml    # single flow
```

**A dead selector does not fail a flow — it makes the step a silent no-op.**
That is how this suite rotted before: five testIDs that never existed, plus
`optional: true` on nearly every assertion, so it passed while testing nothing.
Two guards now exist:

- `node scripts/verify-maestro-selectors.mjs` cross-checks every `id:` against
  the testIDs actually in `src/`. It runs in CI on Linux, no simulator needed.
- `optional: true` is reserved for genuinely conditional UI. Never put it on the
  assertion that is the point of the test — an assertion that cannot fail is not
  a test.

## 7. Cross-cutting matrix

Run every surface you touched through **dark + light**, **Reduce Motion on +
off**, and at least one **non-gold accent** (Ocean) to catch hardcoded gold.

## 8. Reporting bugs

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

## Appendix A — verifying without a `.env`

`.env` and `.env.production` are gitignored, so a fresh clone has neither. That
is fine:

- **Backend** — `PRIMARY_BACKEND_URL` falls back to `https://api.unfoldapp.co`
  (`src/lib/api-config.ts`), so devotionals and companion streaming reach
  production.
- **Premium** — RevenueCat keys come from env, so purchases won't resolve. But a
  Debug build has `__DEV__ === true`, which enables `isQaToolsEnabled()`
  (`src/lib/qa-tools.ts`). Settings → **Dev Tools → Grant Premium (QA)** flips
  the local override honoured by `src/lib/premium-access-policy.ts`, unlocking
  notes, journal, and premium fonts. Session-only, never persisted.
- **Firebase** — `GoogleService-Info.plist` is committed.

Only real purchase/paywall flows need the actual keys.

## Appendix B — PR #42 checklist (IA / notes / performance / companion)

Zero native files changed, so the Metro path applies. Ordered by risk.
Grant premium first or the note surfaces stay locked.

### Data loss — these were live bugs

1. **Verse-note autosave.** The regression that matters most. As FlowDeck
   commands:

   ```bash
   flowdeck ui simulator tap --by-id "bottom-tab-bible"
   flowdeck ui simulator assert visible --by-id "bible-reader-screen"
   flowdeck ui simulator tap --by-id "reader-chapter-title"
   flowdeck ui simulator tap --by-id "bible-navigator-search"
   flowdeck ui simulator type "Genesis 1"
   flowdeck ui simulator tap --by-id "bible-navigator-goto"
   flowdeck ui simulator tap --by-id "bible-verse-1"
   flowdeck ui simulator tap --by-id "bible-verse-action-note"
   # ...compose, then dismiss by swiping the sheet DOWN:
   flowdeck ui simulator swipe down
   # reopen and assert the text survived — it used to be discarded silently
   ```

   Or just `maestro test .maestro/verse-note-autosave.yml`, which encodes this.
   Also confirm the keyboard never covers the input or Save button.

2. **Journal autosave.** Type a reflection → force-quit from the app switcher →
   reopen. Text must be present.

### Notes

3. **Always-editable editor.** Open an existing note: no keyboard, scrolls
   freely. Tap the body: caret lands where you tapped, toolbar above the
   keyboard. Done dismisses and persists. Back mid-typing → list shows the latest
   text. A new note focuses the title. An empty new note + back creates **no**
   ghost note. Minimize → draft dock → restore keeps content and returns to the
   tab you came from (it used to dump you in the Bible tab).
4. **Notes ↔ Bible bridge.** Notebook search surfaces verse notes; the reader
   shows a badge when Notebook notes are anchored to the open chapter.
   *Known gap:* the reading-font preference applies to the title and WebView
   editor path only — the native iOS editor exposes no font-family prop, so the
   note body font will not change. Expected, not a bug.

### Navigation

5. **Reader header.** Gear icon top-left opens reader settings; the `Aa` button
   is gone; the book/chapter title is still centered.
6. **Settings.** Home avatar → You → gear → Settings. Every section round-trips:
   theme flips live, locked fonts open the premium sheet, the reminder toggle
   schedules/cancels, and midday → check-in schedule → back lands on **Settings**
   (not You). From the reader's settings sheet → "All settings" → back must
   return to the **reader's** tab.
7. **Back behavior + labels.** Reader back pops the stack (repeated back must not
   stack Home on itself). The archive reads "Past Devotionals" everywhere.

### Companion

8. **Streaming.** Replies should read as continuous flow, not ~30 discrete pops
   per second. Toggle Reduce Motion → text appears instantly instead.
9. **Stream lifecycle.** Switch conversations mid-stream: the old request aborts
   and its suggestions/errors don't leak onto the new conversation. Airplane-mode
   mid-stream: partial text kept with an error banner, not a blank row. Trigger
   an error on the **first** message of a fresh session — the banner must appear
   (it was previously swallowed).

### Performance

10. **Cold start** should feel faster (splash-blocking fonts cut ~73%). Switching
    reading font may briefly show Source Serif before swapping in — expected, the
    other families now load on demand.
11. **Psalm 119** scrolls without jank; verse selection is responsive.
12. **My Library** Journal/Saved/Bookmarks scroll smoothly, filter chips work,
    empty states render, `?tab=` deep links land on the right tab.
