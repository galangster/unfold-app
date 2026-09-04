/**
 * Crash and error reporting (Sentry).
 *
 * WHY THIS EXISTS
 * Onboarding once discarded a person's answers without throwing anything, so
 * no reporter would have caught it and a user had to report it by hand. This
 * module is the crash/error half of the fix: fatal JS errors, native crashes,
 * and explicitly captured failures reach Sentry, with breadcrumbs and funnel
 * events around them.
 *
 * PRIVACY IS THE HARD CONSTRAINT
 * Unfold holds journal entries about people's spiritual struggles, the real
 * names of their family members, and their private reflections. None of it may
 * ever reach a third party. So every outbound payload is REBUILT here from an
 * allowlist rather than filtered by a denylist: `scrubEvent` and
 * `scrubBreadcrumb` construct a fresh object out of named fields, which means
 * a field added anywhere else in the app is invisible to Sentry until someone
 * deliberately names its key in this file. On top of that:
 *   - string values survive only under an allowlisted key, truncated to 200;
 *   - numbers and booleans survive (the "short scalar counters" the funnel
 *     needs) but nothing else does;
 *   - `console` breadcrumbs are dropped whole, because the app logs user
 *     content through `logger`;
 *   - session replay, screenshots, and view-hierarchy attachments are never
 *     enabled, and performance tracing is off (transactions bypass
 *     `beforeSend` entirely, so the only safe setting is "not collected").
 *
 * DISABLED UNTIL A DSN EXISTS
 * Without `EXPO_PUBLIC_SENTRY_DSN` every export is a no-op, `isSentryEnabled()`
 * is false, and the SDK is never even required. That is also why tests pass
 * with no DSN and why nothing here loads under Jest.
 */

import type { Breadcrumb, ErrorEvent, Exception, StackFrame, Stacktrace, User } from '@sentry/react-native';
import { Platform } from 'react-native';

import { getBuildProfile } from './build-profile';

type SentryModule = typeof import('@sentry/react-native');

/** Every string that survives scrubbing is cut to this many characters. */
const MAX_STRING_LENGTH = 200;

/** Hex characters of the device-id SHA-256 used as the Sentry user id. */
const DEVICE_HASH_LENGTH = 8;

/** How deep `scrubBag` walks a nested value before giving up on it. */
const MAX_SCRUB_DEPTH = 4;

/**
 * Breadcrumbs this app emits through `addAppBreadcrumb` are namespaced. Only
 * they may carry a free-text `message`; every automatically collected
 * breadcrumb keeps its category and scrubbed data but loses its message,
 * because native UI breadcrumbs label the tapped view with its accessibility
 * label, which in this app is user content.
 */
const APP_BREADCRUMB_PREFIX = 'app.';

/** Sentry's own category for captured console output. Never forwarded. */
const CONSOLE_BREADCRUMB_CATEGORY = 'console';

/**
 * Field names whose STRING value may leave the device, for the free-form bags
 * (`tags`, `extra`, breadcrumb `data`): step ids, route names, error identity,
 * and build/version provenance. Every other string is dropped.
 */
/** Tag marking a funnel milestone rather than a failure. */
const APP_EVENT_SOURCE = 'app_event';

const ALLOWED_DATA_STRING_KEYS: ReadonlySet<string> = new Set([
  // Onboarding step ids and navigation route names.
  'step', 'stepId', 'step_id', 'fromStep', 'toStep', 'from', 'to',
  'route', 'routeName', 'screen', 'pathname', 'destination',
  // Error identity.
  'source', 'category', 'errorName', 'errorType', 'errorMessage',
  'mechanism', 'handled', 'phase', 'reason', 'result', 'status', 'level',
  // Shape of a dropped payload: key names only, never their values.
  'dataKeys', 'componentStack',
  // Build and version provenance.
  'release', 'dist', 'environment', 'platform',
  'appVersion', 'app_version', 'buildNumber', 'app_build', 'buildProfile',
]);

/**
 * Per-section allowlists for `event.contexts`. A section that is not named
 * here is dropped whole, and inside a section only these keys may carry a
 * string. The split matters: `name` is legitimate under `os` and `runtime`
 * ("iOS", "hermes") but under `device` it is the phone's name, which on iOS
 * reads "<FirstName>'s iPhone". It is therefore absent from the device set.
 */
const ALLOWED_CONTEXT_STRING_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  app: new Set(['app_identifier', 'app_name', 'app_version', 'app_build', 'app_start_time', 'build_type']),
  device: new Set([
    'family', 'model', 'model_id', 'arch', 'manufacturer', 'brand',
    'orientation', 'screen_resolution', 'screen_density', 'locale', 'timezone',
  ]),
  os: new Set(['name', 'version', 'build', 'kernel_version']),
  runtime: new Set(['name', 'version']),
  react_native_context: new Set([
    'js_engine', 'hermes_version', 'react_native_version', 'expo_version', 'turbo_module', 'fabric',
  ]),
  trace: new Set(['trace_id', 'span_id', 'parent_span_id', 'op', 'origin', 'status']),
};

/**
 * The only shape a Sentry user id may take: the lowercase SHA-256 prefix set
 * by `attachHashedUser`. Anything else — Sentry's own installation UUID, an
 * email, an ip_address — is dropped, so a raw device id cannot reach Sentry
 * even if some future code path writes one onto the scope.
 */
const HASHED_USER_ID_PATTERN = /^[0-9a-f]{8}$/;

let sentryModule: SentryModule | null = null;
let initialized = false;
let enabled = false;
let hashedDeviceId: string | null = null;

// ---------------------------------------------------------------------------
// Scrubbing
// ---------------------------------------------------------------------------

type ScrubbedValue = string | number | boolean | ScrubbedValue[] | { [key: string]: ScrubbedValue };

/**
 * SECURITY backstop. The device id is a UUID and it is this app's auth
 * credential, so any UUID that survives the allowlist is masked instead of
 * sent — an error message or a route param is the realistic way one would
 * otherwise slip through an allowlisted field. Sentry's own 32-hex ids
 * (event_id, trace_id) have no dashes and are unaffected.
 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const REDACTED_UUID = '[uuid]';

function truncate(value: string): string {
  const masked = value.replace(UUID_PATTERN, REDACTED_UUID);
  return masked.length > MAX_STRING_LENGTH ? masked.slice(0, MAX_STRING_LENGTH) : masked;
}

/** Truncate a string that is allowed through by position rather than by key. */
function truncateOrDrop(value: unknown): string | undefined {
  return typeof value === 'string' ? truncate(value) : undefined;
}

function scrubValue(
  key: string,
  value: unknown,
  allowed: ReadonlySet<string>,
  depth: number,
): ScrubbedValue | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return allowed.has(key) ? truncate(value) : undefined;
  if (depth >= MAX_SCRUB_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => scrubValue(key, item, allowed, depth + 1))
      .filter((item): item is ScrubbedValue => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (value !== null && typeof value === 'object') {
    const nested = scrubBag(value, allowed, depth + 1);
    return Object.keys(nested).length > 0 ? nested : undefined;
  }
  return undefined;
}

/** Rebuild a free-form bag, keeping scalars and allowlisted strings only. */
function scrubBag(
  bag: unknown,
  allowed: ReadonlySet<string> = ALLOWED_DATA_STRING_KEYS,
  depth = 0,
): Record<string, ScrubbedValue> {
  const out: Record<string, ScrubbedValue> = {};
  if (bag === null || typeof bag !== 'object') return out;
  for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
    const scrubbed = scrubValue(key, value, allowed, depth);
    if (scrubbed !== undefined) out[key] = scrubbed;
  }
  return out;
}

function emptyToUndefined<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

/** Tags are flat by contract, so nested values are dropped rather than walked. */
function scrubTags(tags: unknown): Record<string, string | number | boolean> | undefined {
  const out: Record<string, string | number | boolean> = {};
  if (tags === null || typeof tags !== 'object') return undefined;
  for (const [key, value] of Object.entries(tags as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && ALLOWED_DATA_STRING_KEYS.has(key)) out[key] = truncate(value);
  }
  return emptyToUndefined(out);
}

function scrubContexts(contexts: unknown): Record<string, Record<string, unknown>> | undefined {
  const out: Record<string, Record<string, unknown>> = {};
  if (contexts === null || typeof contexts !== 'object') return undefined;
  for (const [section, value] of Object.entries(contexts as Record<string, unknown>)) {
    const allowed = ALLOWED_CONTEXT_STRING_KEYS[section];
    if (allowed === undefined) continue;
    const scrubbed = scrubBag(value, allowed);
    if (Object.keys(scrubbed).length > 0) out[section] = scrubbed;
  }
  return emptyToUndefined(out);
}

/**
 * Frames are rebuilt from code identifiers only. `vars` (the local variables
 * of the frame) is the single largest leak vector in a stack trace and is
 * dropped, as are `abs_path` and the `context_line` / `pre_context` /
 * `post_context` source snippets.
 */
function scrubFrame(frame: StackFrame): StackFrame {
  return {
    filename: truncateOrDrop(frame.filename),
    function: truncateOrDrop(frame.function),
    module: truncateOrDrop(frame.module),
    platform: truncateOrDrop(frame.platform),
    lineno: typeof frame.lineno === 'number' ? frame.lineno : undefined,
    colno: typeof frame.colno === 'number' ? frame.colno : undefined,
    in_app: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
  };
}

function scrubStacktrace(stacktrace: Stacktrace | undefined): Stacktrace | undefined {
  if (!stacktrace?.frames) return undefined;
  return { frames: stacktrace.frames.map(scrubFrame) };
}

/** The error's type and message are permitted; everything around them is not. */
function scrubException(exception: ErrorEvent['exception']): ErrorEvent['exception'] {
  if (!exception?.values) return undefined;
  const values: Exception[] = exception.values.map((value) => ({
    type: truncateOrDrop(value.type),
    value: truncateOrDrop(value.value),
    module: truncateOrDrop(value.module),
    mechanism: value.mechanism
      ? { type: value.mechanism.type, handled: value.mechanism.handled }
      : undefined,
    stacktrace: scrubStacktrace(value.stacktrace),
  }));
  return { values };
}

type DebugImages = NonNullable<NonNullable<ErrorEvent['debug_meta']>['images']>;

/** Symbolication metadata only: identifiers pass through, on-disk paths do not. */
const ALLOWED_DEBUG_IMAGE_KEYS = [
  'type', 'debug_id', 'debug_file', 'code_id', 'code_file', 'image_addr', 'image_size', 'uuid', 'arch',
] as const;
const DEBUG_IMAGE_PATH_KEYS: ReadonlySet<string> = new Set(['debug_file', 'code_file']);

function scrubDebugMeta(debugMeta: ErrorEvent['debug_meta']): ErrorEvent['debug_meta'] {
  const images = debugMeta?.images;
  if (images === undefined) return undefined;
  const scrubbed = images.map((image) => {
    const source = image as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of ALLOWED_DEBUG_IMAGE_KEYS) {
      const value = source[key];
      // `debug_id` and `uuid` are UUID-shaped symbolication identifiers, not
      // device identifiers, so they must survive the UUID mask in truncate().
      if (typeof value === 'string') out[key] = DEBUG_IMAGE_PATH_KEYS.has(key) ? truncate(value) : value;
      else if (typeof value === 'number') out[key] = value;
    }
    return out;
  });
  return { images: scrubbed as unknown as DebugImages };
}

function scrubUser(user: User | undefined): User | undefined {
  const id = typeof user?.id === 'string' && HASHED_USER_ID_PATTERN.test(user.id) ? user.id : undefined;
  return id === undefined ? undefined : { id };
}

/**
 * Rebuild a breadcrumb. Console breadcrumbs are dropped outright — the app
 * logs user content through `logger` — and only app-namespaced breadcrumbs
 * keep their free-text message.
 */
function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = typeof breadcrumb.category === 'string' ? breadcrumb.category : undefined;
  if (category === CONSOLE_BREADCRUMB_CATEGORY) return null;
  const isAppBreadcrumb = category?.startsWith(APP_BREADCRUMB_PREFIX) ?? false;
  return {
    type: truncateOrDrop(breadcrumb.type),
    category: category === undefined ? undefined : truncate(category),
    level: breadcrumb.level,
    timestamp: typeof breadcrumb.timestamp === 'number' ? breadcrumb.timestamp : undefined,
    message: isAppBreadcrumb ? truncateOrDrop(breadcrumb.message) : undefined,
    data: emptyToUndefined(scrubBag(breadcrumb.data)),
  };
}

/**
 * Rebuild the whole event. Anything not named below — `request` (URLs and
 * headers), `server_name` (the device name), `threads`, `modules`,
 * `fingerprint`, `logentry`, attachments — is gone by construction.
 */
function scrubEvent(event: ErrorEvent): ErrorEvent {
  const breadcrumbs = (event.breadcrumbs ?? [])
    .map(scrubBreadcrumb)
    .filter((crumb): crumb is Breadcrumb => crumb !== null);

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    logger: truncateOrDrop(event.logger),
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    sdk: event.sdk,
    debug_meta: scrubDebugMeta(event.debug_meta),
    // A route name, and the name passed to `captureAppEvent`.
    transaction: truncateOrDrop(event.transaction),
    message: truncateOrDrop(event.message),
    user: scrubUser(event.user),
    exception: scrubException(event.exception),
    contexts: scrubContexts(event.contexts),
    tags: scrubTags(event.tags),
    extra: emptyToUndefined(scrubBag(event.extra)),
    breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
  };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * Jest must never initialise the SDK: a test run has no business opening a
 * transport, and the native module is absent anyway.
 */
function isJestRuntime(): boolean {
  return process.env.JEST_WORKER_ID !== undefined;
}

function readDsn(): string | null {
  const raw = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function loadSentry(): SentryModule | null {
  if (sentryModule !== null) return sentryModule;
  try {
    // Lazy require, like build-profile.ts does for expo-constants: with no DSN
    // the SDK is never pulled into the bundle graph of a test run at all.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentryModule = require('@sentry/react-native') as SentryModule;
    return sentryModule;
  } catch {
    return null;
  }
}

/** Release/dist provenance, straight off the resolved Expo config. */
function readAppIdentity(): { release: string | undefined; dist: string | undefined } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as
      | {
          expoConfig?: {
            version?: unknown;
            ios?: { buildNumber?: unknown };
            android?: { versionCode?: unknown };
          } | null;
        }
      | undefined;
    const config = Constants?.expoConfig;
    const version = typeof config?.version === 'string' ? config.version : undefined;
    const iosBuild = typeof config?.ios?.buildNumber === 'string' ? config.ios.buildNumber : undefined;
    const androidBuild =
      typeof config?.android?.versionCode === 'number' ? String(config.android.versionCode) : undefined;
    return { release: version, dist: Platform.OS === 'android' ? androidBuild : iosBuild };
  } catch {
    return { release: undefined, dist: undefined };
  }
}

/** The EAS build profile that produced this binary, reused from build-profile.ts. */
function resolveEnvironment(): string {
  return getBuildProfile() ?? (__DEV__ ? 'development' : 'unknown');
}

/**
 * SECURITY: `getDeviceId()` is this app's ONLY auth credential — the backend
 * accepts its raw value in the `X-Device-ID` header as proof of identity — so
 * only a SHA-256 prefix of it may ever leave the device, matching the
 * backend's own `hashUidForTelemetry`.
 *
 * expo-crypto has no synchronous SHA-256, so the digest is awaited and cached;
 * the user is set once it resolves. Events captured before then simply carry
 * no user. In a storage-locked (recovery) session no user is set at all:
 * reading the device id there would mint or expose a one-session identity.
 */
function attachHashedUser(sentry: SentryModule): void {
  if (hashedDeviceId !== null) {
    sentry.setUser({ id: hashedDeviceId });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('./mmkv-storage') as typeof import('./mmkv-storage');
    if (storage.isRecoverySession()) return;
    const deviceId = storage.getDeviceId();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Crypto = require('expo-crypto') as typeof import('expo-crypto');
    void Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, deviceId)
      .then((digest) => {
        hashedDeviceId = digest.slice(0, DEVICE_HASH_LENGTH).toLowerCase();
        sentry.setUser({ id: hashedDeviceId });
      })
      .catch(() => {
        // No identity is strictly better than a raw one.
      });
  } catch {
    // Storage or crypto unavailable: report without a user.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start Sentry. Safe to call more than once; only the first call initialises.
 * A no-op without a DSN and under Jest.
 */
export function initSentry(): void {
  if (initialized) return;
  if (isJestRuntime()) return;
  const dsn = readDsn();
  if (dsn === null) return;
  const sentry = loadSentry();
  if (sentry === null) return;

  initialized = true;
  const { release, dist } = readAppIdentity();

  try {
    sentry.init({
      dsn,
      release,
      dist,
      environment: resolveEnvironment(),

      // Privacy (see the file header). These are the defaults for most of
      // them; they are written out so that turning one on is a deliberate,
      // reviewable edit rather than an SDK default drifting under us.
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      enableCaptureFailedRequests: false,
      enableUserInteractionTracing: false,
      enableLogs: false,
      // Transactions do NOT pass through `beforeSend`, so performance data is
      // never collected rather than scrubbed.
      enableAutoPerformanceTracing: false,
      // Only relevant for message events, whose `threads` scrubEvent does not
      // forward, so collecting the stack would be data we throw away.
      attachStacktrace: false,
      maxBreadcrumbs: 50,

      beforeSend: (event) => {
        const scrubbed = scrubEvent(event);
        // A funnel milestone is a counter, not a failure: the breadcrumb trail
        // is only context for an error, so shipping 50 of them per event is
        // payload and rebuild cost for nothing.
        if (scrubbed && scrubbed.tags?.source === APP_EVENT_SOURCE) delete scrubbed.breadcrumbs;
        return scrubbed;
      },
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
      // A NATIVE crash is assembled and sent by the Cocoa SDK; it never passes
      // through `beforeSend` or `beforeBreadcrumb` above. Cocoa's own automatic
      // breadcrumbs include `ui.click` entries labelled with the tapped view's
      // accessibility label, which in this app is regularly a person's name or
      // the title of something they wrote. Turning them off is the only way to
      // keep user content out of a native crash report.
      //
      // Not in `ReactNativeOptions`, but the JS layer forwards every unknown
      // key to `RNSentry.initNativeSdk` (wrapper.js builds `filteredOptions`
      // with a rest spread), and the bridge hands that dictionary straight to
      // `SentryOptionsInternal initWithDict:` (SentrySDKWrapper.m), which does
      // read this key. Hence the cast.
      ...({ enableAutoBreadcrumbTracking: false } as Record<string, boolean>),
    });
    enabled = true;
  } catch {
    enabled = false;
    return;
  }

  // Off the launch path. attachHashedUser reads the Keychain synchronously via
  // getDeviceId(), and this runs at module scope before the first frame. Events
  // in the first tick simply carry no user, which costs nothing: they are still
  // reported, and the hash is attached to everything after.
  setTimeout(() => attachHashedUser(sentry), 0);
}

/** True only once `initSentry()` has actually started the SDK with a DSN. */
export function isSentryEnabled(): boolean {
  return enabled;
}

/** Report a handled failure. `source` identifies the call site, e.g. 'onboarding'. */
export function captureAppError(source: string, error: Error, extra?: Record<string, unknown>): void {
  if (!enabled || sentryModule === null) return;
  try {
    sentryModule.captureException(error, {
      tags: { source: truncate(source) },
      extra: extra ?? {},
    });
  } catch {
    // Reporting must never take the app down with it.
  }
}

/** Leave a trail for the next error. `category` is namespaced under `app.`. */
export function addAppBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (!enabled || sentryModule === null) return;
  try {
    sentryModule.addBreadcrumb({
      category: APP_BREADCRUMB_PREFIX + category,
      message,
      data,
      level: 'info',
    });
  } catch {
    // Ignored, as above.
  }
}

/** Record a funnel milestone (an onboarding step reached, a flow completed). */
export function captureAppEvent(name: string, data?: Record<string, string | number | boolean>): void {
  if (!enabled || sentryModule === null) return;
  try {
    sentryModule.captureMessage(name, {
      level: 'info',
      tags: { source: APP_EVENT_SOURCE },
      extra: data ?? {},
    });
  } catch {
    // Ignored, as above.
  }
}
