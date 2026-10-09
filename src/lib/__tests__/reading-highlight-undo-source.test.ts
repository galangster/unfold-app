import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readingSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
  'utf8',
);

// Undo replays a highlight change into the open page by character position.
// After a swipe to another day, that page holds other text, so the replay
// would mark the wrong words there and save them under the new day.
describe('reading highlight undo source contract', () => {
  it('ends the highlight toast when the series or day changes', () => {
    expect(readingSource).toContain("const highlightPage = `${effectiveDevotionalId ?? ''}:${viewingDay}`;");
    expect(readingSource).toMatch(
      /useLayoutEffect\(\(\) => \{\s*highlightPageRef\.current = highlightPage;\s*setHighlightToast\(null\);\s*\}, \[highlightPage\]\);/,
    );
  });

  it('applies an Undo only on the page its change came from', () => {
    const toastBlock = readingSource.match(/const page = highlightPageRef\.current;[\s\S]{0,500}?\n {4}\}\);/)?.[0] ?? '';
    // The toast closes after the guard, so a dropped Undo still dismisses it.
    expect(toastBlock).toMatch(
      /if \(highlightPageRef\.current === page\) \{\s*highlightCommandRef\.current\?\.applyInverse\(\{[^}]*\}\);\s*\}\s*setHighlightToast\(null\);/,
    );
  });
});
