/**
 * Examen Prayer Service
 *
 * Generates a personalized 5-movement Ignatian Examen prayer based on
 * the user's day, devotional theme, midday check-in data, and situation.
 *
 * Calls the Railway backend which uses Gemini 2.5 Flash for
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

// ---------------------------------------------------------------------------
// Backend URL — mirrors devotional-service.ts pattern
// ---------------------------------------------------------------------------
const RAILWAY_BACKEND_URL = 'https://unfold-backend-production.up.railway.app';

const PRIMARY_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || RAILWAY_BACKEND_URL;

function getBackendCandidates(): string[] {
  const candidates = [PRIMARY_BACKEND_URL];
  if (!candidates.includes(RAILWAY_BACKEND_URL)) {
    candidates.push(RAILWAY_BACKEND_URL);
  }
  return candidates;
}

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

WHAT YOU'RE DOING: Guiding someone through a personalized evening Ignatian Examen prayer.

Generate a 5-movement prayer based on their day. Each movement: 30-50 words, second-person prayer language ("you" voice). Write as if sitting next to someone in the dark before sleep.

The 5 movements:
1. GRATITUDE — Help them notice what they're thankful for today, connecting to their devotional theme
2. PRESENCE — Where might they have sensed God today? Draw from their check-in or situation
3. HONESTY — Name what was hard. Reference their mood or struggles without judgment
4. TURNING — Invite them to release what they're carrying. Grace, not guilt
5. HOPE — Close with anticipation for tomorrow. Light, not heavy

RULES:
- Each movement should feel distinct — vary emotional register
- Reference their specific context (theme, scripture, mood) naturally

RESPOND WITH ONLY A JSON OBJECT in this exact format:
{"movements": [{"title": "Gratitude", "prayer": "..."}, {"title": "Presence", "prayer": "..."}, {"title": "Honesty", "prayer": "..."}, {"title": "Turning", "prayer": "..."}, {"title": "Hope", "prayer": "..."}]}

No markdown, no code blocks, just the JSON.`;

function buildExamenUserMessage(input: ExamenInput): string {
  let msg = `Name: ${input.userName}\nToday's theme: "${input.todayTheme}"\nScripture: ${input.todayScripture}`;
  if (input.middayCheckIn) {
    msg += `\nMidday mood: ${input.middayCheckIn.moodLabel} (${input.middayCheckIn.mood}/5)`;
    if (input.middayCheckIn.chipAnswer) msg += `\nThey said: "${input.middayCheckIn.chipAnswer}"`;
    if (input.middayCheckIn.freeText) msg += `\nTheir note: "${input.middayCheckIn.freeText}"`;
  }
  if (input.currentSituation) {
    msg += `\nTheir situation: ${input.currentSituation}`;
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
    model: 'gemini-2.5-flash-preview-04-17',
    max_tokens: 600,
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
        headers: { 'Content-Type': 'application/json' },
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

function parseExamenResponse(data: unknown): ExamenPrayer {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid examen response: not an object');
  }

  const obj = data as Record<string, unknown>;
  let movements: unknown[];

  if (Array.isArray(obj.movements)) {
    movements = obj.movements;
  } else if (
    obj.prayer &&
    typeof obj.prayer === 'object' &&
    Array.isArray((obj.prayer as Record<string, unknown>).movements)
  ) {
    movements = (obj.prayer as Record<string, unknown>).movements as unknown[];
  } else {
    throw new Error('Invalid examen response: missing movements array');
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
 * Backend uses Gemini 2.5 Flash for cost-effective generation.
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

  // 2. Call backend (backend routes to Gemini 2.5 Flash)
  try {
    logger.log(
      `[Examen] Generating for "${input.userName}" — theme="${input.todayTheme}", ` +
        `day=${context.dayNumber}, mood=${input.middayCheckIn?.moodLabel ?? 'none'}`
    );

    const response = await postToBackend(input, 30_000);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      logger.error(
        `[Examen] Backend returned ${response.status}: ${errorText}`
      );
      return null;
    }

    const rawData = await response.json();

    // The go-deeper endpoint returns { content: [{ text: "..." }] } or similar
    let jsonText: string;
    if (rawData?.movements) {
      // Direct JSON response
      jsonText = JSON.stringify(rawData);
    } else {
      const text = rawData?.content?.[0]?.text ?? rawData?.text ?? (typeof rawData === 'string' ? rawData : null);
      if (!text) throw new Error('Empty response from backend');
      jsonText = text;
    }

    // Parse the JSON, extracting from markdown if needed
    let parsed: unknown;
    try {
      parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    } catch {
      const match = jsonText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Could not parse examen response');
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
    logger.error(
      '[Examen] Generation failed:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
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
