import { computeDevotionalState, findMostRecentlyReadDay, type ComputeInput } from '../compute-devotional-state';
import type { DevotionalDay, Devotional } from '@/lib/store';

// ─── Fixtures ───────────────────────────────────────────────────

const noop = () => {};

const makeDayData = (overrides: Partial<DevotionalDay> = {}): DevotionalDay => ({
  dayNumber: 1,
  title: 'Walking by Faith',
  scriptureReference: 'Hebrews 11:1',
  scriptureText: 'Now faith is the substance of things hoped for...',
  bodyText: 'Today we explore what it means to walk by faith.',
  quotableLine: 'Faith is not the absence of doubt.',
  isRead: false,
  ...overrides,
});

const makeDevotional = (overrides: Partial<Devotional> = {}): Devotional => ({
  id: 'dev-1',
  title: 'Faith Foundations',
  totalDays: 7,
  currentDay: 1,
  days: [makeDayData()],
  createdAt: '2026-03-20T12:00:00Z',
  userContext: {
    name: 'Test User',
    aboutMe: 'Learning about faith',
    currentSituation: 'Growing spiritually',
    emotionalState: 'hopeful',
  },
  generationMode: 'progressive',
  ...overrides,
});

const baseInput: ComputeInput = {
  currentDevotional: makeDevotional(),
  currentDayData: makeDayData(),
  hasReadToday: false,
  dayLabel: 'Today',
  isJourneyComplete: false,
  isPreparing: false,
  premiumPolicy: 'granted',
  daysCompleted: 0,
  totalDays: 7,
  progress: 0,
  tomorrowTeaser: null,
  onContinue: noop,
  onReflect: noop,
  onCreateNew: noop,
  onOpenBible: noop,
  onRenewPremium: noop,
  onReveal: noop,
  ctaText: 'Begin Your Journey',
  reflectionStatus: 'empty',
};

// ─── Tests ──────────────────────────────────────────────────────

describe('computeDevotionalState', () => {
  it('returns empty when no devotional exists', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDevotional: null,
    });
    expect(state.type).toBe('empty');
    if (state.type === 'empty') {
      expect(typeof state.onCreateNew).toBe('function');
    }
  });

  it('returns preparing when isPreparing is true', () => {
    const onCreateNew = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      isPreparing: true,
      onCreateNew,
    });
    expect(state.type).toBe('preparing');
    if (state.type === 'preparing') {
      expect(state.onCreateNew).toBe(onCreateNew);
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(state.dayNumber).toBe(1);
    }
  });

  it('returns preparing when currentDayData is null', () => {
    const onCreateNew = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: null,
      onCreateNew,
    });
    expect(state.type).toBe('preparing');
    if (state.type === 'preparing') {
      expect(state.onCreateNew).toBe(onCreateNew);
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(state.dayNumber).toBe(1);
    }
  });

  it('returns premium-paused instead of preparing when premium is denied and the next day is missing', () => {
    const onOpenBible = jest.fn();
    const onRenewPremium = jest.fn();

    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: null,
      isPreparing: true,
      premiumPolicy: 'denied',
      daysCompleted: 6,
      progress: 86,
      onOpenBible,
      onRenewPremium,
    });

    expect(state.type).toBe('premium-paused');
    if (state.type === 'premium-paused') {
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(state.daysCompleted).toBe(6);
      expect(state.onOpenBible).toBe(onOpenBible);
      expect(state.onRenewPremium).toBe(onRenewPremium);
    }
  });

  it('does not show the churned upsell while premium policy is still unknown', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: null,
      isPreparing: true,
      premiumPolicy: 'unknown',
    });

    expect(state.type).toBe('preparing');
  });

  it('keeps a premium-upgraded returning user on the existing-series preparing path when the next day is missing', () => {
    const onCreateNew = jest.fn();

    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: null,
      isPreparing: true,
      premiumPolicy: 'granted',
      daysCompleted: 6,
      progress: 86,
      onCreateNew,
    });

    expect(state.type).toBe('preparing');
    if (state.type === 'preparing') {
      expect(state.onCreateNew).toBe(onCreateNew);
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(state.dayNumber).toBe(1);
    }
  });

  it('returns journey-complete when isJourneyComplete is true', () => {
    const state = computeDevotionalState({
      ...baseInput,
      isJourneyComplete: true,
      daysCompleted: 7,
      progress: 100,
    });
    expect(state.type).toBe('journey-complete');
    if (state.type === 'journey-complete') {
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(typeof state.onCreateNew).toBe('function');
    }
  });

  it('keeps a completed journey out of the preparing state when the next pointer has no day data', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDevotional: makeDevotional({ currentDay: 15, totalDays: 14 }),
      currentDayData: null,
      isJourneyComplete: true,
      isPreparing: true,
      daysCompleted: 14,
      totalDays: 14,
      progress: 100,
    });

    expect(state.type).toBe('journey-complete');
  });

  it('returns tomorrow-locked when hasReadToday is true and current day is unread', () => {
    const teaser = 'Tomorrow we dive deeper into trust.';
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      daysCompleted: 1,
      progress: 14.3,
      tomorrowTeaser: teaser,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false }),
    });
    expect(state.type).toBe('tomorrow-locked');
    if (state.type === 'tomorrow-locked') {
      expect(state.tomorrowTeaser).toBe(teaser);
      expect(state.daysCompleted).toBe(1);
    }
  });

  it('carries onReflect through on tomorrow-locked', () => {
    const onReflect = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      daysCompleted: 1,
      progress: 14.3,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false }),
      onReflect,
    });
    expect(state.type).toBe('tomorrow-locked');
    if (state.type === 'tomorrow-locked') {
      expect(state.onReflect).toBe(onReflect);
    }
  });

  it('defaults onReflect to onContinue on tomorrow-locked when omitted', () => {
    const onContinue = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      daysCompleted: 1,
      progress: 14.3,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false }),
      onContinue,
      onReflect: undefined,
    });
    expect(state.type).toBe('tomorrow-locked');
    if (state.type === 'tomorrow-locked') {
      expect(state.onReflect).toBe(onContinue);
    }
  });

  // ─── The day after a completed reading still invites reflection (item 10) ──

  it('day 1 of a 7-day series completed today: tomorrow-locked carries the completed day and the free-write save', () => {
    const onSaveFreeWrite = jest.fn();
    const dayOne = makeDayData({ dayNumber: 1, isRead: true, readAt: '2026-09-04T08:00:00Z' });
    const dayTwo = makeDayData({ dayNumber: 2, isRead: false, isRevealed: false });
    const state = computeDevotionalState({
      ...baseInput,
      currentDevotional: makeDevotional({ currentDay: 2, days: [dayOne, dayTwo] }),
      currentDayData: dayTwo,
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      daysCompleted: 1,
      progress: 14.3,
      onSaveFreeWrite,
    });
    expect(state.type).toBe('tomorrow-locked');
    if (state.type === 'tomorrow-locked') {
      expect(state.devotionalId).toBe('dev-1');
      expect(state.dayData.dayNumber).toBe(2);
      expect(state.completedDayData).toBe(dayOne);
      expect(state.onSaveFreeWrite).toBe(onSaveFreeWrite);
    }
  });

  it('a day completed yesterday routes to reveal-ready today, with no reflect payload', () => {
    const dayOne = makeDayData({ dayNumber: 1, isRead: true, readAt: '2026-09-03T08:00:00Z' });
    const dayTwo = makeDayData({ dayNumber: 2, isRead: false, isRevealed: false });
    const state = computeDevotionalState({
      ...baseInput,
      currentDevotional: makeDevotional({ currentDay: 2, days: [dayOne, dayTwo] }),
      currentDayData: dayTwo,
      hasReadToday: false,
      dayLabel: 'Today',
      daysCompleted: 1,
      progress: 14.3,
    });
    expect(state.type).toBe('reveal-ready');
    expect('completedDayData' in state).toBe(false);
    expect('onSaveFreeWrite' in state).toBe(false);
  });

  it('a 1-day series completed today keeps its journey-complete state', () => {
    const dayOne = makeDayData({ dayNumber: 1, isRead: true, readAt: '2026-09-04T08:00:00Z' });
    const state = computeDevotionalState({
      ...baseInput,
      currentDevotional: makeDevotional({ totalDays: 1, currentDay: 1, days: [dayOne] }),
      currentDayData: dayOne,
      hasReadToday: true,
      dayLabel: 'Today',
      isJourneyComplete: true,
      daysCompleted: 1,
      totalDays: 1,
      progress: 100,
    });
    expect(state.type).toBe('journey-complete');
  });

  it('tomorrow-locked defaults onSaveFreeWrite to a noop and completedDayData to null when nothing is read', () => {
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      daysCompleted: 1,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false }),
      onSaveFreeWrite: undefined,
    });
    expect(state.type).toBe('tomorrow-locked');
    if (state.type === 'tomorrow-locked') {
      expect(state.completedDayData).toBeNull();
      expect(() => state.onSaveFreeWrite(1, 'text')).not.toThrow();
    }
  });

  it('returns complete-today when current day is marked as read', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ isRead: true, readAt: '2026-03-25T10:00:00Z' }),
      daysCompleted: 1,
      progress: 14.3,
    });
    expect(state.type).toBe('complete-today');
    if (state.type === 'complete-today') {
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(typeof state.onContinue).toBe('function');
      expect(typeof state.onReflect).toBe('function');
      expect(typeof state.onCreateNew).toBe('function');
      expect(state.reflectionStatus).toBe('empty');
    }
  });

  it('carries freeWriteDraft and onSaveFreeWrite through on complete-today', () => {
    const onSaveFreeWrite = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ isRead: true, readAt: '2026-03-25T10:00:00Z' }),
      daysCompleted: 1,
      progress: 14.3,
      reflectionStatus: 'started',
      freeWriteDraft: 'A work in progress reflection.',
      onSaveFreeWrite,
    });
    expect(state.type).toBe('complete-today');
    if (state.type === 'complete-today') {
      expect(state.freeWriteDraft).toBe('A work in progress reflection.');
      expect(state.onSaveFreeWrite).toBe(onSaveFreeWrite);
      expect(state.reflectionStatus).toBe('started');
    }
  });

  it('defaults freeWriteDraft to empty string and onSaveFreeWrite to a noop when omitted', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ isRead: true, readAt: '2026-03-25T10:00:00Z' }),
      daysCompleted: 1,
      progress: 14.3,
      freeWriteDraft: undefined,
      onSaveFreeWrite: undefined,
    });
    expect(state.type).toBe('complete-today');
    if (state.type === 'complete-today') {
      expect(state.freeWriteDraft).toBe('');
      expect(typeof state.onSaveFreeWrite).toBe('function');
      expect(() => state.onSaveFreeWrite(1, 'text')).not.toThrow();
    }
  });

  it('returns unread with overdue label when current content is stale', () => {
    const state = computeDevotionalState({
      ...baseInput,
      dayLabel: 'Overdue',
      daysCompleted: 3,
      progress: 42.9,
      ctaText: 'Keep Going',
      currentDayData: makeDayData({ dayNumber: 4, isRead: false, isRevealed: true }),
    });
    expect(state.type).toBe('unread');
    if (state.type === 'unread') {
      expect(state.dayLabel).toBe('Overdue');
    }
  });

  it('returns unread with daysCompleted when some days completed but current day unread', () => {
    const state = computeDevotionalState({
      ...baseInput,
      daysCompleted: 3,
      progress: 42.9,
      ctaText: 'Keep Going',
      currentDayData: makeDayData({ dayNumber: 4, isRead: false, isRevealed: true }),
    });
    expect(state.type).toBe('unread');
    if (state.type === 'unread') {
      expect(state.daysCompleted).toBe(3);
      expect(state.ctaText).toBe('Keep Going');
    }
  });

  it('returns unread with daysCompleted=0 when no days completed', () => {
    const state = computeDevotionalState(baseInput);
    expect(state.type).toBe('unread');
    if (state.type === 'unread') {
      expect(state.totalDays).toBe(7);
      expect(state.daysCompleted).toBe(0);
      expect(state.ctaText).toBe('Begin Your Journey');
      expect(typeof state.onContinue).toBe('function');
    }
  });

  // ─── Reveal-ready state ──────────────────────────────────────

  it('returns reveal-ready when day exists, unread, unrevealed, and dayNumber > 1', () => {
    const onReveal = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false, isRevealed: false }),
      daysCompleted: 1,
      progress: 14.3,
      onReveal,
    });
    expect(state.type).toBe('reveal-ready');
    if (state.type === 'reveal-ready') {
      expect(state.dayNumber).toBe(2);
      expect(state.seriesTitle).toBe('Faith Foundations');
      expect(state.totalDays).toBe(7);
      expect(state.onReveal).toBe(onReveal);
    }
  });

  it('returns unread (not reveal-ready) when day is already revealed', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false, isRevealed: true }),
      daysCompleted: 1,
    });
    expect(state.type).toBe('unread');
  });

  it('returns unread (not reveal-ready) for Day 1', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ dayNumber: 1, isRead: false, isRevealed: false }),
    });
    expect(state.type).toBe('unread');
  });

  it('tomorrow-locked takes priority over reveal-ready', () => {
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      currentDayData: makeDayData({ dayNumber: 2, isRead: false, isRevealed: false }),
      daysCompleted: 1,
    });
    expect(state.type).toBe('tomorrow-locked');
  });

  it('keeps a calendar-eligible catch-up next day revealable even when another day was read today', () => {
    const onReveal = jest.fn();
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      dayLabel: 'Today',
      currentDayData: makeDayData({ dayNumber: 7, isRead: false, isRevealed: false }),
      daysCompleted: 6,
      onReveal,
    });

    expect(state.type).toBe('reveal-ready');
    if (state.type === 'reveal-ready') {
      expect(state.dayNumber).toBe(7);
      expect(state.onReveal).toBe(onReveal);
    }
  });

  it('returns reveal-ready when isRevealed is undefined (unmigrated data)', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: makeDayData({ dayNumber: 2, isRead: false }),
      daysCompleted: 1,
    });
    expect(state.type).toBe('reveal-ready');
  });

  it('returns tomorrow-locked when today\'s reading is done, even if the next day is still unrevealed', () => {
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
      dayLabel: 'Tomorrow',
      currentDayData: makeDayData({ dayNumber: 3, isRead: false, isRevealed: false }),
      daysCompleted: 2,
    });
    expect(state.type).toBe('tomorrow-locked');
  });

  // ─── Priority order ──────────────────────────────────────────

  it('journey-complete takes priority over preparing', () => {
    const state = computeDevotionalState({
      ...baseInput,
      isPreparing: true,
      isJourneyComplete: true,
    });
    expect(state.type).toBe('journey-complete');
  });

  it('journey-complete takes priority over tomorrow-locked', () => {
    const state = computeDevotionalState({
      ...baseInput,
      isJourneyComplete: true,
      hasReadToday: true,
      daysCompleted: 7,
    });
    expect(state.type).toBe('journey-complete');
  });

  it('findMostRecentlyReadDay picks the latest readAt, then the highest day number, ignoring unread days', () => {
    const readEarly = makeDayData({ dayNumber: 3, isRead: true, readAt: '2026-09-03T08:00:00Z' });
    const readLate = makeDayData({ dayNumber: 2, isRead: true, readAt: '2026-09-04T08:00:00Z' });
    const unread = makeDayData({ dayNumber: 4, isRead: false });
    expect(findMostRecentlyReadDay([readEarly, readLate, unread])).toBe(readLate);

    const noStampLow = makeDayData({ dayNumber: 1, isRead: true });
    const noStampHigh = makeDayData({ dayNumber: 2, isRead: true });
    expect(findMostRecentlyReadDay([noStampHigh, noStampLow])).toBe(noStampHigh);

    expect(findMostRecentlyReadDay([unread])).toBeNull();
    expect(findMostRecentlyReadDay([])).toBeNull();
  });

  it('empty takes priority over everything', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDevotional: null,
      isPreparing: true,
      isJourneyComplete: true,
      hasReadToday: true,
    });
    expect(state.type).toBe('empty');
  });
});
