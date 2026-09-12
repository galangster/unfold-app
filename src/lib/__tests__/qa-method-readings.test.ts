/* eslint-disable import/first */
const mockIsScripturePracticeEnabled = jest.fn(() => true);
jest.mock('../scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => mockIsScripturePracticeEnabled(),
}));

import rawArtifact from '@/data/qa-method-readings.json';
import {
  QA_METHOD_READINGS_MALFORMED_COPY,
  QA_METHOD_READINGS_MAX_EXAMPLES,
  QA_METHOD_READINGS_MAX_SECTIONS,
  QA_METHOD_READINGS_MAX_SUPPORTING_PASSAGES,
  QA_METHOD_READINGS_MAX_VERSES,
  buildQaMethodBibleHref,
  findQaMethodReading,
  loadQaMethodReadings,
  parseQaMethodReadingsArtifact,
  sectionAllowsSampleInput,
} from '../qa-method-readings';

const john1v1 = {
  reference: 'John 1:1',
  translation: 'BSB' as const,
  bookId: 43,
  chapter: 1,
  verseStart: 1,
  verseEnd: 1,
  verses: [{ verse: 1, text: 'In the beginning was the Word.' }],
};

const validExample = {
  id: 'lectio_divina',
  methodId: 'lectio_divina',
  methodName: 'Lectio Divina',
  title: 'Stay',
  introduction: 'Intro',
  passage: john1v1,
  supportingPassages: [] as typeof john1v1[],
  sections: [
    { id: 'lectio', label: 'Lectio', kind: 'reading', text: 'Read.', prompt: '' },
    { id: 'notice', label: 'Notice', kind: 'notice', text: 'Notice.', prompt: 'What word?' },
  ],
  provenance: { model: 'test', generatedAt: '2026-09-12T00:00:00.000Z' },
};

const bsbOmissionPassage = {
  reference: 'Matthew 17:20-22',
  translation: 'BSB' as const,
  bookId: 40,
  chapter: 17,
  verseStart: 20,
  verseEnd: 22,
  verses: [
    { verse: 20, text: 'He replied, “Because you have so little faith.”' },
    { verse: 22, text: 'When they gathered together in Galilee, Jesus told them.' },
  ],
};

describe('qa method readings seam', () => {
  beforeEach(() => {
    mockIsScripturePracticeEnabled.mockReturnValue(true);
  });

  it('accepts the shipped artifact and a valid inline example', () => {
    const shipped = parseQaMethodReadingsArtifact(rawArtifact);
    expect(shipped.error).toBeNull();
    expect(shipped.examples.length).toBeGreaterThan(0);
    expect(shipped.examples.every((example) => example.id === example.methodId)).toBe(true);
    expect(shipped.examples.every((example) => Array.isArray(example.supportingPassages))).toBe(true);

    const parsed = parseQaMethodReadingsArtifact({ version: 1, examples: [validExample] });
    expect(parsed).toEqual({ examples: [validExample], error: null });
    expect(findQaMethodReading(parsed.examples, 'lectio_divina')?.title).toBe('Stay');
    expect(findQaMethodReading(parsed.examples, 'not_a_method')).toBeNull();
    expect(buildQaMethodBibleHref(validExample.passage)).toBe(
      '/(tabs)/(bible)/reader?bookId=43&chapter=1&verse=1',
    );
    expect(sectionAllowsSampleInput('')).toBe(false);
    expect(sectionAllowsSampleInput('What word?')).toBe(true);
  });

  it('skips unknown methods, mismatched ids, and extra malformed rows', () => {
    const parsed = parseQaMethodReadingsArtifact({
      version: 1,
      examples: [
        { ...validExample, methodId: 'not_a_method', id: 'not_a_method' },
        { ...validExample, id: 'inductive_oia' },
        validExample,
        { ...validExample, methodId: 'soap_journal', id: 'soap_journal', sections: [] },
        { ...validExample, methodId: 'word_study', id: 'word_study', passage: { ...john1v1, translation: 'KJV' } },
        { ...validExample, methodId: 'narrative_study', id: 'narrative_study', supportingPassages: undefined },
      ],
    });
    expect(parsed.error).toBeNull();
    expect(parsed.examples.map((example) => example.methodId)).toEqual(['lectio_divina']);
  });

  it('keeps BSB omissions and rejects broken verse sequences', () => {
    const accepted = parseQaMethodReadingsArtifact({
      version: 1,
      examples: [{
        ...validExample,
        passage: bsbOmissionPassage,
      }],
    });
    expect(accepted.examples).toHaveLength(1);
    expect(accepted.examples[0]?.passage.verses.map((row) => row.verse)).toEqual([20, 22]);

    const rejected = [
      [{ verse: 20, text: 'a' }, { verse: 21, text: 'b' }, { verse: 22, text: 'c' }],
      [{ verse: 20, text: 'a' }],
      [{ verse: 22, text: 'a' }, { verse: 20, text: 'b' }],
      [{ verse: 20, text: 'a' }, { verse: 20, text: 'b' }, { verse: 22, text: 'c' }],
      [{ verse: 20, text: 'a' }, { verse: 22, text: 'b' }, { verse: 28, text: 'c' }],
    ];
    for (const verses of rejected) {
      const parsed = parseQaMethodReadingsArtifact({
        version: 1,
        examples: [{
          ...validExample,
          passage: { ...bsbOmissionPassage, verses },
        }],
      });
      expect(parsed.examples).toEqual([]);
      expect(parsed.error).toBe(QA_METHOD_READINGS_MALFORMED_COPY);
    }
  });

  it('accepts KJV supporting verses with their own verse numbering', () => {
    const supporting = {
      ...bsbOmissionPassage,
      translation: 'KJV',
      verses: [
        { verse: 20, text: 'Test verse twenty.' },
        { verse: 21, text: 'Test verse twenty-one.' },
        { verse: 22, text: 'Test verse twenty-two.' },
      ],
    };
    const result = parseQaMethodReadingsArtifact({
      version: 1,
      examples: [{ ...validExample, supportingPassages: [supporting] }],
    });
    expect(result.examples[0]?.supportingPassages[0]).toEqual(supporting);
    supporting.verses.splice(1, 1);
    expect(parseQaMethodReadingsArtifact({
      version: 1,
      examples: [{ ...validExample, supportingPassages: [supporting] }],
    }).examples).toEqual([]);
  });

  it('bounds catalog size and does not invent Scripture', () => {
    expect(QA_METHOD_READINGS_MAX_EXAMPLES).toBe(32);
    expect(QA_METHOD_READINGS_MAX_SECTIONS).toBe(16);
    expect(QA_METHOD_READINGS_MAX_SUPPORTING_PASSAGES).toBe(8);
    expect(QA_METHOD_READINGS_MAX_VERSES).toBe(50);

    const tooManySections = parseQaMethodReadingsArtifact({
      version: 1,
      examples: [{
        ...validExample,
        sections: Array.from({ length: QA_METHOD_READINGS_MAX_SECTIONS + 1 }, (_, index) => ({
          id: `section-${index}`,
          label: 'Step',
          kind: 'notice',
          text: 'Text',
          prompt: '',
        })),
      }],
    });
    expect(tooManySections.examples).toEqual([]);

    const tooManySupporting = parseQaMethodReadingsArtifact({
      version: 1,
      examples: [{
        ...validExample,
        supportingPassages: Array.from(
          { length: QA_METHOD_READINGS_MAX_SUPPORTING_PASSAGES + 1 },
          () => john1v1,
        ),
      }],
    });
    expect(tooManySupporting.examples).toEqual([]);

    const tooManyVerses = parseQaMethodReadingsArtifact({
      version: 1,
      examples: [{
        ...validExample,
        passage: {
          reference: 'John 1:1-51',
          translation: 'BSB',
          bookId: 43,
          chapter: 1,
          verseStart: 1,
          verseEnd: 51,
          verses: Array.from({ length: QA_METHOD_READINGS_MAX_VERSES + 1 }, (_, index) => ({
            verse: index + 1,
            text: `Verse ${index + 1}`,
          })),
        },
      }],
    });
    expect(tooManyVerses.examples).toEqual([]);
  });

  it('treats empty, missing, and malformed roots as a graceful empty catalog', () => {
    expect(parseQaMethodReadingsArtifact(null)).toEqual({
      examples: [],
      error: QA_METHOD_READINGS_MALFORMED_COPY,
    });
    expect(parseQaMethodReadingsArtifact({ version: 2, examples: [validExample] })).toEqual({
      examples: [],
      error: QA_METHOD_READINGS_MALFORMED_COPY,
    });
    expect(parseQaMethodReadingsArtifact({ version: 1, examples: [] })).toEqual({
      examples: [],
      error: null,
    });
    expect(parseQaMethodReadingsArtifact({ version: 1, examples: [{ title: 'nope' }] })).toEqual({
      examples: [],
      error: QA_METHOD_READINGS_MALFORMED_COPY,
    });
  });

  it('hides the catalog when the Scripture practice QA gate is off', () => {
    mockIsScripturePracticeEnabled.mockReturnValue(false);
    expect(loadQaMethodReadings()).toEqual({ enabled: false, examples: [], error: null });

    mockIsScripturePracticeEnabled.mockReturnValue(true);
    const loaded = loadQaMethodReadings();
    expect(loaded.enabled).toBe(true);
    expect(loaded.examples.length).toBeGreaterThan(0);
  });
});
