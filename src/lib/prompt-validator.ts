/**
 * Prompt Validation Chain
 *
 * After devotional generation, sends the output to Haiku for rule-checking.
 * Haiku validates against condensed rules, returns violations and correctedText.
 * correctedText is authoritative -- the app uses it as the final output.
 *
 * Call path: mobile -> backend proxy (/api/generate/devotional) -> Anthropic Haiku
 */

import { postJsonWithBackendFallback } from './devotional-service';
import { VALIDATION_RULES } from '@/constants/prompt-rules';
import { logger } from '@/lib/logger';
import { getAuthHeaders, PRIMARY_BACKEND_URL } from '@/lib/api-config';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { DYNAMIC_EXAMPLE_KEY } from '@/lib/generation-api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Shared Haiku model constant -- single source of truth */
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationViolation {
  rule: string;
  original: string;
  fixed: string | null;
  location: string;
}

export interface ValidationResult {
  hasViolations: boolean;
  violations: ValidationViolation[];
  correctedText: string | null;
}

// ---------------------------------------------------------------------------
// Parse Haiku's validation response
// ---------------------------------------------------------------------------

export function parseValidationResponse(raw: string): ValidationResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      hasViolations: !!parsed.hasViolations,
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      correctedText: typeof parsed.correctedText === 'string' ? parsed.correctedText : null,
    };
  } catch {
    logger.warn('[Validator] Failed to parse validation response, passing through');
    return { hasViolations: false, violations: [], correctedText: null };
  }
}

// ---------------------------------------------------------------------------
// Apply validation result to a devotional day
// ---------------------------------------------------------------------------

export function applyValidation<T extends { bodyText: string }>(
  day: T,
  validation: ValidationResult,
): T {
  if (!validation.hasViolations || !validation.correctedText) {
    return day;
  }
  return { ...day, bodyText: validation.correctedText };
}

// ---------------------------------------------------------------------------
// Run validation chain (call Haiku via backend proxy)
// ---------------------------------------------------------------------------

export async function validateDevotional(bodyText: string): Promise<ValidationResult> {
  try {
    const validatorPrompt = `<task>
Review this devotional text against the rules below.
For each violation found, return the original text and a corrected version.
Corrections must preserve the author's voice and meaning -- change only what violates a rule.
If no violations, return the text unchanged.
</task>

${VALIDATION_RULES}

<devotional>
${bodyText}
</devotional>

Return ONLY valid JSON:
{
  "hasViolations": true|false,
  "violations": [
    {
      "rule": "banned_phrase|first_person|negation_pattern|em_dash|capitalization|word_count|opening_pattern|closing_pattern",
      "original": "the exact violating text",
      "fixed": "the corrected text (null for flag-only rules)",
      "location": "bodyText"
    }
  ],
  "correctedText": "full corrected text with all fixes applied, or null if no auto-fixable violations"
}`;

    const { response } = await postJsonWithBackendFallback(
      '/api/generate/devotional',
      {
        model: HAIKU_MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: 'You are a strict text validator. Return only valid JSON. No commentary.',
        messages: [{ role: 'user', content: validatorPrompt }],
      },
      { timeoutMs: 30000 },
    );

    if (!response.ok) {
      logger.warn(`[Validator] HTTP ${response.status}, passing through`);
      return { hasViolations: false, violations: [], correctedText: null };
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
    return parseValidationResponse(text);
  } catch (err) {
    logger.warn('[Validator] Validation failed, passing through:', err);
    return { hasViolations: false, violations: [], correctedText: null };
  }
}

// ---------------------------------------------------------------------------
// Log generation + violations to backend (async, fire-and-forget)
// ---------------------------------------------------------------------------

export async function logGenerationToBackend(params: {
  model: string;
  persona: string | null;
  dayNumber: number;
  seriesLength: number;
  promptHash: string;
  hadViolations: boolean;
  violations: { rule: string; original: string; fixed: string | null; location: string; autoFixed: boolean }[];
}): Promise<{ activeDynamicExample: { rule: string; badText: string; goodText: string } | null }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${PRIMARY_BACKEND_URL}/api/prompt-generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      // Cache the active dynamic example for injection into future generation requests
      if (data.activeDynamicExample) {
        try {
          mmkvStorage.setItem(DYNAMIC_EXAMPLE_KEY, JSON.stringify(data.activeDynamicExample));
          logger.log('[Validator] Cached active dynamic example for rule:', data.activeDynamicExample.rule);
        } catch {
          // Silent -- caching is best-effort
        }
      }
      return data;
    }
  } catch {
    // Silent -- logging is best-effort
  }
  return { activeDynamicExample: null };
}
