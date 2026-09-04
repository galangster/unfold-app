import { isDailyAiBudgetMessage } from './ai-budget-error';

export function isTransientGenerationError(message: string): boolean {
  const normalized = message.toLowerCase();

  // Rate limit (429) is NOT transient — retrying just burns more quota.
  if (normalized.includes('rate limit') || normalized.includes('429')) {
    return false;
  }

  return [
    'network',
    'timeout',
    'timed out',
    'temporarily unavailable',
    'unable to connect',
    'fetch',
    'econn',
    'aborted',
    '503',
    '502',
  ].some((token) => normalized.includes(token));
}

export function toFriendlyOnboardingGenerationError(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes('unable to connect') ||
    normalized.includes('network') ||
    normalized.includes('internet') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out')
  ) {
    return 'We couldn’t reach the writing service. Check your connection and try again.';
  }

  if (normalized.includes('content filter')) {
    return 'We hit a temporary writing limit. Try again with the same answers.';
  }

  if (normalized.includes('output_truncated') || normalized.includes('truncated')) {
    return 'The devotional was too long to generate in one go. Tap retry — we’ll break it into smaller pieces.';
  }

  // The server's arc call returned JSON it could not parse (prod 2026-09-04:
  // "Arc generation: JSON parse failed -- Expected ',' or ']' after array
  // element" on a 30-day plan). Name the shape problem instead of the generic
  // fallback so the reader has a real next step.
  if (normalized.includes('json parse') || normalized.includes('no valid json')) {
    return 'We couldn’t finish shaping your series. Try again, or start over with a shorter plan.';
  }

  return 'We couldn’t finish creating this devotional right now. Please try again.';
}

export function toFriendlyRemainingDaysGenerationError(message: string): string {
  // The daily AI budget copy already says what happened and when it frees up.
  if (isDailyAiBudgetMessage(message)) {
    return message;
  }

  if (isTransientGenerationError(message)) {
    return 'Connection was interrupted while writing. Please try again in a moment.';
  }

  if (message.toLowerCase().includes('content filter')) {
    return 'We hit a temporary writing limitation. Please try generating again.';
  }

  return 'Could not finish writing the remaining days right now. Please try again.';
}
