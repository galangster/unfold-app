/**
 * Bridge Service
 *
 * Generates personalized daily "bridges" — short transitional passages
 * that connect yesterday's check-in with today's devotional theme.
 * Results are cached in MMKV so generation happens at most once per day
 * per devotional day.
 *
 * Calls the Railway backend which uses Gemini 2.5 Flash for
 * cost-effective generation (~$0.0005/bridge).
 */

import { MMKV } from 'react-native-mmkv';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Backend URL (mirrors devotional-service.ts)
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
// MMKV cache (dedicated instance — not the Zustand store)
// ---------------------------------------------------------------------------

const bridgeCache = new MMKV({ id: 'unfold-bridge-cache' });

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

function setCachedBridge(cacheKey: string, text: string): void {
  bridgeCache.set(cacheKey, text);
  logger.log(`${LOG_PREFIX} cache SET — key=${cacheKey}, len=${text.length}`);
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
        headers: { 'Content-Type': 'application/json' },
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

      const data: BridgeResponse = await response.json();

      if (!data.bridgeText || typeof data.bridgeText !== 'string') {
        throw new Error('Invalid bridge response: missing bridgeText');
      }

      logger.log(
        `${LOG_PREFIX} generated — ${data.bridgeText.split(/\s+/).length} words`
      );

      return data;
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

  // 1. Return cached bridge if available
  const cached = getCachedBridge(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Generate via backend (backend uses Gemini 2.5 Flash)
  try {
    const result = await postBridgeRequest({
      userName: input.userName,
      yesterdayCheckIn: input.yesterdayCheckIn ?? null,
      todayTheme: input.todayTheme,
      todayScripture: input.todayScripture,
      currentSituation: input.currentSituation,
    });

    setCachedBridge(cacheKey, result.bridgeText);
    return result.bridgeText;
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
