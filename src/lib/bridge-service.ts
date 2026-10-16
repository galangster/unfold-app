/**
 * Bridge Service
 *
 * Generates personalized daily "bridges" — short transitional passages
 * that connect yesterday's check-in with today's devotional theme.
 * Results are cached in MMKV so generation happens at most once per day
 * per devotional day.
 *
 * Calls the Railway backend through the standard AI gateway. The current
 * mobile request asks for Claude Haiku; keep Companion prose on the approved
 * Claude-family path unless Nick explicitly approves a fallback.
 */

import { MMKV } from 'react-native-mmkv';
import { logger } from '@/lib/logger';
import { buildPromptWithPersona } from '@/constants/persona';
import { getBackendCandidates, getAuthHeaders, sanitizeForPrompt } from '@/lib/api-config';
import { authenticatedFetch } from './device-credential';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';
import { getSharedEncryptionKey } from '@/lib/mmkv-storage';
import { HAIKU_REQUEST_MODEL } from './ai-model';
import { firstSentence, isDisplayableBridge, sanitizeBridgeText } from '@/lib/bridge-text';
import { copyVariationFor } from '@/lib/copy-variation';
import { localDayKey } from '@/lib/home-devotional-state';
import { avoidBlock, newestCacheKeys, uniqueLines } from '@/lib/prompt-history';
import { bridgeShapeFor, type BridgeShape } from '@/lib/prompt-variety';

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

const BRIDGE_KEY_PREFIX = 'bridge_';
/** How many earlier bridges a request sends back as lines not to reuse. */
const RECENT_BRIDGE_LIMIT = 7;

/**
 * `day` is the reader's local day (`localDayKey`). Keys carried the UTC date
 * before 2026-10-16, so a reader in the Americas could get a second bridge
 * on one local day once UTC rolled over in their evening.
 */
function buildCacheKey(
  devotionalId: string,
  dayNumber: number,
  day: string
): string {
  return `${BRIDGE_KEY_PREFIX}${devotionalId}_${dayNumber}_${day}`;
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

function setCachedBridge(cacheKey: string, text: string): void {
  // Don't cache incomplete bridges (truncated responses, partial text)
  if (!isDisplayableBridge(text)) {
    logger.warn(`${LOG_PREFIX} skipping cache, bridge looks incomplete (len=${text.trim().length})`);
    return;
  }
  bridgeCache.set(cacheKey, text);
  logger.log(`${LOG_PREFIX} cache SET, key=${cacheKey}, len=${text.length}`);
}

/**
 * The first sentence of each of the reader's newest cached bridges, newest
 * first. A storage failure costs only the avoid list, never the bridge.
 */
function recentBridgeFirstSentences(): string[] {
  try {
    return newestCacheKeys(bridgeCache.getAllKeys(), BRIDGE_KEY_PREFIX, RECENT_BRIDGE_LIMIT)
      .map((key) => firstSentence(bridgeCache.getString(key) ?? ''))
      .filter(Boolean);
  } catch (error) {
    logger.warn(`${LOG_PREFIX} could not read recent bridges`, error instanceof Error ? error.message : error);
    return [];
  }
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

      const response = await authenticatedFetch(`${backendUrl}/api/generate-bridge`, {
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

// The instructions used to carry worked examples that all opened "Hey Alex,
// today's reading is about...", and the model copied them every morning. The
// examples also used "really", which the rules below ban. Today's opening,
// closing, and name use now come from the bag in the user message instead.
const BRIDGE_INSTRUCTIONS = `TASK: Write a short text message (2-4 sentences, 40-80 words) introducing today's devotional topic to the reader.

You are a companion who helped craft today's devotional for this specific person. You know what's inside and you're genuinely excited to hand it to them. Your job is to create ANTICIPATION about the content, like handing someone a gift you picked out for them.

TODAY'S SHAPE:
- The request names today's opening move, closing move, and whether to use the reader's name. Follow all three.
- The shape changes every morning so the messages never fall into one pattern. Do not drift back to a favorite opening.

CRITICAL RULES:
- Be SPECIFIC about the topic. Name it plainly.
- Get excited about the CONTENT, not about how it applies to the reader. Let the content do its own work.
- Never open with a greeting or with the reader's name.
- Use the reader's name only when the request says to. Then use it once, after the first sentence.
- Never reuse the wording or the first words of a sentence listed under RECENT FIRST SENTENCES.
- Use contractions (you're, it's, don't). A casual word now and then is fine. Do not pad with filler words.
- Short sentences. Fragments ok.
- NEVER use em dashes. Use commas or periods.
- NEVER use profanity (as hell, damn, etc). Clean but not stiff.
- NEVER end with relevance claims about the reader. No "this one fits right where you are", "I think you'll connect with this", "this feels relevant for you", "this is perfect for you right now." The content speaks for itself.
- NEVER use negative framing to emphasize a positive. No "not X, but Y" constructions.
- NEVER use poetic/vague phrasing. No "what X holds", "those quiet moments", metaphors.
- NEVER mention scripture references.
- NEVER use metacommentary about the text itself. No "this hits hard", "let that sink in", "this changes everything." If the content needs a hype line, the content is weak.
- NEVER use empty intensifiers: deeply, profoundly, truly, really, incredibly.
- NEVER use serial parallelism (Rule of Three) as default structure. Vary between 1, 2, 4+ items.
- NEVER use staccato imperative chains. No "Stop. Think. Breathe." Each sentence stands alone.
- NEVER use hedging. No "perhaps," "maybe consider," "it might be worth." Say it or don't.
- NEVER use dramatic reveal structure. No "Here's the thing," "Here's what most people miss." Just say it.
- NEVER use performative intimacy. No "Can I be honest?", "Hear me on this." Just be honest.
- NEVER use emojis or emoticons. Text only. Emojis undermine sincerity.

OUTPUT: Return ONLY the message. No labels, no JSON.`;

function buildBridgeUserMessage(
  input: BridgeInput,
  shape: BridgeShape,
  recentFirstSentences: readonly string[]
): string {
  const parts: string[] = [];

  // The name goes with the request only on a morning the bag picked for it,
  // so on the other mornings there is no name to slip in.
  if (shape.useName) {
    parts.push(`Reader's name: ${sanitizeForPrompt(input.userName, 50)}`);
  }

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

  parts.push(`\nToday's devotional theme: ${sanitizeForPrompt(input.todayTheme, 200)}`);
  parts.push(`Today's scripture: ${sanitizeForPrompt(input.todayScripture, 200)}`);

  parts.push(`\nTODAY'S SHAPE:`);
  parts.push(`- Opening: ${shape.opening.instruction}`);
  parts.push(`- Closing: ${shape.closing.instruction}`);
  parts.push(
    shape.useName
      ? '- Name: Use their name once, after the first sentence.'
      : '- Name: Do not use their name today.'
  );

  const recent = avoidBlock(
    'RECENT FIRST SENTENCES (do not reuse their wording or their first words):',
    uniqueLines(
      recentFirstSentences.map((sentence) => `"${sanitizeForPrompt(sentence, 300)}"`),
      RECENT_BRIDGE_LIMIT
    )
  );
  if (recent) parts.push(`\n${recent}`);

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
 * @returns The bridge text, or null when generation fails or the sanitizer
 *          leaves too little to show (Today then shows no bridge).
 */
export async function generateBridge(
  input: BridgeInput,
  devotionalId: string,
  dayNumber: number
): Promise<string | null> {
  const now = new Date();
  const cacheKey = buildCacheKey(devotionalId, dayNumber, localDayKey(now));

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
  const userMessage = buildBridgeUserMessage(
    input,
    bridgeShapeFor(copyVariationFor(now)),
    recentBridgeFirstSentences()
  );

  try {
    const result = await postBridgeRequest({
      model: HAIKU_REQUEST_MODEL,
      max_tokens: 500,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const cleanText = sanitizeBridgeText(result.bridgeText);
    if (cleanText) setCachedBridge(cacheKey, cleanText);
    // The generation counts whether or not its text survives the sanitizer.
    await incrementRateLimit('bridge');
    if (!cleanText) {
      logger.warn(`${LOG_PREFIX} bridge dropped: too little was left after removing banned phrases`);
      return null;
    }
    return cleanText;
  } catch (error) {
    logger.warn(
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
 * Check if a bridge is already cached for a given devotional day and local
 * day (`localDayKey`). The day defaults to today.
 */
export function hasCachedBridge(
  devotionalId: string,
  dayNumber: number,
  date?: string
): boolean {
  const d = date ?? localDayKey(new Date());
  const cacheKey = buildCacheKey(devotionalId, dayNumber, d);
  return bridgeCache.contains(cacheKey);
}
