import {
  clearTodayProgressHistory,
  getTodayProgressHistory,
} from '../today-progress-session';

describe('today progress session', () => {
  beforeEach(() => {
    clearTodayProgressHistory();
  });

  it('returns empty history on the first cached entry', () => {
    expect(getTodayProgressHistory('device-1', 'series-a').current).toBeNull();
  });

  it('reuses the same ref for one identity and series', () => {
    const history = getTodayProgressHistory('device-1', 'series-a');
    history.current = { seriesKey: 'series-a', progress: 43 };
    expect(getTodayProgressHistory('device-1', 'series-a')).toBe(history);
    expect(history.current).toEqual({ seriesKey: 'series-a', progress: 43 });
  });

  it('clears retained progress when identity or series changes', () => {
    const history = getTodayProgressHistory('device-1', 'series-a');
    history.current = { seriesKey: 'series-a', progress: 43 };

    expect(getTodayProgressHistory('device-2', 'series-a').current).toBeNull();

    const next = getTodayProgressHistory('device-2', 'series-a');
    next.current = { seriesKey: 'series-a', progress: 57 };
    expect(getTodayProgressHistory('device-2', 'series-b').current).toBeNull();
  });
});
