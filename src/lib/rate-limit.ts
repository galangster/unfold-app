/**
 * Client-side rate limiting for AI API calls
 * Stores limits in AsyncStorage to persist across app sessions
 * Provides basic protection against accidental spam
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';

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

  // Text-to-speech: 30 per hour
  'tts': { maxRequests: 30, windowMs: 60 * 60 * 1000 },
};

const RATE_LIMIT_STORAGE_KEY = '@unfold_rate_limits';

/**
 * Check if a request is allowed under rate limits
 * Returns { allowed: boolean, remaining: number, resetTime: number }
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

  const now = Date.now();
  const storageKey = `${RATE_LIMIT_STORAGE_KEY}_${endpoint}`;
  
  try {
    // Get current state
    const stored = await AsyncStorage.getItem(storageKey);
    let state: RateLimitState;
    
    if (stored) {
      try {
        state = JSON.parse(stored);
      } catch {
        if (__DEV__) logger.warn('[RateLimit] Corrupt stored state, resetting');
        state = { count: 0, windowStart: now };
      }

      // Check if window has expired
      if (now - state.windowStart > config.windowMs) {
        // Reset window
        state = { count: 0, windowStart: now };
      }
    } else {
      // First request
      state = { count: 0, windowStart: now };
    }

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
 */
export async function incrementRateLimit(endpoint: string): Promise<void> {
  const config = RATE_LIMITS[endpoint];
  if (!config) return;

  const storageKey = `${RATE_LIMIT_STORAGE_KEY}_${endpoint}`;
  
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    let state: RateLimitState;
    const now = Date.now();
    
    if (stored) {
      try {
        state = JSON.parse(stored);
      } catch {
        if (__DEV__) logger.warn('[RateLimit] Corrupt stored state, resetting');
        state = { count: 0, windowStart: now };
      }

      // Check if window has expired
      if (now - state.windowStart > config.windowMs) {
        state = { count: 0, windowStart: now };
      }
    } else {
      state = { count: 0, windowStart: now };
    }

    state.count++;
    await AsyncStorage.setItem(storageKey, JSON.stringify(state));

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
    const keys = await AsyncStorage.getAllKeys();
    const rateLimitKeys = keys.filter(key => key.startsWith(RATE_LIMIT_STORAGE_KEY));
    await AsyncStorage.multiRemove(rateLimitKeys);
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
