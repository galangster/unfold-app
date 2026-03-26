/**
 * TTS Service — Fish Audio via Railway backend proxy.
 * Two-step native download: POST to generate → GET to download natively.
 * Audio data never touches the JS thread — no freeze.
 */

import { File, Paths, Directory } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '@/lib/logger';
import { reportError } from '@/lib/report-error';
import { getAuthHeaders, RAILWAY_BACKEND_URL } from '@/lib/api-config';
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';

const TTS_PROXY_URL = `${RAILWAY_BACKEND_URL}/api/tts`;

// ─── Voice catalog ────────────────────────────────────────────

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  premium: boolean;
}

export const TTS_VOICES = [
  { id: 'grace', name: 'Grace', description: 'Gentle, reflective female voice', premium: false },
  { id: 'caleb', name: 'Caleb', description: 'Warm, pastoral male voice', premium: false },
  { id: 'eli', name: 'Eli', description: 'Wise, authoritative mentor voice', premium: false },
] as const;

// Map legacy Smallest.ai voice IDs to new Fish Audio voice IDs
const LEGACY_VOICE_MAP: Record<string, string> = {
  'arman': 'caleb',
  'jasmine': 'grace',
};

/** Resolve a voice ID, mapping legacy IDs to current ones */
function resolveVoiceId(voiceId: string): string {
  const mapped = LEGACY_VOICE_MAP[voiceId] || voiceId;
  const isValid = TTS_VOICES.some(v => v.id === mapped);
  return isValid ? mapped : TTS_VOICES[0].id;
}

const DEFAULT_VOICE_ID = 'grace';

/** Returns the default voice. Also validates any stored voice ID. */
export function getDefaultVoice(isPremium: boolean = false): string {
  return DEFAULT_VOICE_ID;
}

export function getAvailableVoices(isPremium: boolean = false): readonly VoiceOption[] {
  if (isPremium) return TTS_VOICES;
  return TTS_VOICES.filter(v => !v.premium);
}

// ─── Cache ────────────────────────────────────────────────────

/** Deterministic cache key from text + voiceId (djb2 + sdbm dual hash). */
function hashKey(text: string, voiceId: string): string {
  const input = `v8:${voiceId}:${text}`;
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
  return new File(Paths.cache, `tts_${key}.mp3`);
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

// ─── Download (two-step: POST generate → GET native download) ─

const inFlightRequests = new Map<string, Promise<{ audioUrl: string }>>();

async function downloadAudio(text: string, voiceId: string, key: string): Promise<{ audioUrl: string }> {
  const cachedFile = getCacheFile(key);
  const safeVoiceId = resolveVoiceId(voiceId);
  logger.log(`[TTS] downloadAudio START — textLen=${text.length}, voiceId=${safeVoiceId}`);

  try {
    const headers = await getAuthHeaders();
    const fetchStart = Date.now();

    // Step 1: POST to generate audio — returns { downloadId }
    // 30s timeout prevents app from hanging on unresponsive backend
    const TTS_TIMEOUT = 30_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT);

    let genResponse: Response;
    try {
      genResponse = await fetch(TTS_PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, voiceId: safeVoiceId }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!genResponse.ok) {
      const errBody = await genResponse.text().catch(() => '');
      throw new Error(`TTS proxy error: ${genResponse.status} ${errBody.slice(0, 200)}`);
    }

    const { downloadId } = await genResponse.json();
    if (!downloadId) {
      throw new Error('TTS proxy returned no downloadId');
    }

    logger.log(`[TTS] generation complete — downloadId=${downloadId}, ${Date.now() - fetchStart}ms`);

    // Step 2: Native download — audio data never enters JS thread
    // 30s download timeout prevents hanging on slow/stalled connections
    const DOWNLOAD_TIMEOUT = 30_000;
    const downloadUrl = `${TTS_PROXY_URL}/${downloadId}`;
    const downloadPromise = FileSystem.downloadAsync(
      downloadUrl,
      cachedFile.uri,
      { headers }
    );
    const downloadResult = await Promise.race([
      downloadPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TTS download timed out after 30s')), DOWNLOAD_TIMEOUT)
      ),
    ]);

    if (downloadResult.status !== 200) {
      throw new Error(`TTS download failed: HTTP ${downloadResult.status}`);
    }

    const fileInfo = await FileSystem.getInfoAsync(cachedFile.uri);
    const fileSize = fileInfo.exists ? (fileInfo as any).size ?? 0 : 0;
    if (!fileInfo.exists || fileSize === 0) {
      throw new Error('TTS download produced empty file');
    }
    logger.log(`[TTS] cached — ${fileSize} bytes, ${Date.now() - fetchStart}ms total`);
    return { audioUrl: cachedFile.uri };
  } catch (error) {
    logger.log(`[TTS] downloadAudio ERROR:`, error);
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
    const resolvedVoice = resolveVoiceId(voiceId || getDefaultVoice());
    const key = hashKey(text, resolvedVoice);
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

    const promise = downloadAudio(text, resolvedVoice, key).then(async (result) => {
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
  const resolvedVoice = resolveVoiceId(voiceId || getDefaultVoice());
  const key = hashKey(text, resolvedVoice);

  // Skip if cached or already downloading
  if (isCached(key)) return;
  if (inFlightRequests.has(key)) return;

  const promise = downloadAudio(text, resolvedVoice, key);
  inFlightRequests.set(key, promise);
  promise.catch(() => { /* Silently fail — user hasn't tapped play yet */ });
}
