/**
 * Device credential: one signed secret per device, minted by the backend
 * and sent as X-Device-Credential next to X-Device-ID.
 *
 * The value is stored in SecureStore and mirrored in a synchronous memory
 * cache so header building never waits on Keychain I/O. Never log it.
 */
import * as SecureStore from 'expo-secure-store';
import { PRIMARY_BACKEND_URL } from '@/lib/backend-url';
import { isEphemeralDeviceId } from '@/lib/device-id';
import { logger } from '@/lib/logger';
import { getDeviceId } from '@/lib/mmkv-storage';

export const DEVICE_CREDENTIAL_STORE_KEY = 'unfold-device-credential';
const REGISTER_TIMEOUT_MS = 8_000;

const DEVICE_CREDENTIAL_AUTH_ERRORS = new Set([
  'device_credential_required',
  'device_credential_invalid',
]);

const KEYCHAIN_WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

type DeviceCredentialRecord = {
  deviceId: string;
  credential: string;
};

let cache: DeviceCredentialRecord | null = null;
let loadPromise: Promise<void> | null = null;
let ensureInFlight: Promise<string | null> | null = null;
let recoveryInFlight: Promise<string | null> | null = null;
// Bumped by every clear, so registration work started before it never persists.
let epoch = 0;

export function getCachedDeviceCredential(
  deviceId: string = getDeviceId(),
): string | null {
  if (!cache || cache.deviceId !== deviceId) return null;
  return cache.credential;
}

function parseStoredRecord(raw: string): DeviceCredentialRecord | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as { deviceId?: unknown; credential?: unknown };
    if (typeof record.deviceId !== 'string' || record.deviceId.length === 0) return null;
    if (typeof record.credential !== 'string' || record.credential.length === 0) return null;
    return { deviceId: record.deviceId, credential: record.credential };
  } catch {
    return null;
  }
}

/** Persist unless a clear or a device-id rotation happened since the work began. */
async function persistRecord(
  record: DeviceCredentialRecord,
  startedEpoch: number,
): Promise<boolean> {
  if (startedEpoch !== epoch || record.deviceId !== getDeviceId()) return false;
  cache = record;
  await SecureStore.setItemAsync(
    DEVICE_CREDENTIAL_STORE_KEY,
    JSON.stringify(record),
    KEYCHAIN_WRITE_OPTIONS,
  );
  return true;
}

export function loadDeviceCredential(): Promise<void> {
  loadPromise ??= (async () => {
    try {
      const raw = await SecureStore.getItemAsync(DEVICE_CREDENTIAL_STORE_KEY);
      if (!raw) return;
      const record = parseStoredRecord(raw);
      if (!record || record.deviceId !== getDeviceId()) {
        await SecureStore.deleteItemAsync(DEVICE_CREDENTIAL_STORE_KEY);
        return;
      }
      cache = record;
    } catch {
      // Keychain unreadability must not throw to boot or header callers.
    }
  })();
  return loadPromise;
}

async function registerDeviceCredential(): Promise<string | null> {
  const startedEpoch = epoch;
  const deviceId = getDeviceId();
  // Lazy: api-config imports this module, so a static import would be a cycle.
  // Base headers only: getAuthHeaders would wait on this very registration.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getBaseHeaders } = require('@/lib/api-config') as typeof import('@/lib/api-config');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS);
  try {
    const response = await fetch(`${PRIMARY_BACKEND_URL}/api/devices/register`, {
      method: 'POST',
      headers: getBaseHeaders(deviceId),
      body: JSON.stringify({ deviceId }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn('[device-credential] registration failed', response.status);
      return null;
    }
    const body: unknown = await response.json();
    const credential =
      body && typeof body === 'object' && 'credential' in body
        ? (body as { credential?: unknown }).credential
        : null;
    if (typeof credential !== 'string' || credential.length === 0) return null;
    if (!(await persistRecord({ deviceId, credential }, startedEpoch))) return null;
    return credential;
  } finally {
    clearTimeout(timeout);
  }
}

/** The cached credential, or one registration shared by every concurrent caller. */
export async function ensureDeviceCredential(): Promise<string | null> {
  try {
    await loadDeviceCredential();
    const deviceId = getDeviceId();
    if (isEphemeralDeviceId(deviceId)) return null;
    const cached = getCachedDeviceCredential(deviceId);
    if (cached) return cached;
    if (!ensureInFlight) {
      const pending: Promise<string | null> = registerDeviceCredential().finally(() => {
        if (ensureInFlight === pending) ensureInFlight = null;
      });
      ensureInFlight = pending;
    }
    return await ensureInFlight;
  } catch {
    return getCachedDeviceCredential();
  }
}

/** Forget the credential; any registration still in flight will not persist. */
export async function clearDeviceCredential(): Promise<void> {
  epoch += 1;
  cache = null;
  ensureInFlight = null;
  try {
    await SecureStore.deleteItemAsync(DEVICE_CREDENTIAL_STORE_KEY);
  } catch {
    // Clearing is best-effort; the next load discards a leftover record.
  }
}

async function isDeviceCredentialAuthError(response: Response): Promise<boolean> {
  try {
    const payload: unknown = await response.clone().json();
    if (!payload || typeof payload !== 'object') return false;
    const error = (payload as { error?: unknown }).error;
    return typeof error === 'string' && DEVICE_CREDENTIAL_AUTH_ERRORS.has(error);
  } catch {
    return false;
  }
}

/** Drop the rejected credential and register a fresh one. One recovery at a time. */
function recoverDeviceCredential(): Promise<string | null> {
  if (!recoveryInFlight) {
    const pending: Promise<string | null> = (async () => {
      await clearDeviceCredential();
      return ensureDeviceCredential();
    })().finally(() => {
      if (recoveryInFlight === pending) recoveryInFlight = null;
    });
    recoveryInFlight = pending;
  }
  return recoveryInFlight;
}

/** Resolve with the value, or with null as soon as the caller's signal aborts. */
function untilAborted<T>(
  pending: Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T | null> {
  if (!signal) return pending.catch(() => null);
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    const onAbort = () => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve(null);
      },
    );
  });
}

/**
 * fetch that heals a credential 401: recover once, bounded by the caller's
 * signal, then retry the request once with the new credential. Any other
 * outcome returns the original response.
 */
export async function authenticatedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 401 || !(await isDeviceCredentialAuthError(response))) {
    return response;
  }
  const credential = await untilAborted(recoverDeviceCredential(), init?.signal);
  if (!credential || init?.signal?.aborted) return response;
  const headers = new Headers(init?.headers);
  headers.set('X-Device-Credential', credential);
  return fetch(url, { ...init, headers });
}

export function resetDeviceCredentialForTesting(): void {
  cache = null;
  loadPromise = null;
  ensureInFlight = null;
  recoveryInFlight = null;
  epoch = 0;
}
