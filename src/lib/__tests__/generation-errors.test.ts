import fs from 'fs';
import path from 'path';
import {
  isTransientGenerationError,
  toFriendlyOnboardingGenerationError,
  toFriendlyRemainingDaysGenerationError,
} from '@/lib/generation-errors';
import { dailyAiBudgetMessage } from '@/lib/ai-budget-error';

describe('generation error helpers', () => {
  describe('isTransientGenerationError', () => {
    it.each([
      ['network request failed'],
      ['Request timed out after 30s'],
      ['temporarily unavailable'],
      ['unable to connect to service'],
      ['fetch failed'],
      ['ECONNRESET'],
      ['request aborted'],
      ['503 service unavailable'],
      ['502 bad gateway'],
    ])('treats %s as transient', (message) => {
      expect(isTransientGenerationError(message)).toBe(true);
    });

    it.each([
      ['rate limit exceeded'],
      ['HTTP 429 Too Many Requests'],
      ['content filter violation'],
      ['Generation failed on server'],
    ])('does not treat %s as transient', (message) => {
      expect(isTransientGenerationError(message)).toBe(false);
    });
  });

  describe('toFriendlyOnboardingGenerationError', () => {
    it.each([
      ['unable to connect to service'],
      ['network request failed'],
      ['No internet connection'],
      ['request timeout'],
      ['timed out while writing'],
    ])('keeps onboarding connection copy for %s', (message) => {
      expect(toFriendlyOnboardingGenerationError(message)).toBe(
        'We couldn’t reach the writing service. Check your connection and try again.',
      );
    });

    it('keeps onboarding content filter copy', () => {
      expect(toFriendlyOnboardingGenerationError('blocked by content filter')).toBe(
        'We hit a temporary writing limit. Try again with the same answers.',
      );
    });

    it.each([['output_truncated'], ['response was truncated']])(
      'keeps onboarding truncation copy for %s',
      (message) => {
        expect(toFriendlyOnboardingGenerationError(message)).toBe(
          'The devotional was too long to generate in one go. Tap retry — we’ll break it into smaller pieces.',
        );
      },
    );

    it('names the shaping problem for the server JSON-parse failure (prod job 7e8b59bc, 2026-09-04)', () => {
      const shaping = 'We couldn’t finish shaping your series. Try again, or start over with a shorter plan.';
      expect(
        toFriendlyOnboardingGenerationError(
          "Arc generation: JSON parse failed -- Expected ',' or ']' after array element in JSON at position 5011",
        ),
      ).toBe(shaping);
      expect(toFriendlyOnboardingGenerationError('Arc generation returned no valid JSON')).toBe(shaping);
    });

    it('maps the server truncation error to the truncation copy', () => {
      expect(
        toFriendlyOnboardingGenerationError('Arc generation: output truncated (max_tokens=7000, totalDays=30)'),
      ).toMatch(/too long to generate in one go/);
    });

    it('the generating screen no longer produces a wall-clock timeout error', () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../../app/generating.tsx'), 'utf8');
      expect(src).not.toContain('Generation is taking longer than expected');
      expect(src).not.toContain('MAX_POLL_DURATION_MS');
      // The soft state replaces it and the leave path stays available.
      expect(src).toContain('LONG_RUNNING_MESSAGE');
      expect(src).toContain('evaluateGenerationDeadline');
    });

    it('keeps onboarding generic fallback copy', () => {
      expect(toFriendlyOnboardingGenerationError('Generation failed on server')).toBe(
        'We couldn’t finish creating this devotional right now. Please try again.',
      );
    });
  });

  describe('toFriendlyRemainingDaysGenerationError', () => {
    it('keeps remaining-days transient copy', () => {
      expect(toFriendlyRemainingDaysGenerationError('fetch failed')).toBe(
        'Connection was interrupted while writing. Please try again in a moment.',
      );
    });

    it('keeps remaining-days content filter copy', () => {
      expect(toFriendlyRemainingDaysGenerationError('content filter')).toBe(
        'We hit a temporary writing limitation. Please try generating again.',
      );
    });

    it('keeps remaining-days fallback copy', () => {
      expect(toFriendlyRemainingDaysGenerationError('Generation failed on server')).toBe(
        'Could not finish writing the remaining days right now. Please try again.',
      );
    });

    it('passes the daily AI budget copy through untouched', () => {
      const budget = dailyAiBudgetMessage(5400);
      expect(toFriendlyRemainingDaysGenerationError(budget)).toBe(budget);
      expect(toFriendlyRemainingDaysGenerationError(dailyAiBudgetMessage(null))).toBe(
        dailyAiBudgetMessage(null),
      );
    });
  });

  describe('daily AI budget is never treated as transient', () => {
    it.each([[dailyAiBudgetMessage(600)], [dailyAiBudgetMessage(null)]])(
      'does not retry %s',
      (message) => {
        expect(isTransientGenerationError(message)).toBe(false);
      },
    );
  });
});
