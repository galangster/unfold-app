// Mock the heavy transitive dependencies so we can test pure functions
jest.mock('@/lib/devotional-service', () => ({
  postJsonWithBackendFallback: jest.fn(),
}));
jest.mock('@/lib/api-config', () => ({
  getAuthHeaders: jest.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
  PRIMARY_BACKEND_URL: 'https://test.example.com',
}));
jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), log: jest.fn() },
}));

import { parseValidationResponse, applyValidation } from '@/lib/prompt-validator';

describe('prompt-validator', () => {
  describe('parseValidationResponse', () => {
    it('parses clean response', () => {
      const result = parseValidationResponse(JSON.stringify({
        hasViolations: false,
        violations: [],
        correctedText: null,
      }));
      expect(result.hasViolations).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('parses response with violations', () => {
      const result = parseValidationResponse(JSON.stringify({
        hasViolations: true,
        violations: [
          { rule: 'banned_phrase', original: 'journey', fixed: 'path', location: 'bodyText' },
        ],
        correctedText: 'The path was long.',
      }));
      expect(result.hasViolations).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.correctedText).toBe('The path was long.');
    });

    it('handles malformed JSON gracefully', () => {
      const result = parseValidationResponse('not json at all');
      expect(result.hasViolations).toBe(false);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('applyValidation', () => {
    it('returns original when no violations', () => {
      const day = { bodyText: 'Good text.', title: 'Title' };
      const validation = { hasViolations: false, violations: [] as any[], correctedText: null };
      const result = applyValidation(day, validation);
      expect(result.bodyText).toBe('Good text.');
    });

    it('applies correctedText to bodyText', () => {
      const day = { bodyText: 'A journey of faith.', title: 'Title' };
      const validation = {
        hasViolations: true,
        violations: [{ rule: 'banned_phrase', original: 'journey', fixed: 'walk', location: 'bodyText' }],
        correctedText: 'A walk of faith.',
      };
      const result = applyValidation(day, validation);
      expect(result.bodyText).toBe('A walk of faith.');
    });
  });
});
