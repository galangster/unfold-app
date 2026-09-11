import { computeDevotionalState } from '@/components/home/compute-devotional-state';
import { getHomeDevotionalDayData, hasReadDevotionalToday } from '../home-devotional-state';
import {
  TRIAL_SERIES_FIXTURE_STATES,
  buildTrialSeriesSeed,
  type TrialSeriesFixtureState,
} from '../dev-seed';
import { roundTrialDays } from '../trial-facts';

const NOW = new Date(2026, 8, 11, 15, 30, 0);

const DAY_OFFSET: Partial<Record<TrialSeriesFixtureState, number>> = {
  'today-day1': 0,
  'today-day2': 1,
  'today-day2-read': 1,
  'today-day3': 2,
  'today-lapsed-before-day3': 2,
  'series-complete': 2,
};

const TARGET: Record<TrialSeriesFixtureState, unknown> = {
  'reveal-generating': '/generating',
  'reveal-failed': '/generating',
  'reveal-exhausted': '/generating',
  confirmation: { pathname: '/onboarding', params: { startAt: 'purchaseConfirmation' } },
  'later-entry-notify': '/(tabs)/(today)',
  'today-day1': '/(tabs)/(today)',
  'today-day2': '/(tabs)/(today)',
  'today-day2-read': '/(tabs)/(today)',
  'today-day3': '/(tabs)/(today)',
  'today-lapsed-before-day3': '/(tabs)/(today)',
  'series-complete': '/(tabs)/(today)',
};

function localKey(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function atLocalNoon(now: Date, minusDays: number): Date {
  const next = new Date(now);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() - minusDays);
  return next;
}

describe('L5 buildTrialSeriesSeed', () => {
  it('backdates seriesStartDate by dayOffset and lands on the existing-screen target', () => {
    for (const state of TRIAL_SERIES_FIXTURE_STATES) {
      const seed = buildTrialSeriesSeed({ state, now: NOW });
      expect(seed.target).toEqual(TARGET[state]);

      const dayOffset = DAY_OFFSET[state];
      if (dayOffset == null) {
        expect(seed.devotional).toBeUndefined();
        continue;
      }

      expect(seed.devotional).toBeDefined();
      const start = new Date(seed.devotional!.seriesStartDate!);
      const expected = atLocalNoon(NOW, dayOffset);
      expect(start.getHours()).toBe(12);
      expect(start.getMinutes()).toBe(0);
      expect(localKey(start)).toBe(localKey(expected));
      expect(seed.devotional!.generationMode).toBe('progressive');
      expect(seed.devotional!.seriesArc?.seriesKind).toBe('auto_trial');
      expect(seed.devotional!.totalDays).toBe(seed.devotional!.seriesArc?.totalDaysPlanned);
    }
  });

  it('derives trial length from the seed dates and never stamps readAt with the clock', () => {
    const seed = buildTrialSeriesSeed({ state: 'today-day3', now: NOW });
    const purchasedAtMs = Date.parse(seed.intent!.purchasedAt);
    const expiresAtMs = Date.parse(seed.intent!.expiresAt);
    expect(seed.intent!.trialDays).toBe(roundTrialDays(expiresAtMs - purchasedAtMs));
    expect(seed.intent!.trialDays).toBe(seed.devotional!.totalDays);

    for (const day of seed.devotional!.days.filter((row) => row.isRead)) {
      expect(day.readAt).toBeDefined();
      expect(Date.parse(day.readAt!)).not.toBe(NOW.getTime());
    }
  });

  it('keeps today-day3 and the lapsed seed unread today with currentDay 3', () => {
    for (const state of ['today-day3', 'today-lapsed-before-day3'] as const) {
      const seed = buildTrialSeriesSeed({ state, now: NOW });
      expect(seed.devotional!.currentDay).toBe(3);
      expect(hasReadDevotionalToday({
        devotionals: [seed.devotional!],
        currentDevotionalId: seed.devotional!.id,
        now: NOW,
      })).toBe(false);
    }

    const lapsed = buildTrialSeriesSeed({ state: 'today-lapsed-before-day3', now: NOW });
    expect(getHomeDevotionalDayData(lapsed.devotional, NOW)).toBeNull();
    expect(lapsed.devotional!.days.some((day) => day.dayNumber === 3)).toBe(false);
    expect(lapsed.uiFlags.debugForceTrialExpired).toBe(true);

    const paused = computeDevotionalState({
      currentDevotional: lapsed.devotional!,
      currentDayData: getHomeDevotionalDayData(lapsed.devotional, NOW),
      hasReadToday: false,
      dayLabel: 'Today',
      isJourneyComplete: false,
      isPreparing: false,
      premiumPolicy: 'denied',
      daysCompleted: lapsed.devotional!.days.filter((day) => day.isRead).length,
      totalDays: lapsed.devotional!.totalDays,
      progress: 0,
      tomorrowTeaser: null,
      onContinue: jest.fn(),
      onCreateNew: jest.fn(),
      onOpenBible: jest.fn(),
      onRenewPremium: jest.fn(),
      onReveal: jest.fn(),
      ctaText: '',
      autoTrialActive: true,
    });
    expect(paused.type).toBe('premium-paused');
  });

  it('seeds generating, failed, and exhausted onto /generating without a series shell', () => {
    const generating = buildTrialSeriesSeed({ state: 'reveal-generating', now: NOW });
    expect(generating.intent?.status).toBe('submitted');
    expect(generating.intent?.jobId).toBeTruthy();
    expect(generating.intent?.devotionalId).toBeNull();

    const failed = buildTrialSeriesSeed({ state: 'reveal-failed', now: NOW });
    expect(failed.intent?.status).toBe('submitted');
    expect(failed.intent?.jobId).toBeTruthy();

    const exhausted = buildTrialSeriesSeed({ state: 'reveal-exhausted', now: NOW });
    expect(exhausted.intent?.status).toBe('failed');
  });

  it('seeds confirmation, later-entry notify, Day 2 read, and series complete on existing screens', () => {
    const confirmation = buildTrialSeriesSeed({ state: 'confirmation', now: NOW });
    expect(confirmation.intent?.status).toBe('purchased');
    expect(confirmation.intent?.entry).toBe('onboarding');

    const notify = buildTrialSeriesSeed({ state: 'later-entry-notify', now: NOW });
    expect(notify.intent).toBeUndefined();
    expect(notify.uiFlags.laterEntryNotifyAskPending).toBe(true);

    const day2Read = buildTrialSeriesSeed({ state: 'today-day2-read', now: NOW });
    expect(day2Read.devotional!.days.find((day) => day.dayNumber === 2)?.isRead).toBe(true);
    expect(Date.parse(day2Read.devotional!.days.find((day) => day.dayNumber === 2)!.readAt!))
      .toBe(NOW.getTime());

    const complete = buildTrialSeriesSeed({ state: 'series-complete', now: NOW });
    expect(complete.devotional!.days.every((day) => day.isRead)).toBe(true);
    expect(complete.intent?.status).toBe('completed');
  });
});
