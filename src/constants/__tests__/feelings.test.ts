import { FEELINGS, displayVerses, getFeeling, trimUnmatchedQuotes, type Passage } from '../feelings';

/** Verse numbers a reference names: "Psalm 62:1–2" → [1, 2], "Matthew 11:28" → [28]. */
function versesNamedBy(reference: string): number[] {
  const match = /:(\d+)(?:–(\d+))?$/.exec(reference);
  if (!match) throw new Error(`Unparsed reference: ${reference}`);
  const first = Number(match[1]);
  const last = match[2] ? Number(match[2]) : first;
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

describe('feelings content', () => {
  it('lists twelve feelings with unique ids and words', () => {
    expect(FEELINGS).toHaveLength(12);
    expect(new Set(FEELINGS.map((f) => f.id)).size).toBe(12);
    expect(new Set(FEELINGS.map((f) => f.word)).size).toBe(12);
  });

  it('gives every feeling a label and at least two passages with text and a reference', () => {
    for (const feeling of FEELINGS) {
      expect(feeling.label.trim()).not.toBe('');
      expect(feeling.passages.length).toBeGreaterThanOrEqual(2);
      for (const passage of feeling.passages) {
        expect(passage.reference.trim()).not.toBe('');
        expect(passage.lockReference.trim()).not.toBe('');
        expect(passage.lockLine.trim()).not.toBe('');
        expect(passage.verses.length).toBeGreaterThan(0);
        for (const verse of passage.verses) expect(verse.text.trim()).not.toBe('');
      }
    }
  });

  it('numbers each passage with exactly the verses its reference names', () => {
    for (const passage of FEELINGS.flatMap((f) => f.passages)) {
      expect({ reference: passage.reference, verses: passage.verses.map((v) => v.number) })
        .toEqual({ reference: passage.reference, verses: versesNamedBy(passage.reference) });
    }
  });

  it('keeps the Berean Standard Bible text character for character', () => {
    expect(getFeeling('weary')?.passages[0]).toEqual({
      reference: 'Matthew 11:28',
      lockReference: 'Matthew 11:28',
      lockLine: 'Come to Me, all you who are weary and burdened, and I will give you rest.',
      verses: [{ number: 28, text: 'Come to Me, all you who are weary and burdened, and I will give you rest.' }],
    });
    expect(getFeeling('alone')?.passages[0].verses[0].text).toBe(
      'The LORD Himself goes before you; He will be with you. He will never leave you nor forsake you. Do not be afraid or discouraged.”',
    );
    expect(getFeeling('afraid')?.label).toBe('For when you’re afraid');
    expect(getFeeling('uncertain')?.label).toBe('For when you can’t see the way');
  });

  it('looks a feeling up by id and ignores unknown ids', () => {
    expect(getFeeling('weary')?.word).toBe('Weary');
    expect(getFeeling('Weary')).toBeUndefined();
    expect(getFeeling('nope')).toBeUndefined();
    expect(getFeeling('constructor')).toBeUndefined();
    expect(getFeeling(undefined)).toBeUndefined();
  });
});

describe('quote trimming for excerpts', () => {
  it('drops a closing quote whose opening sits in an earlier verse', () => {
    expect(trimUnmatchedQuotes('For My yoke is easy and My burden is light.”')).toBe(
      'For My yoke is easy and My burden is light.',
    );
  });

  it('keeps balanced quotes and plain text', () => {
    expect(trimUnmatchedQuotes('He said, “Come.”')).toBe('He said, “Come.”');
    expect(trimUnmatchedQuotes('Be joyful in hope.')).toBe('Be joyful in hope.');
  });

  it('trims only the last verse of a numbered passage', () => {
    const deuteronomy = getFeeling('alone')?.passages[0] as Passage;
    expect(displayVerses(deuteronomy)).toEqual([
      {
        number: 8,
        text: 'The LORD Himself goes before you; He will be with you. He will never leave you nor forsake you. Do not be afraid or discouraged.',
      },
    ]);
    const balanced = getFeeling('weary')?.passages[0] as Passage;
    expect(displayVerses(balanced)).toBe(balanced.verses);
  });
});
