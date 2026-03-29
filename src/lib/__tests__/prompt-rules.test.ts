import { detectViolations, VALIDATION_RULES } from '@/constants/prompt-rules';

describe('prompt-rules', () => {
  it('detects banned phrases', () => {
    const violations = detectViolations('This journey has been beautiful and amazing.');
    const rules = violations.map(v => v.rule);
    expect(rules).toContain('banned_phrase');
  });

  it('detects first-person pronouns outside prayer', () => {
    const violations = detectViolations('I remember when my faith was shaken.');
    expect(violations.some(v => v.rule === 'first_person')).toBe(true);
  });

  it('allows first-person in closing prayers', () => {
    const violations = detectViolations('God, help us see Your love.', 'closingPrayer');
    expect(violations.some(v => v.rule === 'first_person')).toBe(false);
  });

  it('detects negation patterns', () => {
    const violations = detectViolations("That's not weakness. That's courage.");
    expect(violations.some(v => v.rule === 'negation_pattern')).toBe(true);
  });

  it('detects em dashes', () => {
    const violations = detectViolations('Faith \u2014 real faith \u2014 changes everything.');
    expect(violations.some(v => v.rule === 'em_dash')).toBe(true);
  });

  it('detects lowercase God', () => {
    const violations = detectViolations('When god speaks, we should listen.');
    expect(violations.some(v => v.rule === 'capitalization')).toBe(true);
  });

  it('returns empty for clean text', () => {
    const violations = detectViolations('You know that feeling when the morning is quiet and you just sit there.');
    expect(violations).toHaveLength(0);
  });

  it('exports a condensed rules string for the validator prompt', () => {
    expect(typeof VALIDATION_RULES).toBe('string');
    expect(VALIDATION_RULES.length).toBeGreaterThan(100);
    expect(VALIDATION_RULES.length).toBeLessThan(3000); // ~400 tokens target
  });
});
