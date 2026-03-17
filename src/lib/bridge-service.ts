/**
 * Bridge Service
 *
 * Generates personalized daily "bridges" — short transitional passages
 * that connect yesterday's check-in with today's devotional theme.
 * Results are cached in MMKV so generation happens at most once per day
 * per devotional day.
 *
 * Calls the Railway backend which uses Grok for
 * cost-effective generation (~$0.0005/bridge).
 */

import { MMKV } from 'react-native-mmkv';
import { logger } from '@/lib/logger';
import { buildPromptWithPersona } from '@/constants/persona';
import { getBackendCandidates, getAuthHeaders, sanitizeForPrompt } from '@/lib/api-config';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';
import { getSharedEncryptionKey } from '@/lib/mmkv-storage';

// ---------------------------------------------------------------------------
// MMKV cache (dedicated instance — not the Zustand store)
// ---------------------------------------------------------------------------

const encKey = getSharedEncryptionKey();
const bridgeCache = encKey
  ? new MMKV({ id: 'unfold-bridge-cache', encryptionKey: encKey })
  : new MMKV({ id: 'unfold-bridge-cache' });

const LOG_PREFIX = '[Bridge]';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeCheckIn {
  mood: number;
  moodLabel: string;
  chipAnswer?: string;
  freeText?: string;
}

export interface BridgeInput {
  userName: string;
  yesterdayCheckIn?: BridgeCheckIn;
  todayTheme: string;
  todayScripture: string;
  currentSituation: string;
}

interface BridgeResponse {
  bridgeText: string;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function buildCacheKey(
  devotionalId: string,
  dayNumber: number,
  date: string
): string {
  return `bridge_${devotionalId}_${dayNumber}_${date}`;
}

function getCachedBridge(cacheKey: string): string | null {
  const cached = bridgeCache.getString(cacheKey);
  if (cached) {
    logger.log(`${LOG_PREFIX} cache HIT — key=${cacheKey}`);
    return cached;
  }
  logger.log(`${LOG_PREFIX} cache MISS — key=${cacheKey}`);
  return null;
}

/**
 * Sanitize bridge text: remove em dashes, profanity, and other unwanted patterns.
 * This runs as a safety net after model generation.
 */
function sanitizeBridgeText(text: string): string {
  let cleaned = text;
  // Replace em dashes with comma or period
  cleaned = cleaned.replace(/\s*—\s*/g, ', ');
  // Remove profanity / crude intensifiers
  cleaned = cleaned.replace(/\bas hell\b/gi, '');
  cleaned = cleaned.replace(/\bdamn\b/gi, '');
  cleaned = cleaned.replace(/\bfreaking\b/gi, 'really');
  cleaned = cleaned.replace(/\bhell of a\b/gi, 'a real');
  // Clean up double spaces or awkward punctuation from replacements
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/,\s*\./g, '.');
  return cleaned.trim();
}

function setCachedBridge(cacheKey: string, text: string): void {
  // Don't cache incomplete bridges (truncated responses, partial text)
  const trimmed = text.trim();
  if (trimmed.length < 20 || !/[.!?…"']$/.test(trimmed)) {
    logger.warn(`${LOG_PREFIX} skipping cache, bridge looks incomplete: "${trimmed.slice(0, 50)}..."`);
    return;
  }
  bridgeCache.set(cacheKey, text);
  logger.log(`${LOG_PREFIX} cache SET, key=${cacheKey}, len=${text.length}`);
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

const BRIDGE_TIMEOUT_MS = 10_000;

async function postBridgeRequest(
  payload: Record<string, unknown>
): Promise<BridgeResponse> {
  const backendCandidates = getBackendCandidates();
  let lastError: unknown = null;

  for (let i = 0; i < backendCandidates.length; i++) {
    const backendUrl = backendCandidates[i];
    const hasAnotherCandidate = i < backendCandidates.length - 1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);

    try {
      logger.log(
        `${LOG_PREFIX} POST ${backendUrl}/api/generate-bridge (attempt ${i + 1})`
      );

      const response = await fetch(`${backendUrl}/api/generate-bridge`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok && hasAnotherCandidate) {
        logger.warn(
          `${LOG_PREFIX} Backend ${backendUrl} returned ${response.status}; trying fallback`
        );
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '(unreadable)');
        throw new Error(
          `Bridge generation failed: ${response.status} — ${body}`
        );
      }

      const data = await response.json();

      // Backend returns Anthropic-format: { content: [{ type, text }], ... }
      const bridgeText =
        data.bridgeText ??
        data.content?.[0]?.text;

      if (!bridgeText || typeof bridgeText !== 'string') {
        logger.error(`${LOG_PREFIX} unexpected response shape`, JSON.stringify(data).slice(0, 200));
        throw new Error('Invalid bridge response: missing bridgeText');
      }

      logger.log(
        `${LOG_PREFIX} generated — ${bridgeText.split(/\s+/).length} words`
      );

      return { bridgeText };
    } catch (error) {
      lastError = error;

      const aborted = controller.signal.aborted;
      if (hasAnotherCandidate) {
        const reason = aborted ? 'timed out' : 'failed';
        logger.warn(
          `${LOG_PREFIX} Backend ${backendUrl} ${reason}; trying fallback`
        );
        continue;
      }

      if (aborted) {
        throw new Error(
          `Bridge request timed out after ${BRIDGE_TIMEOUT_MS / 1000}s`
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All configured backend endpoints failed for bridge');
}

// ---------------------------------------------------------------------------
// Bridge prompt construction
// ---------------------------------------------------------------------------

const BRIDGE_INSTRUCTIONS = `TASK: Write a short text message (2-3 sentences, 30-50 words) introducing today's devotional topic to the reader.

You are a warm presence, not a person. You know the reader and care about them, but you do NOT consume the content yourself. You introduce what today's reading is about and why it matters for THEM specifically.

EXAMPLES (match this exact tone and specificity):
- "Hey Alex, I know work's been a lot lately. Today's reading is about actually resting, not just crashing on the couch. I think you'll really connect with this one."
- "So you said you were feeling off yesterday. Makes sense with everything going on. Today we're looking at something that might help with that."
- "Alex! Ok today's topic is honestly so relevant for you right now. It's about letting go of the stuff you can't control."

CRITICAL RULES:
- Be SPECIFIC about the topic. Say "it's about learning to actually stop and listen" not "it's about what the silence holds." Name the topic plainly.
- Use their name once, casually.
- Use contractions (you're, it's, don't). Use filler words naturally (like, honestly, ok so).
- Short sentences. Fragments ok.
- NEVER use em dashes. Use commas or periods.
- NEVER use profanity (as hell, damn, etc). Clean but not stiff.
- NEVER speak as if you've read or experienced the content yourself. No "this one hit me", "this one really got me", "I loved this one." You are introducing the topic, not reviewing it. Instead say things like "I think you'll connect with this", "this feels really relevant for you."
- NEVER use poetic/vague phrasing. No "what X holds", "those quiet moments", "what if", rhetorical questions, metaphors.
- NEVER mention scripture references.

OUTPUT: Return ONLY the message. No labels, no JSON.`;

function buildBridgeUserMessage(input: BridgeInput): string {
  const parts: string[] = [];

  parts.push(`Reader's name: ${sanitizeForPrompt(input.userName, 50)}`);

  if (input.yesterdayCheckIn) {
    const ci = input.yesterdayCheckIn;
    parts.push(`\nYesterday's check-in:`);
    parts.push(`- Mood: ${sanitizeForPrompt(ci.moodLabel, 50)} (${ci.mood}/5)`);
    if (ci.chipAnswer) parts.push(`- Quick response: "${sanitizeForPrompt(ci.chipAnswer, 200)}"`);
    if (ci.freeText) parts.push(`- In their own words: "${sanitizeForPrompt(ci.freeText, 500)}"`);
  } else {
    parts.push(`\nNo check-in data from yesterday.`);
  }

  if (input.currentSituation) {
    parts.push(`\nTheir current situation: ${sanitizeForPrompt(input.currentSituation, 500)}`);
  }

  parts.push(`\nToday's devotional theme: ${input.todayTheme}`);
  parts.push(`Today's scripture: ${input.todayScripture}`);

  parts.push(`\nWrite the bridge.`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate (or retrieve from cache) a personalized daily bridge.
 *
 * The bridge is a 2-4 sentence (40-70 word) passage that transitions the
 * reader from yesterday's reflection into today's devotional theme. When no
 * check-in data is available, the backend falls back to a lighter intro
 * derived from the user's broader context/situation.
 *
 * @param input      - User context, check-in data, and today's theme/scripture.
 * @param devotionalId - The devotional series ID (for cache key).
 * @param dayNumber    - The day number within the series (for cache key).
 * @returns The bridge text, or null if generation fails.
 */
export async function generateBridge(
  input: BridgeInput,
  devotionalId: string,
  dayNumber: number
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = buildCacheKey(devotionalId, dayNumber, today);

  // 1. Return cached bridge if available (sanitize in case old cache has bad text)
  const cached = getCachedBridge(cacheKey);
  if (cached) {
    return sanitizeBridgeText(cached);
  }

  // 2. Rate limit check before network call
  try {
    const rateCheck = await checkRateLimit('bridge');
    if (!rateCheck.allowed) {
      logger.warn(`${LOG_PREFIX} Rate limit reached, returning null`);
      return null;
    }
  } catch (rateLimitError) {
    // Fail open — don't block bridge if rate limit storage fails
    logger.warn(`${LOG_PREFIX} Rate limit check failed, proceeding:`, rateLimitError);
  }

  // 3. Build the prompt and send as Anthropic-format payload to the backend
  const systemPrompt = buildPromptWithPersona('full', BRIDGE_INSTRUCTIONS);
  const userMessage = buildBridgeUserMessage(input);

  try {
    const result = await postBridgeRequest({
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 300,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const cleanText = sanitizeBridgeText(result.bridgeText);
    setCachedBridge(cacheKey, cleanText);
    await incrementRateLimit('bridge');
    return cleanText;
  } catch (error) {
    logger.error(
      `${LOG_PREFIX} generation failed`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Clear all cached bridges.
 */
export function clearBridgeCache(): void {
  bridgeCache.clearAll();
  logger.log(`${LOG_PREFIX} cache cleared`);
}

/**
 * Check if a bridge is already cached for a given devotional day and date.
 */
export function hasCachedBridge(
  devotionalId: string,
  dayNumber: number,
  date?: string
): boolean {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = buildCacheKey(devotionalId, dayNumber, d);
  return bridgeCache.contains(cacheKey);
}
