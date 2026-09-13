import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { transpileModule } from 'typescript';
import { beginReaderLayoutGeneration, resolveVisibleReaderAnchor } from '../reader-scroll-anchor';

// Execute the screen's actual callbacks to cover their ref ordering and ownership.
const source = readFileSync(join(__dirname, '../../app/(tabs)/(today)/reading.tsx'), 'utf8');
const settledCallback = source.slice(
  source.indexOf('  const saveReaderScrollY ='),
  source.indexOf('  const handleScroll =', source.indexOf('  const saveReaderScrollY =')),
);
const resizeCallback = source.slice(
  source.indexOf('  if (readerLayoutKeyRef.current !== readerLayoutKey)'),
  source.indexOf('  const handleWebViewLocations ='),
);

function createReader() {
  return createContext({
    beginReaderLayoutGeneration,
    resolveVisibleReaderAnchor,
    useCallback: (callback: unknown) => callback,
    userScrollActiveRef: { current: true },
    readerScrollYRef: { current: 1080 },
    latestReaderScrollY: { value: 540 },
    sectionLocationsRef: { current: {
      generation: 1,
      offsets: { scripture: 0, devotional: 200, reflection: 1300 },
      reportedGeneration: { scripture: 1, devotional: 1, reflection: 1 },
    } },
    paragraphLocationsRef: { current: { generation: 1, ys: [0, 150, 300, 450] } },
    reflowAnchorRef: { current: { kind: 'section', section: 'reflection' } },
    readerLayoutKeyRef: { current: 'old' },
    readerLayoutKey: 'new',
    layoutGenerationRef: { current: 1 },
    layoutGeneration: 1,
    pendingReflowRestoreRef: { current: false },
    setLayoutGeneration: () => {},
    SECTION_TARGET_TOP_INSET: 24,
  });
}

function runCallback(code: string, reader: ReturnType<typeof createReader>) {
  runInContext(transpileModule(code, {}).outputText, reader);
}

it('replaces the reflection anchor after a completed user scroll', () => {
  const reader = createReader();
  runCallback(`${settledCallback}\nsaveReaderScrollY(540);`, reader);
  runCallback(resizeCallback, reader);
  expect(reader.reflowAnchorRef.current).toEqual({ kind: 'paragraph', section: 'devotional', index: 2 });
  expect(reader.userScrollActiveRef.current).toBe(false);
});

it('captures the live paragraph when resize interrupts scrolling away from reflection', () => {
  const reader = createReader();
  runCallback(resizeCallback, reader);
  expect(reader.reflowAnchorRef.current).toEqual({ kind: 'paragraph', section: 'devotional', index: 2 });
  expect(reader.userScrollActiveRef.current).toBe(false);

  // A later native resize can report zero before new paragraph measurements arrive.
  reader.readerLayoutKey = 'narrower';
  reader.latestReaderScrollY.value = 0;
  runCallback(resizeCallback, reader);
  expect(reader.reflowAnchorRef.current).toEqual({ kind: 'paragraph', section: 'devotional', index: 2 });
});
