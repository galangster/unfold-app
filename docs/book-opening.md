# Devotional book opening

The active Devotional tab uses the same `SeriesBookCover` identity as the library and share image.
The series title stays on the cover. Today's title, progress, and reading action sit below it.
Archived series retain their paper contents page.

People can tap the cover, tap the reading action, or swipe left.
The first successful opening dismisses the hint stored at `unfold.book-cover-discovered.v1`.
A short swipe cancels. Reading availability and the current day still come from the existing series model.

`ActiveSeriesBookHero` captures separate cover and interior views.
`BookOpeningOverlay` renders both images in one Skia shader.
The cover is the only plane that turns. It remains a rigid board around its left spine.
Under the board is a flat interior: first the paper capture, then a snapshot of the ready reader.
The reader snapshot is scaled to the opening rect by width and top-aligned, so the small book shows the top of the real page and grows into it.
When that snapshot arrives, the interior crossfades over 120 ms under the still-closed cover. Neither image curls.
One uniform scale preserves the cover artwork before perspective projection.
The exposed page-edge strip stays beneath the turning board.
The paper's expansion into the reader is a deliberate interface transition, not a rigid-body simulation.
Expansion and hinge use one shared progress value on the UI thread.

On commit the cover cracks open to a press pose at once, and the paper backdrop covers the source screen over 100 ms before the reader route is pushed behind the overlay, so nothing leaks through the hold.
The cover then keeps creeping open, to about a fifth of its turn over the next second, until the reader snapshot exists or 1200 ms have passed since the push, whichever is first.
The single turn runs in 650 ms on a quad-out ease from wherever the cover is, so the board stays visible for about the first 350 to 400 ms.
A snapshot is only ever taken while the cover is still held; a late image is discarded, so the capture never stalls the turn.
With a snapshot under the board the overlay clears straight onto the live reader, pixel for pixel. Without one it fades onto the reader over 120 ms.
A drag lifts the cover directly but stops short of edge-on (about 0.55 of the turn, with a rubber band beyond), so the sheet is still covered when the reader snapshot lands; the cover snaps open on release.
A cancelled swipe returns the cover in `clamp(80 + 260 * progress, 80, 240)` ms.
The cream backdrop fades in across the first 15 percent of progress, so a short cancelled drag does not flash.

The hardcover source remains behind the canvas until navigation.
The canvas composites the backdrop and book together, so a native background cannot obscure an unpainted book.
The paper source hides after the overlay paints.
Cancellation, resizing, backgrounding, capture failure, and presentation failure restore a usable screen.
Reduce Motion, web, and unread content open the reader directly, with no overlay.
The existing paper opening remains the default for archived contents.

Native acceptance includes tap, swipe, cancellation, returning from the reader, light and dark themes, and larger text.
Simulator recordings show visual continuity. They do not establish sustained 60fps on a physical device.
