function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
      getString: jest.fn((key: string) => mockMmkvStore.get(key)),
      set: jest.fn((key: string, value: string) => {
        mockMmkvStore.set(key, value);
        return true;
      }),
      delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
    };
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../sync-outbox', () => {
  const actual = jest.requireActual('../sync-outbox') as typeof import('../sync-outbox');
  return {
    ...actual,
    enqueueSyncChanges: jest.fn(),
  };
});

jest.mock('../personal-data-sync-records', () => {
  const actual = jest.requireActual('../personal-data-sync-records') as typeof import('../personal-data-sync-records');
  return {
    ...actual,
    enqueuePersonalDataSyncChange: jest.fn(),
  };
});

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { logBugEvent } from '../bug-logger';
// eslint-disable-next-line import/first
import { enqueuePersonalDataSyncChange } from '../personal-data-sync-records';
// eslint-disable-next-line import/first
import { PRACTICE_ANSWER_MAX_CHARS, PRACTICE_SESSION_LIMIT, practiceSessionKey, type PracticeTarget } from '../scripture-practice';
// eslint-disable-next-line import/first
import { useUnfoldStore, type Devotional, type DevotionalDay } from '../store';
// eslint-disable-next-line import/first
import { enqueueSyncChanges } from '../sync-outbox';

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 2,
    title: 'A revealed day',
    scriptureReference: 'Psalm 23:1',
    scriptureText: 'The Lord is my shepherd.',
    bodyText: 'A short body.',
    quotableLine: 'Grace meets you here.',
    isRead: false,
    studyMethod: 'soap_journal',
    ...overrides,
  };
}

function series(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'QA Series',
    totalDays: 3,
    currentDay: 2,
    days: [day({ dayNumber: 1, isRead: true }), day()],
    createdAt: '2026-09-01T00:00:00.000Z',
    userContext: {
      name: 'Nick',
      aboutMe: 'QA',
      currentSituation: 'Testing practice state.',
      emotionalState: 'Focused',
    },
    generationMode: 'batch',
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

describe('store scripture practice', () => {
  beforeEach(() => {
    getMockMmkvStore().clear();
    (enqueueSyncChanges as jest.Mock).mockClear();
    (enqueuePersonalDataSyncChange as jest.Mock).mockClear();
    (logBugEvent as jest.Mock).mockClear();
    useUnfoldStore.getState().reset();
  });

  it('clears a Bible return when its day completes or its series changes', () => {
    useUnfoldStore.getState().addDevotional(series());
    const context = { target: target(), destination: 'practice' as const };
    useUnfoldStore.getState().setScripturePracticeReturn(context);
    expect(useUnfoldStore.getState().scripturePracticeReturn).not.toBeNull();
    useUnfoldStore.getState().markDayAsRead(context.target.devotionalId, context.target.dayNumber);
    expect(useUnfoldStore.getState().scripturePracticeReturn).toBeNull();
    useUnfoldStore.getState().setScripturePracticeReturn(context);
    useUnfoldStore.getState().setCurrentDevotional('different-series');
    expect(useUnfoldStore.getState().scripturePracticeReturn).toBeNull();
  });

  it('keeps bounded local drafts without sync, telemetry, or day mutation', () => {
    useUnfoldStore.getState().addDevotional(series());
    (enqueueSyncChanges as jest.Mock).mockClear();
    (enqueuePersonalDataSyncChange as jest.Mock).mockClear();

    const preview = target({ methodId: 'word_study' });
    useUnfoldStore.getState().updateScripturePractice(preview, {
      step: 99,
      answers: { choose: 'x'.repeat(PRACTICE_ANSWER_MAX_CHARS + 40), ignore: 'drop me' },
      readingMode: 'physical',
    });
    useUnfoldStore.getState().setScripturePracticeReturn({
      target: preview,
      destination: 'practice',
    });

    const key = practiceSessionKey(preview);
    const session = useUnfoldStore.getState().scripturePracticeSessions[key];
    expect(session.step).toBe(2);
    expect(session.answers.choose).toHaveLength(PRACTICE_ANSWER_MAX_CHARS);
    expect(session.answers.ignore).toBeUndefined();
    expect(session.readingMode).toBe('physical');
    expect(useUnfoldStore.getState().scripturePracticeReturn?.destination).toBe('practice');
    expect(useUnfoldStore.getState().devotionals[0].days[1].studyMethod).toBe('soap_journal');
    expect(enqueueSyncChanges).not.toHaveBeenCalled();
    expect(enqueuePersonalDataSyncChange).not.toHaveBeenCalled();
    expect(logBugEvent).not.toHaveBeenCalled();
  });

  it('caps stored sessions at 64 and lets reset clear the local slice', () => {
    for (let index = 0; index < PRACTICE_SESSION_LIMIT + 1; index += 1) {
      useUnfoldStore.getState().addDevotional(series({ id: `dev-${index}` }));
      useUnfoldStore.getState().updateScripturePractice(
        target({ dayNumber: 1, methodId: 'soap_journal', devotionalId: `dev-${index}` }),
        { readingMode: 'app' },
      );
    }

    const sessions = useUnfoldStore.getState().scripturePracticeSessions;
    expect(Object.keys(sessions)).toHaveLength(PRACTICE_SESSION_LIMIT);
    expect(sessions[practiceSessionKey(target({ dayNumber: 1, methodId: 'soap_journal', devotionalId: 'dev-0' }))]).toBeUndefined();
    expect(sessions[practiceSessionKey(target({ dayNumber: 1, methodId: 'soap_journal', devotionalId: `dev-${PRACTICE_SESSION_LIMIT}` }))]).toBeDefined();

    useUnfoldStore.getState().setScripturePracticeReturn({
      target: target(),
      destination: 'reading',
    });
    useUnfoldStore.getState().reset();

    expect(useUnfoldStore.getState().scripturePracticeSessions).toEqual({});
    expect(useUnfoldStore.getState().scripturePracticeReturn).toBeNull();
  });

  it('ignores unknown methods so ordinary reading stays untouched', () => {
    useUnfoldStore.getState().addDevotional(series());
    useUnfoldStore.getState().updateScripturePractice(target({ methodId: 'not_a_method' }), {
      completed: true,
      answers: { first: 'no' },
    });

    expect(useUnfoldStore.getState().scripturePracticeSessions).toEqual({});
    expect(useUnfoldStore.getState().devotionals[0].days[1].studyMethod).toBe('soap_journal');
  });
});
