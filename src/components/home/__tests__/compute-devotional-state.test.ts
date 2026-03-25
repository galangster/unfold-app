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
  isJourneyComplete: false,
  isPreparing: false,
  daysCompleted: 0,
  totalDays: 7,
  progress: 0,
  tomorrowTeaser: null,
  onContinue: noop,
  onCreateNew: noop,
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

  it('returns in-progress when some days completed but current day unread', () => {
    const state = computeDevotionalState({
      ...baseInput,
      daysCompleted: 3,
      progress: 42.9,
      ctaText: 'Keep Going',
      currentDayData: makeDayData({ dayNumber: 4, isRead: false }),
    });
    expect(state.type).toBe('in-progress');
    if (state.type === 'in-progress') {
      expect(state.daysCompleted).toBe(3);
      expect(state.ctaText).toBe('Keep Going');
    }
  });

  it('returns unread when no days completed', () => {
    const state = computeDevotionalState(baseInput);
    expect(state.type).toBe('unread');
    if (state.type === 'unread') {
      expect(state.totalDays).toBe(7);
      expect(state.ctaText).toBe('Begin Your Journey');
      expect(typeof state.onContinue).toBe('function');
    }
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
