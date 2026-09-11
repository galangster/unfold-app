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

function currentDeviceId(): string {
  return getDeviceId();
}

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
let recoveryInFlight: Promise<void> | null = null;

export function getCachedDeviceCredential(
  deviceId: string = currentDeviceId(),
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

async function persistRecord(record: DeviceCredentialRecord): Promise<void> {
  cache = record;
  await SecureStore.setItemAsync(
    DEVICE_CREDENTIAL_STORE_KEY,
    JSON.stringify(record),
    KEYCHAIN_WRITE_OPTIONS,
  );
}

export function loadDeviceCredential(): Promise<void> {
  loadPromise ??= (async () => {
    try {
      const raw = await SecureStore.getItemAsync(DEVICE_CREDENTIAL_STORE_KEY);
      if (!raw) return;
      const record = parseStoredRecord(raw);
      if (!record || record.deviceId !== currentDeviceId()) {
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
  const deviceId = currentDeviceId();
  if (isEphemeralDeviceId(deviceId)) return null;

  // Lazy: api-config imports this module, so a static import would be a cycle.
  // getAuthHeaders carries the User-Agent the Cloudflare allowlist expects.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAuthHeaders } = require('@/lib/api-config') as typeof import('@/lib/api-config');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${PRIMARY_BACKEND_URL}/api/devices/register`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ deviceId }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

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

  await persistRecord({ deviceId, credential });
  return credential;
}

export async function ensureDeviceCredential(): Promise<string | null> {
  try {
    await loadDeviceCredential();
    if (isEphemeralDeviceId(currentDeviceId())) return null;
    const cached = getCachedDeviceCredential();
    if (cached) return cached;
    if (!ensureInFlight) {
      ensureInFlight = registerDeviceCredential().finally(() => {
        ensureInFlight = null;
      });
    }
    return await ensureInFlight;
  } catch {
    return getCachedDeviceCredential();
  }
}

export async function clearDeviceCredential(): Promise<void> {
  cache = null;
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

async function recoverDeviceCredentialIfUnauthorized(
  response: Response,
): Promise<void> {
  try {
    if (response.status !== 401) return;
    if (!(await isDeviceCredentialAuthError(response))) return;
    if (!recoveryInFlight) {
      recoveryInFlight = (async () => {
        await clearDeviceCredential();
        await ensureDeviceCredential();
      })().finally(() => {
        recoveryInFlight = null;
      });
    }
    await recoveryInFlight;
  } catch {
    // Callers still receive the original 401.
  }
}

export async function authenticatedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(url, init);
  await recoverDeviceCredentialIfUnauthorized(response);
  return response;
}

export function resetDeviceCredentialForTesting(): void {
  cache = null;
  loadPromise = null;
  ensureInFlight = null;
  recoveryInFlight = null;
}
