/**
 * TTS Service — Smallest.ai via Railway backend proxy.
 * Binary download, filesystem cache, in-flight dedup.
 * Drop-in replacement for cartesia.ts — same public API signatures.
 */

import { File, Paths, Directory } from 'expo-file-system';
import { logger } from '@/lib/logger';
import { reportError } from '@/lib/report-error';
import { getAuthHeaders, RAILWAY_BACKEND_URL } from '@/lib/api-config';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';

const TTS_PROXY_URL = `${RAILWAY_BACKEND_URL}/api/tts`;

// ─── Voice catalog ────────────────────────────────────────────
// NOTE: Voice IDs are placeholders — audition and update before shipping.

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  premium: boolean;
}

export const TTS_VOICES: VoiceOption[] = [
  { id: 'emily', name: 'Emily', description: 'Warm, contemplative — perfect for devotionals', premium: false },
  { id: 'george', name: 'George', description: 'Calm, authoritative male voice', premium: true },
  { id: 'jasper', name: 'Jasper', description: 'Warm, pastoral presence', premium: true },
  { id: 'ariana', name: 'Ariana', description: 'Gentle, nurturing voice', premium: true },
  { id: 'james', name: 'James', description: 'Deep, pastoral male voice', premium: true },
];

const DEFAULT_VOICE_ID = 'emily';

export function getDefaultVoice(isPremium: boolean = false): string {
  return DEFAULT_VOICE_ID;
}

export function getAvailableVoices(isPremium: boolean = false): VoiceOption[] {
  if (isPremium) return TTS_VOICES;
  return TTS_VOICES.filter(v => !v.premium);
}

// ─── Cache ────────────────────────────────────────────────────

/** Deterministic cache key from text + voiceId (djb2 + sdbm dual hash). */
function hashKey(text: string, voiceId: string): string {
  const input = `v5:${voiceId}:${text}`;
  let h1 = 5381;
  let h2 = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = (c + (h2 << 6) + (h2 << 16) - h2) | 0;
  }
  return Math.abs(h1).toString(36) + Math.abs(h2).toString(36);
}

function getCacheFile(key: string): File {
  return new File(Paths.cache, `tts_${key}.wav`);
}

function isCached(key: string): boolean {
  const file = getCacheFile(key);
  return file.exists && file.size > 0;
}

/** Clear entire TTS cache directory. */
export async function clearAudioCache(): Promise<void> {
  try {
    const cacheDir = new Directory(Paths.cache);
    if (cacheDir.exists) {
      // Directory.list() returns (Directory | File)[] — filter for File instances
      const entries = cacheDir.list();
      for (const entry of entries) {
        if (entry instanceof File && entry.uri.includes('tts_') && (entry.uri.endsWith('.wav') || entry.uri.endsWith('.mp3'))) {
          try { entry.delete(); } catch { /* skip locked files */ }
        }
      }
    }
  } catch (e) {
    logger.warn('[TTS] Failed to clear cache:', e);
  }
}

// ─── Download ─────────────────────────────────────────────────

const inFlightRequests = new Map<string, Promise<{ audioUrl: string }>>();

async function downloadAudio(text: string, voiceId: string, key: string): Promise<{ audioUrl: string }> {
  const cachedFile = getCacheFile(key);
  logger.log(`[TTS] downloadAudio START — textLen=${text.length}, voiceId=${voiceId}`);

  try {
    const headers = await getAuthHeaders();
    const fetchStart = Date.now();

    const response = await fetch(TTS_PROXY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voiceId }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`TTS proxy error: ${response.status} ${errBody.slice(0, 200)}`);
    }

    // Read binary response and write to cache using modern File API
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    cachedFile.write(bytes);

    logger.log(`[TTS] ✅ cached — ${bytes.length} bytes, ${Date.now() - fetchStart}ms`);
    return { audioUrl: cachedFile.uri };
  } catch (error) {
    logger.log(`[TTS] ❌ downloadAudio ERROR:`, error);
    throw error;
  } finally {
    inFlightRequests.delete(key);
  }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Download and cache TTS audio for a devotional.
 * Returns { audioUrl } pointing to the cached file.
 * Deduplicates in-flight requests (prefetch + play won't double-download).
 */
export async function streamDevotionalAudio(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
): Promise<{ audioUrl: string }> {
  try {
    const key = hashKey(text, voiceId);
    logger.log(`[TTS] streamDevotionalAudio — key=${key}, textLen=${text.length}`);

    // Return cached audio if available
    if (isCached(key)) {
      logger.log('[TTS] cache HIT');
      return { audioUrl: getCacheFile(key).uri };
    }
    logger.log('[TTS] cache MISS — downloading');

    // Rate limit check
    try {
      const rateCheck = await checkRateLimit('tts');
      if (!rateCheck.allowed) {
        throw new Error('TTS rate limit reached. Please try again later.');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('rate limit')) throw e;
      logger.warn('[TTS] Rate limit check failed, proceeding:', e);
    }

    // Deduplicate in-flight requests
    const existing = inFlightRequests.get(key);
    if (existing) {
      logger.log('[TTS] in-flight request found — piggybacking');
      try {
        return await existing;
      } catch {
        inFlightRequests.delete(key);
      }
    }

    const promise = downloadAudio(text, voiceId, key).then(async (result) => {
      await incrementRateLimit('tts');
      return result;
    });
    inFlightRequests.set(key, promise);
    return promise;
  } catch (error) {
    reportError('tts-audio', error, { voiceId });
    throw error;
  }
}

/**
 * Prefetch audio in background. Call when reading screen mounts.
 * By the time user taps play, audio is likely cached.
 */
export function prefetchDevotionalAudio(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
): void {
  const key = hashKey(text, voiceId);

  // Skip if cached or already downloading
  if (isCached(key)) return;
  if (inFlightRequests.has(key)) return;

  const promise = downloadAudio(text, voiceId, key);
  inFlightRequests.set(key, promise);
  promise.catch(() => { /* Silently fail — user hasn't tapped play yet */ });
}
