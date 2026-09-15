# Devotional book opening

The active Devotional tab uses the same `SeriesBookCover` identity as the library and share image.
The series title stays on the cover. Today's title, progress, and reading action sit below it.
Archived series retain their paper contents page.

People can tap the cover, tap the reading action, or swipe left.
The first successful opening dismisses the hint stored at `unfold.book-cover-discovered.v1`.
A short swipe cancels. Reading availability and the current day still come from the existing series model.

`ActiveSeriesBookHero` captures separate cover and interior views.
`BookOpeningOverlay` renders both images in one Skia shader.
The cover remains a rigid plane around its left spine. Only the interior image enters the paper curl.
Expansion, hinge, and curl use one shared progress value on the UI thread.

The source hides after the overlay paints.
Committing the hardcover opening prepares the reader while motion finishes.
The overlay remains until expansion, curl, and reader layout are ready.
Cancellation, resizing, backgrounding, capture failure, and presentation failure restore a usable screen.
Reduce Motion opens the reader directly. The existing paper opening remains the default for archived contents.

Native acceptance includes tap, swipe, cancellation, returning from the reader, light and dark themes, and larger text.
Simulator recordings show visual continuity. They do not establish sustained 60fps on a physical device.
