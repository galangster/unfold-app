import type { ErrorUtils } from 'react-native';

const mockLogBugError = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockCaptureAppError = jest.fn((..._args: unknown[]) => undefined);
const mockRecordCrash = jest.fn(() => 1);
const mockRecordFatalBreadcrumb = jest.fn((..._args: unknown[]) => undefined);
const mockTakeLastFatalBreadcrumb = jest.fn<
  { message: string; stack: string | null; ts: string } | null,
  []
>(() => null);

jest.mock('@/lib/bug-logger', () => ({
  logBugError: (...args: unknown[]) => mockLogBugError(...args),
}));

jest.mock('@/lib/sentry', () => ({
  captureAppError: (...args: unknown[]) => mockCaptureAppError(...args),
  addAppBreadcrumb: jest.fn(),
  captureAppEvent: jest.fn(),
  isSentryEnabled: () => false,
}));

jest.mock('@/lib/crash-marker', () => ({
  recordCrash: () => mockRecordCrash(),
  recordFatalBreadcrumb: (...args: unknown[]) => mockRecordFatalBreadcrumb(...args),
  takeLastFatalBreadcrumb: () => mockTakeLastFatalBreadcrumb(),
}));

// eslint-disable-next-line import/first -- module import must run after Jest module mocks are registered.
import {
  flushLastFatalBreadcrumb,
  installGlobalErrorHandler,
  resolveErrorUtils,
} from '../global-error-handler';

type Handler = (error: unknown, isFatal?: boolean) => void;

function fakeErrorUtils() {
  const previous = jest.fn<void, [unknown, boolean | undefined]>();
  let current: Handler = previous;
  const setGlobalHandler = jest.fn((handler: Handler) => {
    current = handler;
  });
  const utils: ErrorUtils = {
    getGlobalHandler: () => current,
    setGlobalHandler,
  };
  return {
    utils,
    previous,
    setGlobalHandler,
    invoke: (error: unknown, isFatal?: boolean) => current(error, isFatal),
  };
}

describe('installGlobalErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a fatal error in the bug log and the crash marker, then delegates to the previous handler', () => {
    const fake = fakeErrorUtils();
    const error = new Error('fatal');

    expect(installGlobalErrorHandler(fake.utils)).toBe(true);
    fake.invoke(error, true);

    expect(mockLogBugError).toHaveBeenCalledWith(
      'global-error',
      error,
      { isFatal: true },
      { isFatal: true, mechanism: 'fatal' },
    );
    expect(mockRecordCrash).toHaveBeenCalledTimes(1);
    expect(fake.previous).toHaveBeenCalledWith(error, true);
  });

  it('writes the synchronous fatal breadcrumb before the async bug-log write', () => {
    // The previous handler kills the process on a production fatal, so the
    // await inside logBugError never resolves; only a sync write survives.
    const fake = fakeErrorUtils();
    const error = new Error('fatal');
    const order: string[] = [];
    mockRecordFatalBreadcrumb.mockImplementationOnce(() => {
      order.push('breadcrumb');
      return undefined;
    });
    mockLogBugError.mockImplementationOnce(() => {
      order.push('bug-log');
      return Promise.resolve();
    });

    installGlobalErrorHandler(fake.utils);
    fake.invoke(error, true);

    expect(mockRecordFatalBreadcrumb).toHaveBeenCalledWith(error);
    expect(order).toEqual(['breadcrumb', 'bug-log']);
  });

  it('leaves no breadcrumb for a non-fatal error', () => {
    const fake = fakeErrorUtils();

    installGlobalErrorHandler(fake.utils);
    fake.invoke(new Error('soft'), false);

    expect(mockRecordFatalBreadcrumb).not.toHaveBeenCalled();
  });

  it('logs a non-fatal error without touching the crash marker', () => {
    const fake = fakeErrorUtils();
    const error = new Error('soft');

    installGlobalErrorHandler(fake.utils);
    fake.invoke(error, false);

    expect(mockLogBugError).toHaveBeenCalledWith(
      'global-error',
      error,
      { isFatal: false },
      { isFatal: false, mechanism: 'fatal' },
    );
    expect(mockRecordCrash).not.toHaveBeenCalled();
    expect(fake.previous).toHaveBeenCalledWith(error, false);
  });

  it('reports a fatal once with the fatal flag, and still counts the boot-crash streak', () => {
    const fake = fakeErrorUtils();
    const error = new Error('fatal');

    installGlobalErrorHandler(fake.utils);
    fake.invoke(error, true);

    // One sink, one report. This handler used to capture on its own AND write
    // the bug log, and the bug log reports too, so every fatal was filed twice
    // under two different sources ('fatal' and 'global-error'). The vouched
    // payload carries the fatal flag; `bug-logger-sentry.test.ts` asserts that
    // one sink call reaches the reporter exactly once, over this very path.
    expect(mockLogBugError).toHaveBeenCalledTimes(1);
    expect(mockLogBugError).toHaveBeenCalledWith(
      'global-error',
      error,
      { isFatal: true },
      { isFatal: true, mechanism: 'fatal' },
    );
    expect(mockCaptureAppError).not.toHaveBeenCalled();
    // The streak is what flips the boundary into recovery mode. Reporting
    // must not cost the app that, and must not double-count it either.
    expect(mockRecordFatalBreadcrumb).toHaveBeenCalledWith(error);
    expect(mockRecordCrash).toHaveBeenCalledTimes(1);
    expect(fake.previous).toHaveBeenCalledWith(error, true);
  });

  it('reports a non-fatal once with the flag cleared and no crash-marker write', () => {
    const fake = fakeErrorUtils();
    const error = new Error('soft');

    installGlobalErrorHandler(fake.utils);
    fake.invoke(error, false);

    expect(mockLogBugError).toHaveBeenCalledTimes(1);
    expect(mockLogBugError).toHaveBeenCalledWith(
      'global-error',
      error,
      { isFatal: false },
      { isFatal: false, mechanism: 'fatal' },
    );
    expect(mockCaptureAppError).not.toHaveBeenCalled();
    expect(mockRecordCrash).not.toHaveBeenCalled();
  });

  it('hands a thrown non-Error to the sink, which wraps it before reporting', () => {
    const fake = fakeErrorUtils();

    installGlobalErrorHandler(fake.utils);
    fake.invoke('string boom', true);

    const [source, thrown, , reportExtra] = mockLogBugError.mock.calls[0] as [
      string,
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(source).toBe('global-error');
    expect(thrown).toBe('string boom');
    expect(reportExtra).toEqual({ isFatal: true, mechanism: 'fatal' });
    // `logBugError` does the wrapping for every caller, so the reporter always
    // receives an Error. `bug-logger-sentry.test.ts` asserts that over this
    // path, with the real sink behind the handler.
  });

  it('installs once per ErrorUtils', () => {
    const fake = fakeErrorUtils();

    expect(installGlobalErrorHandler(fake.utils)).toBe(true);
    expect(installGlobalErrorHandler(fake.utils)).toBe(true);

    expect(fake.setGlobalHandler).toHaveBeenCalledTimes(1);
  });

  it('is a no-op where ErrorUtils is absent (web, jest)', () => {
    expect(installGlobalErrorHandler(null)).toBe(false);
  });

  it('still delegates when recording itself throws', () => {
    const fake = fakeErrorUtils();
    const error = new Error('fatal');
    mockLogBugError.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    installGlobalErrorHandler(fake.utils);
    expect(() => fake.invoke(error, true)).not.toThrow();

    expect(fake.previous).toHaveBeenCalledWith(error, true);
  });
});

describe('flushLastFatalBreadcrumb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTakeLastFatalBreadcrumb.mockReturnValue(null);
  });

  it("writes the previous launch's fatal into the bug log", () => {
    mockTakeLastFatalBreadcrumb.mockReturnValueOnce({
      message: 'Error: fatal boom',
      stack: 'Error: fatal boom\n    at boot (app.js:1)',
      ts: '2026-09-03T10:00:00.000Z',
    });

    expect(flushLastFatalBreadcrumb()).toBe(true);
    expect(mockLogBugError).toHaveBeenCalledWith(
      'global-error-fatal-previous-launch',
      'Error: fatal boom',
      {
        isFatal: true,
        crashedAt: '2026-09-03T10:00:00.000Z',
        stack: 'Error: fatal boom\n    at boot (app.js:1)',
      },
      // Explicitly not reported: the crash was already filed natively.
      false,
    );
  });

  it('adds no capture of its own when replaying the previous launch', () => {
    mockTakeLastFatalBreadcrumb.mockReturnValueOnce({
      message: 'Error: fatal boom',
      stack: 'Error: fatal boom\n    at boot (app.js:1)',
      ts: '2026-09-03T10:00:00.000Z',
    });

    expect(flushLastFatalBreadcrumb()).toBe(true);
    // One entry through the one sink and nothing else: this path never
    // captures separately, exactly like the live handler above.
    expect(mockLogBugError).toHaveBeenCalledTimes(1);
    expect(mockCaptureAppError).not.toHaveBeenCalled();
  });

  it('is a no-op on a launch that follows no fatal', () => {
    expect(flushLastFatalBreadcrumb()).toBe(false);
    expect(mockLogBugError).not.toHaveBeenCalled();
  });

  it('never throws when the marker store is unusable', () => {
    mockTakeLastFatalBreadcrumb.mockImplementationOnce(() => {
      throw new Error('mmkv gone');
    });

    expect(flushLastFatalBreadcrumb()).toBe(false);
  });
});

describe('resolveErrorUtils', () => {
  const holder = globalThis as { ErrorUtils?: unknown };
  const original = holder.ErrorUtils;

  afterEach(() => {
    holder.ErrorUtils = original;
  });

  it('returns the global when it has the handler API', () => {
    const fake = fakeErrorUtils();
    holder.ErrorUtils = fake.utils;
    expect(resolveErrorUtils()).toBe(fake.utils);
  });

  it('returns null for a missing or partial global', () => {
    holder.ErrorUtils = undefined;
    expect(resolveErrorUtils()).toBeNull();
    holder.ErrorUtils = { setGlobalHandler: () => {} };
    expect(resolveErrorUtils()).toBeNull();
  });
});
