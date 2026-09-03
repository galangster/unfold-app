import {
  buildInitialQuestionResponses,
  diffSoapWrites,
  resolveInitialJournalMode,
  resolveJournalCloseAction,
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
  it('keys persisted responses by their question text (the store key)', () => {
    const map = buildInitialQuestionResponses({
      questionResponses: [
        { question: 'Q2', response: 'my answer' },
        { question: 'AI prompt', response: 'deeper' },
      ],
    });
    expect(map.get('Q2')).toBe('my answer');
    expect(map.get('AI prompt')).toBe('deeper');
    expect(map.size).toBe(2);
  });

  it('returns an empty map when nothing is persisted', () => {
    expect(buildInitialQuestionResponses(undefined).size).toBe(0);
    expect(buildInitialQuestionResponses({ questionResponses: undefined }).size).toBe(0);
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

describe('resolveJournalCloseAction', () => {
  const journalTabEntry = ['(tabs)', '(journal)', 'entry'];

  it('pops back to the hub when the Journal tab pushed the entry on top of it', () => {
    expect(resolveJournalCloseAction({ segments: journalTabEntry, stackIndex: 1 })).toBe('back');
  });

  it('replaces the entry with the hub when it is the first route of the Journal stack', () => {
    expect(resolveJournalCloseAction({ segments: journalTabEntry, stackIndex: 0 })).toBe(
      'replace-journal-hub',
    );
  });

  it('always pops in the Today flow, whatever the stack depth', () => {
    const todayFlow = ['(tabs)', '(today)', 'journal'];
    expect(resolveJournalCloseAction({ segments: todayFlow, stackIndex: 0 })).toBe('back');
    expect(resolveJournalCloseAction({ segments: todayFlow, stackIndex: 2 })).toBe('back');
  });

  it('needs the route group to recognise the Journal-tab mount (pathname strips it)', () => {
    // usePathname() reports '/entry' for (journal)/entry — without the group
    // segment the screen is indistinguishable from any other entry route.
    expect(resolveJournalCloseAction({ segments: ['entry'], stackIndex: 0 })).toBe('back');
  });
});
