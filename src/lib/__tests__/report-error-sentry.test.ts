const mockCaptureAppError = jest.fn((..._args: unknown[]) => undefined);
const mockAddAppBreadcrumb = jest.fn((..._args: unknown[]) => undefined);
const mockLogBugError = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockLoggerError = jest.fn((..._args: unknown[]) => undefined);

jest.mock('@/lib/sentry', () => ({
  captureAppError: (...args: unknown[]) => mockCaptureAppError(...args),
  addAppBreadcrumb: (...args: unknown[]) => mockAddAppBreadcrumb(...args),
  captureAppEvent: jest.fn(),
  isSentryEnabled: () => false,
}));

jest.mock('@/lib/bug-logger', () => ({
  logBugError: (...args: unknown[]) => mockLogBugError(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: jest.fn(),
    log: jest.fn(),
  },
}));

// eslint-disable-next-line import/first -- module import must run after Jest module mocks are registered.
import { reportError } from '../report-error';

/**
 * The four arguments `reportError` hands the one reporting sink: the source,
 * the error, the raw payload for the local trail, and the vouched payload that
 * is the only thing allowed to reach the reporter.
 */
type SinkCall = [string, Error, Record<string, unknown> | undefined, Record<string, unknown> | undefined];

describe('reportError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a handled error to the crash reporter and still writes the local bug log', () => {
    const error = new Error('migration blew up');

    reportError('store-migration', error, { step: 'v27' });

    // `logBugError` is the only function that reports. It takes the raw payload
    // for the local trail — the thing that survived before there was a reporter
    // — and a separate, sanitized payload for the wire.
    expect(mockLogBugError).toHaveBeenCalledWith(
      'store-migration',
      error,
      { step: 'v27' },
      { step: 'v27' },
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('files exactly one report per call', () => {
    reportError('tts-audio', new Error('no voice'), { voiceId: 'alloy' });

    // The regression this whole change exists to stop: `reportError` captured,
    // then wrote its local trail through `logBugError`, which captured again,
    // so one failure arrived twice under two different sources. Exactly one
    // sink call here, and no capture of its own. The other half of the proof —
    // one `logBugError` call produces exactly one `captureAppError`, including
    // over this very composition — is in `bug-logger-sentry.test.ts`.
    expect(mockLogBugError).toHaveBeenCalledTimes(1);
    expect(mockCaptureAppError).not.toHaveBeenCalled();
  });

  it('wraps a non-Error before reporting it', () => {
    reportError('store-migration', 'a bare string');

    const [source, reported, , reportExtra] = mockLogBugError.mock.calls[0] as SinkCall;
    expect(source).toBe('store-migration');
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe('a bare string');
    expect(reportExtra).toBeUndefined();
  });

  it('forwards identifiers and counts but never a structured payload', () => {
    // Journal entries and family names live in this app. A nested value could
    // carry either, so only its key name is allowed to leave the device.
    reportError('devotional-generation', new Error('boom'), {
      phase: 'full-generation',
      dayNumber: 4,
      retriable: true,
      entry: { body: 'my brother relapsed again' },
      keyPeople: ['Anthony', 'Mi Young'],
    });

    const [, , , reportExtra] = mockLogBugError.mock.calls[0] as SinkCall;
    expect(reportExtra).toEqual({
      phase: 'full-generation',
      dayNumber: 4,
      retriable: true,
      entry: '[omitted]',
      keyPeople: '[omitted]',
    });
    expect(JSON.stringify(reportExtra)).not.toContain('relapsed');
    expect(JSON.stringify(reportExtra)).not.toContain('Anthony');
    expect(JSON.stringify(reportExtra)).not.toContain('Mi Young');
  });

  it('leaves the unsanitized extra on the local log, which never leaves the device', () => {
    const extra = { entry: { body: 'I have been struggling to pray since my father died.' } };

    reportError('journal', new Error('boom'), extra);

    const [, , localData, reportExtra] = mockLogBugError.mock.calls[0] as SinkCall;
    expect(localData).toBe(extra);
    // ...and the same call's reportable payload keeps the key name only.
    expect(reportExtra).toEqual({ entry: '[omitted]' });
  });
});
