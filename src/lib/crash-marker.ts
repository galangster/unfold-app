/**
 * Boot crash-loop marker.
 *
 * A persisted value that throws during render re-crashes on every launch, and
 * neither the error boundary (which only remounts the same subtree) nor the
 * rehydrate repair (which only validates shapes) can get the user out. This
 * module counts consecutive crashes that happen inside the first seconds of a
 * launch in a small dedicated MMKV instance, so the boundary can offer a
 * local-data reset once the count reaches the threshold. A launch that stays
 * up for the healthy window without crashing clears the count. Once a session
 * has crashed at boot it can no longer prove itself healthy — the fallback or
 * the recovery screen may simply sit open past the window — and a retry that
 * crashes again extends the streak whatever the uptime.
 *
 * The decision logic is pure and exported for tests; only the storage adapter
 * touches MMKV, and it degrades to memory when the instance cannot be opened.
 */
import { MMKV } from 'react-native-mmkv';
import { logger } from '@/lib/logger';

/** A crash this soon after launch counts toward the loop. */
export const BOOT_CRASH_WINDOW_MS = 10_000;
/** A launch that stays up this long is healthy and clears the count. */
export const HEALTHY_BOOT_MS = 30_000;
/** Consecutive boot crashes before recovery is offered. */
export const CRASH_LOOP_THRESHOLD = 3;

const INSTANCE_ID = 'unfold-crash-marker';
const COUNT_KEY = 'consecutive-boot-crashes';
const LAST_FATAL_KEY = 'last-fatal';

/** Bounds for the fatal breadcrumb — this instance must stay tiny and always openable. */
const MAX_FATAL_MESSAGE_CHARS = 300;
const MAX_FATAL_STACK_LINES = 6;
const MAX_FATAL_STACK_CHARS = 1_000;

const LAUNCHED_AT = Date.now();

/** True once a crash has counted toward the streak in this session. */
let crashedThisSession = false;

/**
 * Pure: whether a crash at `uptimeMs` counts toward the boot-crash streak.
 * Inside the boot window it always does. Later it only does once this session
 * has already counted a boot crash: "Try Again" from the fallback that crashes
 * again is the same loop, however long the fallback sat open before the tap.
 */
export function isBootCrash(
  uptimeMs: number,
  crashedEarlierThisSession: boolean,
  windowMs = BOOT_CRASH_WINDOW_MS,
): boolean {
  if (crashedEarlierThisSession) return true;
  return Number.isFinite(uptimeMs) && uptimeMs >= 0 && uptimeMs <= windowMs;
}

/** Pure: the consecutive boot-crash count after a crash at `uptimeMs`. */
export function nextBootCrashCount(
  previous: number,
  uptimeMs: number,
  windowMs = BOOT_CRASH_WINDOW_MS,
  crashedEarlierThisSession = false,
): number {
  const base = Number.isFinite(previous) && previous > 0 ? Math.floor(previous) : 0;
  // A first crash later in the session is not a boot crash: it neither extends
  // the streak nor proves the launch healthy, so the count is left alone.
  return isBootCrash(uptimeMs, crashedEarlierThisSession, windowMs) ? base + 1 : base;
}

/** Pure: the count after a launch has stayed up for `uptimeMs`. */
export function bootCrashCountAfterUptime(
  previous: number,
  uptimeMs: number,
  healthyMs = HEALTHY_BOOT_MS,
  crashedEarlierThisSession = false,
): number {
  // Staying up proves nothing once the session has crashed at boot: the
  // fallback (or the recovery screen) may simply have been left open.
  if (crashedEarlierThisSession) return previous;
  return uptimeMs >= healthyMs ? 0 : previous;
}

/** Pure: true once the streak has reached the recovery threshold. */
export function isCrashLoop(count: number, threshold = CRASH_LOOP_THRESHOLD): boolean {
  return count >= threshold;
}

export function getBootUptimeMs(now = Date.now()): number {
  return now - LAUNCHED_AT;
}

interface MarkerStore {
  get(): number;
  set(count: number): void;
  getRaw(key: string): string | undefined;
  setRaw(key: string, value: string): void;
  removeRaw(key: string): void;
}

function openMarkerStore(): MarkerStore {
  try {
    // Unencrypted on purpose: it holds one integer plus a bounded crash
    // breadcrumb, and must open even when the Keychain-backed main store
    // cannot.
    const mmkv = new MMKV({ id: INSTANCE_ID });
    return {
      get: () => {
        const parsed = Number.parseInt(mmkv.getString(COUNT_KEY) ?? '0', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      },
      set: (count) => {
        mmkv.set(COUNT_KEY, String(count));
      },
      getRaw: (key) => mmkv.getString(key),
      setRaw: (key, value) => {
        mmkv.set(key, value);
      },
      removeRaw: (key) => {
        mmkv.delete(key);
      },
    };
  } catch (error) {
    logger.warn('[crash-marker] MMKV unavailable; crash-loop detection is in-memory this session', error);
    let memory = 0;
    const rawMemory = new Map<string, string>();
    return {
      get: () => memory,
      set: (count) => {
        memory = count;
      },
      getRaw: (key) => rawMemory.get(key),
      setRaw: (key, value) => {
        rawMemory.set(key, value);
      },
      removeRaw: (key) => {
        rawMemory.delete(key);
      },
    };
  }
}

let markerStore: MarkerStore | null = null;

function getMarkerStore(): MarkerStore {
  markerStore ??= openMarkerStore();
  return markerStore;
}

export function getConsecutiveBootCrashCount(): number {
  try {
    return getMarkerStore().get();
  } catch {
    return 0;
  }
}

/**
 * Records a crash (caught by the boundary or fatal) and returns the new
 * consecutive boot-crash count. Never throws: it runs inside error handlers.
 */
export function recordCrash(now = Date.now()): number {
  try {
    const store = getMarkerStore();
    const previous = store.get();
    const next = nextBootCrashCount(previous, getBootUptimeMs(now), BOOT_CRASH_WINDOW_MS, crashedThisSession);
    if (next > previous) crashedThisSession = true;
    store.set(next);
    return next;
  } catch {
    return 0;
  }
}

export function clearBootCrashCount(): void {
  try {
    getMarkerStore().set(0);
  } catch {
    // Best effort; the next healthy launch clears it.
  }
}

/** A fatal JS error, as much of it as survives a process that is about to die. */
export interface FatalBreadcrumb {
  message: string;
  /** Head of the stack — enough frames to locate the throw, never the whole trace. */
  stack: string | null;
  /** ISO timestamp of the crash, i.e. of the PREVIOUS launch. */
  ts: string;
}

/** Pure: the bounded breadcrumb for `error`. Total size is capped by construction. */
export function buildFatalBreadcrumb(error: unknown, now = Date.now()): FatalBreadcrumb {
  const source = error instanceof Error ? error : null;
  const rawMessage = source
    ? `${source.name}: ${source.message}`
    : typeof error === 'string'
      ? error
      : (() => {
          try {
            return String(error);
          } catch {
            return 'Unknown error';
          }
        })();
  const rawStack = typeof source?.stack === 'string' ? source.stack : null;
  return {
    message: rawMessage.slice(0, MAX_FATAL_MESSAGE_CHARS),
    stack: rawStack
      ? rawStack.split('\n').slice(0, MAX_FATAL_STACK_LINES).join('\n').slice(0, MAX_FATAL_STACK_CHARS)
      : null,
    ts: new Date(now).toISOString(),
  };
}

/**
 * Synchronously persist a fatal error alongside the crash count.
 *
 * The bug log writes through AsyncStorage after an `await`, but RN's fatal
 * handler terminates the process in production — so that write normally never
 * lands and the app's "every JS error reaches the bug log" claim did not hold
 * for the errors that matter most. MMKV writes are synchronous, so this
 * breadcrumb survives; the next launch flushes it into the bug log. Never
 * throws: it runs inside the error handler.
 */
export function recordFatalBreadcrumb(error: unknown, now = Date.now()): void {
  try {
    getMarkerStore().setRaw(LAST_FATAL_KEY, JSON.stringify(buildFatalBreadcrumb(error, now)));
  } catch {
    // Best effort — the crash count is the load-bearing part of this module.
  }
}

/**
 * Reads the breadcrumb left by a previous launch's fatal error and clears it,
 * so one crash is reported once. Returns null when there is none (or when it
 * cannot be parsed, in which case it is still cleared).
 */
export function takeLastFatalBreadcrumb(): FatalBreadcrumb | null {
  try {
    const store = getMarkerStore();
    const raw = store.getRaw(LAST_FATAL_KEY);
    if (!raw) return null;
    store.removeRaw(LAST_FATAL_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { message, stack, ts } = parsed as Partial<FatalBreadcrumb>;
    if (typeof message !== 'string' || typeof ts !== 'string') return null;
    return { message, stack: typeof stack === 'string' ? stack : null, ts };
  } catch {
    return null;
  }
}

/**
 * Clears the count once the launch has been up for the healthy window — unless
 * a crash counted this session, which no amount of uptime undoes. Returns a
 * cancel.
 */
export function armHealthyBootTimer(): () => void {
  const handle = setTimeout(() => {
    try {
      const store = getMarkerStore();
      store.set(bootCrashCountAfterUptime(store.get(), getBootUptimeMs(), HEALTHY_BOOT_MS, crashedThisSession));
    } catch {
      // Best effort.
    }
  }, HEALTHY_BOOT_MS);
  return () => clearTimeout(handle);
}

/** Test-only: the session flag is module state and survives between tests in one file. */
export function __resetCrashMarkerSessionForTests(): void {
  crashedThisSession = false;
}
