/**
 * Client-side rate limiting for AI API calls
 * Stores limits in MMKV (synchronous) to avoid read-then-write race conditions
 * Provides basic protection against accidental spam
 */

import { mmkvStorage } from '@/lib/mmkv-storage';
import { logger } from '@/lib/logger';

// mmkvStorage.getItem is synchronous (MMKV) but typed as string | null | Promise
// because it implements Zustand's StateStorage interface. This helper narrows the type.
function mmkvGet(key: string): string | null {
  return mmkvStorage.getItem(key) as string | null;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Onboarding adaptive questions: 15 per hour
  'adaptive-question': { maxRequests: 15, windowMs: 60 * 60 * 1000 },
  
  // Devotional generation: 20 per day
  'devotional': { maxRequests: 20, windowMs: 24 * 60 * 60 * 1000 },
  
  // Quote extraction: 50 per day
  'extract-quotes': { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 },

  // Bridge text generation: 10 per hour
  'bridge': { maxRequests: 10, windowMs: 60 * 60 * 1000 },

  // Examen prayer generation: 5 per day
  'examen': { maxRequests: 5, windowMs: 24 * 60 * 60 * 1000 },

  // Companion AI responses: 20 per hour
  'companion': { maxRequests: 20, windowMs: 60 * 60 * 1000 },

  // Scripture commentary generation: 30 per hour
  'commentary': { maxRequests: 30, windowMs: 60 * 60 * 1000 },

  // Go Deeper journal prompts: 15 per hour
  'go-deeper': { maxRequests: 15, windowMs: 60 * 60 * 1000 },

  // Text-to-speech: 10 per hour
  'tts': { maxRequests: 10, windowMs: 60 * 60 * 1000 },
};

/** Per-endpoint keys are `${RATE_LIMIT_STORAGE_KEY}_${endpoint}`; full-reset sweeps them by this prefix. */
export const RATE_LIMIT_STORAGE_KEY = '@unfold_rate_limits';

/**
 * Read the current rate-limit state from MMKV (synchronous).
 * Returns a fresh state if nothing is stored or if the window has expired.
 */
function readState(storageKey: string, windowMs: number): RateLimitState {
  const now = Date.now();
  const stored = mmkvGet(storageKey);

  if (stored) {
    try {
      const state = JSON.parse(stored) as RateLimitState;
      // Reset if window expired
      if (now - state.windowStart > windowMs) {
        return { count: 0, windowStart: now };
      }
      return state;
    } catch {
      if (__DEV__) logger.warn('[RateLimit] Corrupt stored state, resetting');
    }
  }

  return { count: 0, windowStart: now };
}

/**
 * Check if a request is allowed under rate limits
 * Returns { allowed: boolean, remaining: number, resetTime: number }
 *
 * Kept async for API compatibility with existing callers, but internally
 * uses synchronous MMKV reads — no async gap between check and increment.
 */
export async function checkRateLimit(
  endpoint: string
): Promise<{
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}> {
  const config = RATE_LIMITS[endpoint];
  if (!config) {
    // No limit configured for this endpoint
    return { allowed: true, remaining: Infinity, resetTime: 0, limit: Infinity };
  }

  const storageKey = `${RATE_LIMIT_STORAGE_KEY}_${endpoint}`;

  try {
    const state = readState(storageKey, config.windowMs);

    const allowed = state.count < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - state.count);
    const resetTime = state.windowStart + config.windowMs;

    return {
      allowed,
      remaining,
      resetTime,
      limit: config.maxRequests,
    };
  } catch (error) {
    logger.error('[RateLimit] Error checking rate limit:', error);
    // Fail open - allow request if storage fails
    return { allowed: true, remaining: Infinity, resetTime: 0, limit: Infinity };
  }
}

/**
 * Increment the rate limit counter for an endpoint
 * Call this after a successful request
 *
 * Synchronous MMKV read+write eliminates the race condition where two
 * concurrent calls both read the same count before either writes.
 */
export async function incrementRateLimit(endpoint: string): Promise<void> {
  const config = RATE_LIMITS[endpoint];
  if (!config) return;

  const storageKey = `${RATE_LIMIT_STORAGE_KEY}_${endpoint}`;

  try {
    const state = readState(storageKey, config.windowMs);
    state.count++;
    mmkvStorage.setItem(storageKey, JSON.stringify(state));

    logger.log(`[RateLimit] ${endpoint}: ${state.count}/${config.maxRequests}`);
  } catch (error) {
    logger.error('[RateLimit] Error incrementing rate limit:', error);
  }
}

/**
 * Get human-readable time until rate limit resets
 */
export function getTimeUntilReset(resetTime: number): string {
  const now = Date.now();
  const diff = resetTime - now;
  
  if (diff <= 0) return 'now';
  
  const minutes = Math.ceil(diff / (60 * 1000));
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  
  if (hours > 1) return `${hours} hours`;
  if (minutes > 1) return `${minutes} minutes`;
  return 'less than a minute';
}

/**
 * Reset all rate limits (for testing/debugging)
 */
export async function resetAllRateLimits(): Promise<void> {
  if (!__DEV__) {
    logger.warn('[RateLimit] resetAllRateLimits is only available in development');
    return;
  }
  try {
    for (const endpoint of Object.keys(RATE_LIMITS)) {
      const storageKey = `${RATE_LIMIT_STORAGE_KEY}_${endpoint}`;
      mmkvStorage.removeItem(storageKey);
    }
    logger.log('[RateLimit] All rate limits reset');
  } catch (error) {
    logger.error('[RateLimit] Error resetting rate limits:', error);
  }
}

export default {
  checkRateLimit,
  incrementRateLimit,
  getTimeUntilReset,
  resetAllRateLimits,
};
