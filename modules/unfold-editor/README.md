# unfold-editor

Native iOS rich text editor for Unfold's Notebook, built on [Proton](https://github.com/nicholasgalante1997/proton) + TextKit 1 + UITextView. Bridged into the Expo RN app as a local Expo Module with Fabric native view.

Replaces the WebView-based `@10play/tentap-editor`. See `spike-notebook-native/SPEC.md` for full rationale and feature contract.

## Usage

```tsx
import { UnfoldEditor, type UnfoldEditorRef } from 'unfold-editor';

const editorRef = useRef<UnfoldEditorRef>(null);

<UnfoldEditor
  ref={editorRef}
  initialHtml={note.htmlContent}
  onChangeHtml={(e) => debouncedSave(note.id, e.nativeEvent.html)}
  onScriptureRefs={(e) => setRefs(e.nativeEvent.refs)}
  autoFocus
/>
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `initialHtml` | `string` | `""` | HTML seed, decoded once on mount. Subsequent changes ignored (uncontrolled). |
| `placeholder` | `string` | — | Shown when editor is empty. |
| `editable` | `boolean` | `true` | Whether the editor accepts input. |
| `autoFocus` | `boolean` | `false` | Requests first responder 300ms after mount. |
| `keyboardAppearance` | `'default' \| 'light' \| 'dark'` | `'default'` | iOS keyboard chrome. |

## Events

| Event | Payload | Debounce |
|---|---|---|
| `onChangeHtml` | `{ html: string }` | 200ms native-side |
| `onScriptureRefs` | `{ refs: ScriptureRef[] }` | Same window as onChangeHtml |
| `onEditorFocus` | `{}` | — |
| `onEditorBlur` | `{}` | — |
| `onEditorSelectionChange` | `SelectionState` | 16ms throttle (60fps cap) |

## Imperative commands (via ref)

```ts
// Queries
await editorRef.current.getHtml();            // returns HTML string
await editorRef.current.getSelectionState();   // returns SelectionState

// Focus
await editorRef.current.focus();
await editorRef.current.blur();

// Inline formatting
await editorRef.current.toggleBold();
await editorRef.current.toggleItalic();
await editorRef.current.toggleUnderline();
await editorRef.current.toggleStrikethrough();

// Block types
await editorRef.current.setBlockType('p');     // body, h1, h2, h3, blockquote, pre

// Lists
await editorRef.current.setList('bullet');     // bullet, ordered, checklist
await editorRef.current.clearList();
await editorRef.current.toggleChecklist();
await editorRef.current.indentList();
await editorRef.current.outdentList();

// Insertion
await editorRef.current.insertImage(fileUri);  // file:// URI from expo-image-picker
await editorRef.current.insertLink(url);

// History
await editorRef.current.undo();
await editorRef.current.redo();
```

## SelectionState

Pushed via `onEditorSelectionChange` and pulled via `getSelectionState()`. Inline booleans are **suppressed** — they reflect what the user can intentionally toggle, not raw attribute state (e.g. `bold: false` inside headings where bold is implicit).

```ts
interface SelectionState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  hasLink: boolean;
  linkUrl: string | null;
  blockType: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote' | 'pre';
  listType: 'bullet' | 'ordered' | 'checklist' | null;
  start: number;
  end: number;
}
```

## HTML schema

Minimal, normalized, lossless within the feature set:

```html
<p>Body with <b>bold</b>, <i>italic</i>, <u>underline</u>, <s>strike</s>, <code>code</code>, <a href="...">link</a>.</p>
<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<blockquote>Quoted</blockquote>
<pre><code>Code block</code></pre>
<ul><li data-level="1">Bullet</li></ul>
<ol><li data-level="1">Numbered</li></ol>
<ul data-type="checklist"><li data-checked="false">Todo</li></ul>
<img src="file://..." width="320" height="180" />
```

## Integration into note-detail.tsx (Phase C)

1. Add `"unfold-editor"` to `package.json` dependencies (local module, already symlinked).
2. `pod install` in `ios/` picks up the podspec automatically.
3. Replace the tentap `<EditorBridge>` with `<UnfoldEditor>` using the same Zustand store hooks.
4. Wire `onChangeHtml` → `debouncedSave(note.id, html)`.
5. Wire `onScriptureRefs` → existing scripture chip navigation.
6. Platform guard: `Platform.OS === 'ios' ? <UnfoldEditor /> : <TentapEditor />` until Android is built.

## Dev testing

Deep link: `unfold://__dev__/unfold-editor-test`

The test screen mounts the editor with seed HTML, shows live `SelectionState`, an `html changes` counter, and exposes every command as a tappable button.

## Module structure

```
modules/unfold-editor/
├── expo-module.config.json
├── package.json
├── ios/
│   ├── UnfoldEditor.podspec
│   ├── Resources/Fonts/          # Inter + Gupter TTFs
│   ├── UnfoldEditorModule.swift  # Expo module + AsyncFunction commands
│   ├── UnfoldEditorView.swift    # ExpoView subclass, prop/event bridge
│   ├── UnfoldEditorController.swift  # Proton EditorView host + commands
│   ├── HtmlEncoder.swift         # NSAttributedString → HTML
│   ├── HtmlDecoder.swift         # HTML → NSAttributedString
│   ├── ScriptureRefParser.swift  # Regex extraction from plain text
│   ├── ScriptureChipStrip.swift  # Horizontal chip scroll view
│   ├── LineDecorationOverlay.swift   # Blockquote bars + code bg
│   ├── UnfoldColors.swift        # Dynamic color tokens
│   ├── UnfoldFonts.swift         # Font helpers with fallbacks
│   ├── UnfoldListFormattingProvider.swift  # Bullet/number markers
│   ├── UnfoldEditorFontLoader.swift  # CTFontManager registration
│   └── SampleImageGenerator.swift    # Placeholder + image attachments
└── src/
    ├── index.ts
    ├── UnfoldEditor.tsx          # React component with imperative handle
    └── UnfoldEditorView.ts       # Native view manager + types
```
