/**
 * Condensed, testable rule definitions for the prompt validation chain.
 *
 * Used by:
 * - prompt-validator.ts (sends VALIDATION_RULES to Haiku)
 * - Client-side pre-check (detectViolations)
 */

import { BANNED_PHRASES } from './persona';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedViolation {
  rule: 'banned_phrase' | 'first_person' | 'negation_pattern' | 'em_dash' | 'capitalization' | 'word_count' | 'opening_pattern' | 'closing_pattern';
  original: string;
  location?: string;
}

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

const FIRST_PERSON_REGEX = /\b(I|I'm|I've|I'd|I'll|my|mine|me|we|we're|we've|our|ours|us)\b/g;

const NEGATION_PATTERNS = [
  /(?:That's|This\s+is(?:n't)?|It's)\s+not\s+\w+[\.,]\s*(?:That's|This\s+is|It's)\s+/gi,
  /Not\s+\w+[\.,]\s*(?:But|Rather|Instead)\s+/gi,
  /not\s+a\s+\w+[,;.]\s*(?:it's|that's|this\s+is)\s+a\s+/gi,
];

const EM_DASH_REGEX = /\u2014/g; // ---

const LOWERCASE_GOD_REGEX = /\bgod\b(?!\s*(?:s\b|less|like|awful|forsaken|damn|speed|father|mother|child|send|given|fearing))/g;

// ---------------------------------------------------------------------------
// Client-side detection (runs before Haiku validation for instant feedback)
// ---------------------------------------------------------------------------

export function detectViolations(
  text: string,
  fieldType?: string,
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  // Banned phrases
  for (const phrase of BANNED_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push({ rule: 'banned_phrase', original: phrase });
    }
  }

  // First-person (skip in closingPrayer)
  if (fieldType !== 'closingPrayer') {
    const matches = text.match(FIRST_PERSON_REGEX);
    if (matches) {
      violations.push({ rule: 'first_person', original: matches.slice(0, 3).join(', ') });
    }
  }

  // Negation patterns
  for (const pattern of NEGATION_PATTERNS) {
    pattern.lastIndex = 0;
    const match = text.match(pattern);
    if (match) {
      violations.push({ rule: 'negation_pattern', original: match[0].trim() });
    }
  }

  // Em dashes
  EM_DASH_REGEX.lastIndex = 0;
  if (EM_DASH_REGEX.test(text)) {
    violations.push({ rule: 'em_dash', original: '\u2014' });
  }

  // Capitalization --- "god" lowercase in theological context
  LOWERCASE_GOD_REGEX.lastIndex = 0;
  if (LOWERCASE_GOD_REGEX.test(text)) {
    violations.push({ rule: 'capitalization', original: 'god (lowercase)' });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Condensed rules string sent to Haiku validator (~400 tokens)
// ---------------------------------------------------------------------------

export const VALIDATION_RULES = `<rules>
<rule name="banned_phrase" auto_fix="true">
Rewrite any sentence containing these phrases without the phrase:
${BANNED_PHRASES.slice(0, 30).map(p => `"${p}"`).join(', ')}
(Plus ~30 more in the full list)
Why: These are recognized AI tells that make readers dismiss content as generated.
</rule>

<rule name="first_person" auto_fix="true">
No first-person pronouns (I, my, me, we, our) except in closingPrayer fields.
Rewrite to second person (you/your) or third person.
Why: The author is an AI. First-person anecdotes are dishonest.
</rule>

<rule name="negation_pattern" auto_fix="true">
No "Not X. But Y." or "That's not X, that's Y" rhetorical patterns.
Rewrite as a direct positive statement.
Why: This is the most common AI devotional tell. Readers recognize it instantly.
</rule>

<rule name="em_dash" auto_fix="true">
No em dashes (\u2014). Replace with comma, period, or "and".
Why: TTS engines read em dashes as awkward pauses.
</rule>

<rule name="capitalization" auto_fix="true">
"God" must be capitalized when referring to the Christian God.
"He", "Him", "His" capitalized when referring to God or Jesus.
</rule>

<rule name="word_count" auto_fix="false">
Body text should be within the target word count range for the reading duration.
Flag only -- do not rewrite.
</rule>

<rule name="opening_pattern" auto_fix="false">
Should not start with "Have you ever..." -- flag only.
</rule>

<rule name="closing_pattern" auto_fix="false">
Should not end with a summary paragraph -- flag only.
</rule>
</rules>`;
