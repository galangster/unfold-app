import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';
import { useUnfoldStore } from '@/lib/store';
import { shouldRequestReview, type ReviewCompletion } from '@/lib/review-prompt-policy';

// Retained only so a full data reset also clears markers from older builds.
export const REVIEW_PROMPT_VERSION_STORAGE_KEY = '@unfold_review_prompt_version';
let requestInFlight = false;

export async function requestReviewAfterCompletion(completion: ReviewCompletion): Promise<boolean> {
  if (requestInFlight || !shouldRequestReview(useUnfoldStore.getState(), completion)) return false;
  requestInFlight = true;
  try {
    if (!await StoreReview.isAvailableAsync()) return false;
    // StoreKit can silently suppress this request. Record an attempt,
    // never a displayed prompt or a submitted rating.
    await StoreReview.requestReview();
    useUnfoldStore.getState().recordReviewPrompt(completion.totalDaysCompleted);
    return true;
  } catch (error) {
    logger.warn('[ReviewPrompt] Review request unavailable:', error);
    return false;
  } finally {
    requestInFlight = false;
  }
}

export async function clearReviewPromptState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REVIEW_PROMPT_VERSION_STORAGE_KEY);
  } catch (error) {
    logger.warn('[ReviewPrompt] clearReviewPromptState failed:', error);
  }
}
