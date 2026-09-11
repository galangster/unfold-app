import { drainSyncOutbox, peekSyncOutbox } from '@/lib/sync-outbox';

function hasCheckIn(checkInId: string): boolean {
  return peekSyncOutbox().some((change) => change.table === 'check_ins' && change.id === checkInId);
}

export async function flushCheckInToServer(checkInId: string): Promise<'sent' | 'queued'> {
  await drainSyncOutbox();
  if (hasCheckIn(checkInId)) {
    await drainSyncOutbox();
  }
  return hasCheckIn(checkInId) ? 'queued' : 'sent';
}
