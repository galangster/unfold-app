import { parseScriptureReferences } from '@/lib/scripture-parser';

describe('parseScriptureReferences', () => {
  it('treats Book N-M as one chapter-range reference', () => {
    const refs = parseScriptureReferences('Acts 5-7 is not theoretical.');
    expect(refs.map((ref) => ref.reference)).toEqual(['Acts 5-7']);
    expect(refs[0].startIndex).toBe(0);
    expect(refs[0].endIndex).toBe('Acts 5-7'.length);
  });

  it('still matches chapter-only, verse, and verse-range citations', () => {
    const refs = parseScriptureReferences(
      'Psalm 23, John 3:16, and Romans 8:28-30 still work.',
    );
    expect(refs.map((ref) => ref.reference)).toEqual([
      'Psalm 23',
      'John 3:16',
      'Romans 8:28-30',
    ]);
  });

  it('does not chip Acts 5 when -digit follows the chapter', () => {
    const refs = parseScriptureReferences('Read Acts 5-7 together.');
    expect(refs.map((ref) => ref.reference)).toEqual(['Acts 5-7']);
    expect(refs.some((ref) => ref.reference === 'Acts 5')).toBe(false);
  });

  it('keeps en-dash chapter ranges intact', () => {
    const refs = parseScriptureReferences('See Acts 5–7.');
    expect(refs.map((ref) => ref.reference)).toEqual(['Acts 5–7']);
  });
});
