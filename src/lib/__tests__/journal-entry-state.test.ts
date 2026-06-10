import {
  buildInitialQuestionResponses,
  diffSoapWrites,
  resolveInitialJournalMode,
} from '../journal-entry-state';

describe('resolveInitialJournalMode', () => {
  it('honors a persisted journal mode over the study-method suggestion', () => {
    expect(
      resolveInitialJournalMode({ journalMode: 'guided' }, { studyMethod: 'soap_journal' }),
    ).toBe('guided');
  });

  it('auto-selects SOAP for soap_journal study-method days with no persisted mode (COR-5)', () => {
    expect(resolveInitialJournalMode(undefined, { studyMethod: 'soap_journal' })).toBe('soap');
  });

  it('defaults to freewrite otherwise — including when the day is missing', () => {
    expect(resolveInitialJournalMode(undefined, { studyMethod: 'lectio' })).toBe('freewrite');
    expect(resolveInitialJournalMode(undefined, undefined)).toBe('freewrite');
  });
});

describe('buildInitialQuestionResponses', () => {
  it('hydrates responses onto the indices of matching question text', () => {
    const map = buildInitialQuestionResponses(
      { questionResponses: [{ question: 'Q2', response: 'my answer' }] },
      { reflectionQuestions: ['Q1', 'Q2'] },
    );
    expect(map.get(1)).toBe('my answer');
    expect(map.size).toBe(1);
  });

  it('returns an empty map when nothing is persisted or no questions match', () => {
    expect(buildInitialQuestionResponses(undefined, { reflectionQuestions: ['Q1'] }).size).toBe(0);
    expect(
      buildInitialQuestionResponses(
        { questionResponses: [{ question: 'gone', response: 'x' }] },
        { reflectionQuestions: ['Q1'] },
      ).size,
    ).toBe(0);
  });
});

describe('diffSoapWrites', () => {
  const soap = (over: Partial<Record<'scripture' | 'observation' | 'application' | 'prayer', string>>) => ({
    scripture: '',
    observation: '',
    application: '',
    prayer: '',
    ...over,
  });

  it('includes a field the user cleared to empty so deletions persist (COR-6)', () => {
    expect(diffSoapWrites(soap({}), soap({ observation: 'old text' }))).toEqual([
      { field: 'observation', value: '' },
    ]);
  });

  it('skips fields whose value is unchanged', () => {
    expect(diffSoapWrites(soap({ prayer: 'same' }), soap({ prayer: 'same' }))).toEqual([]);
  });

  it('treats a missing persisted record as all-empty (fresh entry writes only non-empty fields)', () => {
    expect(diffSoapWrites(soap({ scripture: 'John 3:16' }), undefined)).toEqual([
      { field: 'scripture', value: 'John 3:16' },
    ]);
  });
});
