# Today reading pace and reveal cleanup

Status: implemented and independently reviewed. PR publication authorized September 23, 2026.
Base: b1eefaa2, origin/main, retrieved September 23, 2026.

## Expected behavior

The owner expects the next devotional to remain locked until the next local day.
Apply this pace within the current series, including readers behind the original series calendar.
Keep completed readings available for rereading and reflection.
Keep tomorrow's preview clearly labeled Tomorrow.
Remove the decorative document icon from the Today reading cards.
Remove the quote marker, ready sentence, and scripture reference from the reveal-ready card.
Keep the title, series, day status, and reveal action.
Keep the existing reveal action wording from PR #167.

## Evidence and diagnosis

The supplied screenshot shows a completed reading in the evening card and an unread reading in the hero.
A read-only account query confirmed completion of Day 5 that morning in Pacific/Honolulu.
Day 6 was generated approximately nine minutes later.
The series calendar was one day ahead of the reader's progress.
The calendar exception allowed Day 6 despite the same-day completion of Day 5.
Existing tests explicitly required this exception. This change replaces that policy under the owner's current instruction.
The screenshot and available account records do not establish the app build, iOS version, or phone model.
Keep account identifiers and private records outside the repository.

## Acceptance criteria

1. After completing Day 5, Today labels Day 6 Tomorrow and does not offer its reveal action.
2. The reader and day menu retain access to Day 5 and block Day 6 until the next local day.
3. A direct reveal route cannot bypass the same-day completion restriction.
4. The next local day unlocks Day 6 without editing saved progress or the series start date.
   An open reader and day menu refresh their gates at midnight and on foreground.
   Later days remain unavailable through direct reveal routes.
5. Rereading and reflection remain available for the completed day.
6. Reveal-ready renders no document icon, placeholder quotation, or scripture reference.
7. Normal ready cards also render no decorative document icon.
8. Existing progress and reduced-motion behavior remain intact.

## Verification

Run the pacing regression with Pacific/Honolulu and a second timezone.
Run related access, home-state, reveal-route, card-state, and rendered-card tests.
Run repository typecheck, lint, tests, and verify:changed.
Run the orchestrator's simplify pass and independent standards and specification reviews.
The owner waived visual QA. Native compilation and release evidence remain separate gates.
