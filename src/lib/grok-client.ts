/**
 * Supplementary AI Model Configuration
 *
 * Documents which model the Railway backend uses for supplementary AI calls.
 * The mobile app does NOT call xAI directly — all AI calls are routed
 * through the backend for security.
 *
 * Model: grok-4-1-fast-non-reasoning (xAI)
 * - Input:  $0.20/1M tokens
 * - Output: $0.50/1M tokens
 * - Creative Writing v3 Elo: 1708.6 (#3), EQ-Bench3: 1585 (#2)
 * - Cheaper and better creative writing than alternatives
 *
 * Used for:
 * - Bridge generation (/api/generate-bridge)
 * - Examen prayer generation (/api/generate-examen)
 * - Adaptive onboarding questions (/api/generate/adaptive-question)
 * - Quote extraction (/api/generate/extract-quotes)
 * - Go Deeper journal (/api/generate/go-deeper)
 * - Scripture commentary (/api/generate-commentary)
 *
 * NOT used for:
 * - Core devotional generation → stays on Claude Sonnet 4.6
 *
 * Backend routes grok-* models to xAI's OpenAI-compatible API:
 *   https://api.x.ai/v1/chat/completions
 *   Auth: Bearer XAI_API_KEY
 */

import { PERSONA_BRIEF } from '@/constants/persona';

export const FAST_MODEL = 'grok-4-1-fast-non-reasoning';

/**
 * Cost estimates per call at scale (10K DAU):
 *
 * | Feature              | Per call  | Daily (10K DAU) |
 * |----------------------|-----------|-----------------|
 * | Bridge               | $0.00019  | $1.90/day       |
 * | Examen prayer        | $0.00030  | $3.00/day       |
 * | Adaptive question    | $0.00008  | $0.80/day       |
 * | Quote extraction     | $0.00012  | $0.60-1.50/day  |
 * | Scripture commentary | $0.00012  | $0.60-1.50/day  |
 * | Go Deeper journal    | $0.00012  | $1.20/day       |
 * | TOTAL                |           | ~$8-10/day      |
 */

// ---------------------------------------------------------------------------
// RECOMMENDED BACKEND PROMPTS
//
// The following system prompts should be used on the Railway backend for
// endpoints that currently live server-side. These are documented here so
// the mobile and backend codebases stay in sync on quality expectations.
// ---------------------------------------------------------------------------

/**
 * /api/generate-bridge
 *
 * System prompt for the bridge generation endpoint.
 * Input payload: { userName, yesterdayCheckIn, todayTheme, todayScripture, currentSituation }
 * Expected output: { bridgeText: string }
 */
export const BRIDGE_SYSTEM_PROMPT = `${PERSONA_BRIEF}

WHAT YOU'RE DOING: Writing a personalized daily bridge — a 2-4 sentence (40-70 word) passage that transitions the reader from yesterday into today's devotional theme. Make them feel seen.

WHEN YESTERDAY'S CHECK-IN DATA IS PROVIDED:
- Reference their specific mood and words — not generically, but with felt specificity
- If they were struggling, don't minimize. Acknowledge, then point toward today's theme
- If they were grateful, build on that momentum
- Connect the emotional thread to today's scripture naturally

WHEN NO CHECK-IN DATA EXISTS:
- Write a lighter, warmer intro based on their situation/context
- Still connect to today's theme and scripture
- A gentle "good morning" that orients them

RULES:
- 40-70 words, 2-4 sentences
- Use the reader's name once, early
- Reference today's scripture without quoting it fully — hint at it
- No exclamation marks
- End with gentle anticipation for today's reading

Respond with valid JSON only: {"bridgeText": "..."}`;

/**
 * Examen prayer — sent via /api/generate/go-deeper
 *
 * @deprecated DUPLICATED — the canonical Examen prompt lives in
 * examen-service.ts (which uses PERSONA_FULL and first-person prayer voice).
 * This version is kept for reference only. Remove once confirmed unused.
 *
 * System prompt for the Ignatian Examen prayer generation.
 * Input payload: { userName, todayTheme, todayScripture, middayCheckIn, currentSituation }
 * Expected output: { movements: [{ title: string, prayer: string }, ...] } (exactly 5)
 */
export const EXAMEN_SYSTEM_PROMPT = `${PERSONA_BRIEF}

WHAT YOU'RE DOING: Writing a personalized 5-movement Ignatian Examen prayer for someone's evening.

THE 5 MOVEMENTS:
1. GRATITUDE — Something specific and small, not grand
2. PRESENCE — Where might they have sensed God today? The sacred in ordinary moments
3. HONESTY — Name the struggle without judgment
4. TURNING — Surrender and asking. Grace, not guilt
5. HOPE — Gentle expectation, not forced optimism. Like exhaling.

PERSONALIZATION:
- Weave their mood and check-in words into movements 1-3 naturally
- Connect each movement to today's devotional theme and scripture
- Use their name once (movement 1 or 5)

RULES:
- Each movement: 25-40 words (total: 150-200 words)
- Write as prayer, not instructions about prayer
- Concrete and specific, not abstract theology
- Vary emotional register across movements

Respond with valid JSON only: {"movements": [{"title": "Gratitude", "prayer": "..."}, {"title": "Presence", "prayer": "..."}, {"title": "Honesty", "prayer": "..."}, {"title": "Turning", "prayer": "..."}, {"title": "Hope", "prayer": "..."}]}`;

/**
 * /api/generate/scripture-commentary
 *
 * System prompt for inline scripture commentary (Phase 6 — Scripture Tap).
 * Input payload: { reference, verseText, devotionalTheme, devotionalTitle }
 * Expected output: { commentary: string }
 */
export const SCRIPTURE_COMMENTARY_SYSTEM_PROMPT = `${PERSONA_BRIEF}

WHAT YOU'RE DOING: Writing brief commentary connecting a Bible verse to today's devotional theme. This appears when someone taps a scripture reference while reading.

RULES:
- 2-3 sentences (40-60 words)
- Connect the verse to today's theme — don't explain the verse in isolation
- Add one insight they wouldn't get from just reading it (historical context, original language, literary structure)
- Clear — no seminary jargon
- End with something that sends them back to the devotional with fresh eyes

Respond with valid JSON only: {"commentary": "..."}`;

/**
 * /api/generate/go-deeper
 *
 * System prompt for Go Deeper journal follow-up prompts.
 * The mobile app sends this prompt directly. Documented here for completeness.
 * See journal.tsx handleGoDeeper() for the full implementation.
 */
