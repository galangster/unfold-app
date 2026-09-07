/**
 * Shared reset/session fence for user-data sync.
 *
 * Reset raises this fence synchronously, before its first await. In-flight
 * pull and push requests still carry the old identity until rotation at the
 * end of reset, so identity equality cannot decide whether a response is stale.
 *
 * Aborting registered transports is best-effort. Apply paths must still check
 * the captured session after every await. Correctness does not depend on the
 * native abort reaching fetch.
 */

let sessionEpoch = 0;
const activeResetTokens = new Set<number>();
const transports = new Set<AbortController>();
const resetIdleListeners = new Set<(session: number) => void>();

function notifyLocalResetIdle(): void {
  if (activeResetTokens.size > 0) return;
  const session = sessionEpoch;
  for (const listener of [...resetIdleListeners]) {
    listener(session);
  }
}

export class SyncSessionInvalidatedError extends Error {
  readonly name = 'SyncSessionInvalidatedError';

  constructor(action: string) {
    super(`${action} discarded — sync session is not current`);
  }
}

export function beginLocalResetSession(): number {
  sessionEpoch += 1;
  activeResetTokens.add(sessionEpoch);
  for (const controller of transports) {
    try {
      controller.abort();
    } catch {
      // Abort is best-effort. Session checks remain authoritative.
    }
  }
  transports.clear();
  return sessionEpoch;
}

/** Release only the reset that issued this token. */
export function endLocalResetSession(token: number): void {
  if (!activeResetTokens.delete(token)) return;
  notifyLocalResetIdle();
}

/**
 * Fires when the last active reset token is released. The session argument is
 * the fence generation that just became idle. Ending an unknown or
 * already-released token does not notify. Overlapping tokens stay closed
 * until every issued token ends.
 */
export function subscribeLocalResetIdle(
  listener: (session: number) => void,
): () => void {
  resetIdleListeners.add(listener);
  return () => {
    resetIdleListeners.delete(listener);
  };
}

export function captureSyncSession(): number {
  return sessionEpoch;
}

export function isLocalResetInProgress(): boolean {
  return activeResetTokens.size > 0;
}

export function isSyncSessionCurrent(session: number): boolean {
  return activeResetTokens.size === 0 && session === sessionEpoch;
}

export function assertSyncSessionCurrent(session: number, action: string): void {
  if (!isSyncSessionCurrent(session)) {
    throw new SyncSessionInvalidatedError(action);
  }
}

export function registerSyncTransport(controller: AbortController): () => void {
  transports.add(controller);
  return () => {
    transports.delete(controller);
  };
}

export function resetSyncSessionFenceForTesting(): void {
  sessionEpoch = 0;
  activeResetTokens.clear();
  transports.clear();
  resetIdleListeners.clear();
}
