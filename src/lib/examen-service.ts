/**
 * Examen Prayer Service
 *
 * Generates a personalized 5-movement Ignatian Examen prayer based on
 * the user's day, devotional theme, midday check-in data, and situation.
 *
 * Calls the Railway backend which uses Grok for
 * cost-effective generation (~$0.0007/prayer).
 *
 * The five movements:
 *   1. Gratitude — What am I thankful for today?
 *   2. Presence  — Where did I sense God today?
 *   3. Honesty   — What challenged me?
 *   4. Turning   — Where do I need grace?
 *   5. Hope      — What am I looking forward to?
 */

import { MMKV } from 'react-native-mmkv';
import { logger } from '@/lib/logger';
import { PERSONA_FULL } from '@/constants/persona';
import { getBackendCandidates, getAuthHeaders, sanitizeForPrompt } from '@/lib/api-config';

// ---------------------------------------------------------------------------
// MMKV cache instance
// ---------------------------------------------------------------------------
const examenCache = new MMKV({ id: 'unfold-examen-cache' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExamenInput {
  userName: string;
  todayTheme: string;
  todayScripture: string;
  middayCheckIn?: {
    mood: number;
    moodLabel: string;
    chipAnswer?: string;
    freeText?: string;
  };
  currentSituation: string;
}

export interface ExamenMovement {
  title: string;
  prayer: string;
}

export interface ExamenPrayer {
  movements: ExamenMovement[];
  totalWordCount: number;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function buildCacheKey(
  devotionalId: string,
  dayNumber: number,
  date: string
): string {
  return `examen_${devotionalId}_${dayNumber}_${date}`;
}

function getCachedExamen(cacheKey: string): ExamenPrayer | null {
  try {
    const raw = examenCache.getString(cacheKey);
    if (!raw) return null;

    const parsed: ExamenPrayer = JSON.parse(raw);
    if (
      !parsed.movements ||
      !Array.isArray(parsed.movements) ||
      parsed.movements.length !== 5
    ) {
      examenCache.delete(cacheKey);
      return null;
    }

    logger.log(`[Examen] Cache hit for ${cacheKey}`);
    return parsed;
  } catch {
    examenCache.delete(cacheKey);
    return null;
  }
}

function setCachedExamen(cacheKey: string, prayer: ExamenPrayer): void {
  try {
    examenCache.set(cacheKey, JSON.stringify(prayer));
    logger.log(`[Examen] Cached result for ${cacheKey}`);
  } catch (error) {
    logger.warn('[Examen] Failed to write cache', error);
  }
}

// ---------------------------------------------------------------------------
// Network request with backend fallback
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Examen prompt — sent to the generic /api/generate/go-deeper endpoint
// ---------------------------------------------------------------------------

const EXAMEN_SYSTEM_PROMPT = `${PERSONA_FULL}

WHAT YOU'RE DOING: Writing a personalized evening Examen prayer for someone to pray aloud or silently.

Generate a 5-movement evening prayer in FIRST PERSON — the user is speaking directly to God. Use "I" and "we" voice, never "you." These are words the user prays, not instructions about how to pray. Think Common Prayer by Shane Claiborne — liturgical, intimate, honest.

CRITICAL: Each movement MUST be 2-3 sentences, no more than 40 words. Be concise and intimate. Do NOT write long paragraphs.

The 5 movements:
1. GRATITUDE — "Lord, I thank you for..." Thank God for specific gifts from today, woven into their devotional theme
2. PRESENCE — "I felt you near when..." Name where God showed up today
3. HONESTY — "I confess that..." or "Lord, I struggled with..." Name what was hard, without shame
4. TURNING — "I release..." or "I lay down..." Let go of what they're carrying. Grace, not guilt
5. HOPE — "Tomorrow, I trust that..." or "I look forward to..." Anticipation, light

RULES:
- FIRST PERSON ONLY — "I thank you," "I felt," "I confess," "I release," "I trust"
- Address God directly — "Lord," "Father," "God" — like a conversation
- Reference their specific context naturally
- Vary emotional register between movements
- These are prayers to be PRAYED, not reflections to be READ

RESPOND WITH ONLY valid JSON, no markdown, no code blocks:
{"movements": [{"title": "Gratitude", "prayer": "..."}, {"title": "Presence", "prayer": "..."}, {"title": "Honesty", "prayer": "..."}, {"title": "Turning", "prayer": "..."}, {"title": "Hope", "prayer": "..."}]}`;

function buildExamenUserMessage(input: ExamenInput): string {
  let msg = `Name: ${sanitizeForPrompt(input.userName, 50)}\nToday's theme: "${sanitizeForPrompt(input.todayTheme, 200)}"\nScripture: ${sanitizeForPrompt(input.todayScripture, 200)}`;
  if (input.middayCheckIn) {
    msg += `\nMidday mood: ${sanitizeForPrompt(input.middayCheckIn.moodLabel, 50)} (${input.middayCheckIn.mood}/5)`;
    if (input.middayCheckIn.chipAnswer) msg += `\nThey said: "${sanitizeForPrompt(input.middayCheckIn.chipAnswer, 200)}"`;
    if (input.middayCheckIn.freeText) msg += `\nTheir note: "${sanitizeForPrompt(input.middayCheckIn.freeText, 500)}"`;
  }
  if (input.currentSituation) {
    msg += `\nTheir situation: ${sanitizeForPrompt(input.currentSituation, 500)}`;
  }
  return msg;
}

async function postToBackend(
  input: ExamenInput,
  timeoutMs: number
): Promise<Response> {
  const backendCandidates = getBackendCandidates();
  let lastError: unknown = null;

  const payload = {
    model: 'grok-4-1-fast-non-reasoning',
    max_tokens: 2000,
    temperature: 0.7,
    system: EXAMEN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildExamenUserMessage(input) }],
  };

  for (let i = 0; i < backendCandidates.length; i++) {
    const backendUrl = backendCandidates[i];
    const hasAnotherCandidate = i < backendCandidates.length - 1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.log(
        `[Examen] POST ${backendUrl}/api/generate/go-deeper (attempt ${i + 1}/${backendCandidates.length})`
      );

      const response = await fetch(`${backendUrl}/api/generate/go-deeper`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok && hasAnotherCandidate) {
        logger.warn(
          `[Examen] Backend ${backendUrl} returned ${response.status}; trying fallback`
        );
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      const aborted = controller.signal.aborted;
      if (hasAnotherCandidate) {
        const reason = aborted ? 'timed out' : 'failed';
        logger.warn(
          `[Examen] Backend ${backendUrl} ${reason}; trying fallback`
        );
        continue;
      }

      if (aborted) {
        throw new Error(
          `Examen request timed out after ${Math.round(timeoutMs / 1000)}s`
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All configured backend endpoints failed for examen');
}

// ---------------------------------------------------------------------------
// Response parsing & validation
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

const EXPECTED_TITLES = ['Gratitude', 'Presence', 'Honesty', 'Turning', 'Hope'];

/**
 * Extract the text payload from the backend response.
 *
 * The /api/generate/go-deeper endpoint may return data in several shapes
 * depending on the backend version and the underlying LLM provider:
 *
 *   1. { content: [{ text: "..." }] }               — standard proxy wrapper
 *   2. { content: "..." }                            — string variant
 *   3. { text: "..." }                               — flat text field
 *   4. { candidates: [{ content: { parts: [{ text }] } }] } — raw API SDK
 *   5. { movements: [...] }                          — already-parsed JSON
 *   6. plain string                                  — raw text
 */
function extractTextFromBackendResponse(rawData: unknown): string | Record<string, unknown> {
  if (!rawData || typeof rawData !== 'object') {
    if (typeof rawData === 'string') return rawData;
    throw new Error('Backend returned empty or non-object response');
  }

  const data = rawData as Record<string, unknown>;

  // Shape 5: already has movements at top level — return as-is for direct parsing
  if (Array.isArray(data.movements)) {
    return data as Record<string, unknown>;
  }

  // Shape 1: { content: [{ text: "..." }] }
  if (Array.isArray(data.content) && data.content.length > 0) {
    const firstItem = data.content[0] as Record<string, unknown> | undefined;
    if (firstItem && typeof firstItem.text === 'string') {
      return firstItem.text;
    }
  }

  // Shape 2: { content: "..." }
  if (typeof data.content === 'string') {
    return data.content;
  }

  // Shape 3: { text: "..." }
  if (typeof data.text === 'string') {
    return data.text;
  }

  // Shape 4: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    const candidate = data.candidates[0] as Record<string, unknown> | undefined;
    if (candidate?.content && typeof candidate.content === 'object') {
      const contentObj = candidate.content as Record<string, unknown>;
      if (Array.isArray(contentObj.parts) && contentObj.parts.length > 0) {
        const firstPart = contentObj.parts[0] as Record<string, unknown> | undefined;
        if (firstPart && typeof firstPart.text === 'string') {
          return firstPart.text;
        }
      }
    }
  }

  // Shape 5 alternate: nested under prayer.movements
  if (
    data.prayer &&
    typeof data.prayer === 'object' &&
    Array.isArray((data.prayer as Record<string, unknown>).movements)
  ) {
    return data as Record<string, unknown>;
  }

  throw new Error(
    `Unrecognized backend response shape. Keys: [${Object.keys(data).join(', ')}]`
  );
}

/**
 * Parse a JSON string that may be wrapped in markdown code fences.
 *
 * LLMs frequently return ```json\n{...}\n``` even when instructed not to.
 * This function strips code fences first, then falls back to regex extraction.
 */
function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  // 1. Try direct parse (ideal case — clean JSON)
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue to fallback strategies
  }

  // 2. Strip markdown code fences: ```json ... ``` or ``` ... ```
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    try {
      return JSON.parse(codeFenceMatch[1].trim());
    } catch {
      // code fence content wasn't valid JSON — continue
    }
  }

  // 3. Extract the outermost JSON object using brace counting (safer than greedy regex)
  const startIdx = trimmed.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(startIdx, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            // matched braces but not valid JSON — keep searching
            break;
          }
        }
      }
    }
  }

  throw new Error('Could not extract valid JSON from response text');
}

function parseExamenResponse(data: unknown): ExamenPrayer {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid examen response: not an object');
  }

  const obj = data as Record<string, unknown>;
  let movements: unknown[];

  // Handle multiple response shapes: { movements: [...] }, { prayer: { movements: [...] } },
  // or even a bare array of movements
  if (Array.isArray(data)) {
    // LLM returned a bare array of movements directly
    movements = data;
  } else if (Array.isArray(obj.movements)) {
    movements = obj.movements;
  } else if (
    obj.prayer &&
    typeof obj.prayer === 'object' &&
    Array.isArray((obj.prayer as Record<string, unknown>).movements)
  ) {
    movements = (obj.prayer as Record<string, unknown>).movements as unknown[];
  } else {
    throw new Error(
      `Invalid examen response: missing movements array. Keys: [${Object.keys(obj).join(', ')}]`
    );
  }

  if (movements.length !== 5) {
    throw new Error(
      `Expected 5 movements, got ${movements.length}`
    );
  }

  const parsed: ExamenMovement[] = movements.map((m, idx) => {
    if (!m || typeof m !== 'object') {
      throw new Error(`Movement ${idx} is not an object`);
    }

    const mov = m as Record<string, unknown>;
    const title =
      typeof mov.title === 'string' && mov.title.trim().length > 0
        ? mov.title.trim()
        : EXPECTED_TITLES[idx];
    const prayer =
      typeof mov.prayer === 'string' ? mov.prayer.trim() : '';

    if (prayer.length === 0) {
      throw new Error(`Movement ${idx} ("${title}") has empty prayer text`);
    }

    return { title, prayer };
  });

  const totalWordCount = parsed.reduce(
    (sum, m) => sum + countWords(m.prayer),
    0
  );

  return { movements: parsed, totalWordCount };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a personalized 5-movement Ignatian Examen prayer.
 *
 * Checks MMKV cache first (keyed by devotionalId + dayNumber + date).
 * Falls back to the backend with a 30-second timeout and URL fallback chain.
 * Backend uses Grok for cost-effective generation.
 *
 * @returns The examen prayer, or null if generation failed.
 */
export async function generateExamen(
  input: ExamenInput,
  context: {
    devotionalId: string;
    dayNumber: number;
  }
): Promise<ExamenPrayer | null> {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = buildCacheKey(context.devotionalId, context.dayNumber, today);

  // 1. Check cache
  const cached = getCachedExamen(cacheKey);
  if (cached) return cached;

  // 2. Call backend with retry on parse failure (backend routes to Grok)
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.log(
        `[Examen] Generating for "${input.userName}" — theme="${input.todayTheme}", ` +
          `day=${context.dayNumber}, mood=${input.middayCheckIn?.moodLabel ?? 'none'}` +
          (attempt > 1 ? ` (retry ${attempt}/${MAX_ATTEMPTS})` : '')
      );

      const response = await postToBackend(input, 30_000);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        logger.error(
          `[Examen] Backend returned ${response.status}: ${errorText}`
        );
        if (attempt < MAX_ATTEMPTS) continue;
        return null;
      }

      const rawData = await response.json();

      // Log the raw response shape for debugging (truncated to avoid log spam)
      const rawPreview = JSON.stringify(rawData).slice(0, 500);
      logger.log(`[Examen] Raw backend response: ${rawPreview}`);

      // Extract the text/object payload from the backend's wrapper format
      const extracted = extractTextFromBackendResponse(rawData);

      // If extractTextFromBackendResponse returned an object directly (already
      // has movements), pass it straight to validation. Otherwise parse the
      // text string which may contain raw JSON or markdown-wrapped JSON.
      let parsed: unknown;
      if (typeof extracted === 'object') {
        parsed = extracted;
      } else {
        try {
          parsed = parseJsonFromText(extracted);
        } catch (parseErr) {
          // Log but don't throw immediately — retry if we have attempts left
          logger.warn(
            `[Examen] Failed to parse JSON from extracted text (attempt ${attempt}, len=${extracted.length}): ` +
              extracted.slice(0, 300)
          );
          if (attempt < MAX_ATTEMPTS) continue;
          throw parseErr;
        }
      }

      const prayer = parseExamenResponse(parsed);

      logger.log(
        `[Examen] Generated ${prayer.movements.length} movements, ` +
          `${prayer.totalWordCount} words total`
      );

      // 3. Cache the result
      setCachedExamen(cacheKey, prayer);
      return prayer;
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        logger.warn(
          `[Examen] Attempt ${attempt} failed, retrying:`,
          error instanceof Error ? error.message : String(error)
        );
        continue;
      }
      logger.error(
        '[Examen] Generation failed after retries:',
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
  return null;
}

/**
 * Clear all cached examen prayers.
 */
export function clearExamenCache(): void {
  try {
    examenCache.clearAll();
    logger.log('[Examen] Cache cleared');
  } catch (error) {
    logger.warn('[Examen] Failed to clear cache', error);
  }
}

/**
 * Delete a specific cached examen by its context.
 */
export function deleteCachedExamen(
  devotionalId: string,
  dayNumber: number,
  date: string
): void {
  const cacheKey = buildCacheKey(devotionalId, dayNumber, date);
  try {
    examenCache.delete(cacheKey);
    logger.log(`[Examen] Deleted cached entry: ${cacheKey}`);
  } catch (error) {
    logger.warn('[Examen] Failed to delete cache entry', error);
  }
}
