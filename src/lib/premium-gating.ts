/**
 * Premium Gating Utilities
 *
 * Centralized helpers for enforcing premium feature limits.
 * Uses MMKV for fast synchronous daily counter tracking.
 *
 * Free-tier limits:
 * - Companion chat: 5 messages per day
 * - Highlight colors: yellow only
 * - Accent themes: gold only
 * - Devotional length: max 7 days
 * - Reading duration: max 15 minutes
 */

import { mmkvStorage } from '@/lib/mmkv-storage';
import { logger } from '@/lib/logger';

// ── Constants ────────────────────────────────────────────────────────────────

export const FREE_COMPANION_DAILY_LIMIT = 5;
export const FREE_HIGHLIGHT_COLOR = 'yellow' as const;
export const FREE_ACCENT_THEME = 'gold' as const;
export const FREE_MAX_DEVOTIONAL_DAYS = 7;
export const FREE_MAX_READING_DURATION = 15;

// ── Companion daily message tracking ─────────────────────────────────────────

const COMPANION_DAILY_KEY = '@unfold_companion_daily';

interface DailyMessageState {
  date: string; // YYYY-MM-DD
  count: number;
}

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function readDailyState(): DailyMessageState {
  const today = getTodayKey();
  const raw = mmkvStorage.getItem(COMPANION_DAILY_KEY) as string | null;

  if (raw) {
    try {
      const state = JSON.parse(raw) as DailyMessageState;
      if (state.date === today) {
        return state;
      }
    } catch {
      // Corrupt data — reset
    }
  }

  // New day or no data
  return { date: today, count: 0 };
}

/**
 * Get the current daily companion message count and remaining messages.
 */
export function getCompanionDailyUsage(): {
  count: number;
  remaining: number;
  limit: number;
} {
  const state = readDailyState();
  return {
    count: state.count,
    remaining: Math.max(0, FREE_COMPANION_DAILY_LIMIT - state.count),
    limit: FREE_COMPANION_DAILY_LIMIT,
  };
}

/**
 * Check if a free user can send another companion message today.
 */
export function canSendCompanionMessage(): boolean {
  const state = readDailyState();
  return state.count < FREE_COMPANION_DAILY_LIMIT;
}

/**
 * Increment the daily companion message counter.
 * Call this after a message is successfully sent.
 */
export function incrementCompanionDailyCount(): void {
  const state = readDailyState();
  state.count++;
  mmkvStorage.setItem(COMPANION_DAILY_KEY, JSON.stringify(state));
  logger.log(`[PremiumGating] Companion daily: ${state.count}/${FREE_COMPANION_DAILY_LIMIT}`);
}

// ── Highlight color gating ───────────────────────────────────────────────────

/**
 * Check if a highlight color is available for free users.
 */
export function isHighlightColorFree(color: string): boolean {
  return color === FREE_HIGHLIGHT_COLOR;
}

// ── Accent theme gating ─────────────────────────────────────────────────────

/**
 * Check if an accent theme is available for free users.
 */
export function isAccentThemeFree(themeId: string): boolean {
  return themeId === FREE_ACCENT_THEME;
}

// ── Devotional length/duration gating ────────────────────────────────────────

/**
 * Check if a devotional length (days) is available for free users.
 */
export function isDevotionalLengthFree(days: number): boolean {
  return days <= FREE_MAX_DEVOTIONAL_DAYS;
}

/**
 * Check if a reading duration (minutes) is available for free users.
 */
export function isReadingDurationFree(minutes: number): boolean {
  return minutes <= FREE_MAX_READING_DURATION;
}
