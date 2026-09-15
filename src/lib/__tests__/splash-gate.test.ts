import { SPLASH_FAILSAFE_MS, createSplashGate } from '../splash-gate';

function createHarness(hideAsync = jest.fn().mockResolvedValue(undefined)) {
  const frames: (() => void)[] = [];
  const gate = createSplashGate({
    hideAsync,
    requestAnimationFrame: (callback) => {
      frames.push(callback);
    },
  });
  return { gate, hideAsync, frames };
}

describe('createSplashGate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hides after fonts settle', () => {
    const { gate, hideAsync, frames } = createHarness();
    gate.startFailsafe();
    gate.onFontsSettled();

    expect(hideAsync).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    frames[0]();
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides after the 2500 ms fail-safe when fonts never settle', () => {
    const { gate, hideAsync } = createHarness();
    gate.startFailsafe();

    jest.advanceTimersByTime(SPLASH_FAILSAFE_MS - 1);
    expect(hideAsync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides on AppState active', () => {
    const { gate, hideAsync } = createHarness();
    gate.startFailsafe();
    gate.onAppStateChange('background');
    gate.onAppStateChange('inactive');
    expect(hideAsync).not.toHaveBeenCalled();

    gate.onAppStateChange('active');
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('never calls hide twice', () => {
    const { gate, hideAsync, frames } = createHarness();
    gate.startFailsafe();
    gate.onFontsSettled();
    frames[0]();
    gate.onAppStateChange('active');
    jest.advanceTimersByTime(SPLASH_FAILSAFE_MS);
    gate.onFontsSettled();

    expect(hideAsync).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected hideAsync', async () => {
    const hideAsync = jest.fn().mockRejectedValue(new Error('native splash'));
    const gate = createSplashGate({ hideAsync });
    gate.startFailsafe();

    expect(() => {
      jest.advanceTimersByTime(SPLASH_FAILSAFE_MS);
    }).not.toThrow();

    await Promise.resolve();
    expect(hideAsync).toHaveBeenCalledTimes(1);
  });
});
