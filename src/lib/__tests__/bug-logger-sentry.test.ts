import type { ErrorUtils } from 'react-native';

const mockCaptureAppError = jest.fn((..._args: unknown[]) => undefined);
const mockAddAppBreadcrumb = jest.fn((..._args: unknown[]) => undefined);
const mockRecordCrash = jest.fn(() => 1);
const mockRecordFatalBreadcrumb = jest.fn((..._args: unknown[]) => undefined);

jest.mock('@/lib/sentry', () => ({
  captureAppError: (...args: unknown[]) => mockCaptureAppError(...args),
  addAppBreadcrumb: (...args: unknown[]) => mockAddAppBreadcrumb(...args),
  captureAppEvent: jest.fn(),
  isSentryEnabled: () => false,
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: { getState: () => ({ generationSession: {}, devotionals: [] }) },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
}));

// Only the fatal path below needs these; the marker itself is MMKV-backed.
jest.mock('@/lib/crash-marker', () => ({
  recordCrash: () => mockRecordCrash(),
  recordFatalBreadcrumb: (...args: unknown[]) => mockRecordFatalBreadcrumb(...args),
  takeLastFatalBreadcrumb: () => null,
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '250',
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8' },
}));

// eslint-disable-next-line import/first -- module import must run after Jest module mocks are registered.
import { clearBugLogEntries, getBugLogEntries, logBugError, logBugEvent } from '../bug-logger';
// eslint-disable-next-line import/first -- as above; these exercise the real sink end to end.
import { reportError } from '../report-error';
// eslint-disable-next-line import/first -- as above.
import { installGlobalErrorHandler } from '../global-error-handler';

describe('logBugEvent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearBugLogEntries();
  });

  it('leaves a breadcrumb alongside the local entry', async () => {
    await logBugEvent('reading-generation', 'manual-retry-started', { viewingDay: 4 }, 'warn');

    expect(mockAddAppBreadcrumb).toHaveBeenCalledWith(
      'reading-generation',
      'manual-retry-started',
      { level: 'warn', dataKeys: 'viewingDay' },
    );
    const entries = await getBugLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ category: 'reading-generation', level: 'warn' });
  });

  it('sends payload key names only, never the payload values', async () => {
    // A devotional title is generated from what someone wrote about their own
    // life, so no bug-log payload value may reach the reporter.
    await logBugEvent('generation', 'server-generation-complete', {
      devotionalId: 'dev-1',
      title: 'Forgiving My Father',
      dayTitle: 'When Sarah Walked Away',
    });

    expect(mockAddAppBreadcrumb).toHaveBeenCalledWith('generation', 'server-generation-complete', {
      level: 'info',
      dataKeys: 'devotionalId,title,dayTitle',
    });
    expect(JSON.stringify(mockAddAppBreadcrumb.mock.calls)).not.toContain('Father');
    expect(JSON.stringify(mockAddAppBreadcrumb.mock.calls)).not.toContain('Sarah');
  });

  it('omits dataKeys when there is no payload', async () => {
    await logBugEvent('generation', 'generation-restart-onboarding');

    expect(mockAddAppBreadcrumb).toHaveBeenCalledWith('generation', 'generation-restart-onboarding', {
      level: 'info',
    });
  });
});

describe('logBugError', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearBugLogEntries();
  });

  it('files exactly one report, so a direct caller is not invisible', async () => {
    // Direct callers include the store's rehydration and validation failures.
    // A breadcrumb alone would never surface those: breadcrumbs only appear
    // attached to some later event. This is now the ONLY function that reports,
    // so the count here is the count on the wire.
    await logBugError('store-rehydration', new Error('boom'), { phase: 'hydrate' });

    expect(mockCaptureAppError).toHaveBeenCalledTimes(1);
    expect(mockCaptureAppError).toHaveBeenCalledWith(
      'store-rehydration',
      expect.objectContaining({ message: 'boom' }),
      { dataKeys: 'phase' },
    );
  });

  it('forwards key names only, never the values, which can be user content', async () => {
    await logBugError('generation', new Error('boom'), {
      title: "Anthony's devotional about his marriage",
      dayTitle: 'When the Map Runs Out',
    });

    const [, , extra] = mockCaptureAppError.mock.calls[0];
    expect(extra).toEqual({ dataKeys: 'title,dayTitle' });
    expect(JSON.stringify(extra)).not.toContain('Anthony');
    expect(JSON.stringify(extra)).not.toContain('Map Runs Out');
  });

  it('forwards the caller vouched payload instead of the key names, and still drops data', async () => {
    // `reportExtra` is the caller's promise that every value in it is
    // developer-authored and primitive. `data` stays local either way.
    await logBugError(
      'error-boundary',
      new Error('boom'),
      { componentStack: '\n    at DevotionalReader', title: 'Forgiving My Father' },
      { componentStack: '\n    at DevotionalReader', mechanism: 'error-boundary' },
    );

    const [, , extra] = mockCaptureAppError.mock.calls[0];
    expect(extra).toEqual({
      componentStack: '\n    at DevotionalReader',
      mechanism: 'error-boundary',
    });
    expect(JSON.stringify(extra)).not.toContain('Forgiving My Father');
    expect(JSON.stringify(extra)).not.toContain('dataKeys');
  });

  it('wraps a non-Error rejection so the reporter always gets an Error', async () => {
    await logBugError('sync', 'a string rejection');

    expect(mockCaptureAppError).toHaveBeenCalledWith(
      'sync',
      expect.objectContaining({ message: 'a string rejection' }),
      undefined,
    );
    const [, reported] = mockCaptureAppError.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
  });

  it('still reaches the reporter as a breadcrumb, so direct callers are not silent', async () => {
    await logBugError('reading', new Error('boom'), { phase: 'sync-read-state' });

    expect(mockAddAppBreadcrumb).toHaveBeenCalledWith('reading', 'error', {
      level: 'error',
      dataKeys: 'error,data',
    });
  });

  it('keeps writing the local bug log entry', async () => {
    await logBugError('reading', new Error('boom'));

    const entries = await getBugLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ category: 'reading', level: 'error', message: 'error' });
  });

  it('keeps the unsanitized payload on the local entry, which never leaves the device', async () => {
    await logBugError('generation', new Error('boom'), { title: 'Forgiving My Father' });

    const [entry] = await getBugLogEntries();
    // The local trail is the thing that survived before there was a reporter,
    // and it is never traded away for it.
    expect(JSON.stringify(entry.data)).toContain('Forgiving My Father');
  });
});

/**
 * The layers above the sink, over the REAL `logBugError`. Each of these used to
 * capture on its own as well, so one failure was filed twice under two
 * different sources. These assert the count that change exists to protect.
 */
describe('one reporting sink, end to end', () => {
  /**
   * These callers fire the sink and forget it, so the local write is still in
   * bug-logger's queue when the call returns. One more event flushes it: the
   * queue is a single chained promise, so awaiting this one awaits every write
   * queued before it.
   */
  const flushBugLog = () => logBugEvent('test', 'flush');

  beforeEach(async () => {
    jest.clearAllMocks();
    await clearBugLogEntries();
  });

  it('files exactly one report for one handled failure', () => {
    reportError('devotional-generation', new Error('boom'), { phase: 'full-generation' });

    expect(mockCaptureAppError).toHaveBeenCalledTimes(1);
    expect(mockCaptureAppError).toHaveBeenCalledWith(
      'devotional-generation',
      expect.objectContaining({ message: 'boom' }),
      { phase: 'full-generation' },
    );
  });

  it('keeps user-authored text out of the report on that path', async () => {
    reportError('journal', new Error('boom'), {
      devotionalId: 'dev-1',
      entry: { body: 'I have been struggling to pray since my father died.' },
      keyPeople: ['Anthony', 'Mi Young'],
    });

    const wire = JSON.stringify(mockCaptureAppError.mock.calls);
    expect(wire).not.toContain('struggling to pray');
    expect(wire).not.toContain('Anthony');
    expect(wire).not.toContain('Mi Young');
    // ...while the local trail keeps all of it.
    await flushBugLog();
    const [entry] = await getBugLogEntries();
    expect(entry).toMatchObject({ category: 'journal', level: 'error' });
    expect(JSON.stringify(entry.data)).toContain('Mi Young');
    expect(JSON.stringify(entry.data)).toContain('struggling to pray');
  });

  it('files exactly one report for a fatal, with its fatal flag and wrapped', () => {
    let handler: (error: unknown, isFatal?: boolean) => void = () => {};
    const utils: ErrorUtils = {
      getGlobalHandler: () => handler,
      setGlobalHandler: (next: (error: unknown, isFatal?: boolean) => void) => {
        handler = next;
      },
    };

    expect(installGlobalErrorHandler(utils)).toBe(true);
    handler('string boom', true);

    expect(mockCaptureAppError).toHaveBeenCalledTimes(1);
    const [source, reported, extra] = mockCaptureAppError.mock.calls[0];
    expect(source).toBe('global-error');
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toBe('string boom');
    expect(extra).toEqual({ isFatal: true, mechanism: 'fatal' });
    // The boot-crash streak is what flips the boundary into recovery mode.
    expect(mockRecordCrash).toHaveBeenCalledTimes(1);
    expect(mockRecordFatalBreadcrumb).toHaveBeenCalledWith('string boom');
  });
});

describe('a replayed fatal from a previous launch', () => {
  it('writes the local trail but does not report, so crashes are not filed twice', async () => {
    mockCaptureAppError.mockClear();
    await logBugError('global-error-fatal-previous-launch', new Error('died last launch'), {
      isFatal: true,
    }, false);

    expect(mockCaptureAppError).not.toHaveBeenCalled();
    const entries = await getBugLogEntries();
    expect(entries.some((e) => e.category === 'global-error-fatal-previous-launch')).toBe(true);
  });
});
