import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

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
  minDaysCompleted: 3,
  minJournalEntries: 1,
  cooldownDays: 90,
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

    // Check engagement thresholds
    const hasEnoughDays = options.totalDaysCompleted >= this.config.minDaysCompleted;
    const hasEnoughJournal = options.journalEntryCount >= this.config.minJournalEntries;

    // Only prompt on actual completion moments (not random)
    if (!options.justCompletedDay) {
      return false;
    }

    // Progressive engagement: Day 3 OR (Day 1 + journal entry)
    const isDay3Milestone = options.totalDaysCompleted === 3;
    const isAlternativeMilestone = 
      options.totalDaysCompleted >= 1 && 
      options.journalEntryCount >= 1 &&
      options.totalDaysCompleted < 3;

    // Don't ask on the same day we already asked
    if (this.state.daysCompletedAtLastPrompt === options.totalDaysCompleted) {
      return false;
    }

    return (isDay3Milestone || isAlternativeMilestone) && (hasEnoughDays || hasEnoughJournal);
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
        console.log('[ReviewPrompt] Native review not available');
        return false;
      }

      // Request review
      await StoreReview.requestReview();
      
      // Update state
      this.recordPrompt();
      
      return true;
    } catch (error) {
      console.error('[ReviewPrompt] Error showing prompt:', error);
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
