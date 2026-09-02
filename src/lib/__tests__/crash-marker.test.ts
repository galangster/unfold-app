function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
      getString: jest.fn((key: string) => mockMmkvStore.get(key)),
      set: jest.fn((key: string, value: string | number) => {
        mockMmkvStore.set(key, String(value));
        return true;
      }),
      delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
    };
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// eslint-disable-next-line import/first -- module import must run after Jest module mocks are registered.
import {
  BOOT_CRASH_WINDOW_MS,
  CRASH_LOOP_THRESHOLD,
  HEALTHY_BOOT_MS,
  __resetCrashMarkerSessionForTests,
  armHealthyBootTimer,
  bootCrashCountAfterUptime,
  clearBootCrashCount,
  getConsecutiveBootCrashCount,
  isBootCrash,
  isCrashLoop,
  nextBootCrashCount,
  recordCrash,
} from '../crash-marker';

const COUNT_KEY = 'consecutive-boot-crashes';

describe('crash marker decisions (pure)', () => {
  it('counts a crash inside the boot window', () => {
    expect(nextBootCrashCount(0, 0)).toBe(1);
    expect(nextBootCrashCount(1, 2_000)).toBe(2);
    expect(nextBootCrashCount(2, BOOT_CRASH_WINDOW_MS)).toBe(3);
  });

  it('leaves the streak alone for a first crash after the boot window', () => {
    expect(isBootCrash(BOOT_CRASH_WINDOW_MS + 1, false)).toBe(false);
    expect(nextBootCrashCount(2, BOOT_CRASH_WINDOW_MS + 1)).toBe(2);
    expect(nextBootCrashCount(0, 5 * 60_000)).toBe(0);
  });

  it('counts a crash after the boot window once this session already crashed at boot', () => {
    expect(isBootCrash(BOOT_CRASH_WINDOW_MS + 2_000, true)).toBe(true);
    expect(isBootCrash(5 * 60_000, true)).toBe(true);
    expect(nextBootCrashCount(1, BOOT_CRASH_WINDOW_MS + 2_000, BOOT_CRASH_WINDOW_MS, true)).toBe(2);
  });

  it('treats a garbage count or uptime conservatively', () => {
    expect(nextBootCrashCount(Number.NaN, 1)).toBe(1);
    expect(nextBootCrashCount(-4, 1)).toBe(1);
    expect(nextBootCrashCount(2.7, 1)).toBe(3);
    expect(nextBootCrashCount(1, Number.NaN)).toBe(1);
    expect(nextBootCrashCount(1, -1)).toBe(1);
  });

  it('clears the count only once the launch has been up for the healthy window', () => {
    expect(bootCrashCountAfterUptime(2, HEALTHY_BOOT_MS - 1)).toBe(2);
    expect(bootCrashCountAfterUptime(2, HEALTHY_BOOT_MS)).toBe(0);
  });

  it('never clears the count in a session that crashed at boot, however long it stays up', () => {
    expect(bootCrashCountAfterUptime(2, HEALTHY_BOOT_MS, HEALTHY_BOOT_MS, true)).toBe(2);
    expect(bootCrashCountAfterUptime(3, 10 * HEALTHY_BOOT_MS, HEALTHY_BOOT_MS, true)).toBe(3);
  });

  it('triggers recovery at three consecutive boot crashes', () => {
    expect(CRASH_LOOP_THRESHOLD).toBe(3);
    expect(isCrashLoop(0)).toBe(false);
    expect(isCrashLoop(2)).toBe(false);
    expect(isCrashLoop(3)).toBe(true);
    expect(isCrashLoop(7)).toBe(true);
  });
});

describe('crash marker storage', () => {
  beforeEach(() => {
    clearBootCrashCount();
    getMockMmkvStore().clear();
    __resetCrashMarkerSessionForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** A count carried over from earlier launches, with no crash yet in this session. */
  function seedCarriedOverCount(count: number) {
    getMockMmkvStore().set(COUNT_KEY, String(count));
  }

  it('persists consecutive boot crashes and reports the loop at three', () => {
    expect(recordCrash()).toBe(1);
    expect(recordCrash()).toBe(2);
    expect(getConsecutiveBootCrashCount()).toBe(2);
    expect(isCrashLoop(recordCrash())).toBe(true);
    expect(getMockMmkvStore().get(COUNT_KEY)).toBe('3');
  });

  it('does not count a first crash long after launch and leaves a carried-over count alone', () => {
    seedCarriedOverCount(1);
    expect(recordCrash(Date.now() + BOOT_CRASH_WINDOW_MS + 1_000)).toBe(1);
    expect(getConsecutiveBootCrashCount()).toBe(1);
  });

  it('clears the count explicitly', () => {
    recordCrash();
    clearBootCrashCount();
    expect(getConsecutiveBootCrashCount()).toBe(0);
  });

  it('clears a carried-over count once a launch with no crash has stayed up for the healthy window', () => {
    jest.useFakeTimers();
    seedCarriedOverCount(2);
    armHealthyBootTimer();
    jest.advanceTimersByTime(HEALTHY_BOOT_MS - 1);
    expect(getConsecutiveBootCrashCount()).toBe(2);
    jest.advanceTimersByTime(1);
    expect(getConsecutiveBootCrashCount()).toBe(0);
  });

  it('keeps the count when the healthy-launch timer is cancelled', () => {
    jest.useFakeTimers();
    seedCarriedOverCount(1);
    const cancel = armHealthyBootTimer();
    cancel();
    jest.advanceTimersByTime(HEALTHY_BOOT_MS);
    expect(getConsecutiveBootCrashCount()).toBe(1);
  });

  it('counts a Try Again crash after the boot window and never clears a session that crashed at boot', () => {
    // Launch → crash at 2 s → fallback → Try Again at 12 s crashes again. The
    // retry crash is the same loop, and this launch never proved healthy, so
    // the streak must survive the 30 s timer.
    jest.useFakeTimers();
    armHealthyBootTimer();
    jest.advanceTimersByTime(2_000);
    expect(recordCrash()).toBe(1);
    jest.advanceTimersByTime(10_000);
    expect(recordCrash()).toBe(2);
    jest.advanceTimersByTime(HEALTHY_BOOT_MS);
    expect(getConsecutiveBootCrashCount()).toBe(2);
  });

  it('keeps the streak while the recovery screen sits open past the healthy window, so a retry crash re-offers recovery', () => {
    // Two earlier launches crashed; this one crashes at 8 s (the third) and
    // the recovery screen opens. The user reads it past 30 s, taps Keep my
    // data → Try Again at 35 s, and the subtree crashes again.
    jest.useFakeTimers();
    seedCarriedOverCount(CRASH_LOOP_THRESHOLD - 1);
    armHealthyBootTimer();
    jest.advanceTimersByTime(8_000);
    expect(isCrashLoop(recordCrash())).toBe(true);
    jest.advanceTimersByTime(27_000);
    expect(getConsecutiveBootCrashCount()).toBe(CRASH_LOOP_THRESHOLD);
    expect(isCrashLoop(recordCrash())).toBe(true);
  });
});
