import {
  extendSyncCheckCooldown,
  syncCheckCooldown,
  SyncPullRateLimitedError,
} from '../sync-pull-backoff';

describe('manual sync check back-off', () => {
  const now = 1_000_000;

  it('pauses ten seconds after an ordinary check', () => {
    expect(syncCheckCooldown(now)).toEqual({ until: now + 10_000, reason: 'checked' });
  });

  it('waits out the server window after a rate-limited check, between 10 and 60 seconds', () => {
    expect(syncCheckCooldown(now, new SyncPullRateLimitedError(36))).toEqual({ until: now + 36_000, reason: 'rate-limited' });
    expect(syncCheckCooldown(now, new SyncPullRateLimitedError(2)).until).toBe(now + 10_000);
    expect(syncCheckCooldown(now, new SyncPullRateLimitedError(600)).until).toBe(now + 60_000);
    expect(syncCheckCooldown(now, new SyncPullRateLimitedError(null)).until).toBe(now + 30_000);
  });

  it('never shortens an active rate-limit wait with a later ordinary pause', () => {
    const limited = syncCheckCooldown(now, new SyncPullRateLimitedError(36));
    expect(extendSyncCheckCooldown(limited, syncCheckCooldown(now + 1_000))).toBe(limited);

    const later = syncCheckCooldown(now + 40_000);
    expect(extendSyncCheckCooldown(limited, later)).toBe(later);
    expect(extendSyncCheckCooldown(null, later)).toBe(later);
  });
});
