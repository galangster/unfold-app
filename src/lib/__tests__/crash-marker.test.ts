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
  armHealthyBootTimer,
  bootCrashCountAfterUptime,
  clearBootCrashCount,
  getConsecutiveBootCrashCount,
  isCrashLoop,
  nextBootCrashCount,
  recordCrash,
} from '../crash-marker';

describe('crash marker decisions (pure)', () => {
  it('counts a crash inside the boot window', () => {
    expect(nextBootCrashCount(0, 0)).toBe(1);
    expect(nextBootCrashCount(1, 2_000)).toBe(2);
    expect(nextBootCrashCount(2, BOOT_CRASH_WINDOW_MS)).toBe(3);
  });

  it('leaves the streak alone for a crash after the boot window', () => {
    expect(nextBootCrashCount(2, BOOT_CRASH_WINDOW_MS + 1)).toBe(2);
    expect(nextBootCrashCount(0, 5 * 60_000)).toBe(0);
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists consecutive boot crashes and reports the loop at three', () => {
    expect(recordCrash()).toBe(1);
    expect(recordCrash()).toBe(2);
    expect(getConsecutiveBootCrashCount()).toBe(2);
    expect(isCrashLoop(recordCrash())).toBe(true);
    expect(getMockMmkvStore().get('consecutive-boot-crashes')).toBe('3');
  });

  it('does not count a crash long after launch', () => {
    recordCrash();
    expect(recordCrash(Date.now() + BOOT_CRASH_WINDOW_MS + 1_000)).toBe(1);
    expect(getConsecutiveBootCrashCount()).toBe(1);
  });

  it('clears the count explicitly', () => {
    recordCrash();
    clearBootCrashCount();
    expect(getConsecutiveBootCrashCount()).toBe(0);
  });

  it('clears the count once the launch has stayed up for the healthy window', () => {
    jest.useFakeTimers();
    recordCrash();
    armHealthyBootTimer();
    jest.advanceTimersByTime(HEALTHY_BOOT_MS - 1);
    expect(getConsecutiveBootCrashCount()).toBe(1);
    jest.advanceTimersByTime(1);
    expect(getConsecutiveBootCrashCount()).toBe(0);
  });

  it('keeps the count when the healthy-launch timer is cancelled', () => {
    jest.useFakeTimers();
    recordCrash();
    const cancel = armHealthyBootTimer();
    cancel();
    jest.advanceTimersByTime(HEALTHY_BOOT_MS);
    expect(getConsecutiveBootCrashCount()).toBe(1);
  });
});
