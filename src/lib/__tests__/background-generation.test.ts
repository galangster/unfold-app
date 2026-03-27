// Must mock native modules BEFORE importing the module under test
// because background-generation.ts calls TaskManager.defineTask() at module scope
jest.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: { NoData: 1, NewData: 2, Failed: 3 },
  registerTaskAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));
jest.mock('../store', () => ({
  useUnfoldStore: { getState: jest.fn() },
}));
jest.mock('../progressive-generation', () => ({
  triggerNextDayGeneration: jest.fn(),
}));
jest.mock('../notifications', () => ({
  refreshDailyReminder: jest.fn(),
}));
jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../cutoff-logic', () => ({
  isPastCutoff: jest.requireActual('../cutoff-logic').isPastCutoff,
  todayDateString: jest.requireActual('../cutoff-logic').todayDateString,
}));

import { shouldAttemptBackgroundGeneration } from '../background-generation';

describe('shouldAttemptBackgroundGeneration', () => {
  const baseState = {
    currentDevotionalId: 'devo-1',
    devotionals: [{
      id: 'devo-1',
      generationMode: 'progressive' as const,
      currentDay: 3,
      totalDays: 7,
      days: [
        { dayNumber: 1, isRead: true },
        { dayNumber: 2, isRead: true },
      ],
    }],
    lastGenerationCutoffDate: '2026-03-26',
  };

  it('returns true when conditions are met', () => {
    expect(shouldAttemptBackgroundGeneration(baseState as any, new Date('2026-03-27T02:00:00'))).toBe(true);
  });

  it('returns false when no active devotional', () => {
    expect(shouldAttemptBackgroundGeneration({
      ...baseState,
      currentDevotionalId: null,
    } as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false when already generated today', () => {
    expect(shouldAttemptBackgroundGeneration({
      ...baseState,
      lastGenerationCutoffDate: '2026-03-27',
    } as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false when next day already exists', () => {
    const state = {
      ...baseState,
      devotionals: [{
        ...baseState.devotionals[0],
        days: [
          { dayNumber: 1, isRead: true },
          { dayNumber: 2, isRead: true },
          { dayNumber: 3, isRead: false }, // next day exists
        ],
      }],
    };
    expect(shouldAttemptBackgroundGeneration(state as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false when series is complete', () => {
    const state = {
      ...baseState,
      devotionals: [{
        ...baseState.devotionals[0],
        currentDay: 8, // past totalDays
        totalDays: 7,
      }],
    };
    expect(shouldAttemptBackgroundGeneration(state as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false for non-progressive devotional', () => {
    const state = {
      ...baseState,
      devotionals: [{
        ...baseState.devotionals[0],
        generationMode: 'batch',
      }],
    };
    expect(shouldAttemptBackgroundGeneration(state as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });
});
