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
import { authenticatedFetch } from './device-credential';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';
import { getSharedEncryptionKey } from '@/lib/mmkv-storage';
import { HAIKU_REQUEST_MODEL } from './ai-model';
import { countWords, trimTrailing } from '@/lib/bridge-text';
import { copyVariationFor } from '@/lib/copy-variation';
import { titleWithPeriod } from '@/lib/display-title';
import { localDayKey } from '@/lib/home-devotional-state';
import { avoidList, isString, openingWords, promptHistory } from '@/lib/prompt-history';
import { examenShapeFor, type ExamenShape } from '@/lib/prompt-variety';

// ---------------------------------------------------------------------------
// MMKV cache instance
// ---------------------------------------------------------------------------
const examenEncKey = getSharedEncryptionKey();
const examenCache = examenEncKey
  ? new MMKV({ id: 'unfold-examen-cache', encryptionKey: examenEncKey })
  : new MMKV({ id: 'unfold-examen-cache' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * No name: the examen is the reader's own prayer, and a name in the request
 * is a name the model can slip into it.
 */
export interface ExamenInput {
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
  /** The line the evening screen prints under the prayer, drawn for its day. Null is a night with no line. */
  closingLine: string | null;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/**
 * `day` is the reader's local day (`localDayKey`). Keys carried the UTC date
 * before 2026-10-16, so a reader in the Americas could get a second examen
 * on one local evening once UTC rolled over.
 */
function buildCacheKey(
  devotionalId: string,
  dayNumber: number,
  day: string
): string {
  return `examen_${devotionalId}_${dayNumber}_${day}`;
}

/**
 * A cached examen, or null when the entry is unreadable or does not hold five
 * movements. An entry written before closingLine existed keeps the "Amen." the
 * screen always printed.
 */
export function parseCachedExamen(raw: string): ExamenPrayer | null {
  try {
    const parsed = JSON.parse(raw) as Omit<ExamenPrayer, 'closingLine'> & { closingLine?: string | null };
    if (!Array.isArray(parsed.movements) || parsed.movements.length !== 5) return null;
    return { ...parsed, closingLine: parsed.closingLine === undefined ? 'Amen.' : parsed.closingLine };
  } catch {
    return null;
  }
}

function getCachedExamen(cacheKey: string): ExamenPrayer | null {
  try {
    const raw = examenCache.getString(cacheKey);
    if (!raw) return null;
    const parsed = parseCachedExamen(raw);
    if (parsed) {
      logger.log(`[Examen] Cache hit for ${cacheKey}`);
      return parsed;
    }
  } catch {
    // An unreadable entry is treated like a bad one.
  }
  examenCache.delete(cacheKey);
  return null;
}

/** What one examen leaves in the history: the first few words and the title of each movement. */
interface ExamenLines {
  openings: string[];
  titles: string[];
}

function isExamenLines(value: unknown): value is ExamenLines {
  const lines = value as Partial<ExamenLines> | null;
  return (
    !!lines &&
    Array.isArray(lines.openings) &&
    lines.openings.every(isString) &&
    Array.isArray(lines.titles) &&
    lines.titles.every(isString)
  );
}

/**
 * The openings and titles of the reader's newest examens, newest first. No
 * earlier examen was ever sent before 2026-10-16, so nothing stopped the
 * model from opening the same way every night.
 */
const recentExamens = promptHistory(examenCache, 'recent_examen_lines', 7, isExamenLines);

function setCachedExamen(cacheKey: string, prayer: ExamenPrayer): void {
  try {
    examenCache.set(cacheKey, JSON.stringify(prayer));
    logger.log(`[Examen] Cached result for ${cacheKey}`);
  } catch (error) {
    logger.warn('[Examen] Failed to write cache', error);
    return;
  }
  recentExamens.record({
    openings: prayer.movements.map((movement) => openingWords(movement.prayer)),
    titles: prayer.movements.map((movement) => movement.title),
  });
}

// ---------------------------------------------------------------------------
// Network request with backend fallback
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Examen prompt — sent to the generic /api/generate/go-deeper endpoint
// ---------------------------------------------------------------------------

// Each movement used to come with a quoted opener ("Lord, I thank you
// for...", "I felt you near when...", "I confess that...", "I release...",
// "Tomorrow, I trust that...") under the same five titles every night, and
// the model prayed those words back verbatim. Each movement now says what it
// does, the model writes a fresh title, and the request names tonight's close
// and the openings of recent examens.
const EXAMEN_SYSTEM_PROMPT = `${PERSONA_FULL}

WHAT YOU'RE DOING: Writing a personalized evening Examen prayer for someone to pray aloud or silently.

Generate a 5-movement evening prayer in FIRST PERSON: the user is speaking directly to God. Use "I" and "we". In the prayer, "you" always means God, never the user. These are words the user prays, not instructions about how to pray. Think Common Prayer by Shane Claiborne: liturgical, intimate, honest.

CRITICAL: Each movement MUST be 2-3 sentences, no more than 40 words. Be concise and intimate. Do NOT write long paragraphs.

The 5 movements, in this order. Each line says what the movement does, not how it begins:
1. GRATITUDE: thank God for one or two specific gifts from today, woven into their devotional theme.
2. PRESENCE: name where God was near today, or was at work without being noticed.
3. HONESTY: name what was hard today, plainly and without shame.
4. TURNING: set down what they are carrying, and ask for grace.
5. HOPE: look toward tomorrow with trust and some light.

OPENINGS:
- Begin each movement in a different way. No two movements start with the same word.
- Ways to begin include a name for God, a plain detail from the day, a short question to God, a statement of fact, or the middle of a thought.
- Never begin a movement with an opening listed under RECENT OPENINGS in the request, or with a close variant of one.

TITLES:
- Give each movement a fresh title of two to four words for what that movement carries tonight.
- Do not use the movement names above as titles. Do not reuse a title listed under RECENT TITLES.
- No numbers and no end punctuation in a title.

CLOSING:
- End the fifth movement with the move the request names under TONIGHT'S CLOSE.
- Do not write "Amen" anywhere. The app adds its own closing line.

RULES:
- FIRST PERSON ONLY
- Address God directly ("Lord," "Father," "God"), like a conversation
- Never use the user's name. This is their own prayer.
- Reference their specific context naturally
- Vary emotional register between movements
- These are prayers to be PRAYED, not reflections to be READ

RESPOND WITH ONLY valid JSON, no markdown, no code blocks:
{"movements": [{"title": "...", "prayer": "..."}, {"title": "...", "prayer": "..."}, {"title": "...", "prayer": "..."}, {"title": "...", "prayer": "..."}, {"title": "...", "prayer": "..."}]}`;

function buildExamenUserMessage(
  input: ExamenInput,
  shape: ExamenShape,
  recent: readonly ExamenLines[]
): string {
  let msg = `Today's theme: "${sanitizeForPrompt(input.todayTheme, 200)}"\nScripture: ${sanitizeForPrompt(input.todayScripture, 200)}`;
  if (input.middayCheckIn) {
    msg += `\nMidday mood: ${sanitizeForPrompt(input.middayCheckIn.moodLabel, 50)} (${input.middayCheckIn.mood}/5)`;
    if (input.middayCheckIn.chipAnswer) msg += `\nThey said: "${sanitizeForPrompt(input.middayCheckIn.chipAnswer, 200)}"`;
    if (input.middayCheckIn.freeText) msg += `\nTheir note: "${sanitizeForPrompt(input.middayCheckIn.freeText, 500)}"`;
  }
  if (input.currentSituation) {
    msg += `\nTheir situation: ${sanitizeForPrompt(input.currentSituation, 500)}`;
  }
  msg += `\n\nTONIGHT'S CLOSE: ${shape.closing.instruction}`;

  const openings = avoidList(
    'RECENT OPENINGS (do not begin a movement with these words):',
    recent.flatMap((lines) => lines.openings),
    80
  );
  const titles = avoidList('RECENT TITLES (do not reuse):', recent.flatMap((lines) => lines.titles), 80);
  if (openings) msg += `\n\n${openings}`;
  if (titles) msg += `\n\n${titles}`;
  return msg;
}

async function postToBackend(
  userMessage: string,
  timeoutMs: number
): Promise<Response> {
  const backendCandidates = getBackendCandidates();
  let lastError: unknown = null;

  const payload = {
    model: HAIKU_REQUEST_MODEL,
    max_tokens: 2000,
    temperature: 0.7,
    system: EXAMEN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
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

      const response = await authenticatedFetch(`${backendUrl}/api/generate/go-deeper`, {
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

/** The movement names, kept as the title when the model's own title is unusable. */
const FALLBACK_TITLES = ['Gratitude', 'Presence', 'Honesty', 'Turning', 'Hope'];

/** The prompt asks for two to four words. One more is tolerated, a sentence is not. */
const MAX_TITLE_WORDS = 5;
const MAX_TITLE_LENGTH = 40;

/** The model's title for a movement, or the movement's name when it is unusable. */
function movementTitle(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const title = trimTrailing(raw.trim().replace(/^\d+\s*[.):-]\s*/, ''), '.,;:!').trim();
  if (!title || countWords(title) > MAX_TITLE_WORDS || title.length > MAX_TITLE_LENGTH || title.includes('—')) {
    return fallback;
  }
  return title;
}

/**
 * The prayer without a closing "Amen" the model wrote anyway: the evening
 * screen prints the night's own closing line, and two "Amen"s read as a
 * stutter.
 */
function withoutTrailingAmen(prayer: string): string {
  const trimmed = prayer.trim();
  // Index loops from the end, so a long run of separators costs one pass.
  const end = trimTrailing(trimmed, '.!').length;
  const start = end - 4;
  const endsInAmen =
    start >= 0 &&
    trimmed.slice(start, end).toLowerCase() === 'amen' &&
    (start === 0 || !/[\p{L}\p{N}_]/u.test(trimmed[start - 1]));
  if (!endsInAmen) return trimmed;
  let cut = start;
  while (cut > 0 && /[\s,;:]/.test(trimmed[cut - 1])) cut--;
  const stripped = trimmed.slice(0, cut);
  return stripped ? titleWithPeriod(stripped) : trimmed;
}

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

function parseExamenResponse(data: unknown): Omit<ExamenPrayer, 'closingLine'> {
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
    const title = movementTitle(mov.title, FALLBACK_TITLES[idx]);
    const prayer =
      typeof mov.prayer === 'string' ? withoutTrailingAmen(mov.prayer) : '';

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
 * Checks MMKV cache first (keyed by devotionalId + dayNumber + the local day
 * of `now`). `now` also picks the night's close and closing line, so a caller
 * that holds one date for a screen gets one prayer for it.
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
  },
  now: Date
): Promise<ExamenPrayer | null> {
  const cacheKey = buildCacheKey(context.devotionalId, context.dayNumber, localDayKey(now));

  // 1. Check cache
  const cached = getCachedExamen(cacheKey);
  if (cached) return cached;

  // 2. Rate limit check before network call
  try {
    const rateCheck = await checkRateLimit('examen');
    if (!rateCheck.allowed) {
      logger.warn('[Examen] Rate limit reached, returning null');
      return null;
    }
  } catch (rateLimitError) {
    // Fail open — don't block examen if rate limit storage fails
    logger.warn('[Examen] Rate limit check failed, proceeding:', rateLimitError);
  }

  // 3. Call backend with retry on parse failure (backend routes to Grok)
  const shape = examenShapeFor(copyVariationFor(now));
  const userMessage = buildExamenUserMessage(input, shape, recentExamens.read());
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.log(
        `[Examen] Generating — theme="${input.todayTheme}", ` +
          `day=${context.dayNumber}, mood=${input.middayCheckIn?.moodLabel ?? 'none'}` +
          (attempt > 1 ? ` (retry ${attempt}/${MAX_ATTEMPTS})` : '')
      );

      const response = await postToBackend(userMessage, 30_000);

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

      const prayer: ExamenPrayer = { ...parseExamenResponse(parsed), closingLine: shape.closingLine };

      logger.log(
        `[Examen] Generated ${prayer.movements.length} movements, ` +
          `${prayer.totalWordCount} words total`
      );

      // 4. Cache the result and increment rate limit
      setCachedExamen(cacheKey, prayer);
      await incrementRateLimit('examen');
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
