# Devotional prototype interface audit

## Scope and Coverage

Full review of Today → devotional reading → reflection → an intentional passage or prayer session. Stack: Svelte 5, Vite 7, plain CSS, Lucide, and Unfold font assets. This review applies to the browser experiment. Native Duo integration and the wider app proposals in DESIGN.md remain outside acceptance.

Applied ui-polish, ui-review, and better-interface. The review followed the six owning domains in order.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Named controls, logical heading structure, hidden panes, skip link, keyboard reading, route focus, save-retry focus, forced colors, 44px targets | Clear after fixes |
| Layout | All seven position previews, Today hierarchy, paired and stacked content, actual 320px viewport, 200% text, reduced height | Clear after fixes |
| Writing | Labels, question states, empty editor, save failure, recovery, scope disclosure | Clear after fixes |
| Typography | Unfold faces, readable labels, input sizing, 200% text, line measure, WOFF2 subsets | Clear after fixes |
| Colors | Computed foreground values in both themes, placeholder opacity, conservative artwork bounds, focus indicators | Clear after fixes |
| UI | Active-task continuity, drafts, selections, reload recovery, interactive affordances, layout stability, restrained motion | Clear after fixes |

## Findings

These are resolved findings from the review passes. Locations identify the final implementation. No actionable interface finding remains within the stated scope.

| # | Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH | ui | src/session.js:59, src/session.js:77 | Invalid route metadata could discard valid drafts. Arbitrary anchor IDs could reach a selector. Insets could lose their sign or precision. | Normalize fields independently. Retain valid draft strings. Restrict anchor IDs and preserve finite fractional insets. | Recovery must preserve writing and a valid reading position. |
| 2 | HIGH | ui | src/ReadingPane.svelte:78 | Scrolling reading after an edit could leave reflection marked active. Closing then showed the wrong activity. | Reading scroll, pointer, and focus interaction establish reading as active. Focus stays in the visible reading region. | Folding must preserve the activity the person is using. |
| 3 | HIGH | accessibility | src/App.svelte:69, src/App.svelte:107, src/ReflectionPane.svelte:57 | Route changes and a disappearing Retry button could lose focus. The editor name omitted its visible label. | Focus the destination or restored editor. Provide a skip link and visible-label association. Hidden panes leave traversal. | Keyboard users need a stable destination and an accurate control name. |
| 4 | MEDIUM | writing | src/ReflectionPane.svelte:125 | “Your changes are still here” omitted the reload risk. | Explain that unsaved edits remain in this open tab and may be lost on reload. Keep Retry save available. | Recovery copy must distinguish memory from durable storage. |
| 5 | MEDIUM | layout | src/ReflectionPane.svelte:87, src/style.css:369 | Three full questions crowded the editor in narrow and seated arrangements. | Keep all questions in the paired view. Use a native picker and nearby selected prompt when space contracts. | Writing gets priority while every question remains available. |
| 6 | MEDIUM | ui | src/App.svelte:166, src/ReflectionPane.svelte:100 | Unimplemented destinations resembled working navigation. Chevrons suggested accordions. | Remove dead destinations and misleading chevrons. Show a reserved pen mark for a started response. | Controls must communicate their actual behavior. |
| 7 | MEDIUM | colors | src/style.css:31, src/style.css:164, src/style.css:231 | Light labels measured 4.28:1 on the outside background. Placeholder opacity and artwork further reduced contrast. | Use a darker neutral, opaque placeholder text, quieter artwork, and neutral focus colors. | Text and focus need enough contrast on their actual backgrounds. |
| 8 | MEDIUM | typography | src/style.css:1, src/style.css:77, src/style.css:327 | Small labels and narrow selects used 9–13px text. Raw fonts totaled 621,632 bytes. | Use readable UI type, 16px minimum narrow selects, scalable app labels, and 102,512 bytes of WOFF2 fonts. | Improve legibility, input behavior, and loading without changing the typefaces. |
| 9 | MEDIUM | ui | src/ReflectionPane.svelte:103, src/style.css:210 | Adding a Started label changed the question width and could move the editor while typing. | Reserve a fixed status column with an accessible response-started name. | Draft input must not shift its surrounding layout. |
| 10 | MEDIUM | ui | src/session.js:119, src/App.svelte:22 | Presentation controls reset on reload. | Recover valid preferences before first render and persist changes. | The returned session should use the person's chosen presentation. |
| 11 | LOW | layout | src/App.svelte:108, src/style.css:140 | A large repeated heading, motivational captions, fake home indicator, and deep hinge shadows competed with the task. | Use compact study chrome and quiet gutters. Retain only the subtle seated artwork relationship. | The reading and response should carry the composition. |

## Considered but Rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| src/style.css:140 | Add realistic hinge shading and animated reflection | The native geometry is unverified. More shading competes with the text. |
| src/App.svelte:32 | Force two panes at large text sizes | The current task and readable type need priority when space contracts. |
| src/ReflectionPane.svelte:100 | Animate each question change | Question selection is a frequent reading action. Immediate updates preserve attention and caret stability. |
| src/App.svelte:166 | Fill Today with additional cards | This experiment has one connected task. Extra cards would imply unimplemented features. |

## Verification

### Passed

| Check | Command or interaction | Result |
| --- | --- | --- |
| Prototype gates | bun run lint; bun run check; bun run test; bun run build | Zero lint errors. Zero Svelte errors or warnings. Three recovery tests pass. Vite builds. |
| Mobile repository gates | bun run typecheck; bun run lint; bun run test -- --runInBand; bun run verify:profiles | Typecheck and profile safety pass. Lint has zero errors and 3,805 existing warnings. 469 suites / 4,025 tests pass, with one suite and test skipped. |
| All seven arrangements | Seed p5 / character 128. Select characters 0–2 of a 40-character response. Change through every position. | Anchor, draft, revision, and selection remain identical. |
| Active reading | Edit a response, scroll the reading, then close the layout | Reading remains visible. The editor is hidden. Focus remains on reading-pane. |
| Independent responses | Write q1 and q2, select blank q3, return through Today → Continue your reflection | Existing writing remains separate. Resume selects an existing response. |
| Failure and retry | Simulate failure, edit, Tab to Retry save, then Enter | Newest revision remains in memory. Retry persists it and restores editor focus. |
| Reload | Reload with selected text, Book, reduced height, and 200% text | Draft, non-empty selection, route, question, and presentation return. |
| Narrow layout | Measure innerWidth and scrollWidth at 320px, with 200% text and reduced height | Both widths are 320px. Single pane and picker are visible. The 32px editor fits inside its scroll region. |
| Keyboard reading | Activate Read with Enter, then PageDown | Focus remains in reading-pane and its scroll position advances. |
| Standing session | Choose the prayer, switch to Standing, then return | Reading anchor prayer / character 158 and the draft remain unchanged. |
| Browser accessibility modes | Emulate reduced motion and forced colors, then traverse with Tab | Transition duration becomes 0s. A system focus outline remains visible. Emulation is reset afterward. |
| Targets and contrast | Inspect rendered control bounds and computed colors in both themes | Main controls are at least 44px. Twenty contrast pairs pass. The conservative light artwork case is 5.07:1. |
| Visual inspection | Light paired reading, dark seated reading, Today, empty/populated editor, narrow large text, save error | Hierarchy, wrapping, question context, and reachable controls inspected in the browser. |

Browser tests use synthetic responses on a separate localhost origin. They do not overwrite the owner's existing preview drafts. No loading state is present because this experiment uses static content.

The initial mobile typecheck exposed an outdated shared expo-audio dependency. A separate frozen-lockfile install supplied this worktree's dependencies. The shared checkout remained unchanged.

### Not verified

Native SDK integration, physical hinge geometry, native chrome, software/floating keyboards, VoiceOver speech and rotor behavior, native composition input, app process recovery, multi-device sync, localization, and physical touch-device acceptance. These remain explicit future gates. Browser results do not establish them.

### Simplify pass

The orchestrator completed one pass across reuse, simplification, efficiency, and module boundaries. This was not a four-agent review. Content identities come from the content module. Route and pane changes share restoration logic. Identical draft and selection updates avoid extra durable writes. Session normalization stays at the storage boundary. Reusing native React Native components here was rejected because this is an isolated Svelte experiment.

Cursor Grok 4.6 Extra High Fast produced the first source cleanup. Codex completed repairs, rendered review, and all checks. The worker ended before the orchestrator changed its files.

## Verdict

Approve
