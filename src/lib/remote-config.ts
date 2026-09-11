import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import type { AllowedTrialDays } from '@/lib/trial-facts';

export const REMOTE_CONFIG_TIMEOUT_MS = 4_000;
export const REMOTE_CONFIG_MIN_REFETCH_MS = 5 * 60_000;
export const REMOTE_CONFIG_ERROR_RETRY_MS = 30_000;
export const REMOTE_CONFIG_MAX_AGE_MS = 60 * 60_000;

export interface RemoteConfigV1 {
  version: 1;
  autoTrialSeries: {
    enabled: boolean;
    platforms: ('ios' | 'android')[];
    maxTrialDays: AllowedTrialDays;
  };
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

const ALLOWED_DAYS = new Set<AllowedTrialDays>([3, 7, 14, 30]);

let state: RemoteConfigState = { status: 'idle' };
let inflight: Promise<RemoteConfigState> | null = null;

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
  return {
    version: 1,
    autoTrialSeries: {
      enabled: series.enabled,
      platforms: [...series.platforms],
      maxTrialDays: series.maxTrialDays as AllowedTrialDays,
    },
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
  state = { status: 'error', failedAtMs: nowMs, reason };
  return state;
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
    state = { status: 'ok', config: parsed, fetchedAtMs: nowMs };
    return state;
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

  const pending = fetchConfig(nowMs, o?.fetchImpl ?? fetch);
  inflight = pending;
  try {
    return await pending;
  } finally {
    if (inflight === pending) inflight = null;
  }
}

export function readAutoTrialSwitchSnapshot(
  nowMs: number,
  platform: string,
  current: RemoteConfigState = state,
): AutoTrialSwitchSnapshot {
  if (current.status === 'idle') {
    return { enabled: false, maxTrialDays: 7, fetchedAtMs: null, reason: 'not_fetched' };
  }
  if (current.status === 'error') {
    return { enabled: false, maxTrialDays: 7, fetchedAtMs: current.failedAtMs, reason: 'fetch_failed' };
  }

  const { config, fetchedAtMs } = current;
  const maxTrialDays = config.autoTrialSeries.maxTrialDays;
  if (nowMs - fetchedAtMs > REMOTE_CONFIG_MAX_AGE_MS) {
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
