import {
  applyPracticeSessionPatch,
  getPracticePassage,
  practiceSessionKey,
  resolvePracticeReturn,
  type PracticeReturn,
  type PracticeTarget,
} from '../scripture-practice';
import type { Devotional, DevotionalDay } from '../store';

function day(dayNumber: number, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber,
    id: `day-dev-1-${dayNumber}`,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 3:16',
    scriptureText: 'For God so loved the world.',
    bodyText: 'A short body.',
    quotableLine: 'A line.',
    isRead: dayNumber === 1,
    studyMethod: 'soap_journal',
    ...overrides,
  };
}

function series(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'Series',
    totalDays: 3,
    currentDay: 2,
    days: [day(1), day(2)],
    createdAt: '2026-09-01T00:00:00.000Z',
    userContext: {
      name: 'Ada',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    generationMode: 'batch',
    seriesStartDate: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function target(overrides: Partial<PracticeTarget> = {}): PracticeTarget {
  return {
    devotionalId: 'dev-1',
    dayNumber: 2,
    hostTab: '(today)',
    methodId: 'lectio_divina',
    ...overrides,
  };
}

function context(overrides: Partial<PracticeReturn> = {}): PracticeReturn {
  return {
    target: target(),
    destination: 'practice',
    ...overrides,
  };
}

describe('getPracticePassage', () => {
  it('parses a verse and offers the surrounding chapter', () => {
    expect(getPracticePassage('John 3:16')).toEqual({
      reference: 'John 3:16',
      chapterReference: 'John 3',
      bookId: 43,
      chapter: 3,
      verse: 16,
    });
  });

  it('normalizes psalm citations and chapter-only references', () => {
    expect(getPracticePassage('Psalm 23:1-3')).toEqual({
      reference: 'Psalm 23:1-3',
      chapterReference: 'Psalm 23',
      bookId: 19,
      chapter: 23,
      verse: 1,
    });
    expect(getPracticePassage('Genesis 1')).toEqual({
      reference: 'Genesis 1',
      chapterReference: 'Genesis 1',
      bookId: 1,
      chapter: 1,
      verse: 1,
    });
  });

  it('returns null for invalid or unknown references', () => {
    expect(getPracticePassage('')).toBeNull();
    expect(getPracticePassage('not a verse')).toBeNull();
    expect(getPracticePassage('Notabook 1:1')).toBeNull();
    expect(getPracticePassage('Genesis 99')).toBeNull();
  });
});

describe('resolvePracticeReturn', () => {
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-12T12:00:00Z')); });
  afterAll(() => jest.useRealTimers());
  it('keeps a selectable current-series return even when the method is a QA preview', () => {
    const resolved = resolvePracticeReturn(context(), [series()], 'dev-1');
    expect(resolved?.target.methodId).toBe('lectio_divina');
    expect(resolved?.target.dayNumber).toBe(2);
  });

  it('hides missing, archived, foreign-current, and locked targets', () => {
    expect(resolvePracticeReturn(context(), [], 'dev-1')).toBeNull();
    expect(resolvePracticeReturn(context(), [series({ archivedAt: '2026-09-10T00:00:00.000Z' })], 'dev-1')).toBeNull();
    expect(resolvePracticeReturn(context(), [series()], 'dev-other')).toBeNull();
    expect(resolvePracticeReturn(context(), [series()], null)).toBeNull();
    expect(
      resolvePracticeReturn(
        context({ target: target({ dayNumber: 3 }) }),
        [series({ currentDay: 1, days: [day(1), day(2)] })],
        'dev-1',
      ),
    ).toBeNull();
  });

  it('hides invalid identity, method, or non-integer days', () => {
    expect(resolvePracticeReturn(context({ target: target({ methodId: 'unknown_method' }) }), [series()], 'dev-1')).toBeNull();
    expect(resolvePracticeReturn(context({ target: target({ dayNumber: 2.5 }) }), [series()], 'dev-1')).toBeNull();
    expect(resolvePracticeReturn(context({ target: target({ dayNumber: 0 }) }), [series()], 'dev-1')).toBeNull();
    expect(resolvePracticeReturn(context({ target: target({ hostTab: 'bible' as PracticeTarget['hostTab'] }) }), [series()], 'dev-1')).toBeNull();
    expect(resolvePracticeReturn(null, [series()], 'dev-1')).toBeNull();
  });
});

describe('practice session helpers', () => {
  it('keys sessions by devotional, day, and method', () => {
    expect(practiceSessionKey(target())).toBe('dev-1:2:lectio_divina');
  });

  it('does not require the assigned day method', () => {
    const session = applyPracticeSessionPatch(
      target({ methodId: 'word_study' }),
      undefined,
      { answers: { choose: 'loved' }, readingMode: 'physical' },
    );
    expect(session?.readingMode).toBe('physical');
    expect(session?.answers.choose).toBe('loved');
  });
});


it('preserves observation choices separately from optional notes', () => {
  const session = applyPracticeSessionPatch(target({ methodId: 'word_study' }), undefined, {
    answers: { choose: 'Love', choose__choice: 'A repeated word' },
  });
  expect(session?.answers).toEqual({ choose: 'Love', choose__choice: 'A repeated word' });
});

it('does not accept inherited object properties as method IDs', () => {
  expect(applyPracticeSessionPatch(target({ methodId: 'toString' }), undefined, {})).toBeNull();
});

it('preserves an interrupted preview when its reader regains focus', () => {
  const { readingPracticeReturn } = jest.requireActual('../scripture-practice');
  const target = { devotionalId: 'dev-1', dayNumber: 1, hostTab: '(study)', methodId: 'lectio_divina' };
  const previous = { target, destination: 'practice' };
  expect(readingPracticeReturn(previous, { ...target, methodId: 'inductive_oia' })).toBe(previous);
  expect(readingPracticeReturn(previous, { ...target, dayNumber: 2 }).destination).toBe('reading');
});
