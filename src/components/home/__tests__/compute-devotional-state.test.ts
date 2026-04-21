import { computeDevotionalState, type ComputeInput } from '../compute-devotional-state';
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
  daysCompleted: 0,
  totalDays: 7,
  progress: 0,
  tomorrowTeaser: null,
  onContinue: noop,
  onCreateNew: noop,
  onReveal: noop,
  ctaText: 'Begin Your Journey',
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
    const state = computeDevotionalState({
      ...baseInput,
      isPreparing: true,
    });
    expect(state.type).toBe('preparing');
  });

  it('returns preparing when currentDayData is null', () => {
    const state = computeDevotionalState({
      ...baseInput,
      currentDayData: null,
    });
    expect(state.type).toBe('preparing');
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

  it('returns tomorrow-locked when hasReadToday is true and current day is unread', () => {
    const teaser = 'Tomorrow we dive deeper into trust.';
    const state = computeDevotionalState({
      ...baseInput,
      hasReadToday: true,
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
      expect(typeof state.onCreateNew).toBe('function');
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
      currentDayData: makeDayData({ dayNumber: 2, isRead: false, isRevealed: false }),
      daysCompleted: 1,
    });
    expect(state.type).toBe('tomorrow-locked');
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
      currentDayData: makeDayData({ dayNumber: 3, isRead: false, isRevealed: false }),
      daysCompleted: 2,
    });
    expect(state.type).toBe('tomorrow-locked');
  });

  // ─── Priority order ──────────────────────────────────────────

  it('preparing takes priority over journey-complete', () => {
    const state = computeDevotionalState({
      ...baseInput,
      isPreparing: true,
      isJourneyComplete: true,
    });
    expect(state.type).toBe('preparing');
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
