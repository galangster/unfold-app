import { deriveReflectionStatus } from '@/lib/reflection-status';
import type { JournalEntry } from '@/lib/store';

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'dev-1:1',
    devotionalId: 'dev-1',
    dayNumber: 1,
    content: '',
    createdAt: '2026-09-04T09:00:00Z',
    updatedAt: '2026-09-04T09:00:00Z',
    ...overrides,
  };
}

describe('deriveReflectionStatus', () => {
  it('is empty without an entry or with only whitespace', () => {
    expect(deriveReflectionStatus(undefined, 3)).toBe('empty');
    expect(deriveReflectionStatus(makeEntry({ content: '   ' }), 3)).toBe('empty');
    expect(deriveReflectionStatus(makeEntry({
      soapResponses: { scripture: ' ', observation: '', application: '', prayer: '' },
      prayerRequests: [{ id: 'p1', text: ' ', createdAt: '2026-09-04T09:00:00Z', isAnswered: false }],
      questionResponses: [{ question: 'Q1', response: '' }],
    }), 1)).toBe('empty');
  });

  it('is started for free-write, SOAP, prayer, or a partial set of answers', () => {
    expect(deriveReflectionStatus(makeEntry({ content: 'A thought.' }), 3)).toBe('started');
    expect(deriveReflectionStatus(makeEntry({
      soapResponses: { scripture: 'Heb 11:1', observation: '', application: '', prayer: '' },
    }), 3)).toBe('started');
    expect(deriveReflectionStatus(makeEntry({
      prayerRequests: [{ id: 'p1', text: 'For patience', createdAt: '2026-09-04T09:00:00Z', isAnswered: false }],
    }), 3)).toBe('started');
    expect(deriveReflectionStatus(makeEntry({
      questionResponses: [{ question: 'Q1', response: 'A1' }, { question: 'Q2', response: '' }],
    }), 2)).toBe('started');
  });

  it('is complete only when every reflection question has an answer', () => {
    const answered = makeEntry({
      questionResponses: [{ question: 'Q1', response: 'A1' }, { question: 'Q2', response: 'A2' }],
    });
    expect(deriveReflectionStatus(answered, 2)).toBe('complete');
    expect(deriveReflectionStatus(answered, 3)).toBe('started');
  });

  it('never reports complete for a day with no reflection questions', () => {
    expect(deriveReflectionStatus(makeEntry({ content: 'Everything written.' }), 0)).toBe('started');
  });
});
