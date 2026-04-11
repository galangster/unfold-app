/**
 * TTS Service — Fish Audio via Railway backend proxy.
 * Two-step native download: POST to generate → GET to download natively.
 * Audio data never touches the JS thread — no freeze.
 */

import { File, Paths, Directory } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '@/lib/logger';
import { reportError } from '@/lib/report-error';
import { getAuthHeaders, PRIMARY_BACKEND_URL } from '@/lib/api-config';
// Debug instrumentation available at '@/lib/tts-debug' if needed
import { checkRateLimit, incrementRateLimit } from '@/lib/rate-limit';
import { recordCachedFile, touchCachedFile, saveMetadata } from '@/lib/audio-cache';

const TTS_PROXY_URL = `${PRIMARY_BACKEND_URL}/api/tts`;

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

// ─── Shared TTS text construction ────────────────────────────

/**
 * Convert Bible reference notation to natural speech.
 * "Romans 8:28" → "Romans chapter 8, verse 28"
 * "Psalm 139:1-4" → "Psalm chapter 139, verses 1 through 4"
 */
export function humanizeReference(ref: string): string {
  return ref
    .replace(/(\d+):(\d+)-(\d+)/g, 'chapter $1, verses $2 through $3')
    .replace(/(\d+):(\d+)/g, 'chapter $1, verse $2');
}

/**
 * Build the full TTS text from a devotional day.
 * CRITICAL: This must produce identical output to the inline construction
 * in reading.tsx (lines 376 and 551) to avoid cache key mismatches.
 */
export function buildTtsText(day: {
  scriptureReference: string;
  scriptureText: string;
  bodyText: string;
}): string {
  return `${humanizeReference(day.scriptureReference)}.\n\n${day.scriptureText}\n\n...\n\n${day.bodyText}`;
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

/** Minimum valid MP3 size — an error response (JSON) is typically < 1KB */
const MIN_AUDIO_FILE_SIZE = 1024;

function isCached(key: string): boolean {
  const file = getCacheFile(key);
  return file.exists && file.size > MIN_AUDIO_FILE_SIZE;
}

/** Clear entire TTS cache directory and reset LRU metadata. */
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
    // Reset cache metadata
    saveMetadata({ version: 1, entries: {} });
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
    // Scale timeout with text length — longer devotionals (15min) need more time
    const TTS_TIMEOUT = text.length > 5000 ? 180_000 : 60_000;
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

    const { downloadId, audioHash, audioUrl } = await genResponse.json();
    if (!downloadId && !audioUrl) {
      throw new Error('TTS proxy returned no downloadId or audioUrl');
    }

    logger.log(`[TTS] generation complete — audioHash=${audioHash}, audioUrl=${audioUrl ? 'yes' : 'no'}, ${Date.now() - fetchStart}ms`);

    // Step 2: Native download — prefer R2 URL, fall back to legacy CDN/download endpoints
    const DOWNLOAD_TIMEOUT = 30_000;
    const downloadUrl = audioUrl
      ?? (audioHash ? `${PRIMARY_BACKEND_URL}/api/audio/${audioHash}` : `${PRIMARY_BACKEND_URL}/api/tts-download/${downloadId}`);
    const downloadPromise = FileSystem.downloadAsync(
      downloadUrl,
      cachedFile.uri,
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
    if (!fileInfo.exists || fileSize < MIN_AUDIO_FILE_SIZE) {
      // Delete the invalid file so it's not served from cache
      try { cachedFile.delete(); } catch { /* ignore */ }
      throw new Error(`TTS download produced invalid file (${fileSize} bytes)`);
    }
    logger.log(`[TTS] cached — ${fileSize} bytes, ${Date.now() - fetchStart}ms total`);

    // Record in LRU cache index and trigger eviction if limits exceeded
    const filename = `tts_${key}.mp3`;
    recordCachedFile(filename, fileSize);

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
      touchCachedFile(`tts_${key}.mp3`);
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
export async function prefetchDevotionalAudio(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
): Promise<void> {
  const resolvedVoice = resolveVoiceId(voiceId || getDefaultVoice());
  const key = hashKey(text, resolvedVoice);

  // Skip if cached or already downloading
  if (isCached(key)) return;
  if (inFlightRequests.has(key)) return;

  const promise = downloadAudio(text, resolvedVoice, key);
  inFlightRequests.set(key, promise);
  promise.catch(() => { /* Silently fail — user hasn't tapped play yet */ });
}
