# Save and highlight Scripture in a devotional

Approved by Nick on 2026-09-28 ("do what you recommend"). The proposal was made on 2026-09-27 in reply to tester feedback. Build it in slices, one pull request per slice.

## Why

Tester Micah (2026-09-26) likes bookmarking quotes and context notes. He asked for "a way to highlight or bookmark the scriptures that it gives you too".

Most of this already exists, but it is hard to find and partly tangled. Checked on `main` at `b2be53a4`:

- **Verse highlighting exists, but only sometimes.** The devotional passage uses `ScriptureVerseBlock` only when the local Bible database supplied the passage. Otherwise it renders one plain `Text` with no tap action. Nothing tells the reader that verses are tappable, and long-press does nothing.
- **The Scripture bookmark is keyed to the day, not the passage.** `handleToggleBookmark` in `reading.tsx` removes any bookmark with the same devotional and day, or else adds one whose `quotedText` is the day's `quotableLine`. `isCurrentDayBookmarked` matches only the devotional and the day.
  - So a quote bookmark lights the Scripture icon.
  - Tapping the Scripture icon can then remove the quote bookmark.
  - `ScriptureTapSheet` hides its Bookmark button when the day has any bookmark.
- **Box bookmarks lose their state.** Per the code map, the Quote, Historical Context and Word Study bookmarks in `DevotionalWebView` do not show as filled when the day reopens, and tapping again adds a duplicate. Verify before fixing.
- **Highlights lose their origin.** A highlight made inside a devotional is stored as a plain Bible highlight. `sync_bible_highlights` has no devotional or day column, so Saved cannot say where it came from.
- **Translations can disagree.** The tap sheet saves in `user.bibleTranslation` (BSB). The passage shows `bibleReaderSettings.translation`.

## Decisions (Nick, 2026-09-28)

1. **Saving Scripture is free**, like every bookmark today. No premium gate on bookmarks was found. The `Bookmark` type comment still says "premium feature", so correct that comment. Highlight colours keep the current rule: yellow is free, the other colours are premium.
2. **Saved Scripture lives with Bookmarks**, next to quotes and context notes. That means Journal › Saved › Bookmarks and My library › Bookmarks. Do not add a "Scripture" filter yet.
3. **Add provenance to Bible highlights on the backend**: nullable devotional id and day number columns. The backend merges first.

## Principle

Scripture behaves the same wherever it appears. The devotional passage reuses the gestures of the Bible tab and the bookmarks of the quote boxes. Add no new collection and no third highlight system.

## Slice 1: save the passage, fix bookmark identity, make verses discoverable

App only. No backend change.

Behaviour:

1. The Scripture card's bookmark saves the passage itself. It stores the reference, the passage text as displayed (in the translation shown), the devotional title, the day number and the day title. It uses the same glyph and motion as the quote and context boxes.
2. Every bookmark on a day has its own identity: devotional, day, kind and key.
   - Kind is one of scripture, quote, context or word study.
   - Key is the reference for Scripture and the saved text for the boxes.
   - Each control toggles only its own item.
3. When a day reopens, every saved item shows as filled. Tapping a filled control removes only that item. It never adds a duplicate.
4. The tap sheet shows Save or Saved for its own passage, whatever else is saved on the day. The tap sheet opens from a reference tap and from Related Scripture. It saves the translation that it displays.
5. The Saved row for a Scripture bookmark shows the reference and the Scripture text. Tapping it opens the day with the passage in view.
6. The first highlightable passage shows one line under it: "Tap a verse to highlight it". The line goes away after the first verse tap or a dismiss, and it never comes back (persisted flag).
7. Long-press on a verse selects it, the same as a tap.

States:

- **Not saved:** outline glyph.
- **Saved:** filled glyph, plus the existing "Saved to your library · View" toast.
- **Removed:** outline glyph, with the existing undo behaviour if the surface has one.
- **Offline:** saves locally. The sync outbox pushes the change later.

Accessibility:

- The bookmark control is labelled "Save {reference}" or "Remove {reference} from saved". It sets `accessibilityState.selected` and has a 44 × 44 pt target.
- Each verse has the hint "Double-tap to select this verse". Screen-reader users must not depend on the visual hint line.
- The hint line reflows with Dynamic Type and the reader's text size.

Responsive: the phone reader and the adaptive iPad reader both qualify. The hint wraps under the passage. Toggling the glyph causes no layout shift.

Acceptance:

- **AC1:** Bookmarking a quote does not change the Scripture glyph. Bookmarking the Scripture does not change a quote glyph.
- **AC2:** Removing the Scripture bookmark keeps the day's quote and context bookmarks.
- **AC3:** After a day reopens, every saved control shows as filled. A second tap removes the item, and the bookmark count never grows from a re-tap.
- **AC4:** The Saved row for a Scripture bookmark shows its reference and its Scripture text, in the translation the reader saw.
- **AC5:** The hint shows once per profile and never again after the first verse tap or a dismiss.
- **AC6:** Long-press selects a verse.
- **AC7:** Bookmarks from older builds, which are keyed by day, still display and remove correctly. Derive their kind from `scriptureReference`: 'Quote', 'Historical Context' and 'Word Study' map to the boxes, and anything else is Scripture.

## Slice 2: remember where a highlight came from

Backend first.

1. **Backend:** add nullable `source_devotional_id` and `source_day_number` to `sync_bible_highlights`. Push and pull carry both. Existing rows stay null.
2. **App:** a highlight made in the devotional passage records its source. Saved shows "{reference} · {series title}, Day {n}" and opens that reading. Highlights made in the Bible tab do not change.
3. **Acceptance:** a push and pull round trip keeps the source. A Bible-tab highlight has no source. Saved renders both kinds.

## Slice 3: one verse action bar

1. Extract the Bible reader's selection bar into a shared component. It lives in `src/app/(tabs)/(bible)/reader.tsx`, roughly lines 1620–1730: Explain, Highlight, Note, Share, the colour row and remove.
2. Add Save to that bar in both places. Save bookmarks the selected verses as a Scripture bookmark with the slice 1 identity.
3. The devotional verse block uses the shared bar instead of its own colour-dot bar.
4. **Acceptance:** the same selection shows the same actions in both places. The premium colour rules do not change. Save works for one verse and for a range.

## Slice 4: verses are always available

1. When a reading opens before the local Bible database is ready, fetch the day's chapter first. The passage then renders verse by verse.
2. Related Scripture gets Save. It also gets highlighting when local verses exist.
3. **Acceptance:** on a fresh install, the first reading's passage can be selected by verse before the full download finishes. With no network, the passage falls back to today's plain text with no error.

## Out of scope

- A separate Scripture collection or filter.
- Any change to highlight colour gating.
- The library label for paused series. A separate session owns it.

## Verification

- Gates per the Unfold PR SOP: typecheck, lint with 0 errors, the full jest suite and `verify:profiles`.
- Behaviour tests at the store seam for bookmark identity (AC1–AC3, AC7) and at the saved-items seam (AC4).
- Simulator captures for slices 1 and 3, attached to each pull request and never committed.

## Code map

Verify each entry before you edit it.

- **Reader toggle and day match:** `src/app/(tabs)/(today)/reading.tsx`, in `handleToggleBookmark` and `isCurrentDayBookmarked`.
- **Scripture card and passage:** `src/components/reading/DevotionalContent.tsx` (about L360–L418) and `src/components/reading/ScriptureVerseBlock.tsx`.
- **Box bookmarks:** `src/components/reading/DevotionalWebView.tsx`: `.bookmark-btn`, `window.handleBookmark` and the `BOOKMARK` message handler.
- **Tap sheet:** `src/components/ScriptureTapSheet.tsx`, in `alreadyBookmarked`.
- **Store and sync:**
  - `src/lib/store.ts`: `Bookmark`, `addBookmark`, `removeBookmark` and `isBookmarked`.
  - `src/lib/personal-data-sync-records.ts`.
  - `src/lib/full-sync-pull.ts`. Its `mapBookmark` drops `quotedText`.
- **Saved:** `src/lib/saved-items.ts`, `src/lib/saved-highlights.ts`, `src/components/saved/SavedSegment.tsx` and `src/app/(tabs)/(you)/my-content.tsx`.
- **Colours and gating:** `src/constants/bible-highlight-colors.ts` and `src/lib/premium-gating.ts`.
- **Reference parser:** `referenceToRoute` in `src/lib/bible-constants.ts`.
- **Greptile KB:** `docs/devotional-reading-and-reflection.md`, `docs/bible-study-experience.md` and `docs/journal-and-notebook-workflows.md`.
- **Prior highlighting work:** `handoffs/2026-09-10-highlights-phase-b.md` and `handoffs/2026-09-10-highlights-phase-c-and-release.md`.
