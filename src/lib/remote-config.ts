import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/device-credential';
import type { AllowedTrialDays } from '@/lib/trial-facts';

export const REMOTE_CONFIG_TIMEOUT_MS = 4_000;
export const REMOTE_CONFIG_MIN_REFETCH_MS = 5 * 60_000;
export const REMOTE_CONFIG_ERROR_RETRY_MS = 30_000;
export const REMOTE_CONFIG_MAX_AGE_MS = 60 * 60_000;
export const REMOTE_CONFIG_PURCHASE_WAIT_MS = 3_000;

export interface RemoteConfigV1 {
  version: 1;
  autoTrialSeries: {
    enabled: boolean;
    platforms: ('ios' | 'android')[];
    maxTrialDays: AllowedTrialDays;
  };
  /** Weekly chapters creation switch. A missing or malformed field reads as off. */
  chapteredSeries: { enabled: boolean };
  source: 'db' | 'fallback';
}

export type RemoteConfigState =
  | { status: 'idle' }
  | { status: 'ok'; config: RemoteConfigV1; fetchedAtMs: number }
  | { status: 'error'; failedAtMs: number; reason: 'timeout' | 'network' | 'http' | 'parse' | 'server_fallback' };

export interface AutoTrialSwitchSnapshot {
  enabled: boolean;
  maxTrialDays: AllowedTrialDays;
  fetchedAtMs: number | null;
  reason: 'on' | 'flag_off' | 'platform_off' | 'not_fetched' | 'fetch_failed' | 'stale';
}

const ALLOWED_DAYS = new Set<AllowedTrialDays>([3, 7]);

let state: RemoteConfigState = { status: 'idle' };
let inflight: Promise<RemoteConfigState> | null = null;
const listeners = new Set<() => void>();

function setState(next: RemoteConfigState): RemoteConfigState {
  state = next;
  listeners.forEach((listener) => listener());
  return state;
}

/** Calls the listener after every fetch result, so mounted screens follow a refresh. */
export function subscribeRemoteConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetRemoteConfigForTesting(): void {
  state = { status: 'idle' };
  inflight = null;
}

function isPlatform(value: unknown): value is 'ios' | 'android' {
  return value === 'ios' || value === 'android';
}

export function parseRemoteConfig(json: unknown): RemoteConfigV1 | null {
  if (!json || typeof json !== 'object') return null;
  const row = json as Record<string, unknown>;
  if (row.version !== 1) return null;
  if (row.source !== 'db' && row.source !== 'fallback') return null;
  if (!row.autoTrialSeries || typeof row.autoTrialSeries !== 'object') return null;
  const series = row.autoTrialSeries as Record<string, unknown>;
  if (typeof series.enabled !== 'boolean') return null;
  if (!Array.isArray(series.platforms) || !series.platforms.every(isPlatform)) return null;
  if (typeof series.maxTrialDays !== 'number' || !ALLOWED_DAYS.has(series.maxTrialDays as AllowedTrialDays)) {
    return null;
  }
  const chaptered = row.chapteredSeries && typeof row.chapteredSeries === 'object'
    ? (row.chapteredSeries as Record<string, unknown>)
    : null;
  return {
    version: 1,
    autoTrialSeries: {
      enabled: series.enabled,
      platforms: [...series.platforms],
      maxTrialDays: series.maxTrialDays as AllowedTrialDays,
    },
    chapteredSeries: { enabled: chaptered?.enabled === true },
    source: row.source,
  };
}

function shouldSkip(nowMs: number, force?: boolean): boolean {
  if (force) return false;
  if (state.status === 'ok' && nowMs - state.fetchedAtMs < REMOTE_CONFIG_MIN_REFETCH_MS) return true;
  if (state.status === 'error' && nowMs - state.failedAtMs < REMOTE_CONFIG_ERROR_RETRY_MS) return true;
  return false;
}

type ConfigFetch = (url: string, init?: RequestInit) => Promise<Response>;

function fail(nowMs: number, reason: Extract<RemoteConfigState, { status: 'error' }>['reason']): RemoteConfigState {
  return setState({ status: 'error', failedAtMs: nowMs, reason });
}

async function fetchConfig(
  nowMs: number,
  fetchImpl: ConfigFetch,
): Promise<RemoteConfigState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_CONFIG_TIMEOUT_MS);
  try {
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      headers = await getAuthHeaders();
    } catch {
      // GET /api/config is optional-auth.
    }
    const response = await fetchImpl(`${PRIMARY_BACKEND_URL}/api/config`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!response.ok) return fail(nowMs, 'http');
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return fail(nowMs, 'parse');
    }
    const parsed = parseRemoteConfig(body);
    if (!parsed) return fail(nowMs, 'parse');
    if (parsed.source === 'fallback') return fail(nowMs, 'server_fallback');
    return setState({ status: 'ok', config: parsed, fetchedAtMs: nowMs });
  } catch (error) {
    const aborted = controller.signal.aborted
      || (error instanceof Error && error.name === 'AbortError');
    return fail(nowMs, aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshRemoteConfig(o?: {
  force?: boolean;
  nowMs?: number;
  fetchImpl?: ConfigFetch;
}): Promise<RemoteConfigState> {
  const nowMs = o?.nowMs ?? Date.now();
  if (shouldSkip(nowMs, o?.force)) return state;
  if (inflight) return inflight;

  const pending = fetchConfig(nowMs, o?.fetchImpl ?? authenticatedFetch);
  inflight = pending;
  try {
    return await pending;
  } finally {
    if (inflight === pending) inflight = null;
  }
}

function isFreshOk(nowMs: number): boolean {
  return state.status === 'ok' && nowMs - state.fetchedAtMs <= REMOTE_CONFIG_MAX_AGE_MS;
}

export async function awaitRemoteConfigSettled(
  timeoutMs = REMOTE_CONFIG_PURCHASE_WAIT_MS,
  o?: {
    nowMs?: number;
    fetchImpl?: ConfigFetch;
  },
): Promise<RemoteConfigState> {
  const nowMs = o?.nowMs ?? Date.now();
  if (isFreshOk(nowMs)) return state;

  const force = state.status === 'error'
    && nowMs - state.failedAtMs < REMOTE_CONFIG_ERROR_RETRY_MS;
  const pending = refreshRemoteConfig({
    force,
    nowMs,
    fetchImpl: o?.fetchImpl,
  });
  const stateBefore = state;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RemoteConfigState>((resolve) => {
    timeoutId = setTimeout(() => resolve(stateBefore), timeoutMs);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

type ConfigSnapshot =
  | { kind: 'not_fetched' }
  | { kind: 'fetch_failed'; failedAtMs: number }
  | { kind: 'stale' | 'fresh'; config: RemoteConfigV1; fetchedAtMs: number };

/** One reading of the cached config: fresh only while within its max age. */
function readConfigSnapshot(nowMs: number, current: RemoteConfigState): ConfigSnapshot {
  if (current.status === 'idle') return { kind: 'not_fetched' };
  if (current.status === 'error') return { kind: 'fetch_failed', failedAtMs: current.failedAtMs };
  const { config, fetchedAtMs } = current;
  return { kind: nowMs - fetchedAtMs > REMOTE_CONFIG_MAX_AGE_MS ? 'stale' : 'fresh', config, fetchedAtMs };
}

export function readAutoTrialSwitchSnapshot(
  nowMs: number,
  platform: string,
  current: RemoteConfigState = state,
): AutoTrialSwitchSnapshot {
  const snapshot = readConfigSnapshot(nowMs, current);
  if (snapshot.kind === 'not_fetched') {
    return { enabled: false, maxTrialDays: 7, fetchedAtMs: null, reason: 'not_fetched' };
  }
  if (snapshot.kind === 'fetch_failed') {
    return { enabled: false, maxTrialDays: 7, fetchedAtMs: snapshot.failedAtMs, reason: 'fetch_failed' };
  }

  const { config, fetchedAtMs } = snapshot;
  const maxTrialDays = config.autoTrialSeries.maxTrialDays;
  if (snapshot.kind === 'stale') {
    return { enabled: false, maxTrialDays, fetchedAtMs, reason: 'stale' };
  }
  if (!config.autoTrialSeries.enabled) {
    return { enabled: false, maxTrialDays, fetchedAtMs, reason: 'flag_off' };
  }
  if (!config.autoTrialSeries.platforms.includes(platform as 'ios' | 'android')) {
    return { enabled: false, maxTrialDays, fetchedAtMs, reason: 'platform_off' };
  }
  return { enabled: true, maxTrialDays, fetchedAtMs, reason: 'on' };
}

/** False until the first fetch has answered, ok or failed. Tells "off" apart from "not known yet". */
export function hasRemoteConfigSettled(current: RemoteConfigState = state): boolean {
  return current.status !== 'idle';
}

/**
 * Whether the reader may start a 4-week chaptered series. Off before a fetch,
 * after a failed or fallback fetch, and once the config is older than its max age.
 */
export function readChapteredSeriesEnabled(
  nowMs: number,
  current: RemoteConfigState = state,
): boolean {
  const snapshot = readConfigSnapshot(nowMs, current);
  return snapshot.kind === 'fresh' && snapshot.config.chapteredSeries.enabled;
}
