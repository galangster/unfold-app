import type { Devotional, DevotionalDay } from '@/lib/store';
import {
  getBridgeDayNumber,
  getEveningWindDownDayNumber,
  getMiddayCheckInDayNumber,
} from '../today-companion-state';

const NOW = new Date('2026-05-11T18:30:00');

function day(dayNumber: number, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning was the Word.',
    bodyText: 'Body',
    quotableLine: 'Quote.',
    isRead: false,
    ...overrides,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'dev-1',
    title: 'Series',
    totalDays: 7,
    currentDay: 1,
    days: [],
    createdAt: '2026-05-05T08:00:00',
    generationMode: 'progressive',
    userContext: {
      name: 'Nick',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    ...overrides,
  };
}

describe('today companion/check-in day targeting', () => {
  it('targets the completed day for evening wind-down when currentDay has advanced to tomorrow', () => {
    const d = devotional({
      currentDay: 7,
      days: [
        day(5, { isRead: true, readAt: '2026-05-10T08:00:00' }),
        day(6, { isRead: true, readAt: '2026-05-11T17:35:00' }),
        day(7),
      ],
    });

    expect(getEveningWindDownDayNumber(d, NOW)).toBe(6);
  });

  it('targets the final completed day instead of subtracting one', () => {
    const d = devotional({
      currentDay: 7,
      days: [
        day(6, { isRead: true, readAt: '2026-05-10T08:00:00' }),
        day(7, { isRead: true, readAt: '2026-05-11T17:35:00' }),
      ],
    });

    expect(getEveningWindDownDayNumber(d, NOW)).toBe(7);
  });

  it('keeps bridge hidden after reading today so tomorrow locked content does not surface as a companion intro', () => {
    const d = devotional({
      currentDay: 7,
      days: [
        day(6, { isRead: true, readAt: '2026-05-11T17:35:00' }),
        day(7),
      ],
    });

    expect(getBridgeDayNumber(d, true, NOW)).toBeNull();
  });

  it('shows bridge for an unread day after day 1', () => {
    const d = devotional({
      currentDay: 3,
      days: [
        day(1, { isRead: true, readAt: '2026-05-09T08:00:00' }),
        day(2, { isRead: true, readAt: '2026-05-10T08:00:00' }),
        day(3),
      ],
    });

    expect(getBridgeDayNumber(d, false, NOW)).toBe(3);
  });

  it('uses the currently readable day for midday check-ins', () => {
    const d = devotional({
      currentDay: 4,
      days: [day(4)],
    });

    expect(getMiddayCheckInDayNumber(d, NOW)).toBe(4);
  });
});
