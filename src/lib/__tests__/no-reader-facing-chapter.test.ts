/**
 * R3: no reader-facing "chapter" (Ruled 2: readers see "Week").
 *
 * The scan covers every file in src/components/book, src/lib/book-of-seasons.ts
 * and every source file the weekly-chapters change touches. Code identifiers,
 * testIDs, paths and comments are fine. String literals and JSX text are not.
 *
 * Allowed, each with its reason:
 * - The ruled option subtitle (Ruled 4), the one exception R3 names.
 * - The returning empty state "Begin the next quiet chapter." on Today. It
 *   predates the feature, shows only with no current series, and is brand copy.
 *   Rewording it is an owner call.
 *
 * lib/devotional-service.ts holds model prompts ("Book Chapter:Verses"). They
 * are never shown to the reader, so the scan skips that file.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '../..');

const CHANGED_FILES = [
  'app/(tabs)/(today)/reading.tsx',
  'app/generating.tsx',
  'app/onboarding.tsx',
  'app/paywall.tsx',
  'app/unfolded.tsx',
  'components/CompletionCelebration.tsx',
  'components/PremiumFeatureSheet.tsx',
  'components/home/DevotionalCard.tsx',
  'components/home/compute-devotional-state.ts',
  'hooks/useChapteredSeriesEnabled.ts',
  'lib/completion-next-step.ts',
  'lib/generating-wait-copy.ts',
  'lib/generation-poll-outcome.ts',
  'lib/pdf-export.ts',
  'lib/remote-config.ts',
  'lib/series-length-copy.ts',
  'lib/series-length-options.ts',
  'lib/series-weeks.ts',
  'lib/store.ts',
];

const BOOK_DIR = 'components/book';
const bookFiles = fs.readdirSync(path.join(SRC, BOOK_DIR))
  .filter((name) => /\.(ts|tsx)$/.test(name))
  .map((name) => `${BOOK_DIR}/${name}`);

const SCANNED = [...new Set([...bookFiles, 'lib/book-of-seasons.ts', ...CHANGED_FILES])];

const ALLOWED: Record<string, string[]> = {
  'lib/series-length-options.ts': [
    'Four weekly chapters. Each week is prepared as you go.',
    '4 weeks. Four weekly chapters. Each week is prepared as you go.',
  ],
  'components/home/DevotionalCard.tsx': ['Begin the next quiet chapter.'],
};

/** String literal contents and JSX text of a source file, with comments removed. */
function readerFacingSegments(source: string): string[] {
  const segments: string[] = [];
  let code = '';
  let i = 0;
  const templateDepth: number[] = [];
  let braceDepth = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i = source.indexOf('*/', i + 2);
      i = i === -1 ? source.length : i + 2;
      continue;
    }
    if (ch === '\'' || ch === '"') {
      let j = i + 1;
      let text = '';
      while (j < source.length && source[j] !== ch && source[j] !== '\n') {
        if (source[j] === '\\') { text += source[j + 1] ?? ''; j += 2; continue; }
        text += source[j];
        j += 1;
      }
      // A single lowercase token ('chapters', 'chapter_plan') is a code value, not copy.
      if (!/^[a-z_-]+$/.test(text)) segments.push(text);
      code += ' ';
      i = j + 1;
      continue;
    }
    if (ch === '`' || (ch === '}' && templateDepth.length > 0 && templateDepth[templateDepth.length - 1] === braceDepth)) {
      if (ch === '}') templateDepth.pop();
      let j = i + 1;
      let text = '';
      while (j < source.length && source[j] !== '`' && !(source[j] === '$' && source[j + 1] === '{')) {
        if (source[j] === '\\') { text += source[j + 1] ?? ''; j += 2; continue; }
        text += source[j];
        j += 1;
      }
      segments.push(text);
      code += ' ';
      if (source[j] === '$') {
        templateDepth.push(braceDepth);
        i = j + 2;
      } else {
        i = j + 1;
      }
      continue;
    }
    if (ch === '{') braceDepth += 1;
    if (ch === '}') braceDepth -= 1;
    code += ch;
    i += 1;
  }
  // JSX text: runs between a closing ">" and the next "<" or "{".
  // Comparisons such as "a >= b && c <" are code, not text.
  for (const match of code.matchAll(/>([^<>{}]+)</g)) {
    if (!/[=&|;()]/.test(match[1])) segments.push(match[1]);
  }
  return segments;
}

const CHAPTER_WORD = /(^|[^A-Za-z0-9_$\-/.])chapters?(?![A-Za-z0-9_$\-])/i;

describe('R3 no reader-facing "chapter"', () => {
  it('finds the strings it is meant to find (scanner control)', () => {
    const sample = "const a = 'Your current chapter'; const b = `${n} chapters`; const t = 'book-chapter-1';\n<Text>One chapter</Text>; // a chapter comment\n<View testID=\"book-chapter-journey\" />";
    expect(readerFacingSegments(sample).filter((text) => CHAPTER_WORD.test(text))).toEqual([
      'Your current chapter',
      ' chapters',
      'One chapter',
    ]);
  });

  it.each(SCANNED)('%s has no reader-facing "chapter" outside the allowed list', (file) => {
    const found = readerFacingSegments(fs.readFileSync(path.join(SRC, file), 'utf8'))
      .filter((text) => CHAPTER_WORD.test(text));
    expect(found.filter((text) => !(ALLOWED[file] ?? []).includes(text))).toEqual([]);
  });

  it('keeps the allowed list current', () => {
    for (const [file, allowed] of Object.entries(ALLOWED)) {
      const segments = readerFacingSegments(fs.readFileSync(path.join(SRC, file), 'utf8'));
      for (const text of allowed) expect(segments).toContain(text);
    }
  });
});
