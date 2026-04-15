# Selection State API (Day 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `onEditorSelectionChange` event and `getSelectionState()` query to the unfold-editor Expo local module so a React toolbar can reflect active formatting at the cursor.

**Architecture:** Proton's `EditorViewDelegate` already fires `editor(_:didChangeSelectionAt:attributes:contentType:)` on every cursor move. The controller implements this delegate, builds a `SelectionState` dictionary using HtmlEncoder's block detection + inline attribute inspection with suppression, and pushes it to JS via a new EventDispatcher. A parallel `getSelectionState()` AsyncFunction provides pull-based access for mount and post-command refresh.

**Tech Stack:** Swift (Proton EditorView, Expo Modules Core), TypeScript (React Native)

**Design spec:** `~/vault/projects/unfold/specs/2026-04-15-protonspike-phase-b-day8-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `modules/unfold-editor/ios/HtmlEncoder.swift` | Modify | Add `querySelectionState` public static method |
| `modules/unfold-editor/ios/UnfoldEditorController.swift` | Modify | Implement delegate, throttle, closure, `getSelectionState()` |
| `modules/unfold-editor/ios/UnfoldEditorModule.swift` | Modify | Register event + AsyncFunction |
| `modules/unfold-editor/ios/UnfoldEditorView.swift` | Modify | Add EventDispatcher + closure wiring |
| `modules/unfold-editor/src/UnfoldEditorView.ts` | Modify | Add `SelectionState` type, event prop, handle method |
| `modules/unfold-editor/src/UnfoldEditor.tsx` | Modify | Wire `getSelectionState` through imperative handle, forward event |
| `modules/unfold-editor/src/index.ts` | Modify | Export new types |
| `src/app/__dev__/unfold-editor-test.tsx` | Modify | Add live selection state display + onChangeHtml keyboard indicator |

---

### Task 1: HtmlEncoder — add `querySelectionState` static method

**Files:**
- Modify: `modules/unfold-editor/ios/HtmlEncoder.swift:29` (inside `enum HtmlEncoder`)

This method reuses the existing private `detectBlockType`, `checklistChecked`, and `listLevel` helpers — no access level changes needed because the new method lives inside the same `enum HtmlEncoder` scope.

- [ ] **Step 1: Add the `querySelectionState` method after the `encode` method (after line 151)**

Insert this method between the `encode` closing brace (line 151) and the `// MARK: - Block type detection` comment (line 153):

```swift
  // MARK: - Selection state query

  /// Builds a selection-state dictionary for the JS toolbar. Uses the same
  /// block-detection and inline-attribute logic as `encode`, but runs at a
  /// single point (the cursor / selection start) rather than walking the
  /// whole document.
  ///
  /// Inline booleans are **suppressed / commandable**: bold is false inside
  /// headings (implicit), italic is false inside blockquotes, etc. This
  /// prevents the toolbar from offering to toggle a trait that would break
  /// block identity.
  static func querySelectionState(
    in str: NSAttributedString,
    selectedRange range: NSRange
  ) -> [String: Any] {
    guard str.length > 0 else {
      return emptySelectionState(range: range)
    }

    let nsString = str.string as NSString
    let location = min(range.location, max(0, str.length - 1))
    let paraRange = nsString.paragraphRange(
      for: NSRange(location: location, length: 0))
    let blockType = detectBlockType(in: str, range: paraRange)

    // Read attributes at cursor / selection-start
    let attrs = str.attributes(at: location, effectiveRange: nil)
    let font = attrs[.font] as? UIFont
    let traits = font?.fontDescriptor.symbolicTraits ?? []
    let rawBold = traits.contains(.traitBold)
    let rawItalic = traits.contains(.traitItalic)
    let rawMonospace = traits.contains(.traitMonoSpace)
    let rawUnderline = (attrs[.underlineStyle] as? Int ?? 0) != 0
    let rawStrikethrough = (attrs[.strikethroughStyle] as? Int ?? 0) != 0
    let hasLink = attrs[.link] != nil
    let linkUrl = (attrs[.link] as? URL)?.absoluteString

    // Suppression: report commandable state, not raw visual state.
    let isHeading = (blockType == .heading1
      || blockType == .heading2
      || blockType == .heading3)
    let isCodeBlock = (blockType == .codeBlock)
    let isBlockquote = (blockType == .blockquote)
    let isCheckedChecklist = (blockType == .checklist)
      && checklistChecked(in: str, at: paraRange.location)

    let bold = isCodeBlock ? false : (isHeading ? false : rawBold)
    let italic = isCodeBlock ? false : (isBlockquote ? false : rawItalic)
    let underline = isCodeBlock ? false : (hasLink ? false : rawUnderline)
    let strikethrough = isCodeBlock ? false
      : (isCheckedChecklist ? false : rawStrikethrough)
    let code = isCodeBlock ? false : rawMonospace

    // Block type string
    let blockTypeStr: String
    switch blockType {
    case .heading1: blockTypeStr = "h1"
    case .heading2: blockTypeStr = "h2"
    case .heading3: blockTypeStr = "h3"
    case .blockquote: blockTypeStr = "blockquote"
    case .codeBlock: blockTypeStr = "pre"
    default: blockTypeStr = "p"
    }

    // List type (null for non-list blocks)
    let listTypeVal: Any
    switch blockType {
    case .bulletList: listTypeVal = "bullet"
    case .orderedList: listTypeVal = "ordered"
    case .checklist: listTypeVal = "checklist"
    default: listTypeVal = NSNull()
    }

    return [
      "bold": bold,
      "italic": italic,
      "underline": underline,
      "strikethrough": strikethrough,
      "code": code,
      "hasLink": hasLink,
      "linkUrl": linkUrl as Any? ?? NSNull(),
      "blockType": blockTypeStr,
      "listType": listTypeVal,
      "start": range.location,
      "end": NSMaxRange(range),
    ]
  }

  private static func emptySelectionState(range: NSRange) -> [String: Any] {
    [
      "bold": false, "italic": false, "underline": false,
      "strikethrough": false, "code": false,
      "hasLink": false, "linkUrl": NSNull(),
      "blockType": "p", "listType": NSNull(),
      "start": range.location, "end": NSMaxRange(range),
    ]
  }
```

- [ ] **Step 2: Verify it compiles**

No build yet — this method has no callers. Compilation happens in Task 5.

- [ ] **Step 3: Commit**

```bash
git add modules/unfold-editor/ios/HtmlEncoder.swift
git commit -m "feat(unfold-editor): add querySelectionState to HtmlEncoder

Reuses existing detectBlockType, checklistChecked, and listLevel
helpers. Returns suppressed/commandable inline booleans + paragraph-
scanned block/list state + selection range."
```

---

### Task 2: UnfoldEditorController — selection delegate + throttle + getSelectionState

**Files:**
- Modify: `modules/unfold-editor/ios/UnfoldEditorController.swift`

- [ ] **Step 1: Add the `onEditorSelectionChange` closure and throttle state (after line 32)**

After the existing `onBlur` closure (line 32), add:

```swift
  var onEditorSelectionChange: (([String: Any]) -> Void)?

  // MARK: - Selection throttle state

  /// Tracks the last time a selection-change event was emitted. Used by
  /// `throttleSelectionEmit` to enforce a 16ms (≈60fps) cap so rapid drag
  /// selections don't saturate the JS bridge.
  private var lastSelectionEmitTime: CFTimeInterval = 0
  private var selectionThrottleWorkItem: DispatchWorkItem?
  private static let selectionThrottleInterval: CFTimeInterval = 0.016
```

- [ ] **Step 2: Add cleanup in `deinit` (after line 102)**

Existing `deinit` (lines 101-104) cancels `changeDebounceTimer`. Add throttle cleanup:

```swift
  deinit {
    changeDebounceTimer?.cancel()
    changeDebounceTimer = nil
    selectionThrottleWorkItem?.cancel()
    selectionThrottleWorkItem = nil
  }
```

- [ ] **Step 3: Add `getSelectionState()` public method (after line 149, after `blur()`)**

```swift
  /// Returns the current formatting state at the cursor / selection start.
  /// Used by JS for initial mount state and post-command toolbar refresh.
  func getSelectionState() -> [String: Any] {
    HtmlEncoder.querySelectionState(
      in: editor.attributedText,
      selectedRange: editor.selectedRange)
  }
```

- [ ] **Step 4: Add `editor(_:didChangeSelectionAt:...)` delegate method (after line 434, after `didLoseFocusFrom`)**

```swift
  func editor(
    _ editor: EditorView,
    didChangeSelectionAt range: NSRange,
    attributes: [NSAttributedString.Key: Any],
    contentType: EditorContent.Name
  ) {
    let state = HtmlEncoder.querySelectionState(
      in: editor.attributedText,
      selectedRange: range)
    throttleSelectionEmit(state)
  }
```

- [ ] **Step 5: Add `throttleSelectionEmit` private method (after `scheduleHtmlEmit`, before `toggleChecklist(at:)`)**

```swift
  /// Throttled emission of `onEditorSelectionChange`. Emits immediately if
  /// outside the 16ms cooldown window; otherwise defers to the next window
  /// boundary so the last state in a burst is never dropped.
  ///
  /// Must be called from the main thread (Proton's delegate fires there).
  private func throttleSelectionEmit(_ state: [String: Any]) {
    let now = CACurrentMediaTime()
    let elapsed = now - lastSelectionEmitTime

    if elapsed >= Self.selectionThrottleInterval {
      // Outside cooldown — emit immediately
      lastSelectionEmitTime = now
      selectionThrottleWorkItem?.cancel()
      selectionThrottleWorkItem = nil
      onEditorSelectionChange?(state)
    } else {
      // Inside cooldown — schedule deferred emit at end of window
      selectionThrottleWorkItem?.cancel()
      let item = DispatchWorkItem { [weak self] in
        guard let self = self else { return }
        self.lastSelectionEmitTime = CACurrentMediaTime()
        self.onEditorSelectionChange?(state)
        self.selectionThrottleWorkItem = nil
      }
      selectionThrottleWorkItem = item
      let delay = Self.selectionThrottleInterval - elapsed
      DispatchQueue.main.asyncAfter(
        deadline: .now() + delay,
        execute: item)
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add modules/unfold-editor/ios/UnfoldEditorController.swift
git commit -m "feat(unfold-editor): wire selection-change delegate + 16ms throttle

Implements editor(_:didChangeSelectionAt:...) delegate. Builds full
SelectionState via HtmlEncoder.querySelectionState. Adds pull-based
getSelectionState() for mount + post-command refresh. Throttle uses
main-thread DispatchWorkItem with 16ms cooldown."
```

---

### Task 3: UnfoldEditorModule — register event + AsyncFunction

**Files:**
- Modify: `modules/unfold-editor/ios/UnfoldEditorModule.swift:41` (Events line) and after line 113 (last AsyncFunction)

- [ ] **Step 1: Add `onEditorSelectionChange` to the Events list (line 41)**

Change:
```swift
      Events("onChangeHtml", "onScriptureRefs", "onEditorFocus", "onEditorBlur")
```
To:
```swift
      Events("onChangeHtml", "onScriptureRefs", "onEditorFocus", "onEditorBlur", "onEditorSelectionChange")
```

- [ ] **Step 2: Add `getSelectionState` AsyncFunction (after `insertImage` on line 113)**

```swift
      // --- Day 8: selection state (§10.B.8) ---

      AsyncFunction("getSelectionState") { (view: UnfoldEditorView) -> [String: Any] in
        view.controller.getSelectionState()
      }
```

- [ ] **Step 3: Commit**

```bash
git add modules/unfold-editor/ios/UnfoldEditorModule.swift
git commit -m "feat(unfold-editor): register onEditorSelectionChange event + getSelectionState function"
```

---

### Task 4: UnfoldEditorView (Swift) — EventDispatcher + closure wiring

**Files:**
- Modify: `modules/unfold-editor/ios/UnfoldEditorView.swift`

- [ ] **Step 1: Add the EventDispatcher (after line 19, after `onEditorBlur`)**

```swift
  let onEditorSelectionChange = EventDispatcher()
```

- [ ] **Step 2: Wire the controller closure (after the `onBlur` wiring, around line 77)**

After:
```swift
    controller.onBlur = { [weak self] in
      self?.onEditorBlur([:])
    }
```

Add:
```swift
    controller.onEditorSelectionChange = { [weak self] state in
      self?.onEditorSelectionChange(state)
    }
```

- [ ] **Step 3: Commit**

```bash
git add modules/unfold-editor/ios/UnfoldEditorView.swift
git commit -m "feat(unfold-editor): wire onEditorSelectionChange EventDispatcher"
```

---

### Task 5: TypeScript — types, event prop, imperative handle

**Files:**
- Modify: `modules/unfold-editor/src/UnfoldEditorView.ts`
- Modify: `modules/unfold-editor/src/UnfoldEditor.tsx`
- Modify: `modules/unfold-editor/src/index.ts`

- [ ] **Step 1: Add `SelectionState` type and event type to `UnfoldEditorView.ts` (after line 24)**

After `UnfoldEditorFocusEvent`, add:

```ts
/**
 * Formatting + block state at the current cursor / selection start.
 * Inline booleans are suppressed/commandable (e.g. bold=false inside H1).
 */
export type UnfoldEditorSelectionState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  hasLink: boolean;
  linkUrl: string | null;
  blockType: UnfoldEditorBlockType;
  listType: UnfoldEditorListType | null;
  start: number;
  end: number;
};

export type UnfoldEditorSelectionChangeEvent = {
  nativeEvent: UnfoldEditorSelectionState;
};
```

- [ ] **Step 2: Add `onEditorSelectionChange` to props (inside `UnfoldEditorViewProps`, after line 49)**

After the `onEditorBlur` prop:

```ts
  onEditorSelectionChange?: (event: UnfoldEditorSelectionChangeEvent) => void;
```

- [ ] **Step 3: Add `getSelectionState` to the imperative handle (inside `UnfoldEditorViewRef`, after line 89)**

After `insertLink`:

```ts
  // Selection state (Day 8)
  getSelectionState: () => Promise<UnfoldEditorSelectionState>;
```

- [ ] **Step 4: Wire `getSelectionState` through `UnfoldEditor.tsx` imperative handle**

In `modules/unfold-editor/src/UnfoldEditor.tsx`, inside the `React.useImperativeHandle` return object (after the `insertLink` entry around line 82), add:

```ts
        getSelectionState: async () => {
          const state = await viewRef.current?.getSelectionState();
          return (
            state ?? {
              bold: false,
              italic: false,
              underline: false,
              strikethrough: false,
              code: false,
              hasLink: false,
              linkUrl: null,
              blockType: 'p' as const,
              listType: null,
              start: 0,
              end: 0,
            }
          );
        },
```

Also add the import at the top of `UnfoldEditor.tsx` — update the import from `./UnfoldEditorView` to include `UnfoldEditorSelectionState` (it's used as a return type, so needs to be available):

The existing import (line 3-8):
```ts
import NativeView, {
  type UnfoldEditorBlockType,
  type UnfoldEditorListType,
  type UnfoldEditorViewProps,
  type UnfoldEditorViewRef,
} from './UnfoldEditorView';
```

This doesn't need to change — `UnfoldEditorSelectionState` is part of `UnfoldEditorViewRef`'s return type, and TypeScript resolves it structurally. No explicit import needed in the wrapper.

- [ ] **Step 5: Export new types from `index.ts`**

In `modules/unfold-editor/src/index.ts`, add to the type exports from `./UnfoldEditorView`:

```ts
  UnfoldEditorSelectionState,
  UnfoldEditorSelectionChangeEvent,
```

So the full re-export block becomes:

```ts
export type {
  UnfoldEditorBlockType,
  UnfoldEditorListType,
  UnfoldEditorKeyboardAppearance,
  UnfoldEditorViewProps,
  UnfoldEditorViewRef,
  UnfoldEditorScriptureRef,
  UnfoldEditorChangeHtmlEvent,
  UnfoldEditorScriptureRefsEvent,
  UnfoldEditorFocusEvent,
  UnfoldEditorSelectionState,
  UnfoldEditorSelectionChangeEvent,
} from './UnfoldEditorView';
```

- [ ] **Step 6: Commit**

```bash
git add modules/unfold-editor/src/UnfoldEditorView.ts \
       modules/unfold-editor/src/UnfoldEditor.tsx \
       modules/unfold-editor/src/index.ts
git commit -m "feat(unfold-editor): add SelectionState types, event prop, and getSelectionState handle method"
```

---

### Task 6: Test screen — selection state display + onChangeHtml verification

**Files:**
- Modify: `src/app/__dev__/unfold-editor-test.tsx`

- [ ] **Step 1: Import the new types (update line 6-10)**

Change:
```ts
import {
  UnfoldEditor,
  type UnfoldEditorBlockType,
  type UnfoldEditorListType,
  type UnfoldEditorRef,
} from 'unfold-editor';
```
To:
```ts
import {
  UnfoldEditor,
  type UnfoldEditorBlockType,
  type UnfoldEditorListType,
  type UnfoldEditorRef,
  type UnfoldEditorSelectionState,
  type UnfoldEditorSelectionChangeEvent,
  type UnfoldEditorChangeHtmlEvent,
} from 'unfold-editor';
```

- [ ] **Step 2: Add selection state and HTML-change tracking state (inside the component, after `editorRef`)**

After line 52 (`const editorRef = ...`):

```ts
  const [selectionState, setSelectionState] =
    React.useState<UnfoldEditorSelectionState | null>(null);
  const [htmlChangeCount, setHtmlChangeCount] = React.useState(0);

  const handleSelectionChange = React.useCallback(
    (event: UnfoldEditorSelectionChangeEvent) => {
      setSelectionState(event.nativeEvent);
    },
    []
  );

  const handleChangeHtml = React.useCallback(
    (_event: UnfoldEditorChangeHtmlEvent) => {
      setHtmlChangeCount((c) => c + 1);
    },
    []
  );
```

- [ ] **Step 3: Wire the event props on the `<UnfoldEditor>` component (around line 178-188)**

Change:
```tsx
        <UnfoldEditor
          ref={editorRef}
          style={styles.editor}
          initialHtml={SEED_HTML}
          placeholder="Write a reflection…"
          editable
          keyboardAppearance="dark"
          onChangeHtml={() => {
            // no-op — debounced HTML snapshot
          }}
        />
```
To:
```tsx
        <UnfoldEditor
          ref={editorRef}
          style={styles.editor}
          initialHtml={SEED_HTML}
          placeholder="Write a reflection…"
          editable
          keyboardAppearance="dark"
          onChangeHtml={handleChangeHtml}
          onEditorSelectionChange={handleSelectionChange}
        />
```

- [ ] **Step 4: Add the selection state display between the editor and toolbar**

After the closing `/>` of `<UnfoldEditor>` and before `<ScrollView`, add:

```tsx
        {/* Day 8: live selection state + HTML change counter */}
        <View style={styles.stateBar}>
          <Text style={styles.stateLabel}>
            html changes: {htmlChangeCount}
          </Text>
          {selectionState && (
            <View style={styles.stateRow}>
              {selectionState.bold && (
                <Text style={[styles.stateBadge, styles.stateBadgeActive]}>B</Text>
              )}
              {selectionState.italic && (
                <Text style={[styles.stateBadge, styles.stateBadgeActive]}>I</Text>
              )}
              {selectionState.underline && (
                <Text style={[styles.stateBadge, styles.stateBadgeActive]}>U</Text>
              )}
              {selectionState.strikethrough && (
                <Text style={[styles.stateBadge, styles.stateBadgeActive]}>S</Text>
              )}
              {selectionState.code && (
                <Text style={[styles.stateBadge, styles.stateBadgeActive]}>{'<>'}</Text>
              )}
              {selectionState.hasLink && (
                <Text style={[styles.stateBadge, styles.stateBadgeActive]}>🔗</Text>
              )}
              <Text style={styles.stateLabel}>
                {selectionState.blockType}
                {selectionState.listType ? ` · ${selectionState.listType}` : ''}
              </Text>
              <Text style={styles.stateLabel}>
                [{selectionState.start},{selectionState.end}]
              </Text>
            </View>
          )}
        </View>
```

- [ ] **Step 5: Add a `getState` button to the bridge row (in the `bridgeButtons` array)**

After the `blur` button:

```ts
    {
      label: 'getState',
      onPress: async () => {
        const state = await editorRef.current?.getSelectionState();
        Alert.alert('getSelectionState()', JSON.stringify(state, null, 2));
      },
    },
```

- [ ] **Step 6: Add styles for the state bar (in the `StyleSheet.create` block)**

```ts
  stateBar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    backgroundColor: '#111',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  stateLabel: {
    color: '#888',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  stateBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1f1f1f',
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stateBadgeActive: {
    backgroundColor: '#2d4a2d',
    color: '#8bef8b',
  },
```

- [ ] **Step 7: Update the screen title (line 177)**

Change:
```tsx
      <Stack.Screen options={{ title: 'UnfoldEditor Day 6' }} />
```
To:
```tsx
      <Stack.Screen options={{ title: 'UnfoldEditor Day 8' }} />
```

- [ ] **Step 8: Commit**

```bash
git add src/app/__dev__/unfold-editor-test.tsx
git commit -m "feat(unfold-editor): add selection state display + html change counter to test screen"
```

---

### Task 7: Symlink fix + build + visual verification

**Files:** None (build/verification only)

- [ ] **Step 1: Fix the node_modules symlink (known gotcha)**

```bash
cd ~/clawd/work/unfold/app/mobile
rm -rf node_modules/unfold-editor
ln -s ../modules/unfold-editor node_modules/unfold-editor
```

- [ ] **Step 2: Verify Metro is running**

```bash
lsof -iTCP:8081 -sTCP:LISTEN
```

If nothing shows up:

```bash
cd ~/clawd/work/unfold/app/mobile
nohup bun x expo start --clear --scheme unfold > /tmp/metro-day8.log 2>&1 & disown
```

Wait a few seconds, then verify with `lsof -iTCP:8081` again.

- [ ] **Step 3: Build and deploy to sim**

```bash
cd ~/clawd/work/unfold/app/mobile
flowdeck run -S 42D6EF60-8F7C-4C0F-885E-A751609199B3
```

If the build fails, check the error. Common Day 8 failure modes:
- Missing import: Proton's `EditorContent.Name` type might need explicit import
- Event name collision: if `onEditorSelectionChange` hits the direct+bubbling invariant, the build error will reference `topEditorSelectionChange` — this confirms it's safe (no collision with TextInput's `topSelectionChange`)

- [ ] **Step 4: Open the test screen**

```bash
xcrun simctl openurl 42D6EF60-8F7C-4C0F-885E-A751609199B3 "unfold://__dev__/unfold-editor-test"
```

- [ ] **Step 5: Verify selection state event — cursor in bold text**

1. Tap into the editor to get focus.
2. Tap inside the "John 3:16" heading (H1 text).
3. Look at the state bar — should show `h1`, bold badge should NOT be lit (suppressed).
4. Tap inside a regular paragraph body text.
5. State bar should show `p`, no badges lit.
6. Select some text and tap the `bold` command button.
7. Move cursor into the bolded text.
8. State bar should show `B` badge lit (green) + `p`.
9. Move cursor out of bolded text → `B` badge should un-light.

Take a screenshot:
```bash
flowdeck ui simulator screen -S 42D6EF60-8F7C-4C0F-885E-A751609199B3 --output /tmp/day8-selection-bold.png
sips -Z 1000 /tmp/day8-selection-bold.png
```

- [ ] **Step 6: Verify getSelectionState() pull query**

1. Tap `getState` button in the bridge row.
2. Alert should show the full JSON with all fields.
3. Verify `bold`, `blockType`, `listType`, `start`, `end` are present and reasonable.

- [ ] **Step 7: Verify onChangeHtml fires on keyboard input**

1. Tap into the editor body text.
2. Type a character on the keyboard.
3. Watch the "html changes: N" counter — it should increment (after the 200ms debounce).
4. Type several characters quickly — counter should increment once (debounced).

Take a screenshot:
```bash
flowdeck ui simulator screen -S 42D6EF60-8F7C-4C0F-885E-A751609199B3 --output /tmp/day8-html-change.png
sips -Z 1000 /tmp/day8-html-change.png
```

- [ ] **Step 8: Verify block type detection across block types**

Tap cursor into each block type and verify the state bar:
1. H1 ("John 3:16") → `h1`, no bold badge
2. H2 ("Observations") → `h2`, no bold badge
3. Blockquote → `blockquote`, no italic badge
4. Bullet list item → `p · bullet`
5. Checklist item → `p · checklist`
6. Code block → `pre`, no badges at all
7. Regular paragraph → `p`

- [ ] **Step 9: Final screenshot with all verification visible**

```bash
flowdeck ui simulator screen -S 42D6EF60-8F7C-4C0F-885E-A751609199B3 --output /tmp/day8-final.png
sips -Z 1000 /tmp/day8-final.png
```

- [ ] **Step 10: Squash or keep commits, final commit message**

If all verification passes, the individual task commits are clean. No squash needed — they tell a clear story.

---

### Task 8: Update MEMORY.md

**Files:**
- Modify: `~/vault/MEMORY.md` (L1 FOCUS section, Unfold line)

- [ ] **Step 1: Update the Unfold focus line**

Add Day 8 to the ProtonSpike progress. Update the "Recent Decisions" section with:

```
- 04XX | **ProtonSpike Phase B Day 8 shipped.** onEditorSelectionChange event (16ms throttled, full SelectionState payload with suppressed inline bools + paragraph-scanned block/list). getSelectionState() pull query for mount + post-command. Test screen proves bold feedback loop + onChangeHtml keyboard firing. Event namespaced to avoid RN collision.
```

(Replace `04XX` with actual date.)

- [ ] **Step 2: Remove Day 8 from ISSUES if listed**

If there's an issue about `onSelectionChange`/`getSelectionState` deferred to Day 8, remove it — it's shipped.
