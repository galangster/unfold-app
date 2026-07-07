import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  createAutosaveController,
  shouldFlushAutosaveOnAppState,
} from '@/lib/autosave-controller';

describe('autosave controller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('forces a save at maxWait during continuous typing', () => {
    const save = jest.fn();
    const autosave = createAutosaveController({ save });

    autosave.schedule();

    for (let elapsed = 300; elapsed <= 1800; elapsed += 300) {
      jest.advanceTimersByTime(300);
      autosave.schedule();
    }

    expect(save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(AUTOSAVE_MAX_WAIT_MS - 1800 - 1);
    expect(save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);

    autosave.schedule();

    for (let elapsed = 300; elapsed <= 1800; elapsed += 300) {
      jest.advanceTimersByTime(300);
      autosave.schedule();
    }

    jest.advanceTimersByTime(200);
    expect(save).toHaveBeenCalledTimes(2);

    autosave.cancel();
  });

  it('keeps the trailing debounce for short pauses', () => {
    const save = jest.fn();
    const autosave = createAutosaveController({ save });

    autosave.schedule();
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);

    autosave.cancel();
  });

  it('flushes a pending save immediately and cancels delayed duplicate timers', () => {
    const save = jest.fn();
    const autosave = createAutosaveController({ save });

    autosave.schedule();
    jest.advanceTimersByTime(300);
    autosave.flush();

    expect(save).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(AUTOSAVE_MAX_WAIT_MS);
    expect(save).toHaveBeenCalledTimes(1);

    autosave.cancel();
  });

  it('flushes on inactive and background AppState transitions only', () => {
    expect(shouldFlushAutosaveOnAppState('inactive')).toBe(true);
    expect(shouldFlushAutosaveOnAppState('background')).toBe(true);
    expect(shouldFlushAutosaveOnAppState('active')).toBe(false);
  });
});
