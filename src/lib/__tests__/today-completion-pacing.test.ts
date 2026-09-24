import { computeDevotionalState, type ComputeInput } from '@/components/home/compute-devotional-state';
import { getReadingDayLabel, getTodayReaderDayNumber, isDevotionalDaySelectable } from '../devotional-day-access';
import { hasReadDevotionalToday } from '../home-devotional-state';
import type { Devotional, DevotionalDay } from '../store';
import { resolveRevealTarget } from '../reveal-params';

const completedAt = new Date(2026, 8, 23, 7, 40).toISOString();
const now = new Date(2026, 8, 23, 18, 52);
const days: DevotionalDay[] = Array.from({ length: 6 }, (_, index) => ({
  id: `day-pacing-regression-${index + 1}`,
  devotionalId: 'pacing-regression',
  dayNumber: index + 1,
  title: `Reading ${index + 1}`,
  scriptureReference: 'Hebrews 7:1-5',
  scriptureText: 'Scripture',
  bodyText: 'Reading content',
  quotableLine: 'A line to remember',
  isRead: index < 5,
  readAt: index === 4 ? completedAt : index < 4 ? new Date(2026, 8, 22, 9).toISOString() : undefined,
}));
const series: Devotional = {
  id: 'pacing-regression', title: 'A daily series', totalDays: 7, currentDay: 6,
  createdAt: new Date(2026, 8, 18, 5, 40).toISOString(),
  seriesStartDate: new Date(2026, 8, 18, 5, 40).toISOString(),
  generationMode: 'progressive', days,
  userContext: { name: 'Reader', aboutMe: '', currentSituation: '', emotionalState: '' },
};
const noop = () => {};

function cardAt(date: Date) {
  const input: ComputeInput = {
    currentDevotional: series, currentDayData: days[5],
    hasReadToday: hasReadDevotionalToday({ devotionals: [series], currentDevotionalId: series.id, now: date }),
    dayLabel: getReadingDayLabel(series, days[5], date),
    isJourneyComplete: false, isPreparing: false, premiumPolicy: 'granted',
    daysCompleted: 5, totalDays: 7, progress: 5 / 7 * 100, tomorrowTeaser: null,
    onContinue: noop, onCreateNew: noop, onOpenBible: noop, onRenewPremium: noop,
    onReveal: noop, ctaText: 'Continue',
  };
  return computeDevotionalState(input);
}

it('keeps the next reading locked after completion even when the series calendar is one day ahead', () => {
  expect({
    card: cardAt(now).type,
    label: getReadingDayLabel(series, days[5], now),
    readerDay: getTodayReaderDayNumber(series, now),
    nextSelectable: isDevotionalDaySelectable(series, 6, now),
  }).toEqual({ card: 'tomorrow-locked', label: 'Tomorrow', readerDay: 5, nextSelectable: false });
});

it('rejects a direct reveal route for the next reading after completion', () => {
  expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '6' }, [series], now)).toBeNull();
});

it('unlocks the next reading at local midnight without changing the saved series', () => {
  const tomorrow = new Date(2026, 8, 24, 0, 1);
  expect(cardAt(tomorrow).type).toBe('reveal-ready');
  expect(getTodayReaderDayNumber(series, tomorrow)).toBe(6);
  expect(isDevotionalDaySelectable(series, 6, tomorrow)).toBe(true);
  expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '6' }, [series], tomorrow)?.dayNumber).toBe(6);
});

it('keeps completed readings available for rereading', () => {
  expect(isDevotionalDaySelectable(series, 5, now)).toBe(true);
  expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '5' }, [series], now)?.dayNumber).toBe(5);
});


it('does not reveal a later future day when the next reading unlocks', () => {
  const tomorrow = new Date(2026, 8, 24, 0, 1);
  const withFutureDay = { ...series, days: [...series.days, { ...days[5], dayNumber: 7, title: 'Later reading' }] };
  expect(resolveRevealTarget({ devotionalId: series.id, dayNumber: '7' }, [withFutureDay], tomorrow)).toBeNull();
});
