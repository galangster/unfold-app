/**
 * Crash/error reporting: the no-DSN no-op, and the privacy filters.
 *
 * The exported API is deliberately small, so the scrubbers are exercised the
 * way Sentry itself calls them — through the `beforeSend` / `beforeBreadcrumb`
 * captured off the mocked `Sentry.init()`. That proves the filters are wired
 * in, not merely that they exist.
 *
 * The device-id assertions are the load-bearing ones. `getDeviceId()` is the
 * app's only auth credential (the backend accepts it in `X-Device-ID` as proof
 * of identity), so a realistic UUID is planted in every field a raw id could
 * plausibly reach and the serialized payload is asserted not to contain it.
 */

import { createHash } from 'node:crypto';

const mockInit = jest.fn();
const mockSetUser = jest.fn();
const mockCaptureException = jest.fn();
const mockAddBreadcrumb = jest.fn();
const mockCaptureMessage = jest.fn();
const mockRegisterNavigationContainer = jest.fn();
const mockNavigationIntegration = {
  name: 'ReactNavigation',
  registerNavigationContainer: (...args: unknown[]) => mockRegisterNavigationContainer(...args),
};
const mockReactNavigationIntegration = jest.fn((..._args: unknown[]) => mockNavigationIntegration);
const mockHttpClientIntegration = jest.fn((options: unknown) => ({ name: 'HttpClient', options }));
const mockWrap = jest.fn((component: unknown, ..._rest: unknown[]) => ({ wrapped: component }));

jest.mock('@sentry/react-native', () => ({
  init: mockInit,
  setUser: mockSetUser,
  captureException: mockCaptureException,
  addBreadcrumb: mockAddBreadcrumb,
  captureMessage: mockCaptureMessage,
  reactNavigationIntegration: (...args: unknown[]) => mockReactNavigationIntegration(...args),
  httpClientIntegration: (options: unknown) => mockHttpClientIntegration(options),
  wrap: (component: unknown, ...rest: unknown[]) => mockWrap(component, ...rest),
}));

/** A realistic device id: uuid v4, exactly what getDeviceId() returns. */
const mockDeviceId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const mockStorageState = { recovery: false };

jest.mock('../mmkv-storage', () => ({
  getDeviceId: () => mockDeviceId,
  isRecoverySession: () => mockStorageState.recovery,
}));

const mockConstants = {
  expoConfig: {
    version: '1.1.1',
    ios: { buildNumber: '183' },
    android: { versionCode: 1 },
    extra: { buildProfile: 'production' },
  },
};

jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants }));

const mockDigestStringAsync = jest.fn(async (_algorithm: string, data: string) =>
  createHash('sha256').update(data).digest('hex'));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: mockDigestStringAsync,
}));

type SentryLib = typeof import('../sentry');
type InitOptions = {
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
  beforeBreadcrumb: (crumb: Record<string, unknown>) => Record<string, unknown> | null;
  beforeSendTransaction: (event: Record<string, unknown>) => Record<string, unknown> | null;
  [key: string]: unknown;
};

const EXPECTED_HASH = createHash('sha256').update(mockDeviceId).digest('hex').slice(0, 8);
const DSN = 'https://publickey@o1.ingest.sentry.io/123';
const JOURNAL_TEXT = 'I keep failing my brother Michael and I cannot pray about it.';

const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const originalWorkerId = process.env.JEST_WORKER_ID;

/** Load a pristine copy of the module (it caches init state at module scope). */
function loadSentryLib(): SentryLib {
  let lib: SentryLib | undefined;
  jest.isolateModules(() => {
    lib = require('../sentry') as SentryLib;
  });
  if (lib === undefined) throw new Error('failed to load ../sentry');
  return lib;
}

/** Boot the module as a real (non-Jest) runtime with a DSN present. */
function bootEnabled(): SentryLib {
  process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
  delete process.env.JEST_WORKER_ID;
  const lib = loadSentryLib();
  lib.initSentry();
  return lib;
}

/**
 * Boot the way a real build would, with `__DEV__` and `Platform.OS` chosen
 * rather than whatever Jest happens to provide. Jest runs as `__DEV__ === true`
 * on iOS, which is the OPPOSITE of the production-critical case.
 */
function bootEnabledAs(isDev: boolean, platformOS: string): InitOptions {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
  delete process.env.JEST_WORKER_ID;
  devGlobal.__DEV__ = isDev;
  mockInit.mockClear();
  // The isolated copy schedules attachHashedUser on a timer it would fire
  // after this registry is gone; never let it run.
  jest.useFakeTimers();
  try {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: platformOS } }));
      const lib = require('../sentry') as SentryLib;
      lib.initSentry();
    });
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.dontMock('react-native');
    devGlobal.__DEV__ = originalDev;
  }
  return initOptions();
}

function initOptions(): InitOptions {
  expect(mockInit).toHaveBeenCalled();
  return mockInit.mock.calls[0][0] as InitOptions;
}

/** Everything this test handed to the Sentry SDK, as one string. */
function everythingSentToSentry(): string {
  return JSON.stringify([
    mockInit.mock.calls,
    mockSetUser.mock.calls,
    mockCaptureException.mock.calls,
    mockAddBreadcrumb.mock.calls,
    mockCaptureMessage.mock.calls,
  ]);
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockStorageState.recovery = false;
});

afterEach(() => {
  mockConstants.expoConfig.extra.buildProfile = 'production';
  if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  if (originalWorkerId === undefined) delete process.env.JEST_WORKER_ID;
  else process.env.JEST_WORKER_ID = originalWorkerId;
});

describe('without a DSN', () => {
  it('never initialises and every export is a safe no-op', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.JEST_WORKER_ID;
    const sentry = loadSentryLib();

    sentry.initSentry();

    expect(sentry.isSentryEnabled()).toBe(false);

    sentry.captureAppError('onboarding', new Error('answers discarded'), { step: 'name' });
    sentry.addAppBreadcrumb('onboarding', 'step advanced', { step: 'name' });
    sentry.captureAppEvent('onboarding_completed', { steps: 7 });

    expect(mockInit).not.toHaveBeenCalled();
    expect(mockSetUser).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('stays disabled when the DSN is present but blank', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = '   ';
    delete process.env.JEST_WORKER_ID;
    const sentry = loadSentryLib();

    sentry.initSentry();

    expect(sentry.isSentryEnabled()).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
  });
});

describe('under Jest', () => {
  it('never initialises even with a DSN present', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    process.env.JEST_WORKER_ID = '1';
    const sentry = loadSentryLib();

    sentry.initSentry();

    expect(mockInit).not.toHaveBeenCalled();
    expect(sentry.isSentryEnabled()).toBe(false);
  });
});

describe('initSentry', () => {
  it('initialises once with the privacy-critical options and build provenance', () => {
    const sentry = bootEnabled();
    sentry.initSentry();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(sentry.isSentryEnabled()).toBe(true);

    const options = initOptions();
    expect(options.dsn).toBe(DSN);
    expect(options.environment).toBe('production');
    expect(options.sendDefaultPii).toBe(false);
    expect(options.attachScreenshot).toBe(false);
    expect(options.attachViewHierarchy).toBe(false);
    expect(options.enableLogs).toBe(false);
    expect(options.enableUserInteractionTracing).toBe(false);
    expect(options.enableAutoPerformanceTracing).toBe(true);
    expect(options.attachStacktrace).toBe(true);
    expect(options.maxBreadcrumbs).toBe(50);
    expect(typeof options.beforeSend).toBe('function');
    expect(typeof options.beforeBreadcrumb).toBe('function');
    expect(typeof options.beforeSendTransaction).toBe('function');
    // Cocoa's automatic breadcrumbs are governed in AppDelegate.swift now;
    // nothing native-only is smuggled through the JS options any more.
    expect(options).not.toHaveProperty('enableAutoBreadcrumbTracking');
  });

  it('passes NO replay sample rates, because passing 0 is what installs replay', () => {
    // integrations/default.js installs mobileReplayIntegration() when either
    // key is `typeof === 'number'` — which 0 satisfies. Absence keeps it out,
    // so asserting `=== 0` here would pin the defect in place.
    bootEnabled();
    const options = initOptions();

    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    expect(options).not.toHaveProperty('_experiments');
  });

  it('passes NO release or dist, so both are derived from the built Info.plist', () => {
    // Passing either short-circuits nativeReleaseIntegration before its
    // `${id}@${version}+${build}` fallback — the only string that matches
    // both AppDelegate.swift and the source maps sentry-cli uploads. The
    // Expo config cannot supply it: app.json's ios.buildNumber is stale at
    // "183" under eas.json's appVersionSource: remote.
    bootEnabled();
    const options = initOptions();

    expect(options).not.toHaveProperty('release');
    expect(options).not.toHaveProperty('dist');
    expect(mockConstants.expoConfig.ios.buildNumber).toBe('183');
  });
});

describe('native-first init', () => {
  it('attaches to the native SDK a Release iOS build already started, and starts it elsewhere', () => {
    const { resolveAutoInitializeNativeSdk } = loadSentryLib();

    expect(resolveAutoInitializeNativeSdk(false, 'ios')).toBe(false);
    expect(resolveAutoInitializeNativeSdk(true, 'ios')).toBe(true);
    expect(resolveAutoInitializeNativeSdk(false, 'android')).toBe(true);
  });

  it('passes the PRODUCTION decision to the SDK, not the value Jest happens to have', () => {
    // The mutant this kills: `autoInitializeNativeSdk: true` hardcoded. On a
    // Release iOS build that restarts the Cocoa SDK on top of the instance
    // AppDelegate.swift already started, with JS options that carry none of
    // the native-only settings — so `enableAutoBreadcrumbTracking` reverts to
    // Cocoa's default YES and screen titles (arc and devotional names) attach
    // to native crash events that never pass through the JS beforeBreadcrumb.
    expect(bootEnabledAs(false, 'ios').autoInitializeNativeSdk).toBe(false);
    expect(bootEnabledAs(false, 'android').autoInitializeNativeSdk).toBe(true);
    expect(bootEnabledAs(true, 'ios').autoInitializeNativeSdk).toBe(true);
  });
});

describe('tracing scope', () => {
  it('samples spans in production builds only', () => {
    const sentry = bootEnabled();

    expect(initOptions().tracesSampleRate).toBe(0.1);
    expect(sentry.resolveTracesSampleRate('production')).toBe(0.1);
    expect(sentry.resolveTracesSampleRate('production-hotfix')).toBe(0.1);
    expect(sentry.resolveTracesSampleRate('preview')).toBe(0);
    expect(sentry.resolveTracesSampleRate('development')).toBe(0);
    expect(sentry.resolveTracesSampleRate('unknown')).toBe(0);
  });

  it('turns tracing off outside a production build', () => {
    mockConstants.expoConfig.extra.buildProfile = 'preview';
    bootEnabled();

    expect(initOptions().environment).toBe('preview');
    expect(initOptions().tracesSampleRate).toBe(0);
  });

  it('files failed requests for, and propagates traces to, the backend host only', () => {
    bootEnabled();
    const options = initOptions();
    const propagate = options.tracePropagationTargets as RegExp[];

    // The flag alone would install Sentry's default HttpClient integration
    // (every host); the explicit instance replaces it and carries the targets.
    expect(options.enableCaptureFailedRequests).toBe(true);
    expect(mockHttpClientIntegration).toHaveBeenCalledTimes(1);
    const { failedRequestTargets: failed } = mockHttpClientIntegration.mock.calls[0][0] as { failedRequestTargets: RegExp[] };
    expect(options.integrations).toContainEqual(expect.objectContaining({ name: 'HttpClient' }));

    expect(failed).toHaveLength(1);
    expect(propagate).toHaveLength(1);
    expect(failed[0]).toBeInstanceOf(RegExp);
    expect(propagate[0]).toBe(failed[0]);

    const backendOnly = failed[0];
    expect(backendOnly.test('https://api.unfoldapp.co/api/sync/pull')).toBe(true);
    expect(backendOnly.test('https://api.unfoldapp.co')).toBe(true);
    expect(backendOnly.test('HTTPS://API.UNFOLDAPP.CO/api/x')).toBe(true);
    expect(backendOnly.test('https://api.revenuecat.com/v1/subscribers')).toBe(false);
    expect(backendOnly.test('https://api.unfoldapp.co.example.com/steal')).toBe(false);
    expect(backendOnly.test('https://evil.example.com/?next=https://api.unfoldapp.co')).toBe(false);
    expect(backendOnly.test('https://o1.ingest.sentry.io/api/123/envelope/')).toBe(false);
  });

  it('derives the pattern from the configured backend URL', () => {
    const { originPattern } = loadSentryLib();
    const pattern = originPattern('https://staging.unfoldapp.co/ ');

    expect(pattern.test('https://staging.unfoldapp.co/api/health')).toBe(true);
    expect(pattern.test('https://api.unfoldapp.co/api/health')).toBe(false);
  });
});

describe('device identity', () => {
  it('sets the user to a truncated SHA-256 and never the raw device id', async () => {
    bootEnabled();
    await flushMicrotasks();

    expect(mockDigestStringAsync).toHaveBeenCalledWith('SHA-256', mockDeviceId);
    expect(mockSetUser).toHaveBeenCalledWith({ id: EXPECTED_HASH });
    expect(EXPECTED_HASH).toHaveLength(8);
    expect(everythingSentToSentry()).not.toContain(mockDeviceId);
  });

  it('sets no user at all in a storage-locked recovery session', async () => {
    mockStorageState.recovery = true;

    bootEnabled();
    await flushMicrotasks();

    expect(mockDigestStringAsync).not.toHaveBeenCalled();
    expect(mockSetUser).not.toHaveBeenCalled();
  });
});

describe('beforeSend', () => {
  /** An event carrying a raw device id and journal text in every plausible slot. */
  function hostileEvent(): Record<string, unknown> {
    return {
      event_id: 'abc123',
      message: `sync failed for ${mockDeviceId}`,
      transaction: '/onboarding',
      server_name: mockDeviceId,
      request: { url: `https://api.unfoldapp.co/sync?uid=${mockDeviceId}`, headers: { 'X-Device-ID': mockDeviceId } },
      user: { id: mockDeviceId, email: 'nick@example.com', ip_address: '10.0.0.4' },
      tags: { source: 'onboarding', deviceId: mockDeviceId },
      extra: { step: 'reflection', answer: JOURNAL_TEXT, deviceId: mockDeviceId, answeredCount: 7, skipped: false },
      contexts: {
        device: { family: 'iOS', model: 'iPhone16,2', name: "Nick's iPhone", memory_size: 8000 },
        os: { name: 'iOS', version: '18.2' },
        secrets: { token: mockDeviceId },
      },
      exception: {
        values: [
          {
            type: 'TypeError',
            value: `cannot read answers of ${mockDeviceId}`,
            stacktrace: {
              frames: [
                {
                  filename: 'src/app/onboarding.tsx',
                  function: 'handleNext',
                  lineno: 42,
                  in_app: true,
                  abs_path: `/var/mobile/${mockDeviceId}/onboarding.tsx`,
                  context_line: `const answer = "${JOURNAL_TEXT}";`,
                  vars: { answer: JOURNAL_TEXT, deviceId: mockDeviceId },
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { category: 'console', level: 'log', message: JOURNAL_TEXT },
        { category: 'app.onboarding', message: 'step advanced', data: { step: 'reflection', answer: JOURNAL_TEXT } },
      ],
    };
  }

  it('leaves no trace of the device id or journal content anywhere in the payload', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend(hostileEvent());
    const serialized = JSON.stringify(scrubbed);

    expect(serialized).not.toContain(mockDeviceId);
    expect(serialized).not.toContain(JOURNAL_TEXT);
    expect(serialized).not.toContain('nick@example.com');
    expect(serialized).not.toContain("Nick's iPhone");
    expect(serialized).not.toContain('10.0.0.4');
  });

  it('drops non-allowlisted string fields but keeps scalar counters', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend(hostileEvent()) as Record<string, Record<string, unknown>>;

    expect(scrubbed.extra).toEqual({ step: 'reflection', answeredCount: 7, skipped: false });
    expect(scrubbed.tags).toEqual({ source: 'onboarding' });
  });

  it('drops whole sections, request headers/query, server metadata, and unsafe frame fields', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend(hostileEvent()) as Record<string, unknown>;
    const contexts = scrubbed.contexts as Record<string, Record<string, unknown>>;
    const frame = ((scrubbed.exception as { values: { stacktrace: { frames: Record<string, unknown>[] } }[] })
      .values[0].stacktrace.frames)[0];

    expect(scrubbed.request).toEqual({ url: 'https://api.unfoldapp.co/sync' });
    expect(scrubbed.server_name).toBeUndefined();
    expect(contexts.secrets).toBeUndefined();
    expect(contexts.device).toEqual({ family: 'iOS', model: 'iPhone16,2', memory_size: 8000 });
    expect(frame).toEqual({
      filename: 'src/app/onboarding.tsx',
      function: 'handleNext',
      module: undefined,
      platform: undefined,
      lineno: 42,
      colno: undefined,
      in_app: true,
    });
    expect(frame.vars).toBeUndefined();
    expect(frame.abs_path).toBeUndefined();
    expect(frame.context_line).toBeUndefined();
  });

  it('keeps only a hashed-looking user id', () => {
    bootEnabled();
    const beforeSend = initOptions().beforeSend;

    expect(beforeSend({ user: { id: mockDeviceId } })?.user).toBeUndefined();
    expect(beforeSend({ user: { id: EXPECTED_HASH, email: 'nick@example.com' } })?.user)
      .toEqual({ id: EXPECTED_HASH });
  });

  it('truncates a surviving string to 200 characters', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend({
      extra: { errorMessage: 'x'.repeat(500) },
      exception: { values: [{ type: 'Error', value: 'y'.repeat(500) }] },
    }) as Record<string, Record<string, unknown>>;

    expect((scrubbed.extra.errorMessage as string)).toHaveLength(200);
    expect(((scrubbed.exception as unknown as { values: { value: string }[] }).values[0].value)).toHaveLength(200);
  });

  it('drops console breadcrumbs carried inside the event', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend(hostileEvent()) as { breadcrumbs: { category: string }[] };

    expect(scrubbed.breadcrumbs).toHaveLength(1);
    expect(scrubbed.breadcrumbs[0].category).toBe('app.onboarding');
  });

  it('keeps a failed backend request as endpoint, verb and status only', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend({
      message: 'HTTP Client Error with status code: 500',
      request: {
        url: `https://api.unfoldapp.co/api/generate/go-deeper?entry=${encodeURIComponent(JOURNAL_TEXT)}#top`,
        method: 'POST',
        headers: { 'X-Device-ID': mockDeviceId, Authorization: 'Bearer secret-token' },
        cookies: { session: mockDeviceId },
      },
      contexts: {
        response: { status_code: 500, body_size: 42, headers: { 'set-cookie': mockDeviceId } },
      },
    }) as Record<string, unknown>;

    expect(scrubbed.request).toEqual({ url: 'https://api.unfoldapp.co/api/generate/go-deeper', method: 'POST' });
    expect((scrubbed.contexts as Record<string, unknown>).response).toEqual({ status_code: 500, body_size: 42 });
    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain('go-deeper?');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain(mockDeviceId);
  });

  it('carries a native frame’s addresses, without its on-disk package path', () => {
    // A cocoa frame has no filename: Sentry resolves it from instruction_addr
    // inside the debug image at image_addr. Dropping those (which the
    // JS-shaped allowlist did) left the frames NativeLinkedErrors appends as
    // {platform, in_app} — unsymbolicatable.
    bootEnabled();

    const scrubbed = initOptions().beforeSend({
      exception: {
        values: [{
          type: 'RCTFatalException',
          value: 'bridge exception',
          stacktrace: {
            frames: [{
              platform: 'cocoa',
              in_app: true,
              instruction_addr: '0x0000000102f4c1a8',
              image_addr: '0x0000000102f40000',
              symbol_addr: '0x0000000102f4c100',
              package: `/private/var/containers/Bundle/Application/${mockDeviceId}/Unfold.app/Unfold`,
            }],
          },
        }],
      },
    }) as unknown as { exception: { values: { stacktrace: { frames: Record<string, unknown>[] } }[] } };

    const frame = scrubbed.exception.values[0].stacktrace.frames[0];
    expect(frame.instruction_addr).toBe('0x0000000102f4c1a8');
    expect(frame.image_addr).toBe('0x0000000102f40000');
    expect(frame.symbol_addr).toBe('0x0000000102f4c100');
    expect(frame.platform).toBe('cocoa');
    expect(frame.in_app).toBe(true);
    // The container path buys nothing once the addresses are there.
    expect(frame.package).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain(mockDeviceId);
  });

  it('lets only a hex address through those keys, never a string', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend({
      exception: {
        values: [{
          type: 'Error',
          stacktrace: { frames: [{ instruction_addr: JOURNAL_TEXT, image_addr: '0xnothex' }] },
        }],
      },
    }) as unknown as { exception: { values: { stacktrace: { frames: Record<string, unknown>[] } }[] } };

    const frame = scrubbed.exception.values[0].stacktrace.frames[0];
    expect(frame.instruction_addr).toBeUndefined();
    expect(frame.image_addr).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain(JOURNAL_TEXT);
  });

  it('keeps debug images to the symbolication allowlist, masking only the paths', () => {
    // debug_meta is what resolves a stack frame to a source map or a dSYM, so
    // this is a symbolication contract, not a privacy one: debug_id and uuid
    // must survive the UUID mask byte-identical or the image stops matching.
    bootEnabled();

    const scrubbed = initOptions().beforeSend({
      debug_meta: {
        images: [
          { type: 'sourcemap', code_file: 'app:///main.jsbundle', debug_id: '9c3f1b7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b' },
          {
            type: 'macho',
            uuid: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
            debug_id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
            image_addr: '0x0000000102f40000',
            image_size: 65536,
            code_file: `/private/var/containers/Bundle/Application/${mockDeviceId}/Unfold.app/Unfold`,
            arch: 'arm64',
            junk: 'anything else at all',
          },
        ],
      },
    }) as unknown as { debug_meta: { images: Record<string, unknown>[] } };

    const [sourcemap, macho] = scrubbed.debug_meta.images;
    expect(sourcemap).toEqual({
      type: 'sourcemap',
      code_file: 'app:///main.jsbundle',
      debug_id: '9c3f1b7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
    });
    // The two deliberate exceptions to the UUID mask, byte-identical.
    expect(macho.debug_id).toBe('b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e');
    expect(macho.uuid).toBe('b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e');
    // The path survives — it is how an image is matched — but masked.
    expect(macho.code_file).toBe('/private/var/containers/Bundle/Application/[uuid]/Unfold.app/Unfold');
    expect(macho.junk).toBeUndefined();
    expect(macho.image_addr).toBe('0x0000000102f40000');
    expect(macho.image_size).toBe(65536);
    expect(macho.arch).toBe('arm64');
    expect(JSON.stringify(scrubbed)).not.toContain(mockDeviceId);
  });

  it('leaves debug_meta absent when the event carried none', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSend({ message: 'no images' }) as Record<string, unknown>;

    expect(scrubbed.debug_meta).toBeUndefined();
    expect('debug_meta' in scrubbed).toBe(true);
  });

  it('drops the breadcrumb trail from a funnel milestone, but keeps it on a failure', () => {
    // captureAppEvent tags source=app_event: a counter, not a failure, so 50
    // breadcrumbs of context are payload cost for nothing.
    bootEnabled();
    const beforeSend = initOptions().beforeSend;
    const breadcrumbs = [{ category: 'app.onboarding', message: 'step advanced', data: { step: 'name' } }];

    const milestone = beforeSend({
      message: 'onboarding_completed',
      tags: { source: 'app_event' },
      breadcrumbs,
    }) as Record<string, unknown>;
    const failure = beforeSend({
      message: 'onboarding failed',
      tags: { source: 'onboarding' },
      breadcrumbs,
    }) as Record<string, unknown>;

    expect(milestone.breadcrumbs).toBeUndefined();
    expect('breadcrumbs' in milestone).toBe(false);
    expect(failure.breadcrumbs).toHaveLength(1);
  });

  it('keeps a component stack up to 4000 characters, every other string to 200', () => {
    bootEnabled();
    const stack = '    in Bomb\n    in ErrorBoundary\n'.repeat(200);

    const scrubbed = initOptions().beforeSend({
      extra: { componentStack: stack, errorMessage: 'x'.repeat(500) },
    }) as Record<string, Record<string, string>>;

    expect(scrubbed.extra.componentStack).toHaveLength(4000);
    expect(scrubbed.extra.componentStack.startsWith('    in Bomb')).toBe(true);
    expect(scrubbed.extra.errorMessage).toHaveLength(200);
  });
});

describe('beforeSendTransaction', () => {
  it('rebuilds a transaction from identity, timing, ops and query-less URLs only', () => {
    bootEnabled();

    const scrubbed = initOptions().beforeSendTransaction({
      type: 'transaction',
      event_id: 'tx1',
      transaction: `/journal/${mockDeviceId}?draft=${encodeURIComponent(JOURNAL_TEXT)}`,
      transaction_info: { source: 'route' },
      start_timestamp: 1,
      timestamp: 2,
      user: { id: mockDeviceId, email: 'nick@example.com' },
      request: { url: `https://api.unfoldapp.co/sync?uid=${mockDeviceId}` },
      server_name: "Nick's iPhone",
      breadcrumbs: [{ category: 'console', message: JOURNAL_TEXT }],
      tags: { route: '/journal', deviceId: mockDeviceId },
      measurements: {
        app_start_cold: { value: 812, unit: 'millisecond' },
        note: { value: JOURNAL_TEXT, unit: '' },
      },
      contexts: {
        trace: { trace_id: 'abc', span_id: 'def', op: 'ui.load', data: { answer: JOURNAL_TEXT } },
        device: { name: "Nick's iPhone", model: 'iPhone16,2' },
      },
      spans: [
        {
          span_id: 's1',
          trace_id: 'abc',
          parent_span_id: 'def',
          op: 'http.client',
          origin: 'auto.http.fetch',
          status: 'ok',
          start_timestamp: 1,
          timestamp: 1.5,
          description: `POST https://api.unfoldapp.co/api/journal/search?q=${encodeURIComponent(JOURNAL_TEXT)}`,
          data: {
            'http.method': 'POST',
            'http.response.status_code': 200,
            url: `https://api.unfoldapp.co/x?uid=${mockDeviceId}`,
            'http.query': `q=${JOURNAL_TEXT}`,
            body: JOURNAL_TEXT,
          },
        },
      ],
    }) as Record<string, unknown>;

    expect(scrubbed.type).toBe('transaction');
    expect(scrubbed.transaction).toBe('/journal/[uuid]');
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.server_name).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.tags).toEqual({ route: '/journal' });
    expect(scrubbed.measurements).toEqual({ app_start_cold: { value: 812, unit: 'millisecond' } });
    expect(scrubbed.contexts).toEqual({
      trace: { trace_id: 'abc', span_id: 'def', op: 'ui.load' },
      device: { model: 'iPhone16,2' },
    });
    expect(scrubbed.spans).toEqual([
      expect.objectContaining({
        span_id: 's1',
        trace_id: 'abc',
        parent_span_id: 'def',
        op: 'http.client',
        origin: 'auto.http.fetch',
        status: 'ok',
        start_timestamp: 1,
        timestamp: 1.5,
        description: 'POST https://api.unfoldapp.co/api/journal/search',
        data: { 'http.method': 'POST', 'http.response.status_code': 200 },
      }),
    ]);
    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain(mockDeviceId);
    expect(serialized).not.toContain(JOURNAL_TEXT);
    expect(serialized).not.toContain("Nick's iPhone");
    expect(serialized).not.toContain('q=');
    expect(serialized).not.toContain('nick@example.com');
  });
});

describe('beforeBreadcrumb', () => {
  it('drops console breadcrumbs entirely', () => {
    bootEnabled();

    expect(initOptions().beforeBreadcrumb({ category: 'console', level: 'log', message: JOURNAL_TEXT }))
      .toBeNull();
  });

  it('keeps the message on app breadcrumbs and drops it on automatic ones', () => {
    bootEnabled();
    const beforeBreadcrumb = initOptions().beforeBreadcrumb;

    const app = beforeBreadcrumb({
      category: 'app.onboarding',
      message: 'step advanced',
      data: { step: 'reflection', answer: JOURNAL_TEXT },
    });
    const touch = beforeBreadcrumb({
      category: 'touch',
      message: `Touch event within element: ${JOURNAL_TEXT}`,
      data: { url: `https://api.unfoldapp.co/sync?uid=${mockDeviceId}` },
    });

    expect(app?.message).toBe('step advanced');
    expect(app?.data).toEqual({ step: 'reflection' });
    expect(touch?.message).toBeUndefined();
    expect(touch?.category).toBe('touch');
    expect(JSON.stringify(touch)).not.toContain(mockDeviceId);
  });

  it('truncates a long app breadcrumb message', () => {
    bootEnabled();

    const crumb = initOptions().beforeBreadcrumb({ category: 'app.nav', message: 'z'.repeat(500) });

    expect(crumb?.message as string).toHaveLength(200);
  });

  it('keeps an http breadcrumb as endpoint, verb and status: no query, token, header or body', () => {
    bootEnabled();

    const crumb = initOptions().beforeBreadcrumb({
      type: 'http',
      category: 'fetch',
      level: 'info',
      data: {
        method: 'POST',
        url: `https://api.unfoldapp.co/api/journal/search?q=${encodeURIComponent(JOURNAL_TEXT)}&token=${mockDeviceId}`,
        status_code: 500,
        request_body_size: 812,
        headers: { Authorization: 'Bearer secret-token', 'X-Device-ID': mockDeviceId },
        body: JOURNAL_TEXT,
      },
    });

    expect(crumb?.data).toEqual({
      method: 'POST',
      url: 'https://api.unfoldapp.co/api/journal/search',
      status_code: 500,
      request_body_size: 812,
    });
    const serialized = JSON.stringify(crumb);
    expect(serialized).not.toContain('q=');
    expect(serialized).not.toContain('token=');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain(mockDeviceId);
    expect(serialized).not.toContain(JOURNAL_TEXT);
  });

  it('keeps route names on navigation breadcrumbs and component names on touch ones', () => {
    bootEnabled();
    const beforeBreadcrumb = initOptions().beforeBreadcrumb;

    const navigation = beforeBreadcrumb({
      type: 'navigation',
      category: 'navigation',
      data: {
        from: '/onboarding/name',
        to: `/journal/${mockDeviceId}`,
        state: { params: { entry: JOURNAL_TEXT } },
      },
    });
    const touch = beforeBreadcrumb({
      type: 'user',
      category: 'touch',
      message: `Touch event within element: ${JOURNAL_TEXT}`,
      data: {
        path: [
          { name: 'JournalEntryCard', element: 'Pressable', file: 'src/components/JournalEntryCard.tsx', label: JOURNAL_TEXT },
          { name: 'Michael', element: 'Text' },
        ],
      },
    });

    expect(navigation?.data).toEqual({ from: '/onboarding/name', to: '/journal/[uuid]' });
    expect(touch?.message).toBeUndefined();
    expect(touch?.data).toEqual({
      path: [
        { element: 'Pressable', file: 'src/components/JournalEntryCard.tsx' },
        { element: 'Text' },
      ],
    });
    expect(JSON.stringify([navigation, touch])).not.toContain(JOURNAL_TEXT);
    expect(JSON.stringify([navigation, touch])).not.toContain('Michael');
  });
});

describe('navigation and root wrapping', () => {
  it('creates the navigation integration once and forwards the container to it', () => {
    const sentry = bootEnabled();
    const ref = { current: { getCurrentRoute: () => undefined } };

    expect(mockReactNavigationIntegration).toHaveBeenCalledTimes(1);
    expect(initOptions().integrations).toEqual([
      mockNavigationIntegration,
      expect.objectContaining({ name: 'HttpClient' }),
    ]);

    sentry.registerNavigationContainer(ref);

    expect(mockRegisterNavigationContainer).toHaveBeenCalledWith(ref);
  });

  it('wraps the root component, and registers a container, only while reporting is on', () => {
    const Root = () => null;

    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.JEST_WORKER_ID;
    const disabled = loadSentryLib();
    disabled.initSentry();
    expect(disabled.wrapRootComponent(Root)).toBe(Root);
    disabled.registerNavigationContainer({ current: null });
    expect(mockRegisterNavigationContainer).not.toHaveBeenCalled();
    expect(mockWrap).not.toHaveBeenCalled();

    const enabledLib = bootEnabled();
    expect(enabledLib.wrapRootComponent(Root)).toEqual({ wrapped: Root });
    expect(mockWrap).toHaveBeenCalledWith(Root);
  });
});

describe('capture helpers', () => {
  it('tag the call site and hand the payload to the SDK for scrubbing', () => {
    const sentry = bootEnabled();
    const error = new Error('onboarding answers discarded');

    sentry.captureAppError('onboarding', error, { step: 'reflection', answer: JOURNAL_TEXT });
    sentry.addAppBreadcrumb('onboarding', 'step advanced', { step: 'reflection' });
    sentry.captureAppEvent('onboarding_completed', { steps: 7 });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      tags: { source: 'onboarding' },
      extra: { step: 'reflection', answer: JOURNAL_TEXT },
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'app.onboarding',
      message: 'step advanced',
      data: { step: 'reflection' },
      level: 'info',
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith('onboarding_completed', {
      level: 'info',
      tags: { source: 'app_event' },
      extra: { steps: 7 },
    });

    // The unscrubbed journal text above only ever reaches the SDK, which routes
    // it through the `beforeSend` proven elsewhere in this file before sending.
    const scrubbed = initOptions().beforeSend({
      extra: mockCaptureException.mock.calls[0][1].extra as Record<string, unknown>,
    });
    expect(JSON.stringify(scrubbed)).not.toContain(JOURNAL_TEXT);
  });
});

