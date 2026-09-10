/**
 * Generation workflows share MD-1's reset fence. Capture the originating
 * session at the start of a high-level operation and pass that token through
 * every follow-up. Never recapture after an await — a stale caller would
 * otherwise adopt the post-reset session and keep going.
 */
import {
  assertSyncSessionCurrent,
  beginLocalResetSession,
  captureSyncSession,
  endLocalResetSession,
  isSyncSessionCurrent,
  registerSyncTransport,
  resetSyncSessionFenceForTesting,
  SyncSessionInvalidatedError,
} from './sync-session-fence';

export {
  assertSyncSessionCurrent,
  beginLocalResetSession,
  captureSyncSession,
  endLocalResetSession,
  isSyncSessionCurrent,
  registerSyncTransport,
  resetSyncSessionFenceForTesting,
  SyncSessionInvalidatedError,
};

/** Use only at the start of a high-level operation, or to forward a caller token. */
export function resolveGenerationSession(session?: number): number {
  return session ?? captureSyncSession();
}

export function isGenerationSessionInvalidatedError(error: unknown): boolean {
  return error instanceof SyncSessionInvalidatedError;
}

export function shouldReuseInflightGenerationPromise(
  existingSession: number,
  incomingSession: number,
): boolean {
  return existingSession === incomingSession && isSyncSessionCurrent(incomingSession);
}

/** Turn a delayed ordinary failure into cancellation when `session` is stale. */
export function rejectStaleGenerationWork(error: unknown, session: number, action: string): void {
  if (error instanceof SyncSessionInvalidatedError) throw error;
  if (!isSyncSessionCurrent(session)) {
    throw new SyncSessionInvalidatedError(action);
  }
}
