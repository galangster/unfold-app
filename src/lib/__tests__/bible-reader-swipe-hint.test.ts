/**
 * Chapter swipe in the Bible reader has no visible affordance. A one-time
 * hint (the edge arrow peeking on its own) should play the first time ever
 * a chapter loads, persisted so it never replays, and it should respect
 * reduced motion.
 *
 * reader.tsx pulls in the full reader dependency graph (bible-db, gesture
 * handler, etc.), which is impractical to mock just to call one function —
 * so, matching this repo's existing convention for screen-embedded logic
 * (see reading-swipe-navigation-source.test.ts), this checks the decision
 * function and its wiring by reading the source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../../app/(tabs)/(bible)/reader.tsx'), 'utf8');

describe('shouldPlaySwipeHint source contract', () => {
  it('is exactly !hasSeenHint && !reducedMotion && canSwipe — every guard is required', () => {
    const fnStart = source.indexOf('export function shouldPlaySwipeHint');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = source.indexOf('\n}\n', fnStart) + '\n}\n'.length;
    const fnBlock = source.slice(fnStart, fnEnd);
    expect(fnBlock).toContain('hasSeenHint: boolean');
    expect(fnBlock).toContain('reducedMotion: boolean');
    expect(fnBlock).toContain('canSwipe: boolean');
    expect(fnBlock).toMatch(
      /return\s+!params\.hasSeenHint\s*&&\s*!params\.reducedMotion\s*&&\s*params\.canSwipe;/,
    );
  });

  it('persists the seen flag before playing, so a later effect run this session is a no-op', () => {
    const effectBlock = source.match(
      /useEffect\(\(\) => \{\s*const hasSeenHint = bibleReaderHints\.getBoolean[\s\S]{0,700}?\}, \[prevChapter, nextChapter, reducedMotion, dragX\]\);/,
    )?.[0] ?? '';
    expect(effectBlock).toContain('bibleReaderHints.set(HAS_SEEN_SWIPE_HINT_KEY, true)');
    expect(effectBlock).toContain('shouldPlaySwipeHint(');
    expect(effectBlock).toContain("bibleReaderHints.getBoolean(HAS_SEEN_SWIPE_HINT_KEY) ?? false");
  });
});
