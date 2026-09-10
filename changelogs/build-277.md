# Build 277 (1.1.7) - Highlighting, Saved, and the reader outline

Everything in build 276, plus the highlighting and widget work below.

## New

- **Highlight from the selection menu** - Select any line in a devotional and choose Highlight. Pick a named colour; the mark is a felt-tip stroke fitted to the letters, in light and dark. Copy is still there, and so are Look Up and Translate.
- **Highlight scripture by verse** - Tap a verse in the devotional's scripture block to highlight it. The same highlight shows on that verse in the Bible reader.
- **Undo** - Highlighting and removing a highlight both show a short Undo toast.
- **Journal > Saved** - The Journal tab has a third segment, Saved: every devotional highlight, Bible highlight, Bible note and bookmark in one list. Filter by Source (Devotional, Bible) and Type (Highlights, Notes, Bookmarks). Swipe a card left to remove it; Undo brings it back. The Today tile that opened My Library now says Saved and opens this list.
- **Reader outline** - The book icon at the top of a reading opens Contents, Highlights and Notes for that day. Tap a section or a highlight to jump to it; Notes lists your reflections for the day and offers Write a reflection.
- **A line worth carrying** - The Today card now draws from your Bible highlights too, and quotes the line with the same marker band as the reader.
- **Home Screen widgets** - Fit on the smallest iPhone, use the app's own type, paint edge to edge, and mark today in the week row.

## Fixed

- Highlights that no longer match the text after a devotional is regenerated repair themselves instead of vanishing.
- The Library no longer duplicates the Journal tab.

## What to test

- [ ] Open a devotional, select a few words, tap Highlight, pick a colour. Confirm the stroke sits on the letters in light and dark mode.
- [ ] Select text again and confirm the menu shows Highlight, Copy, Look Up and Translate.
- [ ] Remove a highlight from the colour bar and tap Undo. Confirm it returns.
- [ ] Tap a verse in the devotional scripture block and highlight it. Open the Bible at that verse and confirm the highlight is there too.
- [ ] Journal > Saved: confirm your highlights, Bible notes and bookmarks appear. Use the Source and Type chips. Swipe a card left, tap Remove, then Undo.
- [ ] Today: tap the Saved tile and confirm it opens Journal > Saved.
- [ ] In a reading, tap the book icon. Try Contents (jump to A Prayer), Highlights (jump to one), and Notes (Write a reflection).
- [ ] Today: if you have a Bible highlight, check that "A line worth carrying" can show it and opens the Bible at that verse.
- [ ] Add the medium widget on an iPhone SE or in the smallest size and confirm nothing is cut off.
