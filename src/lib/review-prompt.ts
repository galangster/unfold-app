import * as StoreReview from 'expo-store-review';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';
import {
  getReviewPromptVersionKey,
  shouldRequestReviewForVersion,
} from '@/lib/review-prompt-policy';

/** AsyncStorage key holding the version/build we last fired a native prompt for. */
const REVIEW_PROMPT_VERSION_STORAGE_KEY = '@unfold_review_prompt_version';

/**
 * Fire the native App Store review sheet at most once per shipped binary.
 *
 * Derives the current version/build key from the native app metadata, reads the
 * last-prompted key from AsyncStorage, and only requests a review when this
 * binary has not prompted before. Persists the key after a successful request so
 * the next prompt only re-arms on a new version/build. All failures are
 * swallowed — the review prompt is best-effort and must never block the UI.
 */
export async function requestReviewOncePerVersion(): Promise<void> {
  try {
    const currentKey = getReviewPromptVersionKey(
      Application.nativeApplicationVersion,
      Application.nativeBuildVersion,
    );
    const lastPromptedKey = await AsyncStorage.getItem(
      REVIEW_PROMPT_VERSION_STORAGE_KEY,
    );

    if (!shouldRequestReviewForVersion(lastPromptedKey, currentKey)) return;

    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    await StoreReview.requestReview();
    await AsyncStorage.setItem(REVIEW_PROMPT_VERSION_STORAGE_KEY, currentKey);
  } catch (error) {
    logger.error('[ReviewPrompt] requestReviewOncePerVersion failed:', error);
  }
}

interface ReviewPromptConfig {
  // Minimum days completed before eligible
  minDaysCompleted: number;
  // Minimum journal entries before eligible
  minJournalEntries: number;
  // Days between prompts (if user dismisses)
  cooldownDays: number;
  // Max prompts per year (Apple's limit is 3, we respect it)
  maxPromptsPerYear: number;
}

const DEFAULT_CONFIG: ReviewPromptConfig = {
  minDaysCompleted: 3,   // Day 1 is reserved for the notification ask
  minJournalEntries: 0,  // Don't require journaling
  cooldownDays: 60,
  maxPromptsPerYear: 3,
};

interface ReviewPromptState {
  lastPromptDate: string | null;
  promptCountThisYear: number;
  hasReviewed: boolean;
  daysCompletedAtLastPrompt: number;
}

/**
 * Review Prompt Manager
 * 
 * Handles intelligent timing for App Store review prompts based on:
 * - User engagement (days completed, journal entries)
 * - Satisfaction moments (completion, not interruption)
 * - Apple's limits (3x/year max)
 * - Cooldown periods (don't spam)
 */
export class ReviewPromptManager {
  private config: ReviewPromptConfig;
  private state: ReviewPromptState;

  constructor(
    state: ReviewPromptState,
    config: Partial<ReviewPromptConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = state;
  }

  /**
   * Check if user is eligible for review prompt
   * Call this after meaningful moments (completion, journal entry)
   */
  shouldPrompt(options: {
    totalDaysCompleted: number;
    journalEntryCount: number;
    justCompletedDay: boolean;
    /** Current streak length */
    currentStreak?: number;
    /** True if user just finished the last day of a series */
    justCompletedSeries?: boolean;
  }): boolean {
    // Don't ask if already reviewed
    if (this.state.hasReviewed) return false;

    // Don't ask if we've hit yearly limit
    if (this.state.promptCountThisYear >= this.config.maxPromptsPerYear) {
      return false;
    }

    // Don't ask during cooldown period
    if (this.isInCooldown()) {
      return false;
    }

    // Only prompt on actual completion moments (not random)
    if (!options.justCompletedDay) {
      return false;
    }

    // Don't ask on the same day count we already asked
    if (this.state.daysCompletedAtLastPrompt === options.totalDaysCompleted) {
      return false;
    }

    // ── High-dopamine trigger moments (ordered by impact) ──

    // Day 1 deliberately does NOT trigger a review prompt. That beat is spent
    // asking for notification permission instead: day progression is calendar-
    // gated, so the user physically cannot continue today, and whether they
    // come back tomorrow is the whole product. A rating is worth less than a
    // retained reader, and both asks on one screen is two modals deep.
    // Day 3 (below) is the replacement trigger — by then they have a habit and
    // a better reason to rate.

    // 1. Series completion — just finished an entire journey
    if (options.justCompletedSeries) {
      return true;
    }

    // 2. Streak milestones — 7, 14, 30 day streaks
    const streak = options.currentStreak ?? 0;
    if (streak === 7 || streak === 14 || streak === 30) {
      return true;
    }

    // 3. Day 3 — the earliest ask. By now the user has returned twice, which
    //    is a far stronger signal than a single first session.
    if (options.totalDaysCompleted === 3) {
      return true;
    }

    return false;
  }

  /**
   * Show the native review prompt
   * Returns true if prompt was shown, false if unavailable
   */
  async showPrompt(): Promise<boolean> {
    try {
      // Check if native review is available
      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        logger.log('[ReviewPrompt] Native review not available');
        return false;
      }

      // Request review
      await StoreReview.requestReview();
      
      // Update state
      this.recordPrompt();
      
      return true;
    } catch (error) {
      logger.error('[ReviewPrompt] Error showing prompt:', error);
      return false;
    }
  }

  /**
   * Record that we showed a prompt
   */
  recordPrompt(): void {
    this.state.lastPromptDate = new Date().toISOString();
    this.state.promptCountThisYear++;
    // Note: We don't set hasReviewed here because the user might not actually review
    // Apple doesn't tell us if they reviewed, so we assume prompt = potential review
  }

  /**
   * Mark user as having reviewed (call this if you have other ways of knowing)
   */
  markAsReviewed(): void {
    this.state.hasReviewed = true;
  }

  /**
   * Check if we're in the cooldown period
   */
  private isInCooldown(): boolean {
    if (!this.state.lastPromptDate) return false;

    const lastPrompt = new Date(this.state.lastPromptDate);
    const now = new Date();
    const daysSincePrompt = (now.getTime() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24);

    return daysSincePrompt < this.config.cooldownDays;
  }

  /**
   * Get current state (for debugging/tracking)
   */
  getState(): ReviewPromptState {
    return { ...this.state };
  }

  /**
   * Check eligibility without logging (for analytics/UI hints)
   */
  checkEligibility(options: {
    totalDaysCompleted: number;
    journalEntryCount: number;
  }): {
    eligible: boolean;
    reason?: string;
  } {
    if (this.state.hasReviewed) {
      return { eligible: false, reason: 'already_reviewed' };
    }

    if (this.state.promptCountThisYear >= this.config.maxPromptsPerYear) {
      return { eligible: false, reason: 'max_prompts_reached' };
    }

    if (this.isInCooldown()) {
      return { eligible: false, reason: 'in_cooldown' };
    }

    const hasEnoughDays = options.totalDaysCompleted >= this.config.minDaysCompleted;
    if (!hasEnoughDays) {
      return { eligible: false, reason: 'not_enough_days' };
    }

    return { eligible: true };
  }
}

// Helper to create manager from store state
export function createReviewPromptManager(storeState: {
  reviewPromptLastDate: string | null;
  reviewPromptCount: number;
  hasReviewed: boolean;
  reviewPromptDaysAtLast: number;
}): ReviewPromptManager {
  return new ReviewPromptManager({
    lastPromptDate: storeState.reviewPromptLastDate,
    promptCountThisYear: storeState.reviewPromptCount,
    hasReviewed: storeState.hasReviewed,
    daysCompletedAtLastPrompt: storeState.reviewPromptDaysAtLast,
  });
}

export type { ReviewPromptConfig, ReviewPromptState };
