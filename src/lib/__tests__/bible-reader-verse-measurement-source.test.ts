import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readerSource = readFileSync(
  join(__dirname, '../../app/(tabs)/(bible)/reader.tsx'),
  'utf8',
);

// Guards the verse-row measurement contract: onTextLayout still fires for every
// verse (the selection/highlight overlays need the line rects), but a row must
// not write render state for it unless an overlay is visible — otherwise
// mounting a long chapter re-renders every row once (176 times in Psalm 119).
describe('Bible reader verse measurement source contract', () => {
  const textLayoutBlock =
    readerSource.match(
      /const handleTextLayout = useCallback\(\(e: any\) => \{[\s\S]*?\}, \[hasOverlay\]\);/,
    )?.[0] ?? '';

  it('keeps measuring every verse eagerly so selection geometry is unchanged', () => {
    expect(readerSource).toContain('onTextLayout={handleTextLayout}');
    expect(readerSource).not.toContain('onTextLayout={hasOverlay');
  });

  it('parks measurements in a ref and only writes state while an overlay is visible', () => {
    expect(textLayoutBlock).not.toBe('');
    expect(textLayoutBlock).toContain('measuredLinesRef.current = measured;');
    expect(textLayoutBlock).toContain('if (hasOverlay) setTextLines(measured);');
    // No unconditional state write anywhere in the handler.
    expect(textLayoutBlock).not.toMatch(/^\s*setTextLines\(/m);
  });

  it('promotes the parked measurement synchronously when an overlay appears and clears it after', () => {
    expect(readerSource).toMatch(
      /useLayoutEffect\(\(\) => \{\s*setTextLines\(hasOverlay \? measuredLinesRef\.current : EMPTY_LINES\);\s*\}, \[hasOverlay\]\);/,
    );
    // Initial state shares the EMPTY_LINES identity so the mount-time effect is a no-op for React.
    expect(readerSource).toContain('useState<BibleTextLine[]>(EMPTY_LINES)');
    expect(readerSource).toContain('useRef<BibleTextLine[]>(EMPTY_LINES)');
  });

  it('still renders overlay rects only from render state, never from the ref', () => {
    expect(readerSource).toContain('{hasOverlay && overlayBg && textLines.map((line, i) => (');
    expect(readerSource).not.toContain('measuredLinesRef.current.map(');
  });

  it('keeps scroll-to-verse on the row onLayout ref path, independent of text measurement', () => {
    expect(readerSource).toContain('verseLayoutsRef.current[verseNum] = y;');
    expect(readerSource).toContain('onLayout={handleVerseLayout}');
  });
});
