/**
 * Firebase Analytics Module
 * Tracks user behavior and app usage for data-driven decisions
 */
import analytics, { FirebaseAnalyticsTypes } from '@react-native-firebase/analytics';
import { logger } from './logger';

// Analytics event names - centralized for consistency
export const AnalyticsEvents = {
  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_QUICK_START_SELECTED: 'onboarding_quick_start_selected',
  ONBOARDING_PERSONALIZED_SELECTED: 'onboarding_personalized_selected',
  
  // Devotional Generation
  DEVOTIONAL_GENERATION_STARTED: 'devotional_generation_started',
  DEVOTIONAL_GENERATION_COMPLETED: 'devotional_generation_completed',
  DEVOTIONAL_GENERATION_ERROR: 'devotional_generation_error',
  
  // Sign In
  SIGN_IN_PROMPT_SHOWN: 'sign_in_prompt_shown',
  SIGN_IN_APPLE_TAPPED: 'sign_in_apple_tapped',
  SIGN_IN_SKIPPED: 'sign_in_skipped',
  SIGN_IN_SUCCESS: 'sign_in_success',
  SIGN_IN_ERROR: 'sign_in_error',
  
  // Devotional Reading
  DEVOTIONAL_OPENED: 'devotional_opened',
  DEVOTIONAL_COMPLETED: 'devotional_completed',
  DAY_ADVANCED: 'day_advanced',
  SCRIPTURE_COPIED: 'scripture_copied',
  
  // Journal
  JOURNAL_OPENED: 'journal_opened',
  JOURNAL_ENTRY_CREATED: 'journal_entry_created',
  JOURNAL_ENTRY_EDITED: 'journal_entry_edited',
  JOURNAL_AI_PROMPT_USED: 'journal_ai_prompt_used',
  
  // Engagement
  HIGHLIGHT_CREATED: 'highlight_created',
  BOOKMARK_ADDED: 'bookmark_added',
  BOOKMARK_REMOVED: 'bookmark_removed',
  
  // Streaks
  STREAK_FREEZE_USED: 'streak_freeze_used',
  STREAK_WEEKEND_AMNESTY_USED: 'streak_weekend_amnesty_used',
  
  // Paywall & Monetization
  PAYWALL_SHOWN: 'paywall_shown',
  PAYWALL_TRIAL_TAPPED: 'paywall_trial_tapped',
  PAYWALL_PURCHASE_TAPPED: 'paywall_purchase_tapped',
  PAYWALL_CLOSED: 'paywall_closed',
  SUBSCRIPTION_PURCHASED: 'subscription_purchased',
  SUBSCRIPTION_RESTORED: 'subscription_restored',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  
  // Settings
  SETTINGS_OPENED: 'settings_opened',
  FONT_SIZE_CHANGED: 'font_size_changed',
  THEME_CHANGED: 'theme_changed',
  ACCENT_COLOR_CHANGED: 'accent_color_changed',
  READING_FONT_CHANGED: 'reading_font_changed',
  NOTIFICATIONS_ENABLED: 'notifications_enabled',
  NOTIFICATIONS_DISABLED: 'notifications_disabled',
  
  // Audio (future)
  AUDIO_PLAY_STARTED: 'audio_play_started',
  AUDIO_PLAY_COMPLETED: 'audio_play_completed',
  AUDIO_PAUSED: 'audio_paused',
  VOICE_CHANGED: 'voice_changed',
} as const;

// User properties for segmentation
export const UserProperties = {
  AUTH_PROVIDER: 'auth_provider', // 'apple', 'anonymous', 'none'
  IS_PREMIUM: 'is_premium', // 'true', 'false'
  READING_DURATION: 'reading_duration', // '5', '15', '30'
  DEVOTIONAL_LENGTH: 'devotional_length', // '3', '7', '14', '30'
  THEME_MODE: 'theme_mode', // 'light', 'dark', 'system'
  FONT_SIZE: 'font_size', // 'small', 'medium', 'large'
  STREAK_COUNT: 'streak_count', // number as string
  TOTAL_DEVOTIONALS_COMPLETED: 'total_devotionals_completed',
  TOTAL_JOURNAL_ENTRIES: 'total_journal_entries',
  ONBOARDING_TYPE: 'onboarding_type', // 'quick', 'personalized'
} as const;

class AnalyticsService {
  private isEnabled = true;

  /**
   * Initialize analytics
   * Call this once on app startup
   */
  async initialize(): Promise<void> {
    try {
      // Analytics is automatically initialized with Firebase
      // Just verify it's working
      const appInstanceId = await analytics().getAppInstanceId();
      logger.log('[Analytics] Initialized', { appInstanceId });
    } catch (error) {
      logger.error('[Analytics] Initialization error', { error });
      this.isEnabled = false;
    }
  }

  /**
   * Log a custom event
   */
  async logEvent(
    name: string,
    params?: FirebaseAnalyticsTypes.CustomEventParams
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().logEvent(name, params);
      logger.log('[Analytics] Event logged', { name, params });
    } catch (error) {
      logger.error('[Analytics] Error logging event', { name, error });
    }
  }

  /**
   * Log screen view
   * Call this when navigating to a new screen
   */
  async logScreenView(screenName: string, screenClass?: string): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
      logger.log('[Analytics] Screen view', { screenName });
    } catch (error) {
      logger.error('[Analytics] Error logging screen view', { screenName, error });
    }
  }

  /**
   * Set user ID (for cross-device tracking)
   * Only set after user signs in
   */
  async setUserId(userId: string | null): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().setUserId(userId);
      logger.log('[Analytics] User ID set', { userId });
    } catch (error) {
      logger.error('[Analytics] Error setting user ID', { error });
    }
  }

  /**
   * Set user properties for segmentation
   */
  async setUserProperty(name: string, value: string | null): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await analytics().setUserProperty(name, value);
      logger.log('[Analytics] User property set', { name, value });
    } catch (error) {
      logger.error('[Analytics] Error setting user property', { name, error });
    }
  }

  /**
   * Set multiple user properties at once
   */
  async setUserProperties(properties: Record<string, string | null>): Promise<void> {
    for (const [key, value] of Object.entries(properties)) {
      await this.setUserProperty(key, value);
    }
  }

  /**
   * Track onboarding progress
   */
  async trackOnboardingStep(step: number, stepName: string, isQuickStart: boolean): Promise<void> {
    await this.logEvent(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
      step,
      step_name: stepName,
      onboarding_type: isQuickStart ? 'quick' : 'personalized',
    });
  }

  /**
   * Track devotional generation with timing
   */
  async trackDevotionalGeneration(durationMs: number, totalDays: number, success: boolean, errorType?: string): Promise<void> {
    const eventName = success 
      ? AnalyticsEvents.DEVOTIONAL_GENERATION_COMPLETED 
      : AnalyticsEvents.DEVOTIONAL_GENERATION_ERROR;
    
    await this.logEvent(eventName, {
      duration_seconds: Math.round(durationMs / 1000),
      total_days: totalDays,
      ...(errorType && { error_type: errorType }),
    });
  }

  /**
   * Track paywall engagement
   */
  async trackPaywall(trigger: string, action: 'shown' | 'trial_tapped' | 'purchase_tapped' | 'closed'): Promise<void> {
    const eventMap = {
      shown: AnalyticsEvents.PAYWALL_SHOWN,
      trial_tapped: AnalyticsEvents.PAYWALL_TRIAL_TAPPED,
      purchase_tapped: AnalyticsEvents.PAYWALL_PURCHASE_TAPPED,
      closed: AnalyticsEvents.PAYWALL_CLOSED,
    };

    await this.logEvent(eventMap[action], { trigger });
  }

  /**
   * Track subscription events
   */
  async trackSubscription(action: 'purchased' | 'restored' | 'cancelled', productId?: string): Promise<void> {
    const eventMap = {
      purchased: AnalyticsEvents.SUBSCRIPTION_PURCHASED,
      restored: AnalyticsEvents.SUBSCRIPTION_RESTORED,
      cancelled: AnalyticsEvents.SUBSCRIPTION_CANCELLED,
    };

    await this.logEvent(eventMap[action], {
      ...(productId && { product_id: productId }),
    });
  }

  /**
   * Enable/disable analytics collection
   */
  async setAnalyticsCollectionEnabled(enabled: boolean): Promise<void> {
    this.isEnabled = enabled;
    try {
      await analytics().setAnalyticsCollectionEnabled(enabled);
      logger.log('[Analytics] Collection enabled', { enabled });
    } catch (error) {
      logger.error('[Analytics] Error setting collection enabled', { error });
    }
  }

  /**
   * Reset analytics data (for user logout)
   */
  async reset(): Promise<void> {
    await this.setUserId(null);
    logger.log('[Analytics] Reset');
  }
}

// Export singleton instance
export const Analytics = new AnalyticsService();

// Export individual functions for convenience
export const logEvent = (name: string, params?: FirebaseAnalyticsTypes.CustomEventParams) => 
  Analytics.logEvent(name, params);

export const logScreenView = (screenName: string, screenClass?: string) => 
  Analytics.logScreenView(screenName, screenClass);

export const setUserId = (userId: string | null) => 
  Analytics.setUserId(userId);

export const setUserProperty = (name: string, value: string | null) => 
  Analytics.setUserProperty(name, value);
