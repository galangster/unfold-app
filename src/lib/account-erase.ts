/**
 * Server-side account erase (P3-4 item 3).
 *
 * `DELETE /api/users/me` is device-authenticated with the same X-Device-ID
 * header the sync routes use and answers `200 { deleted: true }`. It is
 * called by performFullLocalReset BEFORE rotateDeviceId() — the old identity
 * is the only thing the server can match. Best-effort by contract: a
 * failure or timeout never blocks the local wipe, but the outcome is
 * returned so Settings can tell the user when server deletion was not
 * confirmed. Never throws.
 */
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { getDeviceId } from '@/lib/mmkv-storage';
import { isEphemeralDeviceId } from '@/lib/device-id';
import { logger } from '@/lib/logger';

/** Short: the user is waiting on a destructive action with a spinner. */
export const SERVER_ERASE_TIMEOUT_MS = 8_000;

export type ServerEraseFailureReason =
  | 'identity-unavailable'
  | 'timeout'
  | 'network'
  | 'http-error'
  | 'unexpected-response';

export type ServerEraseResult =
  | { ok: true }
  | { ok: false; reason: ServerEraseFailureReason; status?: number };

export async function requestServerAccountErase({
  timeoutMs = SERVER_ERASE_TIMEOUT_MS,
}: { timeoutMs?: number } = {}): Promise<ServerEraseResult> {
  // FAP-LIB-1: a recovery-session ephemeral id was never sent to the server
  // and the real identity is unreadable this session — nothing can be erased.
  if (isEphemeralDeviceId(getDeviceId())) {
    logger.warn('[reset] Server erase skipped — ephemeral recovery identity');
    return { ok: false, reason: 'identity-unavailable' };
  }

  // Hermes has no AbortSignal.timeout(); mirror sync-outbox's controller pattern.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${PRIMARY_BACKEND_URL}/api/users/me`, {
      method: 'DELETE',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(`[reset] Server erase rejected: HTTP ${response.status}`);
      return { ok: false, reason: 'http-error', status: response.status };
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const deleted =
      typeof body === 'object' && body !== null && (body as { deleted?: unknown }).deleted === true;
    if (!deleted) {
      logger.warn('[reset] Server erase returned an unexpected body');
      return { ok: false, reason: 'unexpected-response', status: response.status };
    }

    logger.log('[reset] Server data erased');
    return { ok: true };
  } catch (error) {
    const timedOut = controller.signal.aborted;
    logger.warn(`[reset] Server erase ${timedOut ? 'timed out' : 'failed'}`, error);
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
