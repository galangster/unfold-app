import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { buildSelectedPassageForExplanation } from '../bible-reader-explain';

const repoRoot = path.resolve(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Bible reader Explain action', () => {
  it('builds a single-verse explanation input from the selected verse', () => {
    const input = buildSelectedPassageForExplanation({
      verses: [
        { verse: 27, text: 'Now you are the body of Christ, and each of you is a member of it.' },
        { verse: 28, text: 'And we know that God works all things together for the good of those who love Him.' },
      ],
      selectedVerses: new Set([28]),
      bookName: 'Romans',
      chapter: 8,
      translation: 'BSB',
    });

    expect(input).toEqual({
      reference: 'Romans 8:28',
      passageText: 'And we know that God works all things together for the good of those who love Him.',
      translation: 'BSB',
      source: 'bible-reader',
    });
  });

  it('builds a range explanation input in canonical verse order', () => {
    const input = buildSelectedPassageForExplanation({
      verses: [
        { verse: 28, text: 'Verse twenty eight.' },
        { verse: 29, text: 'Verse twenty nine.' },
        { verse: 30, text: 'Verse thirty.' },
      ],
      selectedVerses: new Set([30, 28, 29]),
      bookName: 'Romans',
      chapter: 8,
      translation: 'KJV',
    });

    expect(input).toEqual({
      reference: 'Romans 8:28-30',
      passageText: 'Verse twenty eight. Verse twenty nine. Verse thirty.',
      translation: 'KJV',
      source: 'bible-reader',
    });
  });

  it('returns null when no selected verse text exists', () => {
    expect(buildSelectedPassageForExplanation({
      verses: [{ verse: 1, text: '' }],
      selectedVerses: new Set([1]),
      bookName: 'Genesis',
      chapter: 1,
      translation: 'BSB',
    })).toBeNull();
  });

  it('wires the Bible reader context bar to the shared explanation sheet without local analytics text logging', () => {
    const source = readSource('app/(tabs)/(bible)/reader.tsx');

    expect(source).toContain("import { ScriptureExplainSheet } from '@/components/ScriptureExplainSheet';");
    expect(source).toContain("import { buildSelectedPassageForExplanation }");
    expect(source).toContain('const handleExplain = useCallback');
    expect(source).toContain('<ScriptureExplainSheet');
    expect(source).toContain("<Text style={[styles.contextIconLabel, { color: colors.textMuted }]}>Explain</Text>");

    const explainIndex = source.indexOf('>Explain</Text>');
    const highlightIndex = source.indexOf('>Highlight</Text>');
    expect(explainIndex).toBeGreaterThan(-1);
    expect(highlightIndex).toBeGreaterThan(explainIndex);

    expect(source).not.toContain('logEvent(');
    expect(source).not.toContain('AnalyticsEvents.SCRIPTURE_EXPLAIN');
  });
});
