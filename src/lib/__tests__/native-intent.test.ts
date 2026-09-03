/* eslint-disable import/first */
/**
 * P3-4 item 2a — expo-router native intent hook.
 */
jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { redirectSystemPath } from '../../app/+native-intent';
import * as allowlist from '../deep-link-allowlist';
import { logger } from '@/lib/logger';

describe('redirectSystemPath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('passes accepted URLs through untouched (widgets, initial and warm)', () => {
    expect(redirectSystemPath({ path: 'unfold://(tabs)/(today)', initial: true })).toBe('unfold://(tabs)/(today)');
    expect(redirectSystemPath({ path: 'unfold://(tabs)/(today)', initial: false })).toBe('unfold://(tabs)/(today)');
    const reveal = 'unfold://reveal?devotionalId=devotional-1725000000000-abc123xyz&dayNumber=3&totalDays=7';
    expect(redirectSystemPath({ path: reveal, initial: true })).toBe(reveal);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rewrites unknown, blocked, and invalid URLs to the root anchor and logs only route + reason', () => {
    expect(redirectSystemPath({ path: 'unfold://unfolded', initial: true })).toBe('/');
    expect(redirectSystemPath({ path: 'unfold://debug-seed-today?state=evening', initial: false })).toBe('/');
    expect(redirectSystemPath({ path: 'unfold://reader?bookId=999&chapter=1', initial: false })).toBe('/');
    // A rejected URL whose params carry text: the text must never reach the log.
    expect(redirectSystemPath({ path: 'unfold://share-card?text=SECRET%20TEXT&evil=1', initial: false })).toBe('/');
    expect(logger.warn).toHaveBeenCalledTimes(4);
    for (const call of (logger.warn as jest.Mock).mock.calls) {
      expect(String(call[0])).toContain('[DeepLink] Rejected external URL');
      expect(String(call[0])).not.toContain('SECRET');
      expect(String(call[0])).not.toContain('state=evening');
    }
    expect(String((logger.warn as jest.Mock).mock.calls[0][0])).toContain('blocked-route route=/unfolded');
    expect(String((logger.warn as jest.Mock).mock.calls[2][0])).toContain('invalid-param route=/reader param=bookId');
  });

  it('falls back to the root anchor when validation itself throws', () => {
    jest.spyOn(allowlist, 'resolveExternalDeepLink').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(redirectSystemPath({ path: 'unfold://paywall', initial: true })).toBe('/');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
