import {
  noteReadBudgetRateLimited,
  readBudgetRetryAfterMs,
  resetReadBudgetForTests,
  subscribeReadBudget,
  syncCheckCooldown,
} from '../sync-pull-backoff';

describe('read-budget back-off', () => {
  const now = 1_000_000;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    resetReadBudgetForTests();
  });

  afterEach(() => {
    resetReadBudgetForTests();
    jest.useRealTimers();
  });

  it.each([
    [36, 36_000],
    [2, 10_000],
    [600, 60_000],
    [null, 30_000],
  ])('clamps a %s-second retry window to %s milliseconds', (retryAfterSeconds, expected) => {
    noteReadBudgetRateLimited(retryAfterSeconds);

    expect(readBudgetRetryAfterMs()).toBe(expected);
  });

  it('keeps the later window end when another rate limit is noted', () => {
    noteReadBudgetRateLimited(36);
    jest.advanceTimersByTime(1_000);
    noteReadBudgetRateLimited(10);

    expect(readBudgetRetryAfterMs()).toBe(35_000);

    noteReadBudgetRateLimited(60);

    expect(readBudgetRetryAfterMs()).toBe(60_000);
  });

  it('notifies listeners when the window changes and when it ends', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeReadBudget(listener);

    noteReadBudgetRateLimited(10);
    expect(listener).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(9_999);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readBudgetRetryAfterMs()).toBe(1);

    jest.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(readBudgetRetryAfterMs()).toBe(0);

    unsubscribe();
  });

  it('keeps the ordinary check rest at ten seconds', () => {
    expect(syncCheckCooldown(now)).toEqual({ until: now + 10_000 });
  });
});
