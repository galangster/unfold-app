import { drainSyncOutbox, peekSyncOutbox } from '@/lib/sync-outbox';

function hasCheckIn(checkInId: string): boolean {
  return peekSyncOutbox().some((change) => change.table === 'check_ins' && change.id === checkInId);
}

/**
 * Drain the outbox right after a check-in is stored (spec §6.3, D15).
 * The first drain may return an in-flight cycle that snapshotted the outbox
 * before this check-in was enqueued. The enqueue bumped the revision, so one
 * follow-up drain (at most two, no timers) picks it up. Never throws: the
 * store calls this fire-and-forget.
 */
export async function flushCheckInToServer(checkInId: string): Promise<'sent' | 'queued'> {
  try {
    await drainSyncOutbox();
    if (hasCheckIn(checkInId)) {
      await drainSyncOutbox();
    }
  } catch {
    // The outbox keeps the change; the next drain retries it.
  }
  return hasCheckIn(checkInId) ? 'queued' : 'sent';
}
