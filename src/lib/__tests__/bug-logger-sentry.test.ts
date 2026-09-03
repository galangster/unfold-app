const mockCaptureAppError = jest.fn((..._args: unknown[]) => undefined);
const mockAddAppBreadcrumb = jest.fn((..._args: unknown[]) => undefined);

jest.mock('@/lib/sentry', () => ({
  captureAppError: (...args: unknown[]) => mockCaptureAppError(...args),
  addAppBreadcrumb: (...args: unknown[]) => mockAddAppBreadcrumb(...args),
  captureAppEvent: jest.fn(),
  isSentryEnabled: () => false,
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: { getState: () => ({ generationSession: {}, devotionals: [] }) },
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

  it('files a real report, so a direct caller is not invisible', async () => {
    // Direct callers include the store's rehydration and validation failures.
    // A breadcrumb alone would never surface those: breadcrumbs only appear
    // attached to some later event. The duplicate that reportError would
    // otherwise cause is dropped inside captureAppError by isDuplicateReport,
    // which is asserted in sentry.test.ts.
    await logBugError('store-rehydration', new Error('boom'), { phase: 'hydrate' });

    expect(mockCaptureAppError).toHaveBeenCalledTimes(1);
    expect(mockCaptureAppError).toHaveBeenCalledWith(
      'store-rehydration',
      expect.objectContaining({ message: 'boom' }),
      { dataKeys: ['phase'] },
    );
  });

  it('forwards key names only, never the values, which can be user content', async () => {
    await logBugError('generation', new Error('boom'), {
      title: "Anthony's devotional about his marriage",
      dayTitle: 'When the Map Runs Out',
    });

    const [, , extra] = mockCaptureAppError.mock.calls[0];
    expect(extra).toEqual({ dataKeys: ['title', 'dayTitle'] });
    expect(JSON.stringify(extra)).not.toContain('Anthony');
    expect(JSON.stringify(extra)).not.toContain('Map Runs Out');
  });

  it('wraps a non-Error rejection so the reporter always gets an Error', async () => {
    await logBugError('sync', 'a string rejection');

    expect(mockCaptureAppError).toHaveBeenCalledWith(
      'sync',
      expect.objectContaining({ message: 'a string rejection' }),
      undefined,
    );
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
});
