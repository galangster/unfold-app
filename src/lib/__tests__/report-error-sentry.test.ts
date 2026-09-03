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

describe('reportError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a handled error to the crash reporter and still writes the local bug log', () => {
    const error = new Error('migration blew up');

    reportError('store-migration', error, { step: 'v27' });

    expect(mockCaptureAppError).toHaveBeenCalledWith('store-migration', error, { step: 'v27' });
    // The local trail is the thing that survived before there was a reporter.
    expect(mockLogBugError).toHaveBeenCalledWith('store-migration', error, { step: 'v27' });
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('files exactly one report per call', () => {
    // Guards the task-4 decision: logBugError must NOT capture as well, or
    // every reportError call site would file the same crash twice.
    reportError('tts-audio', new Error('no voice'), { voiceId: 'alloy' });

    expect(mockCaptureAppError).toHaveBeenCalledTimes(1);
    expect(mockLogBugError).toHaveBeenCalledTimes(1);
  });

  it('wraps a non-Error before reporting it', () => {
    reportError('store-migration', 'a bare string');

    const [source, reported, extra] = mockCaptureAppError.mock.calls[0] as [
      string,
      Error,
      unknown,
    ];
    expect(source).toBe('store-migration');
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe('a bare string');
    expect(extra).toBeUndefined();
  });

  it('forwards identifiers and counts but never a structured payload', () => {
    // Journal entries and family names live in this app. A nested value could
    // carry either, so only its key name is allowed to leave the device.
    reportError('devotional-generation', new Error('boom'), {
      phase: 'full-generation',
      dayNumber: 4,
      retriable: true,
      entry: { body: 'my brother relapsed again' },
      notes: ['Dad', 'Mum'],
    });

    expect(mockCaptureAppError).toHaveBeenCalledWith('devotional-generation', expect.any(Error), {
      phase: 'full-generation',
      dayNumber: 4,
      retriable: true,
      entry: '[omitted]',
      notes: '[omitted]',
    });
    const [, , extra] = mockCaptureAppError.mock.calls[0] as [string, Error, Record<string, unknown>];
    expect(JSON.stringify(extra)).not.toContain('relapsed');
    expect(JSON.stringify(extra)).not.toContain('Mum');
  });

  it('leaves the unsanitized extra on the local log, which never leaves the device', () => {
    const extra = { entry: { body: 'private' } };

    reportError('journal', new Error('boom'), extra);

    expect(mockLogBugError).toHaveBeenCalledWith('journal', expect.any(Error), extra);
  });
});
