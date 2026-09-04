import {
  shouldWatchForGeneratedDay,
  watchForGeneratedDay,
} from '../generated-day-watch';
import type { Devotional, DevotionalDay } from '../store';

const immediate = async () => {};

function day(dayNumber: number, devotionalId = 'devo-1'): DevotionalDay {
  return {
    id: `day-${devotionalId}-${dayNumber}`,
    devotionalId,
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    scriptureText: 'In the beginning was the Word.',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead: false,
  };
}

function devotional(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: 'devo-1',
    title: 'Rooted',
    totalDays: 7,
    currentDay: 2,
    days: [day(1)],
    createdAt: '2026-09-01T08:00:00.000Z',
    seriesStartDate: '2026-09-01T08:00:00.000Z',
    generationMode: 'progressive',
    userContext: { name: 'Nick', aboutMe: '', currentSituation: '', emotionalState: '' },
    ...overrides,
  };
}

describe('watchForGeneratedDay', () => {
  it('resolves with the first non-empty fetch result', async () => {
    const fetchDay = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('day');

    await expect(watchForGeneratedDay(fetchDay, { sleep: immediate })).resolves.toBe('day');
    expect(fetchDay).toHaveBeenCalledTimes(3);
  });

  it('keeps polling through a failing fetch', async () => {
    const fetchDay = jest
      .fn<Promise<string | null>, []>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('day');

    await expect(watchForGeneratedDay(fetchDay, { sleep: immediate })).resolves.toBe('day');
    expect(fetchDay).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt budget', async () => {
    const fetchDay = jest.fn<Promise<string | null>, []>().mockResolvedValue(null);

    await expect(watchForGeneratedDay(fetchDay, { sleep: immediate, maxAttempts: 4 })).resolves.toBeNull();
    expect(fetchDay).toHaveBeenCalledTimes(4);
  });

  it('stops without fetching once cancelled', async () => {
    let cancelled = false;
    const fetchDay = jest.fn<Promise<string | null>, []>().mockResolvedValue(null);
    const sleep = async () => {
      cancelled = true;
    };

    await expect(
      watchForGeneratedDay(fetchDay, { sleep, isCancelled: () => cancelled }),
    ).resolves.toBeNull();
    expect(fetchDay).not.toHaveBeenCalled();
  });

  it('waits the interval before the first fetch so a just-queued job has time to start', async () => {
    const order: string[] = [];
    const sleep = async () => {
      order.push('sleep');
    };
    const fetchDay = async () => {
      order.push('fetch');
      return 'day';
    };

    await watchForGeneratedDay(fetchDay, { sleep });
    expect(order).toEqual(['sleep', 'fetch']);
  });
});

describe('shouldWatchForGeneratedDay', () => {
  const now = new Date(2026, 8, 3, 9, 0, 0); // Sep 3 — calendar day 3 of a Sep 1 series

  it('watches a missing, due, in-series day of a progressive series', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 2, now)).toBe(true);
    expect(shouldWatchForGeneratedDay(devotional(), 3, now)).toBe(true);
  });

  it('does not watch a day that is already on device', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 1, now)).toBe(false);
  });

  it('does not watch a day the calendar has not reached', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 4, now)).toBe(false);
  });

  it('watches any missing in-series day when the series has no calendar anchor', () => {
    expect(shouldWatchForGeneratedDay(devotional({ seriesStartDate: undefined }), 6, now)).toBe(true);
  });

  it('does not watch beyond the series or for legacy batch series', () => {
    expect(shouldWatchForGeneratedDay(devotional(), 8, now)).toBe(false);
    expect(
      shouldWatchForGeneratedDay(
        devotional({ generationMode: 'batch', seriesStartDate: undefined }),
        2,
        now,
      ),
    ).toBe(false);
    expect(shouldWatchForGeneratedDay(null, 2, now)).toBe(false);
  });
});
