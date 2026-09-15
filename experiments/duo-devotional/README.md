# Unfold devotional layout study

A Vite + Svelte prototype of a connected reading and reflection session. It explores a facing-page experience and a reflection desk. [Design direction and capability evidence](DESIGN.md).

## Run

CI uses Bun 1.3.14 and Node 24.

    bun install --frozen-lockfile
    bun run dev

Open http://127.0.0.1:4386/. The server binds to localhost. Dependencies and checks belong to this package. The mobile application does not import it.

## Explore

1. Continue the devotional from Today.
2. Read the scripture and prose together. Choose a question and write beside the reading.
3. Change among closed, flat portrait, flat landscape, book, upright book, seated, and standing previews.
4. Try large text, 200% text, and reduced height. The active pane takes priority.
5. In narrow and seated arrangements, use the question picker. The selected prompt remains near its response.
6. Choose **Stay with this passage** or **Stay with this prayer**, then return to the same reading position.
7. Open **Session diagnostics** to inspect the anchor, revision, and selection. Simulate a save failure, then retry.

The two panes remain mounted. The session store owns the paragraph/character anchor, question drafts, selections, bookmark, and route. Presentation choices also persist before first render. A layout change does not send text, complete a day, or request keyboard focus.

Storage is local to this browser origin. A failed write keeps the latest draft in the open tab. Reload recovery requires a successful write. The prototype provides no account sync or conflict resolution. It contains one illustrative devotional with KJV scripture.

## Check

    bun run lint
    bun run check
    bun run test
    bun run build

[Audit](AUDIT.md) records the six-domain review, fixes, rejected changes, and browser verification. [Contrast evidence](contrast.json) covers both themes and a conservative upper bound for the artwork overlays.

The scoped GitHub workflow runs these package checks. The repository's existing CVL workflow still runs its mobile gates.

The test command runs store recovery, Svelte component, and real Oxlint fixture checks. The component environment controls frames and geometry. Use the browser walkthrough above for actual layout acceptance. The check command also validates the vendored lint rules with strict TypeScript.

## Scope

This is a browser design experiment. Position choices simulate layouts with illustrative dimensions. Native hinge sensing, reserved regions, SDK access, keyboard geometry, VoiceOver, native input composition, and process recovery remain unverified. Bible, Companion, and Journal remain design proposals in DESIGN.md. Native implementation resumes after SDK and runtime access are verified.

Fonts are compressed Latin subsets of the existing application faces in ../../assets/fonts. Other scripts use the platform fallback. The three WOFF2 files total 102,512 bytes, down from 621,632 source bytes. FontTools 4.65.0 preserved layout features and covered U+0020–024F, U+2000–206F, U+20AC, and U+FFFD.

The anti-slop plugin is vendored under tools/oxlint/anti-slop. Its runtime and Oxlint are pinned to 1.83.0. The main checkout and its dependencies remain separate from this experiment.
