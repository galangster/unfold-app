Build 214 adds the Apple Books-inspired reader preferences polish for internal TestFlight QA.

What changed since build 213:
- Bible and devotional readers now share a calmer bottom-sheet preferences pattern instead of separate overlay/card treatments.
- Reader appearance controls add font, size, line-height, theme, and brightness affordances with safer accessibility labels and 44pt touch-target contracts.
- Devotional readers now expose a saved highlights/library row so testers can jump back into saved highlights more directly.
- Note detail, editor, PDF export, and Companion drawer polish remove heavy side-tab accents and reduce uppercase/tracked scaffolding.
- Closed Companion drawer state now hides descendants from accessibility traversal until opened.

What to test:
- Open a devotional reading, tap reader preferences, adjust type/brightness settings, dismiss the sheet, and confirm reading stays calm and usable.
- Open Bible reader settings and verify the sheet, controls, translations row, and saved highlights entry feel consistent with the devotional reader.
- Save or open a highlight/library entry and confirm the saved highlights row routes cleanly.
- Check note detail, note editor, and PDF/share preview surfaces for quieter callouts without heavy left accent strips.
- Open and close the Companion drawer; confirm closed drawer content is not reachable through accessibility navigation.
- Smoke Today, Bible, Notebook, Companion, paywall/products, and notifications/widgets from build 213 to ensure no regression.

Source commits on branch mina/reader-preferences-apple-books:
- 9372c26 feat(reader): add shared reader bottom sheet
- 611e284 feat(reader): add appearance controls and brightness
- b1201cd feat(today): migrate devotional reader preferences sheet
- 486889c feat(bible): migrate reader preferences sheet
- 77bfd3e feat(reader): add saved highlights entry from readers
- 7385fae fix(design): remove side-tab accents and reduce uppercase scaffolding
- 53b964d fix(a11y): standardize core touch targets and hidden drawer semantics

App Review build attachment is intentionally unchanged.
